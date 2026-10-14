/** API Key 权限收敛：始终取主体授权与密钥 scopes 的交集。 */
import type { Session } from '../../session/iam-session-types.js'

function covers(grant: string, permission: string): boolean {
  return grant === '*' || grant === permission || (grant.endsWith(':*') && permission.startsWith(grant.slice(0, -1)))
}

/** 仅显式全范围 key 保留角色入口；受限 key 通过操作权限授权，防止角色绕过 scopes。 */
export function applyApiKeyScopes<T extends Pick<Session, 'roles' | 'permissions'>>(access: T, scopes: readonly string[]): T {
  const permissions = new Set<string>()
  for (const permission of access.permissions) {
    for (const scope of scopes) {
      if (covers(permission, scope))
        permissions.add(scope)
      else if (covers(scope, permission))
        permissions.add(permission)
    }
  }
  return { ...access, roles: scopes.includes('*') ? access.roles : [], permissions: [...permissions] }
}
