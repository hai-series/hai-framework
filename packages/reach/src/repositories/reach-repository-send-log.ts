/**
 * @h-ai/reach — 发送日志存储实现
 *
 * 基于 @h-ai/reldb 的发送日志存储实现。
 * @module reach-repository-send-log
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { CrudPageOptions, CrudQueryOptions, DmlWithTxOperations, ReldbCrudFieldDefinition, ReldbCrudRepository, ReldbFunctions } from '@h-ai/reldb'
import type { ReachQueueStatus, ReachUnknownResolution } from '../reach-types.js'
import { err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository } from '@h-ai/reldb'

import { reachM } from '../reach-i18n.js'
import { HaiReachError } from '../reach-types.js'

// ─── 发送日志实体类型 ───

/** 发送日志状态 */
export type SendLogStatus = ReachQueueStatus

/** claim 待发送记录时的批处理参数 */
export interface SendLogClaimOptions {
  /** 单批最多 claim 的记录数 */
  limit?: number
  /** 当前时间（测试时可注入） */
  now?: number
  /** claim 锁持续时间（毫秒） */
  lockMs?: number
}

/**
 * 发送日志存储实体
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
 * 发送日志存储接口
 */
export interface SendLogRepository extends ReldbCrudRepository<StoredSendLog> {
  /**
   * 获取所有待发送记录（按创建时间升序）
   */
  findPending: (tx?: DmlWithTxOperations) => Promise<HaiResult<StoredSendLog[]>>

  /**
   * 按创建时间顺序 claim 一批待发送记录。
   * 可接管已过期 processing 和接收端幂等的 sending；非幂等 sending 过期后隔离为 unknown。
   * PostgreSQL / MySQL 优先使用行锁 + `SKIP LOCKED` 降低多节点争抢；
   * SQLite 不支持该能力时退回条件更新（compare-and-set）模式。
   */
  claimPendingBatch: (owner: string, options?: SendLogClaimOptions) => Promise<HaiResult<StoredSendLog[]>>

  /**
   * 释放一条已 claim 的记录，使其回到 pending 状态，供后续重试。
   * 仅有效 owner 可以释放 processing 或可安全重试的 sending；未知外部副作用不能重排队。
   */
  releaseClaim: (id: number, owner: string, tx?: DmlWithTxOperations) => Promise<HaiResult<void>>

  /** 发送前原子校验有效 owner 并持久化 sending；失败时绝不能调用外部 Provider。 */
  beginDelivery: (id: number, owner: string, retrySafe: boolean, lockMs?: number) => Promise<HaiResult<void>>
  /** 仅续租尚未到期且仍由该 owner 持有的记录；过期后不得复活旧 owner。 */
  renewClaim: (id: number, owner: string, lockMs?: number) => Promise<HaiResult<void>>
  /** 标记无法确定外部结果的记录，停止自动投递；仅当前 owner 可以提交。 */
  markUnknown: (id: number, owner: string) => Promise<HaiResult<void>>
  /** 人工核对并隔离旧 worker 后裁定 unknown；条件提交阻止并发覆盖。 */
  resolveUnknown: (queueId: string, resolution: ReachUnknownResolution) => Promise<HaiResult<void>>

  /**
   * 将记录标记为已发送。
   * 仅持有 sending 有效租约的 owner 可以提交；过期 owner 不能覆盖新节点状态。
   */
  markSent: (id: number, owner: string, messageId?: string, tx?: DmlWithTxOperations) => Promise<HaiResult<void>>
}

// ─── 发送日志存储实现 ───

/** 表名 */
const TABLE_NAME = 'hai_reach_send_log'
const DEFAULT_CLAIM_BATCH_SIZE = 100
const DEFAULT_CLAIM_LOCK_MS = 10 * 60 * 1000
const CLAIMABLE_STATUS_WHERE = '(status = ? OR (status = ? AND (locked_until IS NULL OR locked_until <= ?)) OR (status = ? AND retry_safe = TRUE AND locked_until <= ?))'

/** 只允许安全重领：未开始投递，或接收端承诺幂等的在途请求。 */
function claimableParams(now: number): unknown[] {
  return ['pending', 'processing', now, 'sending', now]
}

function buildSendLogError<T>(detail: string, cause?: unknown): HaiResult<T> {
  return err(
    HaiReachError.SEND_FAILED,
    reachM('reach_sendFailed', { params: { error: detail } }),
    cause,
  )
}

/** 校验并归一化驱动返回的 BIGINT，防止 PostgreSQL 字符串值或不安全整数泄漏到业务逻辑。 */
function normalizeSendLog(row: StoredSendLog): HaiResult<StoredSendLog> {
  const normalized = { ...row }
  for (const field of ['id', 'createdAt', 'updatedAt', 'lockedUntil'] as const) {
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

/** 批量读取同样经过时间校验，避免分页、claim 和普通查询返回不同类型。 */
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
 * 重置发送日志存储单例
 *
 * 在 reach.close() 时调用，释放对旧 db 实例的引用。
 */
export function resetSendLogRepoSingleton(): void {
  sendLogRepoInstance = null
  sendLogRepoSqlOps = null
}

/**
 * 创建基于数据库的发送日志存储实例
 *
 * 单例模式：同一 db 生命周期内重复调用返回缓存实例，
 * db 重新初始化后自动创建新实例。
 *
 * @param db - 数据库服务实例
 * @returns 成功返回发送日志存储接口实现；失败返回含错误信息的 HaiResult
 */
export async function createSendLogRepository(db: ReldbFunctions): Promise<HaiResult<SendLogRepository>> {
  if (sendLogRepoInstance && sendLogRepoSqlOps === db.sql)
    return ok(sendLogRepoInstance)

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
    now: number,
    lockedUntil: number,
    limit: number,
  ): Promise<number[]> {
    const lockedRowsResult = await tx.query(
      `SELECT id
       FROM ${TABLE_NAME}
       WHERE ${CLAIMABLE_STATUS_WHERE}
       ORDER BY created_at ASC
       LIMIT ?
       FOR UPDATE SKIP LOCKED`,
      [...claimableParams(now), limit],
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
       SET status = ?, processing_owner = ?, locked_until = ?, updated_at = ?
       WHERE id IN (${placeholders})`,
      ['processing', owner, lockedUntil, now, ...claimedIds],
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
    now: number,
    lockedUntil: number,
    limit: number,
  ): Promise<number[]> {
    const candidatesResult = await this.findAll({
      where: CLAIMABLE_STATUS_WHERE,
      params: claimableParams(now),
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
         SET status = ?, processing_owner = ?, locked_until = ?, updated_at = ?
         WHERE id = ? AND ${CLAIMABLE_STATUS_WHERE}`,
        ['processing', owner, lockedUntil, now, row.id, ...claimableParams(now)],
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
    const now = options?.now ?? Date.now()
    const limit = options?.limit ?? DEFAULT_CLAIM_BATCH_SIZE
    const lockMs = options?.lockMs ?? DEFAULT_CLAIM_LOCK_MS
    const lockedUntil = now + lockMs
    const dbType = this.db.config?.type

    const txResult = await this.db.tx.begin()
    if (!txResult.success) {
      return buildSendLogError(txResult.error.message, txResult.error)
    }

    const tx = txResult.data

    try {
      // 可能已产生不可去重的外部副作用：租约过期只能转 unknown，不能被新节点自动重发。
      const unknown = await tx.execute(
        `UPDATE ${TABLE_NAME} SET status = ?, processing_owner = NULL, locked_until = NULL, updated_at = ?
         WHERE status = ? AND retry_safe = FALSE AND (locked_until IS NULL OR locked_until <= ?)`,
        ['unknown', now, 'sending', now],
      )
      if (!unknown.success)
        throw unknown.error
      const claimedIds = dbType === 'postgresql' || dbType === 'mysql'
        ? await this.claimPendingIdsWithRowLocks(tx, owner, now, lockedUntil, limit)
        : await this.claimPendingIdsWithConditionalUpdates(tx, owner, now, lockedUntil, limit)

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

  /** 释放一条已 claim 的记录，供后续批次重新发送 */
  async releaseClaim(id: number, owner: string, tx?: DmlWithTxOperations): Promise<HaiResult<void>> {
    const now = Date.now()
    const result = await this.sql(tx).execute(
      `UPDATE ${TABLE_NAME}
       SET status = ?, processing_owner = NULL, locked_until = NULL, updated_at = ?
       WHERE id = ? AND processing_owner = ? AND locked_until > ?
         AND (status = ? OR (status = ? AND retry_safe = TRUE))`,
      ['pending', now, id, owner, now, 'processing', 'sending'],
    )
    if (!result.success) {
      return buildSendLogError(result.error.message, result.error)
    }
    if (result.data.changes === 0) {
      return buildSendLogError(reachM('reach_claimLost'))
    }
    return ok(undefined)
  }

  /** 发送前持久化门闩；仅有效租约可从 processing 进入 sending。 */
  async beginDelivery(id: number, owner: string, retrySafe: boolean, lockMs = DEFAULT_CLAIM_LOCK_MS): Promise<HaiResult<void>> {
    const now = Date.now()
    const flag = this.db.config?.type === 'postgresql' ? retrySafe : Number(retrySafe)
    const result = await this.sql().execute(
      `UPDATE ${TABLE_NAME} SET status = ?, retry_safe = ?, locked_until = ?, updated_at = ?
       WHERE id = ? AND status = ? AND processing_owner = ? AND locked_until > ?`,
      ['sending', flag, now + lockMs, now, id, 'processing', owner, now],
    )
    return result.success && result.data.changes === 1 ? ok(undefined) : buildSendLogError(reachM('reach_claimLost'))
  }

  /** 续租不接受已经过期的 owner，防止暂停的旧进程恢复后重新取得发送权。 */
  async renewClaim(id: number, owner: string, lockMs = DEFAULT_CLAIM_LOCK_MS): Promise<HaiResult<void>> {
    const now = Date.now()
    const result = await this.sql().execute(
      `UPDATE ${TABLE_NAME} SET locked_until = ?, updated_at = ?
       WHERE id = ? AND processing_owner = ? AND status IN (?, ?) AND locked_until > ?`,
      [now + lockMs, now, id, owner, 'processing', 'sending', now],
    )
    return result.success && result.data.changes === 1 ? ok(undefined) : buildSendLogError(reachM('reach_claimLost'))
  }

  /** 未知结果只能停止自动处理，不推断外部副作用已撤销。 */
  async markUnknown(id: number, owner: string): Promise<HaiResult<void>> {
    const result = await this.sql().execute(
      `UPDATE ${TABLE_NAME} SET status = ?, processing_owner = NULL, locked_until = NULL, updated_at = ?
       WHERE id = ? AND processing_owner = ? AND status IN (?, ?)`,
      ['unknown', Date.now(), id, owner, 'processing', 'sending'],
    )
    return result.success && result.data.changes === 1 ? ok(undefined) : buildSendLogError(reachM('reach_claimLost'))
  }

  /** 人工裁定的条件提交，不提供重新排队或重新发送操作。 */
  async resolveUnknown(queueId: string, resolution: ReachUnknownResolution): Promise<HaiResult<void>> {
    const result = await this.sql().execute(
      `UPDATE ${TABLE_NAME} SET status = ?, message_id = ?, updated_at = ? WHERE queue_id = ? AND status = ?`,
      [resolution.status, resolution.messageId ?? null, Date.now(), queueId, 'unknown'],
    )
    return result.success && result.data.changes === 1 ? ok(undefined) : buildSendLogError(reachM('reach_unknownResolutionFailed'))
  }

  /** 只有仍持有 sending 有效租约的 owner 可以确认投递。 */
  async markSent(id: number, owner: string, messageId?: string, tx?: DmlWithTxOperations): Promise<HaiResult<void>> {
    const now = Date.now()
    const result = await this.sql(tx).execute(
      `UPDATE ${TABLE_NAME}
       SET status = ?, message_id = ?, processing_owner = NULL, locked_until = NULL, updated_at = ?
       WHERE id = ? AND status = ? AND processing_owner = ? AND locked_until > ?`,
      ['sent', messageId ?? null, now, id, 'sending', owner, now],
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
