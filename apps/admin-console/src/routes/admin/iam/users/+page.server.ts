/**
 * =============================================================================
 * Admin Console - 用户管理页面数据加载
 * =============================================================================
 */

import type { RoleWithPermissions } from '$lib/server/services/role.js'
import type { UserWithRoles } from '$lib/server/services/user.js'
import type { PageServerLoad } from './$types'
import { roleService, userService } from '$lib/server/services/index.js'

export const load: PageServerLoad = async () => {
  const [usersResult, roles] = await Promise.all([
    userService.list(),
    roleService.list(),
  ])

  return {
    users: usersResult.users,
    total: usersResult.total,
    roles,
  } satisfies { users: UserWithRoles[], total: number, roles: RoleWithPermissions[] }
}
