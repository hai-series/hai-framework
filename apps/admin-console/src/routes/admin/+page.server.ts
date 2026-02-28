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
  const [recentAuditResult, auditStatsResult] = await Promise.all([
    audit.list({ pageSize: 10 }),
    audit.getStats(7),
  ])

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
