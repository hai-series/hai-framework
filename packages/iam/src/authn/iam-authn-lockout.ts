/** IAM 账号的跨节点固定失败窗口与锁定状态。 */

import type { HaiResult } from '@h-ai/core'
import type { StoredUser } from '../user/iam-user-types.js'
import { randomUUID } from 'node:crypto'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'

/**
 * 同一账号在密码、OTP 与 LDAP 等鉴别方式中共用的失败计数策略。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const policy: LoginFailurePolicy = { maxLoginAttempts: 5, lockoutDuration: 900 }
 * const maximumFailures = policy.maxLoginAttempts
 * ```
 */
export interface LoginFailurePolicy {
  /** 关闭时跳过锁定状态读取和计数。 */
  lockoutEnabled?: boolean
  /** 从首次失败起算的固定窗口，单位秒，默认 86400。 */
  failureWindow?: number
  /** 固定窗口内触发锁定的失败次数。 */
  maxLoginAttempts: number
  /** 锁定时长，单位秒。 */
  lockoutDuration: number
}

/**
 * 单一账号代际的失败记录。三个时间均为 Unix 毫秒。
 * @example 模块内部上下文
 * ```ts
 * const state: LoginFailureState = { revision: 'revision-1', count: 1, firstFailedAt: 1000, lastFailedAt: 1000, lockedUntil: null }
 * ```
 */
interface LoginFailureState {
  revision: string
  count: number
  firstFailedAt: number
  lastFailedAt: number
  lockedUntil: number | null
}

const maxCasAttempts = 16

function failureKey(user: StoredUser): string {
  return `hai:iam:login_failures:${user.id}:${user.loginLockoutVersion}`
}

function cacheFailure(cause?: unknown): HaiResult<never> {
  return core.err(HaiIamError.REPOSITORY_ERROR, iamM('iam_securityStateFailed'), cause)
}

function locked(): HaiResult<never> {
  return core.err(HaiIamError.USER_LOCKED, iamM('iam_accountLocked'))
}

async function readFailureState(key: string): Promise<HaiResult<LoginFailureState | null>> {
  const result = await cache.kv.get<LoginFailureState>(key)
  if (!result.success)
    return cacheFailure(result.error)
  const state = result.data
  if (state !== null && (typeof state.revision !== 'string' || !state.revision
    || !Number.isSafeInteger(state.count) || state.count < 1
    || !Number.isSafeInteger(state.firstFailedAt) || state.firstFailedAt < 0
    || !Number.isSafeInteger(state.lastFailedAt) || state.lastFailedAt < state.firstFailedAt
    || (state.lockedUntil !== null && (!Number.isSafeInteger(state.lockedUntil) || state.lockedUntil < state.lastFailedAt)))) {
    return cacheFailure()
  }
  return result
}

/**
 * 鉴别前检查当前代际上的锁定。缓存读取失败时拒绝继续鉴别。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function canAttempt(user: StoredUser) {
 *   const result = await checkAccountLock(user)
 *   return result.success
 * }
 * ```
 */
export async function checkAccountLock(user: StoredUser, policy?: Pick<LoginFailurePolicy, 'lockoutEnabled'>): Promise<HaiResult<void>> {
  if (policy?.lockoutEnabled === false)
    return core.ok(undefined)
  const result = await readFailureState(failureKey(user))
  if (!result.success)
    return result
  if ((result.data?.lockedUntil ?? 0) > Date.now())
    return locked()
  return core.ok(undefined)
}

/**
 * 在同一个共享键原子累计失败次数并设置锁定截止时间。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function rejected(user: StoredUser) {
 *   return recordLoginFailure(user, { maxLoginAttempts: 5, lockoutDuration: 900 })
 * }
 * ```
 */
export async function recordLoginFailure(user: StoredUser, policy: LoginFailurePolicy): Promise<HaiResult<void>> {
  if (policy.lockoutEnabled === false)
    return core.ok(undefined)
  const key = failureKey(user)
  const windowMs = (policy.failureWindow ?? 86400) * 1000
  for (let attempt = 0; attempt < maxCasAttempts; attempt++) {
    const result = await readFailureState(key)
    if (!result.success)
      return result
    const state = result.data
    const now = Date.now()
    if ((state?.lockedUntil ?? 0) > now)
      return core.ok(undefined)

    // 锁到期后重新计数。未锁定的失败沿用首次失败的固定窗口。
    const current = state?.lockedUntil === null && state.firstFailedAt + windowMs > now
      ? state
      : null
    const firstFailedAt = current?.firstFailedAt ?? now
    const lastFailedAt = Math.max(current?.lastFailedAt ?? now, now)
    const count = (current?.count ?? 0) + 1
    const lockedUntil = count >= policy.maxLoginAttempts
      ? lastFailedAt + policy.lockoutDuration * 1000
      : null
    const deadline = lockedUntil ?? firstFailedAt + windowMs
    if (!Number.isSafeInteger(deadline))
      return cacheFailure()
    const remaining = deadline - Date.now()
    if (remaining <= 0)
      continue

    const next: LoginFailureState = {
      revision: randomUUID(),
      count,
      firstFailedAt,
      lastFailedAt,
      lockedUntil,
    }
    const committed = await cache.kv.compareAndSwap(key, state ?? undefined, next, { px: remaining })
    if (!committed.success)
      return cacheFailure(committed.error)
    if (committed.data)
      return core.ok(undefined)
  }
  return core.err(HaiIamError.SECURITY_BUSY, iamM('iam_securityBusy'))
}

/**
 * 清除成功鉴别的失败记录。调用方须持有账号行锁并核对凭据代际。
 * 识别 CAS 竞争中已出现的有效锁，拒绝清除或继续签发凭据。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function afterVerified(user: StoredUser, lockoutEnabled: boolean) {
 *   return clearLoginFailures(user, lockoutEnabled)
 * }
 * ```
 */
export async function clearLoginFailures(user: StoredUser, lockoutEnabled: boolean): Promise<HaiResult<void>> {
  if (!lockoutEnabled)
    return core.ok(undefined)
  const key = failureKey(user)
  for (let attempt = 0; attempt < maxCasAttempts; attempt++) {
    const result = await readFailureState(key)
    if (!result.success)
      return result
    const state = result.data
    if (!state)
      return core.ok(undefined)
    if ((state.lockedUntil ?? 0) > Date.now())
      return locked()
    const cleared = await cache.kv.compareAndSwap(key, state, undefined)
    if (!cleared.success)
      return cacheFailure(cleared.error)
    if (cleared.data)
      return core.ok(undefined)
  }
  return core.err(HaiIamError.SECURITY_BUSY, iamM('iam_securityBusy'))
}
