/**
 * @h-ai/reldb — SQLite Provider
 *
 * 基于 better-sqlite3 的 SQLite 数据库实现。
 * 按 Context + wrapOp → Factory 模式实现。
 * @module reldb-provider-sqlite
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type Database from 'better-sqlite3'
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

import { createRequire } from 'node:module'

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

const require = createRequire(import.meta.url)

const logger = core.logger.child({ module: 'reldb', scope: 'sqlite' })

// ─── SQLite Provider 实现 ───

/**
 * 创建 SQLite Provider 实例
 *
 * @returns SQLite Provider
 */
export function createSqliteProvider(): ReldbProvider {
  /** 数据库实例 */
  let database: Database.Database | null = null
  /** 串行化 SQLite 事务，避免并发 BEGIN 导致 "cannot start a transaction within a transaction" */
  let txChain: Promise<void> = Promise.resolve()

  /** 事务锁获取超时（毫秒），防止永久阻塞 */
  const TX_LOCK_TIMEOUT_MS = 30_000

  /**
   * 获取事务锁，带超时保护
   *
   * 当锁等待超过 TX_LOCK_TIMEOUT_MS 时抛出超时错误，防止无限阻塞。
   */
  async function acquireTxLock(): Promise<() => void> {
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const prev = txChain
    txChain = txChain.then(() => current)

    // 带超时的等待
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // 超时后释放锁链，避免后续事务也阻塞
        release()
        reject(new Error(`SQLite transaction lock acquisition timed out after ${TX_LOCK_TIMEOUT_MS}ms`))
      }, TX_LOCK_TIMEOUT_MS)
    })

    try {
      await Promise.race([prev, timeoutPromise])
    }
    finally {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
    }

    return release
  }

  // ─── 操作上下文 ───

  const ctx: ReldbOpsContext = {
    isConnected: () => database !== null && database.open,
    logger,
  }

  // ─── SQLite 方言辅助 ───

  /** SQLite 列类型映射 */
  function mapSqliteType(def: ReldbColumnDef): string {
    switch (def.type) {
      case 'TEXT':
      case 'JSON':
        return 'TEXT'
      case 'INTEGER':
      case 'BOOLEAN':
        return 'INTEGER'
      case 'REAL':
        return 'REAL'
      case 'BLOB':
        return 'BLOB'
      case 'TIMESTAMP':
        return 'INTEGER' // Unix timestamp
      default:
        return 'TEXT'
    }
  }

  /** SQLite buildColumnSql */
  function sqliteBuildColumnSql(name: string, def: ReldbColumnDef): string {
    return buildColumnSqlBase(name, def, {
      quoteId: quoteIdentifier,
      mapType: mapSqliteType,
      inlinePrimaryKey: true,
      extraConstraints: (d) => {
        const extras: string[] = []
        if (d.primaryKey && d.autoIncrement)
          extras.push('AUTOINCREMENT')
        return extras
      },
    })
  }

  /** 事务错误消息生成 */
  function sqliteTxErrorMessage(detail: string): string {
    return reldbM('reldb_sqliteTxFailed', { params: { error: detail } })
  }

  // ─── DDL 操作 ───

  const rawDdl: DdlOperations = {
    async createTable(name, columns, ifNotExists = true) {
      const quotedTable = quoteIdentifier(name)
      const sql = buildDefaultCreateTableSql(sqliteBuildColumnSql, quotedTable, columns, ifNotExists)
      database!.exec(sql)
      return ok(undefined)
    },
    async dropTable(name, ifExists) {
      const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
      database!.exec(`DROP TABLE ${ifExistsClause}${quoteIdentifier(name)}`)
      return ok(undefined)
    },
    async addColumn(table, column, def) {
      const colSql = sqliteBuildColumnSql(column, def)
      database!.exec(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${colSql}`)
      return ok(undefined)
    },
    async dropColumn(table, column) {
      database!.exec(`ALTER TABLE ${quoteIdentifier(table)} DROP COLUMN ${quoteIdentifier(column)}`)
      return ok(undefined)
    },
    async renameTable(oldName, newName) {
      database!.exec(buildDefaultRenameTableSql(quoteIdentifier(oldName), quoteIdentifier(newName)))
      return ok(undefined)
    },
    async createIndex(table, index, def) {
      const sql = buildDefaultCreateIndexSql(quoteIdentifier, quoteIdentifier(table), quoteIdentifier(index), def)
      database!.exec(sql)
      return ok(undefined)
    },
    async dropIndex(index, ifExists = true) {
      const sql = buildDefaultDropIndexSql(quoteIdentifier, index, ifExists)
      database!.exec(sql)
      return ok(undefined)
    },
    async raw(sql) {
      database!.exec(sql)
      return ok(undefined)
    },
  }

  // ─── DML 操作 ───

  const rawDml: DmlOperations = {
    async query<T>(sql: string, params?: unknown[]): Promise<HaiResult<T[]>> {
      const stmt = database!.prepare(sql)
      const rows = params ? stmt.all(...params) : stmt.all()
      return ok(rows as T[])
    },
    async get<T>(sql: string, params?: unknown[]): Promise<HaiResult<T | null>> {
      const stmt = database!.prepare(sql)
      const row = params ? stmt.get(...params) : stmt.get()
      return ok((row as T) ?? null)
    },
    async execute(sql: string, params?: unknown[]): Promise<HaiResult<ExecuteResult>> {
      const stmt = database!.prepare(sql)
      const result = params ? stmt.run(...params) : stmt.run()
      return ok({ changes: result.changes, lastInsertRowid: result.lastInsertRowid })
    },
    async batch(statements) {
      const releaseTxLock = await acquireTxLock()
      try {
        const db = database!
        const transaction = db.transaction(() => {
          for (const { sql: s, params } of statements) {
            const stmt = db.prepare(s)
            if (params)
              stmt.run(...params)
            else stmt.run()
          }
        })
        transaction()
        return ok(undefined)
      }
      catch (error) {
        return err(HaiReldbError.QUERY_FAILED, reldbM('reldb_sqliteBatchFailed', { params: { error: String(error) } }), error)
      }
      finally {
        releaseTxLock()
      }
    },
    async queryPage<T>(options: PaginationQueryOptions): Promise<HaiResult<PaginatedResult<T>>> {
      const result = await queryPageAsync<T>(
        async (sqlStr, params) => {
          const stmt = database!.prepare(sqlStr)
          return params ? stmt.all(...params) : stmt.all()
        },
        options,
      )
      return ok(result)
    },
  }

  // ─── 事务 ───

  /** 创建事务连接上的 DML 操作（无守卫，由 createTxHandle 统一守卫） */
  function createSqliteTxDmlOps(db: Database.Database): DmlOperations {
    return {
      async query<T>(sql: string, params?: unknown[]): Promise<HaiResult<T[]>> {
        const stmt = db.prepare(sql)
        return ok((params ? stmt.all(...params) : stmt.all()) as T[])
      },
      async get<T>(sql: string, params?: unknown[]): Promise<HaiResult<T | null>> {
        const stmt = db.prepare(sql)
        return ok(((params ? stmt.get(...params) : stmt.get()) as T) ?? null)
      },
      async execute(sql: string, params?: unknown[]): Promise<HaiResult<ExecuteResult>> {
        const stmt = db.prepare(sql)
        const result = params ? stmt.run(...params) : stmt.run()
        return ok({ changes: result.changes, lastInsertRowid: result.lastInsertRowid })
      },
      async batch(statements) {
        for (const { sql: s, params } of statements) {
          const stmt = db.prepare(s)
          if (params)
            stmt.run(...params)
          else stmt.run()
        }
        return ok(undefined)
      },
      async queryPage<T>(options: PaginationQueryOptions): Promise<HaiResult<PaginatedResult<T>>> {
        const result = await queryPageAsync<T>(
          async (sqlStr, params) => {
            const stmt = db.prepare(sqlStr)
            return params ? stmt.all(...params) : stmt.all()
          },
          options,
        )
        return ok(result)
      },
    }
  }

  async function beginTx(): Promise<HaiResult<DmlWithTxOperations>> {
    const db = database!
    let released = false
    const releaseTxLock = await acquireTxLock()

    const finishTransaction = () => {
      if (!released) {
        released = true
        releaseTxLock()
      }
    }

    try {
      db.exec('BEGIN TRANSACTION')
    }
    catch (error) {
      finishTransaction()
      return err(HaiReldbError.TRANSACTION_FAILED, sqliteTxErrorMessage(String(error)), error)
    }

    const txDmlOps = createSqliteTxDmlOps(db)
    return ok(createTxHandle(txDmlOps, {
      commit: async () => { db.exec('COMMIT') },
      rollback: async () => { db.exec('ROLLBACK') },
      release: () => finishTransaction(),
      errorMessage: sqliteTxErrorMessage,
    }))
  }

  // ─── 组装 Provider ───

  const dmlOps = createBaseDmlOps(ctx, rawDml)

  return {
    async connect(config: ReldbConfig): Promise<HaiResult<void>> {
      if (config.type !== 'sqlite') {
        return err(HaiReldbError.UNSUPPORTED_TYPE, reldbM('reldb_sqliteOnlySqlite'))
      }

      if (!config.database) {
        return err(HaiReldbError.CONFIG_ERROR, reldbM('reldb_sqliteNeedPath'))
      }

      try {
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

        logger.info('Connected to SQLite', { database: config.database })
        return ok(undefined)
      }
      catch (error) {
        return err(HaiReldbError.CONNECTION_FAILED, reldbM('reldb_sqliteConnectionFailed', { params: { error: String(error) } }), error)
      }
    },

    async close(): Promise<HaiResult<void>> {
      if (database) {
        try {
          database.close()
        }
        catch (error) {
          database = null
          return err(HaiReldbError.CONNECTION_FAILED, reldbM('reldb_sqliteConnectionFailed', { params: { error: String(error) } }), error)
        }
        database = null
        logger.info('Disconnected from SQLite')
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
