/**
 * @h-ai/db — MySQL Provider
 *
 * 基于 mysql2 的 MySQL 数据库实现。
 * @module db-provider-mysql
 */

import type { PaginatedResult, Result } from '@h-ai/core'
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

import { err, ok } from '@h-ai/core'

import { DbErrorCode } from '../db-config.js'
import { createCrud } from '../db-crud-kernel.js'
import { dbM } from '../db-i18n.js'
import { buildPaginatedResult, normalizePagination, parseCount } from '../db-pagination.js'
import { escapeSqlString, validateIdentifier, validateIdentifiers } from '../db-security.js'

// ─── mysql2 类型定义（避免强依赖） ───

/** MySQL 连接池接口 */
interface MysqlPool {
  query: (sql: string, values?: unknown[]) => Promise<[unknown[], unknown]>
  execute: (sql: string, values?: unknown[]) => Promise<[MysqlResult, unknown]>
  getConnection: () => Promise<MysqlConnection>
  end: () => Promise<void>
}

/** MySQL 连接接口 */
interface MysqlConnection {
  query: (sql: string, values?: unknown[]) => Promise<[unknown[], unknown]>
  execute: (sql: string, values?: unknown[]) => Promise<[MysqlResult, unknown]>
  beginTransaction: () => Promise<void>
  commit: () => Promise<void>
  rollback: () => Promise<void>
  release: () => void
}

/** MySQL 执行结果 */
interface MysqlResult {
  affectedRows: number
  insertId: number
}

// ─── MySQL Provider 实现 ───

/**
 * 创建 MySQL Provider 实例
 *
 * @returns MySQL Provider
 */
export function createMysqlProvider(): DbProvider {
  /** 连接池实例 */
  let pool: MysqlPool | null = null

  // ─── 辅助函数 ───

  /**
   * 构建列定义 SQL
   *
   * 将 ColumnDef 转换为 MySQL 列定义语句
   *
   * @param name - 列名
   * @param def - 列定义
   * @returns 列定义 SQL 片段
   */
  function buildColumnSql(name: string, def: ColumnDef): string {
    const parts: string[] = [`\`${name}\``]

    // 类型映射
    switch (def.type) {
      case 'TEXT':
        // MySQL 中 TEXT/BLOB 不能直接建 UNIQUE/索引（需要指定长度）。
        // ColumnDef 目前没有长度字段，因此默认使用 VARCHAR(255) 以获得更好的可用性。
        parts.push('VARCHAR(255)')
        break
      case 'INTEGER':
        if (def.autoIncrement) {
          parts.push('BIGINT')
        }
        else {
          parts.push('INT')
        }
        break
      case 'REAL':
        parts.push('DOUBLE')
        break
      case 'BLOB':
        parts.push('BLOB')
        break
      case 'BOOLEAN':
        parts.push('TINYINT(1)')
        break
      case 'TIMESTAMP':
        parts.push('DATETIME')
        break
      case 'JSON':
        parts.push('JSON')
        break
      default:
        parts.push('TEXT')
    }

    if (def.notNull || def.primaryKey) {
      parts.push('NOT NULL')
    }

    if (def.autoIncrement) {
      parts.push('AUTO_INCREMENT')
    }

    if (def.unique && !def.primaryKey) {
      parts.push('UNIQUE')
    }

    if (def.defaultValue !== undefined && !def.autoIncrement) {
      if (def.defaultValue === null) {
        parts.push('DEFAULT NULL')
      }
      else if (typeof def.defaultValue === 'string') {
        if (def.defaultValue === 'NOW()' || def.defaultValue === 'CURRENT_TIMESTAMP') {
          parts.push(`DEFAULT ${def.defaultValue}`)
        }
        else if (def.defaultValue.startsWith('(') && def.defaultValue.endsWith(')')) {
          // MySQL 8.0+ 支持表达式默认值
          parts.push(`DEFAULT ${def.defaultValue}`)
        }
        else {
          parts.push(`DEFAULT '${escapeSqlString(def.defaultValue)}'`)
        }
      }
      else if (typeof def.defaultValue === 'boolean') {
        parts.push(`DEFAULT ${def.defaultValue ? 1 : 0}`)
      }
      else {
        parts.push(`DEFAULT ${def.defaultValue}`)
      }
    }

    return parts.join(' ')
  }

  /**
   * 确保数据库已连接
   *
   * @returns 连接池或错误
   */
  function ensureConnected(): Result<MysqlPool, DbError> {
    if (!pool) {
      return err({
        code: DbErrorCode.NOT_INITIALIZED,
        message: dbM('db_notInitialized'),
      })
    }
    return ok(pool)
  }

  /**
   * 执行查询并返回行数据
   *
   * @param executor - mysql2 查询执行器
   * @param sqlStr - SQL 查询语句
   * @param params - 查询参数
   * @returns 查询结果数组
   */
  async function runQuery(
    executor: (sql: string, values?: unknown[]) => Promise<[unknown[], unknown]>,
    sqlStr: string,
    params?: unknown[],
  ): Promise<unknown[]> {
    const [rows] = await executor(sqlStr, params)
    return rows as unknown[]
  }

  /**
   * 执行分页查询
   *
   * 使用独立的 `SELECT COUNT(*)` 查询获取总数（与 OFFSET 无关，始终返回精确值），
   * 再执行 LIMIT/OFFSET 获取当前页数据。
   *
   * @param executor - mysql2 查询执行器
   * @param options - 分页查询参数
   * @returns 分页结果
   */
  async function queryPageWithExecutor<T>(
    executor: (sql: string, values?: unknown[]) => Promise<[unknown[], unknown]>,
    options: PaginationQueryOptions,
  ): Promise<PaginatedResult<T>> {
    const pagination = normalizePagination(options.pagination, options.overrides)
    const dataSql = `${options.sql} LIMIT ? OFFSET ?`
    const dataParams = [...(options.params ?? []), pagination.limit, pagination.offset]
    const countSql = `SELECT COUNT(*) as cnt FROM (${options.sql}) AS t`

    const countRows = await runQuery(executor, countSql, options.params)
    const countRow = (countRows as Record<string, unknown>[])[0]
    const total = parseCount(countRow)

    const rows = await runQuery(executor, dataSql, dataParams)
    return buildPaginatedResult(rows as T[], total, pagination)
  }

  /**
   * 执行查询并返回多行结果（带错误包装）
   *
   * @param executor - mysql2 查询执行器
   * @param sqlStr - SQL 查询语句
   * @param params - 查询参数
   * @returns 查询结果数组或错误
   */
  async function runQueryResult<T>(
    executor: (sql: string, values?: unknown[]) => Promise<[unknown[], unknown]>,
    sqlStr: string,
    params?: unknown[],
  ): Promise<Result<T[], DbError>> {
    try {
      const [rows] = await executor(sqlStr, params)
      return ok(rows as T[])
    }
    catch (error) {
      return err({
        code: DbErrorCode.QUERY_FAILED,
        message: dbM('db_queryFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 根据索引名解析所在表
   *
   * MySQL 的 `DROP INDEX` 语句需要表名，因此通过 INFORMATION_SCHEMA
   * 在当前数据库中查找索引所属表。
   *
   * @param executor - mysql2 查询执行器
   * @param indexName - 索引名
   * @returns 表名或 null（索引不存在）
   */
  async function findIndexTableName(
    executor: (sql: string, values?: unknown[]) => Promise<[unknown[], unknown]>,
    indexName: string,
  ): Promise<Result<string | null, DbError>> {
    const rowsResult = await runQueryResult<{ name: string }>(
      executor,
      'SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = ? LIMIT 1',
      [indexName],
    )

    if (!rowsResult.success) {
      return rowsResult
    }

    return ok(rowsResult.data[0]?.name ?? null)
  }

  /**
   * 执行查询并返回单行结果
   *
   * @param executor - mysql2 查询执行器
   * @param sqlStr - SQL 查询语句
   * @param params - 查询参数
   * @returns 单行结果或 null
   */
  async function runGetResult<T>(
    executor: (sql: string, values?: unknown[]) => Promise<[unknown[], unknown]>,
    sqlStr: string,
    params?: unknown[],
  ): Promise<Result<T | null, DbError>> {
    const rowsResult = await runQueryResult<T>(executor, sqlStr, params)
    if (!rowsResult.success) {
      return rowsResult
    }
    return ok(rowsResult.data[0] ?? null)
  }

  /**
   * 执行修改语句（INSERT/UPDATE/DELETE）
   *
   * @param executor - mysql2 execute 执行器
   * @param sqlStr - SQL 修改语句
   * @param params - 语句参数
   * @returns 执行结果（含 affectedRows、insertId）
   */
  async function runExecuteResult(
    executor: (sql: string, values?: unknown[]) => Promise<[MysqlResult, unknown]>,
    sqlStr: string,
    params?: unknown[],
  ): Promise<Result<ExecuteResult, DbError>> {
    try {
      const [result] = await executor(sqlStr, params)
      return ok({
        changes: result.affectedRows,
        lastInsertRowid: result.insertId,
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

  /**
   * 批量执行多条 SQL 语句（带错误包装）
   *
   * @param executor - mysql2 execute 执行器
   * @param statements - SQL 语句列表
   * @returns 批量执行结果
   */
  async function runBatchResult(
    executor: (sql: string, values?: unknown[]) => Promise<[MysqlResult, unknown]>,
    statements: Array<{ sql: string, params?: unknown[] }>,
  ): Promise<Result<void, DbError>> {
    try {
      for (const { sql: statement, params } of statements) {
        await executor(statement, params)
      }
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

  /**
   * 执行分页查询（带错误包装）
   *
   * @param executor - mysql2 查询执行器
   * @param options - 分页查询参数
   * @returns 分页结果或错误
   */
  async function runQueryPageResult<T>(
    executor: (sql: string, values?: unknown[]) => Promise<[unknown[], unknown]>,
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

  /** 创建 CRUD 管理器（基于给定的 DataOperations 创建单表 CRUD 工厂） */
  const createCrudManager = (ops: DataOperations): CrudManager => ({
    table: config => createCrud(ops, config),
  })

  // ─── DDL 操作实现 ───

  /**
   * DDL 操作
   *
   * MySQL 的 DDL 语句通过连接池异步执行。
   * 表名和列名使用反引号包裹以避免保留字冲突。
   */
  const ddl: DdlOperations = {
    async createTable(tableName: string, columns: TableDef, ifNotExists = true): Promise<Result<void, DbError>> {
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

      const columnDefs: string[] = []
      let primaryKeyCol: string | null = null

      for (const [name, def] of Object.entries(columns)) {
        columnDefs.push(buildColumnSql(name, def))
        if (def.primaryKey) {
          primaryKeyCol = name
        }
      }

      if (primaryKeyCol) {
        columnDefs.push(`PRIMARY KEY (\`${primaryKeyCol}\`)`)
      }

      // 添加外键约束
      for (const [name, def] of Object.entries(columns)) {
        if (def.references) {
          let fkSql = `FOREIGN KEY (\`${name}\`) REFERENCES \`${def.references.table}\`(\`${def.references.column}\`)`
          if (def.references.onDelete) {
            fkSql += ` ON DELETE ${def.references.onDelete}`
          }
          if (def.references.onUpdate) {
            fkSql += ` ON UPDATE ${def.references.onUpdate}`
          }
          columnDefs.push(fkSql)
        }
      }

      const ifNotExistsClause = ifNotExists ? 'IF NOT EXISTS ' : ''
      const sql = `CREATE TABLE ${ifNotExistsClause}\`${tableName}\` (${columnDefs.join(', ')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`

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

      const tableValid = validateIdentifier(tableName)
      if (!tableValid.success)
        return tableValid

      const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
      try {
        await connResult.data.query(`DROP TABLE ${ifExistsClause}\`${tableName}\``)
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

      const tableValid = validateIdentifier(tableName)
      if (!tableValid.success)
        return tableValid
      const colValid = validateIdentifier(columnName)
      if (!colValid.success)
        return colValid

      const colSql = buildColumnSql(columnName, columnDef)
      try {
        await connResult.data.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${colSql}`)
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

      const tableValid = validateIdentifier(tableName)
      if (!tableValid.success)
        return tableValid
      const colValid = validateIdentifier(columnName)
      if (!colValid.success)
        return colValid

      try {
        await connResult.data.query(`ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``)
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

      const oldValid = validateIdentifier(oldName)
      if (!oldValid.success)
        return oldValid
      const newValid = validateIdentifier(newName)
      if (!newValid.success)
        return newValid

      try {
        await connResult.data.query(`RENAME TABLE \`${oldName}\` TO \`${newName}\``)
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
      const columns = indexDef.columns.map(c => `\`${c}\``).join(', ')

      try {
        await connResult.data.query(
          `CREATE ${uniqueClause}INDEX \`${indexName}\` ON \`${tableName}\` (${columns})`,
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

      const idxValid = validateIdentifier(indexName)
      if (!idxValid.success)
        return idxValid

      const tableResult = await findIndexTableName((sql, values) => connResult.data.query(sql, values), indexName)
      if (!tableResult.success)
        return tableResult

      if (!tableResult.data) {
        if (ifExists) {
          return ok(undefined)
        }
        return err({
          code: DbErrorCode.DDL_FAILED,
          message: dbM('db_ddlFailed', { params: { error: `index not found: ${indexName}` } }),
        })
      }

      try {
        await connResult.data.query(`DROP INDEX \`${indexName}\` ON \`${tableResult.data}\``)
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

  // ─── SQL 操作 ───

  /**
   * SQL 操作
   */
  const sql: SqlOperations = {
    async query<T>(sqlStr: string, params?: unknown[]): Promise<Result<T[], DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult
      return runQueryResult<T>((sqlStrInner, paramsInner) => connResult.data.query(sqlStrInner, paramsInner), sqlStr, params)
    },

    async get<T>(sqlStr: string, params?: unknown[]): Promise<Result<T | null, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult
      return runGetResult<T>((sqlStrInner, paramsInner) => connResult.data.query(sqlStrInner, paramsInner), sqlStr, params)
    },

    async execute(sqlStr: string, params?: unknown[]): Promise<Result<ExecuteResult, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult
      return runExecuteResult(
        (sqlStrInner, paramsInner) => connResult.data.execute(sqlStrInner, paramsInner),
        sqlStr,
        params,
      )
    },

    async batch(statements: Array<{ sql: string, params?: unknown[] }>): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      let connection: MysqlConnection | null = null
      try {
        connection = await connResult.data.getConnection()
        await connection.beginTransaction()
        const batchResult = await runBatchResult(
          (sqlStrInner, paramsInner) => connection!.execute(sqlStrInner, paramsInner),
          statements,
        )
        if (!batchResult.success) {
          if (connection) {
            await connection.rollback().catch(() => { })
          }
          return batchResult
        }
        await connection.commit()
        return ok(undefined)
      }
      catch (error) {
        if (connection) {
          await connection.rollback().catch(() => { })
        }
        return err({
          code: DbErrorCode.QUERY_FAILED,
          message: dbM('db_batchFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
      finally {
        if (connection) {
          connection.release()
        }
      }
    },

    async queryPage<T>(options: PaginationQueryOptions): Promise<Result<PaginatedResult<T>, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult
      return runQueryPageResult<T>((sqlStr, params) => connResult.data.query(sqlStr, params), options)
    },

  }

  const crud = createCrudManager(sql)

  // ─── 事务操作实现 ───

  /**
   * 开启事务
   *
   * 从连接池获取独立连接，执行 beginTransaction，并返回事务句柄。
   * 事务完成后（commit/rollback）自动释放连接。
   *
   * @returns 事务句柄或错误
   */
  async function beginTransaction(): Promise<Result<TxHandle, DbError>> {
    const connResult = ensureConnected()
    if (!connResult.success)
      return connResult

    let connection: MysqlConnection | null = null

    try {
      connection = await pool!.getConnection()
      await connection.beginTransaction()
    }
    catch (error) {
      if (connection) {
        connection.release()
      }
      return err({
        code: DbErrorCode.TRANSACTION_FAILED,
        message: dbM('db_mysqlTxFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }

    let active = true

    const ensureActive = (): Result<void, DbError> => {
      if (!active) {
        return err({
          code: DbErrorCode.TRANSACTION_FAILED,
          message: dbM('db_mysqlTxFailed', { params: { error: 'transaction finished' } }),
        })
      }
      return ok(undefined)
    }

    const txDataOps: DataOperations = {
      async query<R>(sqlStr: string, params?: unknown[]): Promise<Result<R[], DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runQueryResult<R>((sqlStrInner, paramsInner) => connection!.query(sqlStrInner, paramsInner), sqlStr, params)
      },

      async get<R>(sqlStr: string, params?: unknown[]): Promise<Result<R | null, DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runGetResult<R>((sqlStrInner, paramsInner) => connection!.query(sqlStrInner, paramsInner), sqlStr, params)
      },

      async execute(sqlStr: string, params?: unknown[]): Promise<Result<ExecuteResult, DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runExecuteResult(
          (sqlStrInner, paramsInner) => connection!.execute(sqlStrInner, paramsInner),
          sqlStr,
          params,
        )
      },

      async batch(statements: Array<{ sql: string, params?: unknown[] }>): Promise<Result<void, DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runBatchResult(
          (sqlStrInner, paramsInner) => connection!.execute(sqlStrInner, paramsInner),
          statements,
        )
      },

      async queryPage<R>(options: PaginationQueryOptions): Promise<Result<PaginatedResult<R>, DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        return runQueryPageResult<R>((sqlStr, params) => connection!.query(sqlStr, params), options)
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
          await connection!.commit()
          active = false
          return ok(undefined)
        }
        catch (error) {
          return err({
            code: DbErrorCode.TRANSACTION_FAILED,
            message: dbM('db_mysqlTxFailed', { params: { error: String(error) } }),
            cause: error,
          })
        }
        finally {
          connection!.release()
        }
      },

      async rollback(): Promise<Result<void, DbError>> {
        const activeResult = ensureActive()
        if (!activeResult.success)
          return activeResult
        try {
          await connection!.rollback()
          active = false
          return ok(undefined)
        }
        catch (error) {
          return err({
            code: DbErrorCode.TRANSACTION_FAILED,
            message: dbM('db_mysqlTxFailed', { params: { error: String(error) } }),
            cause: error,
          })
        }
        finally {
          connection!.release()
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
          message: dbM('db_mysqlTxFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },
  }

  // ─── Provider 接口实现 ───

  /**
   * 连接 MySQL 数据库
   */
  const connect: DbProvider['connect'] = async (config: DbConfig): Promise<Result<void, DbError>> => {
    if (config.type !== 'mysql') {
      return err({
        code: DbErrorCode.UNSUPPORTED_TYPE,
        message: dbM('db_mysqlOnlyMysql'),
      })
    }

    try {
      // 动态导入 mysql2
      // eslint-disable-next-line ts/no-require-imports -- 需要保持 connect 同步，使用 require 进行按需加载
      const mysql = require('mysql2/promise')

      pool = mysql.createPool({
        uri: config.url,
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        ssl: config.ssl,
        connectionLimit: config.pool?.max ?? 10,
        waitForConnections: true,
        queueLimit: 0,
        charset: config.mysql?.charset ?? 'utf8mb4',
      }) as MysqlPool

      return ok(undefined)
    }
    catch (error) {
      return err({
        code: DbErrorCode.CONNECTION_FAILED,
        message: dbM('db_mysqlConnectionFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 关闭连接池
   */
  const close: DbProvider['close'] = async (): Promise<Result<void, DbError>> => {
    if (pool) {
      try {
        await pool.end()
      }
      catch (error) {
        pool = null
        return err({
          code: DbErrorCode.CONNECTION_FAILED,
          message: dbM('db_mysqlConnectionFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
      pool = null
    }
    return ok(undefined)
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
