/**
 * @h-ai/reldb — 类型定义
 *
 * 本文件定义数据库模块的核心接口和类型（非配置相关）。 配置相关类型请从 reldb-config.ts 导入。
 * @module reldb-types
 */

import type { ErrorInfo, HaiResult, PaginatedResult, PaginationOptions, PaginationOptionsInput } from '@h-ai/core'
import type { DbType, ReldbConfig, ReldbConfigInput } from './reldb-config.js'
import type { JsonSqlExpr, ReldbJsonOps } from './reldb-json.js'
import { core } from '@h-ai/core'

export type { JsonSqlExpr, ReldbJsonOps }

// ─── 错误类型 ───

const ReldbErrorInfo = {
  // ─── 通用 001-009 ───
  CONNECTION_FAILED: '001:500',
  QUERY_FAILED: '002:500',
  CONSTRAINT_VIOLATION: '003:409',
  TRANSACTION_FAILED: '004:500',
  MIGRATION_FAILED: '005:500',
  RECORD_NOT_FOUND: '006:404',
  DUPLICATE_ENTRY: '007:409',
  DEADLOCK: '008:500',
  TIMEOUT: '009:504',
  // ─── 初始化 010-019 ───
  NOT_INITIALIZED: '010:500',
  POOL_EXHAUSTED: '011:503',
  UNSUPPORTED_TYPE: '012:400',
  CONFIG_ERROR: '013:500',
  // ─── 业务操作 020+ ───
  DDL_FAILED: '020:500',
} satisfies ErrorInfo

/**
 * HaiReldbError 的数据约束与操作契约。
 * @example
 * ```ts
 * import { HaiReldbError } from '@h-ai/reldb'
 * import { err } from '@h-ai/core'
 *
 * const result = err(HaiReldbError.QUERY_FAILED, 'Query failed')
 * if (!result.success) void result.error.code
 * ```
 */
export const HaiReldbError = core.error.buildHaiErrorsDef('reldb', ReldbErrorInfo)

// ─── 列定义 ───

/**
 * 列数据类型
 *
 * 统一的列类型定义，会根据不同数据库自动映射：
 *
 * | 类型        | SQLite  | PostgreSQL       | MySQL        |
 * |------------|---------|------------------|--------------|
 * | TEXT       | TEXT    | TEXT             | VARCHAR(255) |
 * | INTEGER    | INTEGER | INTEGER/BIGSERIAL | INT/BIGINT   |
 * | BIGINT     | INTEGER | BIGINT           | BIGINT       |
 * | REAL       | REAL    | DOUBLE PRECISION | DOUBLE       |
 * | BLOB       | BLOB    | BYTEA            | BLOB         |
 * | BOOLEAN    | INTEGER | BOOLEAN          | TINYINT(1)   |
 * | TIMESTAMP  | INTEGER | TIMESTAMP        | DATETIME     |
 * | JSON       | TEXT    | JSONB            | JSON         |
 *
 * 注：MySQL 将 TEXT 映射为 VARCHAR(255) 以支持索引和 UNIQUE 约束。
 * INTEGER 在 MySQL autoIncrement 时映射为 BIGINT，在 PostgreSQL 映射为 BIGSERIAL，否则为 32 位 INT/INTEGER。
 * Unix 毫秒应声明为 BIGINT；原始 SQL/CRUD 的 BIGINT 返回形态取决于驱动，可能为 number/string/bigint。
 * 使用 number 的业务仓库须校验 Number.isSafeInteger，超出范围不能直接强转而丢失精度。
 * @example
 * ```ts
 * import type { ColumnType } from '@h-ai/reldb'
 *
 * const value: ColumnType = 'TEXT'
 * void value
 * ```
 */
export type ColumnType
  = | 'TEXT'
    | 'INTEGER'
    | 'BIGINT'
    | 'REAL'
    | 'BLOB'
    | 'BOOLEAN'
    | 'TIMESTAMP'
    | 'JSON'

/**
 * 列定义接口
 *
 * 用于定义表的列结构。
 * @example
 * ```ts
 * import type { ReldbColumnDef } from '@h-ai/reldb'
 *
 * const value: ReldbColumnDef = { type: 'INTEGER', primaryKey: true, autoIncrement: true }
 * void value
 * ```
 */
export interface ReldbColumnDef {
  /** 列数据类型 */
  type: ColumnType
  /** 是否为主键 */
  primaryKey?: boolean
  /** 是否自增（仅主键有效） */
  autoIncrement?: boolean
  /** 是否非空 */
  notNull?: boolean
  /** 默认值（支持字符串、数字、布尔、null） */
  defaultValue?: string | number | boolean | null
  /** 是否唯一 */
  unique?: boolean
  /** 外键引用 */
  references?: {
    /** 引用的表名 */
    table: string
    /** 引用的列名 */
    column: string
    /** 删除时的行为 */
    onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION'
    /** 更新时的行为 */
    onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION'
  }
}

/**
 * 表定义（列名到列定义的映射）
 * @example
 * ```ts
 * import type { ReldbTableDef } from '@h-ai/reldb'
 *
 * const value: ReldbTableDef = { id: { type: 'TEXT', primaryKey: true }, name: { type: 'TEXT', notNull: true } }
 * void value
 * ```
 */
export interface ReldbTableDef {
  [columnName: string]: ReldbColumnDef
}

/**
 * 索引定义
 * @example
 * ```ts
 * import type { ReldbIndexDef } from '@h-ai/reldb'
 *
 * const value: ReldbIndexDef = { columns: ['email'], unique: true }
 * void value
 * ```
 */
export interface ReldbIndexDef {
  /** 索引包含的列 */
  columns: string[]
  /** 是否为唯一索引 */
  unique?: boolean
  /**
   * 索引条件（WHERE 子句，用于部分索引）
   *
   * **⚠️ 安全警告：** `where` 为原始 SQL 片段，不会经过参数化处理，
   * **禁止**将用户输入直接拼接。仅用于开发者编写的静态条件。
   * @example
   * ```ts
   * import type { CrudQueryOptions } from '@h-ai/reldb'
   *
   * const options: CrudQueryOptions = { where: 'name = ?', params: ['Alice'] }
   * void options // 值走绑定参数；SQL 结构由开发者静态编写。
   * ```
   */
  where?: string
}

// ─── DDL 操作接口 ───

/**
 * DDL（数据定义语言）操作接口
 *
 * 提供表结构管理功能，包括创建/删除表、添加/删除列、创建索引等。
 * 结构修改返回 `HaiResult<void>`；hasTable 返回 `HaiResult<boolean>`，以实际签名为准。
 * @example
 * ```ts
 * import type { DdlOperations } from '@h-ai/reldb'
 *
 * async function use(operations: DdlOperations) {
 *   const result = await operations.createTable('users', { id: { type: 'TEXT', primaryKey: true } })
 *   if (!result.success) throw new Error(result.error.message)
 *   void result.data
 * }
 * ```
 */
export interface DdlOperations {
  /**
   * 创建表
   * @param tableName - 表名
   * @param columns - 列定义
   * @param ifNotExists - 是否使用 IF NOT EXISTS（默认 true）
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const result = await reldb.ddl.createTable('users', { id: { type: 'TEXT', primaryKey: true }, name: { type: 'TEXT' } })
   * if (!result.success) throw new Error(result.error.message)
   * void result.data
   * ```
   */
  createTable: (tableName: string, columns: ReldbTableDef, ifNotExists?: boolean) => Promise<HaiResult<void>>

  /**
   * 删除表
   * @param tableName - 表名
   * @param ifExists - 是否使用 IF EXISTS（默认 true）
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const result = await reldb.ddl.dropTable('users_backup')
   * if (!result.success) throw new Error(result.error.message)
   * void result.data
   * ```
   */
  dropTable: (tableName: string, ifExists?: boolean) => Promise<HaiResult<void>>

  /**
   * 添加列
   * @param tableName - 表名
   * @param columnName - 列名
   * @param columnDef - 列定义
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const result = await reldb.ddl.addColumn('users', 'age', { type: 'INTEGER' })
   * if (!result.success) throw new Error(result.error.message)
   * void result.data
   * ```
   */
  addColumn: (tableName: string, columnName: string, columnDef: ReldbColumnDef) => Promise<HaiResult<void>>

  /**
   * 删除列
   * @param tableName - 表名
   * @param columnName - 列名
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const result = await reldb.ddl.dropColumn('users', 'legacy_field')
   * if (!result.success) throw new Error(result.error.message)
   * void result.data
   * ```
   */
  dropColumn: (tableName: string, columnName: string) => Promise<HaiResult<void>>

  /**
   * 重命名表
   * @param oldName - 原表名
   * @param newName - 新表名
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const result = await reldb.ddl.renameTable('users_old', 'users')
   * if (!result.success) throw new Error(result.error.message)
   * void result.data
   * ```
   */
  renameTable: (oldName: string, newName: string) => Promise<HaiResult<void>>

  /**
   * 创建索引
   * @param tableName - 表名
   * @param indexName - 索引名
   * @param indexDef - 索引定义
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const result = await reldb.ddl.createIndex('users', 'users_name_idx', { columns: ['name'] })
   * if (!result.success) throw new Error(result.error.message)
   * void result.data
   * ```
   */
  createIndex: (tableName: string, indexName: string, indexDef: ReldbIndexDef) => Promise<HaiResult<void>>

  /**
   * 删除索引
   * @param indexName - 索引名
   * @param ifExists - 是否使用 IF EXISTS（默认 true）
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const result = await reldb.ddl.dropIndex('users_name_idx')
   * if (!result.success) throw new Error(result.error.message)
   * void result.data
   * ```
   */
  dropIndex: (indexName: string, ifExists?: boolean) => Promise<HaiResult<void>>

  /**
   * 执行原始 DDL SQL
   *
   * **⚠️ 安全警告：** `sql` 参数不会经过标识符校验或参数化处理，
   * **禁止**将用户输入直接拼接到 SQL 中，否则会导致 SQL 注入风险。
   * 仅用于开发者编写的静态 DDL 语句（如 ALTER TABLE）。
   *
   * @param sql - DDL SQL 语句（必须为开发者静态构造，禁止包含用户输入）
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const result = await reldb.ddl.raw('ALTER TABLE users ADD COLUMN status TEXT')
   * if (!result.success) throw new Error(result.error.message)
   * void result.data
   * ```
   */
  raw: (sql: string) => Promise<HaiResult<void>>
}

// ─── SQL 操作接口 ───

/**
 * 查询结果行类型
 *
 * 约定为键值对象，字段名与 SQL 返回列一致。
 * @example
 * ```ts
 * import type { QueryRow } from '@h-ai/reldb'
 *
 * const value: QueryRow = { id: 'u1', name: 'Alice' }
 * void value
 * ```
 */
export type QueryRow = Record<string, unknown>

/**
 * 执行结果
 *
 * INSERT/UPDATE/DELETE 操作返回的结果。
 * @example
 * ```ts
 * import type { ExecuteResult } from '@h-ai/reldb'
 *
 * const value: ExecuteResult = { changes: 1 }
 * void value
 * ```
 */
export interface ExecuteResult {
  /** 影响的行数 */
  changes: number
  /** 最后插入的行 ID（仅 INSERT 时有效） */
  lastInsertRowid?: number | bigint
}

// ─── 分页类型 ───

/**
 * 规范化后的分页参数
 * @example
 * ```ts
 * import type { NormalizedPagination } from '@h-ai/reldb'
 *
 * const value: NormalizedPagination = { page: 2, pageSize: 10, offset: 10, limit: 10 }
 * void value
 * ```
 */
export interface NormalizedPagination extends PaginationOptions {
  /** SQL offset */
  offset: number
  /** SQL limit */
  limit: number
}

/**
 * 分页参数覆盖
 * @example
 * ```ts
 * import type { PaginationOverrides } from '@h-ai/reldb'
 *
 * const value: PaginationOverrides = { defaultPageSize: 20, maxPageSize: 100 }
 * void value
 * ```
 */
export interface PaginationOverrides {
  /** 默认页码 */
  defaultPage?: number
  /** 默认每页数量 */
  defaultPageSize?: number
  /** 最大每页数量 */
  maxPageSize?: number
}

/**
 * 分页查询参数
 * @example
 * ```ts
 * import type { PaginationQueryOptions } from '@h-ai/reldb'
 *
 * const value: PaginationQueryOptions = { sql: 'SELECT id, name FROM users WHERE active = ?', params: [true], pagination: { page: 2, pageSize: 10 } }
 * void value
 * ```
 */
export interface PaginationQueryOptions {
  /** 数据查询 SQL（不含 LIMIT/OFFSET） */
  sql: string
  /** 参数列表 */
  params?: unknown[]
  /** 分页参数 */
  pagination?: PaginationOptionsInput
  /** 覆盖默认分页参数 */
  overrides?: PaginationOverrides
}

/**
 * 数据读写操作接口（SQL / 事务共享）
 * @example
 * ```ts
 * import type { DmlOperations } from '@h-ai/reldb'
 *
 * async function use(operations: DmlOperations) {
 *   const result = await operations.query<{ id: string }>('SELECT id FROM users WHERE name = ?', ['Alice'])
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
export interface DmlOperations {
  /**
   * 查询多行
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const result = await reldb.sql.query<{ id: string }>('SELECT id FROM users WHERE name = ?', ['Alice'])
   * if (!result.success) throw new Error(result.error.message)
   * void result.data
   * ```
   */
  query: <T = QueryRow>(sql: string, params?: unknown[]) => Promise<HaiResult<T[]>>
  /**
   * 查询单行
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const result = await reldb.sql.get<{ id: string }>('SELECT id FROM users WHERE name = ?', ['Alice'])
   * if (!result.success) throw new Error(result.error.message)
   * void result.data
   * ```
   */
  get: <T = QueryRow>(sql: string, params?: unknown[]) => Promise<HaiResult<T | null>>
  /**
   * 执行修改语句（INSERT/UPDATE/DELETE）
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const result = await reldb.sql.execute('UPDATE users SET name = ? WHERE id = ?', ['Alice', 'u1'])
   * if (!result.success) throw new Error(result.error.message)
   * void result.data
   * ```
   */
  execute: (sql: string, params?: unknown[]) => Promise<HaiResult<ExecuteResult>>
  /**
   * 批量执行多条语句（在同一事务上下文中）
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const result = await reldb.sql.batch([{ sql: 'UPDATE users SET name = ? WHERE id = ?', params: ['Alice', 'u1'] }])
   * if (!result.success) throw new Error(result.error.message)
   * void result.data
   * ```
   */
  batch: (statements: Array<{ sql: string, params?: unknown[] }>) => Promise<HaiResult<void>>
  /**
   * 分页查询
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const result = await reldb.sql.queryPage<{ id: string }>({ sql: 'SELECT id FROM users', pagination: { page: 1, pageSize: 10 } })
   * if (!result.success) throw new Error(result.error.message)
   * void result.data
   * ```
   */
  queryPage: <T = QueryRow>(options: PaginationQueryOptions) => Promise<HaiResult<PaginatedResult<T>>>
}

// ─── CRUD 抽象类型 ───

/**
 * CRUD 查询条件
 * @example
 * ```ts
 * import type { CrudQueryOptions } from '@h-ai/reldb'
 *
 * const value: CrudQueryOptions = { where: 'name = ?', params: ['Alice'], orderBy: 'id ASC', limit: 10 }
 * void value
 * ```
 */
export interface CrudQueryOptions {
  /**
   * WHERE 子句（不包含 WHERE 关键字）
   *
   * **⚠️ 安全警告：** `where` 为原始 SQL 片段，**禁止**将用户输入直接拼接。
   * 动态值必须通过 `params` 占位符（`?`）传入。
   * @example
   * ```ts
   * import type { CrudQueryOptions } from '@h-ai/reldb'
   *
   * const options: CrudQueryOptions = { where: 'name = ?', params: ['Alice'] }
   * void options // 值走绑定参数；SQL 结构由开发者静态编写。
   * ```
   */
  where?: string
  /** 参数列表 */
  params?: unknown[]
  /** ORDER BY 子句（不包含 ORDER BY 关键字） */
  orderBy?: string
  /** LIMIT */
  limit?: number
  /** OFFSET */
  offset?: number
}

/**
 * CRUD 分页查询条件
 * @example
 * ```ts
 * import type { CrudPageOptions } from '@h-ai/reldb'
 *
 * const value: CrudPageOptions = { where: 'active = ?', params: [true], pagination: { page: 1, pageSize: 20 } }
 * void value
 * ```
 */
export interface CrudPageOptions {
  /**
   * WHERE 子句（不包含 WHERE 关键字）
   *
   * **⚠️ 安全警告：** `where` 为原始 SQL 片段，**禁止**将用户输入直接拼接。
   * 动态值必须通过 `params` 占位符（`?`）传入。
   * @example
   * ```ts
   * import type { CrudQueryOptions } from '@h-ai/reldb'
   *
   * const options: CrudQueryOptions = { where: 'name = ?', params: ['Alice'] }
   * void options // 值走绑定参数；SQL 结构由开发者静态编写。
   * ```
   */
  where?: string
  /** 参数列表 */
  params?: unknown[]
  /** ORDER BY 子句（不包含 ORDER BY 关键字） */
  orderBy?: string
  /** 分页参数 */
  pagination?: PaginationOptionsInput
  /** 分页参数覆盖 */
  overrides?: PaginationOverrides
}

/**
 * CRUD 统计条件
 * @example
 * ```ts
 * import type { ReldbCrudCountOptions } from '@h-ai/reldb'
 *
 * const value: ReldbCrudCountOptions = { where: 'active = ?', params: [true] }
 * void value
 * ```
 */
export interface ReldbCrudCountOptions {
  /**
   * WHERE 子句（不包含 WHERE 关键字）
   *
   * **⚠️ 安全警告：** `where` 为原始 SQL 片段，**禁止**将用户输入直接拼接。
   * 动态值必须通过 `params` 占位符（`?`）传入。
   * @example
   * ```ts
   * import type { CrudQueryOptions } from '@h-ai/reldb'
   *
   * const options: CrudQueryOptions = { where: 'name = ?', params: ['Alice'] }
   * void options // 值走绑定参数；SQL 结构由开发者静态编写。
   * ```
   */
  where?: string
  /** 参数列表 */
  params?: unknown[]
}

/**
 * CRUD 配置
 * @example
 * ```ts
 * import type { CrudConfig } from '@h-ai/reldb'
 *
 * const config: CrudConfig<{ id: string }> = { table: 'users', dbType: 'postgresql', select: ['id'], createColumns: ['id'], updateColumns: [] }
 * void config
 * ```
 */
export interface CrudConfig<TItem> {
  /** 表名 */
  table: string
  /** 主键列名（默认 id） */
  idColumn?: string
  /** 查询列（默认 *） */
  select?: string[]
  /** 允许插入的列（不填则使用数据本身列） */
  createColumns?: string[]
  /** 允许更新的列（不填则使用数据本身列） */
  updateColumns?: string[]
  /** 行映射函数（可选） */
  mapRow?: (row: QueryRow) => TItem
  /** 数据库类型 */
  dbType: DbType
}

/**
 * CRUD 字段定义
 * @example
 * ```ts
 * import type { ReldbCrudFieldDefinition } from '@h-ai/reldb'
 *
 * const value: ReldbCrudFieldDefinition = { fieldName: 'name', columnName: 'name', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true }
 * void value
 * ```
 */
export interface ReldbCrudFieldDefinition {
  /** 对象字段名 */
  fieldName: string
  /** 数据库列名 */
  columnName: string
  /** 列定义 */
  def: ReldbColumnDef
  /** 是否用于查询 */
  select: boolean
  /** 是否允许插入 */
  create: boolean
  /** 是否允许更新 */
  update: boolean
}

/**
 * BaseReldbCrudRepository 配置
 * @example
 * ```ts
 * import type { BaseReldbCrudRepositoryConfig } from '@h-ai/reldb'
 *
 * const config: BaseReldbCrudRepositoryConfig<{ id: string }> = {
 *   table: 'users', idField: 'id', fields: [
 *     { fieldName: 'id', columnName: 'id', def: { type: 'TEXT', primaryKey: true }, select: true, create: true, update: false },
 *   ],
 * }
 * void config
 * ```
 */
export interface BaseReldbCrudRepositoryConfig<TItem> {
  /** 表名 */
  table: string
  /** 字段定义 */
  fields: ReldbCrudFieldDefinition[]
  /** 主键列名（默认 id） */
  idColumn?: string
  /** 主键字段名（默认与 idColumn 相同） */
  idField?: keyof TItem & string
  /** 是否自动创建表（默认 true） */
  createTableIfNotExists?: boolean
  /** 主键生成策略（未提供则尝试使用 crypto.randomUUID） */
  generateId?: () => string | number
  /** 当前时间提供者（默认 Date.now） */
  nowProvider?: () => number
}

/**
 * CRUD 仓库接口
 * @example
 * ```ts
 * import type { ReldbCrudRepository } from '@h-ai/reldb'
 *
 * async function use(operations: ReldbCrudRepository<{ id: string }>) {
 *   const result = await operations.findById('u1')
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
export interface ReldbCrudRepository<TItem> {
  create: (data: Record<string, unknown>, tx?: DmlWithTxOperations) => Promise<HaiResult<ExecuteResult>>
  createMany: (items: Array<Record<string, unknown>>, tx?: DmlWithTxOperations) => Promise<HaiResult<void>>
  createOrUpdate: (data: Record<string, unknown>, tx?: DmlWithTxOperations) => Promise<HaiResult<ExecuteResult>>
  findById: (id: unknown, tx?: DmlWithTxOperations) => Promise<HaiResult<TItem | null>>
  getById: (id: unknown, tx?: DmlWithTxOperations) => Promise<HaiResult<TItem>>
  findAll: (options?: CrudQueryOptions, tx?: DmlWithTxOperations) => Promise<HaiResult<TItem[]>>
  findPage: (options: CrudPageOptions, tx?: DmlWithTxOperations) => Promise<HaiResult<PaginatedResult<TItem>>>
  updateById: (id: unknown, data: Record<string, unknown>, tx?: DmlWithTxOperations) => Promise<HaiResult<ExecuteResult>>
  deleteById: (id: unknown, tx?: DmlWithTxOperations) => Promise<HaiResult<ExecuteResult>>
  count: (options?: ReldbCrudCountOptions, tx?: DmlWithTxOperations) => Promise<HaiResult<number>>
  exists: (options?: ReldbCrudCountOptions, tx?: DmlWithTxOperations) => Promise<HaiResult<boolean>>
  existsById: (id: unknown, tx?: DmlWithTxOperations) => Promise<HaiResult<boolean>>
}

/**
 * CRUD 管理器（统一入口）
 * @example
 * ```ts
 * import type { CrudManager } from '@h-ai/reldb'
 *
 * async function use(operations: CrudManager) {
 *   const result = await operations.table<{ id: string }>({ table: 'users', dbType: 'postgresql' }).findById('u1')
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
export interface CrudManager {
  /** 获取单表 CRUD 仓库 */
  table: <TItem>(config: CrudConfig<TItem>) => ReldbCrudRepository<TItem>
}

// ─── 事务接口 ───

/**
 * 事务句柄接口（分步事务）
 * @example
 * ```ts
 * import type { DmlWithTxOperations } from '@h-ai/reldb'
 *
 * async function use(operations: DmlWithTxOperations) {
 *   const result = await operations.execute('UPDATE users SET name = ? WHERE id = ?', ['Alice', 'u1'])
 *   if (!result.success) throw new Error(result.error.message)
 *   const committed = await operations.commit()
 *   if (!committed.success) throw new Error(committed.error.message)
 *   return result.data.changes
 * }
 * ```
 */
export interface DmlWithTxOperations extends DmlOperations {
  /** CRUD 管理器 */
  crud: CrudManager
  /** 提交事务 */
  commit: () => Promise<HaiResult<void>>
  /** 回滚事务 */
  rollback: () => Promise<HaiResult<void>>
}

/**
 * 事务回调函数类型
 *
 * @param tx - 事务内操作对象
 * @returns 业务返回值（将被包装为 HaiResult）；callback 抛错才回滚，返回失败 HaiResult 不会被自动展开。
 * @example
 * ```ts
 * import type { TxWrapCallback } from '@h-ai/reldb'
 *
 * const insert: TxWrapCallback<number> = async (tx) => {
 *   const result = await tx.execute('INSERT INTO users (id, name) VALUES (?, ?)', ['u1', 'Alice'])
 *   if (!result.success) throw new Error(result.error.message) // 显式抛错触发 wrap 回滚。
 *   return result.data.changes
 * }
 * void insert
 * ```
 */
export type TxWrapCallback<T> = (tx: DmlWithTxOperations) => Promise<T>

/**
 * 事务管理器
 * @example
 * ```ts
 * import type { TxManager } from '@h-ai/reldb'
 *
 * async function use(operations: TxManager) {
 *   const result = await operations.wrap(async (tx) => {
 *     const changed = await tx.execute('UPDATE users SET name = ? WHERE id = ?', ['Alice', 'u1'])
 *     if (!changed.success) throw new Error(changed.error.message)
 *     return changed.data.changes
 *   })
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
export interface TxManager {
  /** 开启事务（分步事务） */
  begin: () => Promise<HaiResult<DmlWithTxOperations>>
  /** 包裹事务（自动提交/回滚） */
  wrap: <T>(fn: TxWrapCallback<T>) => Promise<HaiResult<T>>
}

// ─── 数据库函数接口 ───

/**
 * 数据库函数接口
 *
 * 统一的数据库访问入口，通过 `reldb` 对象提供所有数据库操作。
 * @example
 * ```ts
 * import { reldb } from '@h-ai/reldb'
 *
 * const initialized = await reldb.init({ type: 'sqlite', database: ':memory:' }) // 仅示例/测试。
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const created = await reldb.ddl.createTable('users', { id: { type: 'TEXT', primaryKey: true }, name: { type: 'TEXT' } })
 *   if (!created.success) throw new Error(created.error.message)
 *   const inserted = await reldb.sql.execute('INSERT INTO users (id, name) VALUES (?, ?)', ['u1', 'Alice'])
 *   if (!inserted.success) throw new Error(inserted.error.message)
 * } finally {
 *   const closed = await reldb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export interface ReldbFunctions {
  /**
   * 初始化数据库连接
   *
   * @param config - 数据库配置
   * @returns 初始化结果
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const result = await reldb.init({ type: 'sqlite', database: ':memory:' })
   * if (!result.success) throw new Error(result.error.message)
   * void result.data
   * ```
   */
  init: (config: ReldbConfigInput) => Promise<HaiResult<void>>

  /** DDL 操作（表结构管理） */
  readonly ddl: DdlOperations

  /** SQL 操作（数据查询和修改） */
  readonly sql: DmlOperations

  /** CRUD 管理器 */
  readonly crud: CrudManager

  /** 事务管理器 */
  readonly tx: TxManager

  /** 当前数据库脱敏配置快照（未初始化时为 null） */
  readonly config: ReldbConfig | null

  /** 是否已初始化 */
  readonly isInitialized: boolean

  /** 分页工具 */
  readonly pagination: {
    /** 规范化分页参数 */
    normalize: (options?: PaginationOptionsInput, overrides?: PaginationOverrides) => NormalizedPagination
    /** 构建分页结果 */
    build: <T>(items: T[], total: number, pagination: PaginationOptions) => PaginatedResult<T>
  }

  /**
   * JSON 操作 SQL 构建器
   *
   * 提供跨数据库统一的 JSON 路径操作（提取、设置、插入、删除、合并）。
   * 返回的 SQL 片段可嵌入 `reldb.sql.query` / `reldb.sql.execute` 等调用。
   *
   * 未初始化时默认返回 SQLite 格式的构建器；初始化后自动匹配当前数据库类型。
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const expression = reldb.json.set('settings', '$.theme', 'dark')
   * const result = await reldb.sql.execute(`UPDATE users SET settings = ${expression.sql} WHERE id = ?`, [...expression.params, 'u1'])
   * if (!result.success) throw new Error(result.error.message)
   * ```
   */
  readonly json: ReldbJsonOps

  /**
   * 等待初始化/在途事务并关闭连接；清理失败后操作不可用，资源保留供重试。
   * @returns 资源全部释放时成功；未初始化时同样成功。
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const result = await reldb.close()
   * if (!result.success) throw new Error(result.error.message)
   * void result.data
   * ```
   */
  close: () => Promise<HaiResult<void>>
}
