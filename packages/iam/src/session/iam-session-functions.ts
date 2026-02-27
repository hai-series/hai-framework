/**
 * @h-ai/iam — 会话子功能工厂
 *
 * 基于缓存存储的会话实现：创建、查询、验证、更新、删除。
 */

import type { CacheFunctions } from '@h-ai/cache'
import type { Result } from '@h-ai/core'
import type { IamConfig } from '../iam-config.js'
import type { IamError } from '../iam-types.js'
import type { SessionMappingRepository } from './iam-session-repository-cache.js'
import type { CreateSessionOptions, IamSessionFunctions, Session } from './iam-session-types.js'
import { core, err, ok } from '@h-ai/core'
import { IamErrorCode, SessionConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'
import { createCacheSessionMappingRepository } from './iam-session-repository-cache.js'
import { applySessionPatch, buildSession, generateToken, getSessionTtl } from './iam-session-utils.js'

const logger = core.logger.child({ module: 'iam', scope: 'session' })

// ─── 子功能依赖 ───

/**
 * 会话子功能依赖
 */
export interface IamSessionFunctionsDeps {
  config: IamConfig
  cache: CacheFunctions
}

/**
 * 创建会话子功能
 *
 * 内部创建缓存会话存储，返回会话管理接口。
 */
export async function createIamSessionFunctions(deps: IamSessionFunctionsDeps): Promise<Result<IamSessionFunctions, IamError>> {
  try {
    const { config, cache } = deps
    const sessionConfig = SessionConfigSchema.parse(config.session ?? {})
    const sessionMappingRepository = createCacheSessionMappingRepository(cache, sessionConfig.maxAge)

    const functions = buildSessionFunctions({
      maxAge: sessionConfig.maxAge,
      sliding: sessionConfig.sliding,
      singleDevice: sessionConfig.singleDevice,
      sessionMappingRepository,
    })

    logger.info('Session sub-feature initialized')
    return ok(functions)
  }
  catch (error) {
    logger.error('Session sub-feature initialization failed', { error })
    return err({
      code: IamErrorCode.CONFIG_ERROR,
      message: iamM('iam_initComponentFailed'),
      cause: error,
    })
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
  /** 会话映射存储 */
  sessionMappingRepository: SessionMappingRepository
}

/**
 * 组装会话操作（纯同步，不涉及 I/O，除缓存操作）
 */
function buildSessionFunctions(config: SessionBuilderConfig): IamSessionFunctions {
  const maxAge = config.maxAge ?? 86400
  const sliding = config.sliding ?? true
  const singleDevice = config.singleDevice ?? false

  /**
   * 清除用户的所有会话令牌
   *
   * 用于单设备登录场景，新登录前踢掉其他设备的会话。
   *
   * @param userId - 用户 ID
   */
  async function clearUserTokens(userId: string): Promise<Result<void, IamError>> {
    const tokensResult = await config.sessionMappingRepository.getUserTokens(userId)
    if (!tokensResult.success) {
      return tokensResult as Result<void, IamError>
    }

    for (const token of tokensResult.data) {
      await config.sessionMappingRepository.delete(token)
      await config.sessionMappingRepository.removeUserToken(userId, token)
    }

    return ok(undefined)
  }

  return {
    async create(options: CreateSessionOptions): Promise<Result<Session, IamError>> {
      try {
        if (singleDevice) {
          const clearResult = await clearUserTokens(options.userId)
          if (!clearResult.success) {
            return clearResult as Result<Session, IamError>
          }
        }

        const accessToken = generateToken()
        const now = new Date()
        const sessionTtl = options.maxAge ?? maxAge
        const session = buildSession(options, now, sessionTtl, accessToken)

        const storeResult = await config.sessionMappingRepository.set(accessToken, session, sessionTtl)
        if (!storeResult.success) {
          return storeResult as Result<Session, IamError>
        }

        await config.sessionMappingRepository.addUserToken(options.userId, accessToken)

        logger.debug('Session created', { userId: options.userId })
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

    async get(accessToken: string): Promise<Result<Session | null, IamError>> {
      const sessionResult = await config.sessionMappingRepository.get(accessToken)
      if (!sessionResult.success) {
        return sessionResult
      }

      const session = sessionResult.data
      if (!session) {
        return ok(null)
      }

      if (new Date() > session.expiresAt) {
        await this.delete(accessToken)
        return ok(null)
      }

      if (sliding) {
        const now = new Date()
        session.lastActiveAt = now
        session.expiresAt = new Date(now.getTime() + maxAge * 1000)
        await config.sessionMappingRepository.set(accessToken, session, maxAge)
      }

      return ok(session)
    },

    async verifyToken(accessToken: string): Promise<Result<Session, IamError>> {
      const sessionResult = await this.get(accessToken)
      if (!sessionResult.success) {
        return sessionResult as Result<Session, IamError>
      }

      if (!sessionResult.data) {
        return err({
          code: IamErrorCode.SESSION_INVALID,
          message: iamM('iam_sessionExpired'),
        })
      }

      return ok(sessionResult.data)
    },

    async update(accessToken: string, data: Partial<Session>): Promise<Result<void, IamError>> {
      const sessionResult = await config.sessionMappingRepository.get(accessToken)
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
      return config.sessionMappingRepository.set(accessToken, nextSession, ttl)
    },

    async delete(accessToken: string): Promise<Result<void, IamError>> {
      const sessionResult = await config.sessionMappingRepository.get(accessToken)
      if (sessionResult.success && sessionResult.data) {
        const session = sessionResult.data
        await config.sessionMappingRepository.removeUserToken(session.userId, session.accessToken)
        logger.debug('Session deleted', { userId: session.userId })
      }

      return config.sessionMappingRepository.delete(accessToken)
    },

    async deleteByUserId(userId: string): Promise<Result<number, IamError>> {
      const tokensResult = await config.sessionMappingRepository.getUserTokens(userId)
      if (!tokensResult.success) {
        return tokensResult as Result<number, IamError>
      }

      let count = 0
      for (const token of tokensResult.data) {
        const deleteResult = await this.delete(token)
        if (deleteResult.success) {
          count++
        }
      }

      return ok(count)
    },
  }
}
