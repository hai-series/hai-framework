/**
 * =============================================================================
 * @hai/iam - 会话映射缓存实现
 * =============================================================================
 *
 * 基于 @hai/cache 的会话映射实现：
 * - token -> session: iam:token:{token}
 * - user -> tokens: iam:user:{userId}:tokens
 *
 * @module session/iam-session-repository-cache
 * =============================================================================
 */

import type { CacheService } from '@hai/cache'
import type { Result } from '@hai/core'
import type { IamError } from '../iam-core-types.js'
import type { Session } from './iam-session-types.js'
import { err, ok } from '@hai/core'

import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

const TOKEN_KEY_PREFIX = 'iam:token:'
const USER_TOKENS_KEY_PREFIX = 'iam:user:'

/**
 * 构建令牌对应的缓存 key
 *
 * @param token - 访问令牌
 * @returns 格式：`iam:token:{token}`
 */
export function buildTokenKey(token: string): string {
  return `${TOKEN_KEY_PREFIX}${token}`
}

/**
 * 构建用户令牌集合的缓存 key
 *
 * @param userId - 用户 ID
 * @returns 格式：`iam:user:{userId}:tokens`
 */
export function buildUserTokensKey(userId: string): string {
  return `${USER_TOKENS_KEY_PREFIX}${userId}:tokens`
}

/**
 * 修复从缓存反序列化后的日期字段
 *
 * 缓存存储后日期可能为字符串，需要重新转为 Date 对象。
 *
 * @param session - 缓存中读取的会话数据
 * @returns 日期字段已修复的 Session 对象
 */
function restoreSessionDates(session: Session): Session {
  return {
    ...session,
    createdAt: session.createdAt instanceof Date ? session.createdAt : new Date(session.createdAt),
    lastActiveAt: session.lastActiveAt instanceof Date ? session.lastActiveAt : new Date(session.lastActiveAt),
    expiresAt: session.expiresAt instanceof Date ? session.expiresAt : new Date(session.expiresAt),
  }
}

// =============================================================================
// 会话映射存储接口
// =============================================================================

/**
 * 会话映射存储接口
 */
export interface SessionMappingRepository {
  /**
   * 存储会话（key: iam:token:{token}）
   */
  set: (token: string, session: Session, ttl: number) => Promise<Result<void, IamError>>

  /**
   * 获取会话
   */
  get: (token: string) => Promise<Result<Session | null, IamError>>

  /**
   * 删除会话
   */
  delete: (token: string) => Promise<Result<void, IamError>>

  /**
   * 获取用户的所有令牌
   */
  getUserTokens: (userId: string) => Promise<Result<string[], IamError>>

  /**
   * 添加用户令牌映射
   */
  addUserToken: (userId: string, token: string) => Promise<Result<void, IamError>>

  /**
   * 移除用户令牌映射
   */
  removeUserToken: (userId: string, token: string) => Promise<Result<void, IamError>>
}

/**
 * 创建基于缓存的会话映射存储
 *
 * 使用 @hai/cache 实现 token→session 和 user→tokens 的映射存储。
 *
 * @param cache - 缓存服务实例
 * @returns 会话映射存储接口实现
 */
export function createCacheSessionMappingRepository(cache: CacheService): SessionMappingRepository {
  return {
    async set(token, session, ttl): Promise<Result<void, IamError>> {
      const result = await cache.set(buildTokenKey(token), session, { ex: ttl })
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_saveSessionMappingCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }
      return ok(undefined)
    },

    async get(token): Promise<Result<Session | null, IamError>> {
      const result = await cache.get<Session>(buildTokenKey(token))
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_querySessionMappingCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }
      if (!result.data) {
        return ok(null)
      }
      return ok(restoreSessionDates(result.data))
    },

    async delete(token): Promise<Result<void, IamError>> {
      const result = await cache.del(buildTokenKey(token))
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_deleteSessionMappingCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }
      return ok(undefined)
    },

    async getUserTokens(userId): Promise<Result<string[], IamError>> {
      const result = await cache.set_.smembers<string>(buildUserTokensKey(userId))
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryUserSessionCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }
      return ok(result.data)
    },

    async addUserToken(userId, token): Promise<Result<void, IamError>> {
      const result = await cache.set_.sadd(buildUserTokensKey(userId), token)
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_saveUserSessionCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }
      return ok(undefined)
    },

    async removeUserToken(userId, token): Promise<Result<void, IamError>> {
      const result = await cache.set_.srem(buildUserTokensKey(userId), token)
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_deleteUserSessionCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }
      return ok(undefined)
    },
  }
}
