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
/** OTP 尝试次数键前缀（单独存储以支持原子 incr） */
const OTP_ATTEMPTS_KEY_PREFIX = 'hai:iam:otp:attempts:'

/**
 * 规范化标识符：邮箱转小写，电话号移除分隔符，避免同一身份因大小写 / 空格产生不同缓存键。
 */
export function normalizeOtpIdentifier(identifier: string): string {
  const trimmed = identifier.trim()
  if (trimmed.includes('@'))
    return trimmed.toLowerCase()
  // 电话：移除空格和连字符
  return trimmed.replace(/[\s-]/g, '')
}

/**
 * 构建 OTP 缓存 key
 *
 * @param identifier - 标识符（邮箱/手机号）
 * @returns 格式：`iam:otp:{identifier}`
 */
function buildOtpKey(identifier: string): string {
  return `${OTP_KEY_PREFIX}${normalizeOtpIdentifier(identifier)}`
}

/**
 * 构建 OTP 尝试次数缓存 key
 */
function buildOtpAttemptsKey(identifier: string): string {
  return `${OTP_ATTEMPTS_KEY_PREFIX}${normalizeOtpIdentifier(identifier)}`
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
        identifier: normalizeOtpIdentifier(identifier),
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

      // 同步重置尝试计数器（避免新生成的 OTP 复用旧计数）
      await cache.kv.del(buildOtpAttemptsKey(identifier))

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

      // 合并存储的尝试次数（独立键，支持原子 incr）
      const attemptsResult = await cache.kv.get<number>(buildOtpAttemptsKey(identifier))
      const attempts = attemptsResult.success && typeof attemptsResult.data === 'number'
        ? attemptsResult.data
        : 0

      const restored = restoreOtpDates(result.data)
      return ok({ ...restored, attempts })
    },

    async incrementOtpAttempts(identifier): Promise<HaiResult<number>> {
      const otpKey = buildOtpKey(identifier)
      const attemptsKey = buildOtpAttemptsKey(identifier)

      // 确认 OTP 本身存在
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

      // 原子递增，避免并发竞态导致尝试次数统计失真
      const incrResult = await cache.kv.incr(attemptsKey)
      if (!incrResult.success) {
        return err(
          HaiIamError.REPOSITORY_ERROR,
          iamM('iam_updateOtpAttemptsFailed', { params: { message: incrResult.error.message } }),
          incrResult.error,
        )
      }

      // 同步对齐 OTP 键剩余 TTL，确保 attempts 与 OTP 同时过期
      const ttlResult = await cache.kv.ttl(otpKey)
      const ttl = ttlResult.success && ttlResult.data > 0 ? ttlResult.data : 1
      await cache.kv.expire(attemptsKey, ttl)

      return ok(incrResult.data)
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
      // 同步清理尝试计数键
      await cache.kv.del(buildOtpAttemptsKey(identifier))
      return ok(undefined)
    },
  }

  otpRepoInstance = repo
  return repo
}
