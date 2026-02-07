/**
 * =============================================================================
 * @hai/iam - 会话映射缓存实现
 * =============================================================================
 *
 * 基于 @hai/cache 的会话映射缓存实现，用于有状态会话管理器。
 *
 * @module iam-repository-session-mapping-cache
 * =============================================================================
 */

import type { CacheService } from '@hai/cache'
import type { Result } from '@hai/core'
import type { IamError, Session, SessionMappingRepository } from '../iam-types.js'
import { err, ok } from '@hai/core'
import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

const DEFAULT_PREFIX = 'iam:session:mapping:'

export interface SessionMappingCacheOptions {
  /** 缓存键前缀 */
  keyPrefix?: string
  /** 用户会话映射 TTL（秒） */
  userSessionTtl?: number
}

interface CachedTokenMapping {
  sessionId: string
}

/**
 * 构建会话缓存键
 */
function buildSessionKey(prefix: string, sessionId: string): string {
  return `${prefix}s:${sessionId}`
}

/**
 * 构建令牌映射缓存键
 */
function buildTokenKey(prefix: string, token: string): string {
  return `${prefix}t:${token}`
}

/**
 * 构建用户会话映射缓存键
 */
function buildUserKey(prefix: string, userId: string): string {
  return `${prefix}u:${userId}`
}

/**
 * 恢复会话 Date 字段
 */
function restoreSessionDates(session: Session): Session {
  return {
    ...session,
    createdAt: new Date(session.createdAt),
    lastActiveAt: new Date(session.lastActiveAt),
    expiresAt: new Date(session.expiresAt),
  }
}

/**
 * 检查会话是否过期
 */
function isSessionExpired(session: Session, now = Date.now()): boolean {
  return session.expiresAt.getTime() <= now
}

/**
 * 追加会话 ID
 */
function appendSessionId(sessionIds: string[], sessionId: string): string[] {
  if (sessionIds.includes(sessionId)) {
    return sessionIds
  }
  return [...sessionIds, sessionId]
}

/**
 * 移除会话 ID
 */
function removeSessionId(sessionIds: string[], sessionId: string): string[] {
  return sessionIds.filter(id => id !== sessionId)
}

/**
 * 创建基于 Cache 的会话映射存储
 */
export function createCacheSessionMappingRepository(
  cache: CacheService,
  options: SessionMappingCacheOptions = {},
): SessionMappingRepository {
  const keyPrefix = options.keyPrefix ?? DEFAULT_PREFIX
  const userSessionTtl = options.userSessionTtl

  async function deleteSessionCache(sessionId: string): Promise<Result<void, IamError>> {
    const result = await cache.del(buildSessionKey(keyPrefix, sessionId))
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_deleteSessionMappingCacheFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }
    return ok(undefined)
  }

  async function setUserSessionIds(userId: string, sessionIds: string[]): Promise<Result<void, IamError>> {
    const key = buildUserKey(keyPrefix, userId)
    const result = await cache.set(key, sessionIds, userSessionTtl ? { ex: userSessionTtl } : undefined)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_saveUserSessionCacheFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }
    return ok(undefined)
  }

  return {
    async set(sessionId, session, ttl): Promise<Result<void, IamError>> {
      const key = buildSessionKey(keyPrefix, sessionId)
      const result = await cache.set(key, session, { ex: ttl })
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_saveSessionMappingCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }
      return ok(undefined)
    },

    async get(sessionId): Promise<Result<Session | null, IamError>> {
      const key = buildSessionKey(keyPrefix, sessionId)
      const result = await cache.get<Session>(key)

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

      const restored = restoreSessionDates(result.data)
      if (isSessionExpired(restored)) {
        await deleteSessionCache(sessionId)
        return ok(null)
      }

      return ok(restored)
    },

    async getSessionIdByToken(token): Promise<Result<string | null, IamError>> {
      const key = buildTokenKey(keyPrefix, token)
      const result = await cache.get<CachedTokenMapping>(key)

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryTokenMappingCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      if (!result.data) {
        return ok(null)
      }

      return ok(result.data.sessionId)
    },

    async setTokenMapping(token, sessionId, ttl): Promise<Result<void, IamError>> {
      const key = buildTokenKey(keyPrefix, token)
      const payload: CachedTokenMapping = { sessionId }
      const result = await cache.set(key, payload, { ex: ttl })

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_saveTokenMappingCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async deleteTokenMapping(token): Promise<Result<void, IamError>> {
      const key = buildTokenKey(keyPrefix, token)
      const result = await cache.del(key)
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_deleteTokenMappingCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }
      return ok(undefined)
    },

    async delete(sessionId): Promise<Result<void, IamError>> {
      return deleteSessionCache(sessionId)
    },

    async getUserSessionIds(userId): Promise<Result<string[], IamError>> {
      const key = buildUserKey(keyPrefix, userId)
      const result = await cache.get<string[]>(key)

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryUserSessionCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(result.data ?? [])
    },

    async addUserSession(userId, sessionId): Promise<Result<void, IamError>> {
      const currentResult = await cache.get<string[]>(buildUserKey(keyPrefix, userId))
      if (!currentResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryUserSessionCacheFailed', { params: { message: currentResult.error.message } }),
          cause: currentResult.error,
        })
      }

      const updated = appendSessionId(currentResult.data ?? [], sessionId)
      return setUserSessionIds(userId, updated)
    },

    async removeUserSession(userId, sessionId): Promise<Result<void, IamError>> {
      const currentResult = await cache.get<string[]>(buildUserKey(keyPrefix, userId))
      if (!currentResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryUserSessionCacheFailed', { params: { message: currentResult.error.message } }),
          cause: currentResult.error,
        })
      }

      const updated = removeSessionId(currentResult.data ?? [], sessionId)
      return setUserSessionIds(userId, updated)
    },
  }
}
