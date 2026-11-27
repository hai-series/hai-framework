import type { PasswordConfig } from './iam-config.js'
import type { UserRepository } from './user/iam-user-repository-user.js'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { readIamCache } from './iam-cache.js'
import { checkPasswordState, isUserActive } from './user/iam-user-utils.js'

/**
 * 在一条共享记录内缓存账号状态与授权；账号字段只保留验签所需的非秘密信息。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function securityExample(repository: UserRepository) {
 *   const result = await readIamUserAccess(repository, 'user-1')
 *   if (!result.success) return result
 *   return result.data.account?.accountStatus
 * }
 * ```
 */
export function readIamUserAccess(repository: UserRepository, userId: string) {
  return readIamCache(`user_access:${userId}`, async () => {
    const [row, grants] = await Promise.all([
      repository.findById(userId),
      reldb.sql.query<{ role_code: string, permission_code: string | null }>(
        `SELECT r.code AS role_code, p.code AS permission_code
         FROM hai_iam_user_roles ur
         JOIN hai_iam_roles r ON r.id = ur.role_id
         LEFT JOIN hai_iam_role_permissions rp ON rp.role_id = r.id
         LEFT JOIN hai_iam_permissions p ON p.id = rp.permission_id
         WHERE ur.user_id = ?`,
        [userId],
      ),
    ])
    if (!row.success)
      return row
    if (!grants.success)
      return grants

    const user = row.data
    const account = user
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
      : null
    return core.ok({
      account,
      authorization: {
        roles: [
          ...new Set(grants.data.map(grant => grant.role_code)),
        ],
        permissions: [
          ...new Set(grants.data.flatMap(grant => grant.permission_code
            ? [grant.permission_code]
            : [])),
        ],
      },
    })
  })
}

/**
 * 一次读取签发和验签使用的账号状态及当前授权。
 * @param repository - 当前运行期的用户仓库。
 * @param password - 已解析的口令策略，省略时使用默认检查。
 * @param userId - 当前会话所关联的用户 ID。
 * @returns 凭据代际、可用状态、公开资料和角色权限；用户缺失时返回 null，账号口令受限时返回失败。
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
  const found = await readIamUserAccess(repository, userId)
  if (!found.success)
    return found
  const { account, authorization } = found.data
  if (!account)
    return core.ok(null)

  const user = {
    ...account,
    accountExpiresAt: account.accountExpiresAt === null
      ? null
      : new Date(account.accountExpiresAt),
    passwordUpdatedAt: account.passwordUpdatedAt === null
      ? undefined
      : new Date(account.passwordUpdatedAt),
    passwordHash: account.hasPassword ? 'present' : undefined,
  }
  const passwordState = checkPasswordState(user, password)
  if (!passwordState.success)
    return passwordState

  return core.ok({
    version: account.credentialVersion,
    available: isUserActive(user),
    profile: { username: account.username, displayName: account.displayName, avatarUrl: account.avatarUrl },
    authorization,
  })
}
