import { z } from 'zod'
import { paginatedSchema, PaginationQuerySchema } from '../common/pagination-schemas.js'

const category = z.enum(['system', 'business'])
const outcome = z.enum(['success', 'failure', 'denied'])
const severity = z.enum(['info', 'warning', 'error', 'critical'])
const queryText = z.string().trim().min(1).max(256).optional()
const wireDate = z.iso.datetime({ offset: true })

const auditFilters = {
  category: category.optional(),
  outcome: outcome.optional(),
  severity: severity.optional(),
  scopeId: queryText,
  userId: queryText,
  resource: queryText,
}

/**
 * 审计日志分页、检索和时间范围。客户端提供的范围仍须通过宿主授权。
 * @example
 * ```ts
 * import { AuditLogListInputSchema } from '@h-ai/api-contract'
 *
 * const query = AuditLogListInputSchema.parse({ page: 1, outcome: 'denied' })
 * ```
 */
export const AuditLogListInputSchema = PaginationQuerySchema.extend({
  ...auditFilters,
  action: queryText,
  requestId: queryText,
  traceId: queryText,
  sortBy: z.enum([
    'createdAt',
    'action',
    'resource',
    'category',
    'outcome',
    'severity',
  ]).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  startDate: wireDate.optional(),
  endDate: wireDate.optional(),
}).strict().refine(({ startDate, endDate }) => !startDate || !endDate || Date.parse(startDate) <= Date.parse(endDate), {
  path: ['endDate'],
})

/**
 * 按操作类型统计指定天数的审计记录，默认 7 天。
 * @example
 * ```ts
 * import { AuditLogStatsInputSchema } from '@h-ai/api-contract'
 *
 * const filters = AuditLogStatsInputSchema.parse({ days: 14, resource: 'orders' })
 * ```
 */
export const AuditLogStatsInputSchema = z.strictObject({
  ...auditFilters,
  days: z.coerce.number().int().min(0).max(365).default(7),
})

/**
 * 授权审计查询返回的记录，时间以 ISO 字符串传输。
 * @example
 * ```ts
 * import { AuditLogSchema } from '@h-ai/api-contract'
 *
 * const summary = AuditLogSchema.pick({ id: true, createdAt: true })
 * ```
 */
export const AuditLogSchema = z.object({
  id: z.string(),
  category,
  outcome,
  severity,
  scopeId: z.string().nullish(),
  requestId: z.string().nullish(),
  traceId: z.string().nullish(),
  actorSnapshot: z.object({
    id: z.string(),
    username: z.string().optional(),
    displayName: z.string().optional(),
    roles: z.array(z.string()).optional(),
  }).nullish(),
  userId: z.string().nullable(),
  username: z.string().nullable(),
  action: z.string(),
  resource: z.string(),
  resourceId: z.string().nullable(),
  details: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: wireDate,
})

/**
 * 标准分页形式的审计日志响应数据。
 * @example
 * ```ts
 * import { AuditLogListSchema } from '@h-ai/api-contract'
 *
 * const page = AuditLogListSchema.parse({ items: [], total: 0, page: 1, pageSize: 20 })
 * ```
 */
export const AuditLogListSchema = paginatedSchema(AuditLogSchema)

/**
 * 按操作名称汇总的审计日志计数。
 * @example
 * ```ts
 * import { AuditLogStatsSchema } from '@h-ai/api-contract'
 *
 * const counts = AuditLogStatsSchema.parse([{ action: 'login', count: 2 }])
 * ```
 */
export const AuditLogStatsSchema = z.array(z.object({
  action: z.string(),
  count: z.number().int().nonnegative(),
}))

/**
 * 手动归档请求。每次操作生成一个 UUID，重试使用同一 UUID。
 * @example
 * ```ts
 * import { AuditBackupInputSchema } from '@h-ai/api-contract'
 *
 * const input = AuditBackupInputSchema.parse({ id: '2ac4b928-f7fb-4df3-9ce4-76c0c2b72640' })
 * ```
 */
export const AuditBackupInputSchema = z.strictObject({
  id: z.uuid(),
})

/**
 * 私有归档回执，包含存储键和完整性校验信息。
 * @example
 * ```ts
 * import { AuditBackupReceiptSchema } from '@h-ai/api-contract'
 *
 * const digestSchema = AuditBackupReceiptSchema.pick({ sha256: true })
 * ```
 */
export const AuditBackupReceiptSchema = z.object({
  id: z.string(),
  key: z.string(),
  recordCount: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f\d]{64}$/),
  createdAt: wireDate,
  cutoff: wireDate,
})

/**
 * 审计日志分页查询输入。
 * @example
 * ```ts
 * import type { AuditLogListInput } from '@h-ai/api-contract'
 *
 * const filters: AuditLogListInput = { resource: 'orders', page: 1 }
 * ```
 */
export type AuditLogListInput = z.infer<typeof AuditLogListInputSchema>

/**
 * 审计日志统计输入。
 * @example
 * ```ts
 * import type { AuditLogStatsInput } from '@h-ai/api-contract'
 *
 * const filters: AuditLogStatsInput = { days: 7, outcome: 'denied' }
 * ```
 */
export type AuditLogStatsInput = z.infer<typeof AuditLogStatsInputSchema>

/**
 * 手动归档请求输入。
 * @example
 * ```ts
 * import type { AuditBackupInput } from '@h-ai/api-contract'
 *
 * const input: AuditBackupInput = { id: '2ac4b928-f7fb-4df3-9ce4-76c0c2b72640' }
 * ```
 */
export type AuditBackupInput = z.infer<typeof AuditBackupInputSchema>

/**
 * 手动归档成功回执。
 * @example
 * ```ts
 * import type { AuditBackupReceipt } from '@h-ai/api-contract'
 *
 * function archiveDigest(receipt: AuditBackupReceipt) { return receipt.sha256 }
 * ```
 */
export type AuditBackupReceipt = z.infer<typeof AuditBackupReceiptSchema>
