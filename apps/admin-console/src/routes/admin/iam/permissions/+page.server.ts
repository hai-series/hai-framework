/**
 * =============================================================================
 * Admin Console - 权限管理页面数据加载
 * =============================================================================
 */

import type { PageServerLoad } from './$types'
import { permissionService } from '$lib/server/services/index.js'
import { kit } from '@h-ai/kit'
import { error } from '@sveltejs/kit'

export const load: PageServerLoad = async ({ locals }) => {
  // 权限检查：permission:read
  if (!kit.guard.hasPermission(locals.session, 'permission:read')) {
    error(403, { message: 'Forbidden' })
  }

  const permissions = await permissionService.listGroupedByResource()

  // 从分组数据中派生资源与操作列表（避免重复调用 list()）
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
    resources: [...resourceSet].sort(),
    actions: [...actionSet].sort(),
  }
}
