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
  CONNECTION_FAILED: '001:500',
  QUERY_FAILED: '002:500',
  CONSTRAINT_VIOLATION: '003:409',
  TRANSACTION_FAILED: '004:500',
  MIGRATION_FAILED: '005:500',
  RECORD_NOT_FOUND: '006:404',
  DUPLICATE_ENTRY: '007:409',
  DEADLOCK: '008:500',
  TIMEOUT: '009:504',
  POOL_EXHAUSTED: '010:503',
  NOT_INITIALIZED: '011:500',
  DDL_FAILED: '012:500',
  UNSUPPORTED_TYPE: '013:400',
  CONFIG_ERROR: '014:500',
} satisfies ErrorInfo

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
 * | INTEGER    | INTEGER | INTEGER/SERIAL   | INT/BIGINT   |
 * | REAL       | REAL    | DOUBLE PRECISION | DOUBLE       |
 * | BLOB       | BLOB    | BYTEA            | BLOB         |
 * | BOOLEAN    | INTEGER | BOOLEAN          | TINYINT(1)   |
 * | TIMESTAMP  | INTEGER | TIMESTAMP        | DATETIME     |
 * | JSON       | TEXT    | JSONB            | JSON         |
 *
 * 注：MySQL 将 TEXT 映射为 VARCHAR(255) 以支持索引和 UNIQUE 约束。
 * INTEGER 在 MySQL autoIncrement 时映射为 BIGINT，否则映射为 INT。
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
 * const idColumn: ReldbColumnDef = {
 *     type: 'INTEGER',
 *     primaryKey: true,
 *     autoIncrement: true
 * }
 *
 * // 带外键的列
 * const userIdColumn: ReldbColumnDef = {
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
 *
 * @example
 * ```ts
 * const userTable: ReldbTableDef = {
 *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
 *     name: { type: 'TEXT', notNull: true },
 *     email: { type: 'TEXT', unique: true },
 *     created_at: { type: 'TIMESTAMP', defaultValue: 'NOW()' }
 * }
 * ```
 */
export interface ReldbTableDef {
  [columnName: string]: ReldbColumnDef
}

/**
 * 索引定义
 *
 * @example
 * ```ts
 * // 普通索引
 * const emailIndex: ReldbIndexDef = { columns: ['email'] }
 *
 * // 唯一复合索引
 * const compositeIndex: ReldbIndexDef = {
 *     columns: ['user_id', 'created_at'],
 *     unique: true
 * }
 *
 * // 部分索引（带条件）
 * const partialIndex: ReldbIndexDef = {
 *     columns: ['status'],
 *     where: "status = 'active'"
 * }
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
   */
  where?: string
}

// ─── DDL 操作接口 ───

/**
 * DDL（数据定义语言）操作接口
 *
 * 提供表结构管理功能，包括创建/删除表、添加/删除列、创建索引等。
 * 所有操作返回 `HaiResult<void>` 类型。
 *
 * @example
 * ```ts
 * // 创建表
 * const result = await reldb.ddl.createTable('users', {
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
   * const result = await reldb.ddl.createTable('users', {
   *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
   *     name: { type: 'TEXT', notNull: true }
   * })
   * if (!result.success) {
   *     // 创建失败：根据 result.error.code / message 处理
   * }
   * ```
   */
  createTable: (tableName: string, columns: ReldbTableDef, ifNotExists?: boolean) => Promise<HaiResult<void>>

  /**
   * 删除表
   * @param tableName - 表名
   * @param ifExists - 是否使用 IF EXISTS（默认 true）
   * @example
   * ```ts
   * await reldb.ddl.dropTable('users')
   * await reldb.ddl.dropTable('users_backup', false)
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
   * await reldb.ddl.addColumn('users', 'age', { type: 'INTEGER' })
   * await reldb.ddl.addColumn('users', 'email', { type: 'TEXT', unique: true })
   * ```
   */
  addColumn: (tableName: string, columnName: string, columnDef: ReldbColumnDef) => Promise<HaiResult<void>>

  /**
   * 删除列
   * @param tableName - 表名
   * @param columnName - 列名
   * @example
   * ```ts
   * await reldb.ddl.dropColumn('users', 'legacy_field')
   * ```
   */
  dropColumn: (tableName: string, columnName: string) => Promise<HaiResult<void>>

  /**
   * 重命名表
   * @param oldName - 原表名
   * @param newName - 新表名
   * @example
   * ```ts
   * await reldb.ddl.renameTable('users_temp', 'users')
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
   * await reldb.ddl.createIndex('users', 'idx_users_email', {
   *     columns: ['email'],
   *     unique: true,
   * })
   * ```
   */
  createIndex: (tableName: string, indexName: string, indexDef: ReldbIndexDef) => Promise<HaiResult<void>>

  /**
   * 删除索引
   * @param indexName - 索引名
   * @param ifExists - 是否使用 IF EXISTS（默认 true）
   * @example
   * ```ts
   * await reldb.ddl.dropIndex('idx_users_email')
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
   * // ✅ 安全：静态 SQL
   * await reldb.ddl.raw('ALTER TABLE users ADD COLUMN status TEXT')
   *
   * // ❌ 危险：拼接用户输入
   * await reldb.ddl.raw(`ALTER TABLE ${userInput} ADD COLUMN status TEXT`)
   * ```
   */
  raw: (sql: string) => Promise<HaiResult<void>>
}

// ─── SQL 操作接口 ───

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

// ─── 分页类型 ───

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
export interface DmlOperations {
  /** 查询多行 */
  query: <T = QueryRow>(sql: string, params?: unknown[]) => Promise<HaiResult<T[]>>
  /** 查询单行 */
  get: <T = QueryRow>(sql: string, params?: unknown[]) => Promise<HaiResult<T | null>>
  /** 执行修改语句（INSERT/UPDATE/DELETE） */
  execute: (sql: string, params?: unknown[]) => Promise<HaiResult<ExecuteResult>>
  /** 批量执行多条语句（在同一事务上下文中） */
  batch: (statements: Array<{ sql: string, params?: unknown[] }>) => Promise<HaiResult<void>>
  /** 分页查询 */
  queryPage: <T = QueryRow>(options: PaginationQueryOptions) => Promise<HaiResult<PaginatedResult<T>>>
}

// ─── CRUD 抽象类型 ───

/** CRUD 查询条件 */
export interface CrudQueryOptions {
  /**
   * WHERE 子句（不包含 WHERE 关键字）
   *
   * **⚠️ 安全警告：** `where` 为原始 SQL 片段，**禁止**将用户输入直接拼接。
   * 动态值必须通过 `params` 占位符（`?`）传入。
   *
   * @example
   * ```ts
   * // ✅ 安全：占位符 + params
   * crud.findAll({ where: 'status = ? AND age > ?', params: ['active', 18] })
   *
   * // ❌ 危险：拼接用户输入
   * crud.findAll({ where: `name = '${userInput}'` })
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

/** CRUD 分页查询条件 */
export interface CrudPageOptions {
  /**
   * WHERE 子句（不包含 WHERE 关键字）
   *
   * **⚠️ 安全警告：** `where` 为原始 SQL 片段，**禁止**将用户输入直接拼接。
   * 动态值必须通过 `params` 占位符（`?`）传入。
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

/** CRUD 统计条件 */
export interface ReldbCrudCountOptions {
  /**
   * WHERE 子句（不包含 WHERE 关键字）
   *
   * **⚠️ 安全警告：** `where` 为原始 SQL 片段，**禁止**将用户输入直接拼接。
   * 动态值必须通过 `params` 占位符（`?`）传入。
   */
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
  /** 数据库类型 */
  dbType: DbType
}

/** CRUD 字段定义 */
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

/** BaseReldbCrudRepository 配置 */
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

/** CRUD 仓库接口 */
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

/** CRUD 管理器（统一入口） */
export interface CrudManager {
  /** 获取单表 CRUD 仓库 */
  table: <TItem>(config: CrudConfig<TItem>) => ReldbCrudRepository<TItem>
}

// ─── 事务接口 ───

/**
 * 事务句柄接口（分步事务）
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
 * @returns 业务返回值（将被包装为 Result）
 * @example
 * ```ts
 * const result = await reldb.tx.wrap(async (tx) => {
 *     await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户A'])
 *     return await tx.get('SELECT * FROM users WHERE name = ?', ['用户A'])
 * })
 * ```
 */
export type TxWrapCallback<T> = (tx: DmlWithTxOperations) => Promise<T>

/**
 * 事务管理器
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
 *
 * @example
 * ```ts
 * import { reldb } from '@h-ai/reldb'
 *
 * // 初始化
 * await reldb.init({ type: 'sqlite', database: ':memory:' })
 *
 * // 检查状态
 * if (reldb.isInitialized) {
 *     // 可读取当前数据库类型：reldb.config?.type
 * }
 *
 * // 使用 DDL
 * await reldb.ddl.createTable('users', { ... })
 *
 * // 使用 SQL
 * await reldb.sql.query('SELECT * FROM users')
 *
 * // 使用事务
 * await reldb.tx.wrap(async (tx) => { ... })
 *
 * // 关闭连接
 * await reldb.close()
 * ```
 */
export interface ReldbFunctions {
  /**
   * 初始化数据库连接
   *
   * @param config - 数据库配置
   * @returns 初始化结果
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

  /** 当前数据库配置（未初始化时为 null） */
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
   *
   * @example
   * ```ts
   * // 提取 JSON 字段值（用于 WHERE 条件）
   * const { sql, params } = reldb.json.extract('settings', '$.theme')
   * const rows = await reldb.sql.query(
   *   `SELECT * FROM users WHERE ${sql} = ?`,
   *   [...params, '"dark"'],
   * )
   *
   * // 设置 JSON 字段路径
   * const { sql, params } = reldb.json.set('settings', '$.theme', 'dark')
   * await reldb.sql.execute(
   *   `UPDATE users SET settings = ${sql} WHERE id = ?`,
   *   [...params, userId],
   * )
   * ```
   */
  readonly json: ReldbJsonOps

  /** 关闭数据库连接 */
  close: () => Promise<HaiResult<void>>
}

// ─── Provider 接口 ───

/**
 * 数据库 Provider 接口
 *
 * 内部使用，定义各数据库驱动需要实现的接口。
 * 每个数据库类型（SQLite、PostgreSQL、MySQL）都有对应的 Provider 实现。
 */
export interface ReldbProvider {
  /** DDL 操作（表结构管理） */
  readonly ddl: DdlOperations
  /** SQL 操作（数据查询和修改） */
  readonly sql: DmlOperations
  /** CRUD 管理器 */
  readonly crud: CrudManager
  /** 事务管理器 */
  readonly tx: TxManager
  /** 连接数据库 */
  connect: (config: ReldbConfig) => Promise<HaiResult<void>>
  /** 关闭连接 */
  close: () => Promise<HaiResult<void>>
  /** 是否已连接 */
  isConnected: () => boolean
}
