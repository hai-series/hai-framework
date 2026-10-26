/** 审计写入的统一字段、身份、隐私及失败边界。 */
import type { AuditInitConfig } from './audit-config.js'
import type { AuditLogRepository } from './audit-repository-log.js'
import type { AuditActorSnapshot, AuditFunctions } from './audit-types.js'
import { core, err } from '@h-ai/core'
import { z } from 'zod'
import { getAuditContext } from './audit-context.js'
import { auditM } from './audit-i18n.js'
import { HaiAuditError } from './audit-types.js'

const logger = core.logger.child({ module: 'audit', scope: 'writer' })
const actorSchema = z.object({ id: z.string().min(1).max(256), username: z.string().max(256).optional(), displayName: z.string().max(256).optional(), roles: z.array(z.string().max(256)).max(1000).optional() })
const detailsSchema = z.record(z.string(), z.unknown())
const inputSchema = z.object({
  userId: z.string().min(1).max(256).nullable().optional(),
  actorSnapshot: actorSchema.nullable().optional(),
  action: z.string().trim().min(1).max(256),
  resource: z.string().trim().min(1).max(256),
  resourceId: z.string().max(256).nullable().optional(),
  category: z.enum(['system', 'business']).nullable().optional(),
  outcome: z.enum(['success', 'failure', 'denied']).nullable().optional(),
  severity: z.enum(['info', 'warning', 'error', 'critical']).nullable().optional(),
  requestId: z.string().max(256).nullable().optional(),
  traceId: z.string().max(256).nullable().optional(),
  scopeId: z.string().max(256).nullable().optional(),
  ipAddress: z.string().max(256).nullable().optional(),
  userAgent: z.string().max(4096).nullable().optional(),
  details: detailsSchema.nullable().optional(),
})
const querySchema = z.object({
  requestId: z.string().min(1).max(256).optional(),
  traceId: z.string().min(1).max(256).optional(),
  userId: z.string().min(1).max(256).optional(),
  resource: z.string().min(1).max(256).optional(),
  action: z.string().min(1).max(256).optional(),
  scopeId: z.string().min(1).max(256).optional(),
  category: z.enum(['system', 'business']).optional(),
  outcome: z.enum(['success', 'failure', 'denied']).optional(),
  severity: z.enum(['info', 'warning', 'error', 'critical']).optional(),
  sortBy: z.enum(['createdAt', 'action', 'resource', 'category', 'outcome', 'severity']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
})

/**
 * 列表与统计的公开筛选参数做运行时校验，分页由 RelDB 的统一分页器处理。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const valid = validAuditQuery({ category: 'system', sortBy: 'createdAt' })
 * ```
 */
export function validAuditQuery(options: unknown): boolean {
  return querySchema.safeParse(options ?? {}).success
}

/**
 * 数据库 JSON 与调用输入共用最小身份白名单。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const actor = readAuditActor({ id: 'user-1', roles: ['auditor'] })
 * ```
 */
export function readAuditActor(value: unknown): AuditActorSnapshot | null {
  if (value == null)
    return null
  const parsed = actorSchema.safeParse(typeof value === 'string' ? JSON.parse(value) : value)
  if (!parsed.success)
    throw new Error('Invalid audit actor snapshot')
  return parsed.data
}

/**
 * 创建当前初始化代次的写入函数；未成功持久化的事件始终返回失败并记录诊断。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function writer(repository: AuditLogRepository, config: AuditInitConfig) {
 *   return createAuditWriter(repository, config)
 * }
 * ```
 */
export function createAuditWriter(repository: AuditLogRepository, config: AuditInitConfig): AuditFunctions['log'] {
  const fields = new Set(config.privacy.fields.map(field => field.toLowerCase()))
  const businessPrivacy = /email|phone|mobile|idcard|identitynumber|bankaccount|shippingaddress|billingaddress|realname|identifier|recipient|邮箱|手机|电话|身份证|银行卡|地址|真实姓名|客户姓名/i
  return async (input, tx) => {
    try {
      const parsed = inputSchema.safeParse(input)
      if (!parsed.success) {
        logger.error('Audit input rejected', { issues: parsed.error.issues.map(issue => issue.path.join('.')) })
        return err(HaiAuditError.LOG_FAILED, auditM('audit_invalidInput', { params: { field: 'event', reason: auditM('audit_eventFieldsInvalid') } }))
      }
      const value = parsed.data
      const context = getAuditContext()
      const correlation = core.context.get()
      const actor = Object.hasOwn(value, 'actorSnapshot') ? value.actorSnapshot : context.actor
      const userId = value.userId !== undefined ? value.userId : actor?.id ?? correlation.userId ?? null
      if (value.actorSnapshot && value.actorSnapshot.id !== userId) {
        logger.error('Audit actor snapshot rejected', { reason: auditM('audit_identityMismatch') })
        return err(HaiAuditError.LOG_FAILED, auditM('audit_invalidInput', { params: { field: 'actorSnapshot', reason: auditM('audit_identityMismatch') } }))
      }
      const snapshot = actor?.id === userId ? readAuditActor(actor) : userId ? await repository.captureActor(userId, tx) : null
      const outcome = value.outcome ?? 'success'
      // 先获得最终 JSON 形态，类实例和 toJSON 生成的凭据字段也必须经过脱敏。
      const jsonDetails: unknown = value.details == null
        ? null
        : JSON.parse(JSON.stringify(value.details, (key: string, entry: unknown) => {
            // 审计字段表示实际数据；命中对象/数组时整体遮盖，不沿用配置日志保留对象块的规则。
            const sensitive = core.sanitize.isSensitiveKey(key) || (config.privacy.enabled && (businessPrivacy.test(key) || fields.has(key.toLowerCase())))
            return sensitive ? '[REDACTED]' : entry
          }))
      const normalizedDetails = jsonDetails == null ? null : detailsSchema.parse(jsonDetails)
      const credentialSafe = normalizedDetails == null ? null : core.sanitize.sanitizeSensitiveFields(normalizedDetails, { replacement: '[REDACTED]' })
      const details = !config.privacy.enabled || credentialSafe == null
        ? credentialSafe
        : core.sanitize.sanitizeSensitiveFields(credentialSafe, {
            matcher: key => businessPrivacy.test(key) || fields.has(key.toLowerCase()),
            replacement: '[REDACTED]',
          })
      const result = await repository.log({
        ...value,
        category: value.category ?? context.category ?? 'business',
        outcome,
        severity: value.severity ?? (outcome === 'denied' ? 'warning' : outcome === 'failure' ? 'error' : 'info'),
        userId,
        actorSnapshot: snapshot,
        requestId: value.requestId ?? context.requestId ?? correlation.requestId ?? null,
        traceId: value.traceId ?? context.traceId ?? correlation.traceId ?? correlation.requestId ?? null,
        scopeId: value.scopeId ?? context.scopeId ?? correlation.scopeId ?? null,
        ipAddress: value.ipAddress ?? context.ipAddress ?? null,
        userAgent: value.userAgent ?? context.userAgent ?? null,
        details,
      }, tx)
      if (!result.success)
        logger.error('Audit event persistence failed', { action: value.action, resource: value.resource, requestId: value.requestId ?? context.requestId, error: result.error })
      return result
    }
    catch (error) {
      logger.error('Audit event processing failed', { requestId: getAuditContext().requestId, error })
      return err(HaiAuditError.LOG_FAILED, auditM('audit_logFailed', { params: { error: auditM('audit_eventProcessingFailed') } }), error)
    }
  }
}
