/**
 * =============================================================================
 * @hai/db - CRUD 仓库基类
 * =============================================================================
 *
 * 提供 CrudRepository 的默认实现，供业务仓库继承复用。
 *
 * @module db-crud-repository
 * =============================================================================
 */

import type { PaginatedResult, Result } from '@hai/core'
import type { DbConfig } from '../db-config.js'
import type {
  BaseCrudRepositoryConfig,
  CrudCountOptions,
  CrudFieldDefinition,
  CrudPageOptions,
  CrudQueryOptions,
  CrudRepository,
  DbError,
  DbService,
  ExecuteResult,
  QueryRow,
  TableDef,
  TxHandle,
} from '../db-types.js'

import { err, ok } from '@hai/core'
import { DbErrorCode } from '../db-config.js'
import { dbM } from '../db-i18n.js'

/**
 * CRUD 仓库基类
 *
 * 业务仓库可继承该类，并通过组合的 CrudRepository 实例实现通用 CRUD。
 */
export abstract class BaseCrudRepository<TItem> implements CrudRepository<TItem> {
  /** 底层 CRUD 仓库实例（由子类传入） */
  protected readonly crud: CrudRepository<TItem>
  private readonly fields: CrudFieldDefinition[]
  private readonly idField?: string
  private readonly idColumn: string
  private readonly generateId?: () => string | number
  private readonly nowProvider: () => number
  private readonly initPromise: Promise<Result<void, DbError>>
  private readonly selectColumns: string[]
  private readonly createColumns: string[]
  private readonly updateColumns: string[]
  private readonly dbType?: DbConfig['type']

  /**
   * 创建 BaseCrudRepository
   * @param db - 数据库服务
   * @param config - BaseCrudRepository 配置
   */
  protected constructor(db: DbService, config: BaseCrudRepositoryConfig<TItem>) {
    this.dbType = db.config?.type
    this.fields = config.fields
    this.idColumn = config.idColumn ?? 'id'
    this.idField = config.idField ?? this.resolveIdField(config.fields, this.idColumn)
    this.generateId = config.generateId ?? this.defaultIdGenerator()
    this.nowProvider = config.nowProvider ?? (() => Date.now())

    // 构建表结构定义并按需创建表（默认开启）
    const tableDef = this.buildTableDef(config.fields)
    const createTable = config.createTableIfNotExists !== false
      ? db.ddl.createTable(config.table, tableDef, true)
      : Promise.resolve(ok(undefined))

    this.initPromise = createTable

    // 选择、创建、更新字段的列集合
    this.selectColumns = this.fields.filter(field => field.select).map(field => field.columnName)
    this.createColumns = this.fields.filter(field => field.create).map(field => field.columnName)
    const updateColumns = this.fields.filter(field => field.update).map(field => field.columnName)
    const updatedAtField = this.fields.find(field => this.isUpdatedAtField(field))
    this.updateColumns = updatedAtField && !updateColumns.includes(updatedAtField.columnName)
      ? [...updateColumns, updatedAtField.columnName]
      : updateColumns

    this.crud = db.crud.table<TItem>({
      table: config.table,
      idColumn: this.idColumn,
      select: this.selectColumns,
      createColumns: this.createColumns,
      updateColumns: this.updateColumns,
      mapRow: row => this.mapRow(row),
    })
  }

  /**
   * 解析主键字段
   *
   * 优先使用声明为主键的字段；如果未声明主键，则回退到列名匹配。
   *
   * @param fields - 字段定义列表
   * @param idColumn - 主键列名
   * @returns 主键字段名（可能为空）
   */
  private resolveIdField(fields: CrudFieldDefinition[], idColumn: string): string | undefined {
    const primary = fields.find(field => field.def.primaryKey)
    if (primary) {
      // 显式主键优先
      return primary.fieldName
    }
    // 回退到列名匹配
    const byColumn = fields.find(field => field.columnName === idColumn)
    return byColumn?.fieldName
  }

  /**
   * 生成默认主键生成器
   *
   * 在运行环境支持 `crypto.randomUUID` 时返回 UUID 生成函数，否则返回 undefined。
   */
  private defaultIdGenerator(): (() => string | number) | undefined {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      // 浏览器或 Node 环境支持 UUID
      return () => crypto.randomUUID()
    }
    // 无可用生成器时交由上层提供或数据库自增
    return undefined
  }

  /**
   * 构建表结构定义
   *
   * @param fields - 字段定义列表
   * @returns 表结构定义
   */
  private buildTableDef(fields: CrudFieldDefinition[]): TableDef {
    const entries = fields.map(field => [field.columnName, this.normalizeColumnDef(field.def)] as const)
    return Object.fromEntries(entries)
  }

  /**
   * 归一化列定义
   *
   * 用于处理不同数据库对默认值的兼容差异（例如 BOOLEAN）。
   */
  private normalizeColumnDef(def: CrudFieldDefinition['def']): CrudFieldDefinition['def'] {
    if (def.defaultValue === undefined || def.defaultValue === null) {
      // 无默认值时直接返回
      return def
    }
    if (def.type !== 'BOOLEAN' || typeof def.defaultValue === 'string') {
      // 仅处理布尔且非字符串的默认值
      return def
    }

    const normalized: CrudFieldDefinition['def'] = { ...def }
    if (this.dbType === 'postgresql') {
      // PostgreSQL 支持 true/false
      normalized.defaultValue = Boolean(def.defaultValue)
      return normalized
    }
    // SQLite/MySQL 使用 1/0
    normalized.defaultValue = def.defaultValue ? 1 : 0
    return normalized
  }

  /**
   * 判断是否为创建时间字段
   */
  private isCreatedAtField(field: CrudFieldDefinition): boolean {
    return field.fieldName === 'createdAt' || field.columnName === 'created_at'
  }

  /**
   * 判断是否为更新时间字段
   */
  private isUpdatedAtField(field: CrudFieldDefinition): boolean {
    return field.fieldName === 'updatedAt' || field.columnName === 'updated_at'
  }

  /**
   * 将数据库值转换为业务值
   *
   * @param value - 数据库原始值
   * @param def - 字段定义
   * @returns 业务侧值（可能为 undefined）
   */
  private fromDbValue(value: unknown, def: CrudFieldDefinition['def']): unknown {
    if (value === null || value === undefined) {
      // DB 空值统一映射为 undefined
      return undefined
    }
    if (def.type === 'BOOLEAN') {
      // 兼容 0/1、true/false
      return Boolean(value)
    }
    if (def.type === 'TIMESTAMP') {
      if (value instanceof Date) {
        return value
      }
      if (typeof value === 'number') {
        return new Date(value)
      }
      // 尝试解析字符串时间
      const parsed = Date.parse(String(value))
      return Number.isNaN(parsed) ? undefined : new Date(parsed)
    }
    if (def.type === 'JSON') {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value) as unknown
        }
        catch {
          // JSON 解析失败时返回 undefined
          return undefined
        }
      }
      return value
    }
    return value
  }

  /**
   * 将业务值转换为数据库值
   *
   * @param value - 业务侧值
   * @param def - 字段定义
   * @returns 适配数据库的值
   */
  private toDbValue(value: unknown, def: CrudFieldDefinition['def']): unknown {
    if (value === undefined) {
      // undefined 表示不写入
      return undefined
    }
    if (value === null) {
      // null 保持为数据库 NULL
      return null
    }
    if (def.type === 'BOOLEAN') {
      if (this.dbType === 'postgresql') {
        // PostgreSQL 直接使用 boolean
        return Boolean(value)
      }
      // SQLite/MySQL 使用 1/0
      return value ? 1 : 0
    }
    if (def.type === 'TIMESTAMP') {
      if (this.dbType === 'sqlite') {
        if (value instanceof Date) {
          return value.getTime()
        }
        if (typeof value === 'number') {
          return value
        }
        // SQLite 以毫秒时间戳存储
        const parsed = Date.parse(String(value))
        return Number.isNaN(parsed) ? value : parsed
      }
      if (value instanceof Date) {
        return value
      }
      if (typeof value === 'number') {
        return new Date(value)
      }
      return value
    }
    if (def.type === 'JSON') {
      if (typeof value === 'string') {
        // 已是 JSON 字符串
        return value
      }
      // 统一序列化为字符串
      return JSON.stringify(value)
    }
    return value
  }

  /**
   * 将查询行映射为业务模型
   */
  private mapRow(row: QueryRow): TItem {
    const result: Record<string, unknown> = {}
    for (const field of this.fields) {
      if (!field.select) {
        // 不可查询字段直接跳过
        continue
      }
      const value = this.fromDbValue(row[field.columnName], field.def)
      result[field.fieldName] = value
    }
    return result as unknown as TItem
  }

  /**
   * 构建创建数据的列值映射
   *
   * 处理主键生成、默认值、createdAt/updatedAt 填充等规则。
   */
  private buildCreatePayload(data: Record<string, unknown>): Record<string, unknown> {
    const payload: Record<string, unknown> = {}
    const now = this.nowProvider()
    const context = { id: '', now }

    let generatedId: string | number | undefined
    const idFieldDef = this.fields.find(field => field.fieldName === this.idField)
    if (this.idField && !idFieldDef?.def.autoIncrement) {
      const currentId = data[this.idField]
      if (currentId !== undefined) {
        // 已提供主键，直接使用
        context.id = String(currentId)
      }
      else if (this.generateId) {
        // 未提供主键，使用生成器
        generatedId = this.generateId()
        context.id = String(generatedId)
      }
    }

    for (const field of this.fields) {
      if (!field.create) {
        // 不允许写入的字段跳过
        continue
      }

      let value = data[field.fieldName]

      if (value === undefined && field.def.autoIncrement) {
        // 自增字段留给数据库生成
        continue
      }

      if (field.fieldName === this.idField && value === undefined && generatedId !== undefined) {
        // 使用自动生成的主键
        value = generatedId
      }

      if (value === undefined) {
        if (this.isCreatedAtField(field) || this.isUpdatedAtField(field)) {
          // 默认填充创建/更新时间
          value = now
        }
        else if (field.def.defaultValue !== undefined && typeof field.def.defaultValue !== 'string') {
          // 非字符串默认值直接写入
          value = field.def.defaultValue
        }
      }

      if (value === undefined) {
        // 仍为空则跳过该列
        continue
      }

      payload[field.columnName] = this.toDbValue(value, field.def)
    }

    return payload
  }

  /**
   * 构建更新数据的列值映射
   *
   * 当没有任何可更新字段时返回 null。
   */
  private buildUpdatePayload(data: Record<string, unknown>): Record<string, unknown> | null {
    const payload: Record<string, unknown> = {}
    const now = this.nowProvider()

    for (const field of this.fields) {
      if (!field.update) {
        // 不允许更新的字段跳过
        continue
      }
      const value = data[field.fieldName]
      if (value === undefined) {
        // 未提供更新值则跳过
        continue
      }
      payload[field.columnName] = this.toDbValue(value, field.def)
    }

    if (Object.keys(payload).length === 0) {
      // 无可更新字段
      return null
    }

    const updatedAtField = this.fields.find(field => this.isUpdatedAtField(field))
    if (updatedAtField) {
      // 统一补写更新时间
      payload[updatedAtField.columnName] = this.toDbValue(now, updatedAtField.def)
    }

    return payload
  }

  /**
   * 等待初始化完成
   *
   * @returns 初始化结果
   */
  private async ensureReady(): Promise<Result<void, DbError>> {
    const result = await this.initPromise
    if (!result.success) {
      // 透传初始化失败结果
      return result
    }
    return ok(undefined)
  }

  async create(data: Record<string, unknown>, tx?: TxHandle): Promise<Result<ExecuteResult, DbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<ExecuteResult, DbError>
    }
    const payload = this.buildCreatePayload(data)
    if (Object.keys(payload).length === 0) {
      // 无可写入字段时返回配置错误
      return err({
        code: DbErrorCode.CONFIG_ERROR,
        message: dbM('db_crudEmptyPayload'),
      })
    }
    return this.crud.create(payload, tx)
  }

  async createMany(items: Array<Record<string, unknown>>, tx?: TxHandle): Promise<Result<void, DbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<void, DbError>
    }
    const payloads = items.map(item => this.buildCreatePayload(item))
    return this.crud.createMany(payloads, tx)
  }

  async findById(id: unknown, tx?: TxHandle): Promise<Result<TItem | null, DbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<TItem | null, DbError>
    }
    return this.crud.findById(id, tx)
  }

  async findAll(options?: CrudQueryOptions, tx?: TxHandle): Promise<Result<TItem[], DbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<TItem[], DbError>
    }
    return this.crud.findAll(options, tx)
  }

  async findPage(options: CrudPageOptions, tx?: TxHandle): Promise<Result<PaginatedResult<TItem>, DbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<PaginatedResult<TItem>, DbError>
    }
    return this.crud.findPage(options, tx)
  }

  async updateById(id: unknown, data: Record<string, unknown>, tx?: TxHandle): Promise<Result<ExecuteResult, DbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<ExecuteResult, DbError>
    }
    const payload = this.buildUpdatePayload(data)
    if (!payload) {
      // 无可更新字段时返回配置错误
      return err({
        code: DbErrorCode.CONFIG_ERROR,
        message: dbM('db_crudEmptyPayload'),
      })
    }
    return this.crud.updateById(id, payload, tx)
  }

  async deleteById(id: unknown, tx?: TxHandle): Promise<Result<ExecuteResult, DbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<ExecuteResult, DbError>
    }
    return this.crud.deleteById(id, tx)
  }

  async count(options?: CrudCountOptions, tx?: TxHandle): Promise<Result<number, DbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<number, DbError>
    }
    return this.crud.count(options, tx)
  }

  async exist(options?: CrudCountOptions, tx?: TxHandle): Promise<Result<boolean, DbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<boolean, DbError>
    }
    return this.crud.exist(options, tx)
  }

  async existById(id: unknown, tx?: TxHandle): Promise<Result<boolean, DbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<boolean, DbError>
    }
    return this.crud.existById(id, tx)
  }

  async existsById(id: unknown, tx?: TxHandle): Promise<Result<boolean, DbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<boolean, DbError>
    }
    return this.crud.existsById(id, tx)
  }
}
