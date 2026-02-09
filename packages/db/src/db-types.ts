/**
 * =============================================================================
 * @hai/db - 类型定义
 * =============================================================================
 *
 * 本文件定义数据库模块的核心接口和类型（非配置相关）。
 * 配置相关类型请从 db-config.ts 导入。
 *
 * 包含：
 * - 错误类型（DbError）
 * - 列定义（ColumnDef、TableDef、IndexDef）
 * - DDL 操作接口（DdlOperations）
 * - SQL 操作接口（SqlOperations）
 * - 事务操作接口（TxHandle / TxManager）
 * - CRUD 抽象（db-crud）
 * - 复合数据库操作接口（DbCompositeOperations）
 * - 数据库服务接口（DbFunctions）
 * - Provider 接口（DbProvider）
 *
 * @example
 * ```ts
 * import type { DbFunctions, TableDef, ColumnDef } from '@hai/db'
 *
 * // 定义表结构
 * const userTable: TableDef = {
 *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
 *     name: { type: 'TEXT', notNull: true },
 *     email: { type: 'TEXT', unique: true }
 * }
 * ```
 *
 * @module db-types
 * =============================================================================
 */

import type { PaginatedResult, PaginationOptions, PaginationOptionsInput, Result } from '@hai/core'
import type { DbConfig, DbConfigInput, DbErrorCodeType } from './db-config.js'

// =============================================================================
// 错误类型
// =============================================================================

/**
 * 数据库错误接口
 *
 * 所有数据库操作返回的错误都遵循此接口。
 *
 * @example
 * ```ts
 * const result = await db.sql.query('SELECT * FROM users')
 * if (!result.success) {
 *     const error: DbError = result.error
 *     // 处理错误：根据 error.code / error.message 做兜底
 * }
 * ```
 */
export interface DbError {
  /** 错误码（数值，参见 DbErrorCode） */
  code: DbErrorCodeType
  /** 错误消息 */
  message: string
  /** 原始错误（可选） */
  cause?: unknown
}

// =============================================================================
// 列定义
// =============================================================================

/**
 * 列数据类型
 *
 * 统一的列类型定义，会根据不同数据库自动映射：
 *
 * | 类型        | SQLite  | PostgreSQL       | MySQL      |
 * |------------|---------|------------------|------------|
 * | TEXT       | TEXT    | TEXT             | TEXT       |
 * | INTEGER    | INTEGER | INTEGER          | INT        |
 * | REAL       | REAL    | DOUBLE PRECISION | DOUBLE     |
 * | BLOB       | BLOB    | BYTEA            | BLOB       |
 * | BOOLEAN    | INTEGER | BOOLEAN          | TINYINT(1) |
 * | TIMESTAMP  | INTEGER | TIMESTAMPTZ      | DATETIME   |
 * | JSON       | TEXT    | JSONB            | JSON       |
 */
export type ColumnType
  = | 'TEXT'
    | 'INTEGER'
    | 'REAL'
    | 'BLOB'
    | 'BOOLEAN'
    | 'TIMESTAMP'
    | 'JSON'

/**
 * 列定义接口
 *
 * 用于定义表的列结构。
 *
 * @example
 * ```ts
 * // 主键列
 * const idColumn: ColumnDef = {
 *     type: 'INTEGER',
 *     primaryKey: true,
 *     autoIncrement: true
 * }
 *
 * // 带外键的列
 * const userIdColumn: ColumnDef = {
 *     type: 'INTEGER',
 *     notNull: true,
 *     references: {
 *         table: 'users',
 *         column: 'id',
 *         onDelete: 'CASCADE'
 *     }
 * }
 * ```
 */
export interface ColumnDef {
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
 *
 * @example
 * ```ts
 * const userTable: TableDef = {
 *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
 *     name: { type: 'TEXT', notNull: true },
 *     email: { type: 'TEXT', unique: true },
 *     created_at: { type: 'TIMESTAMP', defaultValue: 'NOW()' }
 * }
 * ```
 */
export interface TableDef {
  [columnName: string]: ColumnDef
}

/**
 * 索引定义
 *
 * @example
 * ```ts
 * // 普通索引
 * const emailIndex: IndexDef = { columns: ['email'] }
 *
 * // 唯一复合索引
 * const compositeIndex: IndexDef = {
 *     columns: ['user_id', 'created_at'],
 *     unique: true
 * }
 *
 * // 部分索引（带条件）
 * const partialIndex: IndexDef = {
 *     columns: ['status'],
 *     where: "status = 'active'"
 * }
 * ```
 */
export interface IndexDef {
  /** 索引包含的列 */
  columns: string[]
  /** 是否为唯一索引 */
  unique?: boolean
  /** 索引条件（WHERE 子句，用于部分索引） */
  where?: string
}

// =============================================================================
// DDL 操作接口
// =============================================================================

/**
 * DDL（数据定义语言）操作接口
 *
 * 提供表结构管理功能，包括创建/删除表、添加/删除列、创建索引等。
 * 所有操作返回 `Result<void, DbError>` 类型。
 *
 * @example
 * ```ts
 * // 创建表
 * const result = await db.ddl.createTable('users', {
 *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
 *     name: { type: 'TEXT', notNull: true }
 * })
 *
 * if (!result.success) {
 *     // 处理错误：创建表失败（可根据 result.error.code / message 做兜底）
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
   * const result = await db.ddl.createTable('users', {
   *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
   *     name: { type: 'TEXT', notNull: true }
   * })
   * if (!result.success) {
   *     // 创建失败：根据 result.error.code / message 处理
   * }
   * ```
   */
  createTable: (tableName: string, columns: TableDef, ifNotExists?: boolean) => Promise<Result<void, DbError>>

  /**
   * 删除表
   * @param tableName - 表名
   * @param ifExists - 是否使用 IF EXISTS（默认 true）
   * @example
   * ```ts
   * await db.ddl.dropTable('users')
   * await db.ddl.dropTable('users_backup', false)
   * ```
   */
  dropTable: (tableName: string, ifExists?: boolean) => Promise<Result<void, DbError>>

  /**
   * 添加列
   * @param tableName - 表名
   * @param columnName - 列名
   * @param columnDef - 列定义
   * @example
   * ```ts
   * await db.ddl.addColumn('users', 'age', { type: 'INTEGER' })
   * await db.ddl.addColumn('users', 'email', { type: 'TEXT', unique: true })
   * ```
   */
  addColumn: (tableName: string, columnName: string, columnDef: ColumnDef) => Promise<Result<void, DbError>>

  /**
   * 删除列
   * @param tableName - 表名
   * @param columnName - 列名
   * @example
   * ```ts
   * await db.ddl.dropColumn('users', 'legacy_field')
   * ```
   */
  dropColumn: (tableName: string, columnName: string) => Promise<Result<void, DbError>>

  /**
   * 重命名表
   * @param oldName - 原表名
   * @param newName - 新表名
   * @example
   * ```ts
   * await db.ddl.renameTable('users_temp', 'users')
   * ```
   */
  renameTable: (oldName: string, newName: string) => Promise<Result<void, DbError>>

  /**
   * 创建索引
   * @param tableName - 表名
   * @param indexName - 索引名
   * @param indexDef - 索引定义
   * @example
   * ```ts
   * await db.ddl.createIndex('users', 'idx_users_email', {
   *     columns: ['email'],
   *     unique: true,
   * })
   * ```
   */
  createIndex: (tableName: string, indexName: string, indexDef: IndexDef) => Promise<Result<void, DbError>>

  /**
   * 删除索引
   * @param indexName - 索引名
   * @param ifExists - 是否使用 IF EXISTS（默认 true）
   * @example
   * ```ts
   * await db.ddl.dropIndex('idx_users_email')
   * ```
   */
  dropIndex: (indexName: string, ifExists?: boolean) => Promise<Result<void, DbError>>

  /**
   * 执行原始 DDL SQL
   * @param sql - DDL SQL 语句
   * @example
   * ```ts
   * await db.ddl.raw('ALTER TABLE users ADD COLUMN status TEXT')
   * ```
   */
  raw: (sql: string) => Promise<Result<void, DbError>>
}

// =============================================================================
// SQL 操作接口
// =============================================================================

/**
 * 查询结果行类型
 *
 * 约定为键值对象，字段名与 SQL 返回列一致。
 */
export type QueryRow = Record<string, unknown>

/**
 * 执行结果
 *
 * INSERT/UPDATE/DELETE 操作返回的结果。
 */
export interface ExecuteResult {
  /** 影响的行数 */
  changes: number
  /** 最后插入的行 ID（仅 INSERT 时有效） */
  lastInsertRowid?: number | bigint
}

// =============================================================================
// 分页类型
// =============================================================================

/**
 * 规范化后的分页参数
 */
export interface NormalizedPagination extends PaginationOptions {
  /** SQL offset */
  offset: number
  /** SQL limit */
  limit: number
}

/**
 * 分页参数覆盖
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
 */
export interface DataOperations {
  /** 查询多行 */
  query: <T = QueryRow>(sql: string, params?: unknown[]) => Promise<Result<T[], DbError>>
  /** 查询单行 */
  get: <T = QueryRow>(sql: string, params?: unknown[]) => Promise<Result<T | null, DbError>>
  /** 执行修改语句（INSERT/UPDATE/DELETE） */
  execute: (sql: string, params?: unknown[]) => Promise<Result<ExecuteResult, DbError>>
  /** 批量执行多条语句（在同一事务上下文中） */
  batch: (statements: Array<{ sql: string, params?: unknown[] }>) => Promise<Result<void, DbError>>
  /** 分页查询 */
  queryPage: <T = QueryRow>(options: PaginationQueryOptions) => Promise<Result<PaginatedResult<T>, DbError>>
}

// =============================================================================
// CRUD 抽象类型
// =============================================================================

/** CRUD 查询条件 */
export interface CrudQueryOptions {
  /** WHERE 子句（不包含 WHERE 关键字） */
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

/** CRUD 分页查询条件 */
export interface CrudPageOptions {
  /** WHERE 子句（不包含 WHERE 关键字） */
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

/** CRUD 统计条件 */
export interface CrudCountOptions {
  /** WHERE 子句（不包含 WHERE 关键字） */
  where?: string
  /** 参数列表 */
  params?: unknown[]
}

/** CRUD 配置 */
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
}

/** CRUD 字段定义 */
export interface CrudFieldDefinition {
  /** 对象字段名 */
  fieldName: string
  /** 数据库列名 */
  columnName: string
  /** 列定义 */
  def: ColumnDef
  /** 是否用于查询 */
  select: boolean
  /** 是否允许插入 */
  create: boolean
  /** 是否允许更新 */
  update: boolean
}

/** BaseCrudRepository 配置 */
export interface BaseCrudRepositoryConfig<TItem> {
  /** 表名 */
  table: string
  /** 字段定义 */
  fields: CrudFieldDefinition[]
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

/** CRUD 仓库接口 */
export interface CrudRepository<TItem> {
  create: (data: Record<string, unknown>, tx?: TxHandle) => Promise<Result<ExecuteResult, DbError>>
  createMany: (items: Array<Record<string, unknown>>, tx?: TxHandle) => Promise<Result<void, DbError>>
  findById: (id: unknown, tx?: TxHandle) => Promise<Result<TItem | null, DbError>>
  findAll: (options?: CrudQueryOptions, tx?: TxHandle) => Promise<Result<TItem[], DbError>>
  findPage: (options: CrudPageOptions, tx?: TxHandle) => Promise<Result<PaginatedResult<TItem>, DbError>>
  updateById: (id: unknown, data: Record<string, unknown>, tx?: TxHandle) => Promise<Result<ExecuteResult, DbError>>
  deleteById: (id: unknown, tx?: TxHandle) => Promise<Result<ExecuteResult, DbError>>
  count: (options?: CrudCountOptions, tx?: TxHandle) => Promise<Result<number, DbError>>
  exists: (options?: CrudCountOptions, tx?: TxHandle) => Promise<Result<boolean, DbError>>
  existsById: (id: unknown, tx?: TxHandle) => Promise<Result<boolean, DbError>>
}

/** CRUD 管理器（统一入口） */
export interface CrudManager {
  /** 获取单表 CRUD 仓库 */
  table: <TItem>(config: CrudConfig<TItem>) => CrudRepository<TItem>
}

/**
 * SQL（数据操作语言）操作接口
 *
 * 提供数据查询和修改功能。
 *
 * 注意：所有数据库操作均为异步，需使用 await。
 *
 * @example
 * ```ts
 * // 查询多行
 * const users = await db.sql.query<{ id: number; name: string }>('SELECT * FROM users')
 *
 * // 查询单行
 * const user = await db.sql.get('SELECT * FROM users WHERE id = ?', [1])
 *
 * // 执行修改
 * const result = await db.sql.execute('INSERT INTO users (name) VALUES (?)', ['张三'])
 * // 可从 result.data?.lastInsertRowid 获取插入 ID
 * ```
 */
export interface SqlOperations extends DataOperations {
}

// =============================================================================
// 事务接口
// =============================================================================

/**
 * 事务句柄接口（分步事务）
 */
export interface TxHandle extends DataOperations {
  /** CRUD 管理器 */
  crud: CrudManager
  /** 提交事务 */
  commit: () => Promise<Result<void, DbError>>
  /** 回滚事务 */
  rollback: () => Promise<Result<void, DbError>>
}

/**
 * 事务回调函数类型
 *
 * @param tx - 事务内操作对象
 * @returns 业务返回值（将被包装为 Result）
 * @example
 * ```ts
 * const result = await db.tx.wrap(async (tx) => {
 *     await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户A'])
 *     return await tx.get('SELECT * FROM users WHERE name = ?', ['用户A'])
 * })
 * ```
 */
export type TxWrapCallback<T> = (tx: TxHandle) => Promise<T>

/**
 * 事务管理器
 */
export interface TxManager {
  /** 开启事务（分步事务） */
  begin: () => Promise<Result<TxHandle, DbError>>
  /** 包裹事务（自动提交/回滚） */
  wrap: <T>(fn: TxWrapCallback<T>) => Promise<Result<T, DbError>>
}

// =============================================================================
// 复合数据库操作接口
// =============================================================================

/**
 * 复合数据库操作接口
 *
 * 在基础操作之上，统一聚合 DDL / SQL / 事务能力。
 */
export interface DbCompositeOperations {
  /** DDL 操作（表结构管理） */
  readonly ddl: DdlOperations

  /** SQL 操作（数据查询和修改） */
  readonly sql: SqlOperations

  /** CRUD 管理器 */
  readonly crud: CrudManager

  /** 事务管理器 */
  tx: TxManager
}

// =============================================================================
// 分页工具接口
// =============================================================================

/**
 * 分页工具接口
 */
export interface DbPagination {
  /** 规范化分页参数 */
  normalize: (options?: PaginationOptionsInput, overrides?: PaginationOverrides) => NormalizedPagination
  /** 构建分页结果 */
  build: <T>(items: T[], total: number, pagination: PaginationOptions) => PaginatedResult<T>
}

// =============================================================================
// 数据库函数接口
// =============================================================================

/**
 * 数据库函数接口
 *
 * 统一的数据库访问入口，通过 `db` 对象提供所有数据库操作。
 *
 * @example
 * ```ts
 * import { db } from '@hai/db'
 *
 * // 初始化
 * await db.init({ type: 'sqlite', database: ':memory:' })
 *
 * // 检查状态
 * if (db.isInitialized) {
 *     // 可读取当前数据库类型：db.config?.type
 * }
 *
 * // 使用 DDL
 * await db.ddl.createTable('users', { ... })
 *
 * // 使用 SQL
 * await db.sql.query('SELECT * FROM users')
 *
 * // 使用事务
 * await db.tx.wrap(async (tx) => { ... })
 *
 * // 关闭连接
 * await db.close()
 * ```
 */
export interface DbFunctions extends DbCompositeOperations {
  /**
   * 初始化数据库连接
   *
   * @param config - 数据库配置
   * @returns 初始化结果
   */
  init: (config: DbConfigInput) => Promise<Result<void, DbError>>

  /** 当前数据库配置（未初始化时为 null） */
  readonly config: DbConfig | null

  /** 是否已初始化 */
  readonly isInitialized: boolean

  /** 分页工具 */
  readonly pagination: DbPagination

  /** 关闭数据库连接 */
  close: () => Promise<void>
}

// =============================================================================
// Provider 接口
// =============================================================================

/**
 * 数据库 Provider 接口
 *
 * 内部使用，定义各数据库驱动需要实现的接口。
 * 每个数据库类型（SQLite、PostgreSQL、MySQL）都有对应的 Provider 实现。
 */
export interface DbProvider extends DbCompositeOperations {
  /** 连接数据库 */
  connect: (config: DbConfig) => Promise<Result<void, DbError>>
  /** 关闭连接 */
  close: () => Promise<void>
  /** 是否已连接 */
  isConnected: () => boolean
}
