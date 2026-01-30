/**
 * =============================================================================
 * Admin Console - 权限管理页面数据加载
 * =============================================================================
 */

import type { PageServerLoad } from './$types'
import { permissionService } from '$lib/server/services/index.js'

export const load: PageServerLoad = async () => {
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
