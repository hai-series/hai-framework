/**
 * =============================================================================
 * Admin Console - 角色管理页面数据加载
 * =============================================================================
 */

import type { PageServerLoad } from './$types'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { error } from '@sveltejs/kit'
import { listAdminRoles, listPermissionsGroupedByResource, requireAdminData } from '#lib/server/iam-admin.js'

export const load: PageServerLoad = async ({ url, locals }) => {
  // 权限检查：role:read
  if (!kit.guard.check(locals.session, 'role:read')) {
    error(403, 'Forbidden')
  }

  const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1
  const pageSize = Math.min(Number.parseInt(url.searchParams.get('pageSize') ?? '20', 10) || 20, 100)
  const search = url.searchParams.get('search') || undefined

  const [roles, permissions] = await Promise.all([
    listAdminRoles(),
    listPermissionsGroupedByResource(),
  ])

  let filteredRoles = roles

  // 搜索过滤
  if (search) {
    const keyword = search.toLowerCase()
    filteredRoles = filteredRoles.filter(
      r => r.name.toLowerCase().includes(keyword)
        || r.code.toLowerCase().includes(keyword)
        || (r.description ?? '').toLowerCase().includes(keyword),
    )
  }

  // 手动分页（角色数量通常不大，在应用层分页即可）
  const total = filteredRoles.length
  const startIndex = (page - 1) * pageSize
  const pagedRoles = filteredRoles.slice(startIndex, startIndex + pageSize)
  // 只聚合当前页，一次查询获取真实成员数；失败不能显示成零。
  const counts = requireAdminData(await iam.authz.getRoleUserCounts(pagedRoles.map(role => role.id)))

  return {
    roles: pagedRoles.map(role => ({ ...role, userCount: counts.get(role.id) ?? 0 })),
    total,
    page,
    pageSize,
    permissions,
    search: search ?? '',
  }
}
