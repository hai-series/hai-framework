/**
 * @h-ai/iam — OTP 存储实现
 *
 * 基于 @h-ai/cache 的 OTP 存储实现。
 * @module iam-authn-otp-repository-otp
 */

import type { HaiResult } from '@h-ai/core'
import { cache } from '@h-ai/cache'
import { err, ok } from '@h-ai/core'

import { iamM } from '../../iam-i18n.js'
import { HaiIamError } from '../../iam-types.js'

// ─── OTP 存储接口与类型 ───

/**
 * OTP 记录
 */
export interface OtpRecord {
  /** 标识符（邮箱/手机号） */
  identifier: string
  /** 验证码 */
  code: string
  /** 过期时间 */
  expiresAt: Date
  /** 尝试次数 */
  attempts: number
  /** 创建时间 */
  createdAt: Date
}

/**
 * OTP 存储接口
 */
export interface OtpRepository {
  /**
   * 存储验证码
   */
  saveOtp: (identifier: string, code: string, expiresIn: number) => Promise<HaiResult<void>>

  /**
   * 获取验证码
   */
  fetchOtp: (identifier: string) => Promise<HaiResult<OtpRecord | null>>

  /**
   * 增加尝试次数
   */
  incrementOtpAttempts: (identifier: string) => Promise<HaiResult<number>>

  /**
   * 删除验证码
   */
  removeOtp: (identifier: string) => Promise<HaiResult<void>>
}

// ─── 缓存键构建 ───

/** OTP 缓存键前缀 */
const OTP_KEY_PREFIX = 'hai:iam:otp:'

/**
 * 构建 OTP 缓存 key
 *
 * @param identifier - 标识符（邮箱/手机号）
 * @returns 格式：`iam:otp:{identifier}`
 */
function buildOtpKey(identifier: string): string {
  return `${OTP_KEY_PREFIX}${identifier}`
}

/**
 * 修复从缓存反序列化后的日期字段
 *
 * 缓存存储后日期可能为字符串，需要重新转为 Date 对象。
 */
function restoreOtpDates(record: OtpRecord): OtpRecord {
  return {
    ...record,
    expiresAt: record.expiresAt instanceof Date ? record.expiresAt : new Date(record.expiresAt),
    createdAt: record.createdAt instanceof Date ? record.createdAt : new Date(record.createdAt),
  }
}

// ─── 缓存实现 ───

/** OTP 存储单例缓存 */
let otpRepoInstance: OtpRepository | null = null

/**
 * 重置 OTP 存储单例
 *
 * 在 iam.close() 时调用，释放对旧 cache 实例的引用。
 */
export function resetOtpRepoSingleton(): void {
  otpRepoInstance = null
}

/**
 * 创建基于缓存的 OTP 存储实例
 *
 * 单例模式：重复调用返回缓存实例。
 *
 * @returns OTP 存储接口实现
 */
export function createCacheOtpRepository(): OtpRepository {
  if (otpRepoInstance)
    return otpRepoInstance

  const repo: OtpRepository = {
    async saveOtp(identifier, code, expiresIn): Promise<HaiResult<void>> {
      const now = Date.now()
      const record: OtpRecord = {
        identifier,
        code,
        expiresAt: new Date(now + expiresIn * 1000),
        attempts: 0,
        createdAt: new Date(now),
      }

      // 直接 set 覆盖（cache 天然支持 upsert 语义）
      const result = await cache.kv.set(buildOtpKey(identifier), record, { ex: expiresIn })
      if (!result.success) {
        return err(
          HaiIamError.REPOSITORY_ERROR,
          iamM('iam_saveOtpFailed', { params: { message: result.error.message } }),
          result.error,
        )
      }

      return ok(undefined)
    },

    async fetchOtp(identifier): Promise<HaiResult<OtpRecord | null>> {
      const result = await cache.kv.get<OtpRecord>(buildOtpKey(identifier))
      if (!result.success) {
        return err(
          HaiIamError.REPOSITORY_ERROR,
          iamM('iam_queryOtpFailed', { params: { message: result.error.message } }),
          result.error,
        )
      }

      if (!result.data) {
        return ok(null)
      }

      return ok(restoreOtpDates(result.data))
    },

    async incrementOtpAttempts(identifier): Promise<HaiResult<number>> {
      const otpKey = buildOtpKey(identifier)
      const current = await cache.kv.get<OtpRecord>(otpKey)
      if (!current.success) {
        return err(
          HaiIamError.REPOSITORY_ERROR,
          iamM('iam_queryOtpFailed', { params: { message: current.error.message } }),
          current.error,
        )
      }

      if (!current.data) {
        return ok(0)
      }

      const record = restoreOtpDates(current.data)
      const nextAttempts = record.attempts + 1

      // 获取剩余 TTL，保持原有过期时间
      const ttlResult = await cache.kv.ttl(otpKey)
      const ttl = ttlResult.success && ttlResult.data > 0 ? ttlResult.data : 1

      const updateResult = await cache.kv.set(otpKey, { ...record, attempts: nextAttempts }, { ex: ttl })
      if (!updateResult.success) {
        return err(
          HaiIamError.REPOSITORY_ERROR,
          iamM('iam_updateOtpAttemptsFailed', { params: { message: updateResult.error.message } }),
          updateResult.error,
        )
      }

      return ok(nextAttempts)
    },

    async removeOtp(identifier): Promise<HaiResult<void>> {
      const result = await cache.kv.del(buildOtpKey(identifier))
      if (!result.success) {
        return err(
          HaiIamError.REPOSITORY_ERROR,
          iamM('iam_deleteOtpFailed', { params: { message: result.error.message } }),
          result.error,
        )
      }
      return ok(undefined)
    },
  }

  otpRepoInstance = repo
  return repo
}
