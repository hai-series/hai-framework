/**
 * @h-ai/reldb — SQLite Provider
 *
 * 基于 better-sqlite3 的 SQLite 数据库实现。
 * @module reldb-provider-sqlite
 */

import type { Result } from '@h-ai/core'
import type Database from 'better-sqlite3'
import type { ReldbConfig } from '../reldb-config.js'
import type {
  DmlWithTxOperations,
  ReldbColumnDef,
  ReldbError,
  ReldbProvider,
  TxManager,
} from '../reldb-types.js'
import type { DdlDialect, RawExecutor } from './reldb-provider-base.js'

import { createRequire } from 'node:module'

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

  // ─── 辅助函数 ───

  /**
   * 确保数据库已连接
   */
  function ensureConnected(): Result<Database.Database, ReldbError> {
    if (!database) {
      return err({
        code: ReldbErrorCode.NOT_INITIALIZED,
        message: reldbM('reldb_notInitialized'),
      })
    }
    return ok(database)
  }

  /**
   * 获取 RawExecutor（含连接检查）
   */
  function getExecutor(): Result<RawExecutor, ReldbError> {
    const connResult = ensureConnected()
    if (!connResult.success)
      return connResult
    return ok(createDbExecutor(connResult.data))
  }

  /**
   * 将 better-sqlite3 同步 API 适配为 RawExecutor
   *
   * @param db - better-sqlite3 数据库实例
   * @returns RawExecutor 实例
   */
  function createDbExecutor(db: Database.Database): RawExecutor {
    return {
      queryRows: async (sqlStr, params) => {
        const stmt = db.prepare(sqlStr)
        return params ? stmt.all(...params) : stmt.all()
      },
      getRow: async (sqlStr, params) => {
        const stmt = db.prepare(sqlStr)
        return params ? stmt.get(...params) : stmt.get()
      },
      executeStmt: async (sqlStr, params) => {
        const stmt = db.prepare(sqlStr)
        const result = params ? stmt.run(...params) : stmt.run()
        return { changes: result.changes, lastInsertRowid: result.lastInsertRowid }
      },
      batchStmts: async (statements) => {
        for (const { sql: s, params } of statements) {
          const stmt = db.prepare(s)
          if (params)
            stmt.run(...params)
          else stmt.run()
        }
      },
      queryPage: options => queryPageAsync(
        async (sqlStr, params) => {
          const stmt = db.prepare(sqlStr)
          return params ? stmt.all(...params) : stmt.all()
        },
        options,
      ),
    }
  }

  /** 错误消息生成 */
  function sqliteErrorMessage(detail: string): string {
    return reldbM('reldb_sqliteQueryFailed', { params: { error: detail } })
  }

  /** 事务错误消息生成 */
  function sqliteTxErrorMessage(detail: string): string {
    return reldbM('reldb_sqliteTxFailed', { params: { error: detail } })
  }

  // ─── SQLite 方言 ───

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

  const sqliteDialect: DdlDialect = {
    quoteId: quoteIdentifier,
    buildColumnSql: (name, def) => buildColumnSqlBase(name, def, {
      quoteId: quoteIdentifier,
      mapType: mapSqliteType,
      inlinePrimaryKey: true,
      extraConstraints: (d) => {
        const extras: string[] = []
        if (d.primaryKey && d.autoIncrement)
          extras.push('AUTOINCREMENT')
        return extras
      },
    }),
    buildCreateTableSql: (quotedTable, columns, ifNotExists) =>
      buildDefaultCreateTableSql(sqliteDialect, quotedTable, columns, ifNotExists),
    buildRenameTableSql: buildDefaultRenameTableSql,
    buildCreateIndexSql: (quotedTable, quotedIndex, indexDef) =>
      buildDefaultCreateIndexSql(sqliteDialect, quotedTable, quotedIndex, indexDef),
    buildDropIndexSql: async (indexName, ifExists) =>
      buildDefaultDropIndexSql(sqliteDialect, indexName, ifExists),
  }

  // ─── DDL / SQL / CRUD ───

  const ddl = createDdlOps({
    ensureReady: () => {
      const r = ensureConnected()
      return r.success ? ok(undefined) : r
    },
    executeDdl: async (sqlStr) => {
      database!.exec(sqlStr)
    },
    dialect: sqliteDialect,
  })

  const sql = createSqlOps({
    getExecutor,
    errorMessage: sqliteErrorMessage,
    batch: async (statements) => {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const releaseTxLock = await acquireTxLock()
      try {
        const db = connResult.data
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
        return err({
          code: ReldbErrorCode.QUERY_FAILED,
          message: reldbM('reldb_sqliteBatchFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
      finally {
        releaseTxLock()
      }
    },
  })

  const crud = createCrudManager(sql)

  // ─── 事务操作实现 ───

  /**
   * 开启事务
   *
   * SQLite 使用同步 API，此处显式执行 BEGIN/COMMIT/ROLLBACK，
   * 并将同步调用包装为异步接口。事务锁保证串行化。
   *
   * @returns 事务句柄或错误
   */
  async function beginTransaction(): Promise<Result<DmlWithTxOperations, ReldbError>> {
    const connResult = ensureConnected()
    if (!connResult.success)
      return connResult

    const db = connResult.data
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
      return err({
        code: ReldbErrorCode.TRANSACTION_FAILED,
        message: sqliteTxErrorMessage(String(error)),
        cause: error,
      })
    }

    const dbExec = createDbExecutor(db)
    return ok(createTxOps(dbExec, {
      commit: async () => { db.exec('COMMIT') },
      rollback: async () => { db.exec('ROLLBACK') },
      release: () => finishTransaction(),
      errorMessage: sqliteTxErrorMessage,
    }))
  }

  const tx: TxManager = {
    begin: beginTransaction,
    wrap: createTxWrap(beginTransaction, sqliteTxErrorMessage),
  }

  // ─── Provider 接口实现 ───

  /**
   * 连接 SQLite 数据库
   */
  const connect: ReldbProvider['connect'] = async (config: ReldbConfig): Promise<Result<void, ReldbError>> => {
    if (config.type !== 'sqlite') {
      return err({
        code: ReldbErrorCode.UNSUPPORTED_TYPE,
        message: reldbM('reldb_sqliteOnlySqlite'),
      })
    }

    if (!config.database) {
      return err({
        code: ReldbErrorCode.CONFIG_ERROR,
        message: reldbM('reldb_sqliteNeedPath'),
      })
    }

    try {
      // 动态导入 better-sqlite3

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
      return err({
        code: ReldbErrorCode.CONNECTION_FAILED,
        message: reldbM('reldb_sqliteConnectionFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 关闭数据库连接
   */
  const close: ReldbProvider['close'] = async (): Promise<Result<void, ReldbError>> => {
    if (database) {
      try {
        database.close()
      }
      catch (error) {
        database = null
        return err({
          code: ReldbErrorCode.CONNECTION_FAILED,
          message: reldbM('reldb_sqliteConnectionFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
      database = null
      logger.info('Disconnected from SQLite')
    }
    return ok(undefined)
  }

  /**
   * 检查是否已连接
   */
  const isConnected: ReldbProvider['isConnected'] = (): boolean => {
    return database !== null && database.open
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
