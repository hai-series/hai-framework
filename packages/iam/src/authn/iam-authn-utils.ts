/**
 * =============================================================================
 * @hai/iam - 认证通用工具
 * =============================================================================
 *
 * 提供认证策略中的通用校验与工具函数。
 *
 * @module authn/iam-authn-utils
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { IamError } from '../iam-core-types.js'
import type { UserRepository } from '../user/iam-user-repository-user.js'
import type { StoredUser } from '../user/iam-user-types.js'
import type { Credentials } from './iam-authn-types.js'
import { err, ok } from '@hai/core'

import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

/**
 * 校验凭证类型并进行类型收窄
 */
export function ensureCredentialType<TType extends Credentials['type']>(
  credentials: Credentials,
  type: TType,
): Result<Extract<Credentials, { type: TType }>, IamError> {
  if (credentials.type !== type) {
    return err({
      code: IamErrorCode.INVALID_CREDENTIALS,
      message: iamM('iam_credentialTypeMismatch'),
    })
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
 */
export function isAccountLocked(user: StoredUser): boolean {
  if (!user.lockedUntil) {
    return false
  }
  return new Date() < user.lockedUntil
}

/**
 * 记录登录失败并根据策略锁定账户
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
