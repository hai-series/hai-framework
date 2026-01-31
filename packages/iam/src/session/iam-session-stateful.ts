/**
 * =============================================================================
 * @hai/iam - 有状态会话管理器
 * =============================================================================
 *
 * 有状态会话实现（使用外部存储如 cache/db）
 *
 * @module iam-session-stateful
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  CreateSessionOptions,
  IamError,
  JwtConfig,
  RefreshResult,
  Session,
  SessionManager,
  TokenPayload,
} from '../iam-types.js'
import { err, ok } from '@hai/core'
import * as jose from 'jose'

import { IamErrorCode, JwtConfigSchema } from '../iam-config.js'
import { getIamMessage } from '../index.js'

/**
 * 会话存储接口
 */
export interface SessionStore {
  /**
   * 存储会话
   */
  set: (sessionId: string, session: Session, ttl: number) => Promise<Result<void, IamError>>

  /**
   * 获取会话
   */
  get: (sessionId: string) => Promise<Result<Session | null, IamError>>

  /**
   * 通过令牌获取会话 ID
   */
  getSessionIdByToken: (token: string) => Promise<Result<string | null, IamError>>

  /**
   * 存储令牌到会话 ID 的映射
   */
  setTokenMapping: (token: string, sessionId: string, ttl: number) => Promise<Result<void, IamError>>

  /**
   * 删除令牌映射
   */
  deleteTokenMapping: (token: string) => Promise<Result<void, IamError>>

  /**
   * 删除会话
   */
  delete: (sessionId: string) => Promise<Result<void, IamError>>

  /**
   * 获取用户的所有会话 ID
   */
  getUserSessionIds: (userId: string) => Promise<Result<string[], IamError>>

  /**
   * 添加用户会话映射
   */
  addUserSession: (userId: string, sessionId: string) => Promise<Result<void, IamError>>

  /**
   * 移除用户会话映射
   */
  removeUserSession: (userId: string, sessionId: string) => Promise<Result<void, IamError>>
}

/**
 * 有状态会话管理器配置
 */
export interface StatefulSessionConfig {
  /** JWT 配置（用于生成令牌） */
  jwt: JwtConfig
  /** 会话最大有效期（秒，默认 86400 = 24小时） */
  maxAge?: number
  /** 是否滑动窗口 */
  sliding?: boolean
  /** 会话存储 */
  sessionStore: SessionStore
}

/**
 * 创建有状态会话管理器
 */
export function createStatefulSessionManager(config: StatefulSessionConfig): SessionManager {
  const jwtConfig = JwtConfigSchema.parse(config.jwt)
  const secretKey = new TextEncoder().encode(jwtConfig.secret)
  const maxAge = config.maxAge ?? 86400
  const sliding = config.sliding ?? true

  /**
   * 生成唯一 ID
   */
  function generateId(): string {
    return crypto.randomUUID()
  }

  /**
   * 签发 JWT 令牌
   */
  async function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>, expiresIn: number): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    const jwt = new jose.SignJWT({
      ...payload,
      iat: now,
      exp: now + expiresIn,
    })
      .setProtectedHeader({ alg: jwtConfig.algorithm })

    if (jwtConfig.issuer) {
      jwt.setIssuer(jwtConfig.issuer)
    }
    if (jwtConfig.audience) {
      jwt.setAudience(jwtConfig.audience)
    }

    return jwt.sign(secretKey)
  }

  /**
   * 验证 JWT 令牌
   */
  async function verifyJwt(token: string): Promise<Result<TokenPayload, IamError>> {
    try {
      const options: jose.JWTVerifyOptions = {}
      if (jwtConfig.issuer) {
        options.issuer = jwtConfig.issuer
      }
      if (jwtConfig.audience) {
        options.audience = jwtConfig.audience
      }

      const { payload } = await jose.jwtVerify(token, secretKey, options)

      return ok({
        sub: payload.sub as string,
        username: payload.username as string | undefined,
        sid: payload.sid as string | undefined,
        iat: payload.iat as number,
        exp: payload.exp as number,
        iss: payload.iss as string | undefined,
        aud: payload.aud as string | undefined,
        type: payload.type as 'access' | 'refresh' | undefined,
      })
    }
    catch (error) {
      if (error instanceof jose.errors.JWTExpired) {
        return err({
          code: IamErrorCode.TOKEN_EXPIRED,
          message: getIamMessage('iam_tokenExpired'),
          cause: error,
        })
      }
      return err({
        code: IamErrorCode.TOKEN_INVALID,
        message: getIamMessage('iam_tokenInvalid'),
        cause: error,
      })
    }
  }

  return {
    type: 'stateful',

    async create(options: CreateSessionOptions): Promise<Result<Session, IamError>> {
      try {
        const sessionId = generateId()
        const now = new Date()
        const accessExpiresIn = jwtConfig.accessTokenExpiresIn
        const refreshExpiresIn = jwtConfig.refreshTokenExpiresIn
        const sessionTtl = options.maxAge ?? maxAge

        const accessToken = await signToken(
          { sub: options.userId, username: options.username, sid: sessionId, type: 'access' },
          accessExpiresIn,
        )

        const refreshToken = await signToken(
          { sub: options.userId, sid: sessionId, type: 'refresh' },
          refreshExpiresIn,
        )

        const session: Session = {
          id: sessionId,
          userId: options.userId,
          accessToken,
          refreshToken,
          userAgent: options.userAgent,
          ipAddress: options.ipAddress,
          createdAt: now,
          lastActiveAt: now,
          expiresAt: new Date(now.getTime() + sessionTtl * 1000),
          data: options.data,
        }

        // 存储会话
        const storeResult = await config.sessionStore.set(sessionId, session, sessionTtl)
        if (!storeResult.success) {
          return storeResult as Result<Session, IamError>
        }

        // 存储令牌映射
        await config.sessionStore.setTokenMapping(accessToken, sessionId, accessExpiresIn)
        await config.sessionStore.setTokenMapping(refreshToken, sessionId, refreshExpiresIn)

        // 添加用户会话映射
        await config.sessionStore.addUserSession(options.userId, sessionId)

        return ok(session)
      }
      catch (error) {
        return err({
          code: IamErrorCode.SESSION_CREATE_FAILED,
          message: getIamMessage('iam_createSessionFailed'),
          cause: error,
        })
      }
    },

    async get(sessionId: string): Promise<Result<Session | null, IamError>> {
      const sessionResult = await config.sessionStore.get(sessionId)
      if (!sessionResult.success) {
        return sessionResult
      }

      const session = sessionResult.data
      if (!session) {
        return ok(null)
      }

      // 检查是否过期
      if (new Date() > session.expiresAt) {
        await this.delete(sessionId)
        return ok(null)
      }

      // 滑动窗口：更新最后活动时间和过期时间
      if (sliding) {
        const now = new Date()
        session.lastActiveAt = now
        session.expiresAt = new Date(now.getTime() + maxAge * 1000)
        await config.sessionStore.set(sessionId, session, maxAge)
      }

      return ok(session)
    },

    async getByToken(accessToken: string): Promise<Result<Session | null, IamError>> {
      // 先验证令牌
      const verifyResult = await verifyJwt(accessToken)
      if (!verifyResult.success) {
        return ok(null)
      }

      // 从存储获取会话 ID
      const sessionIdResult = await config.sessionStore.getSessionIdByToken(accessToken)
      if (!sessionIdResult.success) {
        return sessionIdResult as Result<Session | null, IamError>
      }

      const sessionId = sessionIdResult.data
      if (!sessionId) {
        // 令牌有效但会话不存在（可能被主动注销）
        return ok(null)
      }

      return this.get(sessionId)
    },

    async verifyToken(accessToken: string): Promise<Result<TokenPayload, IamError>> {
      // 先验证 JWT 格式
      const verifyResult = await verifyJwt(accessToken)
      if (!verifyResult.success) {
        return verifyResult
      }

      // 检查会话是否存在
      const sessionIdResult = await config.sessionStore.getSessionIdByToken(accessToken)
      if (!sessionIdResult.success) {
        return sessionIdResult as Result<TokenPayload, IamError>
      }

      if (!sessionIdResult.data) {
        return err({
          code: IamErrorCode.SESSION_INVALID,
          message: getIamMessage('iam_sessionExpired'),
        })
      }

      return verifyResult
    },

    async refresh(refreshToken: string): Promise<Result<RefreshResult, IamError>> {
      const verifyResult = await verifyJwt(refreshToken)
      if (!verifyResult.success) {
        return verifyResult as Result<RefreshResult, IamError>
      }

      const payload = verifyResult.data
      if (payload.type !== 'refresh') {
        return err({
          code: IamErrorCode.TOKEN_INVALID,
          message: getIamMessage('iam_invalidRefreshToken'),
        })
      }

      // 检查会话是否存在
      const sessionIdResult = await config.sessionStore.getSessionIdByToken(refreshToken)
      if (!sessionIdResult.success || !sessionIdResult.data) {
        return err({
          code: IamErrorCode.SESSION_INVALID,
          message: getIamMessage('iam_sessionExpired'),
        })
      }

      const sessionId = sessionIdResult.data
      const sessionResult = await config.sessionStore.get(sessionId)
      if (!sessionResult.success || !sessionResult.data) {
        return err({
          code: IamErrorCode.SESSION_NOT_FOUND,
          message: getIamMessage('iam_sessionNotExist'),
        })
      }

      const session = sessionResult.data
      const now = new Date()
      const accessExpiresIn = jwtConfig.accessTokenExpiresIn
      const refreshExpiresIn = jwtConfig.refreshTokenExpiresIn

      try {
        // 生成新令牌
        const newAccessToken = await signToken(
          { sub: payload.sub, username: payload.username, sid: sessionId, type: 'access' },
          accessExpiresIn,
        )

        const newRefreshToken = await signToken(
          { sub: payload.sub, sid: sessionId, type: 'refresh' },
          refreshExpiresIn,
        )

        // 删除旧令牌映射
        await config.sessionStore.deleteTokenMapping(session.accessToken)
        await config.sessionStore.deleteTokenMapping(session.refreshToken || '')

        // 存储新令牌映射
        await config.sessionStore.setTokenMapping(newAccessToken, sessionId, accessExpiresIn)
        await config.sessionStore.setTokenMapping(newRefreshToken, sessionId, refreshExpiresIn)

        // 更新会话
        session.accessToken = newAccessToken
        session.refreshToken = newRefreshToken
        session.lastActiveAt = now
        if (sliding) {
          session.expiresAt = new Date(now.getTime() + maxAge * 1000)
        }
        await config.sessionStore.set(sessionId, session, maxAge)

        return ok({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          accessTokenExpiresAt: new Date(now.getTime() + accessExpiresIn * 1000),
          refreshTokenExpiresAt: new Date(now.getTime() + refreshExpiresIn * 1000),
        })
      }
      catch (error) {
        return err({
          code: IamErrorCode.TOKEN_REFRESH_FAILED,
          message: getIamMessage('iam_refreshTokenFailed'),
          cause: error,
        })
      }
    },

    async update(sessionId: string, data: Partial<Session>): Promise<Result<void, IamError>> {
      const sessionResult = await config.sessionStore.get(sessionId)
      if (!sessionResult.success) {
        return sessionResult as Result<void, IamError>
      }

      const session = sessionResult.data
      if (!session) {
        return err({
          code: IamErrorCode.SESSION_NOT_FOUND,
          message: getIamMessage('iam_sessionNotExist'),
        })
      }

      // 更新允许的字段
      if (data.data !== undefined) {
        session.data = { ...session.data, ...data.data }
      }
      if (data.userAgent !== undefined) {
        session.userAgent = data.userAgent
      }
      if (data.ipAddress !== undefined) {
        session.ipAddress = data.ipAddress
      }
      session.lastActiveAt = new Date()

      const ttl = Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000))
      return config.sessionStore.set(sessionId, session, ttl)
    },

    async delete(sessionId: string): Promise<Result<void, IamError>> {
      // 获取会话信息
      const sessionResult = await config.sessionStore.get(sessionId)
      if (sessionResult.success && sessionResult.data) {
        const session = sessionResult.data
        // 删除令牌映射
        await config.sessionStore.deleteTokenMapping(session.accessToken)
        if (session.refreshToken) {
          await config.sessionStore.deleteTokenMapping(session.refreshToken)
        }
        // 移除用户会话映射
        await config.sessionStore.removeUserSession(session.userId, sessionId)
      }

      // 删除会话
      return config.sessionStore.delete(sessionId)
    },

    async deleteByUserId(userId: string): Promise<Result<number, IamError>> {
      const sessionIdsResult = await config.sessionStore.getUserSessionIds(userId)
      if (!sessionIdsResult.success) {
        return sessionIdsResult as Result<number, IamError>
      }

      const sessionIds = sessionIdsResult.data
      let count = 0

      for (const sessionId of sessionIds) {
        const deleteResult = await this.delete(sessionId)
        if (deleteResult.success) {
          count++
        }
      }

      return ok(count)
    },

    async cleanup(): Promise<Result<number, IamError>> {
      // 清理由存储层自动处理（通过 TTL）
      return ok(0)
    },
  }
}
