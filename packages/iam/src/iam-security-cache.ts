import type { UserRepository } from './user/iam-user-repository-user.js'
import { ok } from '@h-ai/core'
import { readIamCache } from './iam-cache.js'

/**
 * 缓存只包含验证会话所需的非秘密状态；期限每次按当前时间核验。
 * @example 模块内部上下文
 * ```ts
 * async function securityExample(repository: UserRepository) {
 *   const result = await readIamUserSecurity(repository, 'user-1')
 *   if (!result.success) return result
 *   return result.data?.enabled
 * }
 * ```
 */
export async function readIamUserSecurity(repository: UserRepository, userId: string) {
  const found = await readIamCache(`user:${userId}`, async () => {
    const row = await repository.findById(userId)
    if (!row.success)
      return row
    const user = row.data
    return ok(user
      ? {
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          enabled: user.enabled,
          accountType: user.accountType,
          accountStatus: user.accountStatus,
          accountExpiresAt: user.accountExpiresAt ? new Date(user.accountExpiresAt).getTime() : null,
          credentialVersion: user.credentialVersion ?? '',
          mustChangePassword: user.mustChangePassword,
          hasPassword: !!user.passwordHash,
          passwordUpdatedAt: user.passwordUpdatedAt?.getTime() ?? null,
        }
      : null)
  })
  return found.success
    ? ok(found.data
        ? { ...found.data, accountExpiresAt: found.data.accountExpiresAt === null ? null : new Date(found.data.accountExpiresAt), passwordUpdatedAt: found.data.passwordUpdatedAt === null ? undefined : new Date(found.data.passwordUpdatedAt), passwordHash: found.data.hasPassword ? 'present' : undefined }
        : null)
    : found
}
