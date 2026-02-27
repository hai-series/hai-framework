/**
 * =============================================================================
 * Admin Console - 角色管理页面数据加载
 * =============================================================================
 */

import type { PageServerLoad } from './$types'
import { permissionService, roleService } from '$lib/server/services/index.js'
import { kit } from '@h-ai/kit'
import { error } from '@sveltejs/kit'

export const load: PageServerLoad = async ({ locals }) => {
  // 权限检查：role:read
  if (!kit.guard.hasPermission(locals.session, 'role:read')) {
    error(403, { message: 'Forbidden' })
  }

  const [roles, permissions] = await Promise.all([
    roleService.list(),
    permissionService.listGroupedByResource(),
  ])

  // 为每个角色获取用户数
  const rolesWithUserCount = await Promise.all(
    roles.map(async role => ({
      ...role,
      userCount: await roleService.getUserCount(role.id),
    })),
  )

  return {
    roles: rolesWithUserCount,
    permissions,
  }
}
