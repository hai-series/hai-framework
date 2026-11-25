/** 审计日志的采集、写入、查询和清理。 */
import type { HaiResult, Logger, PaginatedResult } from '@h-ai/core'
import type { AuditInitConfig } from './audit-config.js'
import type { AuditLogRepository } from './audit-repository-log.js'
import type { AuditActorSnapshot, AuditFunctions, AuditLog, AuditLogWithUser, AuditOutcomeCounts, AuditStatItem, ListAuditLogsOptions } from './audit-types.js'
import { core } from '@h-ai/core'
import { z } from 'zod'
import { getAuditContext } from './audit-context.js'
import { auditM } from './audit-i18n.js'
import { HaiAuditError } from './audit-types.js'

const logger = core.logger.child({ module: 'audit', scope: 'writer' })
const actorSchema = z.object({
  id: z.string().min(1).max(256),
  username: z.string().max(256).optional(),
  displayName: z.string().max(256).optional(),
  roles: z.array(z.string().max(256)).max(1000).optional(),
})
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
  sortBy: z.enum([
    'createdAt',
    'action',
    'resource',
    'category',
    'outcome',
    'severity',
  ]).optional(),
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
function validAuditQuery(options: unknown): boolean {
  return querySchema.safeParse(options === undefined
    ? {}
    : options).success
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
  const parsed = actorSchema.safeParse(typeof value === 'string'
    ? JSON.parse(value)
    : value)
  if (!parsed.success)
    throw new Error('Invalid audit actor snapshot')
  return parsed.data
}

/**
 * 数据库映射只能补入符合公开身份契约的用户名。
 * @example 模块内部上下文
 * ```ts
 * const username = readAuditActorUsername('operator')
 * ```
 */
export function readAuditActorUsername(value: unknown): string | undefined {
  const parsed = actorSchema.shape.username.safeParse(value)
  return parsed.success
    ? parsed.data || undefined
    : undefined
}

/**
 * 保留旧记录的主体标识，隔离无效快照，不将原始身份资料写入诊断。
 * @example 模块内部上下文
 * ```ts
 * const actor = readStoredAuditActor({ id: 'stale-id' }, 'user-1', 'audit-1')
 * ```
 */
export function readStoredAuditActor(value: unknown, userId: string | null, auditId: string): AuditActorSnapshot | null {
  try {
    const actor = readAuditActor(value)
    if (!actor || actor.id === userId)
      return actor
  }
  catch { /* 快照损坏时仍允许读取事件的其余字段。 */ }
  logger.warn('Invalid stored audit actor snapshot', { auditId })
  const id = actorSchema.shape.id.safeParse(userId)
  return id.success
    ? { id: id.data }
    : null
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
        logger.error('Audit input rejected', {
          issues: parsed.error.issues.map(issue => issue.path.join('.')),
        })
        return core.err(HaiAuditError.LOG_FAILED, auditM('audit_invalidInput', {
          params: {
            field: 'event',
            reason: auditM('audit_eventFieldsInvalid'),
          },
        }))
      }
      const value = parsed.data
      const context = getAuditContext()
      const correlation = core.context.get()
      const actor = Object.hasOwn(value, 'actorSnapshot')
        ? value.actorSnapshot
        : context.actor
      const userId = value.userId !== undefined
        ? value.userId
        : actor?.id ?? correlation.userId ?? null
      if (value.actorSnapshot && value.actorSnapshot.id !== userId) {
        logger.error('Audit actor snapshot rejected', {
          reason: auditM('audit_identityMismatch'),
        })
        return core.err(HaiAuditError.LOG_FAILED, auditM('audit_invalidInput', {
          params: {
            field: 'actorSnapshot',
            reason: auditM('audit_identityMismatch'),
          },
        }))
      }
      const snapshot = actor?.id === userId
        ? core.ok(readAuditActor(actor))
        : userId
          ? await repository.captureActor(userId, tx)
          : core.ok(null)
      if (!snapshot.success) {
        return core.err(HaiAuditError.LOG_FAILED, auditM('audit_logFailed', {
          params: { error: snapshot.error.message },
        }), snapshot.error)
      }
      const outcome = value.outcome ?? 'success'
      // 先获得最终 JSON 形态，类实例和 toJSON 生成的凭据字段也必须经过脱敏。
      const jsonDetails: unknown = value.details == null
        ? null
        : JSON.parse(JSON.stringify(value.details, (key: string, entry: unknown) => {
            // 审计字段表示实际数据；命中对象/数组时整体遮盖，不沿用配置日志保留对象块的规则。
            const sensitive = core.sanitize.isSensitiveKey(key) || (config.privacy.enabled && (businessPrivacy.test(key) || fields.has(key.toLowerCase())))
            return sensitive ? '[REDACTED]' : entry
          }))
      const normalizedDetails = jsonDetails == null
        ? null
        : detailsSchema.parse(jsonDetails)
      const credentialSafe = normalizedDetails == null
        ? null
        : core.sanitize.sanitizeSensitiveFields(normalizedDetails, { replacement: '[REDACTED]' })
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
        severity: value.severity ?? (outcome === 'denied'
          ? 'warning'
          : outcome === 'failure'
            ? 'error'
            : 'info'),
        userId,
        actorSnapshot: snapshot.data,
        requestId: value.requestId ?? context.requestId ?? correlation.requestId ?? null,
        traceId: value.traceId ?? context.traceId ?? correlation.traceId ?? correlation.requestId ?? null,
        scopeId: value.scopeId ?? context.scopeId ?? correlation.scopeId ?? null,
        ipAddress: value.ipAddress ?? context.ipAddress ?? null,
        userAgent: value.userAgent ?? context.userAgent ?? null,
        details,
      }, tx)
      if (!result.success) {
        logger.error('Audit event persistence failed', {
          action: value.action,
          resource: value.resource,
          requestId: value.requestId ?? context.requestId,
          error: result.error,
        })
      }
      return result
    }
    catch (error) {
      logger.error('Audit event processing failed', { requestId: getAuditContext().requestId, error })
      return core.err(HaiAuditError.LOG_FAILED, auditM('audit_logFailed', {
        params: {
          error: auditM('audit_eventProcessingFailed'),
        },
      }), error)
    }
  }
}

/**
 * 判断值是否为非空字符串
 *
 * @param value - 待校验值
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * 使用当前仓库和采集策略的统一日志操作。
 * @param deps - 读取当前运行期的仓库和策略，复用入口的日志写入、在途跟踪和未初始化错误。
 * @param deps.getRepository - 获取当前运行期的仓库。
 * @param deps.getCapturePolicy - 获取当前运行期的采集策略。
 * @param deps.write - 写入并跟踪本次采集的事件。
 * @param deps.trackAuditWrite - 注册在途清理操作，供关闭时等待。
 * @param deps.unavailable - 构造模块未初始化的失败。
 * @param deps.captureLogger - 记录采集输入失败的诊断日志。
 * @returns 捕获事件、查询及清理日志的方法；业务失败沿用原有 HaiResult。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function listRejectedEvents(deps: Parameters<typeof createAuditLogOperations>[0]) {
 *   const result = await createAuditLogOperations(deps).list({ outcome: 'denied' })
 *   if (!result.success) return result
 *   return result.data.items
 * }
 * ```
 */
export function createAuditLogOperations(deps: {
  getRepository: () => AuditLogRepository | null
  getCapturePolicy: () => AuditInitConfig['capture'] | null
  write: AuditFunctions['log']
  trackAuditWrite: <T>(operation: Promise<HaiResult<T>>) => Promise<HaiResult<T>>
  unavailable: <T>() => HaiResult<T>
  captureLogger: Logger
}): Pick<AuditFunctions, 'capture' | 'list' | 'countByOutcome' | 'getUserRecent' | 'cleanup' | 'getStats'> {
  const { getRepository, getCapturePolicy, write, trackAuditWrite, unavailable, captureLogger } = deps
  return {
    async capture(input, options): Promise<HaiResult<void>> {
      if (!getRepository())
        return unavailable()
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        captureLogger.error('Audit capture input rejected', { traceId: core.context.get().traceId })
        return core.err(HaiAuditError.LOG_FAILED, auditM('audit_invalidInput', {
          params: {
            field: 'event',
            reason: auditM('audit_eventFieldsInvalid'),
          },
        }))
      }
      const capturePolicy = getCapturePolicy()
      if (!capturePolicy?.enabled || (options?.read && !capturePolicy.includeReads && (!input.outcome || input.outcome === 'success')))
        return core.ok(undefined)
      const written = await write(input, options?.tx)
      return written.success
        ? core.ok(undefined)
        : written
    },

    /**
     * 分页查询审计日志列表，用户名来自事件时的身份快照。
     *
     * @param options - 过滤条件与分页参数
     * @returns 成功时返回 PaginatedResult（items/total/page/pageSize）；未初始化时返回 NOT_INITIALIZED
     */
    list(options?: ListAuditLogsOptions): Promise<HaiResult<PaginatedResult<AuditLogWithUser>>> {
      if (!getRepository()) {
        return Promise.resolve(unavailable())
      }
      if (!validAuditQuery(options)) {
        return Promise.resolve(core.err(HaiAuditError.QUERY_FAILED, auditM('audit_invalidInput', {
          params: {
            field: 'query',
            reason: auditM('audit_queryInvalid'),
          },
        })))
      }

      if (options?.startDate && options?.endDate && options.startDate > options.endDate) {
        return Promise.resolve(core.err(
          HaiAuditError.QUERY_FAILED,
          auditM('audit_invalidInput', {
            params: { field: 'dateRange', reason: 'startDate must be before endDate' },
          }),
        ))
      }

      return getRepository()!.listWithUser(options)
    },

    countByOutcome(options?: ListAuditLogsOptions): Promise<HaiResult<AuditOutcomeCounts>> {
      if (!getRepository())
        return Promise.resolve(unavailable())
      if (!validAuditQuery(options) || (options?.startDate && options.endDate && options.startDate > options.endDate)) {
        return Promise.resolve(core.err(HaiAuditError.STATS_FAILED, auditM('audit_invalidInput', {
          params: {
            field: 'query',
            reason: auditM('audit_queryInvalid'),
          },
        })))
      }
      return getRepository()!.countByOutcome(options)
    },

    /**
     * 获取指定用户的最近活动记录
     *
     * @param userId - 用户 ID
     * @param limit - 最大返回条数，默认 10
     * @returns 成功时返回 AuditLog 数组；未初始化时返回 NOT_INITIALIZED
     */
    getUserRecent(userId: string, limit?: number): Promise<HaiResult<AuditLog[]>> {
      if (!getRepository()) {
        return Promise.resolve(unavailable())
      }

      if (!isNonEmptyString(userId)) {
        return Promise.resolve(core.err(
          HaiAuditError.QUERY_FAILED,
          auditM('audit_invalidInput', {
            params: { field: 'userId', reason: 'must be non-empty string' },
          }),
        ))
      }

      if (typeof limit === 'number' && (!Number.isInteger(limit) || limit <= 0)) {
        return Promise.resolve(core.err(
          HaiAuditError.QUERY_FAILED,
          auditM('audit_invalidInput', {
            params: { field: 'limit', reason: 'must be a positive integer' },
          }),
        ))
      }

      return getRepository()!.getUserRecent(userId, limit)
    },

    /**
     * 清理指定天数之前的旧日志
     *
     * @param olderThanDays - 保留天数，默认 90
     * @returns 成功时返回删除的记录数；未初始化时返回 NOT_INITIALIZED
     */
    cleanup(olderThanDays?: number): Promise<HaiResult<number>> {
      if (!getRepository()) {
        return Promise.resolve(unavailable())
      }

      if (typeof olderThanDays === 'number' && (!Number.isInteger(olderThanDays) || olderThanDays < 0)) {
        return Promise.resolve(core.err(
          HaiAuditError.CLEANUP_FAILED,
          auditM('audit_invalidInput', {
            params: { field: 'olderThanDays', reason: 'must be a non-negative integer' },
          }),
        ))
      }

      return trackAuditWrite(getRepository()!.cleanupOld(olderThanDays))
    },

    /**
     * 获取指定天数内的操作统计（按 action 分组计数）
     *
     * @param days - 统计天数，默认 7
     * @returns 成功时返回 AuditStatItem 数组；未初始化时返回 NOT_INITIALIZED
     */
    getStats(days?: number, filters?: Pick<ListAuditLogsOptions, 'category' | 'outcome' | 'severity' | 'scopeId' | 'userId' | 'resource'>): Promise<HaiResult<AuditStatItem[]>> {
      if (!getRepository()) {
        return Promise.resolve(unavailable())
      }
      if (!validAuditQuery(filters)) {
        return Promise.resolve(core.err(HaiAuditError.STATS_FAILED, auditM('audit_invalidInput', {
          params: {
            field: 'query',
            reason: auditM('audit_queryInvalid'),
          },
        })))
      }

      if (typeof days === 'number' && (!Number.isInteger(days) || days < 0)) {
        return Promise.resolve(core.err(
          HaiAuditError.STATS_FAILED,
          auditM('audit_invalidInput', {
            params: { field: 'days', reason: 'must be a non-negative integer' },
          }),
        ))
      }

      return getRepository()!.getStats(days, filters)
    },
  }
}
