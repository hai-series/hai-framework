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
