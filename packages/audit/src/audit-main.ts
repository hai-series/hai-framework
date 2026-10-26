/**
 * @h-ai/audit — 审计日志服务主入口
 *
 * 本文件提供统一的 `audit` 对象，聚合所有审计日志操作功能。
 * @module audit-main
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { DmlWithTxOperations } from '@h-ai/reldb'
import type { AuditInitConfig, AuditInitConfigInput } from './audit-config.js'
import type {
  AuditBackupOperations,
  AuditFunctions,
  AuditHelper,
  AuditLog,
  AuditLogWithUser,
  AuditStatItem,
  CreateAuditLogInput,
  ListAuditLogsOptions,
} from './audit-types.js'
import { core, err, ok } from '@h-ai/core'
import { validateIdentifiers } from '@h-ai/reldb'
import { createAuditAlerts } from './audit-alert-functions.js'
import { createAuditBackup } from './audit-backup-functions.js'
import { AuditInitConfigSchema } from './audit-config.js'
import { withAuditContext } from './audit-context.js'
import { createHelper } from './audit-helper.js'
import { auditM } from './audit-i18n.js'
import { createAuditWriter, validAuditQuery } from './audit-log-functions.js'

import { configureAuditRetention, migrateAudit } from './audit-migration.js'
import { AuditLogRepository } from './audit-repository-log.js'
import {
  HaiAuditError,
} from './audit-types.js'

const logger = core.logger.child({ module: 'audit', scope: 'main' })

// ─── 输入校验 ───

/**
 * 判断值是否为非空字符串
 *
 * @param value - 待校验值
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// ─── 内部状态 ───

/** 当前审计日志仓库实例；init 后赋值，close 后置 null */
let currentRepo: AuditLogRepository | null = null
let currentWriter: AuditFunctions['log'] | null = null
let capturePolicy: AuditInitConfig['capture'] | null = null
let currentBackup: ReturnType<typeof createAuditBackup> | null = null
let currentAlerts: ReturnType<typeof createAuditAlerts> | null = null
/** 只追踪当前进程在途操作，安全记录真值仍在共享数据库。 */
const inFlightWrites = new Set<Promise<HaiResult<AuditLog>>>()

/** 缓存的便捷记录器实例；init 时创建，close 时置 null */
let currentHelper: AuditHelper | null = null

/** 并发初始化防护标志 */
let initInProgress = false

/** close使尚未完成DDL的初始化失效，防止迟到发布。 */
let lifecycleGeneration = 0

// ─── 未初始化占位 ───

/**
 * 未初始化时的错误工具集
 *
 * 调用 audit.log / audit.list 等方法时，
 * 若模块未初始化则返回 { success: false, error: { code: NOT_INITIALIZED } }
 */
const notInitialized = core.module.createNotInitializedKit(
  HaiAuditError.NOT_INITIALIZED,
  () => auditM('audit_notInitialized'),
)

// ─── 便捷记录器占位 ───

/** 未初始化时的便捷记录器占位 */
const notInitializedHelper = notInitialized.proxy<AuditHelper>()
const notInitializedBackup = notInitialized.proxy<AuditBackupOperations>()

// ─── 审计服务对象 ───

/**
 * 审计日志服务对象
 *
 * 统一的审计日志访问入口，提供以下功能：
 * - `audit.init()` — 初始化审计模块
 * - `audit.close()` — 关闭模块
 * - `audit.log()` — 记录审计日志
 * - `audit.list()` — 查询审计日志列表
 * - `audit.getUserRecent()` — 获取用户最近活动
 * - `audit.cleanup()` — 清理旧日志
 * - `audit.getStats()` — 获取统计数据
 * - `audit.helper` — 便捷记录器
 * - `audit.isInitialized` — 初始化状态
 * @example
 * ```ts
 * import { audit } from '@h-ai/audit'
 * import { core } from '@h-ai/core'
 * import { reldb, type ReldbConfigInput } from '@h-ai/reldb'
 * async function recordCreation(config: ReldbConfigInput) {
 *   const database = await reldb.init(config)
 *   if (!database.success) return database
 *   try {
 *     const initialized = await audit.init()
 *     if (!initialized.success) return initialized
 *     const logged = await audit.log({ action: 'create', resource: 'orders', resourceId: 'order_1' })
 *     if (logged.success) core.logger.info('Audit recorded', { id: logged.data.id })
 *     return logged
 *   } finally {
 *     const auditClosed = await audit.close()
 *     if (!auditClosed.success) return auditClosed // 保留依赖连接，修复后重试关闭。
 *     const databaseClosed = await reldb.close()
 *     if (!databaseClosed.success) return databaseClosed
 *   }
 * }
 * ```
 */
export const audit: AuditFunctions = {
  withContext: withAuditContext,
  /**
   * 初始化审计模块
   *
   * 会先关闭已有实例（如已初始化），再用新配置重新初始化。
   * 等待 AuditLogRepository / BaseReldbCrudRepository 完成建表后才发布实例。
   * 依赖 @h-ai/reldb 已初始化。
   *
   * @param config - 初始化配置（可选，所有字段均有默认值）
   * @returns 成功时返回 ok(undefined)；失败时返回 CONFIG_ERROR
   *
   * @example
   * ```ts
   * const result = await audit.init()
   * if (!result.success) {
   *   logger.error('Audit init failed', { error: result.error.message })
   * }
   * ```
   */
  async init(config?: AuditInitConfigInput): Promise<HaiResult<void>> {
    // 并发初始化防护：避免多次 init 同时执行导致资源泄漏
    if (initInProgress) {
      logger.warn('Audit init already in progress, skipping concurrent call')
      return err(
        HaiAuditError.INIT_IN_PROGRESS,
        auditM('audit_initInProgress'),
      )
    }
    initInProgress = true
    const generation = ++lifecycleGeneration

    try {
      if (currentRepo) {
        logger.warn('Audit module is already initialized, reinitializing')
        currentRepo = null
        currentWriter = null
        capturePolicy = null
        currentHelper = null
        const closingBackup = currentBackup
        currentBackup = null
        const closingAlerts = currentAlerts
        currentAlerts = null
        await closingAlerts?.close()
        await closingBackup?.close()
        await Promise.allSettled([...inFlightWrites])
      }

      logger.info('Initializing audit module')

      const parseResult = AuditInitConfigSchema.safeParse(config ?? {})
      if (!parseResult.success) {
        logger.error('Audit config validation failed', { error: parseResult.error.message })
        return err(
          HaiAuditError.CONFIG_ERROR,
          auditM('audit_configError', { params: { error: parseResult.error.message } }),
          parseResult.error,
        )
      }
      const parsed = parseResult.data
      if (parsed.alerts.enabled && (!config?.reach?.isInitialized || parsed.alerts.rules.some(rule => rule.targets.some(target => !config.reach?.config?.providers.some(provider => provider.name === target.provider)))))
        return err(HaiAuditError.CONFIG_ERROR, auditM('audit_alertReachRequired'))
      if (parsed.backup.enabled && !config?.storage?.isInitialized)
        return err(HaiAuditError.CONFIG_ERROR, auditM('audit_backupStorageRequired'))
      if (parsed.backup.enabled && config?.storage?.config?.type === 's3' && config.storage.config.publicUrl)
        return err(HaiAuditError.CONFIG_ERROR, auditM('audit_backupPrivateStorageRequired'))

      const identifierResult = validateIdentifiers([parsed.userTable, parsed.userIdColumn, parsed.userNameColumn])
      if (!identifierResult.success) {
        logger.error('Audit config contains invalid identifiers', { error: identifierResult.error.message })
        return err(
          HaiAuditError.CONFIG_ERROR,
          auditM('audit_configError', { params: { error: identifierResult.error.message } }),
          identifierResult.error,
        )
      }

      const migrated = await migrateAudit()
      if (!migrated.success)
        return migrated
      const candidate = new AuditLogRepository({
        userTable: parsed.userTable,
        userIdColumn: parsed.userIdColumn,
        userNameColumn: parsed.userNameColumn,
      })
      const ready = await candidate.ready()
      if (!ready.success) {
        return err(HaiAuditError.CONFIG_ERROR, auditM('audit_initFailed', { params: { error: ready.error.message } }), ready.error)
      }
      const protection = await migrateAudit()
      if (!protection.success)
        return protection
      const configured = await configureAuditRetention(parsed.retention)
      if (!configured.success)
        return configured
      if (generation !== lifecycleGeneration)
        return err(HaiAuditError.NOT_INITIALIZED, auditM('audit_notInitialized'))
      // 候选仓库只拥有schema就绪Promise，不拥有共享reldb连接；成功屏障后才发布。
      currentRepo = candidate
      currentWriter = createAuditWriter(candidate, parsed)
      capturePolicy = parsed.capture
      currentHelper = createHelper(input => audit.log(input))
      currentBackup = createAuditBackup({ repository: candidate, config: parsed.backup, storage: config?.storage, capture: (input, options) => audit.capture(input, options) })
      currentAlerts = createAuditAlerts({ config: parsed.alerts, reach: config?.reach, log: currentWriter })

      logger.info('Audit module initialized')
      return ok(undefined)
    }
    catch (error) {
      logger.error('Audit module initialization failed', { error })
      return err(
        HaiAuditError.CONFIG_ERROR,
        auditM('audit_initFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
        error,
      )
    }
    finally {
      initInProgress = false
    }
  },

  /** 当前是否已初始化 */
  get isInitialized(): boolean {
    return currentRepo !== null
  },

  /**
   * 记录一条审计日志
   *
   * @param input - 日志内容（action 和 resource 为必填）
   * @returns 成功时返回创建的 AuditLog；未初始化时返回 NOT_INITIALIZED
   */
  log(input: CreateAuditLogInput, tx?: DmlWithTxOperations): Promise<HaiResult<AuditLog>> {
    if (!currentRepo) {
      return Promise.resolve(notInitialized.result())
    }

    const operation = currentWriter!(input, tx)
    inFlightWrites.add(operation)
    void operation.then(() => inFlightWrites.delete(operation), () => inFlightWrites.delete(operation))
    return operation
  },

  async capture(input, options): Promise<HaiResult<void>> {
    if (!currentRepo)
      return notInitialized.result()
    if (!capturePolicy?.enabled || (options?.read && !capturePolicy.includeReads && (!input.outcome || input.outcome === 'success')))
      return ok(undefined)
    const written = await audit.log(input, options?.tx)
    return written.success ? ok(undefined) : written
  },

  /**
   * 分页查询审计日志列表（含用户名 LEFT JOIN）
   *
   * @param options - 过滤条件与分页参数
   * @returns 成功时返回 PaginatedResult（items/total/page/pageSize）；未初始化时返回 NOT_INITIALIZED
   */
  list(options?: ListAuditLogsOptions): Promise<HaiResult<PaginatedResult<AuditLogWithUser>>> {
    if (!currentRepo) {
      return Promise.resolve(notInitialized.result())
    }
    if (!validAuditQuery(options))
      return Promise.resolve(err(HaiAuditError.QUERY_FAILED, auditM('audit_invalidInput', { params: { field: 'query', reason: auditM('audit_queryInvalid') } })))

    if (options?.startDate && options?.endDate && options.startDate > options.endDate) {
      return Promise.resolve(err(
        HaiAuditError.QUERY_FAILED,
        auditM('audit_invalidInput', { params: { field: 'dateRange', reason: 'startDate must be before endDate' } }),
      ))
    }

    return currentRepo.listWithUser(options)
  },

  /**
   * 获取指定用户的最近活动记录
   *
   * @param userId - 用户 ID
   * @param limit - 最大返回条数，默认 10
   * @returns 成功时返回 AuditLog 数组；未初始化时返回 NOT_INITIALIZED
   */
  getUserRecent(userId: string, limit?: number): Promise<HaiResult<AuditLog[]>> {
    if (!currentRepo) {
      return Promise.resolve(notInitialized.result())
    }

    if (!isNonEmptyString(userId)) {
      return Promise.resolve(err(
        HaiAuditError.QUERY_FAILED,
        auditM('audit_invalidInput', { params: { field: 'userId', reason: 'must be non-empty string' } }),
      ))
    }

    if (typeof limit === 'number' && (!Number.isInteger(limit) || limit <= 0)) {
      return Promise.resolve(err(
        HaiAuditError.QUERY_FAILED,
        auditM('audit_invalidInput', { params: { field: 'limit', reason: 'must be a positive integer' } }),
      ))
    }

    return currentRepo.getUserRecent(userId, limit)
  },

  /**
   * 清理指定天数之前的旧日志
   *
   * @param olderThanDays - 保留天数，默认 90
   * @returns 成功时返回删除的记录数；未初始化时返回 NOT_INITIALIZED
   */
  cleanup(olderThanDays?: number): Promise<HaiResult<number>> {
    if (!currentRepo) {
      return Promise.resolve(notInitialized.result())
    }

    if (typeof olderThanDays === 'number' && (!Number.isInteger(olderThanDays) || olderThanDays < 0)) {
      return Promise.resolve(err(
        HaiAuditError.CLEANUP_FAILED,
        auditM('audit_invalidInput', { params: { field: 'olderThanDays', reason: 'must be a non-negative integer' } }),
      ))
    }

    return currentRepo.cleanupOld(olderThanDays)
  },

  /**
   * 获取指定天数内的操作统计（按 action 分组计数）
   *
   * @param days - 统计天数，默认 7
   * @returns 成功时返回 AuditStatItem 数组；未初始化时返回 NOT_INITIALIZED
   */
  getStats(days?: number, filters?: Pick<ListAuditLogsOptions, 'category' | 'outcome' | 'severity' | 'scopeId' | 'userId' | 'resource'>): Promise<HaiResult<AuditStatItem[]>> {
    if (!currentRepo) {
      return Promise.resolve(notInitialized.result())
    }
    if (!validAuditQuery(filters))
      return Promise.resolve(err(HaiAuditError.STATS_FAILED, auditM('audit_invalidInput', { params: { field: 'query', reason: auditM('audit_queryInvalid') } })))

    if (typeof days === 'number' && (!Number.isInteger(days) || days < 0)) {
      return Promise.resolve(err(
        HaiAuditError.STATS_FAILED,
        auditM('audit_invalidInput', { params: { field: 'days', reason: 'must be a non-negative integer' } }),
      ))
    }

    return currentRepo.getStats(days, filters)
  },

  /**
   * 便捷记录器
   *
   * 未初始化时调用任意方法均返回 NOT_INITIALIZED 错误。
   */
  get helper(): AuditHelper {
    if (!currentHelper) {
      return notInitializedHelper
    }
    return currentHelper
  },

  get backup(): AuditBackupOperations {
    return currentBackup?.operations ?? notInitializedBackup
  },

  checkAlerts(options) {
    return currentAlerts ? currentAlerts.check(options) : Promise.resolve(notInitialized.result())
  },

  get schedulerPlan(): AuditFunctions['schedulerPlan'] {
    const backup = currentBackup?.schedule
    const alerts = currentAlerts?.schedule
    if (!backup && !alerts)
      return null
    return {
      tasks: [...(backup?.tasks ?? []), ...(alerts?.tasks ?? [])].map(task => ({ ...task })),
      hooks: { onTaskExecute: async (input) => {
        if (input.context.taskId === 'hai-audit-backup' && backup)
          return backup.hooks.onTaskExecute!(input)
        if (input.context.taskId === 'hai-audit-alerts' && alerts)
          return alerts.hooks.onTaskExecute!(input)
        throw core.error.buildHaiErrorInst(HaiAuditError.CONFIG_ERROR, auditM('audit_unknownTask'))
      } },
    }
  },

  /**
   * 关闭审计模块，释放内部状态
   */
  async close(): Promise<HaiResult<void>> {
    lifecycleGeneration++
    logger.info('Closing audit module')
    currentRepo = null
    currentWriter = null
    capturePolicy = null
    currentHelper = null
    const closingBackup = currentBackup
    currentBackup = null
    const closingAlerts = currentAlerts
    currentAlerts = null
    await closingAlerts?.close()
    await closingBackup?.close()
    await Promise.allSettled([...inFlightWrites])
    logger.info('Audit module closed')
    return ok(undefined)
  },
}
