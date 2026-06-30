/**
 * @h-ai/reldb — PostgreSQL Provider
 *
 * 基于 pg 的 PostgreSQL 数据库实现。
 * 按 Context + wrapOp → Factory 模式实现。
 * @module reldb-provider-postgres
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { ReldbConfig } from '../reldb-config.js'
import type {
  DdlOperations,
  DmlOperations,
  DmlWithTxOperations,
  ExecuteResult,
  PaginationQueryOptions,
  ReldbColumnDef,
  ReldbProvider,
} from '../reldb-types.js'
import type { ReldbOpsContext } from './reldb-provider-base.js'

import { core, err, ok } from '@h-ai/core'
import { reldbM } from '../reldb-i18n.js'
import { quoteIdentifier } from '../reldb-security.js'
import { HaiReldbError } from '../reldb-types.js'
import {
  buildColumnSqlBase,
  buildDefaultCreateIndexSql,
  buildDefaultCreateTableSql,
  buildDefaultDropIndexSql,
  buildDefaultRenameTableSql,
} from './reldb-ddl-builder.js'
import { createBaseCrudManager, createBaseDdlOps, createBaseDmlOps, createBaseTxManager, queryPageAsync } from './reldb-provider-base.js'
import { createTxHandle } from './reldb-tx-assembler.js'

const logger = core.logger.child({ module: 'reldb', scope: 'postgres' })

/** PostgreSQL 美元引号起始标记匹配（提至模块作用域避免每次调用重建） */
const PG_DOLLAR_TAG_REGEX = /^\$([A-Z_]\w*)?\$/i

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
  let currentConfig: ReldbConfig | null = null

  // ─── 操作上下文 ───

  const ctx: ReldbOpsContext = {
    isConnected: () => pool !== null,
    logger,
    operationLog: () => currentConfig?.operationLog,
  }

  // ─── 辅助函数 ───

  /**
   * 将 ? 占位符转换为 PostgreSQL 的 $1, $2, ... 格式
   *
   * 需要跳过字符串字面量（单/双引号）、美元引号块（$tag$...$tag$）以及行/块注释中的 `?`，
   * 避免 `SELECT 'a?b' WHERE x=?` 被错误重写为 `SELECT 'a$1' WHERE x=$2`。
   */
  function convertPlaceholders(sql: string): string {
    let out = ''
    let index = 0
    let i = 0
    const len = sql.length

    while (i < len) {
      const ch = sql[i]

      // 单引号字符串（含 SQL 标准 '' 转义）
      if (ch === '\'') {
        out += ch
        i++
        while (i < len) {
          const c = sql[i]
          out += c
          i++
          if (c === '\'') {
            if (sql[i] === '\'') {
              out += sql[i]
              i++
              continue
            }
            break
          }
        }
        continue
      }

      // 双引号标识符（含 "" 转义）
      if (ch === '"') {
        out += ch
        i++
        while (i < len) {
          const c = sql[i]
          out += c
          i++
          if (c === '"') {
            if (sql[i] === '"') {
              out += sql[i]
              i++
              continue
            }
            break
          }
        }
        continue
      }

      // PostgreSQL 美元引号：$tag$ ... $tag$ 或 $$ ... $$
      if (ch === '$') {
        const tagMatch = sql.slice(i).match(PG_DOLLAR_TAG_REGEX)
        if (tagMatch) {
          const tag = tagMatch[0]
          const end = sql.indexOf(tag, i + tag.length)
          if (end === -1) {
            out += sql.slice(i)
            i = len
          }
          else {
            out += sql.slice(i, end + tag.length)
            i = end + tag.length
          }
          continue
        }
      }

      // 单行注释 -- ... \n
      if (ch === '-' && sql[i + 1] === '-') {
        const nl = sql.indexOf('\n', i)
        if (nl === -1) {
          out += sql.slice(i)
          i = len
        }
        else {
          out += sql.slice(i, nl + 1)
          i = nl + 1
        }
        continue
      }

      // 块注释 /* ... */（支持简单嵌套处理：按首个结束标记终止）
      if (ch === '/' && sql[i + 1] === '*') {
        const endIdx = sql.indexOf('*/', i + 2)
        if (endIdx === -1) {
          out += sql.slice(i)
          i = len
        }
        else {
          out += sql.slice(i, endIdx + 2)
          i = endIdx + 2
        }
        continue
      }

      // 占位符替换
      if (ch === '?') {
        out += `$${++index}`
        i++
        continue
      }

      out += ch
      i++
    }

    return out
  }

  /** 事务错误消息生成 */
  function pgTxErrorMessage(detail: string): string {
    return reldbM('reldb_postgresTxFailed', { params: { error: detail } })
  }

  // ─── PostgreSQL 方言辅助 ───

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

  /** PostgreSQL buildColumnSql */
  function pgBuildColumnSql(name: string, def: ReldbColumnDef): string {
    return buildColumnSqlBase(name, def, {
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
    })
  }

  /** 通用 pg queryFn → rows 适配 */
  async function pgQueryRows(
    queryFn: (text: string, values?: unknown[]) => Promise<{ rows: unknown[], rowCount: number }>,
    sql: string,
    params?: unknown[],
  ): Promise<unknown[]> {
    const result = await queryFn(convertPlaceholders(sql), params)
    return result.rows
  }

  // ─── DDL 操作 ───

  const rawDdl: DdlOperations = {
    async createTable(name, columns, ifNotExists = true) {
      const quotedTable = quoteIdentifier(name)
      const sql = buildDefaultCreateTableSql(pgBuildColumnSql, quotedTable, columns, ifNotExists)
      await pool!.query(sql)
      return ok(undefined)
    },
    async dropTable(name, ifExists) {
      const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
      await pool!.query(`DROP TABLE ${ifExistsClause}${quoteIdentifier(name)}`)
      return ok(undefined)
    },
    async addColumn(table, column, def) {
      const colSql = pgBuildColumnSql(column, def)
      await pool!.query(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${colSql}`)
      return ok(undefined)
    },
    async dropColumn(table, column) {
      await pool!.query(`ALTER TABLE ${quoteIdentifier(table)} DROP COLUMN ${quoteIdentifier(column)}`)
      return ok(undefined)
    },
    async renameTable(oldName, newName) {
      await pool!.query(buildDefaultRenameTableSql(quoteIdentifier(oldName), quoteIdentifier(newName)))
      return ok(undefined)
    },
    async createIndex(table, index, def) {
      const sql = buildDefaultCreateIndexSql(quoteIdentifier, quoteIdentifier(table), quoteIdentifier(index), def)
      await pool!.query(sql)
      return ok(undefined)
    },
    async dropIndex(index, ifExists = true) {
      const sql = buildDefaultDropIndexSql(quoteIdentifier, index, ifExists)
      await pool!.query(sql)
      return ok(undefined)
    },
    async raw(sql) {
      await pool!.query(sql)
      return ok(undefined)
    },
  }

  // ─── DML 操作 ───

  const rawDml: DmlOperations = {
    async query<T>(sql: string, params?: unknown[]): Promise<HaiResult<T[]>> {
      const rows = await pgQueryRows((t, v) => pool!.query(t, v), sql, params)
      return ok(rows as T[])
    },
    async get<T>(sql: string, params?: unknown[]): Promise<HaiResult<T | null>> {
      const rows = await pgQueryRows((t, v) => pool!.query(t, v), sql, params)
      return ok((rows[0] as T) ?? null)
    },
    async execute(sql: string, params?: unknown[]): Promise<HaiResult<ExecuteResult>> {
      const result = await pool!.query(convertPlaceholders(sql), params)
      return ok({ changes: result.rowCount ?? 0 })
    },
    async batch(statements) {
      let client: PgClient | null = null
      try {
        client = await pool!.connect()
        await client.query('BEGIN')
        for (const { sql: s, params } of statements) {
          await client.query(convertPlaceholders(s), params)
        }
        await client.query('COMMIT')
        return ok(undefined)
      }
      catch (error) {
        if (client) {
          await client.query('ROLLBACK').catch(() => { })
        }
        return err(HaiReldbError.QUERY_FAILED, reldbM('reldb_batchFailed', { params: { error: String(error) } }), error)
      }
      finally {
        if (client) {
          client.release()
        }
      }
    },
    async queryPage<T>(options: PaginationQueryOptions): Promise<HaiResult<PaginatedResult<T>>> {
      const result = await queryPageAsync<T>(
        async (sql, params) => {
          const r = await pool!.query(convertPlaceholders(sql), params)
          return r.rows
        },
        options,
      )
      return ok(result)
    },
  }

  // ─── 事务 ───

  /** 创建事务连接上的 DML 操作 */
  function createPgTxDmlOps(client: PgClient): DmlOperations {
    const queryFn = (text: string, values?: unknown[]) => client.query(text, values)
    return {
      async query<T>(sql: string, params?: unknown[]): Promise<HaiResult<T[]>> {
        const rows = await pgQueryRows(queryFn, sql, params)
        return ok(rows as T[])
      },
      async get<T>(sql: string, params?: unknown[]): Promise<HaiResult<T | null>> {
        const rows = await pgQueryRows(queryFn, sql, params)
        return ok((rows[0] as T) ?? null)
      },
      async execute(sql: string, params?: unknown[]): Promise<HaiResult<ExecuteResult>> {
        const result = await queryFn(convertPlaceholders(sql), params)
        return ok({ changes: result.rowCount ?? 0 })
      },
      async batch(statements) {
        for (const { sql: s, params } of statements) {
          await queryFn(convertPlaceholders(s), params)
        }
        return ok(undefined)
      },
      async queryPage<T>(options: PaginationQueryOptions): Promise<HaiResult<PaginatedResult<T>>> {
        const result = await queryPageAsync<T>(
          async (sql, params) => {
            const r = await queryFn(convertPlaceholders(sql), params)
            return r.rows
          },
          options,
        )
        return ok(result)
      },
    }
  }

  async function beginTx(): Promise<HaiResult<DmlWithTxOperations>> {
    let client: PgClient | null = null

    try {
      client = await pool!.connect()
      await client.query('BEGIN')
    }
    catch (error) {
      if (client) {
        client.release()
      }
      return err(HaiReldbError.TRANSACTION_FAILED, pgTxErrorMessage(String(error)), error)
    }

    const txDmlOps = createPgTxDmlOps(client)
    const guardedTxDmlOps = createBaseDmlOps(ctx, txDmlOps)
    return ok(createTxHandle(guardedTxDmlOps, {
      commit: async () => { await client!.query('COMMIT') },
      rollback: async () => { await client!.query('ROLLBACK') },
      release: () => client!.release(),
      errorMessage: pgTxErrorMessage,
    }))
  }

  // ─── 组装 Provider ───

  const dmlOps = createBaseDmlOps(ctx, rawDml)

  return {
    async connect(config: ReldbConfig): Promise<HaiResult<void>> {
      if (config.type !== 'postgresql') {
        return err(HaiReldbError.UNSUPPORTED_TYPE, reldbM('reldb_postgresOnlyPostgresql'))
      }
      try {
        // eslint-disable-next-line ts/no-require-imports -- 按需加载
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

        currentConfig = config
        logger.info('Connected to PostgreSQL', { host: config.host, port: config.port, database: config.database })
        return ok(undefined)
      }
      catch (error) {
        currentConfig = null
        pool = null
        return err(HaiReldbError.CONNECTION_FAILED, reldbM('reldb_postgresConnectionFailed', { params: { error: String(error) } }), error)
      }
    },

    async close(): Promise<HaiResult<void>> {
      if (pool) {
        try {
          await pool.end()
        }
        catch (error) {
          currentConfig = null
          pool = null
          return err(HaiReldbError.CONNECTION_FAILED, reldbM('reldb_postgresConnectionFailed', { params: { error: String(error) } }), error)
        }
        currentConfig = null
        pool = null
        logger.info('Disconnected from PostgreSQL')
      }
      return ok(undefined)
    },

    isConnected: () => ctx.isConnected(),
    ddl: createBaseDdlOps(ctx, rawDdl),
    sql: dmlOps,
    crud: createBaseCrudManager(dmlOps),
    tx: createBaseTxManager(ctx, beginTx),
  }
}
