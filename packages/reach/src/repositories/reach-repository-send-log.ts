/**
 * @h-ai/reach — 发送日志存储实现
 *
 * 基于 @h-ai/reldb 的发送日志存储实现。
 * @module reach-repository-send-log
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { CrudPageOptions, CrudQueryOptions, DmlWithTxOperations, ReldbCrudFieldDefinition, ReldbCrudRepository, ReldbFunctions } from '@h-ai/reldb'
import type { ReachQueueFailure, ReachQueueStatus, ReachUnknownResolution } from '../reach-types.js'
import { err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository } from '@h-ai/reldb'

import { reachM } from '../reach-i18n.js'
import { migrateReach } from '../reach-migration.js'
import { HaiReachError } from '../reach-types.js'

// ─── 发送日志实体类型 ───

/**
 * 内部发送日志状态别名，与公共队列状态一致；不把unknown自动降级成pending。
 *
 * @example 模块内部上下文
 * ```ts
 * const status: SendLogStatus = 'unknown'
 * ```
 */
export type SendLogStatus = ReachQueueStatus

/**
 * 内部有界领取参数；owner唯一，now仅测试注入，eligibleBefore固定本轮资格截止避免毒消息自旋。
 *
 * @example 模块内部上下文
 * ```ts
 * const options: SendLogClaimOptions = { limit: 1, lockMs: 600000, eligibleBefore: Date.now() }
 * ```
 */
export interface SendLogClaimOptions {
  /** 单批最多 claim 的记录数 */
  limit?: number
  /** 仅本地 SQLite 测试可注入；共享数据库始终使用执行时钟。 */
  now?: number
  /** 本轮扫描截止时间；重试后 nextAttemptAt 超出本轮时不再重复领取。 */
  eligibleBefore?: number
  /** claim 锁持续时间（毫秒） */
  lockMs?: number
}

/**
 * 内部持久日志实体，包含敏感收件人与正文；仅运维安全投影可对外，绝不把整行写日志。
 * 毫秒时间/次数/BIGINT读取严格映射安全整数number，和模板Date时间列不同。
 *
 * @example 模块内部上下文
 * ```ts
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const created = await createSendLogRepository(reldb)
 *   if (!created.success) throw new Error(created.error.message)
 *   const repository = created.data
 *   const pending = await repository.findPending()
 *   if (!pending.success) throw new Error(pending.error.message)
 *   const row: StoredSendLog | undefined = pending.data[0]
 *   if (row) { const attempts = row.attemptCount }
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export interface StoredSendLog {
  /** 自增主键；驱动 BIGSERIAL/BIGINT 值读取后校验为安全整数 number。 */
  id: number
  /** 入队回执 UUID；延迟消息创建时写入，可用 queue_id 列追踪持久化状态。 */
  queueId: string | null
  /** Provider 名称 */
  provider: string
  /** 接收方地址 */
  toAddr: string
  /** 邮件主题 */
  subject: string | null
  /** 消息正文 */
  body: string | null
  /** 模板名称 */
  template: string | null
  /** 模板变量 JSON */
  varsJson: string | null
  /** 扩展参数 JSON */
  extraJson: string | null
  /** 发送状态 */
  status: SendLogStatus
  /** 已开始的投递是否可由接收端持久幂等保护；用于崩溃恢复决策。 */
  retrySafe?: boolean
  /** 已领取次数；领取时原子递增，崩溃恢复同样消耗预算。 */
  attemptCount: number
  /** 入队时保存的自动领取次数上限。 */
  maxAttempts: number
  /** 下次可领取时间（Unix 毫秒；BIGINT 安全 number）。 */
  nextAttemptAt: number
  /** 入队时保存的首次退避毫秒数。 */
  retryDelayMs: number
  /** 入队时保存的指数退避上限毫秒数。 */
  maxRetryDelayMs: number
  /** 不含消息正文的最近失败分类。 */
  lastFailure: ReachQueueFailure | null
  /** Provider 返回的消息 ID */
  messageId: string | null
  /** 当前 claim owner（处理中时存在） */
  processingOwner?: string
  /** 当前 claim 过期时间（Unix 时间戳毫秒） */
  lockedUntil?: number
  /** 创建时间（Unix 时间戳毫秒；BIGINT 读取后校验为安全整数 number）。 */
  createdAt: number
  /** 最近更新时间（Unix 时间戳毫秒；BIGINT 读取后校验为安全整数 number）。 */
  updatedAt?: number
}

// ─── 发送日志存储接口 ───

/**
 * 内部共享数据库队列/日志仓库；逐条条件领取和sending门闩决定资格，进程cache锁仅减少扫描。
 * 非幂等sending过期隔离unknown；有限重试/退避持久化，dead/unknown只走受信条件管理入口。
 *
 * @example 模块内部上下文
 * ```ts
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const created = await createSendLogRepository(reldb)
 *   if (!created.success) throw new Error(created.error.message)
 *   const repository = created.data
 *   const claimed = await repository.claimPendingBatch('worker:' + crypto.randomUUID(), { limit: 1 })
 *   if (!claimed.success) throw new Error(claimed.error.message)
 *   const count = claimed.data.length
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export interface SendLogRepository extends ReldbCrudRepository<StoredSendLog> {
  /** 只结算无载荷的凭据回执；不覆盖已恢复或人工裁定的状态。 */
  settleSensitive: (queueId: string, status: 'sent' | 'unknown' | 'discarded', messageId?: string) => Promise<HaiResult<void>>
  /**
   * 获取所有待发送记录（按创建时间升序）
   * @param tx - 可选受控数据库事务。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example 模块内部上下文
   * ```ts
   * async function pending(repository: SendLogRepository) {
   *   const rows = await repository.findPending()
   *   if (!rows.success) throw new Error(rows.error.message)
   *   return rows.data
   *   // 普通查询没有投递权，发送前必须claim。
   * }
   * ```
   */
  findPending: (tx?: DmlWithTxOperations) => Promise<HaiResult<StoredSendLog[]>>
  /** 只供扫描批次冻结资格截止点；租约授权仍在最终 SQL 内判断。 */
  currentTime: () => Promise<HaiResult<number>>

  /**
   * 按创建时间顺序 claim 一批待发送记录。
   * 可接管已过期 processing 和接收端幂等的 sending；非幂等 sending 过期后隔离为 unknown。
   * PostgreSQL / MySQL 优先使用行锁 + `SKIP LOCKED` 降低多节点争抢；
   * SQLite 不支持该能力时退回条件更新（compare-and-set）模式。
   * @param owner - 当前唯一领取凭据，不记录或暴露给客户端。
   * @param options - 实际操作输入，按本方法约束校验。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example 模块内部上下文
   * ```ts
   * async function claim(repository: SendLogRepository) {
   *   const owner = 'worker:' + crypto.randomUUID()
   *   const rows = await repository.claimPendingBatch(owner, { limit: 1, lockMs: 600000 })
   *   if (!rows.success) throw new Error(rows.error.message)
   *   return { owner, rows: rows.data }
   * }
   * ```
   */
  claimPendingBatch: (owner: string, options?: SendLogClaimOptions) => Promise<HaiResult<StoredSendLog[]>>

  /**
   * 取消一次领取并按失败策略退避/死信；不立即重排队，不绕过次数上限。
   * 仅有效 owner 可以释放 processing 或可安全重试的 sending；未知外部副作用不能重排队。
   * @param id - 已读取/领取的持久记录主键。
   * @param owner - 当前唯一领取凭据，不记录或暴露给客户端。
   * @param tx - 可选受控数据库事务。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example 模块内部上下文
   * ```ts
   * async function release(repository: SendLogRepository, row: StoredSendLog, owner: string) {
   *   const released = await repository.releaseClaim(row.id, owner)
   *   if (!released.success) throw new Error(released.error.message)
   *   // 只用于当前有效owner/安全状态；内部持久退避，不立即热循环重领。
   * }
   * ```
   */
  releaseClaim: (id: number, owner: string, tx?: DmlWithTxOperations) => Promise<HaiResult<void>>

  /**
   * 当前有效 owner 提交失败；永久失败/超限进入 dead，其余按持久策略退避。
   * @param row - 实际操作输入，按本方法约束校验。
   * @param owner - 当前唯一领取凭据，不记录或暴露给客户端。
   * @param reason - 实际操作输入，按本方法约束校验。
   * @param permanent - 实际操作输入，按本方法约束校验。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example 模块内部上下文
   * ```ts
   * async function failed(repository: SendLogRepository, row: StoredSendLog, owner: string) {
   *   const released = await repository.failClaim(row, owner, 'provider_unavailable')
   *   if (!released.success) throw new Error(released.error.message)
   * }
   * ```
   */
  failClaim: (row: StoredSendLog, owner: string, reason: ReachQueueFailure, permanent?: boolean) => Promise<HaiResult<void>>
  /**
   * 根因修复后仅恢复指定版本的 dead，重置次数但保留幂等键和持久策略。
   * @param queueId - 持久UUID回执，不代替运维权限。
   * @param expectedUpdatedAt - 最近读取的更新时间版本，不能使用当前时间替代。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example 模块内部上下文
   * ```ts
   * async function restore(repository: SendLogRepository, row: StoredSendLog) {
   *   if (row.status !== 'dead' || !row.queueId || row.updatedAt === undefined) return
   *   // 调用前已完成可信运维授权、根因修复与外部效果核对。
   *   const restored = await repository.requeueDead(row.queueId, row.updatedAt)
   *   if (!restored.success) throw new Error(restored.error.message)
   * }
   * ```
   */
  requeueDead: (queueId: string, expectedUpdatedAt: number) => Promise<HaiResult<void>>

  /**
   * 发送前原子校验有效 owner 并持久化 sending；失败时绝不能调用外部 Provider。
   * @param id - 已读取/领取的持久记录主键。
   * @param owner - 当前唯一领取凭据，不记录或暴露给客户端。
   * @param retrySafe - 真实接收端持久幂等能力声明。
   * @param lockMs - 实际操作输入，按本方法约束校验。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example 模块内部上下文
   * ```ts
   * async function begin(repository: SendLogRepository, row: StoredSendLog, owner: string, receiverDeduplicates: boolean) {
   *   const started = await repository.beginDelivery(row.id, owner, receiverDeduplicates)
   *   if (!started.success) return started
   *   // 仅此success分支可调用对应Provider；receiverDeduplicates须来自真实能力声明。
   *   return started
   * }
   * ```
   */
  beginDelivery: (id: number, owner: string, retrySafe: boolean, lockMs?: number) => Promise<HaiResult<void>>
  /**
   * 仅续租尚未到期且仍由该 owner 持有的记录；过期后不得复活旧 owner。
   * @param id - 已读取/领取的持久记录主键。
   * @param owner - 当前唯一领取凭据，不记录或暴露给客户端。
   * @param lockMs - 实际操作输入，按本方法约束校验。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example 模块内部上下文
   * ```ts
   * async function renew(repository: SendLogRepository, row: StoredSendLog, owner: string) {
   *   const result = await repository.renewClaim(row.id, owner)
   *   if (!result.success) return result
   *   return result
   *   // 续租失败不能恢复旧owner，已开始的外部效果按幂等/unknown边界处置。
   * }
   * ```
   */
  renewClaim: (id: number, owner: string, lockMs?: number) => Promise<HaiResult<void>>
  /**
   * 标记无法确定外部结果的记录，停止自动投递；仅当前 owner 可以提交。
   * @param id - 已读取/领取的持久记录主键。
   * @param owner - 当前唯一领取凭据，不记录或暴露给客户端。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example 模块内部上下文
   * ```ts
   * async function isolate(repository: SendLogRepository, row: StoredSendLog, owner: string) {
   *   const marked = await repository.markUnknown(row.id, owner)
   *   if (!marked.success) throw new Error(marked.error.message)
   * }
   * ```
   */
  markUnknown: (id: number, owner: string) => Promise<HaiResult<void>>
  /**
   * 人工核对并隔离旧 worker 后裁定 unknown；条件提交阻止并发覆盖。
   * @param queueId - 持久UUID回执，不代替运维权限。
   * @param resolution - 实际操作输入，按本方法约束校验。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example 模块内部上下文
   * ```ts
   * async function resolve(repository: SendLogRepository, queueId: string) {
   *   // 可信运维已授权、隔离旧worker并核对外部记录，不进行自动重发。
   *   const resolved = await repository.resolveUnknown(queueId, { status: 'discarded' })
   *   if (!resolved.success) throw new Error(resolved.error.message)
   * }
   * ```
   */
  resolveUnknown: (queueId: string, resolution: ReachUnknownResolution) => Promise<HaiResult<void>>

  /**
   * 将记录标记为已发送。
   * 仅持有 sending 有效租约的 owner 可以提交；过期 owner 不能覆盖新节点状态。
   * @param id - 已读取/领取的持久记录主键。
   * @param owner - 当前唯一领取凭据，不记录或暴露给客户端。
   * @param messageId - 实际操作输入，按本方法约束校验。
   * @param tx - 可选受控数据库事务。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example 模块内部上下文
   * ```ts
   * async function commit(repository: SendLogRepository, row: StoredSendLog, owner: string, messageId: string) {
   *   const marked = await repository.markSent(row.id, owner, messageId)
   *   if (!marked.success) throw new Error(marked.error.message)
   *   // 提交失败不代表外部未发送，不得盲目重新调用Provider。
   * }
   * ```
   */
  markSent: (id: number, owner: string, messageId?: string, tx?: DmlWithTxOperations) => Promise<HaiResult<void>>
}

// ─── 发送日志存储实现 ───

/** 表名 */
const TABLE_NAME = 'hai_reach_send_log'
const DEFAULT_CLAIM_BATCH_SIZE = 100
const DEFAULT_CLAIM_LOCK_MS = 10 * 60 * 1000
function claimableWhere(clock: string): string {
  return `(attempt_count < max_attempts AND ((status = ? AND next_attempt_at <= ?) OR (status = ? AND updated_at < ? AND (locked_until IS NULL OR locked_until <= ${clock})) OR (status = ? AND updated_at < ? AND retry_safe = TRUE AND locked_until <= ${clock})))`
}

/**
 * 与固定领取SQL一一对应的参数，仅允许pending、过期processing或幂等sending重领。
 * @param eligibleBefore - 固定资格截止，避免本轮新退避消息被立即重复领取。
 * @returns 参数数组，绝不拼接不可信SQL。
 *
 * @example 模块内部上下文
 * ```ts
 * const now = Date.now()
 * const params = claimableParams(now)
 * ```
 */
function claimableParams(eligibleBefore: number): unknown[] {
  return ['pending', eligibleBefore, 'processing', eligibleBefore, 'sending', eligibleBefore]
}

function buildSendLogError<T>(detail: string, cause?: unknown): HaiResult<T> {
  return err(
    HaiReachError.SEND_FAILED,
    reachM('reach_sendFailed', { params: { error: detail } }),
    cause,
  )
}

/**
 * 读取边界统一校验BIGINT时间/次数/策略，支持驱动number/bigint/十进制字符串并拒绝精度丢失。
 * @param row - 驱动返回的日志行；不改写原对象。
 * @returns 安全整数number行或失败，不能静默截断精度。
 *
 * @example 模块内部上下文
 * ```ts
 * function normalize(row: StoredSendLog) {
 *   const result = normalizeSendLog(row)
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
function normalizeSendLog(row: StoredSendLog): HaiResult<StoredSendLog> {
  const normalized = { ...row }
  for (const field of ['id', 'createdAt', 'updatedAt', 'lockedUntil', 'nextAttemptAt', 'attemptCount', 'maxAttempts', 'retryDelayMs', 'maxRetryDelayMs'] as const) {
    const value: unknown = row[field]
    if (value === undefined && (field === 'updatedAt' || field === 'lockedUntil'))
      continue
    const validType = typeof value === 'number' || typeof value === 'bigint'
      || (typeof value === 'string' && /^\d+$/.test(value))
    const integer = validType ? Number(value) : Number.NaN
    if (!Number.isSafeInteger(integer) || integer < 0)
      return buildSendLogError(reachM('reach_invalidStoredInteger', { params: { field } }))
    Object.assign(normalized, { [field]: integer })
  }
  return ok(normalized)
}

/**
 * 批量、分页及claim回读共用同一规范化，任一行无效即失败，不返回混合时间类型。
 * @param rows - 数据库读取行。
 * @returns 规范化数组或原失败。
 *
 * @example 模块内部上下文
 * ```ts
 * function normalizeBatch(rows: StoredSendLog[]) {
 *   const result = normalizeSendLogs(rows)
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
function normalizeSendLogs(rows: StoredSendLog[]): HaiResult<StoredSendLog[]> {
  const normalized: StoredSendLog[] = []
  for (const row of rows) {
    const result = normalizeSendLog(row)
    if (!result.success)
      return result
    normalized.push(result.data)
  }
  return ok(normalized)
}

/** 字段定义 */
const SEND_LOG_FIELDS: ReldbCrudFieldDefinition[] = [
  ...[
    { fieldName: 'attemptCount', columnName: 'attempt_count', value: 0 },
    { fieldName: 'maxAttempts', columnName: 'max_attempts', value: 5 },
    { fieldName: 'retryDelayMs', columnName: 'retry_delay_ms', value: 60_000 },
    { fieldName: 'maxRetryDelayMs', columnName: 'max_retry_delay_ms', value: 3_600_000 },
    { fieldName: 'nextAttemptAt', columnName: 'next_attempt_at', value: 0 },
  ].map(({ fieldName, columnName, value }) => ({
    fieldName,
    columnName,
    def: { type: 'BIGINT' as const, notNull: true, defaultValue: value },
    select: true,
    create: true,
    update: true,
  })),
  {
    fieldName: 'lastFailure',
    columnName: 'last_failure',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'retrySafe',
    columnName: 'retry_safe',
    def: { type: 'BOOLEAN' as const, notNull: true, defaultValue: false },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'queueId',
    columnName: 'queue_id',
    def: { type: 'TEXT' as const, unique: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'id',
    columnName: 'id',
    def: { type: 'INTEGER' as const, primaryKey: true, autoIncrement: true },
    select: true,
    create: false,
    update: false,
  },
  {
    fieldName: 'provider',
    columnName: 'provider',
    def: { type: 'TEXT' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'toAddr',
    columnName: 'to_addr',
    def: { type: 'TEXT' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'subject',
    columnName: 'subject',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'body',
    columnName: 'body',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'template',
    columnName: 'template',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'varsJson',
    columnName: 'vars_json',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'extraJson',
    columnName: 'extra_json',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'status',
    columnName: 'status',
    def: { type: 'TEXT' as const, notNull: true },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'messageId',
    columnName: 'message_id',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'processingOwner',
    columnName: 'processing_owner',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'lockedUntil',
    columnName: 'locked_until',
    def: { type: 'BIGINT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'createdAt',
    columnName: 'created_at',
    def: { type: 'BIGINT' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'updatedAt',
    columnName: 'updated_at',
    def: { type: 'BIGINT' as const, notNull: true },
    select: true,
    create: true,
    update: true,
  },
]

/** 发送日志存储单例缓存 */
let sendLogRepoInstance: SendLogRepository | null = null
let sendLogRepoSqlOps: unknown = null

/**
 * 内部关闭时释放仓库包装对象引用；不删除数据库记录，不是跨节点业务状态重置。
 *
 * @example 模块内部上下文
 * ```ts
 * resetSendLogRepoSingleton()
 * ```
 */
export function resetSendLogRepoSingleton(): void {
  sendLogRepoInstance = null
  sendLogRepoSqlOps = null
}

/**
 * 内部创建/复用当前db.sql生命周期的队列仓库，确认表就绪后才返回；缓存只持有包装对象。
 * @param db - 已初始化数据库；生产共享PostgreSQL/MySQL。
 * @returns 仓库HaiResult，建表/连接故障失败，不回退进程队列。
 *
 * @example 模块内部上下文
 * ```ts
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const created = await createSendLogRepository(reldb)
 *   if (!created.success) throw new Error(created.error.message)
 *   const repository = created.data
 *   const pending = await repository.findPending()
 *   if (!pending.success) throw new Error(pending.error.message)
 *   const count = pending.data.length
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export async function createSendLogRepository(db: ReldbFunctions): Promise<HaiResult<SendLogRepository>> {
  if (sendLogRepoInstance && sendLogRepoSqlOps === db.sql)
    return ok(sendLogRepoInstance)

  const migration = await migrateReach({}, db)
  if (!migration.success)
    return migration
  const repo = new DbSendLogRepository(db)
  // 触发表创建（BaseReldbCrudRepository 的表创建是异步的）
  const initResult = await repo.count()
  if (!initResult.success) {
    return err(
      HaiReachError.SEND_FAILED,
      reachM('reach_sendFailed', { params: { error: initResult.error.message } }),
      initResult.error,
    )
  }
  sendLogRepoInstance = repo
  sendLogRepoSqlOps = db.sql
  return ok(repo)
}

/**
 * 基于数据库的发送日志存储实现
 */
class DbSendLogRepository extends BaseReldbCrudRepository<StoredSendLog> implements SendLogRepository {
  /** 共享后端取真正执行时钟；本地 SQLite 保留可控的单进程测试时钟。 */
  private clockSql(localNow?: number): string {
    if (this.db.config?.type === 'postgresql')
      return 'CAST(FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000) AS BIGINT)'
    if (this.db.config?.type === 'mysql')
      return 'CAST(UNIX_TIMESTAMP(SYSDATE(3)) * 1000 AS UNSIGNED)'
    return String(localNow ?? Date.now())
  }

  async currentTime(): Promise<HaiResult<number>> {
    const time = await this.sql().get<{ now: number | string }>(`SELECT ${this.clockSql()} AS now`)
    return time.success && time.data && Number.isSafeInteger(Number(time.data.now))
      ? ok(Number(time.data.now))
      : buildSendLogError(reachM('reach_claimLost'))
  }

  async settleSensitive(queueId: string, status: 'sent' | 'unknown' | 'discarded', messageId?: string): Promise<HaiResult<void>> {
    const settled = await this.sql().execute(
      `UPDATE ${TABLE_NAME} SET status = ?, message_id = ?, locked_until = NULL, updated_at = ? WHERE queue_id = ? AND status = 'sending' AND body IS NULL AND vars_json IS NULL AND retry_safe = FALSE`,
      [status, messageId ?? null, Date.now(), queueId],
    )
    if (!settled.success)
      return settled
    return settled.data.changes === 1 ? ok(undefined) : buildSendLogError(reachM('reach_sensitiveDeliveryUnconfirmed'))
  }

  constructor(db: ReldbFunctions) {
    super(db, {
      table: TABLE_NAME,
      fields: SEND_LOG_FIELDS,
      idColumn: 'id',
      idField: 'id',
      createTableIfNotExists: true,
    })
  }

  /** 单条可空查询统一返回经过校验的毫秒 number。 */
  override async findById(id: unknown, tx?: DmlWithTxOperations): Promise<HaiResult<StoredSendLog | null>> {
    const result = await super.findById(id, tx)
    if (!result.success || result.data === null)
      return result
    return normalizeSendLog(result.data)
  }

  /** 单条必需查询统一返回经过校验的毫秒 number。 */
  override async getById(id: unknown, tx?: DmlWithTxOperations): Promise<HaiResult<StoredSendLog>> {
    const result = await super.getById(id, tx)
    return result.success ? normalizeSendLog(result.data) : result
  }

  /** 普通列表与 claim 回读共用同一 BIGINT 转换边界。 */
  override async findAll(options?: CrudQueryOptions, tx?: DmlWithTxOperations): Promise<HaiResult<StoredSendLog[]>> {
    const result = await super.findAll(options, tx)
    return result.success ? normalizeSendLogs(result.data) : result
  }

  /** 分页结果同样拒绝不安全的时间值，不返回经过舍入的毫秒数。 */
  override async findPage(options: CrudPageOptions, tx?: DmlWithTxOperations): Promise<HaiResult<PaginatedResult<StoredSendLog>>> {
    const result = await super.findPage(options, tx)
    if (!result.success)
      return result
    const rows = normalizeSendLogs(result.data.items)
    return rows.success ? ok({ ...result.data, items: rows.data }) : rows
  }

  /** 获取所有待发送记录 */
  async findPending(tx?: DmlWithTxOperations): Promise<HaiResult<StoredSendLog[]>> {
    const result = await this.findAll({ where: 'status = ?', params: ['pending'], orderBy: 'created_at ASC' }, tx)
    if (!result.success) {
      return result
    }
    return ok(result.data)
  }

  /**
   * 使用数据库行锁 claim 一批记录。
   *
   * PostgreSQL / MySQL 支持 `FOR UPDATE SKIP LOCKED`：
   * - 当前事务锁住即将 claim 的行
   * - 并发事务会直接跳过这些行，而不是重复命中同一批记录
   * - 在 commit 前不会暴露给其它节点重复 claim
   */
  private async claimPendingIdsWithRowLocks(
    tx: DmlWithTxOperations,
    owner: string,
    clock: string,
    lockMs: number,
    limit: number,
    eligibleBefore: number,
  ): Promise<number[]> {
    const lockedRowsResult = await tx.query(
      `SELECT id
       FROM ${TABLE_NAME}
       WHERE ${claimableWhere(clock)}
       ORDER BY created_at ASC
       LIMIT ?
       FOR UPDATE SKIP LOCKED`,
      [...claimableParams(eligibleBefore), limit],
    )
    if (!lockedRowsResult.success) {
      throw lockedRowsResult.error
    }

    const claimedIds = lockedRowsResult.data.map((row) => {
      const id = typeof row.id === 'number' ? row.id : Number(row.id)
      if (!Number.isSafeInteger(id)) {
        throw new TypeError(`Invalid send log id returned when claiming pending batch: ${String(row.id)}`)
      }
      return id
    })
    if (claimedIds.length === 0) {
      return []
    }

    const placeholders = claimedIds.map(() => '?').join(', ')
    const updateResult = await tx.execute(
      `UPDATE ${TABLE_NAME}
       SET status = ?, processing_owner = ?, locked_until = ${clock} + ?, updated_at = ${clock}, attempt_count = attempt_count + 1
       WHERE id IN (${placeholders})`,
      ['processing', owner, lockMs, ...claimedIds],
    )
    if (!updateResult.success) {
      throw updateResult.error
    }

    return claimedIds
  }

  /**
   * SQLite 等不支持 `SKIP LOCKED` 的数据库回退到 compare-and-set claim。
   *
   * 流程是：先按顺序读候选，再用带条件的 UPDATE 抢占每一行。
   * 即使多个节点读到了同一候选，只有第一个满足条件的 UPDATE 会成功，
   * 从而避免同一行被两个节点同时 claim。
   */
  private async claimPendingIdsWithConditionalUpdates(
    tx: DmlWithTxOperations,
    owner: string,
    clock: string,
    lockMs: number,
    limit: number,
    eligibleBefore: number,
  ): Promise<number[]> {
    const candidatesResult = await this.findAll({
      where: claimableWhere(clock),
      params: claimableParams(eligibleBefore),
      orderBy: 'created_at ASC',
      limit,
    }, tx)
    if (!candidatesResult.success) {
      throw candidatesResult.error
    }

    const claimedIds: number[] = []
    for (const row of candidatesResult.data) {
      const updateResult = await tx.execute(
        `UPDATE ${TABLE_NAME}
         SET status = ?, processing_owner = ?, locked_until = ${clock} + ?, updated_at = ${clock}, attempt_count = attempt_count + 1
         WHERE id = ? AND ${claimableWhere(clock)}`,
        ['processing', owner, lockMs, row.id, ...claimableParams(eligibleBefore)],
      )
      if (!updateResult.success) {
        throw updateResult.error
      }
      if (updateResult.data.changes > 0) {
        claimedIds.push(row.id)
      }
    }

    return claimedIds
  }

  /** 根据已 claim 的 id 回读完整记录，统一返回给 flush 流程。 */
  private async loadClaimedRows(ids: number[], tx: DmlWithTxOperations): Promise<StoredSendLog[]> {
    const placeholders = ids.map(() => '?').join(', ')
    const claimedRowsResult = await this.findAll({
      where: `id IN (${placeholders})`,
      params: ids,
      orderBy: 'created_at ASC',
    }, tx)
    if (!claimedRowsResult.success) {
      throw claimedRowsResult.error
    }
    return claimedRowsResult.data
  }

  /** claim 一批待发送记录，避免多节点重复发送 */
  async claimPendingBatch(owner: string, options?: SendLogClaimOptions): Promise<HaiResult<StoredSendLog[]>> {
    const time = await this.currentTime()
    if (!time.success)
      return time
    const now = this.db.config?.type === 'sqlite' ? options?.now ?? time.data : time.data
    const clock = this.clockSql(now)
    const limit = options?.limit ?? DEFAULT_CLAIM_BATCH_SIZE
    const lockMs = options?.lockMs ?? DEFAULT_CLAIM_LOCK_MS
    const eligibleBefore = Math.min(now, options?.eligibleBefore ?? now)
    const dbType = this.db.config?.type

    const txResult = await this.db.tx.begin()
    if (!txResult.success) {
      return buildSendLogError(txResult.error.message, txResult.error)
    }

    const tx = txResult.data

    try {
      // 可能已产生不可去重的外部副作用：租约过期只能转 unknown，不能被新节点自动重发。
      const unknown = await tx.execute(
        `UPDATE ${TABLE_NAME} SET status = ?, processing_owner = NULL, locked_until = NULL, next_attempt_at = 0, updated_at = ${clock}
         WHERE status = ? AND retry_safe = FALSE AND (locked_until IS NULL OR locked_until <= ${clock})`,
        ['unknown', 'sending'],
      )
      if (!unknown.success)
        throw unknown.error
      // 最后一次领取后崩溃也不能无限接管；有效租约仍须等待到期，非幂等 sending 已先隔离。
      const exhausted = await tx.execute(
        `UPDATE ${TABLE_NAME}
         SET status = ?, last_failure = ?, processing_owner = NULL, locked_until = NULL, next_attempt_at = 0, updated_at = ${clock}
         WHERE attempt_count >= max_attempts
           AND (status = ? OR (status = ? AND (locked_until IS NULL OR locked_until <= ${clock}))
             OR (status = ? AND retry_safe = TRUE AND locked_until <= ${clock}))`,
        ['dead', 'attempts_exhausted', 'pending', 'processing', 'sending'],
      )
      if (!exhausted.success)
        throw exhausted.error
      const claimedIds = dbType === 'postgresql' || dbType === 'mysql'
        ? await this.claimPendingIdsWithRowLocks(tx, owner, clock, lockMs, limit, eligibleBefore)
        : await this.claimPendingIdsWithConditionalUpdates(tx, owner, clock, lockMs, limit, eligibleBefore)

      if (claimedIds.length === 0) {
        const commitResult = await tx.commit()
        if (!commitResult.success) {
          return buildSendLogError(commitResult.error.message, commitResult.error)
        }
        return ok([])
      }

      const claimedRows = await this.loadClaimedRows(claimedIds, tx)

      const commitResult = await tx.commit()
      if (!commitResult.success) {
        return buildSendLogError(commitResult.error.message, commitResult.error)
      }

      return ok(claimedRows)
    }
    catch (error) {
      await tx.rollback()
      return buildSendLogError(error instanceof Error ? error.message : String(error), error)
    }
  }

  /** 显式取消未完成的领取；仍按失败退避，避免调用方绕过自动重试预算。 */
  async releaseClaim(id: number, owner: string, tx?: DmlWithTxOperations): Promise<HaiResult<void>> {
    const row = await this.getById(id, tx)
    if (!row.success)
      return row
    return this.failClaim(row.data, owner, 'transient_failure', false, tx)
  }

  /** 失败提交与 owner、次数和有效租约同时比较，旧 worker 不能更改新领取的退避策略。 */
  async failClaim(row: StoredSendLog, owner: string, reason: ReachQueueFailure, permanent = false, tx?: DmlWithTxOperations): Promise<HaiResult<void>> {
    const clock = this.clockSql()
    const dead = permanent || row.attemptCount >= row.maxAttempts
    const delay = Math.min(row.maxRetryDelayMs, row.retryDelayMs * 2 ** Math.min(row.attemptCount - 1, 30))
    const result = await this.sql(tx).execute(
      `UPDATE ${TABLE_NAME}
       SET status = ?, last_failure = ?, next_attempt_at = ${dead ? '0' : `${clock} + ?`}, processing_owner = NULL, locked_until = NULL, updated_at = ${clock}
       WHERE id = ? AND processing_owner = ? AND locked_until > ${clock} AND attempt_count = ?
         AND (status = ? OR (status = ? AND retry_safe = TRUE))`,
      [dead ? 'dead' : 'pending', reason, ...dead ? [] : [delay], row.id, owner, row.attemptCount, 'processing', 'sending'],
    )
    if (!result.success) {
      return buildSendLogError(result.error.message, result.error)
    }
    if (result.data.changes === 0) {
      return buildSendLogError(reachM('reach_claimLost'))
    }
    return ok(undefined)
  }

  /** 仅当前 dead 版本可以恢复；保留 queueId，迟到的幂等 API 请求仍使用同一键。 */
  async requeueDead(queueId: string, expectedUpdatedAt: number): Promise<HaiResult<void>> {
    const clock = this.clockSql()
    const result = await this.sql().execute(
      `UPDATE ${TABLE_NAME} SET status = ?, attempt_count = 0, next_attempt_at = ${clock}, last_failure = NULL, updated_at = CASE WHEN updated_at >= ${clock} THEN updated_at + 1 ELSE ${clock} END
       WHERE queue_id = ? AND status = ? AND updated_at = ?`,
      ['pending', queueId, 'dead', expectedUpdatedAt],
    )
    return result.success && result.data.changes === 1 ? ok(undefined) : buildSendLogError(reachM('reach_deadRequeueFailed'))
  }

  /** 发送前持久化门闩；仅有效租约可从 processing 进入 sending。 */
  async beginDelivery(id: number, owner: string, retrySafe: boolean, lockMs = DEFAULT_CLAIM_LOCK_MS): Promise<HaiResult<void>> {
    const clock = this.clockSql()
    const flag = this.db.config?.type === 'postgresql' ? retrySafe : Number(retrySafe)
    const result = await this.sql().execute(
      `UPDATE ${TABLE_NAME} SET status = ?, retry_safe = ?, locked_until = ${clock} + ?, updated_at = ${clock}
       WHERE id = ? AND status = ? AND processing_owner = ? AND locked_until > ${clock}`,
      ['sending', flag, lockMs, id, 'processing', owner],
    )
    return result.success && result.data.changes === 1 ? ok(undefined) : buildSendLogError(reachM('reach_claimLost'))
  }

  /** 续租不接受已经过期的 owner，防止暂停的旧进程恢复后重新取得发送权。 */
  async renewClaim(id: number, owner: string, lockMs = DEFAULT_CLAIM_LOCK_MS): Promise<HaiResult<void>> {
    const clock = this.clockSql()
    const result = await this.sql().execute(
      `UPDATE ${TABLE_NAME} SET locked_until = ${clock} + ?, updated_at = ${clock}
       WHERE id = ? AND processing_owner = ? AND status IN (?, ?) AND locked_until > ${clock}`,
      [lockMs, id, owner, 'processing', 'sending'],
    )
    return result.success && result.data.changes === 1 ? ok(undefined) : buildSendLogError(reachM('reach_claimLost'))
  }

  /** 未知结果只能停止自动处理，不推断外部副作用已撤销。 */
  async markUnknown(id: number, owner: string): Promise<HaiResult<void>> {
    const result = await this.sql().execute(
      `UPDATE ${TABLE_NAME} SET status = ?, processing_owner = NULL, locked_until = NULL, next_attempt_at = 0, updated_at = ${this.clockSql()}
       WHERE id = ? AND processing_owner = ? AND status IN (?, ?)`,
      ['unknown', id, owner, 'processing', 'sending'],
    )
    return result.success && result.data.changes === 1 ? ok(undefined) : buildSendLogError(reachM('reach_claimLost'))
  }

  /** 人工裁定的条件提交，不提供重新排队或重新发送操作。 */
  async resolveUnknown(queueId: string, resolution: ReachUnknownResolution): Promise<HaiResult<void>> {
    const result = await this.sql().execute(
      `UPDATE ${TABLE_NAME} SET status = ?, message_id = ?, next_attempt_at = 0, updated_at = ${this.clockSql()} WHERE queue_id = ? AND status = ?`,
      [resolution.status, resolution.messageId ?? null, queueId, 'unknown'],
    )
    return result.success && result.data.changes === 1 ? ok(undefined) : buildSendLogError(reachM('reach_unknownResolutionFailed'))
  }

  /** 只有仍持有 sending 有效租约的 owner 可以确认投递。 */
  async markSent(id: number, owner: string, messageId?: string, tx?: DmlWithTxOperations): Promise<HaiResult<void>> {
    const clock = this.clockSql()
    const result = await this.sql(tx).execute(
      `UPDATE ${TABLE_NAME}
       SET status = ?, message_id = ?, processing_owner = NULL, locked_until = NULL, next_attempt_at = 0, updated_at = ${clock}
       WHERE id = ? AND status = ? AND processing_owner = ? AND locked_until > ${clock}`,
      ['sent', messageId ?? null, id, 'sending', owner],
    )
    if (!result.success) {
      return buildSendLogError(result.error.message, result.error)
    }
    if (result.data.changes === 0) {
      return buildSendLogError(reachM('reach_claimLost'))
    }
    return ok(undefined)
  }
}
