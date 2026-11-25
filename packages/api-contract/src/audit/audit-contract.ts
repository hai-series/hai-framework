import { haiResultSchema } from '../common/result-schemas.js'
import { route } from '../common/route.js'
import {
  AuditBackupInputSchema,
  AuditBackupReceiptSchema,
  AuditLogListInputSchema,
  AuditLogListSchema,
  AuditLogStatsInputSchema,
  AuditLogStatsSchema,
} from './audit-schemas.js'

/**
 * 宿主按审计职责显式挂载的日志查询和手动归档接口。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const contract = apiContract.create({ audit: apiContract.extensions.audit })
 * ```
 */
export const auditContract = {
  logs: {
    list: route({
      method: 'GET',
      path: '/audit/logs',
      operationId: 'audit.logs.list',
      summary: 'List audit logs',
      tags: ['audit', 'logs'],
    })
      .input(AuditLogListInputSchema)
      .output(haiResultSchema(AuditLogListSchema)),
    stats: route({
      method: 'GET',
      path: '/audit/logs/stats',
      operationId: 'audit.logs.stats',
      summary: 'Count audit logs by action',
      tags: ['audit', 'logs'],
    })
      .input(AuditLogStatsInputSchema)
      .output(haiResultSchema(AuditLogStatsSchema)),
  },
  backup: {
    run: route({
      method: 'POST',
      path: '/audit/backup',
      operationId: 'audit.backup.run',
      summary: 'Create a private audit archive',
      tags: ['audit', 'backup'],
    })
      .input(AuditBackupInputSchema)
      .output(haiResultSchema(AuditBackupReceiptSchema)),
  },
}

/**
 * 供应用组合的审计 HTTP 契约。
 * @example
 * ```ts
 * import { type AuditContract, apiContract } from '@h-ai/api-contract'
 *
 * const contract: AuditContract = apiContract.extensions.audit
 * ```
 */
export type AuditContract = typeof auditContract
