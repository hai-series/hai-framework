/**
 * =============================================================================
 * Admin Console - 仪表盘数据加载
 * =============================================================================
 */

import type { PageServerLoad } from './$types'
import { audit } from '@h-ai/audit'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'

export const load: PageServerLoad = async () => {
  // 所有无依赖查询合并为单次 Promise.all，减少串行等待
  const [usersResult, activeUsersResult, rolesResult, permissionsResult, recentAuditResult, auditStatsResult] = await Promise.all([
    iam.user.listUsers({ page: 1, pageSize: 1 }),
    iam.user.listUsers({ page: 1, pageSize: 1, enabled: true }),
    iam.authz.getAllRoles({ page: 1, pageSize: 1 }),
    iam.authz.getAllPermissions({ page: 1, pageSize: 1 }),
    audit.list({ pageSize: 10 }),
    audit.getStats(7),
  ])

  const userTotal = usersResult.success ? usersResult.data.total : 0
  const activeUserTotal = activeUsersResult.success ? activeUsersResult.data.total : 0
  const roleTotal = rolesResult.success ? rolesResult.data.total : 0
  const permissionTotal = permissionsResult.success ? permissionsResult.data.total : 0

  // 审计数据
  const recentActivity = recentAuditResult.success ? recentAuditResult.data.items : []
  const auditStats = auditStatsResult.success ? auditStatsResult.data : []

  if (!recentAuditResult.success) {
    core.logger.warn('Failed to fetch recent audit logs', { error: recentAuditResult.error.message })
  }
  if (!auditStatsResult.success) {
    core.logger.warn('Failed to fetch audit statistics', { error: auditStatsResult.error.message })
  }

  return {
    stats: {
      userCount: userTotal,
      roleCount: roleTotal,
      permissionCount: permissionTotal,
      activeUsers: activeUserTotal,
    },
    recentActivity,
    auditStats,
  }
}
