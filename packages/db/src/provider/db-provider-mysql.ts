/**
 * =============================================================================
 * @hai/db - MySQL Provider
 * =============================================================================
 *
 * 基于 mysql2 的 MySQL 数据库实现。
 *
 * MySQL 特点：
 * - 广泛使用的开源关系型数据库
 * - 支持多种存储引擎（默认 InnoDB）
 * - 完整的事务支持
 * - 使用连接池管理连接
 *
 * 注意事项：
 * - MySQL 驱动是异步的
 * - 默认使用 utf8mb4 字符集支持完整 Unicode
 *
 * 适用场景：
 * - 生产环境
 * - Web 应用
 * - 需要与现有 MySQL 基础设施集成
 *
 * @module db-provider-mysql
 * =============================================================================
 */

import type { PaginatedResult, Result } from '@hai/core'
import type { DbConfig } from '../db-config.js'
import type {
  ColumnDef,
  DbError,
  DbProvider,
  DdlOperations,
  ExecuteResult,
  IndexDef,
  PaginationQueryOptions,
  SqlOperations,
  TableDef,
  TxCallback,
  TxOperations,
} from '../db-types.js'

import { err, ok } from '@hai/core'

import { DbErrorCode } from '../db-config.js'
import { dbM } from '../db-i18n.js'
import { buildPaginatedResult, normalizePagination } from '../db-pagination.js'

// =============================================================================
// mysql2 类型定义（避免强依赖）
// =============================================================================

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

// =============================================================================
// MySQL Provider 实现
// =============================================================================

/**
 * 创建 MySQL Provider 实例
 *
 * @returns MySQL Provider
 */
export function createMysqlProvider(): DbProvider {
  /** 连接池实例 */
  let pool: MysqlPool | null = null

  // =========================================================================
  // 辅助函数
  // =========================================================================

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
          parts.push(`DEFAULT '${def.defaultValue}'`)
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
   * 执行查询并返回行数据
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

  // =========================================================================
  // DDL 操作实现
  // =========================================================================

  /**
   * DDL 操作
   *
   * 注意：MySQL 的 DDL 操作会立即返回成功，
   * 但实际 SQL 执行是异步的。错误会在后台处理。
   */
  const ddl: DdlOperations = {
    async createTable(tableName: string, columns: TableDef, ifNotExists = true): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

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

      // MySQL 需要指定表名来删除索引，这里使用通用方式
      // 实际使用时建议用 raw() 指定表名
      try {
        if (ifExists) {
          await connResult.data.query(`DROP INDEX IF EXISTS \`${indexName}\``)
        }
        else {
          await connResult.data.query(`DROP INDEX \`${indexName}\``)
        }
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

      try {
        const [rows] = await connResult.data.query(sqlStr, params)
        return ok(rows as T[])
      }
      catch (error) {
        return err({
          code: DbErrorCode.QUERY_FAILED,
          message: dbM('db_queryFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async get<T>(sqlStr: string, params?: unknown[]): Promise<Result<T | null, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      try {
        const [rows] = await connResult.data.query(sqlStr, params)
        const row = (rows as T[])[0] ?? null
        return ok(row)
      }
      catch (error) {
        return err({
          code: DbErrorCode.QUERY_FAILED,
          message: dbM('db_queryFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async execute(sqlStr: string, params?: unknown[]): Promise<Result<ExecuteResult, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      try {
        const [result] = await connResult.data.execute(sqlStr, params)
        const mysqlResult = result as MysqlResult
        return ok({
          changes: mysqlResult.affectedRows,
          lastInsertRowid: mysqlResult.insertId,
        })
      }
      catch (error) {
        return err({
          code: DbErrorCode.QUERY_FAILED,
          message: dbM('db_executeFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async batch(statements: Array<{ sql: string, params?: unknown[] }>): Promise<Result<void, DbError>> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      let connection: MysqlConnection | null = null
      try {
        connection = await connResult.data.getConnection()
        await connection.beginTransaction()
        for (const { sql: statement, params } of statements) {
          await connection.execute(statement, params)
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

      try {
        const pageResult = await queryPageWithExecutor<T>(
          (sqlStr, params) => connResult.data.query(sqlStr, params),
          options,
        )
        return ok(pageResult)
      }
      catch (error) {
        return err({
          code: DbErrorCode.QUERY_FAILED,
          message: dbM('db_queryFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },
  }

  // =========================================================================
  // 事务操作实现
  // =========================================================================

  /**
   * 异步事务
   *
   * MySQL 推荐使用异步事务进行数据操作。
   *
   * @example
   * ```ts
   * await db.tx(async (tx) => {
   *     await tx.execute('INSERT INTO users (name) VALUES (?)', ['张三'])
   *     const users = await tx.query('SELECT * FROM users')
   *     return users
   * })
   * ```
   */
  async function tx<T>(fn: TxCallback<T>): Promise<Result<T, DbError>> {
    const connResult = ensureConnected()
    if (!connResult.success)
      return connResult

    let connection: MysqlConnection | null = null

    try {
      connection = await pool!.getConnection()

      const txOps: TxOperations = {
        async query<R>(sqlStr: string, params?: unknown[]): Promise<R[]> {
          const [rows] = await connection!.query(sqlStr, params)
          return rows as R[]
        },
        async get<R>(sqlStr: string, params?: unknown[]): Promise<R | null> {
          const [rows] = await connection!.query(sqlStr, params)
          return ((rows as R[])[0] as R) ?? null
        },
        async execute(sqlStr: string, params?: unknown[]): Promise<ExecuteResult> {
          const [result] = await connection!.execute(sqlStr, params)
          const mysqlResult = result as MysqlResult
          return {
            changes: mysqlResult.affectedRows,
            lastInsertRowid: mysqlResult.insertId,
          }
        },

        async queryPage<R>(options: PaginationQueryOptions): Promise<PaginatedResult<R>> {
          return queryPageWithExecutor<R>(
            (sqlStr, params) => connection!.query(sqlStr, params),
            options,
          )
        },
      }

      await connection.beginTransaction()
      const result = await fn(txOps)
      await connection.commit()

      return ok(result)
    }
    catch (error) {
      if (connection) {
        await connection.rollback().catch(() => { })
      }
      return err({
        code: DbErrorCode.TRANSACTION_FAILED,
        message: dbM('db_mysqlTxFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
    finally {
      if (connection) {
        connection.release()
      }
    }
  }

  // =========================================================================
  // Provider 接口实现
  // =========================================================================

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
    tx,
  }
}
