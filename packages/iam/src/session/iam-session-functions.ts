/**
 * @h-ai/iam — 会话子功能工厂
 *
 * 基于缓存存储的会话实现：创建、查询、验证、更新、删除。
 * @module iam-session-functions
 */

import type { HaiResult } from '@h-ai/core'
import type { IamConfig } from '../iam-config.js'
import type { SessionRepository } from './iam-session-repository-cache.js'
import type { CreateSessionOptions, Session, SessionOperations, TokenPair } from './iam-session-types.js'
import { core, err, ok } from '@h-ai/core'
import { SessionConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'
import { createCacheSessionRepository } from './iam-session-repository-cache.js'
import { buildSession, generateToken } from './iam-session-utils.js'

const logger = core.logger.child({ module: 'iam', scope: 'session' })

// ─── 子功能依赖 ───

/**
 * 会话子功能依赖
 */
export interface SessionOperationsDeps {
  config: IamConfig
}

/**
 * 创建会话子功能
 *
 * 内部创建缓存会话存储，返回会话管理接口。
 */
export async function createSessionOperations(deps: SessionOperationsDeps): Promise<HaiResult<SessionOperations>> {
  try {
    const { config } = deps
    const sessionConfig = SessionConfigSchema.parse(config.session ?? {})
    const sessionRepository = createCacheSessionRepository(
      sessionConfig.maxAge ?? 86400,
      sessionConfig.refreshTokenMaxAge ?? 604800,
    )

    const functions = buildSessionFunctions({
      maxAge: sessionConfig.maxAge,
      sliding: sessionConfig.sliding,
      singleDevice: sessionConfig.singleDevice,
      sessionRepository,
    })

    logger.info('Session sub-feature initialized')
    return ok(functions)
  }
  catch (error) {
    logger.error('Session sub-feature initialization failed', { error })
    return err(
      HaiIamError.CONFIG_ERROR,
      iamM('iam_initComponentFailed'),
      error,
    )
  }
}

// ─── 内部实现 ───

/**
 * 内部会话构建器配置
 */
interface SessionBuilderConfig {
  /** 会话最大有效期（秒，默认 86400 = 24小时） */
  maxAge?: number
  /** 是否滑动窗口 */
  sliding?: boolean
  /** 单设备登录（踢掉其他设备） */
  singleDevice?: boolean
  /** 会话存储 */
  sessionRepository: SessionRepository
}

/**
 * 组装会话操作
 */
function buildSessionFunctions(config: SessionBuilderConfig): SessionOperations {
  const maxAge = config.maxAge ?? 86400
  const sliding = config.sliding ?? true
  const singleDevice = config.singleDevice ?? false
  const repo = config.sessionRepository

  return {
    async create(options: CreateSessionOptions): Promise<HaiResult<Session>> {
      try {
        if (singleDevice) {
          const clearResult = await repo.removeByUserId(options.userId)
          if (!clearResult.success) {
            return clearResult as HaiResult<Session>
          }
        }

        const accessToken = generateToken()
        const tokenPair: TokenPair = {
          accessToken,
          refreshToken: generateToken(),
          expiresIn: maxAge,
          tokenType: 'Bearer',
        }

        const now = new Date()
        const sessionTtl = options.maxAge ?? maxAge
        const session = buildSession(options, now, sessionTtl, accessToken)

        // 将 tokenPair 附加到 session 的 data 字段（持久化到缓存，logout 时可提取 refreshToken）
        session.data = { ...session.data, _tokenPair: tokenPair }

        const saveResult = await repo.save(session, tokenPair)
        if (!saveResult.success) {
          return saveResult as HaiResult<Session>
        }

        logger.debug('Session created', { userId: options.userId })
        return ok(session)
      }
      catch (error) {
        return err(
          HaiIamError.SESSION_CREATE_FAILED,
          iamM('iam_createSessionFailed'),
          error,
        )
      }
    },

    async get(accessToken: string): Promise<HaiResult<Session | null>> {
      const sessionResult = await repo.getByAccessToken(accessToken)
      if (!sessionResult.success) {
        return sessionResult
      }

      const session = sessionResult.data
      if (!session) {
        return ok(null)
      }

      if (new Date() > session.expiresAt) {
        await repo.removeByAccessToken(accessToken)
        return ok(null)
      }

      if (sliding) {
        const now = new Date()
        await repo.updateByAccessToken(accessToken, {
          lastActiveAt: now,
          expiresAt: new Date(now.getTime() + maxAge * 1000),
        })
      }

      return ok(session)
    },

    async verifyToken(accessToken: string): Promise<HaiResult<Session>> {
      const sessionResult = await this.get(accessToken)
      if (!sessionResult.success) {
        return sessionResult as HaiResult<Session>
      }

      if (!sessionResult.data) {
        return err(
          HaiIamError.SESSION_INVALID,
          iamM('iam_sessionExpired'),
        )
      }

      return ok(sessionResult.data)
    },

    async update(accessToken: string, data: Partial<Session>): Promise<HaiResult<void>> {
      return repo.updateByAccessToken(accessToken, data)
    },

    async delete(accessToken: string): Promise<HaiResult<void>> {
      logger.debug('Session deleted', { accessToken })
      return repo.removeByAccessToken(accessToken)
    },

    async deleteByUserId(userId: string): Promise<HaiResult<number>> {
      // removeByUserId 内部遍历删除，无法直接获取删除数量
      // 暂返回 0 表示成功；上层仅关注 success/failure
      const result = await repo.removeByUserId(userId)
      if (!result.success) {
        return result as HaiResult<number>
      }
      return ok(0)
    },

    async refresh(refreshToken: string): Promise<HaiResult<TokenPair>> {
      try {
        // 根据 refreshToken 获取旧会话
        const oldSessionResult = await repo.getByRefreshToken(refreshToken)
        if (!oldSessionResult.success) {
          return oldSessionResult as HaiResult<TokenPair>
        }

        const oldSession = oldSessionResult.data
        if (!oldSession) {
          return err(
            HaiIamError.TOKEN_EXPIRED,
            iamM('iam_refreshTokenExpired'),
          )
        }

        // Rotation 策略：删除旧会话（removeByAccessToken 内部同时清理 refreshToken 映射）
        await repo.removeByAccessToken(oldSession.accessToken)

        // 创建新会话（复用旧会话的用户数据）
        const newSessionResult = await this.create({
          userId: oldSession.userId,
          username: oldSession.username,
          displayName: oldSession.displayName,
          avatarUrl: oldSession.avatarUrl,
          roles: oldSession.roles,
          permissions: oldSession.permissions,
          source: oldSession.source,
          data: oldSession.data ? { ...oldSession.data, _tokenPair: undefined } : undefined,
        })

        if (!newSessionResult.success) {
          return newSessionResult as HaiResult<TokenPair>
        }

        // 从新会话中提取 tokenPair
        const tokenPair = newSessionResult.data.data?._tokenPair
        if (!tokenPair) {
          return err(
            HaiIamError.TOKEN_REFRESH_FAILED,
            iamM('iam_refreshTokenFailed'),
          )
        }

        logger.debug('Token refreshed', { userId: oldSession.userId })
        return ok(tokenPair)
      }
      catch (error) {
        return err(
          HaiIamError.TOKEN_REFRESH_FAILED,
          iamM('iam_refreshTokenFailed'),
          error,
        )
      }
    },

    async revokeRefresh(refreshToken: string): Promise<HaiResult<void>> {
      return repo.removeRefreshToken(refreshToken)
    },

    async patchUserSessions(userId, updates): Promise<HaiResult<void>> {
      return repo.patchUserSessions(userId, { ...updates })
    },
  }
}
