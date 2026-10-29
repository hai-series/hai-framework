/**
 * @h-ai/iam — 用户工具函数
 *
 * 提供用户实体的转换与去敏处理能力。
 * @module iam-user-utils
 */

import type { HaiResult } from '@h-ai/core'
import type { PasswordConfig } from '../iam-config.js'
import type { StoredUser, User } from './iam-user-types.js'
import { err, ok } from '@h-ai/core'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'

/**
 * 首次/过期口令不能授权普通业务；验证旧密码后的 renewPassword 不使用此门禁。
 * @example 模块内部上下文
 * ```ts
 * function check(user: StoredUser, policy: PasswordConfig) { return checkPasswordState(user, policy) }
 * ```
 */
export function checkPasswordState(user: Pick<StoredUser, 'mustChangePassword' | 'passwordHash' | 'passwordUpdatedAt'>, policy?: PasswordConfig): HaiResult<void> {
  if (policy?.requireInitialChange && user.mustChangePassword)
    return err(HaiIamError.PASSWORD_CHANGE_REQUIRED, iamM('iam_passwordChangeRequired'))
  const days = policy?.expirationDays ?? 0
  if (days > 0 && user.passwordHash && (!user.passwordUpdatedAt || user.passwordUpdatedAt.getTime() + days * 86400_000 <= Date.now()))
    return err(HaiIamError.PASSWORD_EXPIRED, iamM('iam_passwordExpired'))
  return ok(undefined)
}

/**
 * 账号状态与到期时间在所有鉴别方式和持久凭据读取中共用。
 * @example 模块内部上下文
 * ```ts
 * function allowed(user: User) { return isUserActive(user) }
 * ```
 */
export function isUserActive(user: Pick<User, 'accountType' | 'accountStatus' | 'accountExpiresAt'>): boolean {
  return user.accountStatus === 'active'
    && (user.accountType !== 'temporary' || !!user.accountExpiresAt)
    && (!user.accountExpiresAt || new Date(user.accountExpiresAt).getTime() > Date.now())
}

/**
 * 仅接受公开账号枚举与合法日期，不把无期限的临时账号保存为可登录账号。
 * @example 模块内部上下文
 * ```ts
 * const result = validateAccountPolicy({ accountType: 'temporary', accountExpiresAt: new Date(Date.now() + 3600000) }); if (!result.success) result.error.code
 * ```
 */
export function validateAccountPolicy(user: Partial<Pick<User, 'accountType' | 'accountStatus' | 'accountExpiresAt'>>): HaiResult<void> {
  if ((user.accountType !== undefined && !['permanent', 'temporary'].includes(user.accountType))
    || (user.accountStatus !== undefined && !['active', 'dormant', 'closed'].includes(user.accountStatus))
    || (user.accountExpiresAt != null && (!(user.accountExpiresAt instanceof Date) || !Number.isFinite(user.accountExpiresAt.getTime())))
    || (user.accountType === 'temporary' && !user.accountExpiresAt)) {
    return err(HaiIamError.INVALID_ARGUMENT, iamM('iam_accountPolicyInvalid'))
  }
  return ok(undefined)
}

/**
 * 将 StoredUser 转换为 User（移除敏感信息）
 *
 * 去除密码哈希、登录失败计数、锁定时间等内部字段，
 * 仅保留前端安全的用户信息。
 *
 * @param storedUser - 包含敏感信息的内部用户数据
 * @returns 去敏后的用户信息
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function response(stored: StoredUser): User {
 *   return toUser(stored) // 投影白名单，不将密码哈希与凭据代际返回给调用端。
 * }
 * ```
 */
export function toUser(storedUser: StoredUser): User {
  return {
    id: storedUser.id,
    username: storedUser.username,
    email: storedUser.email,
    phone: storedUser.phone,
    displayName: storedUser.displayName,
    avatarUrl: storedUser.avatarUrl,
    accountType: storedUser.accountType ?? 'permanent',
    accountStatus: storedUser.accountStatus ?? 'active',
    accountExpiresAt: storedUser.accountExpiresAt ?? null,
    lastLoginAt: storedUser.lastLoginAt ?? null,
    mustChangePassword: storedUser.mustChangePassword ?? false,
    emailVerified: storedUser.emailVerified,
    phoneVerified: storedUser.phoneVerified,
    createdAt: storedUser.createdAt,
    updatedAt: storedUser.updatedAt,
    metadata: storedUser.metadata,
  }
}
