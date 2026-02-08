/**
 * =============================================================================
 * @hai/db - PostgreSQL Provider
 * =============================================================================
 *
 * 基于 pg 的 PostgreSQL 数据库实现。
 *
 * PostgreSQL 特点：
 * - 功能强大的开源关系型数据库
 * - 支持高级数据类型（JSONB、数组等）
 * - 完整的 ACID 事务支持
 * - 使用连接池管理连接
 *
 * 适用场景：
 * - 生产环境
 * - 需要高级 SQL 功能
 * - 大规模数据处理
 *
 * @module db-provider-postgres
 * =============================================================================
 */

import type { PaginatedResult, Result } from '@hai/core'
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

import { err, ok } from '@hai/core'

import { createCrud } from '../crud/db-crud-kernel.js'
import { DbErrorCode } from '../db-config.js'
import { dbM } from '../db-i18n.js'
import { buildPaginatedResult, normalizePagination } from '../db-pagination.js'

// =============================================================================
// pg 类型定义（避免强依赖）
// =============================================================================

/** PostgreSQL 连接池接口 */
interface PgPool {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[], rowCount: number }>
  connect: () => Promise<PgClient>
  end: () => Promise<void>
}

/** PostgreSQL 客户端接口 */
interface PgClient {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[], rowCount: number }>
  release: () => void
}

// =============================================================================
// PostgreSQL Provider 实现
// =============================================================================

/**
 * 创建 PostgreSQL Provider 实例
 *
 * @returns PostgreSQL Provider
 */
export function createPostgresProvider(): DbProvider {
  /** 连接池实例 */
  let pool: PgPool | null = null

  // =========================================================================
  // 辅助函数
  // =========================================================================

  /**
   * 构建列定义 SQL
   *
   * 将 ColumnDef 转换为 PostgreSQL 列定义语句
   *
   * @param name - 列名
   * @param def - 列定义
   * @returns 列定义 SQL 片段
   */
  function buildColumnSql(name: string, def: ColumnDef): string {
    const parts: string[] = [name]

    switch (def.type) {
      case 'TEXT':
        parts.push('TEXT')
        break
      case 'INTEGER':
        if (def.autoIncrement) {
          parts.push('BIGSERIAL')
        }
        else {
          parts.push('INTEGER')
        }
        break
      case 'REAL':
        parts.push('DOUBLE PRECISION')
        break
      case 'BLOB':
        parts.push('BYTEA')
        break
      case 'BOOLEAN':
        parts.push('BOOLEAN')
        break
      case 'TIMESTAMP':
        parts.push('TIMESTAMP')
        break
      case 'JSON':
        parts.push('JSONB')
        break
      default:
        parts.push('TEXT')
    }

    if (def.primaryKey) {
      parts.push('PRIMARY KEY')
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
        if (def.defaultValue.startsWith('(') && def.defaultValue.endsWith(')')) {
          parts.push(`DEFAULT ${def.defaultValue}`)
        }
        else if (def.defaultValue === 'NOW()' || def.defaultValue === 'CURRENT_TIMESTAMP') {
          parts.push(`DEFAULT ${def.defaultValue}`)
        }
        else {
          parts.push(`DEFAULT '${def.defaultValue}'`)
        }
      }
      else if (typeof def.defaultValue === 'boolean') {
        parts.push(`DEFAULT ${def.defaultValue}`)
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
   * @returns 连接池或错误
   */
  function ensureConnected(): Result<PgPool, DbError> {
    if (!pool) {
      return err({
        code: DbErrorCode.NOT_INITIALIZED,
        message: dbM('db_notInitialized'),
      })
    }
    return ok(pool)
  }

  /**
   * 将 ? 占位符转换为 PostgreSQL 的 $1, $2, ... 格式
   *
   * @param sql - 含 ? 占位符的 SQL
   * @returns 替换为 $n 的 SQL
   */
  function convertPlaceholders(sql: string): string {
    let index = 0
    return sql.replace(/\?/g, () => `$${++index}`)
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
  async function queryPageWithExecutor<T>(
    executor: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>,
    options: PaginationQueryOptions,
  ): Promise<PaginatedResult<T>> {
    const pagination = normalizePagination(options.pagination, options.overrides)
    const dataSql = `SELECT *, COUNT(*) OVER() AS __total__ FROM (${options.sql}) AS t LIMIT ? OFFSET ?`
    const dataParams = [...(options.params ?? []), pagination.limit, pagination.offset]
    const dataQuerySql = convertPlaceholders(dataSql)
    const dataResult = await executor(dataQuerySql, dataParams)
    const rows = dataResult.rows as Record<string, unknown>[]
    const total = rows.length > 0 ? parseCount(rows[0]) : 0
    const items = rows.map(({ __total__, ...rest }) => rest) as T[]
    return buildPaginatedResult(items, total, pagination)
  }

  async function runStatementBatch(
    executor: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[], rowCount: number }>,
    statements: Array<{ sql: string, params?: unknown[] }>,
  ): Promise<void> {
    for (const { sql: statement, params } of statements) {
      const pgSql = convertPlaceholders(statement)
      await executor(pgSql, params)
    }
  }

  async function runQuery<T>(
    executor: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[], rowCount: number }>,
    sqlStr: string,
    params?: unknown[],
  ): Promise<Result<T[], DbError>> {
    try {
      const pgSql = convertPlaceholders(sqlStr)
      const result = await executor(pgSql, params)
      return ok(result.rows as T[])
    }
    catch (error) {
      return err({
        code: DbErrorCode.QUERY_FAILED,
        message: dbM('db_queryFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  async function runGet<T>(
    executor: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[], rowCount: number }>,
    sqlStr: string,
    params?: unknown[],
  ): Promise<Result<T | null, DbError>> {
    try {
      const pgSql = convertPlaceholders(sqlStr)
      const result = await executor(pgSql, params)
      return ok((result.rows[0] as T) ?? null)
    }
    catch (error) {
      return err({
        code: DbErrorCode.QUERY_FAILED,
        message: dbM('db_queryFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  async function runExecute(
    executor: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[], rowCount: number }>,
    sqlStr: string,
    params?: unknown[],
  ): Promise<Result<ExecuteResult, DbError>> {
    try {
      const pgSql = convertPlaceholders(sqlStr)
      const result = await executor(pgSql, params)
      return ok({
        changes: result.rowCount ?? 0,
      })
    }
    catch (error) {
      return err({
        code: DbErrorCode.QUERY_FAILED,
        message: dbM('db_executeFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  async function runBatch(
    executor: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[], rowCount: number }>,
    statements: Array<{ sql: string, params?: unknown[] }>,
  ): Promise<Result<void, DbError>> {
    try {
      await runStatementBatch(executor, statements)
      return ok(undefined)
    }
    catch (error) {
      return err({
        code: DbErrorCode.QUERY_FAILED,
        message: dbM('db_batchFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  async function runQueryPage<T>(
    executor: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[], rowCount: number }>,
    options: PaginationQueryOptions,
  ): Promise<Result<PaginatedResult<T>, DbError>> {
    try {
      const pageResult = await queryPageWithExecutor<T>(executor, options)
      return ok(pageResult)
    }
    catch (error) {
      return err({
        code: DbErrorCode.QUERY_FAILED,
        message: dbM('db_queryFailed', { params: { error: String(error) } }),
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

  /**
   * DDL 操作
   *
   * 注意：PostgreSQL 的 DDL 操作会立即返回成功，
   * 但实际 SQL 执行是异步的。错误会在后台处理。
   */
  const ddl: DdlOperations = {
    async createTable(tableName: string, columns: TableDef, ifNotExists = true): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const columnDefs = Object.entries(columns)
        .map(([name, def]) => buildColumnSql(name, def))
        .join(', ')

      const ifNotExistsClause = ifNotExists ? 'IF NOT EXISTS ' : ''
      const sql = `CREATE TABLE ${ifNotExistsClause}${tableName} (${columnDefs})`

      try {
        await connResult.data.query(sql)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_ddlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async dropTable(tableName: string, ifExists = true): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
      try {
        await connResult.data.query(`DROP TABLE ${ifExistsClause}${tableName}`)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_ddlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async addColumn(tableName: string, columnName: string, columnDef: ColumnDef): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const colSql = buildColumnSql(columnName, columnDef)
      try {
        await connResult.data.query(`ALTER TABLE ${tableName} ADD COLUMN ${colSql}`)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_ddlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async dropColumn(tableName: string, columnName: string): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      try {
        await connResult.data.query(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_ddlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async renameTable(oldName: string, newName: string): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      try {
        await connResult.data.query(`ALTER TABLE ${oldName} RENAME TO ${newName}`)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_ddlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async createIndex(tableName: string, indexName: string, indexDef: IndexDef): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const uniqueClause = indexDef.unique ? 'UNIQUE ' : ''
      const columns = indexDef.columns.join(', ')
      const whereClause = indexDef.where ? ` WHERE ${indexDef.where}` : ''

      try {
        await connResult.data.query(
          `CREATE ${uniqueClause}INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns})${whereClause}`,
        )
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_ddlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async dropIndex(indexName: string, ifExists = true): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
      try {
        await connResult.data.query(`DROP INDEX ${ifExistsClause}${indexName}`)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_ddlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async raw(sql: string): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      try {
        await connResult.data.query(sql)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_ddlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },
  }

  // =========================================================================
  // SQL 操作
  // =========================================================================

  /**
   * SQL 操作
   */
  const sql: SqlOperations = {
    async query<T>(sqlStr: string, params?: unknown[]): Promise<Result<T[], DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult
      return runQuery<T>((sqlStrInner, paramsInner) => connResult.data.query(sqlStrInner, paramsInner), sqlStr, params)
    },

    async get<T>(sqlStr: string, params?: unknown[]): Promise<Result<T | null, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult
      return runGet<T>((sqlStrInner, paramsInner) => connResult.data.query(sqlStrInner, paramsInner), sqlStr, params)
    },

    async execute(sqlStr: string, params?: unknown[]): Promise<Result<ExecuteResult, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult
      return runExecute((sqlStrInner, paramsInner) => connResult.data.query(sqlStrInner, paramsInner), sqlStr, params)
    },

    async batch(statements: Array<{ sql: string, params?: unknown[] }>): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      let client: PgClient | null = null
      try {
        client = await connResult.data.connect()
        await client.query('BEGIN')
        await runStatementBatch((sqlStr, params) => client!.query(sqlStr, params), statements)
        await client.query('COMMIT')
        return ok(undefined)
      }
      catch (error) {
        if (client) {
          await client.query('ROLLBACK').catch(() => { })
        }
        return err({
          code: DbErrorCode.QUERY_FAILED,
          message: dbM('db_batchFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
      finally {
        if (client) {
          client.release()
        }
      }
    },

    async queryPage<T>(options: PaginationQueryOptions): Promise<Result<PaginatedResult<T>, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult
      return runQueryPage<T>((sqlStr, params) => connResult.data.query(sqlStr, params), options)
    },
  }

  const crud = createCrudManager(sql)

  // =========================================================================
  // 事务操作实现
  // =========================================================================

  /**
   * 异步事务
   *
   * PostgreSQL 推荐使用异步事务进行数据操作。
   *
   * @example
   * ```ts
   * await db.tx.wrap(async (tx) => {
   *     await tx.execute('INSERT INTO users (name) VALUES (?)', ['张三'])
   *     const users = await tx.query('SELECT * FROM users')
   *     return users
   * })
   * ```
   */
  async function beginTransaction(): Promise<Result<TxHandle, DbError>> {
    const connResult = ensureConnected()
    if (!connResult.success)
      return connResult

    let client: PgClient | null = null

    try {
      client = await pool!.connect()
      await client.query('BEGIN')
    }
    catch (error) {
      if (client) {
        client.release()
      }
      return err({
        code: DbErrorCode.TRANSACTION_FAILED,
        message: dbM('db_postgresTxFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }

    let active = true

    const ensureActive = (): Result<void, DbError> => {
      if (!active) {
        return err({
          code: DbErrorCode.TRANSACTION_FAILED,
          message: dbM('db_postgresTxFailed', { params: { error: 'transaction finished' } }),
        })
      }
      return ok(undefined)
    }

    const txDataOps: DataOperations = {
      async query<R>(sqlStr: string, params?: unknown[]): Promise<Result<R[], DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runQuery<R>((sqlStrInner, paramsInner) => client!.query(sqlStrInner, paramsInner), sqlStr, params)
      },

      async get<R>(sqlStr: string, params?: unknown[]): Promise<Result<R | null, DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runGet<R>((sqlStrInner, paramsInner) => client!.query(sqlStrInner, paramsInner), sqlStr, params)
      },

      async execute(sqlStr: string, params?: unknown[]): Promise<Result<ExecuteResult, DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runExecute((sqlStrInner, paramsInner) => client!.query(sqlStrInner, paramsInner), sqlStr, params)
      },

      async batch(statements: Array<{ sql: string, params?: unknown[] }>): Promise<Result<void, DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runBatch((sqlStrInner, paramsInner) => client!.query(sqlStrInner, paramsInner), statements)
      },

      async queryPage<R>(options: PaginationQueryOptions): Promise<Result<PaginatedResult<R>, DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runQueryPage<R>((sqlStrInner, paramsInner) => client!.query(sqlStrInner, paramsInner), options)
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
          await client!.query('COMMIT')
          active = false
          return ok(undefined)
        }
        catch (error) {
          return err({
            code: DbErrorCode.TRANSACTION_FAILED,
            message: dbM('db_postgresTxFailed', { params: { error: String(error) } }),
            cause: error,
          })
        }
        finally {
          client!.release()
        }
      },
      async rollback(): Promise<Result<void, DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        try {
          await client!.query('ROLLBACK')
          active = false
          return ok(undefined)
        }
        catch (error) {
          return err({
            code: DbErrorCode.TRANSACTION_FAILED,
            message: dbM('db_postgresTxFailed', { params: { error: String(error) } }),
            cause: error,
          })
        }
        finally {
          client!.release()
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
          message: dbM('db_postgresTxFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },
  }

  // =========================================================================
  // Provider 接口实现
  // =========================================================================

  /**
   * 连接 PostgreSQL 数据库
   */
  const connect: DbProvider['connect'] = async (config: DbConfig): Promise<Result<void, DbError>> => {
    if (config.type !== 'postgresql') {
      return err({
        code: DbErrorCode.UNSUPPORTED_TYPE,
        message: dbM('db_postgresOnlyPostgresql'),
      })
    }

    try {
      // 动态导入 pg
      // eslint-disable-next-line ts/no-require-imports -- 需要保持 connect 同步，使用 require 进行按需加载
      const { Pool } = require('pg')

      pool = new Pool({
        connectionString: config.url,
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        ssl: config.ssl,
        min: config.pool?.min,
        max: config.pool?.max ?? 10,
        idleTimeoutMillis: config.pool?.idleTimeout,
        connectionTimeoutMillis: config.pool?.acquireTimeout,
      }) as PgPool

      return ok(undefined)
    }
    catch (error) {
      return err({
        code: DbErrorCode.CONNECTION_FAILED,
        message: dbM('db_postgresConnectionFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 关闭连接池
   */
  const close: DbProvider['close'] = async (): Promise<void> => {
    if (pool) {
      await pool.end()
      pool = null
    }
  }

  /**
   * 检查是否已连接
   */
  const isConnected: DbProvider['isConnected'] = (): boolean => {
    return pool !== null
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
