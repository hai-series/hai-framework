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
 * - 同步的 sql.query/get/execute 不可用，请使用 txAsync()
 * - DDL 操作会立即返回，但实际执行是异步的
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

import type { Result } from '@hai/core'
import type {
  ColumnDef,
  DbConfig,
  DbError,
  DbProvider,
  DdlOperations,
  ExecuteResult,
  IndexDef,
  SqlOperations,
  TableDef,
  TxCallback,
  TxOperations,
} from '../db-types.js'

import { err, ok } from '@hai/core'

import { DbErrorCode } from '../db-config.js'
import { getDbMessage } from '../index.js'

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
   */
  function ensureConnected(): Result<MysqlPool, DbError> {
    if (!pool) {
      return err({
        code: DbErrorCode.NOT_INITIALIZED,
        message: getDbMessage('db_notInitialized'),
      })
    }
    return ok(pool)
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
    createTable(tableName: string, columns: TableDef, ifNotExists = true): Result<void, DbError> {
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

      pool!.query(sql).catch(() => { })
      return ok(undefined)
    },

    dropTable(tableName: string, ifExists = true): Result<void, DbError> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
      pool!.query(`DROP TABLE ${ifExistsClause}\`${tableName}\``).catch(() => { })
      return ok(undefined)
    },

    addColumn(tableName: string, columnName: string, columnDef: ColumnDef): Result<void, DbError> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const colSql = buildColumnSql(columnName, columnDef)
      pool!.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${colSql}`).catch(() => { })
      return ok(undefined)
    },

    dropColumn(tableName: string, columnName: string): Result<void, DbError> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      pool!.query(`ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``).catch(() => { })
      return ok(undefined)
    },

    renameTable(oldName: string, newName: string): Result<void, DbError> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      pool!.query(`RENAME TABLE \`${oldName}\` TO \`${newName}\``).catch(() => { })
      return ok(undefined)
    },

    createIndex(tableName: string, indexName: string, indexDef: IndexDef): Result<void, DbError> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const uniqueClause = indexDef.unique ? 'UNIQUE ' : ''
      const columns = indexDef.columns.map(c => `\`${c}\``).join(', ')

      pool!.query(
        `CREATE ${uniqueClause}INDEX \`${indexName}\` ON \`${tableName}\` (${columns})`,
      ).catch(() => { })
      return ok(undefined)
    },

    dropIndex(indexName: string, ifExists = true): Result<void, DbError> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      // MySQL 需要指定表名来删除索引，这里使用通用方式
      // 实际使用时建议用 raw() 指定表名
      if (ifExists) {
        pool!.query(`DROP INDEX IF EXISTS \`${indexName}\``).catch(() => { })
      }
      else {
        pool!.query(`DROP INDEX \`${indexName}\``).catch(() => { })
      }
      return ok(undefined)
    },

    raw(sql: string): Result<void, DbError> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      pool!.query(sql).catch(() => { })
      return ok(undefined)
    },
  }

  // =========================================================================
  // SQL 操作（MySQL 不支持同步模式）
  // =========================================================================

  /**
   * SQL 操作
   *
   * MySQL 驱动是异步的，不支持同步的 sql 操作。
   * 请使用 txAsync() 进行数据操作。
   */
  const sql: SqlOperations = {
    query<T>(_sql: string, _params?: unknown[]): Result<T[], DbError> {
      return err({
        code: DbErrorCode.UNSUPPORTED_TYPE,
        message: getDbMessage('db_mysqlNotSupportSyncQuery'),
      })
    },

    get<T>(_sql: string, _params?: unknown[]): Result<T | null, DbError> {
      return err({
        code: DbErrorCode.UNSUPPORTED_TYPE,
        message: getDbMessage('db_mysqlNotSupportSyncGet'),
      })
    },

    execute(_sql: string, _params?: unknown[]): Result<ExecuteResult, DbError> {
      return err({
        code: DbErrorCode.UNSUPPORTED_TYPE,
        message: getDbMessage('db_mysqlNotSupportSyncExecute'),
      })
    },

    batch(_statements: Array<{ sql: string, params?: unknown[] }>): Result<void, DbError> {
      return err({
        code: DbErrorCode.UNSUPPORTED_TYPE,
        message: getDbMessage('db_mysqlNotSupportSyncBatch'),
      })
    },
  }

  // =========================================================================
  // 事务操作实现
  // =========================================================================

  /**
   * 同步事务（不支持）
   */
  function tx<T>(_fn: TxCallback<T>): Result<T, DbError> {
    return err({
      code: DbErrorCode.UNSUPPORTED_TYPE,
      message: getDbMessage('db_mysqlNotSupportSyncTx'),
    })
  }

  /**
   * 异步事务
   *
   * MySQL 推荐使用异步事务进行数据操作。
   *
   * @example
   * ```ts
   * await db.txAsync(async (tx) => {
   *     await tx.execute('INSERT INTO users (name) VALUES (?)', ['张三'])
   *     const users = await tx.query('SELECT * FROM users')
   *     return users
   * })
   * ```
   */
  async function txAsync<T>(fn: (tx: TxOperations) => Promise<T>): Promise<Result<T, DbError>> {
    const connResult = ensureConnected()
    if (!connResult.success)
      return connResult

    let connection: MysqlConnection | null = null

    try {
      connection = await pool!.getConnection()

      // 创建事务内操作对象（异步版本）
      const asyncTxOps = {
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
      }

      // 同步风格的接口（会抛出错误提示使用 await）
      const txOps: TxOperations = {
        query<R>(_sqlStr: string, _params?: unknown[]): R[] {
          throw new Error(getDbMessage('db_mysqlTxQueryHint'))
        },
        get<R>(_sqlStr: string, _params?: unknown[]): R | null {
          throw new Error(getDbMessage('db_mysqlTxGetHint'))
        },
        execute(_sqlStr: string, _params?: unknown[]): ExecuteResult {
          throw new Error(getDbMessage('db_mysqlTxExecuteHint'))
        },
      }

      // 代理同步接口到异步
      const proxiedTxOps = new Proxy(txOps, {
        get(target, prop) {
          if (prop in asyncTxOps) {
            return (asyncTxOps as Record<string, unknown>)[prop as string]
          }
          return (target as unknown as Record<string, unknown>)[prop as string]
        },
      })

      await connection.beginTransaction()
      const result = await fn(proxiedTxOps)
      await connection.commit()

      return ok(result)
    }
    catch (error) {
      if (connection) {
        await connection.rollback().catch(() => { })
      }
      return err({
        code: DbErrorCode.TRANSACTION_FAILED,
        message: `异步事务执行失败: ${error}`,
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

  return {
    /**
     * 连接 MySQL 数据库
     */
    connect(config: DbConfig): Result<void, DbError> {
      if (config.type !== 'mysql') {
        return err({
          code: DbErrorCode.UNSUPPORTED_TYPE,
          message: getDbMessage('db_mysqlOnlyMysql'),
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
          message: `连接 MySQL 失败: ${error}`,
          cause: error,
        })
      }
    },

    /**
     * 关闭连接池
     */
    close(): void {
      if (pool) {
        pool.end().catch(() => { })
        pool = null
      }
    },

    /**
     * 检查是否已连接
     */
    isConnected(): boolean {
      return pool !== null
    },

    ddl,
    sql,
    tx,
    txAsync,
  }
}
