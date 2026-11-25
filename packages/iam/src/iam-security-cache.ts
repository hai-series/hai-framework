import type { PasswordConfig } from './iam-config.js'
import type { UserRepository } from './user/iam-user-repository-user.js'
import { core } from '@h-ai/core'
import { readIamCache } from './iam-cache.js'
import { checkPasswordState, isUserActive } from './user/iam-user-utils.js'

/**
 * 缓存只包含验证会话所需的非秘密状态；期限每次按当前时间核验。
 * @example 模块内部上下文
 * ```ts
 * async function securityExample(repository: UserRepository) {
 *   const result = await readIamUserSecurity(repository, 'user-1')
 *   if (!result.success) return result
 *   return result.data?.accountStatus
 * }
 * ```
 */
export async function readIamUserSecurity(repository: UserRepository, userId: string) {
  // 状态投影升级后不复用包含旧启用开关的缓存；写入仍走同一共享代际栅栏。
  const found = await readIamCache(`user:v2:${userId}`, async () => {
    const row = await repository.findById(userId)
    if (!row.success)
      return row
    const user = row.data
    return core.ok(user
      ? {
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          accountType: user.accountType,
          accountStatus: user.accountStatus,
          accountExpiresAt: user.accountExpiresAt
            ? new Date(user.accountExpiresAt).getTime()
            : null,
          credentialVersion: user.credentialVersion ?? '',
          mustChangePassword: user.mustChangePassword,
          hasPassword: !!user.passwordHash,
          passwordUpdatedAt: user.passwordUpdatedAt?.getTime() ?? null,
        }
      : null)
  })
  return found.success
    ? core.ok(found.data
        ? {
            ...found.data,
            accountExpiresAt: found.data.accountExpiresAt === null
              ? null
              : new Date(found.data.accountExpiresAt),
            passwordUpdatedAt: found.data.passwordUpdatedAt === null
              ? undefined
              : new Date(found.data.passwordUpdatedAt),
            passwordHash: found.data.hasPassword ? 'present' : undefined,
          }
        : null)
    : found
}

/**
 * 读取签发和验证会话使用的凭据代际与账号状态。
 * @param repository - 当前运行期的用户仓库。
 * @param password - 已解析的口令策略，省略时使用默认检查。
 * @param userId - 当前会话所关联的用户 ID。
 * @returns 凭据代际、账号可用状态和公开资料；用户缺失时返回 null，账号口令受限时返回失败。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function credentialVersion(repository: UserRepository) {
 *   const result = await readIamSessionCredential(repository, undefined, 'user-1')
 *   if (!result.success) return result
 *   return result.data?.version
 * }
 * ```
 */
export async function readIamSessionCredential(repository: UserRepository, password: PasswordConfig | undefined, userId: string) {
  const found = await readIamUserSecurity(repository, userId)
  if (!found.success)
    return found
  if (found.data) {
    const passwordState = checkPasswordState(found.data, password)
    if (!passwordState.success)
      return passwordState
  }
  return core.ok(found.data
    ? {
        version: found.data.credentialVersion ?? '',
        available: isUserActive(found.data),
        profile: { username: found.data.username, displayName: found.data.displayName, avatarUrl: found.data.avatarUrl },
      }
    : null)
}
