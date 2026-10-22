/**
 * @h-ai/iam — 单身份 CAS 验证码状态；不依赖可过期的进程租约。
 * @module iam-authn-otp-repository-otp
 */
import type { HaiResult } from '@h-ai/core'
import type { IamNotificationContext } from '../../iam-types.js'
import { cache } from '@h-ai/cache'
import { core, err, ok } from '@h-ai/core'
import { iamM } from '../../iam-i18n.js'
import { HaiIamError } from '../../iam-types.js'

/** 单次发布的状态；消费保留冷却期，旧版本不能修改后续发布。 */
interface OtpState {
  version: string
  code: string | null
  attempts: number
  expiresAt: number
  cooldownUntil: number
}

/**
 * 验证码存储；发布、次数和消费都在同一共享 key 原子提交。
 * @example `await repository.consumeOtp(identifier, code, 5)`
 */
export interface OtpRepository {
  /** 发布成功才允许通知；CAS 冲突拒绝，不能覆盖新代。 */
  issueOtp: (input: { identifier: string, code: string, expiresIn: number, resendInterval: number }) => Promise<HaiResult<IamNotificationContext>>
  /** 比较验证码并原子消费；错误次数的 CAS 只重试同一代。 */
  consumeOtp: (identifier: string, code: string, maxAttempts: number) => Promise<HaiResult<void>>
}

/**
 * 邮箱转小写，电话移除分隔符；同一身份共用发送与消费状态。
 * @example `normalizeOtpIdentifier(' User@Example.com ') === 'user@example.com'`
 */
export function normalizeOtpIdentifier(identifier: string): string {
  const trimmed = identifier.trim()
  return trimmed.includes('@') ? trimmed.toLowerCase() : trimmed.replace(/[\s-]/g, '')
}

let otpRepoInstance: OtpRepository | null = null

/**
 * IAM 关闭时释放仓储引用；共享状态由 cache 管理。
 * @example `resetOtpRepoSingleton()`
 */
export function resetOtpRepoSingleton(): void {
  otpRepoInstance = null
}

/**
 * 创建缓存仓储；生产 cache 必须连接同一支持原子 CAS 的共享后端。
 * @example `const repository = createCacheOtpRepository()`
 */
export function createCacheOtpRepository(): OtpRepository {
  if (otpRepoInstance)
    return otpRepoInstance

  const keyFor = (identifier: string) => `hai:iam:otp:${normalizeOtpIdentifier(identifier)}`
  const failure = () => err(HaiIamError.REPOSITORY_ERROR, iamM('iam_securityStateFailed'))
  const invalid = () => err(HaiIamError.OTP_INVALID, iamM('iam_otpNotExistOrExpired'))
  otpRepoInstance = {
    async issueOtp(input) {
      const now = Date.now()
      const state: OtpState = {
        version: crypto.randomUUID(),
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
        return err(HaiIamError.OTP_RESEND_TOO_FAST, iamM('iam_otpResendTooFast', { params: { seconds: Math.ceil((current.data.cooldownUntil - Date.now()) / 1000) } }))
      }
      if (Date.now() >= state.expiresAt)
        return invalid()
      const published = await cache.kv.compareAndSwap(key, current.data ?? undefined, state, { px: Math.max(state.expiresAt, state.cooldownUntil) - Date.now() })
      if (!published.success)
        return failure()
      if (!published.data)
        return err(HaiIamError.SECURITY_BUSY, iamM('iam_securityBusy'))
      if (Date.now() >= state.expiresAt)
        return invalid()
      return ok({ idempotencyKey: `iam-otp:${state.version}`, expiresAt: new Date(state.expiresAt) })
    },

    async consumeOtp(identifier, code, maxAttempts) {
      const key = keyFor(identifier)
      let version: string | undefined
      for (let attempt = 0; attempt < 16; attempt++) {
        const current = await cache.kv.get<OtpState>(key)
        if (!current.success)
          return failure()
        const state = current.data
        if (!state || state.code === null || state.expiresAt <= Date.now() || state.attempts >= maxAttempts || (version && state.version !== version))
          return invalid()
        version = state.version
        const correct = core.string.constantTimeEqual(state.code, code)
        const attempts = state.attempts + 1
        const next: OtpState = { ...state, attempts, code: correct || attempts >= maxAttempts ? null : state.code }
        // TTL 包含发送冷却期；消费不能删除冷却状态，也不能重建已过期的 key。
        const committed = await cache.kv.compareAndSwap(key, state, next, { keepTtl: true })
        if (!committed.success)
          return failure()
        if (!committed.data)
          continue
        if (!correct || state.expiresAt <= Date.now())
          return err(HaiIamError.OTP_INVALID, iamM('iam_otpWrong'))
        return ok(undefined)
      }
      return err(HaiIamError.SECURITY_BUSY, iamM('iam_securityBusy'))
    },
  }
  return otpRepoInstance
}
