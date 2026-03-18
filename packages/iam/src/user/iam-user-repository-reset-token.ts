/**
 * @h-ai/iam — 密码重置令牌存储实现
 *
 * 基于 @h-ai/cache 的密码重置令牌存储，采用两个缓存键实现令牌验证与尝试次数限制：
 * - `hai:iam:reset:{hashedToken}` → userId（带 TTL 自动过期）
 * - `hai:iam:reset:attempts:{userId}` → 尝试次数（带 TTL 自动过期）
 *
 * @module iam-user-repository-reset-token
 */

import type { Result } from '@h-ai/core'
import type { IamError } from '../iam-types.js'
import { cache } from '@h-ai/cache'
import { err, ok } from '@h-ai/core'
import { crypto as haiCrypto } from '@h-ai/crypto'

import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

/**
 * 对令牌进行 SHA-256 哈希
 *
 * 缓存中只存储令牌的哈希值，不存储明文。
 * 查询时也先哈希再匹配。
 *
 * @param token - 明文令牌
 * @returns 十六进制 SHA-256 哈希值，失败时返回 IamError
 */
export function hashResetToken(token: string): Result<string, IamError> {
  const result = haiCrypto.hash.hash(token)
  if (!result.success) {
    return err({
      code: IamErrorCode.REPOSITORY_ERROR,
      message: iamM('iam_hashResetTokenFailed', { params: { message: result.error.message } }),
      cause: result.error,
    })
  }
  return ok(result.data)
}

/**
 * 密码重置令牌存储接口
 */
export interface ResetTokenRepository {
  /**
   * 保存重置令牌
   *
   * 存储 hashedToken → userId 映射（带 TTL），并重置用户尝试次数。
   *
   * @param token - 明文令牌
   * @param userId - 用户 ID
   * @param expiresAt - 过期时间
   */
  saveToken: (token: string, userId: string, expiresAt: Date) => Promise<Result<void, IamError>>

  /**
   * 根据令牌获取用户 ID，同时递增尝试次数
   *
   * 自动检查尝试次数是否超限。超限时删除令牌并返回 RESET_TOKEN_MAX_ATTEMPTS 错误。
   * 令牌不存在或已过期（TTL 到期自动清理）返回 RESET_TOKEN_INVALID 错误。
   *
   * @param token - 明文令牌
   * @param maxAttempts - 最大允许尝试次数
   * @returns 成功返回 userId
   */
  tryGetUserByToken: (token: string, maxAttempts: number) => Promise<Result<string, IamError>>

  /**
   * 删除令牌及关联的尝试次数
   *
   * @param token - 明文令牌
   */
  removeToken: (token: string) => Promise<Result<void, IamError>>
}

// ─── 缓存键构建 ───

/** 令牌缓存键前缀：hashedToken → userId */
const RESET_TOKEN_KEY_PREFIX = 'hai:iam:reset:'

/** 用户尝试次数键前缀：userId → attempts */
const RESET_ATTEMPTS_KEY_PREFIX = 'hai:iam:reset:attempts:'

function buildResetTokenKey(hashedToken: string): string {
  return `${RESET_TOKEN_KEY_PREFIX}${hashedToken}`
}

function buildAttemptsKey(userId: string): string {
  return `${RESET_ATTEMPTS_KEY_PREFIX}${userId}`
}

// ─── 缓存实现 ───

/** 令牌存储单例缓存 */
let resetTokenRepoInstance: ResetTokenRepository | null = null

/**
 * 重置令牌存储单例
 *
 * 在 iam.close() 时调用，释放对旧 cache 实例的引用。
 */
export function resetResetTokenRepoSingleton(): void {
  resetTokenRepoInstance = null
}

/**
 * 创建基于缓存的密码重置令牌存储实例
 *
 * 单例模式：重复调用返回缓存实例。
 *
 * @returns 密码重置令牌存储接口实现
 */
export function createCacheResetTokenRepository(): ResetTokenRepository {
  if (resetTokenRepoInstance)
    return resetTokenRepoInstance

  const repo: ResetTokenRepository = {
    async saveToken(token, userId, expiresAt): Promise<Result<void, IamError>> {
      const hashResult = hashResetToken(token)
      if (!hashResult.success) {
        return hashResult
      }
      const hashedToken = hashResult.data
      const ttlSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000))

      // 存储 hashedToken → userId（带 TTL）
      const setResult = await cache.kv.set(buildResetTokenKey(hashedToken), userId, { ex: ttlSeconds })
      if (!setResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_saveResetTokenFailed', { params: { message: setResult.error.message } }),
          cause: setResult.error,
        })
      }

      // 重置尝试次数（与令牌相同 TTL）
      const attemptsResult = await cache.kv.set(buildAttemptsKey(userId), 0, { ex: ttlSeconds })
      if (!attemptsResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_saveResetTokenFailed', { params: { message: attemptsResult.error.message } }),
          cause: attemptsResult.error,
        })
      }

      return ok(undefined)
    },

    async tryGetUserByToken(token, maxAttempts): Promise<Result<string, IamError>> {
      const hashResult = hashResetToken(token)
      if (!hashResult.success) {
        return hashResult
      }
      const hashedToken = hashResult.data
      const tokenKey = buildResetTokenKey(hashedToken)

      // 查找 userId
      const result = await cache.kv.get<string>(tokenKey)
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryResetTokenFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }
      if (!result.data) {
        return err({
          code: IamErrorCode.RESET_TOKEN_INVALID,
          message: iamM('iam_resetTokenInvalid'),
        })
      }

      const userId = result.data
      const attemptsKey = buildAttemptsKey(userId)

      // 原子递增尝试次数
      const incrResult = await cache.kv.incr(attemptsKey)
      const nextAttempts = incrResult.success ? incrResult.data : 1

      // 超限：删除令牌，返回错误
      if (nextAttempts > maxAttempts) {
        await cache.kv.del(tokenKey)
        await cache.kv.del(attemptsKey)
        return err({
          code: IamErrorCode.RESET_TOKEN_MAX_ATTEMPTS,
          message: iamM('iam_resetTokenMaxAttempts'),
        })
      }

      return ok(userId)
    },

    async removeToken(token): Promise<Result<void, IamError>> {
      const hashResult = hashResetToken(token)
      if (!hashResult.success) {
        return hashResult
      }
      const hashedToken = hashResult.data
      const tokenKey = buildResetTokenKey(hashedToken)

      // 先获取 userId 以便清理尝试次数
      const result = await cache.kv.get<string>(tokenKey)
      if (result.success && result.data) {
        await cache.kv.del(buildAttemptsKey(result.data))
      }

      await cache.kv.del(tokenKey)
      return ok(undefined)
    },
  }

  resetTokenRepoInstance = repo
  return repo
}
