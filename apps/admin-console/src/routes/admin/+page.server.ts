/**
 * =============================================================================
 * Admin Console - 仪表盘数据加载
 * =============================================================================
 */

import type { PageServerLoad } from './$types'
import { auditService, permissionService, roleService, userService } from '$lib/server/services/index.js'

export const load: PageServerLoad = async () => {
  const [usersResult, roles, permissions, recentAudit, auditStats] = await Promise.all([
    userService.list(),
    roleService.list(),
    permissionService.list(),
    auditService.list({ pageSize: 10 }),
    auditService.getStats(7),
  ])

  return {
    stats: {
      userCount: usersResult.users.length,
      roleCount: roles.length,
      permissionCount: permissions.length,
      activeUsers: usersResult.users.filter(u => u.status === 'active').length,
    },
    recentActivity: recentAudit.items,
    auditStats,
  }
}
