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

  const [permissions, resources, actions] = await Promise.all([
    permissionService.listGroupedByResource(),
    permissionService.getResources(),
    permissionService.getActions(),
  ])

  return {
    permissions,
    resources,
    actions,
  }
}
