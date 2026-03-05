/**
 * @h-ai/scheduler — 分布式锁仓库
 *
 * 基于数据库 UNIQUE 约束实现分布式锁，多节点部署时确保同一任务同一分钟只有一个节点执行。
 * 锁键格式为 `${taskId}:${minuteTimestamp}`，由 DB 的 UNIQUE 约束保证原子性。
 * @module scheduler-lock-repository
 */

import type { ReldbFunctions } from '@h-ai/reldb'

import { core } from '@h-ai/core'
import { BaseReldbCrudRepository } from '@h-ai/reldb'

import { schedulerM } from '../scheduler-i18n.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'lock-repository' })

// ─── 锁行类型（数据库行映射） ───

/** 锁记录状态 */
type LockStatus = 'running' | 'completed' | 'failed'

/** 分布式锁记录数据库行 */
interface LockRow {
  id: number
  taskId: string
  lockKey: string
  nodeId: string
  status: LockStatus
  lockedAt: number
  expiresAt: number
}

// ─── 仓库 ───

/**
 * 分布式锁仓库
 *
 * 通过 UNIQUE(lock_key) 约束实现乐观锁：
 * - 执行前 INSERT 一条锁记录，UNIQUE 约束保证只有一个节点成功
 * - 执行完成后更新 status 为 completed 或 failed
 * - 定期清理过期锁记录
 *
 * 此类仅供 scheduler-runner.ts 内部使用，不通过 index.ts 对外导出。
 */
export class SchedulerLockRepository extends BaseReldbCrudRepository<LockRow> {
  private readonly lockTableName: string

  constructor(db: ReldbFunctions, tableName: string) {
    super(db, {
      table: tableName,
      idColumn: 'id',
      fields: [
        { fieldName: 'id', columnName: 'id', def: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, select: true, create: false, update: false },
        { fieldName: 'taskId', columnName: 'task_id', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'lockKey', columnName: 'lock_key', def: { type: 'TEXT', notNull: true, unique: true }, select: true, create: true, update: false },
        { fieldName: 'nodeId', columnName: 'node_id', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'status', columnName: 'status', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
        { fieldName: 'lockedAt', columnName: 'locked_at', def: { type: 'INTEGER', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'expiresAt', columnName: 'expires_at', def: { type: 'INTEGER', notNull: true }, select: true, create: true, update: false },
      ],
    })
    this.lockTableName = tableName
  }

  /**
   * 尝试获取分布式锁
   *
   * 通过 INSERT + UNIQUE(lock_key) 约束实现原子性锁获取。
   * 如果 INSERT 成功，获锁成功；如果因 UNIQUE 冲突失败，获锁失败。
   *
   * @param taskId - 任务 ID
   * @param minuteTimestamp - 当前分钟时间戳（Math.floor(Date.now() / 60000)）
   * @param nodeId - 当前节点标识
   * @param expireMs - 锁过期时间（毫秒）
   * @returns true 表示获锁成功，false 表示其他节点已获锁
   */
  async tryAcquire(taskId: string, minuteTimestamp: number, nodeId: string, expireMs: number): Promise<boolean> {
    const lockKey = `${taskId}:${minuteTimestamp}`
    const now = Date.now()

    // 先清理该锁键的过期记录（处理崩溃节点遗留的锁）
    await this.cleanExpiredLockByKey(lockKey, now)

    const createResult = await this.create({
      taskId,
      lockKey,
      nodeId,
      status: 'running' as LockStatus,
      lockedAt: now,
      expiresAt: now + expireMs,
    })

    if (createResult.success) {
      logger.debug('Lock acquired', { taskId, lockKey, nodeId })
      return true
    }

    // UNIQUE 约束冲突 → 其他节点已获锁
    logger.debug('Lock acquisition failed, another node holds the lock', { taskId, lockKey })
    return false
  }

  /**
   * 释放锁（更新状态为 completed 或 failed）
   *
   * @param taskId - 任务 ID
   * @param minuteTimestamp - 获锁时的分钟时间戳
   * @param status - 执行结果状态
   */
  async releaseLock(taskId: string, minuteTimestamp: number, status: 'completed' | 'failed'): Promise<void> {
    const lockKey = `${taskId}:${minuteTimestamp}`
    try {
      const rows = await this.findAll({ where: 'lock_key = ?', params: [lockKey], limit: 1 })
      if (rows.success && rows.data.length > 0) {
        await this.updateById(rows.data[0].id, { status })
        logger.debug('Lock released', { taskId, lockKey, status })
      }
    }
    catch (error) {
      logger.warn('Failed to release lock', { taskId, lockKey, error })
    }
  }

  /**
   * 清理单个锁键的过期记录（崩溃恢复）
   *
   * 当节点崩溃后锁记录仍为 running 状态，超过 expires_at 后需释放以允许重新获锁。
   */
  private async cleanExpiredLockByKey(lockKey: string, now: number): Promise<void> {
    try {
      const result = await this.db.sql.execute(
        `DELETE FROM ${this.lockTableName} WHERE lock_key = ? AND status = 'running' AND expires_at < ?`,
        [lockKey, now],
      )
      if (result.success && result.data.changes > 0) {
        logger.info('Cleaned expired lock', { lockKey, cleaned: result.data.changes })
      }
    }
    catch {
      // 清理失败不影响主流程
    }
  }

  /**
   * 批量清理过期锁记录
   *
   * 删除已过期的 running 状态锁以及历史已完成的锁记录（保留最近一段时间的记录）。
   *
   * @param retentionMs - 已完成锁记录的保留时间（毫秒），默认保留 1 小时
   */
  async cleanupExpiredLocks(retentionMs: number = 3600000): Promise<void> {
    const now = Date.now()
    try {
      // 清理过期的 running 锁（崩溃节点遗留）
      const expiredResult = await this.db.sql.execute(
        `DELETE FROM ${this.lockTableName} WHERE status = 'running' AND expires_at < ?`,
        [now],
      )

      // 清理已完成/失败且超过保留期的历史锁
      const historicalResult = await this.db.sql.execute(
        `DELETE FROM ${this.lockTableName} WHERE status != 'running' AND locked_at < ?`,
        [now - retentionMs],
      )

      const totalCleaned = (expiredResult.success ? expiredResult.data.changes : 0)
        + (historicalResult.success ? historicalResult.data.changes : 0)

      if (totalCleaned > 0) {
        logger.info('Cleaned up lock records', { expired: expiredResult.success ? expiredResult.data.changes : 0, historical: historicalResult.success ? historicalResult.data.changes : 0 })
      }
    }
    catch (error) {
      logger.warn(schedulerM('scheduler_lockCleanupFailed', { params: { error: error instanceof Error ? error.message : String(error) } }))
    }
  }
}
