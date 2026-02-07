/**
 * =============================================================================
 * @hai/iam - OAuth 状态缓存实现
 * =============================================================================
 *
 * 基于 @hai/cache 的 OAuth 状态缓存实现。
 *
 * @module iam-repository-oauth-cache
 * =============================================================================
 */

import type { CacheService } from '@hai/cache'
import type { Result } from '@hai/core'
import type { IamError, OAuthState, OAuthStateStore } from '../iam-types.js'
import { err, ok } from '@hai/core'
import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

const DEFAULT_PREFIX = 'iam:oauth:state:'

export interface OAuthStateCacheOptions {
  /** 缓存键前缀 */
  keyPrefix?: string
}

interface CachedOAuthState {
  state: string
  codeVerifier?: string
  returnUrl?: string
  expiresAt: string | Date
}

/**
 * 构建缓存键
 */
function buildKey(prefix: string, state: string): string {
  return `${prefix}${state}`
}

/**
 * 恢复 Date 字段
 */
function restoreOAuthState(record: CachedOAuthState): OAuthState {
  return {
    state: record.state,
    codeVerifier: record.codeVerifier,
    returnUrl: record.returnUrl,
    expiresAt: new Date(record.expiresAt),
  }
}

/**
 * 检查是否过期
 */
function isExpired(expiresAt: Date, now = Date.now()): boolean {
  return expiresAt.getTime() <= now
}

/**
 * 计算剩余 TTL（秒）
 */
function getRemainingTtl(expiresAt: Date, now = Date.now()): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000))
}

/**
 * 创建基于 Cache 的 OAuth 状态存储
 */
export function createCacheOAuthStateStore(
  cache: CacheService,
  options: OAuthStateCacheOptions = {},
): OAuthStateStore {
  const keyPrefix = options.keyPrefix ?? DEFAULT_PREFIX

  async function deleteStateInternal(state: string): Promise<Result<void, IamError>> {
    const result = await cache.del(buildKey(keyPrefix, state))
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_deleteOauthStateCacheFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }
    return ok(undefined)
  }

  return {
    async set(state, data): Promise<Result<void, IamError>> {
      const ttl = getRemainingTtl(data.expiresAt)
      const payload: CachedOAuthState = {
        state: data.state,
        codeVerifier: data.codeVerifier,
        returnUrl: data.returnUrl,
        expiresAt: data.expiresAt,
      }

      const result = await cache.set(buildKey(keyPrefix, state), payload, ttl > 0 ? { ex: ttl } : undefined)
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_saveOauthStateCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async get(state): Promise<Result<OAuthState | null, IamError>> {
      const result = await cache.get<CachedOAuthState>(buildKey(keyPrefix, state))
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryOauthStateCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      if (!result.data) {
        return ok(null)
      }

      const restored = restoreOAuthState(result.data)
      if (isExpired(restored.expiresAt)) {
        await deleteStateInternal(state)
        return ok(null)
      }

      return ok(restored)
    },

    async delete(state): Promise<Result<void, IamError>> {
      return deleteStateInternal(state)
    },
  }
}
