/**
 * @h-ai/reach — 模板存储实现
 *
 * 基于 @h-ai/reldb 的模板持久化存储。
 * 模板支持两种来源：配置文件（config）和数据库（db）。
 * @module reach-repository-template
 */

import type { HaiResult } from '@h-ai/core'
import type { DmlWithTxOperations, ReldbCrudFieldDefinition, ReldbCrudRepository, ReldbFunctions } from '@h-ai/reldb'

import type { ReachTemplate } from '../reach-types.js'
import { err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository } from '@h-ai/reldb'

import { reachM } from '../reach-i18n.js'
import { HaiReachError } from '../reach-types.js'

// ─── 模板存储实体类型 ───

/**
 * 内部数据库模板行；createdAt/updatedAt由TIMESTAMP字段映射为Date，与发送队列BIGINT毫秒不同。
 *
 * @example 模块内部上下文
 * ```ts
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const created = await createTemplateRepository(reldb)
 *   if (!created.success) throw new Error(created.error.message)
 *   const repository = created.data
 *   const found = await repository.findByName('welcome')
 *   if (!found.success) throw new Error(found.error.message)
 *   const row: StoredTemplate | undefined = found.data
 *   if (row) { const updatedAt = row.updatedAt }
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
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
  /** 创建时间（TIMESTAMP 经仓库映射为 Date）。 */
  createdAt: Date
  /** 更新时间（TIMESTAMP 经仓库映射为 Date）。 */
  updatedAt: Date
}

// ─── 模板存储接口 ───

/**
 * 内部模板数据库契约，唯一name支持upsert；表配置/数据库持有内容，进程缓存只持有仓库对象。
 *
 * @example 模块内部上下文
 * ```ts
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const created = await createTemplateRepository(reldb)
 *   if (!created.success) throw new Error(created.error.message)
 *   const repository = created.data
 *   const saved = await repository.upsert({ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' })
 *   if (!saved.success) throw new Error(saved.error.message)
 *   const found = await repository.findByName('welcome')
 *   if (!found.success) throw new Error(found.error.message)
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export interface TemplateRepository extends ReldbCrudRepository<StoredTemplate> {
  /**
   * 按名称查找模板
   * @param name - 实际操作输入，按本方法约束校验。
   * @param tx - 可选受控数据库事务。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example 模块内部上下文
   * ```ts
   * async function find(repository: TemplateRepository, name: string) {
   *   const found = await repository.findByName(name)
   *   if (!found.success) throw new Error(found.error.message)
   *   return found.data
   * }
   * ```
   */
  findByName: (name: string, tx?: DmlWithTxOperations) => Promise<HaiResult<StoredTemplate | undefined>>

  /**
   * 保存模板（存在则更新，不存在则插入）
   * @param template - 实际操作输入，按本方法约束校验。
   * @param tx - 可选受控数据库事务。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example 模块内部上下文
   * ```ts
   * async function save(repository: TemplateRepository, template: ReachTemplate) {
   *   const saved = await repository.upsert(template)
   *   if (!saved.success) throw new Error(saved.error.message)
   * }
   * ```
   */
  upsert: (template: ReachTemplate, tx?: DmlWithTxOperations) => Promise<HaiResult<void>>

  /**
   * 按名称删除模板
   * @param name - 实际操作输入，按本方法约束校验。
   * @param tx - 可选受控数据库事务。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example 模块内部上下文
   * ```ts
   * async function remove(repository: TemplateRepository, name: string) {
   *   const removed = await repository.deleteByName(name)
   *   if (!removed.success) throw new Error(removed.error.message)
   * }
   * ```
   */
  deleteByName: (name: string, tx?: DmlWithTxOperations) => Promise<HaiResult<void>>

  /**
   * 获取所有模板（转换为 ReachTemplate 格式）
   * @param tx - 可选受控数据库事务。
   * @returns HaiResult；先检查success，条件提交失败不能伪装成功。
   *
   * @example 模块内部上下文
   * ```ts
   * async function list(repository: TemplateRepository) {
   *   const listed = await repository.listTemplates()
   *   if (!listed.success) throw new Error(listed.error.message)
   *   return listed.data
   * }
   * ```
   */
  listTemplates: (tx?: DmlWithTxOperations) => Promise<HaiResult<ReachTemplate[]>>
}

// ─── 模板存储实现 ───

/** 表名 */
const TABLE_NAME = 'hai_reach_template'

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
let templateRepoSqlOps: unknown = null

/**
 * 内部关闭时释放旧db.sql对应的仓库引用，不删除持久模板或重置其它节点。
 *
 * @example 模块内部上下文
 * ```ts
 * resetTemplateRepoSingleton()
 * ```
 */
export function resetTemplateRepoSingleton(): void {
  templateRepoInstance = null
  templateRepoSqlOps = null
}

/**
 * 内部创建/复用当前数据库生命周期的模板仓库，并实际确认表可访问；连接故障返回失败。
 * @param db - 已初始化共享数据库。
 * @returns 模板仓库HaiResult；不使用进程模板内容缓存。
 *
 * @example 模块内部上下文
 * ```ts
 * const { reldb } = await import('@h-ai/reldb')
 * const connected = await reldb.init({ type: 'postgresql', host: 'db', port: 5432, database: 'hai', user: 'postgres', password: process.env.HAI_DB_PASSWORD })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const created = await createTemplateRepository(reldb)
 *   if (!created.success) throw new Error(created.error.message)
 *   const repository = created.data
 *   const listed = await repository.listTemplates()
 *   if (!listed.success) throw new Error(listed.error.message)
 *   const count = listed.data.length
 * }
 * finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export async function createTemplateRepository(db: ReldbFunctions): Promise<HaiResult<TemplateRepository>> {
  if (templateRepoInstance && templateRepoSqlOps === db.sql)
    return ok(templateRepoInstance)

  const repo = new DbTemplateRepository(db)
  // 触发表创建（BaseReldbCrudRepository 的表创建是异步的）
  const initResult = await repo.count()
  if (!initResult.success) {
    return err(
      HaiReachError.SEND_FAILED,
      reachM('reach_templateDbInitFailed', { params: { error: initResult.error.message } }),
      initResult.error,
    )
  }
  templateRepoInstance = repo
  templateRepoSqlOps = db.sql
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
  async findByName(name: string, tx?: DmlWithTxOperations): Promise<HaiResult<StoredTemplate | undefined>> {
    const result = await this.findAll({ where: 'name = ?', params: [name], limit: 1 }, tx)
    if (!result.success) {
      return result
    }
    return ok(result.data[0])
  }

  /** 保存模板（存在则更新，不存在则插入） */
  async upsert(template: ReachTemplate, tx?: DmlWithTxOperations): Promise<HaiResult<void>> {
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
        return updateResult
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
        return createResult
      }
    }
    return ok(undefined)
  }

  /** 按名称删除模板 */
  async deleteByName(name: string, tx?: DmlWithTxOperations): Promise<HaiResult<void>> {
    const existing = await this.findByName(name, tx)
    if (!existing.success) {
      return existing
    }
    if (!existing.data) {
      return ok(undefined)
    }
    const result = await this.deleteById(existing.data.id, tx)
    if (!result.success) {
      return result
    }
    return ok(undefined)
  }

  /** 获取所有模板（转换为 ReachTemplate 格式） */
  async listTemplates(tx?: DmlWithTxOperations): Promise<HaiResult<ReachTemplate[]>> {
    const result = await this.findAll({ orderBy: 'name ASC' }, tx)
    if (!result.success) {
      return result
    }
    return ok(result.data.map(toReachTemplate))
  }
}
