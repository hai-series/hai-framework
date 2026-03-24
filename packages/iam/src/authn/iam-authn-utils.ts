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
 */
export interface LoginFailurePolicy {
  /** 最大登录失败次数 */
  maxLoginAttempts: number
  /** 锁定时长（秒） */
  lockoutDuration: number
}

/**
 * 判断账户是否被锁定
 *
 * @param user - 内部用户数据（含 lockedUntil 字段）
 * @returns 锁定中返回 true；未设置或已到期返回 false
 */
export function isAccountLocked(user: StoredUser): boolean {
  if (!user.lockedUntil) {
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
 */
export async function recordLoginFailure(
  userRepository: UserRepository,
  user: StoredUser,
  policy: LoginFailurePolicy,
): Promise<void> {
  const failedCount = (user.loginFailedCount || 0) + 1
  const updateData: Partial<StoredUser> = {
    loginFailedCount: failedCount,
    lastLoginFailedAt: new Date(),
  }

  if (failedCount >= policy.maxLoginAttempts) {
    updateData.lockedUntil = new Date(Date.now() + policy.lockoutDuration * 1000)
  }

  await userRepository.updateById(user.id, updateData)
}

/**
 * 重置登录失败计数
 *
 * 登录成功后调用，将失败计数、最后失败时间和锁定截止时间清零。
 * 若用户没有失败记录则跳过更新。
 *
 * @param userRepository - 用户存储实例
 * @param user - 当前用户数据
 */
export async function resetLoginFailures(
  userRepository: UserRepository,
  user: StoredUser,
): Promise<void> {
  if (user.loginFailedCount && user.loginFailedCount > 0) {
    await userRepository.updateById(user.id, {
      loginFailedCount: 0,
      lastLoginFailedAt: undefined,
      lockedUntil: undefined,
    })
  }
}
