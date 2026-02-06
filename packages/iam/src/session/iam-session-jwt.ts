/**
 * =============================================================================
 * @hai/iam - JWT 会话管理器
 * =============================================================================
 *
 * 无状态 JWT 会话实现
 *
 * @module iam-session-jwt
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
import { getIamMessage } from '../iam-i18n.js'

/**
 * JWT 会话管理器配置
 */
export interface JwtSessionConfig {
  /** JWT 配置 */
  jwt: JwtConfig
  /** 会话最大有效期（秒） */
  maxAge?: number
}

/**
 * 创建 JWT 会话管理器
 */
export function createJwtSessionManager(config: JwtSessionConfig): SessionManager {
  const jwtConfig = JwtConfigSchema.parse(config.jwt)
  const secretKey = new TextEncoder().encode(jwtConfig.secret)

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
    type: 'jwt',

    async create(options: CreateSessionOptions): Promise<Result<Session, IamError>> {
      try {
        const sessionId = generateId()
        const now = new Date()
        const accessExpiresIn = jwtConfig.accessTokenExpiresIn
        const refreshExpiresIn = jwtConfig.refreshTokenExpiresIn

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
          expiresAt: new Date(now.getTime() + refreshExpiresIn * 1000),
          data: options.data,
        }

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

    async get(_sessionId: string): Promise<Result<Session | null, IamError>> {
      // JWT 无状态模式不存储会话
      return ok(null)
    },

    async getByToken(accessToken: string): Promise<Result<Session | null, IamError>> {
      const verifyResult = await verifyJwt(accessToken)
      if (!verifyResult.success) {
        return ok(null)
      }

      const payload = verifyResult.data
      const now = new Date()

      // 从 JWT 重建会话信息
      const session: Session = {
        id: payload.sid || '',
        userId: payload.sub,
        accessToken,
        createdAt: new Date(payload.iat * 1000),
        lastActiveAt: now,
        expiresAt: new Date(payload.exp * 1000),
      }

      return ok(session)
    },

    async verifyToken(accessToken: string): Promise<Result<TokenPayload, IamError>> {
      return verifyJwt(accessToken)
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

      const now = new Date()
      const accessExpiresIn = jwtConfig.accessTokenExpiresIn
      const refreshExpiresIn = jwtConfig.refreshTokenExpiresIn

      try {
        const newAccessToken = await signToken(
          { sub: payload.sub, username: payload.username, sid: payload.sid, type: 'access' },
          accessExpiresIn,
        )

        const newRefreshToken = await signToken(
          { sub: payload.sub, sid: payload.sid, type: 'refresh' },
          refreshExpiresIn,
        )

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

    async update(_sessionId: string, _data: Partial<Session>): Promise<Result<void, IamError>> {
      // JWT 无状态模式不支持更新会话
      return ok(undefined)
    },

    async delete(_sessionId: string): Promise<Result<void, IamError>> {
      // JWT 无状态模式不支持删除会话（客户端需要自行清除令牌）
      return ok(undefined)
    },

    async deleteByUserId(_userId: string): Promise<Result<number, IamError>> {
      // JWT 无状态模式不支持批量删除
      return ok(0)
    },

    async cleanup(): Promise<Result<number, IamError>> {
      // JWT 无状态模式不需要清理
      return ok(0)
    },
  }
}
