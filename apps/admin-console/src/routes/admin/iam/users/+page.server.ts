/**
 * =============================================================================
 * Admin Console - 用户管理页面数据加载
 * =============================================================================
 */

import type { RoleWithPermissions } from '$lib/server/services/role.js'
import type { PageServerLoad } from './$types'
import { roleService } from '$lib/server/services/index.js'
import { iam } from '@h-ai/iam'

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

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

export const load: PageServerLoad = async ({ url }) => {
  const page = parsePositiveInt(url.searchParams.get('page'), 1)
  const pageSize = parsePositiveInt(url.searchParams.get('pageSize'), 20)

  // 从 iam 获取角色列表
  const rolesResult = await iam.authz.getAllRoles({ page: 1, pageSize: 200 })
  const iamRoles = rolesResult.success ? rolesResult.data.items : []

  // 获取带权限的角色列表（用于角色分配界面）
  const roles = await roleService.list()

  // 从 iam 获取用户列表
  const usersResult = await iam.user.listUsers({ page, pageSize })
  const iamUsers = usersResult.success ? usersResult.data.items : []
  const total = usersResult.success ? usersResult.data.total : 0

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
    total,
    page,
    pageSize,
    roles,
    iamRoles,
  } satisfies { users: UserData[], total: number, page: number, pageSize: number, roles: RoleWithPermissions[], iamRoles: typeof iamRoles }
}
