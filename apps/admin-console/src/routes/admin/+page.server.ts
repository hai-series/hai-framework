/**
 * =============================================================================
 * Admin Console - 仪表盘数据加载
 * =============================================================================
 */

import type { PageServerLoad } from './$types'
import { auditService } from '$lib/server/services/index.js'
import { iam } from '@hai/iam'

export const load: PageServerLoad = async () => {
  // 从 iam 获取统计数据
  const [usersResult, activeUsersResult, rolesResult, permissionsResult] = await Promise.all([
    iam.user.listUsers({ page: 1, pageSize: 1 }),
    iam.user.listUsers({ page: 1, pageSize: 1, enabled: true }),
    iam.authz.getAllRoles({ page: 1, pageSize: 1 }),
    iam.authz.getAllPermissions({ page: 1, pageSize: 1 }),
  ])

  const userTotal = usersResult.success ? usersResult.data.total : 0
  const activeUserTotal = activeUsersResult.success ? activeUsersResult.data.total : 0
  const roleTotal = rolesResult.success ? rolesResult.data.total : 0
  const permissionTotal = permissionsResult.success ? permissionsResult.data.total : 0

  // 获取审计数据
  const [recentAudit, auditStats] = await Promise.all([
    auditService.list({ pageSize: 10 }),
    auditService.getStats(7),
  ])

  return {
    stats: {
      userCount: userTotal,
      roleCount: roleTotal,
      permissionCount: permissionTotal,
      activeUsers: activeUserTotal,
    },
    recentActivity: recentAudit.items,
    auditStats,
  }
}
