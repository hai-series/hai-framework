/**
 * =============================================================================
 * Admin Console - 权限管理页面数据加载
 * =============================================================================
 */

import type { PageServerLoad } from './$types'
import { permissionService, roleService } from '$lib/server/services/index.js'
import { kit } from '@h-ai/kit'
import { error } from '@sveltejs/kit'

export const load: PageServerLoad = async ({ locals }) => {
  // 权限检查：permission:read
  if (!kit.guard.hasPermission(locals.session, 'permission:read')) {
    error(403, { message: 'Forbidden' })
  }

  const [permissions, roles] = await Promise.all([
    permissionService.listGroupedByResource(),
    roleService.list(),
  ])

  // 构建权限 → 角色的映射（permissionName → [roleName, ...]）
  const permissionRolesMap: Record<string, string[]> = {}
  for (const role of roles) {
    for (const permName of role.permissions) {
      if (!permissionRolesMap[permName]) {
        permissionRolesMap[permName] = []
      }
      permissionRolesMap[permName].push(role.name)
    }
  }

  // 从分组数据中派生资源与操作列表
  const resourceSet = new Set<string>()
  const actionSet = new Set<string>()
  for (const perms of Object.values(permissions)) {
    for (const p of perms) {
      if (p.resource)
        resourceSet.add(p.resource)
      if (p.action)
        actionSet.add(p.action)
    }
  }

  return {
    permissions,
    permissionRolesMap,
    resources: [...resourceSet].sort(),
    actions: [...actionSet].sort(),
  }
}
