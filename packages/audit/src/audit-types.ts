/**
 * @h-ai/audit — 公共类型定义
 *
 * 审计模块对外类型：错误接口、实体类型、操作接口、函数接口。
 * @module audit-types
 */

import type { ErrorInfo, HaiResult, PaginatedResult, PaginationOptionsInput } from '@h-ai/core'
import type { DmlWithTxOperations } from '@h-ai/reldb'
import type { SchedulerInitInput } from '@h-ai/scheduler'
import type { AuditInitConfigInput } from './audit-config.js'
import { core } from '@h-ai/core'

// ─── 错误定义（照 @h-ai/core 范式） ───

const AuditErrorInfo = {
  LOG_FAILED: '001:500',
  QUERY_FAILED: '002:500',
  CLEANUP_FAILED: '003:500',
  STATS_FAILED: '004:500',
  INIT_IN_PROGRESS: '005:409',
  NOT_INITIALIZED: '010:500',
  CONFIG_ERROR: '012:500',
  BACKUP_DISABLED: '020:403',
  BACKUP_FAILED: '021:500',
  BACKUP_INVALID: '022:400',
  BACKUP_CONFLICT: '023:409',
  ALERTS_DISABLED: '024:403',
  ALERTS_FAILED: '025:500',
} as const satisfies ErrorInfo

/**
 * 审计初始化、写入、查询和清理失败的稳定错误定义。
 * @example
 * ```ts
 * import { HaiAuditError } from '@h-ai/audit'
 * import { err } from '@h-ai/core'
 * const failed = err(HaiAuditError.NOT_INITIALIZED, 'Audit is not initialized')
 * if (!failed.success) failed.error.code
 * ```
 */
export const HaiAuditError = core.error.buildHaiErrorsDef('audit', AuditErrorInfo)

// ─── 实体类型 ───

/**
 * 事件发生时的最小身份快照，不承载授权真值或凭据。
 * @example
 * ```ts
 * import type { AuditActorSnapshot } from '@h-ai/audit'
 * const actor: AuditActorSnapshot = { id: 'user-1', username: 'alice', roles: ['auditor'] }
 * ```
 */
export interface AuditActorSnapshot {
  id: string
  username?: string
  displayName?: string
  roles?: string[]
}

/**
 * 异步请求的审计上下文；不替代会话校验或权限守卫。
 * @example
 * ```ts
 * import type { AuditContext } from '@h-ai/audit'
 * const context: AuditContext = { requestId: 'request-1', actor: { id: 'user-1', username: 'alice' }, ipAddress: '192.0.2.8' }
 * ```
 */
export interface AuditContext {
  actor?: AuditActorSnapshot | null
  category?: 'system' | 'business'
  requestId?: string
  traceId?: string
  scopeId?: string
  ipAddress?: string
  userAgent?: string
}

/**
 * 分类、结果、等级及事件身份；旧记录升级前未知的值保持 null。
 * @example
 * ```ts
 * import type { AuditEventFields } from '@h-ai/audit'
 * const fields: AuditEventFields = { category: 'system', outcome: 'denied', severity: 'warning', requestId: 'request-1' }
 * ```
 */
export interface AuditEventFields {
  category?: 'system' | 'business' | null
  outcome?: 'success' | 'failure' | 'denied' | null
  severity?: 'info' | 'warning' | 'error' | 'critical' | null
  requestId?: string | null
  traceId?: string | null
  scopeId?: string | null
  actorSnapshot?: AuditActorSnapshot | null
}

/**
 * 审计日志记录
 *
 * 表示一条已持久化的审计日志条目。
 * @example
 * ```ts
 * import type { AuditLog } from '@h-ai/audit'
 * const record: AuditLog = { id: 'audit_example', userId: 'user_1', action: 'create', resource: 'orders', resourceId: 'order_1', details: null, ipAddress: null, userAgent: null, createdAt: new Date() }
 * ```
 */
export interface AuditLog extends AuditEventFields {
  /** 审计日志 ID，格式为 `audit_` 前缀 + 随机串 */
  id: string
  /** 操作用户 ID；系统操作时为 null */
  userId: string | null
  /** 操作类型（如 login / logout / create / update / delete） */
  action: string
  /** 资源类型（如 auth / users / roles） */
  resource: string
  /** 资源 ID；不涉及特定资源时为 null */
  resourceId: string | null
  /** 操作详情（JSON 字符串）；无详情时为 null */
  details: string | null
  /** 客户端 IP 地址；未知时为 null */
  ipAddress: string | null
  /** 客户端 User-Agent；未知时为 null */
  userAgent: string | null
  /** 创建时间 */
  createdAt: Date
}

/**
 * 审计日志记录（含用户名）
 *
 * 新记录使用事件时身份快照；无快照的历史记录才保留旧的用户表关联展示。
 * @example
 * ```ts
 * import type { AuditLogWithUser } from '@h-ai/audit'
 * const record: AuditLogWithUser = { id: 'audit_example', userId: 'user_1', action: 'create', resource: 'orders', resourceId: 'order_1', details: null, ipAddress: null, userAgent: null, createdAt: new Date() , username: 'alice' }
 * ```
 */
export interface AuditLogWithUser extends AuditLog {
  /** 操作用户的用户名；用户不存在或系统操作时为 null */
  username: string | null
}

/**
 * 创建审计日志输入
 *
 * 调用 {@link AuditFunctions.log} 时传入的参数。
 * 仅 `action` 和 `resource` 为必填。
 * @example
 * ```ts
 * import type { CreateAuditLogInput } from '@h-ai/audit'
 * const record: CreateAuditLogInput = { userId: 'user_1', action: 'create', resource: 'orders', resourceId: 'order_1', details: { status: 'pending' } }
 * ```
 */
export interface CreateAuditLogInput extends AuditEventFields {
  /** 操作用户 ID；系统操作可省略 */
  userId?: string | null
  /** 操作类型（如 login / create / update / delete） */
  action: string
  /** 资源类型（如 auth / users / roles） */
  resource: string
  /** 资源 ID；不涉及特定资源时可省略 */
  resourceId?: string | null
  /** 操作详情对象；密码、token、secret 等凭证类字段会先自动脱敏，再 JSON 序列化存储 */
  details?: Record<string, unknown> | null
  /** 客户端 IP 地址 */
  ipAddress?: string | null
  /** 客户端 User-Agent */
  userAgent?: string | null
}

/**
 * 审计日志列表查询选项
 *
 * 所有字段均为可选，不传则不过滤。
 * @example
 * ```ts
 * import type { ListAuditLogsOptions } from '@h-ai/audit'
 * const record: ListAuditLogsOptions = { action: 'create', resource: 'orders', page: 1, pageSize: 20 }
 * ```
 */
export interface ListAuditLogsOptions extends PaginationOptionsInput {
  /** 按可信入口生成或校验的请求/追踪编号定位关联事件。 */
  requestId?: string
  traceId?: string
  category?: 'system' | 'business'
  outcome?: 'success' | 'failure' | 'denied'
  severity?: 'info' | 'warning' | 'error' | 'critical'
  scopeId?: string
  sortBy?: 'createdAt' | 'action' | 'resource' | 'category' | 'outcome' | 'severity'
  sortDirection?: 'asc' | 'desc'
  /** 按用户 ID 过滤 */
  userId?: string
  /** 按操作类型过滤（精确匹配） */
  action?: string
  /** 按资源类型过滤（精确匹配） */
  resource?: string
  /** 起始时间（含），只返回此时间之后的日志 */
  startDate?: Date
  /** 结束时间（含），只返回此时间之前的日志 */
  endDate?: Date
}

/**
 * 审计统计结果项
 *
 * 按操作类型（action）分组的统计条目。
 * @example
 * ```ts
 * import type { AuditStatItem } from '@h-ai/audit'
 * const record: AuditStatItem = { action: 'create', count: 12 }
 * ```
 */
export interface AuditStatItem {
  /** 操作类型 */
  action: string
  /** 该操作在统计时间范围内的次数 */
  count: number
}

/**
 * CRUD 审计操作输入
 *
 * 调用 {@link AuditHelper.crud} 时传入的参数。
 * @example
 * ```ts
 * import type { CrudAuditInput } from '@h-ai/audit'
 * const record: CrudAuditInput = { userId: 'user_1', action: 'update', resource: 'orders', resourceId: 'order_1', details: { status: 'paid' } }
 * ```
 */
export interface CrudAuditInput extends AuditEventFields {
  /** 操作用户 ID（系统操作传 null） */
  userId?: string | null
  /** 操作类型 */
  action: 'create' | 'read' | 'update' | 'delete'
  /** 资源类型（如 users / roles） */
  resource: string
  /** 资源 ID（可选） */
  resourceId?: string
  /** 操作详情对象（可选） */
  details?: Record<string, unknown>
  /** 客户端 IP（可选） */
  ip?: string
  /** 客户端 User-Agent（可选） */
  ua?: string
}

// ─── 便捷操作接口 ───

/**
 * 审计便捷记录器
 *
 * 封装常见审计场景（认证、CRUD），简化调用方代码。
 * 通过 {@link AuditFunctions.helper} 访问。
 * @example
 * ```ts
 * import type { AuditHelper } from '@h-ai/audit'
 * // helper 来自已初始化的 audit；数据库生命周期归调用方。
 * async function recordLogin(helper: AuditHelper) {
 *   const result = await helper.login('user_1', '127.0.0.1')
 *   return result.success ? 'recorded' : result.error.message
 * }
 * ```
 */
export interface AuditHelper {
  /**
   * 记录用户登录
   *
   * @param userId - 登录用户 ID
   * @param ip - 客户端 IP（可选）
   * @param ua - 客户端 User-Agent（可选）
   */
  login: (userId: string, ip?: string, ua?: string) => Promise<HaiResult<void>>
  /**
   * 记录用户登出
   *
   * @param userId - 登出用户 ID
   * @param ip - 客户端 IP（可选）
   * @param ua - 客户端 User-Agent（可选）
   */
  logout: (userId: string, ip?: string, ua?: string) => Promise<HaiResult<void>>
  /**
   * 记录用户注册
   *
   * @param userId - 注册用户 ID
   * @param ip - 客户端 IP（可选）
   * @param ua - 客户端 User-Agent（可选）
   */
  register: (userId: string, ip?: string, ua?: string) => Promise<HaiResult<void>>
  /**
   * 记录密码重置请求
   *
   * @param email - 请求重置的邮箱地址
   * @param ip - 客户端 IP（可选）
   * @param ua - 客户端 User-Agent（可选）
   */
  passwordResetRequest: (email: string, ip?: string, ua?: string) => Promise<HaiResult<void>>
  /**
   * 记录密码重置完成
   *
   * @param userId - 重置密码的用户 ID（匿名重置场景传 null）
   * @param ip - 客户端 IP（可选）
   * @param ua - 客户端 User-Agent（可选）
   */
  passwordResetComplete: (userId: string | null, ip?: string, ua?: string) => Promise<HaiResult<void>>
  /**
   * 记录 CRUD 操作
   *
   * @param input - CRUD 审计输入（action 和 resource 为必填）
   *
   * @example
   * ```ts
   * await audit.helper.crud({ userId: 'user_1', action: 'create', resource: 'users', resourceId: 'user_2' })
   * ```
   */
  crud: (input: CrudAuditInput) => Promise<HaiResult<void>>
}

// ─── 函数接口 ───

/**
 * 审计模块函数接口
 *
 * 统一的审计日志访问入口。
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
export interface AuditFunctions {
  /** 手动流式归档与完整性核对，关闭后返回未初始化。 */
  readonly backup: AuditBackupOperations
  /** 宿主显式装配的备份/告警任务计划；没有启用自动任务时为 null。 */
  readonly schedulerPlan: Required<Pick<SchedulerInitInput, 'tasks' | 'hooks'>> | null
  /** 检查已提交事件的本窗口和前一窗口；每个规则/目标/窗口只尝试一次外部通知。 */
  checkAlerts: (options?: { signal?: AbortSignal }) => Promise<HaiResult<AuditAlertReport>>
  /**
   * 在异步隔离的审计上下文中执行操作；同步或异步结果原样返回，调用方异常原样传播。
   * @param context - 可信宿主解析的关联字段与身份快照。
   * @param operation - 业务操作，内部 audit.log 自动补齐未显式指定的字段。
   * @returns 业务操作的原始返回值或 Promise。
   */
  withContext: <T>(context: AuditContext, operation: () => T) => T
  /**
   * 初始化审计模块
   *
   * @param config - 初始化配置（可选，所有字段均有默认值）
   * @returns 成功时返回 ok(undefined)；失败时返回 CONFIG_ERROR
   */
  init: (config?: AuditInitConfigInput) => Promise<HaiResult<void>>
  /**
   * 关闭审计模块，释放内部状态
   */
  close: () => Promise<HaiResult<void>>
  /** 当前是否已初始化 */
  readonly isInitialized: boolean
  /**
   * 记录一条审计日志
   *
   * @param input - 日志内容（action 和 resource 为必填）
   * @param tx - 可选的调用者事务；提交或回滚同时决定事件，不在此提交事务。
   * @returns 成功时返回创建的 AuditLog；失败时返回 LOG_FAILED
   */
  log: (input: CreateAuditLogInput, tx?: DmlWithTxOperations) => Promise<HaiResult<AuditLog>>
  /**
   * 框架入口自动记录。模块未初始化或关闭自动采集时跳过；默认跳过成功读取。
   * 不改变原业务结果；调用方仍须检查记录失败，避免静默丢失审计。
   * @param input - 仅包含安全的事件字段，不应复制请求体或凭据。
   * @param options - 入口是否属于读取操作；失败和拒绝的读取始终采集。
   * @param options.read - 读取标志；默认 false。
   * @param options.tx - 可选的调用者事务；回滚不会留下成功变更事件。
   * @returns 持久化成功或按配置跳过时成功，否则返回审计错误。
   */
  capture: (input: CreateAuditLogInput, options?: { read?: boolean, tx?: DmlWithTxOperations }) => Promise<HaiResult<void>>
  /**
   * 分页查询审计日志列表（含用户名 LEFT JOIN）
   *
   * @param options - 查询过滤与分页选项
   * @returns 成功时返回 PaginatedResult（items/total/page/pageSize）；失败时返回 QUERY_FAILED
   */
  list: (options?: ListAuditLogsOptions) => Promise<HaiResult<PaginatedResult<AuditLogWithUser>>>
  /**
   * 获取指定用户的最近活动记录
   *
   * @param userId - 用户 ID
   * @param limit - 最大返回条数，默认 10
   * @returns 成功时返回 AuditLog 数组；失败时返回 QUERY_FAILED
   */
  getUserRecent: (userId: string, limit?: number) => Promise<HaiResult<AuditLog[]>>
  /**
   * 清理指定天数之前的旧日志
   *
   * @param olderThanDays - 保留天数，默认 90；清理此天数之前的日志
   * @returns 成功时返回删除的记录数；失败时返回 CLEANUP_FAILED
   */
  cleanup: (olderThanDays?: number) => Promise<HaiResult<number>>
  /**
   * 获取指定天数内的操作统计（按 action 分组计数）
   *
   * @param days - 统计天数，默认 7
   * @returns 成功时返回 AuditStatItem 数组；失败时返回 STATS_FAILED
   */
  getStats: (days?: number, filters?: Pick<ListAuditLogsOptions, 'category' | 'outcome' | 'severity' | 'scopeId' | 'userId' | 'resource'>) => Promise<HaiResult<AuditStatItem[]>>
  /**
   * 便捷记录器，封装常见审计场景
   *
   * 未初始化时调用任意方法均返回 NOT_INITIALIZED 错误。
   */
  readonly helper: AuditHelper
}

/**
 * 私有归档键前缀；宿主公开文件入口须拒绝此命名空间，即使备份策略已关闭。
 * @example
 * ```ts
 * import { AUDIT_BACKUP_PREFIX } from '@h-ai/audit'
 * const key = `${AUDIT_BACKUP_PREFIX}daily-archive.jsonl`
 * ```
 */
export const AUDIT_BACKUP_PREFIX = 'hai-private/audit-backups/'

/**
 * 归档扫描条件。缺省截止时刻在开始时固定，过程中新增日志交给下一次归档。
 * @example
 * ```ts
 * import type { AuditBackupOptions } from '@h-ai/audit'
 * const options: AuditBackupOptions = { id: 'daily-archive', from: new Date('2026-01-01T00:00:00Z') }
 * ```
 */
export interface AuditBackupOptions {
  /** 同一业务执行使用稳定 ID；省略时生成随机 ID。已有 ID 仅核对并复用完整归档。 */
  id?: string
  from?: Date
  to?: Date
  signal?: AbortSignal
}

/**
 * 完整归档回执；SHA-256 校验内容完整性，不能替代独立存储权限或真实性认证。
 * @example
 * ```ts
 * import { audit, type AuditBackupInfo } from '@h-ai/audit'
 * // 宿主已初始化 RelDB、私有 Storage 和 Audit。
 * const result = await audit.backup.run()
 * if (result.success) { const receipt: AuditBackupInfo = result.data; void receipt.sha256 }
 * ```
 */
export interface AuditBackupInfo {
  id: string
  key: string
  recordCount: number
  sha256: string
  createdAt: Date
  cutoff: Date
}

/**
 * 备份不覆盖在线审计。JSONL 归档可核对后用于离线恢复/独立查询存储。
 * @example
 * ```ts
 * import { audit, type AuditBackupOperations } from '@h-ai/audit'
 * const operations: AuditBackupOperations = audit.backup
 * const result = await operations.run({ id: 'daily-archive' })
 * if (!result.success) result.error.code
 * ```
 */
export interface AuditBackupOperations {
  /** 创建或核对并复用同一 ID 的完整归档；已有归档不覆盖，输入无效、取消或存储失败返回失败。 */
  run: (options?: AuditBackupOptions) => Promise<HaiResult<AuditBackupInfo>>
  /** 有界流式核对规范、记录数和校验和；只允许读取私有归档命名空间。 */
  verify: (key: string, options?: { signal?: AbortSignal }) => Promise<HaiResult<AuditBackupInfo>>
}

/**
 * 本次检查的通知提交回执；submitted 不证明收件人已阅读，queued 仅表示 Reach 持久入队。
 * @example
 * ```ts
 * import { audit, type AuditAlertReport } from '@h-ai/audit'
 * const result = await audit.checkAlerts()
 * if (result.success) { const report: AuditAlertReport = result.data; void report.failed }
 * ```
 */
export interface AuditAlertReport {
  submitted: number
  queued: number
  failed: number
  /** 已达到单轮通知上限，后续检查继续领取未尝试目标。 */
  more: boolean
}
