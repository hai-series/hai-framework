/**
 * @h-ai/iam — 单身份 CAS 验证码状态；不依赖可过期的进程租约。
 * @module iam-authn-otp-repository-otp
 */

import type { HaiResult } from '@h-ai/core'
import type { IamNotificationContext } from '../../iam-types.js'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iamM } from '../../iam-i18n.js'
import { HaiIamError } from '../../iam-types.js'

/**
 * 发码时确定的主体；null 明确表示仅允许首次注册，缺失字段的旧挑战不能使用。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const subject: OtpSubject = { userId: 'user-1', credentialVersion: 'version-1' }
 * ```
 */
export type OtpSubject = { userId: string, credentialVersion: string } | null

/**
 * 单次发布的状态；消费保留冷却期，旧版本不能修改后续发布。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const state: OtpState = { version: crypto.randomUUID(), subject: null, code: null, attempts: 0, expiresAt: 0, cooldownUntil: 0 }
 * const hasChallenge = state.code !== null
 * ```
 */
interface OtpState {
  version: string
  subject: OtpSubject
  code: string | null
  attempts: number
  expiresAt: number
  cooldownUntil: number
}

/**
 * 验证码存储；发布、次数和消费都在同一共享 key 原子提交。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // Cache 已初始化；示例消费用户提交的验证码，不回传或记录保存值。
 * const repository = createCacheOtpRepository()
 * const result = await repository.consumeOtp({ identifier: 'alice@example.com', code: '123456', maxAttempts: 3, subject: null })
 * if (!result.success)
 *   return result
 * return result.data
 * ```
 */
export interface OtpRepository {
  /** 发布成功才允许通知；CAS 冲突拒绝，不能覆盖新代。 */
  issueOtp: (input: { identifier: string, code: string, subject: OtpSubject, expiresIn: number, resendInterval: number }) => Promise<HaiResult<IamNotificationContext>>
  /** 原子消费匹配同一主体的验证码；false 表示已计次的错误尝试，旧代或缺少挑战返回失败。 */
  consumeOtp: (input: { identifier: string, code: string, subject: OtpSubject, maxAttempts: number }) => Promise<HaiResult<boolean>>
}

let otpRepoInstance: OtpRepository | null = null

/**
 * IAM 关闭时释放仓储引用；共享状态由 cache 管理。
 * 仅重置本地引用，不删除共享存储数据。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // 所有 OTP 操作结束并关闭 IAM 后重置本地工厂引用，不删除共享挑战。
 * resetOtpRepoSingleton()
 * ```
 */
export function resetOtpRepoSingleton(): void {
  otpRepoInstance = null
}

/**
 * 创建缓存仓储；生产 cache 必须连接同一支持原子 CAS 的共享后端。
 * @returns 已初始化的内部仓储；初始化失败抛出异常，由上层子功能工厂转换为 HaiResult。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // Cache 已初始化；示例消费用户提交的验证码，不回传或记录保存值。
 * const repository = createCacheOtpRepository()
 * const result = await repository.consumeOtp({ identifier: 'alice@example.com', code: '123456', maxAttempts: 3, subject: null })
 * if (!result.success)
 *   return result
 * return result.data
 * ```
 */
export function createCacheOtpRepository(): OtpRepository {
  if (otpRepoInstance)
    return otpRepoInstance

  const keyFor = (identifier: string) => `hai:iam:otp:${identifier}`
  const failure = () => core.err(HaiIamError.REPOSITORY_ERROR, iamM('iam_securityStateFailed'))
  const invalid = () => core.err(HaiIamError.OTP_INVALID, iamM('iam_otpNotExistOrExpired'))
  otpRepoInstance = {
    async issueOtp(input) {
      const now = Date.now()
      const state: OtpState = {
        version: crypto.randomUUID(),
        subject: input.subject,
        code: input.code,
        attempts: 0,
        expiresAt: now + input.expiresIn * 1000,
        cooldownUntil: now + input.resendInterval * 1000,
      }
      const key = keyFor(input.identifier)
      const current = await cache.kv.get<OtpState>(key)
      if (!current.success)
        return failure()
      if (current.data && current.data.cooldownUntil > Date.now()) {
        return core.err(HaiIamError.OTP_RESEND_TOO_FAST, iamM('iam_otpResendTooFast', {
          params: {
            seconds: Math.ceil((current.data.cooldownUntil - Date.now()) / 1000),
          },
        }))
      }
      if (Date.now() >= state.expiresAt)
        return invalid()
      const published = await cache.kv.compareAndSwap(key, current.data ?? undefined, state, { px: Math.max(state.expiresAt, state.cooldownUntil) - Date.now() })
      if (!published.success)
        return failure()
      if (!published.data)
        return core.err(HaiIamError.SECURITY_BUSY, iamM('iam_securityBusy'))
      if (Date.now() >= state.expiresAt)
        return invalid()
      return core.ok({
        idempotencyKey: `iam-otp:${state.version}`,
        expiresAt: new Date(state.expiresAt),
      })
    },

    async consumeOtp({ identifier, code, maxAttempts, subject }) {
      const key = keyFor(identifier)
      let version: string | undefined
      for (let attempt = 0; attempt < 16; attempt++) {
        const current = await cache.kv.get<OtpState>(key)
        if (!current.success)
          return failure()
        const state = current.data
        if (!state || state.code === null || state.expiresAt <= Date.now() || state.attempts >= maxAttempts || (version && state.version !== version))
          return invalid()
        if ((state.subject === null) !== (subject === null)
          || state.subject?.userId !== subject?.userId
          || state.subject?.credentialVersion !== subject?.credentialVersion) {
          return invalid()
        }
        version = state.version
        const correct = core.string.constantTimeEqual(state.code, code)
        const attempts = state.attempts + 1
        const next: OtpState = {
          ...state,
          attempts,
          code: correct || attempts >= maxAttempts
            ? null
            : state.code,
        }
        // TTL 包含发送冷却期；消费不能删除冷却状态，也不能重建已过期的 key。
        const committed = await cache.kv.compareAndSwap(key, state, next, { keepTtl: true })
        if (!committed.success)
          return failure()
        if (!committed.data)
          continue
        if (state.expiresAt <= Date.now())
          return invalid()
        return core.ok(correct)
      }
      return core.err(HaiIamError.SECURITY_BUSY, iamM('iam_securityBusy'))
    },
  }
  return otpRepoInstance
}
