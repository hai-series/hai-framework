/**
 * =============================================================================
 * Admin Console - 角色管理页面数据加载
 * =============================================================================
 */

import type { PageServerLoad } from './$types'
import { permissionService, roleService } from '$lib/server/services/index.js'
import { kit } from '@h-ai/kit'
import { error } from '@sveltejs/kit'

export const load: PageServerLoad = async ({ url, locals }) => {
  // 权限检查：role:read
  if (!kit.guard.hasPermission(locals.session, 'role:read')) {
    error(403, { message: 'Forbidden' })
  }

  const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1
  const pageSize = Math.min(Number.parseInt(url.searchParams.get('pageSize') ?? '20', 10) || 20, 100)
  const search = url.searchParams.get('search') || undefined

  const [roles, permissions] = await Promise.all([
    roleService.list(),
    permissionService.listGroupedByResource(),
  ])

  // 为每个角色获取用户数
  let rolesWithUserCount = await Promise.all(
    roles.map(async role => ({
      ...role,
      userCount: await roleService.getUserCount(role.id),
    })),
  )

  // 搜索过滤
  if (search) {
    const keyword = search.toLowerCase()
    rolesWithUserCount = rolesWithUserCount.filter(
      r => r.name.toLowerCase().includes(keyword)
        || r.code.toLowerCase().includes(keyword)
        || (r.description ?? '').toLowerCase().includes(keyword),
    )
  }

  // 手动分页（角色数量通常不大，在应用层分页即可）
  const total = rolesWithUserCount.length
  const startIndex = (page - 1) * pageSize
  const pagedRoles = rolesWithUserCount.slice(startIndex, startIndex + pageSize)

  return {
    roles: pagedRoles,
    total,
    page,
    pageSize,
    permissions,
    search: search ?? '',
  }
}
