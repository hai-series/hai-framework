/**
 * @h-ai/reach — 发送日志存储实现
 *
 * 基于 @h-ai/reldb 的发送日志存储实现。
 * @module reach-repository-send-log
 */

import type { HaiResult } from '@h-ai/core'
import type { DmlWithTxOperations, ReldbCrudFieldDefinition, ReldbCrudRepository, ReldbFunctions } from '@h-ai/reldb'
import { err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository } from '@h-ai/reldb'

import { reachM } from '../reach-i18n.js'
import { HaiReachError } from '../reach-types.js'

// ─── 发送日志实体类型 ───

/** 发送日志状态 */
export type SendLogStatus = 'sent' | 'pending' | 'processing'

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
  /** 自增主键 */
  id: number
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
  /** Provider 返回的消息 ID */
  messageId: string | null
  /** 当前 claim owner（处理中时存在） */
  processingOwner?: string
  /** 当前 claim 过期时间（Unix 时间戳毫秒） */
  lockedUntil?: number
  /** 创建时间 */
  createdAt: number
  /** 最近更新时间 */
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
   * 同时允许接管已过期的 processing 记录，避免节点异常退出后消息永久卡死。
   * PostgreSQL / MySQL 优先使用行锁 + `SKIP LOCKED` 降低多节点争抢；
   * SQLite 不支持该能力时退回条件更新（compare-and-set）模式。
   */
  claimPendingBatch: (owner: string, options?: SendLogClaimOptions) => Promise<HaiResult<StoredSendLog[]>>

  /**
   * 释放一条已 claim 的记录，使其回到 pending 状态，供后续重试。
   * 仅当前 owner 可以释放，避免过期节点覆盖新 owner 的处理状态。
   */
  releaseClaim: (id: number, owner: string, tx?: DmlWithTxOperations) => Promise<HaiResult<void>>

  /**
   * 将记录标记为已发送。
   * 指定 owner 时仅允许当前 owner 提交发送结果，避免旧节点在 lease 失效后误覆盖新节点状态。
   */
  markSent: (id: number, messageId?: string, tx?: DmlWithTxOperations, owner?: string) => Promise<HaiResult<void>>
}

// ─── 发送日志存储实现 ───

/** 表名 */
const TABLE_NAME = 'hai_reach_send_log'
const DEFAULT_CLAIM_BATCH_SIZE = 100
const DEFAULT_CLAIM_LOCK_MS = 10 * 60 * 1000
const CLAIMABLE_STATUS_WHERE = '(status = ? OR (status = ? AND (locked_until IS NULL OR locked_until < ?)))'

function buildSendLogError<T>(detail: string, cause?: unknown): HaiResult<T> {
  return err(
    HaiReachError.SEND_FAILED,
    reachM('reach_sendFailed', { params: { error: detail } }),
    cause,
  )
}

/** 字段定义 */
const SEND_LOG_FIELDS: ReldbCrudFieldDefinition[] = [
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
    def: { type: 'INTEGER' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'createdAt',
    columnName: 'created_at',
    def: { type: 'TIMESTAMP' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'updatedAt',
    columnName: 'updated_at',
    def: { type: 'INTEGER' as const, notNull: true },
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
      ['pending', 'processing', now, limit],
    )
    if (!lockedRowsResult.success) {
      throw lockedRowsResult.error
    }

    const claimedIds = lockedRowsResult.data.map((row) => {
      const id = typeof row.id === 'number' ? row.id : Number(row.id)
      if (!Number.isInteger(id)) {
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
      params: ['pending', 'processing', now],
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
        ['processing', owner, lockedUntil, now, row.id, 'pending', 'processing', now],
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
       WHERE id = ? AND status = ? AND processing_owner = ?`,
      ['pending', now, id, 'processing', owner],
    )
    if (!result.success) {
      return buildSendLogError(result.error.message, result.error)
    }
    if (result.data.changes === 0) {
      return buildSendLogError(`Send log ${id} claim is no longer owned by ${owner}`)
    }
    return ok(undefined)
  }

  /** 将记录标记为已发送 */
  async markSent(id: number, messageId?: string, tx?: DmlWithTxOperations, owner?: string): Promise<HaiResult<void>> {
    const now = Date.now()
    const params: unknown[] = ['sent', messageId ?? null, now, id]
    let whereClause = 'id = ?'

    if (owner) {
      whereClause += ' AND status = ? AND processing_owner = ?'
      params.push('processing', owner)
    }

    const result = await this.sql(tx).execute(
      `UPDATE ${TABLE_NAME}
       SET status = ?, message_id = ?, processing_owner = NULL, locked_until = NULL, updated_at = ?
       WHERE ${whereClause}`,
      params,
    )
    if (!result.success) {
      return buildSendLogError(result.error.message, result.error)
    }
    if (owner && result.data.changes === 0) {
      return buildSendLogError(`Send log ${id} claim is no longer owned by ${owner}`)
    }
    return ok(undefined)
  }
}
