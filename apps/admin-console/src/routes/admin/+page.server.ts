/**
 * =============================================================================
 * Admin Console - 仪表盘数据加载
 * =============================================================================
 */

import type { PageServerLoad } from './$types'
import { requireAdminData } from '$lib/server/iam-admin.js'
import { requirePagePermission } from '$lib/server/security-roles.js'
import { audit } from '@h-ai/audit'
import { ok } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const load: PageServerLoad = async ({ locals }) => {
  requirePagePermission(locals.session, 'dashboard:view')
  const canReadUsers = kit.guard.check(locals.session, 'user:list')
  const canReadRoles = kit.guard.check(locals.session, 'role:list')
  const canReadPermissions = kit.guard.check(locals.session, 'permission:list')
  const canReadAudit = kit.guard.check(locals.session, 'audit:read')
  const emptyPage = ok({ items: [], total: 0, page: 1, pageSize: 1 })
  // 所有无依赖查询合并为单次 Promise.all，减少串行等待
  const [usersResult, activeUsersResult, rolesResult, permissionsResult, recentAuditResult, auditStatsResult] = await Promise.all([
    canReadUsers ? iam.user.listUsers({ page: 1, pageSize: 1 }) : emptyPage,
    canReadUsers ? iam.user.listUsers({ page: 1, pageSize: 1, accountStatus: 'active' }) : emptyPage,
    canReadRoles ? iam.authz.getAllRoles({ page: 1, pageSize: 1 }) : emptyPage,
    canReadPermissions ? iam.authz.getAllPermissions({ page: 1, pageSize: 1 }) : emptyPage,
    canReadAudit ? audit.list({ pageSize: 10 }) : emptyPage,
    canReadAudit ? audit.getStats(7) : ok([]),
  ])

  const userTotal = requireAdminData(usersResult).total
  const activeUserTotal = requireAdminData(activeUsersResult).total
  const roleTotal = requireAdminData(rolesResult).total
  const permissionTotal = requireAdminData(permissionsResult).total

  // 审计数据
  const recentActivity = requireAdminData(recentAuditResult).items
  const auditStats = requireAdminData(auditStatsResult)

  return {
    canReadUsers,
    canReadRoles,
    canReadPermissions,
    canReadAudit,
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
