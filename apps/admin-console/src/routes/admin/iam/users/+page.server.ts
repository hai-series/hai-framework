/**
 * =============================================================================
 * Admin Console - 用户管理页面数据加载
 * =============================================================================
 */

import type { RoleWithPermissions } from '$lib/server/services/role.js'
import type { PageServerLoad } from './$types'
import { roleService } from '$lib/server/services/index.js'
import { iam } from '@hai/iam'

interface UserData {
  id: string
  username: string
  email: string
  display_name: string | null
  avatar: string | null
  status: 'active' | 'inactive' | 'suspended'
  roles: string[]
  created_at: Date
  updated_at: Date
}

export const load: PageServerLoad = async () => {
  // 从 iam 获取角色列表
  const rolesResult = await iam.authz.getAllRoles()
  const iamRoles = rolesResult.success ? rolesResult.data : []

  // 获取带权限的角色列表（用于角色分配界面）
  const roles = await roleService.list()

  // 从 iam 获取用户列表
  const usersResult = await iam.user.listUsers()
  const iamUsers = usersResult.success ? usersResult.data : []

  // 获取每个用户的角色
  const usersWithRoles: UserData[] = await Promise.all(
    iamUsers.map(async (user) => {
      // 获取用户的角色列表
      const userRolesResult = await iam.authz.getUserRoles(user.id)
      const userRoles = userRolesResult.success ? userRolesResult.data.map(r => r.name) : []

      return {
        id: user.id,
        username: user.username,
        email: user.email ?? '',
        display_name: user.displayName ?? null,
        avatar: user.avatarUrl ?? null,
        status: user.enabled ? 'active' : 'suspended' as const,
        roles: userRoles,
        created_at: user.createdAt,
        updated_at: user.updatedAt,
      }
    }),
  )

  return {
    users: usersWithRoles,
    total: usersWithRoles.length,
    roles,
    iamRoles,
  } satisfies { users: UserData[], total: number, roles: RoleWithPermissions[], iamRoles: typeof iamRoles }
}
