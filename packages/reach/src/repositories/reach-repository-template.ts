/**
 * @h-ai/reach — 模板存储实现
 *
 * 基于 @h-ai/reldb 的模板持久化存储。
 * 模板支持两种来源：配置文件（config）和数据库（db）。
 * @module reach-repository-template
 */

import type { Result } from '@h-ai/core'
import type { ReldbCrudFieldDefinition, ReldbCrudRepository, ReldbError, ReldbFunctions, ReldbTxHandle } from '@h-ai/reldb'
import type { ReachError, ReachTemplate } from '../reach-types.js'

import { err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository } from '@h-ai/reldb'

import { ReachErrorCode } from '../reach-config.js'
import { reachM } from '../reach-i18n.js'

// ─── 模板存储实体类型 ───

/**
 * 数据库模板存储实体
 */
export interface StoredTemplate {
  /** 自增主键 */
  id: number
  /** 模板名称（唯一标识） */
  name: string
  /** 绑定的 Provider 名称 */
  provider: string
  /** 邮件主题模板 */
  subject: string | null
  /** 正文模板 */
  body: string
  /** 创建时间 */
  createdAt: number
  /** 更新时间 */
  updatedAt: number
}

// ─── 模板存储接口 ───

/**
 * 模板存储接口
 */
export interface TemplateRepository extends ReldbCrudRepository<StoredTemplate> {
  /**
   * 按名称查找模板
   */
  findByName: (name: string, tx?: ReldbTxHandle) => Promise<Result<StoredTemplate | undefined, ReachError>>

  /**
   * 保存模板（存在则更新，不存在则插入）
   */
  upsert: (template: ReachTemplate, tx?: ReldbTxHandle) => Promise<Result<void, ReachError>>

  /**
   * 按名称删除模板
   */
  deleteByName: (name: string, tx?: ReldbTxHandle) => Promise<Result<void, ReachError>>

  /**
   * 获取所有模板（转换为 ReachTemplate 格式）
   */
  listTemplates: (tx?: ReldbTxHandle) => Promise<Result<ReachTemplate[], ReachError>>
}

// ─── 模板存储实现 ───

/** 表名 */
const TABLE_NAME = 'reach_template'

/** 字段定义 */
const TEMPLATE_FIELDS: ReldbCrudFieldDefinition[] = [
  {
    fieldName: 'id',
    columnName: 'id',
    def: { type: 'INTEGER' as const, primaryKey: true, autoIncrement: true },
    select: true,
    create: false,
    update: false,
  },
  {
    fieldName: 'name',
    columnName: 'name',
    def: { type: 'TEXT' as const, notNull: true, unique: true },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'provider',
    columnName: 'provider',
    def: { type: 'TEXT' as const, notNull: true },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'subject',
    columnName: 'subject',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'body',
    columnName: 'body',
    def: { type: 'TEXT' as const, notNull: true },
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
    def: { type: 'TIMESTAMP' as const, notNull: true },
    select: true,
    create: true,
    update: true,
  },
]

/** 模板存储单例缓存 */
let templateRepoInstance: TemplateRepository | null = null
let templateRepoDbConfig: unknown = null

/**
 * 重置模板存储单例
 *
 * 在 reach.close() 时调用，释放对旧 db 实例的引用。
 */
export function resetTemplateRepoSingleton(): void {
  templateRepoInstance = null
  templateRepoDbConfig = null
}

/**
 * 创建基于数据库的模板存储实例
 *
 * 单例模式：同一 db 生命周期内重复调用返回缓存实例，
 * db 重新初始化后自动创建新实例。
 *
 * @param db - 数据库服务实例
 * @returns 成功返回模板存储接口实现；失败返回含错误信息的 Result
 */
export async function createTemplateRepository(db: ReldbFunctions): Promise<Result<TemplateRepository, ReachError>> {
  if (templateRepoInstance && templateRepoDbConfig === db.config)
    return ok(templateRepoInstance)

  const repo = new DbTemplateRepository(db)
  // 触发表创建（BaseReldbCrudRepository 的表创建是异步的）
  const initResult = await repo.count()
  if (!initResult.success) {
    return err({
      code: ReachErrorCode.SEND_FAILED,
      message: reachM('reach_templateDbInitFailed', { params: { error: initResult.error.message } }),
      cause: initResult.error,
    })
  }
  templateRepoInstance = repo
  templateRepoDbConfig = db.config
  return ok(repo)
}

/**
 * 将 StoredTemplate 转换为 ReachTemplate
 */
function toReachTemplate(stored: StoredTemplate): ReachTemplate {
  return {
    name: stored.name,
    provider: stored.provider,
    subject: stored.subject ?? undefined,
    body: stored.body,
  }
}

/**
 * 基于数据库的模板存储实现
 */
class DbTemplateRepository extends BaseReldbCrudRepository<StoredTemplate> implements TemplateRepository {
  constructor(db: ReldbFunctions) {
    super(db, {
      table: TABLE_NAME,
      fields: TEMPLATE_FIELDS,
      idColumn: 'id',
      idField: 'id',
      createTableIfNotExists: true,
    })
  }

  /** 按名称查找模板 */
  async findByName(name: string, tx?: ReldbTxHandle): Promise<Result<StoredTemplate | undefined, ReachError>> {
    const result = await this.findAll({ where: 'name = ?', params: [name], limit: 1 }, tx)
    if (!result.success) {
      return this.buildQueryError(result.error)
    }
    return ok(result.data[0])
  }

  /** 保存模板（存在则更新，不存在则插入） */
  async upsert(template: ReachTemplate, tx?: ReldbTxHandle): Promise<Result<void, ReachError>> {
    const existing = await this.findByName(template.name, tx)
    if (!existing.success) {
      return existing
    }

    const now = Date.now()

    if (existing.data) {
      // 更新
      const updateResult = await this.updateById(
        existing.data.id,
        {
          provider: template.provider,
          subject: template.subject ?? null,
          body: template.body,
          updatedAt: now,
        },
        tx,
      )
      if (!updateResult.success) {
        return this.buildQueryError(updateResult.error)
      }
    }
    else {
      // 插入
      const createResult = await this.create(
        {
          name: template.name,
          provider: template.provider,
          subject: template.subject ?? null,
          body: template.body,
          createdAt: now,
          updatedAt: now,
        },
        tx,
      )
      if (!createResult.success) {
        return this.buildQueryError(createResult.error)
      }
    }
    return ok(undefined)
  }

  /** 按名称删除模板 */
  async deleteByName(name: string, tx?: ReldbTxHandle): Promise<Result<void, ReachError>> {
    const existing = await this.findByName(name, tx)
    if (!existing.success) {
      return existing
    }
    if (!existing.data) {
      return ok(undefined)
    }
    const result = await this.deleteById(existing.data.id, tx)
    if (!result.success) {
      return this.buildQueryError(result.error)
    }
    return ok(undefined)
  }

  /** 获取所有模板（转换为 ReachTemplate 格式） */
  async listTemplates(tx?: ReldbTxHandle): Promise<Result<ReachTemplate[], ReachError>> {
    const result = await this.findAll({ orderBy: 'name ASC' }, tx)
    if (!result.success) {
      return this.buildQueryError(result.error)
    }
    return ok(result.data.map(toReachTemplate))
  }

  /**
   * 构建查询错误响应
   */
  private buildQueryError(error: ReldbError): Result<never, ReachError> {
    return err({
      code: ReachErrorCode.SEND_FAILED,
      message: reachM('reach_sendFailed', { params: { error: error.message } }),
      cause: error,
    })
  }
}
