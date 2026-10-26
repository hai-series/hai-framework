/**
 * @h-ai/iam — 认证通用工具
 *
 * 提供认证策略中的通用校验与工具函数。
 * @module iam-authn-utils
 */

import type { HaiResult } from '@h-ai/core'
import type { UserRepository } from '../user/iam-user-repository-user.js'
import type { StoredUser } from '../user/iam-user-types.js'
import type { Credentials } from './iam-authn-types.js'
import { err, ok } from '@h-ai/core'

import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'

/**
 * 校验凭证类型并进行类型收窄
 *
 * 确保传入的凭证对象的 type 字段与预期匹配，
 * 匹配成功后通过 TypeScript 类型收窄返回具体凭证类型。
 *
 * @param credentials - 统一凭证对象
 * @param type - 预期的凭证类型（'password' | 'otp' | 'ldap'）
 * @returns 类型匹配返回收窄后的凭证；不匹配返回 INVALID_CREDENTIALS 错误
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const result = ensureCredentialType({ type: 'password', identifier: 'alice', password: 'ExampleOnly123!' }, 'password')
 * if (!result.success)
 *   return result
 * return result.data.identifier
 * ```
 */
export function ensureCredentialType<TType extends Credentials['type']>(
  credentials: Credentials,
  type: TType,
): HaiResult<Extract<Credentials, { type: TType }>> {
  if (credentials.type !== type) {
    return err(
      HaiIamError.INVALID_CREDENTIALS,
      iamM('iam_credentialTypeMismatch'),
    )
  }
  return ok(credentials as Extract<Credentials, { type: TType }>)
}

/**
 * 登录失败策略
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const policy: LoginFailurePolicy = { maxLoginAttempts: 5, lockoutDuration: 900 }
 * const maximumFailures = policy.maxLoginAttempts
 * ```
 */
export interface LoginFailurePolicy {
  /** 关闭时不累计、不锁定，忽略历史锁。 */
  lockoutEnabled?: boolean
  /** 首次失败起的固定窗口（秒），默认 86400。 */
  failureWindow?: number
  /** 最大登录失败次数 */
  maxLoginAttempts: number
  /** 锁定时长（秒） */
  lockoutDuration: number
}

/**
 * 判断账户是否被锁定
 *
 * @param user - 内部用户数据（含 lockedUntil 字段）
 * @param policy - 可选锁定开关；默认启用。
 * @returns 锁定中返回 true；未设置或已到期返回 false
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function canAttempt(user: StoredUser): boolean {
 *   return user.enabled && !isAccountLocked(user)
 * }
 * ```
 */
export function isAccountLocked(user: StoredUser, policy?: Pick<LoginFailurePolicy, 'lockoutEnabled'>): boolean {
  if (policy?.lockoutEnabled === false || !user.lockedUntil) {
    return false
  }
  return new Date() < user.lockedUntil
}

/**
 * 记录登录失败并根据策略锁定账户
 *
 * 累加失败计数，达到阈值时设置锁定截止时间。
 *
 * @param userRepository - 用户存储实例
 * @param user - 当前用户数据
 * @param policy - 登录失败策略（最大次数和锁定时长）
 * @returns 成功返回数据，失败返回业务或基础设施错误；调用方必须先判断 success。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function rejected(repository: UserRepository, user: StoredUser) {
 *   const result = await recordLoginFailure(repository, user, { maxLoginAttempts: 5, lockoutDuration: 900 })
 *   if (!result.success)
 *     return result
 *   return result.data
 * }
 * ```
 */
export async function recordLoginFailure(
  userRepository: UserRepository,
  user: StoredUser,
  policy: LoginFailurePolicy,
): Promise<HaiResult<void>> {
  return userRepository.recordLoginFailure(user.id, policy)
}

/**
 * 重置登录失败计数
 *
 * 登录成功后按当前凭据代际提交，仅启用且未锁定的账户可以清除失败状态。
 * 数据库提交失败必须中止后续会话签发，不在本地修改传入快照。
 *
 * @param userRepository - 用户存储实例
 * @param user - 当前用户数据
 * @param policy - 可选锁定开关；关闭时允许清理历史锁。
 * @returns 成功返回数据，失败返回业务或基础设施错误；调用方必须先判断 success。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function authenticated(repository: UserRepository, user: StoredUser) {
 *   const result = await resetLoginFailures(repository, user)
 *   if (!result.success)
 *     return result
 *   return result.data
 * }
 * ```
 */
export async function resetLoginFailures(
  userRepository: UserRepository,
  user: StoredUser,
  policy?: Pick<LoginFailurePolicy, 'lockoutEnabled'>,
): Promise<HaiResult<void>> {
  return userRepository.resetLoginFailures(user.id, user.credentialVersion ?? '', policy?.lockoutEnabled)
}
