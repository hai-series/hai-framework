/**
 * =============================================================================
 * @hai/db - SQLite Provider
 * =============================================================================
 *
 * 基于 better-sqlite3 的 SQLite 数据库实现。
 *
 * SQLite 是嵌入式数据库，特点：
 * - 无需独立数据库服务器
 * - 支持文件存储和内存存储（:memory:）
 * - 同步 API，性能优秀
 * - 支持 WAL 模式提高并发性能
 *
 * 适用场景：
 * - 开发和测试环境
 * - 轻量级部署
 * - 单机应用
 * - 嵌入式应用
 *
 * @module db-provider-sqlite
 * =============================================================================
 */

import type { PaginatedResult, Result } from '@hai/core'
import type Database from 'better-sqlite3'
import type { DbConfig } from '../db-config.js'
import type {
  ColumnDef,
  CrudManager,
  DataOperations,
  DbError,
  DbProvider,
  DdlOperations,
  ExecuteResult,
  IndexDef,
  PaginationQueryOptions,
  SqlOperations,
  TableDef,
  TxHandle,
  TxManager,
  TxWrapCallback,
} from '../db-types.js'
import { createRequire } from 'node:module'

import { err, ok } from '@hai/core'

import { createCrud } from '../crud/db-crud-kernel.js'
import { DbErrorCode } from '../db-config.js'
import { dbM } from '../db-i18n.js'
import { buildPaginatedResult, normalizePagination } from '../db-pagination.js'

const require = createRequire(import.meta.url)

// =============================================================================
// SQLite Provider 实现
// =============================================================================

/**
 * 创建 SQLite Provider 实例
 *
 * @returns SQLite Provider
 */
export function createSqliteProvider(): DbProvider {
  /** 数据库实例 */
  let database: Database.Database | null = null

  // =========================================================================
  // 辅助函数
  // =========================================================================

  /**
   * 构建列定义 SQL
   *
   * 将 ColumnDef 转换为 SQLite 列定义语句
   *
   * @param name - 列名
   * @param def - 列定义
   * @returns SQL 列定义字符串
   */
  function buildColumnSql(name: string, def: ColumnDef): string {
    const parts: string[] = [name]

    // 类型映射
    switch (def.type) {
      case 'TEXT':
      case 'JSON':
        parts.push('TEXT')
        break
      case 'INTEGER':
      case 'BOOLEAN':
        parts.push('INTEGER')
        break
      case 'REAL':
        parts.push('REAL')
        break
      case 'BLOB':
        parts.push('BLOB')
        break
      case 'TIMESTAMP':
        parts.push('INTEGER') // Unix timestamp
        break
      default:
        parts.push('TEXT')
    }

    if (def.primaryKey) {
      parts.push('PRIMARY KEY')
      if (def.autoIncrement) {
        parts.push('AUTOINCREMENT')
      }
    }

    if (def.notNull && !def.primaryKey) {
      parts.push('NOT NULL')
    }

    if (def.unique && !def.primaryKey) {
      parts.push('UNIQUE')
    }

    if (def.defaultValue !== undefined) {
      if (def.defaultValue === null) {
        parts.push('DEFAULT NULL')
      }
      else if (typeof def.defaultValue === 'string') {
        // 处理特殊默认值表达式
        if (def.defaultValue.startsWith('(') && def.defaultValue.endsWith(')')) {
          parts.push(`DEFAULT ${def.defaultValue}`)
        }
        else {
          parts.push(`DEFAULT '${def.defaultValue}'`)
        }
      }
      else {
        parts.push(`DEFAULT ${def.defaultValue}`)
      }
    }

    if (def.references) {
      parts.push(`REFERENCES ${def.references.table}(${def.references.column})`)
      if (def.references.onDelete) {
        parts.push(`ON DELETE ${def.references.onDelete}`)
      }
      if (def.references.onUpdate) {
        parts.push(`ON UPDATE ${def.references.onUpdate}`)
      }
    }

    return parts.join(' ')
  }

  /**
   * 确保数据库已连接
   *
   * @returns 数据库实例或错误
   */
  function ensureConnected(): Result<Database.Database, DbError> {
    if (!database) {
      return err({
        code: DbErrorCode.NOT_INITIALIZED,
        message: dbM('db_notInitialized'),
      })
    }
    return ok(database)
  }

  /**
   * 解析统计数量
   */
  function parseCount(row: Record<string, unknown> | null | undefined): number {
    if (!row) {
      return 0
    }
    if ('total' in row) {
      return Number(row.total ?? 0)
    }
    if ('__total__' in row) {
      return Number(row.__total__ ?? 0)
    }
    if ('cnt' in row) {
      return Number(row.cnt ?? 0)
    }
    const value = Object.values(row)[0]
    if (typeof value === 'bigint') {
      return Number(value)
    }
    return Number(value ?? 0)
  }

  /**
   * 执行分页查询
   */
  function queryPageWithDatabase<T>(
    db: Database.Database,
    options: PaginationQueryOptions,
  ): PaginatedResult<T> {
    const pagination = normalizePagination(options.pagination, options.overrides)
    const dataSql = `${options.sql} LIMIT ? OFFSET ?`
    const dataParams = [...(options.params ?? []), pagination.limit, pagination.offset]
    const countSql = `SELECT COUNT(*) as cnt FROM (${options.sql}) AS t`

    const countStmt = db.prepare(countSql)
    const countRow = options.params ? countStmt.get(...options.params) : countStmt.get()
    const total = parseCount(countRow as Record<string, unknown> | null)

    const stmt = db.prepare(dataSql)
    const rows = stmt.all(...dataParams)
    return buildPaginatedResult(rows as T[], total, pagination)
  }

  async function runQueryResult<T>(
    db: Database.Database,
    sqlStr: string,
    params?: unknown[],
  ): Promise<Result<T[], DbError>> {
    try {
      const stmt = db.prepare(sqlStr)
      const rows = params ? stmt.all(...params) : stmt.all()
      return ok(rows as T[])
    }
    catch (error) {
      return err({
        code: DbErrorCode.QUERY_FAILED,
        message: dbM('db_sqliteQueryFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  async function runGetResult<T>(
    db: Database.Database,
    sqlStr: string,
    params?: unknown[],
  ): Promise<Result<T | null, DbError>> {
    try {
      const stmt = db.prepare(sqlStr)
      const row = params ? stmt.get(...params) : stmt.get()
      return ok((row as T) ?? null)
    }
    catch (error) {
      return err({
        code: DbErrorCode.QUERY_FAILED,
        message: dbM('db_sqliteQueryFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  async function runExecuteResult(
    db: Database.Database,
    sqlStr: string,
    params?: unknown[],
  ): Promise<Result<ExecuteResult, DbError>> {
    try {
      const stmt = db.prepare(sqlStr)
      const result = params ? stmt.run(...params) : stmt.run()
      return ok({
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid,
      })
    }
    catch (error) {
      return err({
        code: DbErrorCode.QUERY_FAILED,
        message: dbM('db_sqliteExecuteFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  function runStatementBatch(
    db: Database.Database,
    statements: Array<{ sql: string, params?: unknown[] }>,
  ): void {
    for (const { sql: sqlStr, params } of statements) {
      const stmt = db.prepare(sqlStr)
      if (params) {
        stmt.run(...params)
      }
      else {
        stmt.run()
      }
    }
  }

  async function runBatchResult(
    db: Database.Database,
    statements: Array<{ sql: string, params?: unknown[] }>,
  ): Promise<Result<void, DbError>> {
    try {
      runStatementBatch(db, statements)
      return ok(undefined)
    }
    catch (error) {
      return err({
        code: DbErrorCode.QUERY_FAILED,
        message: dbM('db_sqliteBatchFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  async function runQueryPageResult<T>(
    db: Database.Database,
    options: PaginationQueryOptions,
  ): Promise<Result<PaginatedResult<T>, DbError>> {
    try {
      const pageResult = queryPageWithDatabase<T>(db, options)
      return ok(pageResult)
    }
    catch (error) {
      return err({
        code: DbErrorCode.QUERY_FAILED,
        message: dbM('db_sqliteQueryFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  const createCrudManager = (ops: DataOperations): CrudManager => ({
    table: config => createCrud(ops, config),
  })

  // =========================================================================
  // DDL 操作实现
  // =========================================================================

  const ddl: DdlOperations = {
    /**
     * 创建表
     */
    async createTable(tableName: string, columns: TableDef, ifNotExists = true): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      try {
        const columnDefs = Object.entries(columns)
          .map(([name, def]) => buildColumnSql(name, def))
          .join(', ')

        const ifNotExistsClause = ifNotExists ? 'IF NOT EXISTS ' : ''
        const sql = `CREATE TABLE ${ifNotExistsClause}${tableName} (${columnDefs})`

        connResult.data.exec(sql)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_sqliteCreateTableFailed', { params: { tableName, error: String(error) } }),
          cause: error,
        })
      }
    },

    /**
     * 删除表
     */
    async dropTable(tableName: string, ifExists = true): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      try {
        const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
        connResult.data.exec(`DROP TABLE ${ifExistsClause}${tableName}`)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_sqliteDropTableFailed', { params: { tableName, error: String(error) } }),
          cause: error,
        })
      }
    },

    /**
     * 添加列
     */
    async addColumn(tableName: string, columnName: string, columnDef: ColumnDef): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      try {
        const colSql = buildColumnSql(columnName, columnDef)
        connResult.data.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colSql}`)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_sqliteAddColumnFailed', { params: { tableName, columnName, error: String(error) } }),
          cause: error,
        })
      }
    },

    /**
     * 删除列
     */
    async dropColumn(tableName: string, columnName: string): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      try {
        connResult.data.exec(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_sqliteDropColumnFailed', { params: { tableName, columnName, error: String(error) } }),
          cause: error,
        })
      }
    },

    /**
     * 重命名表
     */
    async renameTable(oldName: string, newName: string): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      try {
        connResult.data.exec(`ALTER TABLE ${oldName} RENAME TO ${newName}`)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_sqliteRenameTableFailed', { params: { oldName, newName, error: String(error) } }),
          cause: error,
        })
      }
    },

    /**
     * 创建索引
     */
    async createIndex(tableName: string, indexName: string, indexDef: IndexDef): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      try {
        const uniqueClause = indexDef.unique ? 'UNIQUE ' : ''
        const columns = indexDef.columns.join(', ')
        const whereClause = indexDef.where ? ` WHERE ${indexDef.where}` : ''

        connResult.data.exec(
          `CREATE ${uniqueClause}INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns})${whereClause}`,
        )
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_sqliteCreateIndexFailed', { params: { indexName, error: String(error) } }),
          cause: error,
        })
      }
    },

    /**
     * 删除索引
     */
    async dropIndex(indexName: string, ifExists = true): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      try {
        const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
        connResult.data.exec(`DROP INDEX ${ifExistsClause}${indexName}`)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_sqliteDropIndexFailed', { params: { indexName, error: String(error) } }),
          cause: error,
        })
      }
    },

    /**
     * 执行原始 DDL 语句
     */
    async raw(sql: string): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      try {
        connResult.data.exec(sql)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_sqliteExecDdlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },
  }

  // =========================================================================
  // SQL 操作实现
  // =========================================================================

  const sql: SqlOperations = {
    /**
     * 查询多行
     */
    async query<T>(sqlStr: string, params?: unknown[]): Promise<Result<T[], DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult
      return runQueryResult<T>(connResult.data, sqlStr, params)
    },

    /**
     * 查询单行
     */
    async get<T>(sqlStr: string, params?: unknown[]): Promise<Result<T | null, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult
      return runGetResult<T>(connResult.data, sqlStr, params)
    },

    /**
     * 执行修改语句（INSERT/UPDATE/DELETE）
     */
    async execute(sqlStr: string, params?: unknown[]): Promise<Result<ExecuteResult, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult
      return runExecuteResult(connResult.data, sqlStr, params)
    },

    /**
     * 批量执行多条语句
     */
    async batch(statements: Array<{ sql: string, params?: unknown[] }>): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      try {
        const db = connResult.data
        const transaction = db.transaction(() => {
          runStatementBatch(db, statements)
        })
        transaction()
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.QUERY_FAILED,
          message: dbM('db_sqliteBatchFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async queryPage<T>(options: PaginationQueryOptions): Promise<Result<PaginatedResult<T>, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult
      return runQueryPageResult<T>(connResult.data, options)
    },

  }

  const crud = createCrudManager(sql)

  // =========================================================================
  // 事务操作实现
  // =========================================================================

  /**
   * 执行异步事务
   *
   * SQLite 使用同步 API，因此在这里显式执行 BEGIN/COMMIT/ROLLBACK，
   * 并将同步调用包装为异步接口。
   *
   * @returns 事务回调结果或错误
   */
  async function beginTransaction(): Promise<Result<TxHandle, DbError>> {
    const connResult = ensureConnected()
    if (!connResult.success)
      return connResult

    const db = connResult.data
    let active = true

    try {
      db.exec('BEGIN TRANSACTION')
    }
    catch (error) {
      return err({
        code: DbErrorCode.TRANSACTION_FAILED,
        message: dbM('db_sqliteTxFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }

    const ensureActive = (): Result<void, DbError> => {
      if (!active) {
        return err({
          code: DbErrorCode.TRANSACTION_FAILED,
          message: dbM('db_sqliteTxFailed', { params: { error: 'transaction finished' } }),
        })
      }
      return ok(undefined)
    }

    const txDataOps: DataOperations = {
      async query<R>(sqlStr: string, params?: unknown[]): Promise<Result<R[], DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runQueryResult<R>(db, sqlStr, params)
      },

      async get<R>(sqlStr: string, params?: unknown[]): Promise<Result<R | null, DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runGetResult<R>(db, sqlStr, params)
      },

      async execute(sqlStr: string, params?: unknown[]): Promise<Result<ExecuteResult, DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runExecuteResult(db, sqlStr, params)
      },

      async batch(statements: Array<{ sql: string, params?: unknown[] }>): Promise<Result<void, DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runBatchResult(db, statements)
      },

      async queryPage<R>(options: PaginationQueryOptions): Promise<Result<PaginatedResult<R>, DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runQueryPageResult<R>(db, options)
      },
    }

    const txOps: TxHandle = {
      ...txDataOps,
      crud: createCrudManager(txDataOps),

      async commit(): Promise<Result<void, DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        try {
          db.exec('COMMIT')
          active = false
          return ok(undefined)
        }
        catch (error) {
          return err({
            code: DbErrorCode.TRANSACTION_FAILED,
            message: dbM('db_sqliteTxFailed', { params: { error: String(error) } }),
            cause: error,
          })
        }
      },

      async rollback(): Promise<Result<void, DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        try {
          db.exec('ROLLBACK')
          active = false
          return ok(undefined)
        }
        catch (error) {
          return err({
            code: DbErrorCode.TRANSACTION_FAILED,
            message: dbM('db_sqliteTxFailed', { params: { error: String(error) } }),
            cause: error,
          })
        }
      },
    }

    return ok(txOps)
  }

  const tx: TxManager = {
    begin: beginTransaction,

    async wrap<T>(fn: TxWrapCallback<T>): Promise<Result<T, DbError>> {
      const txResult = await beginTransaction()
      if (!txResult.success)
        return txResult

      try {
        const result = await fn(txResult.data)
        const commitResult = await txResult.data.commit()
        if (!commitResult.success) {
          return commitResult as Result<T, DbError>
        }
        return ok(result)
      }
      catch (error) {
        await txResult.data.rollback()
        return err({
          code: DbErrorCode.TRANSACTION_FAILED,
          message: dbM('db_sqliteTxFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },
  }

  // =========================================================================
  // Provider 接口实现
  // =========================================================================

  /**
   * 连接 SQLite 数据库
   */
  const connect: DbProvider['connect'] = async (config: DbConfig): Promise<Result<void, DbError>> => {
    if (config.type !== 'sqlite') {
      return err({
        code: DbErrorCode.UNSUPPORTED_TYPE,
        message: dbM('db_sqliteOnlySqlite'),
      })
    }

    if (!config.database) {
      return err({
        code: DbErrorCode.CONFIG_ERROR,
        message: dbM('db_sqliteNeedPath'),
      })
    }

    try {
      // 动态导入 better-sqlite3

      const Database = require('better-sqlite3')

      const sqliteOptions: { walMode: boolean, readonly: boolean } = {
        walMode: true,
        readonly: false,
        ...(config.sqlite ?? {}),
      }
      database = new Database(config.database, {
        readonly: sqliteOptions.readonly ?? false,
      }) as Database.Database

      // 启用 WAL 模式（提高并发性能）
      if (sqliteOptions.walMode !== false) {
        database.pragma('journal_mode = WAL')
      }

      return ok(undefined)
    }
    catch (error) {
      return err({
        code: DbErrorCode.CONNECTION_FAILED,
        message: dbM('db_sqliteConnectionFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 关闭数据库连接
   */
  const close: DbProvider['close'] = async (): Promise<void> => {
    if (database) {
      database.close()
      database = null
    }
  }

  /**
   * 检查是否已连接
   */
  const isConnected: DbProvider['isConnected'] = (): boolean => {
    return database !== null && database.open
  }

  return {
    connect,
    close,
    isConnected,
    ddl,
    sql,
    crud,
    tx,
  }
}
