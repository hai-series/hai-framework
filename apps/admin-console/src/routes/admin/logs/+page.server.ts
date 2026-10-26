/** 审计查询只接受公开字段白名单，不把 URL 直接拼接为 SQL。 */
import type { PageServerLoad } from './$types'
import * as m from '$lib/paraglide/messages.js'
import { requireAdminData } from '$lib/server/iam-admin.js'
import { requirePagePermission } from '$lib/server/security-roles.js'
import { audit, AuditInitConfigSchema } from '@h-ai/audit'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { error } from '@sveltejs/kit'
import { z } from 'zod'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  category: z.enum(['system', 'business']).optional(),
  outcome: z.enum(['success', 'failure', 'denied']).optional(),
  severity: z.enum(['info', 'warning', 'error', 'critical']).optional(),
  action: z.string().trim().min(1).max(256).optional(),
  resource: z.string().trim().min(1).max(256).optional(),
  requestId: z.string().trim().min(1).max(256).optional(),
  traceId: z.string().trim().min(1).max(256).optional(),
  scopeId: z.string().trim().min(1).max(256).optional(),
  sortBy: z.enum(['createdAt', 'action', 'resource', 'category', 'outcome', 'severity']).default('createdAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(input => !input.startDate || !input.endDate || input.startDate <= input.endDate, { path: ['endDate'] })

export const load: PageServerLoad = async ({ url, locals }) => {
  requirePagePermission(locals.session, 'audit:read')
  const parsed = querySchema.safeParse(Object.fromEntries([...url.searchParams].filter(([, value]) => value !== '')))
  if (!parsed.success)
    error(400, { message: m.audit_query_invalid() })
  const input = parsed.data
  const [listed, counted] = await Promise.all([
    audit.list(input),
    audit.getStats(7, { category: input.category, outcome: input.outcome, severity: input.severity, resource: input.resource, scopeId: input.scopeId }),
  ])
  const result = requireAdminData(listed)
  const config = AuditInitConfigSchema.parse(core.config.get('audit') ?? {})
  return {
    logs: result.items,
    stats: requireAdminData(counted),
    backupEnabled: config.backup.enabled && kit.guard.check(locals.session, 'audit:backup'),
    filters: input,
    pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: Math.ceil(result.total / result.pageSize) },
  }
}
