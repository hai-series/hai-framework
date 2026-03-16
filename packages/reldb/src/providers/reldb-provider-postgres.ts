/**
 * @h-ai/reldb — PostgreSQL Provider
 *
 * 基于 pg 的 PostgreSQL 数据库实现。
 * @module reldb-provider-postgres
 */

import type { Result } from '@h-ai/core'
import type { ReldbConfig } from '../reldb-config.js'
import type {
  DmlWithTxOperations,
  ReldbColumnDef,
  ReldbError,
  ReldbProvider,
  TxManager,
} from '../reldb-types.js'

import type { DdlDialect, RawExecutor } from './reldb-provider-base.js'

import { core, err, ok } from '@h-ai/core'
import { ReldbErrorCode } from '../reldb-config.js'
import { reldbM } from '../reldb-i18n.js'
import { quoteIdentifier } from '../reldb-security.js'
import {
  buildColumnSqlBase,
  buildDefaultCreateIndexSql,
  buildDefaultCreateTableSql,
  buildDefaultDropIndexSql,
  buildDefaultRenameTableSql,
  createCrudManager,
  createDdlOps,
  createSqlOps,
  createTxOps,
  createTxWrap,
  queryPageAsync,
} from './reldb-provider-base.js'

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
   * 确保数据库已连接
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
   * 将 pg 查询接口适配为 RawExecutor
   *
   * @param queryFn - pg 的 query 函数
   * @returns RawExecutor 实例
   */
  function createExecutor(
    queryFn: (text: string, values?: unknown[]) => Promise<{ rows: unknown[], rowCount: number }>,
  ): RawExecutor {
    return {
      queryRows: async (sql, params) => {
        const result = await queryFn(convertPlaceholders(sql), params)
        return result.rows
      },
      getRow: async (sql, params) => {
        const result = await queryFn(convertPlaceholders(sql), params)
        return result.rows[0]
      },
      executeStmt: async (sql, params) => {
        const result = await queryFn(convertPlaceholders(sql), params)
        return { changes: result.rowCount ?? 0 }
      },
      batchStmts: async (statements) => {
        for (const { sql: statement, params } of statements) {
          await queryFn(convertPlaceholders(statement), params)
        }
      },
      queryPage: options => queryPageAsync(
        async (sql, params) => {
          const result = await queryFn(convertPlaceholders(sql), params)
          return result.rows
        },
        options,
      ),
    }
  }

  /** 错误消息生成 */
  function pgErrorMessage(detail: string): string {
    return reldbM('reldb_queryFailed', { params: { error: detail } })
  }

  /** 事务错误消息生成 */
  function pgTxErrorMessage(detail: string): string {
    return reldbM('reldb_postgresTxFailed', { params: { error: detail } })
  }

  /**
   * 获取 RawExecutor（含连接检查）
   */
  function getExecutor(): Result<RawExecutor, ReldbError> {
    const connResult = ensureConnected()
    if (!connResult.success)
      return connResult
    return ok(createExecutor((text, values) => connResult.data.query(text, values)))
  }

  // ─── PostgreSQL 方言 ───

  /** PostgreSQL 列类型映射 */
  function mapPgType(def: ReldbColumnDef): string {
    switch (def.type) {
      case 'TEXT':
        return 'TEXT'
      case 'INTEGER':
        return def.autoIncrement ? 'BIGSERIAL' : 'INTEGER'
      case 'REAL':
        return 'DOUBLE PRECISION'
      case 'BLOB':
        return 'BYTEA'
      case 'BOOLEAN':
        return 'BOOLEAN'
      case 'TIMESTAMP':
        return 'TIMESTAMP'
      case 'JSON':
        return 'JSONB'
      default:
        return 'TEXT'
    }
  }

  const pgDialect: DdlDialect = {
    quoteId: quoteIdentifier,
    buildColumnSql: (name, def) => buildColumnSqlBase(name, def, {
      quoteId: quoteIdentifier,
      mapType: mapPgType,
      inlinePrimaryKey: true,
      formatDefault: (d) => {
        if (d.defaultValue === undefined)
          return undefined
        if (typeof d.defaultValue === 'string'
          && (d.defaultValue === 'NOW()' || d.defaultValue === 'CURRENT_TIMESTAMP')) {
          return `DEFAULT ${d.defaultValue}`
        }
        return undefined // 走通用逻辑
      },
    }),
    buildCreateTableSql: (quotedTable, columns, ifNotExists) =>
      buildDefaultCreateTableSql(pgDialect, quotedTable, columns, ifNotExists),
    buildRenameTableSql: buildDefaultRenameTableSql,
    buildCreateIndexSql: (quotedTable, quotedIndex, indexDef) =>
      buildDefaultCreateIndexSql(pgDialect, quotedTable, quotedIndex, indexDef),
    buildDropIndexSql: async (indexName, ifExists) =>
      buildDefaultDropIndexSql(pgDialect, indexName, ifExists),
  }

  // ─── DDL / SQL / CRUD ───

  const ddl = createDdlOps({
    ensureReady: () => {
      const r = ensureConnected()
      return r.success ? ok(undefined) : r
    },
    executeDdl: async (sqlStr) => {
      await pool!.query(sqlStr)
    },
    dialect: pgDialect,
  })

  const sql = createSqlOps({
    getExecutor,
    errorMessage: pgErrorMessage,
    batch: async (statements) => {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      let client: PgClient | null = null
      try {
        client = await connResult.data.connect()
        await client.query('BEGIN')
        const clientExec = createExecutor((text, values) => client!.query(text, values))
        await clientExec.batchStmts(statements)
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
  })

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
  async function beginTransaction(): Promise<Result<DmlWithTxOperations, ReldbError>> {
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
        message: pgTxErrorMessage(String(error)),
        cause: error,
      })
    }

    const clientExec = createExecutor((text, values) => client!.query(text, values))
    return ok(createTxOps(clientExec, {
      commit: async () => { await client!.query('COMMIT') },
      rollback: async () => { await client!.query('ROLLBACK') },
      release: () => client!.release(),
      errorMessage: pgTxErrorMessage,
    }))
  }

  const tx: TxManager = {
    begin: beginTransaction,
    wrap: createTxWrap(beginTransaction, pgTxErrorMessage),
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
