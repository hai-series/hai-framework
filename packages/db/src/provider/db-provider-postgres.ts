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
 * 注意事项：
 * - PostgreSQL 驱动是异步的
 * - 同步的 sql.query/get/execute 不可用，请使用 txAsync()
 * - DDL 操作会立即返回，但实际执行是异步的
 *
 * 适用场景：
 * - 生产环境
 * - 需要高级 SQL 功能
 * - 大规模数据处理
 *
 * @module db-provider-postgres
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
   */
  function buildColumnSql(name: string, def: ColumnDef): string {
    const parts: string[] = [name]

    // 类型映射
    if (def.primaryKey && def.autoIncrement) {
      parts.push('SERIAL')
    }
    else {
      switch (def.type) {
        case 'TEXT':
          parts.push('TEXT')
          break
        case 'INTEGER':
          parts.push('INTEGER')
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
          parts.push('TIMESTAMPTZ')
          break
        case 'JSON':
          parts.push('JSONB')
          break
        default:
          parts.push('TEXT')
      }
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
   */
  function ensureConnected(): Result<PgPool, DbError> {
    if (!pool) {
      return err({
        code: DbErrorCode.NOT_INITIALIZED,
        message: '数据库未初始化，请先调用 initDB()',
      })
    }
    return ok(pool)
  }

  /**
   * 将 ? 占位符转换为 PostgreSQL 的 $1, $2, ... 格式
   */
  function convertPlaceholders(sql: string): string {
    let index = 0
    return sql.replace(/\?/g, () => `$${++index}`)
  }

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
    createTable(tableName: string, columns: TableDef, ifNotExists = true): Result<void, DbError> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const columnDefs = Object.entries(columns)
        .map(([name, def]) => buildColumnSql(name, def))
        .join(', ')

      const ifNotExistsClause = ifNotExists ? 'IF NOT EXISTS ' : ''
      const sql = `CREATE TABLE ${ifNotExistsClause}${tableName} (${columnDefs})`

      // DDL 使用同步风格返回，但实际执行是异步的
      // 这里返回一个立即成功的结果，实际执行在后台
      pool!.query(sql).catch(() => {
        // 忽略错误，因为我们无法在同步函数中处理
      })

      return ok(undefined)
    },

    dropTable(tableName: string, ifExists = true): Result<void, DbError> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
      pool!.query(`DROP TABLE ${ifExistsClause}${tableName}`).catch(() => { })

      return ok(undefined)
    },

    addColumn(tableName: string, columnName: string, columnDef: ColumnDef): Result<void, DbError> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const colSql = buildColumnSql(columnName, columnDef)
      pool!.query(`ALTER TABLE ${tableName} ADD COLUMN ${colSql}`).catch(() => { })

      return ok(undefined)
    },

    dropColumn(tableName: string, columnName: string): Result<void, DbError> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      pool!.query(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`).catch(() => { })
      return ok(undefined)
    },

    renameTable(oldName: string, newName: string): Result<void, DbError> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      pool!.query(`ALTER TABLE ${oldName} RENAME TO ${newName}`).catch(() => { })
      return ok(undefined)
    },

    createIndex(tableName: string, indexName: string, indexDef: IndexDef): Result<void, DbError> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const uniqueClause = indexDef.unique ? 'UNIQUE ' : ''
      const columns = indexDef.columns.join(', ')
      const whereClause = indexDef.where ? ` WHERE ${indexDef.where}` : ''

      pool!.query(
        `CREATE ${uniqueClause}INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns})${whereClause}`,
      ).catch(() => { })

      return ok(undefined)
    },

    dropIndex(indexName: string, ifExists = true): Result<void, DbError> {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
      pool!.query(`DROP INDEX ${ifExistsClause}${indexName}`).catch(() => { })
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
  // SQL 操作（PostgreSQL 不支持同步模式）
  // =========================================================================

  /**
   * SQL 操作
   *
   * PostgreSQL 驱动是异步的，不支持同步的 sql 操作。
   * 请使用 txAsync() 进行数据操作。
   */
  const sql: SqlOperations = {
    query<T>(_sql: string, _params?: unknown[]): Result<T[], DbError> {
      return err({
        code: DbErrorCode.UNSUPPORTED_TYPE,
        message: 'PostgreSQL 不支持同步的 sql.query()，请使用 txAsync() 替代',
      })
    },

    get<T>(_sql: string, _params?: unknown[]): Result<T | null, DbError> {
      return err({
        code: DbErrorCode.UNSUPPORTED_TYPE,
        message: 'PostgreSQL 不支持同步的 sql.get()，请使用 txAsync() 替代',
      })
    },

    execute(_sql: string, _params?: unknown[]): Result<ExecuteResult, DbError> {
      return err({
        code: DbErrorCode.UNSUPPORTED_TYPE,
        message: 'PostgreSQL 不支持同步的 sql.execute()，请使用 txAsync() 替代',
      })
    },

    batch(_statements: Array<{ sql: string, params?: unknown[] }>): Result<void, DbError> {
      return err({
        code: DbErrorCode.UNSUPPORTED_TYPE,
        message: 'PostgreSQL 不支持同步的 sql.batch()，请使用 txAsync() 替代',
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
      message: 'PostgreSQL 不支持同步事务 tx()，请使用 txAsync() 替代',
    })
  }

  /**
   * 异步事务
   *
   * PostgreSQL 推荐使用异步事务进行数据操作。
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

    let client: PgClient | null = null

    try {
      client = await pool!.connect()

      // 创建同步风格的事务操作对象（会抛出错误提示使用 await）
      const txOps: TxOperations = {
        query<R>(_sqlStr: string, _params?: unknown[]): R[] {
          throw new Error('PostgreSQL 事务中请使用 await tx.query()')
        },

        get<R>(_sqlStr: string, _params?: unknown[]): R | null {
          throw new Error('PostgreSQL 事务中请使用 await tx.get()')
        },

        execute(_sqlStr: string, _params?: unknown[]): ExecuteResult {
          throw new Error('PostgreSQL 事务中请使用 await tx.execute()')
        },
      }

      // 提供异步版本的操作
      const asyncTxOps = {
        async query<R>(sqlStr: string, params?: unknown[]): Promise<R[]> {
          const pgSql = convertPlaceholders(sqlStr)
          const result = await client!.query(pgSql, params)
          return result.rows as R[]
        },

        async get<R>(sqlStr: string, params?: unknown[]): Promise<R | null> {
          const pgSql = convertPlaceholders(sqlStr)
          const result = await client!.query(pgSql, params)
          return (result.rows[0] as R) ?? null
        },

        async execute(sqlStr: string, params?: unknown[]): Promise<ExecuteResult> {
          const pgSql = convertPlaceholders(sqlStr)
          const result = await client!.query(pgSql, params)
          return {
            changes: result.rowCount ?? 0,
          }
        },
      }

      await client.query('BEGIN')

      // 将异步操作注入到 txOps 中（通过代理）
      const proxiedTxOps = new Proxy(txOps, {
        get(target, prop) {
          if (prop in asyncTxOps) {
            return (asyncTxOps as Record<string, unknown>)[prop as string]
          }
          return (target as unknown as Record<string, unknown>)[prop as string]
        },
      })

      const result = await fn(proxiedTxOps)
      await client.query('COMMIT')

      return ok(result)
    }
    catch (error) {
      if (client) {
        await client.query('ROLLBACK').catch(() => { })
      }
      return err({
        code: DbErrorCode.TRANSACTION_FAILED,
        message: `异步事务执行失败: ${error}`,
        cause: error,
      })
    }
    finally {
      if (client) {
        client.release()
      }
    }
  }

  // =========================================================================
  // Provider 接口实现
  // =========================================================================

  return {
    /**
     * 连接 PostgreSQL 数据库
     */
    connect(config: DbConfig): Result<void, DbError> {
      if (config.type !== 'postgresql') {
        return err({
          code: DbErrorCode.UNSUPPORTED_TYPE,
          message: 'PostgreSQL Provider 仅支持 postgresql 类型',
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
          message: `连接 PostgreSQL 失败: ${error}`,
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
