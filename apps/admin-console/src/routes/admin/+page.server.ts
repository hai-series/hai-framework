/**
 * =============================================================================
 * Admin Console - 仪表盘数据加载
 * =============================================================================
 */

import type { PageServerLoad } from './$types'
import { auditService } from '$lib/server/services/index.js'
import { iam } from '@hai/iam'

export const load: PageServerLoad = async () => {
  // 从 iam 获取角色和权限
  const rolesResult = await iam.authz.getAllRoles()
  const permissionsResult = await iam.authz.getAllPermissions()

  const roles = rolesResult.success ? rolesResult.data : []
  const permissions = permissionsResult.success ? permissionsResult.data : []

  // 获取审计数据
  const [recentAudit, auditStats] = await Promise.all([
    auditService.list({ pageSize: 10 }),
    auditService.getStats(7),
  ])

  return {
    stats: {
      // TODO: 需要在 iam 中添加用户统计功能
      userCount: 0,
      roleCount: roles.length,
      permissionCount: permissions.length,
      activeUsers: 0,
    },
    recentActivity: recentAudit.items,
    auditStats,
  }
}
