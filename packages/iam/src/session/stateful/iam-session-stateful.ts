/**
 * =============================================================================
 * @hai/iam - 有状态会话管理器
 * =============================================================================
 *
 * 有状态会话实现（使用外部存储如 db）
 *
 * @module session/stateful/iam-session-stateful
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { JwtConfig } from '../../iam-config.js'
import type { IamError } from '../../iam-core-types.js'
import type {
  CreateSessionOptions,
  RefreshResult,
  Session,
  SessionManager,
  SessionMappingRepository,
  TokenPayload,
} from '../iam-session-types.js'
import { err, ok } from '@hai/core'
import * as jose from 'jose'

import { IamErrorCode, JwtConfigSchema } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'

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
  /** 会话映射存储 */
  sessionMappingRepository: SessionMappingRepository
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
   * 构建会话数据
   */
  function buildSession(options: CreateSessionOptions, sessionId: string, now: Date, sessionTtl: number, accessToken: string, refreshToken: string): Session {
    return {
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
  }

  /**
   * 构建令牌载荷
   */
  function buildTokenPayload(payload: jose.JWTPayload): TokenPayload {
    return {
      sub: payload.sub as string,
      username: payload.username as string | undefined,
      sid: payload.sid as string | undefined,
      iat: payload.iat as number,
      exp: payload.exp as number,
      iss: payload.iss as string | undefined,
      aud: payload.aud as string | undefined,
      type: payload.type as 'access' | 'refresh' | undefined,
    }
  }

  /**
   * 构建刷新结果
   */
  function buildRefreshResult(now: Date, accessToken: string, refreshToken: string, accessExpiresIn: number, refreshExpiresIn: number): RefreshResult {
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(now.getTime() + accessExpiresIn * 1000),
      refreshTokenExpiresAt: new Date(now.getTime() + refreshExpiresIn * 1000),
    }
  }

  /**
   * 计算会话剩余 TTL
   */
  function getSessionTtl(session: Session, now = Date.now()): number {
    return Math.max(0, Math.floor((session.expiresAt.getTime() - now) / 1000))
  }

  /**
   * 应用会话更新
   */
  function applySessionPatch(session: Session, patch: Partial<Session>): Session {
    const nextSession = { ...session }
    if (patch.data !== undefined) {
      nextSession.data = { ...nextSession.data, ...patch.data }
    }
    if (patch.userAgent !== undefined) {
      nextSession.userAgent = patch.userAgent
    }
    if (patch.ipAddress !== undefined) {
      nextSession.ipAddress = patch.ipAddress
    }
    nextSession.lastActiveAt = new Date()
    return nextSession
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

      const tokenPayload = buildTokenPayload(payload)
      return ok(tokenPayload)
    }
    catch (error) {
      if (error instanceof jose.errors.JWTExpired) {
        return err({
          code: IamErrorCode.TOKEN_EXPIRED,
          message: iamM('iam_tokenExpired'),
          cause: error,
        })
      }
      return err({
        code: IamErrorCode.TOKEN_INVALID,
        message: iamM('iam_tokenInvalid'),
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

        const session = buildSession(options, sessionId, now, sessionTtl, accessToken, refreshToken)

        // 存储会话
        const storeResult = await config.sessionMappingRepository.set(sessionId, session, sessionTtl)
        if (!storeResult.success) {
          return storeResult as Result<Session, IamError>
        }

        // 存储令牌映射
        await config.sessionMappingRepository.setTokenMapping(accessToken, sessionId, accessExpiresIn)
        await config.sessionMappingRepository.setTokenMapping(refreshToken, sessionId, refreshExpiresIn)

        // 添加用户会话映射
        await config.sessionMappingRepository.addUserSession(options.userId, sessionId)

        return ok(session)
      }
      catch (error) {
        return err({
          code: IamErrorCode.SESSION_CREATE_FAILED,
          message: iamM('iam_createSessionFailed'),
          cause: error,
        })
      }
    },

    async get(sessionId: string): Promise<Result<Session | null, IamError>> {
      const sessionResult = await config.sessionMappingRepository.get(sessionId)
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
        await config.sessionMappingRepository.set(sessionId, session, maxAge)
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
      const sessionIdResult = await config.sessionMappingRepository.getSessionIdByToken(accessToken)
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
      const sessionIdResult = await config.sessionMappingRepository.getSessionIdByToken(accessToken)
      if (!sessionIdResult.success) {
        return sessionIdResult as Result<TokenPayload, IamError>
      }

      if (!sessionIdResult.data) {
        return err({
          code: IamErrorCode.SESSION_INVALID,
          message: iamM('iam_sessionExpired'),
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
          message: iamM('iam_invalidRefreshToken'),
        })
      }

      // 检查会话是否存在
      const sessionIdResult = await config.sessionMappingRepository.getSessionIdByToken(refreshToken)
      if (!sessionIdResult.success || !sessionIdResult.data) {
        return err({
          code: IamErrorCode.SESSION_INVALID,
          message: iamM('iam_sessionExpired'),
        })
      }

      const sessionId = sessionIdResult.data
      const sessionResult = await config.sessionMappingRepository.get(sessionId)
      if (!sessionResult.success || !sessionResult.data) {
        return err({
          code: IamErrorCode.SESSION_NOT_FOUND,
          message: iamM('iam_sessionNotExist'),
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
        await config.sessionMappingRepository.deleteTokenMapping(session.accessToken)
        await config.sessionMappingRepository.deleteTokenMapping(session.refreshToken || '')

        // 存储新令牌映射
        await config.sessionMappingRepository.setTokenMapping(newAccessToken, sessionId, accessExpiresIn)
        await config.sessionMappingRepository.setTokenMapping(newRefreshToken, sessionId, refreshExpiresIn)

        // 更新会话
        session.accessToken = newAccessToken
        session.refreshToken = newRefreshToken
        session.lastActiveAt = now
        if (sliding) {
          session.expiresAt = new Date(now.getTime() + maxAge * 1000)
        }
        await config.sessionMappingRepository.set(sessionId, session, maxAge)

        const refreshResult = buildRefreshResult(now, newAccessToken, newRefreshToken, accessExpiresIn, refreshExpiresIn)
        return ok(refreshResult)
      }
      catch (error) {
        return err({
          code: IamErrorCode.TOKEN_REFRESH_FAILED,
          message: iamM('iam_refreshTokenFailed'),
          cause: error,
        })
      }
    },

    async update(sessionId: string, data: Partial<Session>): Promise<Result<void, IamError>> {
      const sessionResult = await config.sessionMappingRepository.get(sessionId)
      if (!sessionResult.success) {
        return sessionResult as Result<void, IamError>
      }

      const session = sessionResult.data
      if (!session) {
        return err({
          code: IamErrorCode.SESSION_NOT_FOUND,
          message: iamM('iam_sessionNotExist'),
        })
      }

      const nextSession = applySessionPatch(session, data)
      const ttl = getSessionTtl(nextSession)
      return config.sessionMappingRepository.set(sessionId, nextSession, ttl)
    },

    async delete(sessionId: string): Promise<Result<void, IamError>> {
      // 获取会话信息
      const sessionResult = await config.sessionMappingRepository.get(sessionId)
      if (sessionResult.success && sessionResult.data) {
        const session = sessionResult.data
        // 删除令牌映射
        await config.sessionMappingRepository.deleteTokenMapping(session.accessToken)
        if (session.refreshToken) {
          await config.sessionMappingRepository.deleteTokenMapping(session.refreshToken)
        }
        // 移除用户会话映射
        await config.sessionMappingRepository.removeUserSession(session.userId, sessionId)
      }

      // 删除会话
      return config.sessionMappingRepository.delete(sessionId)
    },

    async deleteByUserId(userId: string): Promise<Result<number, IamError>> {
      const sessionIdsResult = await config.sessionMappingRepository.getUserSessionIds(userId)
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
