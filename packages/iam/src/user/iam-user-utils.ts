/**
 * =============================================================================
 * @hai/iam - 用户工具函数
 * =============================================================================
 *
 * 提供用户实体的转换与去敏处理能力。
 *
 * @module user/iam-user-utils
 * =============================================================================
 */

import type { StoredUser, User } from './iam-user-types.js'

/**
 * 将 StoredUser 转换为 User（移除敏感信息）
 *
 * 去除密码哈希、登录失败计数、锁定时间等内部字段，
 * 仅保留前端安全的用户信息。
 *
 * @param storedUser - 包含敏感信息的内部用户数据
 * @returns 去敏后的用户信息
 */
export function toUser(storedUser: StoredUser): User {
  return {
    id: storedUser.id,
    username: storedUser.username,
    email: storedUser.email,
    phone: storedUser.phone,
    displayName: storedUser.displayName,
    avatarUrl: storedUser.avatarUrl,
    enabled: storedUser.enabled,
    emailVerified: storedUser.emailVerified,
    phoneVerified: storedUser.phoneVerified,
    createdAt: storedUser.createdAt,
    updatedAt: storedUser.updatedAt,
    metadata: storedUser.metadata,
  }
}
