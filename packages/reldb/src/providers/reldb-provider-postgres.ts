/**
 * @h-ai/reldb — PostgreSQL Provider
 *
 * 基于 pg 的 PostgreSQL 数据库实现。
 * @module reldb-provider-postgres
 */

import type { PaginatedResult, Result } from '@h-ai/core'
import type { ReldbConfig } from '../reldb-config.js'
import type {
  DataOperations,
  ExecuteResult,
  PaginationQueryOptions,
  ReldbColumnDef,
  ReldbCrudManager,
  ReldbDdlOperations,
  ReldbError,
  ReldbIndexDef,
  ReldbProvider,
  ReldbSqlOperations,
  ReldbTableDef,
  ReldbTxHandle,
  ReldbTxManager,
  TxWrapCallback,
} from '../reldb-types.js'

import { core, err, ok } from '@h-ai/core'

import { ReldbErrorCode } from '../reldb-config.js'
import { createCrud } from '../reldb-crud-kernel.js'
import { reldbM } from '../reldb-i18n.js'
import { buildPaginatedResult, normalizePagination, parseCount } from '../reldb-pagination.js'
import { escapeSqlString, quoteIdentifier, validateIdentifier, validateIdentifiers } from '../reldb-security.js'

const logger = core.logger.child({ module: 'reldb', scope: 'postgres' })

// ─── pg 类型定义（避免强依赖） ───

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

// ─── PostgreSQL Provider 实现 ───

/**
 * 创建 PostgreSQL Provider 实例
 *
 * @returns PostgreSQL Provider
 */
export function createPostgresProvider(): ReldbProvider {
  /** 连接池实例 */
  let pool: PgPool | null = null

  // ─── 辅助函数 ───

  /**
   * 构建列定义 SQL
   *
   * 将 ReldbColumnDef 转换为 PostgreSQL 列定义语句
   *
   * @param name - 列名
   * @param def - 列定义
   * @returns 列定义 SQL 片段
   */
  function buildColumnSql(name: string, def: ReldbColumnDef): string {
    const parts: string[] = [quoteIdentifier(name)]

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
          parts.push(`DEFAULT '${escapeSqlString(def.defaultValue)}'`)
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
      parts.push(`REFERENCES ${quoteIdentifier(def.references.table)}(${quoteIdentifier(def.references.column)})`)
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
  function ensureConnected(): Result<PgPool, ReldbError> {
    if (!pool) {
      return err({
        code: ReldbErrorCode.NOT_INITIALIZED,
        message: reldbM('reldb_notInitialized'),
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
   * 执行分页查询
   *
   * 使用独立的 COUNT(*) 查询获取总数，再执行 LIMIT/OFFSET 获取当前页数据。
   * 与 SQLite/MySQL 的分页行为一致，OFFSET 超出数据范围时 total 仍返回精确值。
   *
   * @param executor - SQL 执行器
   * @param options - 分页查询参数
   * @returns 分页结果
   */
  async function queryPageWithExecutor<T>(
    executor: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>,
    options: PaginationQueryOptions,
  ): Promise<PaginatedResult<T>> {
    const pagination = normalizePagination(options.pagination, options.overrides)

    // 独立 COUNT 查询（与 OFFSET 无关，始终返回精确值）
    const countSql = convertPlaceholders(`SELECT COUNT(*) as cnt FROM (${options.sql}) AS t`)
    const countResult = await executor(countSql, options.params)
    const countRows = countResult.rows as Record<string, unknown>[]
    const total = countRows.length > 0 ? parseCount(countRows[0]) : 0

    // 数据查询
    const dataSql = convertPlaceholders(`${options.sql} LIMIT ? OFFSET ?`)
    const dataParams = [...(options.params ?? []), pagination.limit, pagination.offset]
    const dataResult = await executor(dataSql, dataParams)
    const items = dataResult.rows as T[]

    return buildPaginatedResult(items, total, pagination)
  }

  /**
   * 批量执行多条 SQL 语句（序列化执行，负责占位符转换）
   *
   * @param executor - SQL 执行器
   * @param statements - SQL 语句列表
   */
  async function runStatementBatch(
    executor: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[], rowCount: number }>,
    statements: Array<{ sql: string, params?: unknown[] }>,
  ): Promise<void> {
    for (const { sql: statement, params } of statements) {
      const pgSql = convertPlaceholders(statement)
      await executor(pgSql, params)
    }
  }

  /**
   * 执行查询并返回多行结果
   *
   * 自动将 ? 占位符转换为 PostgreSQL 的 $n 格式。
   *
   * @param executor - SQL 执行器
   * @param sqlStr - SQL 查询语句
   * @param params - 查询参数
   * @returns 查询结果数组或错误
   */
  async function runQuery<T>(
    executor: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[], rowCount: number }>,
    sqlStr: string,
    params?: unknown[],
  ): Promise<Result<T[], ReldbError>> {
    try {
      const pgSql = convertPlaceholders(sqlStr)
      const result = await executor(pgSql, params)
      return ok(result.rows as T[])
    }
    catch (error) {
      return err({
        code: ReldbErrorCode.QUERY_FAILED,
        message: reldbM('reldb_queryFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 执行查询并返回单行结果
   *
   * @param executor - SQL 执行器
   * @param sqlStr - SQL 查询语句
   * @param params - 查询参数
   * @returns 单行结果或 null
   */
  async function runGet<T>(
    executor: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[], rowCount: number }>,
    sqlStr: string,
    params?: unknown[],
  ): Promise<Result<T | null, ReldbError>> {
    try {
      const pgSql = convertPlaceholders(sqlStr)
      const result = await executor(pgSql, params)
      return ok((result.rows[0] as T) ?? null)
    }
    catch (error) {
      return err({
        code: ReldbErrorCode.QUERY_FAILED,
        message: reldbM('reldb_queryFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 执行修改语句（INSERT/UPDATE/DELETE）
   *
   * @param executor - SQL 执行器
   * @param sqlStr - SQL 修改语句
   * @param params - 语句参数
   * @returns 执行结果（含 changes）
   */
  async function runExecute(
    executor: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[], rowCount: number }>,
    sqlStr: string,
    params?: unknown[],
  ): Promise<Result<ExecuteResult, ReldbError>> {
    try {
      const pgSql = convertPlaceholders(sqlStr)
      const result = await executor(pgSql, params)
      return ok({
        changes: result.rowCount ?? 0,
      })
    }
    catch (error) {
      return err({
        code: ReldbErrorCode.QUERY_FAILED,
        message: reldbM('reldb_executeFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 批量执行多条 SQL 语句（带错误包装）
   *
   * @param executor - SQL 执行器
   * @param statements - SQL 语句列表
   * @returns 批量执行结果
   */
  async function runBatch(
    executor: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[], rowCount: number }>,
    statements: Array<{ sql: string, params?: unknown[] }>,
  ): Promise<Result<void, ReldbError>> {
    try {
      await runStatementBatch(executor, statements)
      return ok(undefined)
    }
    catch (error) {
      return err({
        code: ReldbErrorCode.QUERY_FAILED,
        message: reldbM('reldb_batchFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 执行分页查询（带错误包装）
   *
   * @param executor - SQL 执行器
   * @param options - 分页查询参数
   * @returns 分页结果或错误
   */
  async function runQueryPage<T>(
    executor: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[], rowCount: number }>,
    options: PaginationQueryOptions,
  ): Promise<Result<PaginatedResult<T>, ReldbError>> {
    try {
      const pageResult = await queryPageWithExecutor<T>(executor, options)
      return ok(pageResult)
    }
    catch (error) {
      return err({
        code: ReldbErrorCode.QUERY_FAILED,
        message: reldbM('reldb_queryFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  /** 创建 CRUD 管理器（基于给定的 DataOperations 创建单表 CRUD 工厂） */
  const createCrudManager = (ops: DataOperations): ReldbCrudManager => ({
    table: config => createCrud(ops, config),
  })

  // ─── DDL 操作实现 ───

  /**
   * DDL 操作
   *
   * PostgreSQL 的 DDL 语句通过连接池异步执行。
   */
  const ddl: ReldbDdlOperations = {
    async createTable(tableName: string, columns: ReldbTableDef, ifNotExists = true): Promise<Result<void, ReldbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      // 校验表名与列名
      const tableValid = validateIdentifier(tableName)
      if (!tableValid.success)
        return tableValid
      const colNames = Object.keys(columns)
      const colsValid = validateIdentifiers(colNames)
      if (!colsValid.success)
        return colsValid

      const columnDefs = Object.entries(columns)
        .map(([name, def]) => buildColumnSql(name, def))
        .join(', ')

      const ifNotExistsClause = ifNotExists ? 'IF NOT EXISTS ' : ''
      const sql = `CREATE TABLE ${ifNotExistsClause}${quoteIdentifier(tableName)} (${columnDefs})`

      try {
        await connResult.data.query(sql)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: ReldbErrorCode.DDL_FAILED,
          message: reldbM('reldb_ddlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async dropTable(tableName: string, ifExists = true): Promise<Result<void, ReldbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const tableValid = validateIdentifier(tableName)
      if (!tableValid.success)
        return tableValid

      const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
      try {
        await connResult.data.query(`DROP TABLE ${ifExistsClause}${quoteIdentifier(tableName)}`)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: ReldbErrorCode.DDL_FAILED,
          message: reldbM('reldb_ddlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async addColumn(tableName: string, columnName: string, columnDef: ReldbColumnDef): Promise<Result<void, ReldbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const tableValid = validateIdentifier(tableName)
      if (!tableValid.success)
        return tableValid
      const colValid = validateIdentifier(columnName)
      if (!colValid.success)
        return colValid

      const colSql = buildColumnSql(columnName, columnDef)
      try {
        await connResult.data.query(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${colSql}`)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: ReldbErrorCode.DDL_FAILED,
          message: reldbM('reldb_ddlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async dropColumn(tableName: string, columnName: string): Promise<Result<void, ReldbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const tableValid = validateIdentifier(tableName)
      if (!tableValid.success)
        return tableValid
      const colValid = validateIdentifier(columnName)
      if (!colValid.success)
        return colValid

      try {
        await connResult.data.query(`ALTER TABLE ${quoteIdentifier(tableName)} DROP COLUMN ${quoteIdentifier(columnName)}`)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: ReldbErrorCode.DDL_FAILED,
          message: reldbM('reldb_ddlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async renameTable(oldName: string, newName: string): Promise<Result<void, ReldbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const oldValid = validateIdentifier(oldName)
      if (!oldValid.success)
        return oldValid
      const newValid = validateIdentifier(newName)
      if (!newValid.success)
        return newValid

      try {
        await connResult.data.query(`ALTER TABLE ${quoteIdentifier(oldName)} RENAME TO ${quoteIdentifier(newName)}`)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: ReldbErrorCode.DDL_FAILED,
          message: reldbM('reldb_ddlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async createIndex(tableName: string, indexName: string, indexDef: ReldbIndexDef): Promise<Result<void, ReldbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const tableValid = validateIdentifier(tableName)
      if (!tableValid.success)
        return tableValid
      const idxValid = validateIdentifier(indexName)
      if (!idxValid.success)
        return idxValid
      const colsValid = validateIdentifiers(indexDef.columns)
      if (!colsValid.success)
        return colsValid

      const uniqueClause = indexDef.unique ? 'UNIQUE ' : ''
      const columns = indexDef.columns.map(c => quoteIdentifier(c)).join(', ')
      const whereClause = indexDef.where ? ` WHERE ${indexDef.where}` : ''

      try {
        await connResult.data.query(
          `CREATE ${uniqueClause}INDEX IF NOT EXISTS ${quoteIdentifier(indexName)} ON ${quoteIdentifier(tableName)} (${columns})${whereClause}`,
        )
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: ReldbErrorCode.DDL_FAILED,
          message: reldbM('reldb_ddlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async dropIndex(indexName: string, ifExists = true): Promise<Result<void, ReldbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const idxValid = validateIdentifier(indexName)
      if (!idxValid.success)
        return idxValid

      const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
      try {
        await connResult.data.query(`DROP INDEX ${ifExistsClause}${quoteIdentifier(indexName)}`)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: ReldbErrorCode.DDL_FAILED,
          message: reldbM('reldb_ddlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async raw(sql: string): Promise<Result<void, ReldbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      try {
        await connResult.data.query(sql)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: ReldbErrorCode.DDL_FAILED,
          message: reldbM('reldb_ddlFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },
  }

  // ─── SQL 操作 ───

  /**
   * SQL 操作
   */
  const sql: ReldbSqlOperations = {
    async query<T>(sqlStr: string, params?: unknown[]): Promise<Result<T[], ReldbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult
      return runQuery<T>((sqlStrInner, paramsInner) => connResult.data.query(sqlStrInner, paramsInner), sqlStr, params)
    },

    async get<T>(sqlStr: string, params?: unknown[]): Promise<Result<T | null, ReldbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult
      return runGet<T>((sqlStrInner, paramsInner) => connResult.data.query(sqlStrInner, paramsInner), sqlStr, params)
    },

    async execute(sqlStr: string, params?: unknown[]): Promise<Result<ExecuteResult, ReldbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult
      return runExecute((sqlStrInner, paramsInner) => connResult.data.query(sqlStrInner, paramsInner), sqlStr, params)
    },

    async batch(statements: Array<{ sql: string, params?: unknown[] }>): Promise<Result<void, ReldbError>> {
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
          code: ReldbErrorCode.QUERY_FAILED,
          message: reldbM('reldb_batchFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
      finally {
        if (client) {
          client.release()
        }
      }
    },

    async queryPage<T>(options: PaginationQueryOptions): Promise<Result<PaginatedResult<T>, ReldbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult
      return runQueryPage<T>((sqlStr, params) => connResult.data.query(sqlStr, params), options)
    },
  }

  const crud = createCrudManager(sql)

  // ─── 事务操作实现 ───

  /**
   * 开启事务
   *
   * 从连接池获取独立连接，执行 BEGIN，并返回事务句柄。
   * 事务完成后（commit/rollback）自动释放连接。
   *
   * @returns 事务句柄或错误
   */
  async function beginTransaction(): Promise<Result<ReldbTxHandle, ReldbError>> {
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
        code: ReldbErrorCode.TRANSACTION_FAILED,
        message: reldbM('reldb_postgresTxFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }

    let active = true

    const ensureActive = (): Result<void, ReldbError> => {
      if (!active) {
        return err({
          code: ReldbErrorCode.TRANSACTION_FAILED,
          message: reldbM('reldb_postgresTxFailed', { params: { error: 'transaction finished' } }),
        })
      }
      return ok(undefined)
    }

    const txDataOps: DataOperations = {
      async query<R>(sqlStr: string, params?: unknown[]): Promise<Result<R[], ReldbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runQuery<R>((sqlStrInner, paramsInner) => client!.query(sqlStrInner, paramsInner), sqlStr, params)
      },

      async get<R>(sqlStr: string, params?: unknown[]): Promise<Result<R | null, ReldbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runGet<R>((sqlStrInner, paramsInner) => client!.query(sqlStrInner, paramsInner), sqlStr, params)
      },

      async execute(sqlStr: string, params?: unknown[]): Promise<Result<ExecuteResult, ReldbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runExecute((sqlStrInner, paramsInner) => client!.query(sqlStrInner, paramsInner), sqlStr, params)
      },

      async batch(statements: Array<{ sql: string, params?: unknown[] }>): Promise<Result<void, ReldbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runBatch((sqlStrInner, paramsInner) => client!.query(sqlStrInner, paramsInner), statements)
      },

      async queryPage<R>(options: PaginationQueryOptions): Promise<Result<PaginatedResult<R>, ReldbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runQueryPage<R>((sqlStrInner, paramsInner) => client!.query(sqlStrInner, paramsInner), options)
      },
    }

    const txOps: ReldbTxHandle = {
      ...txDataOps,
      crud: createCrudManager(txDataOps),

      async commit(): Promise<Result<void, ReldbError>> {
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
            code: ReldbErrorCode.TRANSACTION_FAILED,
            message: reldbM('reldb_postgresTxFailed', { params: { error: String(error) } }),
            cause: error,
          })
        }
        finally {
          client!.release()
        }
      },
      async rollback(): Promise<Result<void, ReldbError>> {
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
            code: ReldbErrorCode.TRANSACTION_FAILED,
            message: reldbM('reldb_postgresTxFailed', { params: { error: String(error) } }),
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

  const tx: ReldbTxManager = {
    begin: beginTransaction,

    async wrap<T>(fn: TxWrapCallback<T>): Promise<Result<T, ReldbError>> {
      const txResult = await beginTransaction()
      if (!txResult.success)
        return txResult

      try {
        const result = await fn(txResult.data)
        const commitResult = await txResult.data.commit()
        if (!commitResult.success) {
          return commitResult as Result<T, ReldbError>
        }
        return ok(result)
      }
      catch (error) {
        await txResult.data.rollback()
        return err({
          code: ReldbErrorCode.TRANSACTION_FAILED,
          message: reldbM('reldb_postgresTxFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },
  }

  // ─── Provider 接口实现 ───

  /**
   * 连接 PostgreSQL 数据库
   */
  const connect: ReldbProvider['connect'] = async (config: ReldbConfig): Promise<Result<void, ReldbError>> => {
    if (config.type !== 'postgresql') {
      return err({
        code: ReldbErrorCode.UNSUPPORTED_TYPE,
        message: reldbM('reldb_postgresOnlyPostgresql'),
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

      // 验证连接可用性
      await pool.query('SELECT 1')

      logger.info('Connected to PostgreSQL', { host: config.host, port: config.port, database: config.database })
      return ok(undefined)
    }
    catch (error) {
      pool = null
      return err({
        code: ReldbErrorCode.CONNECTION_FAILED,
        message: reldbM('reldb_postgresConnectionFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 关闭连接池
   */
  const close: ReldbProvider['close'] = async (): Promise<Result<void, ReldbError>> => {
    if (pool) {
      try {
        await pool.end()
      }
      catch (error) {
        pool = null
        return err({
          code: ReldbErrorCode.CONNECTION_FAILED,
          message: reldbM('reldb_postgresConnectionFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
      pool = null
      logger.info('Disconnected from PostgreSQL')
    }
    return ok(undefined)
  }

  /**
   * 检查是否已连接
   */
  const isConnected: ReldbProvider['isConnected'] = (): boolean => {
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
