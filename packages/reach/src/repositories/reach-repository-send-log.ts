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
export type SendLogStatus = 'sent' | 'pending'

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
  /** 创建时间 */
  createdAt: number
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
   * 将记录标记为已发送
   */
  markSent: (id: number, messageId?: string, tx?: DmlWithTxOperations) => Promise<HaiResult<void>>
}

// ─── 发送日志存储实现 ───

/** 表名 */
const TABLE_NAME = 'hai_reach_send_log'

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
    fieldName: 'createdAt',
    columnName: 'created_at',
    def: { type: 'TIMESTAMP' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
]

/** 发送日志存储单例缓存 */
let sendLogRepoInstance: SendLogRepository | null = null
let sendLogRepoDbConfig: unknown = null

/**
 * 重置发送日志存储单例
 *
 * 在 reach.close() 时调用，释放对旧 db 实例的引用。
 */
export function resetSendLogRepoSingleton(): void {
  sendLogRepoInstance = null
  sendLogRepoDbConfig = null
}

/**
 * 创建基于数据库的发送日志存储实例
 *
 * 单例模式：同一 db 生命周期内重复调用返回缓存实例，
 * db 重新初始化后自动创建新实例。
 *
 * @param db - 数据库服务实例
 * @returns 成功返回发送日志存储接口实现；失败返回含错误信息的 Result
 */
export async function createSendLogRepository(db: ReldbFunctions): Promise<HaiResult<SendLogRepository>> {
  if (sendLogRepoInstance && sendLogRepoDbConfig === db.config)
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
  sendLogRepoDbConfig = db.config
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

  /** 将记录标记为已发送 */
  async markSent(id: number, messageId?: string, tx?: DmlWithTxOperations): Promise<HaiResult<void>> {
    const result = await this.updateById(id, { status: 'sent', messageId: messageId ?? null }, tx)
    if (!result.success) {
      return result
    }
    return ok(undefined)
  }
}
