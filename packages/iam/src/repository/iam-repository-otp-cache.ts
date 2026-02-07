/**
 * =============================================================================
 * @hai/iam - OTP 缓存实现
 * =============================================================================
 *
 * 基于 @hai/cache 的 OTP 缓存实现。
 *
 * @module iam-repository-otp-cache
 * =============================================================================
 */

import type { CacheService } from '@hai/cache'
import type { Result } from '@hai/core'
import type { IamError, OtpStore } from '../iam-types.js'
import { err, ok } from '@hai/core'
import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

const DEFAULT_PREFIX = 'iam:otp:'

export interface OtpCacheOptions {
  /** 缓存键前缀 */
  keyPrefix?: string
}

interface CachedOtpRecord {
  code: string
  attempts: number
  createdAt: string | Date
  expiresAt: string | Date
}

interface RestoredOtpRecord {
  code: string
  attempts: number
  createdAt: Date
  expiresAt: Date
}

/**
 * 构建缓存键
 */
function buildKey(prefix: string, identifier: string): string {
  return `${prefix}${identifier}`
}

/**
 * 恢复 Date 字段
 */
function restoreOtpRecord(record: CachedOtpRecord): RestoredOtpRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
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
 * 创建基于 Cache 的 OTP 存储
 */
export function createCacheOtpStore(
  cache: CacheService,
  options: OtpCacheOptions = {},
): OtpStore {
  const keyPrefix = options.keyPrefix ?? DEFAULT_PREFIX

  async function deleteOtpInternal(identifier: string): Promise<Result<void, IamError>> {
    const result = await cache.del(buildKey(keyPrefix, identifier))
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_deleteOtpCacheFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }
    return ok(undefined)
  }

  return {
    async set(identifier, code, expiresIn): Promise<Result<void, IamError>> {
      const now = Date.now()
      const expiresAt = new Date(now + expiresIn * 1000)
      const record: CachedOtpRecord = {
        code,
        attempts: 0,
        createdAt: new Date(now),
        expiresAt,
      }

      const result = await cache.set(buildKey(keyPrefix, identifier), record, { ex: expiresIn })
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_saveOtpCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async get(identifier): Promise<Result<{ code: string, attempts: number, createdAt: Date } | null, IamError>> {
      const result = await cache.get<CachedOtpRecord>(buildKey(keyPrefix, identifier))
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryOtpCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      if (!result.data) {
        return ok(null)
      }

      const restored = restoreOtpRecord(result.data)
      if (isExpired(restored.expiresAt)) {
        await deleteOtpInternal(identifier)
        return ok(null)
      }

      return ok({
        code: restored.code,
        attempts: restored.attempts,
        createdAt: restored.createdAt,
      })
    },

    async incrementAttempts(identifier): Promise<Result<number, IamError>> {
      const result = await cache.get<CachedOtpRecord>(buildKey(keyPrefix, identifier))
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryOtpCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      if (!result.data) {
        return ok(0)
      }

      const restored = restoreOtpRecord(result.data)
      if (isExpired(restored.expiresAt)) {
        await deleteOtpInternal(identifier)
        return ok(0)
      }

      const nextAttempts = restored.attempts + 1
      const ttl = getRemainingTtl(restored.expiresAt)
      if (ttl <= 0) {
        await deleteOtpInternal(identifier)
        return ok(0)
      }

      const updated: CachedOtpRecord = {
        ...restored,
        attempts: nextAttempts,
      }

      const updateResult = await cache.set(buildKey(keyPrefix, identifier), updated, { ex: ttl })
      if (!updateResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_updateOtpCacheFailed', { params: { message: updateResult.error.message } }),
          cause: updateResult.error,
        })
      }

      return ok(nextAttempts)
    },

    async delete(identifier): Promise<Result<void, IamError>> {
      return deleteOtpInternal(identifier)
    },
  }
}
