/**
 * @h-ai/reldb — CRUD 仓库基类
 *
 * 提供 `BaseReldbCrudRepository` 抽象基类，供业务仓库继承复用。
 * @module reldb-crud-repository
 */

import type { PaginatedResult, Result } from '@h-ai/core'
import type { ReldbConfig } from './reldb-config.js'
import type {
  BaseReldbCrudRepositoryConfig,
  CrudPageOptions,
  CrudQueryOptions,
  DmlOperations,
  DmlWithTxOperations,
  ExecuteResult,
  QueryRow,
  ReldbCrudCountOptions,
  ReldbCrudFieldDefinition,
  ReldbCrudRepository,
  ReldbError,
  ReldbFunctions,
  ReldbTableDef,
} from './reldb-types.js'

import { err, ok } from '@h-ai/core'
import { ReldbErrorCode } from './reldb-config.js'
import { reldbM } from './reldb-i18n.js'

/**
 * CRUD 仓库基类
 *
 * 提供通用的单表 CRUD 操作封装，业务仓库可继承该类实现自定义逻辑。
 *
 * 核心能力：
 * - 自动建表（默认开启，可通过 `createTableIfNotExists: false` 关闭）
 * - 字段级别的权限控制（select / create / update 分别配置）
 * - 自动填充主键、createdAt、updatedAt
 * - 跨数据库类型值转换（BOOLEAN / TIMESTAMP / JSON）
 * - 支持事务上下文（所有方法均接受可选 tx 参数）
 *
 * @example
 * ```ts
 * class UserRepository extends BaseReldbCrudRepository<User> {
 *   constructor(db: ReldbFunctions) {
 *     super(db, {
 *       table: 'users',
 *       fields: [
 *         { fieldName: 'id', columnName: 'id', def: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, select: true, create: false, update: false },
 *         { fieldName: 'name', columnName: 'name', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
 *         { fieldName: 'createdAt', columnName: 'created_at', def: { type: 'TIMESTAMP' }, select: true, create: true, update: false },
 *       ],
 *     })
 *   }
 * }
 * ```
 */
export abstract class BaseReldbCrudRepository<TItem> implements ReldbCrudRepository<TItem> {
  /** 底层 CRUD 仓库实例（基于 reldb-crud-kernel 创建） */
  protected readonly crud: ReldbCrudRepository<TItem>
  /** 数据库服务对象 */
  protected readonly db: ReldbFunctions
  /** 字段定义列表 */
  private readonly fields: ReldbCrudFieldDefinition[]
  /** 主键字段名（对象侧） */
  private readonly idField?: string
  /** 主键列名（数据库侧） */
  private readonly idColumn: string
  /** 主键生成器 */
  private readonly generateId?: () => string | number
  /** 当前时间提供者（默认 Date.now） */
  private readonly nowProvider: () => number
  /** 初始化 Promise（自动建表等） */
  private readonly initPromise: Promise<Result<void, ReldbError>>
  /** 可查询列 */
  private readonly selectColumns: string[]
  /** 可插入列 */
  private readonly createColumns: string[]
  /** 可更新列 */
  private readonly updateColumns: string[]
  /** 当前数据库类型（延迟读取，确保获取初始化后的值） */
  private get dbType(): ReldbConfig['type'] | undefined {
    return this.db.config?.type
  }

  /**
   * 创建 BaseReldbCrudRepository
   *
   * 初始化字段映射、构建表结构（默认自动建表）并配置底层 CRUD 仓库。
   *
   * @param db - 数据库服务对象
   * @param config - BaseReldbCrudRepository 配置（表名、字段定义、主键策略等）
   */
  protected constructor(db: ReldbFunctions, config: BaseReldbCrudRepositoryConfig<TItem>) {
    this.db = db
    this.fields = config.fields
    this.idColumn = config.idColumn ?? 'id'
    this.idField = config.idField ?? this.resolveIdField(config.fields, this.idColumn)
    this.generateId = config.generateId ?? this.defaultIdGenerator()
    this.nowProvider = config.nowProvider ?? (() => Date.now())

    // 构建表结构定义并按需创建表（默认开启）
    const tableDef = this.buildReldbTableDef(config.fields)
    const createTable = config.createTableIfNotExists !== false
      ? this.db.ddl.createTable(config.table, tableDef, true)
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

    this.crud = this.db.crud.table<TItem>({
      table: config.table,
      idColumn: this.idColumn,
      select: this.selectColumns,
      createColumns: this.createColumns,
      updateColumns: this.updateColumns,
      mapRow: (row: Record<string, unknown>) => this.mapRow(row),
    })
  }

  /**
   * 获取 SQL 操作对象（自动选择 reldb.sql 或 tx）
   *
   * 当传入事务句柄时，自动使用事务内 DataOperations；否则使用 reldb.sql。
   *
   * @param tx - 可选事务句柄
   * @returns DataOperations 实例
   */
  protected sql(tx?: DmlWithTxOperations): DmlOperations {
    return tx ?? this.db.sql
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
  private resolveIdField(fields: ReldbCrudFieldDefinition[], idColumn: string): string | undefined {
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
  private buildReldbTableDef(fields: ReldbCrudFieldDefinition[]): ReldbTableDef {
    const entries = fields.map(field => [field.columnName, this.normalizeReldbColumnDef(field.def)] as const)
    return Object.fromEntries(entries)
  }

  /**
   * 归一化列定义
   *
   * 用于处理不同数据库对默认值的兼容差异（例如 BOOLEAN）。
   */
  private normalizeReldbColumnDef(def: ReldbCrudFieldDefinition['def']): ReldbCrudFieldDefinition['def'] {
    if (def.defaultValue === undefined || def.defaultValue === null) {
      // 无默认值时直接返回
      return def
    }
    if (def.type !== 'BOOLEAN' || typeof def.defaultValue === 'string') {
      // 仅处理布尔且非字符串的默认值
      return def
    }

    const normalized: ReldbCrudFieldDefinition['def'] = { ...def }
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
  private isCreatedAtField(field: ReldbCrudFieldDefinition): boolean {
    return field.fieldName === 'createdAt' || field.columnName === 'created_at'
  }

  /**
   * 判断是否为更新时间字段
   */
  private isUpdatedAtField(field: ReldbCrudFieldDefinition): boolean {
    return field.fieldName === 'updatedAt' || field.columnName === 'updated_at'
  }

  /**
   * 将数据库值转换为业务值
   *
   * @param value - 数据库原始值
   * @param def - 字段定义
   * @returns 业务侧值（可能为 undefined）
   */
  private fromDbValue(value: unknown, def: ReldbCrudFieldDefinition['def']): unknown {
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
  private toDbValue(value: unknown, def: ReldbCrudFieldDefinition['def']): unknown {
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
    // 行映射结果为动态构建的对象，无法通过 TS 静态推导，需强转为 TItem
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

    let generatedId: string | number | undefined
    const idFieldDef = this.fields.find(field => field.fieldName === this.idField)
    if (this.idField && !idFieldDef?.def.autoIncrement) {
      const currentId = data[this.idField]
      if (currentId !== undefined) {
        // 已提供主键，直接使用
      }
      else if (this.generateId) {
        // 未提供主键，使用生成器
        generatedId = this.generateId()
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
  private async ensureReady(): Promise<Result<void, ReldbError>> {
    const result = await this.initPromise
    if (!result.success) {
      // 透传初始化失败结果
      return result
    }
    return ok(undefined)
  }

  /**
   * 创建单条记录
   *
   * 自动处理主键生成、createdAt/updatedAt 填充、字段类型转换。
   *
   * @param data - 业务字段与值的映射
   * @param tx - 可选事务句柄
   * @returns 插入结果（含 changes、lastInsertRowid）
   */
  async create(data: Record<string, unknown>, tx?: DmlWithTxOperations): Promise<Result<ExecuteResult, ReldbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<ExecuteResult, ReldbError>
    }
    const payload = this.buildCreatePayload(data)
    if (Object.keys(payload).length === 0) {
      // 无可写入字段时返回配置错误
      return err({
        code: ReldbErrorCode.CONFIG_ERROR,
        message: reldbM('reldb_crudEmptyPayload'),
      })
    }
    return this.crud.create(payload, tx)
  }

  /**
   * 批量创建记录
   *
   * 每条记录均通过 buildCreatePayload 处理，然后以 batch 方式写入。
   *
   * @param items - 待插入的业务数据数组
   * @param tx - 可选事务句柄
   * @returns 批量插入结果
   */
  async createMany(items: Array<Record<string, unknown>>, tx?: DmlWithTxOperations): Promise<Result<void, ReldbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<void, ReldbError>
    }
    const payloads = items.map(item => this.buildCreatePayload(item))
    return this.crud.createMany(payloads, tx)
  }

  /**
   * 根据主键查找单条记录
   *
   * @param id - 主键值
   * @param tx - 可选事务句柄
   * @returns 业务模型对象或 null（未找到）
   */
  async findById(id: unknown, tx?: DmlWithTxOperations): Promise<Result<TItem | null, ReldbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<TItem | null, ReldbError>
    }
    return this.crud.findById(id, tx)
  }

  /**
   * 条件查询多条记录
   *
   * @param options - 查询条件（where、orderBy、limit、offset）
   * @param tx - 可选事务句柄
   * @returns 业务模型数组
   */
  async findAll(options?: CrudQueryOptions, tx?: DmlWithTxOperations): Promise<Result<TItem[], ReldbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<TItem[], ReldbError>
    }
    return this.crud.findAll(options, tx)
  }

  /**
   * 分页查询记录
   *
   * @param options - 分页查询条件（where、orderBy、pagination、overrides）
   * @param tx - 可选事务句柄
   * @returns 分页结果（含 items、total、page、pageSize）
   */
  async findPage(options: CrudPageOptions, tx?: DmlWithTxOperations): Promise<Result<PaginatedResult<TItem>, ReldbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<PaginatedResult<TItem>, ReldbError>
    }
    return this.crud.findPage(options, tx)
  }

  /**
   * 根据主键更新记录
   *
   * 自动填充 updatedAt 字段。无可更新字段时返回 CONFIG_ERROR。
   *
   * @param id - 主键值
   * @param data - 待更新的业务字段
   * @param tx - 可选事务句柄
   * @returns 更新结果（含 changes）
   */
  async updateById(id: unknown, data: Record<string, unknown>, tx?: DmlWithTxOperations): Promise<Result<ExecuteResult, ReldbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<ExecuteResult, ReldbError>
    }
    const payload = this.buildUpdatePayload(data)
    if (!payload) {
      // 无可更新字段时返回配置错误
      return err({
        code: ReldbErrorCode.CONFIG_ERROR,
        message: reldbM('reldb_crudEmptyPayload'),
      })
    }
    return this.crud.updateById(id, payload, tx)
  }

  /**
   * 根据主键删除记录
   *
   * @param id - 主键值
   * @param tx - 可选事务句柄
   * @returns 删除结果（含 changes）
   */
  async deleteById(id: unknown, tx?: DmlWithTxOperations): Promise<Result<ExecuteResult, ReldbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<ExecuteResult, ReldbError>
    }
    return this.crud.deleteById(id, tx)
  }

  /**
   * 统计符合条件的记录数
   *
   * @param options - 查询条件（where、params）
   * @param tx - 可选事务句柄
   * @returns 记录数
   */
  async count(options?: ReldbCrudCountOptions, tx?: DmlWithTxOperations): Promise<Result<number, ReldbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<number, ReldbError>
    }
    return this.crud.count(options, tx)
  }

  /**
   * 检查是否存在符合条件的记录
   *
   * @param options - 查询条件（where、params）
   * @param tx - 可选事务句柄
   * @returns 是否存在
   */
  async exists(options?: ReldbCrudCountOptions, tx?: DmlWithTxOperations): Promise<Result<boolean, ReldbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<boolean, ReldbError>
    }
    return this.crud.exists(options, tx)
  }

  /**
   * 根据主键检查记录是否存在
   *
   * @param id - 主键值
   * @param tx - 可选事务句柄
   * @returns 是否存在
   */
  async existsById(id: unknown, tx?: DmlWithTxOperations): Promise<Result<boolean, ReldbError>> {
    const ready = await this.ensureReady()
    if (!ready.success) {
      return ready as Result<boolean, ReldbError>
    }
    return this.crud.existsById(id, tx)
  }
}
