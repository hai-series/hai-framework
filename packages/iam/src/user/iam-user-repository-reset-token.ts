/**
 * =============================================================================
 * @h-ai/iam - 密码重置令牌存储实现
 * =============================================================================
 *
 * 基于 @h-ai/cache 的密码重置令牌存储，通过 KV + Set 结构实现
 * 令牌的创建、查询、过期自动清理和使用标记等操作。
 *
 * 缓存键设计：
 * - `iam:reset:{hashedToken}` → ResetTokenRecord JSON（KV，TTL = tokenExpiresIn）
 * - `iam:reset:user:{userId}` → Set<hashedToken>（关联用户所有令牌，用于按用户删除）
 * - `iam:reset:id:{id}` → hashedToken（ID 反向索引，用于 incrementAttempts / markUsed）
 *
 * @module user/iam-user-repository-reset-token
 * =============================================================================
 */

import type { CacheFunctions } from '@h-ai/cache'
import type { Result } from '@h-ai/core'
import type { IamError } from '../iam-types.js'
import { err, ok } from '@h-ai/core'
import { crypto as haiCrypto } from '@h-ai/crypto'

import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

// =============================================================================
// 密码重置令牌类型
// =============================================================================

/**
 * 密码重置令牌记录
 */
export interface ResetTokenRecord {
  /** 令牌 ID（主键） */
  id: string
  /** 用户 ID */
  userId: string
  /** 重置令牌（SHA-256 哈希值，不存储明文） */
  token: string
  /** 过期时间 */
  expiresAt: Date
  /** 验证尝试次数 */
  attempts: number
  /** 是否已使用 */
  used: boolean
  /** 创建时间 */
  createdAt: Date
}

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
   * @param record - 令牌记录（不含 attempts / used / createdAt，自动填充）
   */
  saveToken: (record: Pick<ResetTokenRecord, 'id' | 'userId' | 'token' | 'expiresAt'>) => Promise<Result<void, IamError>>

  /**
   * 根据令牌值查找有效记录（未过期、未使用）
   *
   * 缓存到期后自动清理，无需手动删除过期记录。
   *
   * @param token - 令牌值（明文）
   * @returns 令牌记录，或 null
   */
  findByToken: (token: string) => Promise<Result<ResetTokenRecord | null, IamError>>

  /**
   * 增加验证尝试次数
   *
   * @param id - 令牌 ID
   * @returns 更新后的尝试次数
   */
  incrementAttempts: (id: string) => Promise<Result<number, IamError>>

  /**
   * 标记令牌为已使用
   *
   * @param id - 令牌 ID
   */
  markUsed: (id: string) => Promise<Result<void, IamError>>

  /**
   * 删除用户的所有重置令牌
   *
   * @param userId - 用户 ID
   */
  removeByUserId: (userId: string) => Promise<Result<void, IamError>>
}

// =============================================================================
// 缓存键构建
// =============================================================================

/** 令牌缓存键前缀 */
const RESET_TOKEN_KEY_PREFIX = 'iam:reset:'

/** 用户令牌集合键前缀 */
const RESET_USER_KEY_PREFIX = 'iam:reset:user:'

/** ID → 哈希令牌反向索引前缀 */
const RESET_ID_KEY_PREFIX = 'iam:reset:id:'

/**
 * 构建令牌对应的缓存 key
 *
 * @param hashedToken - SHA-256 哈希值
 * @returns 格式：`iam:reset:{hashedToken}`
 */
function buildResetTokenKey(hashedToken: string): string {
  return `${RESET_TOKEN_KEY_PREFIX}${hashedToken}`
}

/**
 * 构建用户令牌集合的缓存 key
 *
 * @param userId - 用户 ID
 * @returns 格式：`iam:reset:user:{userId}`
 */
function buildUserResetTokensKey(userId: string): string {
  return `${RESET_USER_KEY_PREFIX}${userId}`
}

/**
 * 构建 ID → 哈希令牌的反向索引 key
 *
 * incrementAttempts / markUsed 通过 ID 查找，需要快速定位哈希令牌。
 *
 * @param id - 令牌 ID
 * @returns 格式：`iam:reset:id:{id}`
 */
function buildResetTokenIdKey(id: string): string {
  return `${RESET_ID_KEY_PREFIX}${id}`
}

/**
 * 修复从缓存反序列化后的日期字段
 *
 * 缓存存储后日期可能为字符串，需要重新转为 Date 对象。
 */
function restoreRecordDates(record: ResetTokenRecord): ResetTokenRecord {
  return {
    ...record,
    expiresAt: record.expiresAt instanceof Date ? record.expiresAt : new Date(record.expiresAt),
    createdAt: record.createdAt instanceof Date ? record.createdAt : new Date(record.createdAt),
  }
}

// =============================================================================
// 缓存实现
// =============================================================================

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
 * @param cache - 缓存服务实例
 * @returns 密码重置令牌存储接口实现
 */
export function createCacheResetTokenRepository(cache: CacheFunctions): ResetTokenRepository {
  if (resetTokenRepoInstance)
    return resetTokenRepoInstance

  const repo: ResetTokenRepository = {
    async saveToken(record): Promise<Result<void, IamError>> {
      const now = Date.now()
      const hashResult = hashResetToken(record.token)
      if (!hashResult.success) {
        return hashResult
      }
      const hashedToken = hashResult.data
      const ttlSeconds = Math.max(1, Math.ceil((record.expiresAt.getTime() - now) / 1000))

      const fullRecord: ResetTokenRecord = {
        ...record,
        token: hashedToken,
        attempts: 0,
        used: false,
        createdAt: new Date(now),
      }

      // 存储令牌记录（KV，带 TTL）
      const setResult = await cache.kv.set(buildResetTokenKey(hashedToken), fullRecord, { ex: ttlSeconds })
      if (!setResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_saveResetTokenFailed', { params: { message: setResult.error.message } }),
          cause: setResult.error,
        })
      }

      // 存储 ID → 哈希令牌反向索引（带相同 TTL）
      const idResult = await cache.kv.set(buildResetTokenIdKey(record.id), hashedToken, { ex: ttlSeconds })
      if (!idResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_saveResetTokenFailed', { params: { message: idResult.error.message } }),
          cause: idResult.error,
        })
      }

      // 将哈希令牌加入用户的令牌集合
      const saddResult = await cache.set_.sadd(buildUserResetTokensKey(record.userId), hashedToken)
      if (!saddResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_saveResetTokenFailed', { params: { message: saddResult.error.message } }),
          cause: saddResult.error,
        })
      }

      // 为用户令牌集合设置 TTL（2 倍过期时间，防止僵尸键）
      await cache.kv.expire(buildUserResetTokensKey(record.userId), ttlSeconds * 2)

      return ok(undefined)
    },

    async findByToken(token): Promise<Result<ResetTokenRecord | null, IamError>> {
      const hashResult = hashResetToken(token)
      if (!hashResult.success) {
        return hashResult
      }
      const hashedToken = hashResult.data
      const result = await cache.kv.get<ResetTokenRecord>(buildResetTokenKey(hashedToken))
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryResetTokenFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      if (!result.data) {
        return ok(null)
      }

      const record = restoreRecordDates(result.data)

      // 已使用的令牌视为无效
      if (record.used) {
        return ok(null)
      }

      return ok(record)
    },

    async incrementAttempts(id): Promise<Result<number, IamError>> {
      // 通过 ID 反向索引找到哈希令牌
      const hashResult = await cache.kv.get<string>(buildResetTokenIdKey(id))
      if (!hashResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryResetTokenFailed', { params: { message: hashResult.error.message } }),
          cause: hashResult.error,
        })
      }
      if (!hashResult.data) {
        return ok(0)
      }

      const tokenKey = buildResetTokenKey(hashResult.data)
      const recordResult = await cache.kv.get<ResetTokenRecord>(tokenKey)
      if (!recordResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryResetTokenFailed', { params: { message: recordResult.error.message } }),
          cause: recordResult.error,
        })
      }
      if (!recordResult.data) {
        return ok(0)
      }

      const record = restoreRecordDates(recordResult.data)
      const nextAttempts = record.attempts + 1

      // 获取剩余 TTL，保持原有过期时间
      const ttlResult = await cache.kv.ttl(tokenKey)
      const ttl = ttlResult.success && ttlResult.data > 0 ? ttlResult.data : 1

      const updateResult = await cache.kv.set(tokenKey, { ...record, attempts: nextAttempts }, { ex: ttl })
      if (!updateResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_updateResetTokenFailed', { params: { message: updateResult.error.message } }),
          cause: updateResult.error,
        })
      }

      return ok(nextAttempts)
    },

    async markUsed(id): Promise<Result<void, IamError>> {
      // 通过 ID 反向索引找到哈希令牌
      const hashResult = await cache.kv.get<string>(buildResetTokenIdKey(id))
      if (!hashResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryResetTokenFailed', { params: { message: hashResult.error.message } }),
          cause: hashResult.error,
        })
      }
      if (!hashResult.data) {
        return ok(undefined)
      }

      const tokenKey = buildResetTokenKey(hashResult.data)
      const recordResult = await cache.kv.get<ResetTokenRecord>(tokenKey)
      if (!recordResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryResetTokenFailed', { params: { message: recordResult.error.message } }),
          cause: recordResult.error,
        })
      }
      if (!recordResult.data) {
        return ok(undefined)
      }

      const record = restoreRecordDates(recordResult.data)

      // 获取剩余 TTL，保持原有过期时间
      const ttlResult = await cache.kv.ttl(tokenKey)
      const ttl = ttlResult.success && ttlResult.data > 0 ? ttlResult.data : 1

      const updateResult = await cache.kv.set(tokenKey, { ...record, used: true }, { ex: ttl })
      if (!updateResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_updateResetTokenFailed', { params: { message: updateResult.error.message } }),
          cause: updateResult.error,
        })
      }

      return ok(undefined)
    },

    async removeByUserId(userId): Promise<Result<void, IamError>> {
      const userKey = buildUserResetTokensKey(userId)

      // 获取该用户所有令牌哈希
      const membersResult = await cache.set_.smembers<string>(userKey)
      if (!membersResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_deleteResetTokenFailed', { params: { message: membersResult.error.message } }),
          cause: membersResult.error,
        })
      }

      // 删除每个令牌的 KV 记录和 ID 反向索引
      for (const hashedToken of membersResult.data) {
        const tokenKey = buildResetTokenKey(hashedToken)
        // 先读取记录获取 ID，用于删除反向索引
        const recordResult = await cache.kv.get<ResetTokenRecord>(tokenKey)
        if (recordResult.success && recordResult.data) {
          await cache.kv.del(buildResetTokenIdKey(recordResult.data.id))
        }
        await cache.kv.del(tokenKey)
      }

      // 删除用户令牌集合
      await cache.kv.del(userKey)

      return ok(undefined)
    },
  }

  resetTokenRepoInstance = repo
  return repo
}
