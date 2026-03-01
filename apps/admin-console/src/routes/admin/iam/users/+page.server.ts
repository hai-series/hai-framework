/**
 * =============================================================================
 * Admin Console - 用户管理页面数据加载
 * =============================================================================
 */

import type { PageServerLoad } from './$types'
import { roleService } from '$lib/server/services/index.js'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { error } from '@sveltejs/kit'

interface UserData {
  id: string
  username: string
  email: string
  display_name: string | null
  avatar: string | null
  status: 'active' | 'inactive' | 'suspended'
  roles: string[]
  roleIds: string[]
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

export const load: PageServerLoad = async ({ url, locals }) => {
  // 权限检查：user:read
  if (!kit.guard.hasPermission(locals.session, 'user:read')) {
    error(403, { message: 'Forbidden' })
  }

  const page = parsePositiveInt(url.searchParams.get('page'), 1)
  const pageSize = Math.min(parsePositiveInt(url.searchParams.get('pageSize'), 20), 100)
  const search = url.searchParams.get('search') || undefined
  const statusParam = url.searchParams.get('status') || undefined
  const roleFilter = url.searchParams.get('role') || undefined

  // 将前端 status 值映射为 enabled 布尔值
  let enabled: boolean | undefined
  if (statusParam === 'active')
    enabled = true
  else if (statusParam === 'suspended')
    enabled = false

  // 角色列表 + 用户列表并行获取
  const [roles, usersResult] = await Promise.all([
    roleService.list(),
    iam.user.listUsers({ page, pageSize, search, enabled }),
  ])
  const iamUsers = usersResult.success ? usersResult.data.items : []
  const total = usersResult.success ? usersResult.data.total : 0

  // 获取每个用户的角色
  const usersWithRoles: UserData[] = await Promise.all(
    iamUsers.map(async (user) => {
      const userRolesResult = await iam.authz.getUserRoles(user.id)
      const userRoles = userRolesResult.success ? userRolesResult.data : []

      return {
        id: user.id,
        username: user.username,
        email: user.email ?? '',
        display_name: user.displayName ?? null,
        avatar: user.avatarUrl ?? null,
        status: user.enabled ? 'active' : 'suspended' as const,
        roles: userRoles.map(r => r.name),
        roleIds: userRoles.map(r => r.id),
        created_at: user.createdAt,
        updated_at: user.updatedAt,
      }
    }),
  )

  // 如果指定了角色筛选则过滤
  const filteredUsers = roleFilter
    ? usersWithRoles.filter(u => u.roles.includes(roleFilter))
    : usersWithRoles

  // 角色筛选后的 total 可能需要修正（因 API 层不支持按角色过滤）
  const filteredTotal = roleFilter ? filteredUsers.length : total

  return {
    users: filteredUsers,
    total: filteredTotal,
    page,
    pageSize,
    roles,
    search: search ?? '',
    status: statusParam ?? '',
    role: roleFilter ?? '',
  }
}
