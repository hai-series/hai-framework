/**
 * @h-ai/reldb — PostgreSQL Provider
 *
 * 基于 pg 的 PostgreSQL 数据库实现。
 * 按 Context + wrapOp → Factory 模式实现。
 * @module reldb-provider-postgres
 */

import type { PaginatedResult, Result } from '@h-ai/core'
import type { ReldbConfig } from '../reldb-config.js'
import type {
  DdlOperations,
  DmlOperations,
  DmlWithTxOperations,
  ExecuteResult,
  PaginationQueryOptions,
  ReldbColumnDef,
  ReldbError,
  ReldbProvider,
} from '../reldb-types.js'
import type { ReldbOpsContext } from './reldb-provider-base.js'

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
} from './reldb-ddl-builder.js'
import { createBaseCrudManager, createBaseDdlOps, createBaseDmlOps, createBaseTxManager, queryPageAsync } from './reldb-provider-base.js'
import { createTxHandle } from './reldb-tx-assembler.js'

const logger = core.logger.child({ module: 'reldb', scope: 'postgres' })

function findPrevNonWhitespaceChar(sql: string, start: number): string | null {
  for (let i = start; i >= 0; i--) {
    const ch = sql[i]
    if (!/\s/.test(ch)) {
      return ch
    }
  }
  return null
}

function findNextNonWhitespaceChar(sql: string, start: number): string | null {
  for (let i = start; i < sql.length; i++) {
    const ch = sql[i]
    if (!/\s/.test(ch)) {
      return ch
    }
  }
  return null
}

function matchDollarTag(sql: string, start: number): string | null {
  if (sql[start] !== '$')
    return null

  const end = sql.indexOf('$', start + 1)
  if (end === -1)
    return null

  const tag = sql.slice(start, end + 1)
  if (tag === '$$')
    return tag

  const body = tag.slice(1, -1)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(body))
    return null

  return tag
}

function isPgQuestionOperator(sql: string, index: number): boolean {
  const prev = findPrevNonWhitespaceChar(sql, index - 1)
  const next = findNextNonWhitespaceChar(sql, index + 1)

  // PG JSON/JSONB 操作符：?、?|、?&、??（以及紧邻这些符号的变体）
  if (next === '|' || next === '&' || next === '?')
    return true
  if (prev === '|' || prev === '&' || prev === '?')
    return true

  // 常见形式：metadata ? 'key'
  if (next === '\'' || next === '"')
    return true

  return false
}

/**
 * 将 ? 占位符转换为 PostgreSQL 的 $1, $2, ... 格式
 *
 * 仅转换参数占位符：
 * - 跳过字符串字面量、标识符引用、注释、Dollar-Quoted 字符串
 * - 跳过 PostgreSQL 的 ? 系列操作符（如 ?| / ?&）
 * - 最多替换 placeholderCount 个，避免误替换无关的 ?
 */
export function convertPostgresPlaceholders(sql: string, placeholderCount = Number.POSITIVE_INFINITY): string {
  if (!Number.isFinite(placeholderCount) || placeholderCount <= 0)
    return sql

  let index = 0
  let converted = 0
  let result = ''
  let dollarTag: string | null = null
  let inSingleQuote = false
  let inDoubleQuote = false
  let inLineComment = false
  let inBlockComment = false

  while (index < sql.length) {
    const ch = sql[index]
    const next = sql[index + 1]

    if (inSingleQuote) {
      result += ch
      if (ch === '\'' && next === '\'') {
        result += next
        index += 2
        continue
      }
      if (ch === '\'')
        inSingleQuote = false
      index++
      continue
    }

    if (inDoubleQuote) {
      result += ch
      if (ch === '"' && next === '"') {
        result += next
        index += 2
        continue
      }
      if (ch === '"')
        inDoubleQuote = false
      index++
      continue
    }

    if (inLineComment) {
      result += ch
      if (ch === '\n')
        inLineComment = false
      index++
      continue
    }

    if (inBlockComment) {
      result += ch
      if (ch === '*' && next === '/') {
        result += next
        index += 2
        inBlockComment = false
        continue
      }
      index++
      continue
    }

    if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        result += dollarTag
        index += dollarTag.length
        dollarTag = null
        continue
      }
      result += ch
      index++
      continue
    }

    if (ch === '\'' ) {
      inSingleQuote = true
      result += ch
      index++
      continue
    }

    if (ch === '"') {
      inDoubleQuote = true
      result += ch
      index++
      continue
    }

    if (ch === '-' && next === '-') {
      inLineComment = true
      result += ch + next
      index += 2
      continue
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true
      result += ch + next
      index += 2
      continue
    }

    if (ch === '$') {
      const tag = matchDollarTag(sql, index)
      if (tag) {
        dollarTag = tag
        result += tag
        index += tag.length
        continue
      }
    }

    if (ch === '?') {
      if (converted < placeholderCount && !isPgQuestionOperator(sql, index)) {
        converted++
        result += `$${converted}`
      }
      else {
        result += ch
      }
      index++
      continue
    }

    result += ch
    index++
  }

  return result
}

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

  // ─── 操作上下文 ───

  const ctx: ReldbOpsContext = {
    isConnected: () => pool !== null,
    logger,
  }

  // ─── 辅助函数 ───

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
    const result = await queryFn(convertPostgresPlaceholders(sql, params?.length ?? 0), params)
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
    async query<T>(sql: string, params?: unknown[]): Promise<Result<T[], ReldbError>> {
      const rows = await pgQueryRows((t, v) => pool!.query(t, v), sql, params)
      return ok(rows as T[])
    },
    async get<T>(sql: string, params?: unknown[]): Promise<Result<T | null, ReldbError>> {
      const rows = await pgQueryRows((t, v) => pool!.query(t, v), sql, params)
      return ok((rows[0] as T) ?? null)
    },
    async execute(sql: string, params?: unknown[]): Promise<Result<ExecuteResult, ReldbError>> {
      const result = await pool!.query(convertPostgresPlaceholders(sql, params?.length ?? 0), params)
      return ok({ changes: result.rowCount ?? 0 })
    },
    async batch(statements) {
      let client: PgClient | null = null
      try {
        client = await pool!.connect()
        await client.query('BEGIN')
        for (const { sql: s, params } of statements) {
          await client.query(convertPostgresPlaceholders(s, params?.length ?? 0), params)
        }
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
      const result = await queryPageAsync<T>(
        async (sql, params) => {
          const r = await pool!.query(convertPostgresPlaceholders(sql, params?.length ?? 0), params)
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
      async query<T>(sql: string, params?: unknown[]): Promise<Result<T[], ReldbError>> {
        const rows = await pgQueryRows(queryFn, sql, params)
        return ok(rows as T[])
      },
      async get<T>(sql: string, params?: unknown[]): Promise<Result<T | null, ReldbError>> {
        const rows = await pgQueryRows(queryFn, sql, params)
        return ok((rows[0] as T) ?? null)
      },
      async execute(sql: string, params?: unknown[]): Promise<Result<ExecuteResult, ReldbError>> {
        const result = await queryFn(convertPostgresPlaceholders(sql, params?.length ?? 0), params)
        return ok({ changes: result.rowCount ?? 0 })
      },
      async batch(statements) {
        for (const { sql: s, params } of statements) {
          await queryFn(convertPostgresPlaceholders(s, params?.length ?? 0), params)
        }
        return ok(undefined)
      },
      async queryPage<T>(options: PaginationQueryOptions): Promise<Result<PaginatedResult<T>, ReldbError>> {
        const result = await queryPageAsync<T>(
          async (sql, params) => {
            const r = await queryFn(convertPostgresPlaceholders(sql, params?.length ?? 0), params)
            return r.rows
          },
          options,
        )
        return ok(result)
      },
    }
  }

  async function beginTx(): Promise<Result<DmlWithTxOperations, ReldbError>> {
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

    const txDmlOps = createPgTxDmlOps(client)
    return ok(createTxHandle(txDmlOps, {
      commit: async () => { await client!.query('COMMIT') },
      rollback: async () => { await client!.query('ROLLBACK') },
      release: () => client!.release(),
      errorMessage: pgTxErrorMessage,
    }))
  }

  // ─── 组装 Provider ───

  const dmlOps = createBaseDmlOps(ctx, rawDml)

  return {
    async connect(config: ReldbConfig): Promise<Result<void, ReldbError>> {
      if (config.type !== 'postgresql') {
        return err({
          code: ReldbErrorCode.UNSUPPORTED_TYPE,
          message: reldbM('reldb_postgresOnlyPostgresql'),
        })
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
    },

    async close(): Promise<Result<void, ReldbError>> {
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
    },

    isConnected: () => ctx.isConnected(),
    ddl: createBaseDdlOps(ctx, rawDdl),
    sql: dmlOps,
    crud: createBaseCrudManager(dmlOps),
    tx: createBaseTxManager(ctx, beginTx),
  }
}
