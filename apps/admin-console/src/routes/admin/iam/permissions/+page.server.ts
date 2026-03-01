/**
 * =============================================================================
 * Admin Console - 权限管理页面数据加载
 * =============================================================================
 */

import type { PermissionType } from '@h-ai/iam'
import type { PageServerLoad } from './$types'
import { permissionService, roleService } from '$lib/server/services/index.js'
import { kit } from '@h-ai/kit'
import { error } from '@sveltejs/kit'

export const load: PageServerLoad = async ({ url, locals }) => {
  // 权限检查：permission:read
  if (!kit.guard.hasPermission(locals.session, 'permission:read')) {
    error(403, { message: 'Forbidden' })
  }

  const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1
  const pageSize = Math.min(Number.parseInt(url.searchParams.get('pageSize') ?? '20', 10) || 20, 100)
  const search = url.searchParams.get('search') || undefined
  const typeParam = url.searchParams.get('type') || undefined
  const type = (['menu', 'api', 'button'].includes(typeParam ?? '') ? typeParam : undefined) as PermissionType | undefined

  const [permResult, roles] = await Promise.all([
    permissionService.listPaginated({ page, pageSize, search, type }),
    roleService.list(),
  ])

  // 构建权限 → 角色的映射（permissionCode → [roleName, ...]）
  const permissionRolesMap: Record<string, string[]> = {}
  for (const role of roles) {
    for (const permCode of role.permissions) {
      if (!permissionRolesMap[permCode]) {
        permissionRolesMap[permCode] = []
      }
      permissionRolesMap[permCode].push(role.name)
    }
  }

  // 从权限数据中派生资源与操作列表
  const resourceSet = new Set<string>()
  const actionSet = new Set<string>()
  for (const p of permResult.items) {
    if (p.resource)
      resourceSet.add(p.resource)
    if (p.action)
      actionSet.add(p.action)
  }

  return {
    permissions: permResult.items,
    total: permResult.total,
    page: permResult.page,
    pageSize: permResult.pageSize,
    permissionRolesMap,
    resources: [...resourceSet].sort(),
    actions: [...actionSet].sort(),
    search: search ?? '',
    type: type ?? '',
  }
}
