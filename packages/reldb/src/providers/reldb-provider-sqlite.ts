/**
 * @h-ai/reldb — SQLite Provider
 *
 * 基于 better-sqlite3 的 SQLite 数据库实现。
 * 按 Context + wrapOp → Factory 模式实现。
 * @module reldb-provider-sqlite
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
} from '../reldb-types.js'
import type { ReldbOpsContext } from './reldb-provider-base.js'
import type { ReldbProvider } from './reldb-provider-types.js'
import type { SqliteEngine } from './sqlite/reldb-sqlite-engine.js'

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
import { createSyncSqliteEngine, createWorkerSqliteEngine } from './sqlite/reldb-sqlite-engine.js'

const logger = core.logger.child({ module: 'reldb', scope: 'sqlite' })

// ─── SQLite Provider 实现 ───

/**
 * 创建 SQLite Provider 实例
 *
 * @returns SQLite Provider
 * @example 模块内部上下文
 * ```ts
 * const provider = createSqliteProvider()
 * const closed = await provider.close()
 * if (!closed.success) throw new Error(closed.error.message)
 * ```
 */
export function createSqliteProvider(): ReldbProvider {
  /** SQLite 执行引擎（同步或 worker） */
  let engine: SqliteEngine | null = null
  /** 只有健康检查完成的连接才可供业务使用；清理失败仍保留底层资源。 */
  let ready = false
  let closing: Promise<HaiResult<void>> | null = null
  /** 串行化 SQLite 事务，关闭前等待所有借出事务归还。 */
  let txChain: Promise<void> = Promise.resolve()
  let currentConfig: ReldbConfig | null = null

  /** 保留所有权直到释放成功；合并并发关闭且立即阻止新操作。 */
  function closeResource(): Promise<HaiResult<void>> {
    ready = false
    currentConfig = null
    if (closing)
      return closing
    const owned = engine
    if (!owned)
      return Promise.resolve(ok(undefined))
    closing = (async (): Promise<HaiResult<void>> => {
      try {
        // 在途事务拥有独立上下文；先等待释放，再关闭唯一引擎。
        await txChain.catch(() => undefined)
        await owned.close()
        engine = null
        return ok(undefined)
      }
      catch (error) {
        return err(HaiReldbError.CONNECTION_FAILED, reldbM('reldb_sqliteConnectionFailed', { params: { error: String(error) } }), error)
      }
    })().finally(() => { closing = null })
    return closing
  }

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
    isConnected: () => ready && engine !== null && engine.isOpen(),
    logger,
    operationLog: () => currentConfig?.operationLog,
  }

  // ─── SQLite 方言辅助 ───

  /** SQLite 列类型映射 */
  function mapSqliteType(def: ReldbColumnDef): string {
    switch (def.type) {
      case 'TEXT':
      case 'JSON':
        return 'TEXT'
      case 'INTEGER':
      case 'BIGINT':
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
      await engine!.exec(sql)
      return ok(undefined)
    },
    async dropTable(name, ifExists) {
      const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
      await engine!.exec(`DROP TABLE ${ifExistsClause}${quoteIdentifier(name)}`)
      return ok(undefined)
    },
    async addColumn(table, column, def) {
      const colSql = sqliteBuildColumnSql(column, def)
      await engine!.exec(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${colSql}`)
      return ok(undefined)
    },
    async dropColumn(table, column) {
      await engine!.exec(`ALTER TABLE ${quoteIdentifier(table)} DROP COLUMN ${quoteIdentifier(column)}`)
      return ok(undefined)
    },
    async renameTable(oldName, newName) {
      await engine!.exec(buildDefaultRenameTableSql(quoteIdentifier(oldName), quoteIdentifier(newName)))
      return ok(undefined)
    },
    async createIndex(table, index, def) {
      const sql = buildDefaultCreateIndexSql(quoteIdentifier, quoteIdentifier(table), quoteIdentifier(index), def)
      await engine!.exec(sql)
      return ok(undefined)
    },
    async dropIndex(index, ifExists = true) {
      const sql = buildDefaultDropIndexSql(quoteIdentifier, index, ifExists)
      await engine!.exec(sql)
      return ok(undefined)
    },
    async raw(sql) {
      await engine!.exec(sql)
      return ok(undefined)
    },
  }

  // ─── DML 操作 ───

  const rawDml: DmlOperations = {
    async query<T>(sql: string, params?: unknown[]): Promise<HaiResult<T[]>> {
      const rows = await engine!.all(sql, params)
      return ok(rows as T[])
    },
    async get<T>(sql: string, params?: unknown[]): Promise<HaiResult<T | null>> {
      const row = await engine!.get(sql, params)
      return ok((row as T) ?? null)
    },
    async execute(sql: string, params?: unknown[]): Promise<HaiResult<ExecuteResult>> {
      const result = await engine!.run(sql, params)
      return ok(result)
    },
    async batch(statements) {
      // 与显式事务串行，避免并发 BEGIN 导致 "cannot start a transaction within a transaction"。
      const releaseTxLock = await acquireTxLock()
      try {
        await engine!.batch(statements)
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
        (sqlStr, params) => engine!.all(sqlStr, params),
        options,
      )
      return ok(result)
    },
  }

  // ─── 事务 ───

  /** 创建事务连接上的 DML 操作（无守卫，由 createTxHandle 统一守卫）。事务内批量不再包裹嵌套事务。 */
  function createSqliteTxDmlOps(txEngine: SqliteEngine): DmlOperations {
    return {
      async query<T>(sql: string, params?: unknown[]): Promise<HaiResult<T[]>> {
        return ok((await txEngine.all(sql, params)) as T[])
      },
      async get<T>(sql: string, params?: unknown[]): Promise<HaiResult<T | null>> {
        return ok(((await txEngine.get(sql, params)) as T) ?? null)
      },
      async execute(sql: string, params?: unknown[]): Promise<HaiResult<ExecuteResult>> {
        return ok(await txEngine.run(sql, params))
      },
      async batch(statements) {
        // 已处于显式事务中，逐条执行即可，不再开启嵌套事务。
        for (const { sql: s, params } of statements) {
          await txEngine.run(s, params)
        }
        return ok(undefined)
      },
      async queryPage<T>(options: PaginationQueryOptions): Promise<HaiResult<PaginatedResult<T>>> {
        const result = await queryPageAsync<T>(
          (sqlStr, params) => txEngine.all(sqlStr, params),
          options,
        )
        return ok(result)
      },
    }
  }

  async function beginTx(): Promise<HaiResult<DmlWithTxOperations>> {
    const txEngine = engine!
    let released = false
    const releaseTxLock = await acquireTxLock()

    const finishTransaction = () => {
      if (!released) {
        released = true
        releaseTxLock()
      }
    }

    try {
      await txEngine.exec('BEGIN TRANSACTION')
    }
    catch (error) {
      finishTransaction()
      return err(HaiReldbError.TRANSACTION_FAILED, sqliteTxErrorMessage(String(error)), error)
    }

    const txDmlOps = createSqliteTxDmlOps(txEngine)
    const guardedTxDmlOps = createBaseDmlOps({ ...ctx, isConnected: () => txEngine.isOpen() }, txDmlOps)
    return ok(createTxHandle(guardedTxDmlOps, {
      commit: async () => { await txEngine.exec('COMMIT') },
      rollback: async () => { await txEngine.exec('ROLLBACK') },
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

      const previousCleanup = await closeResource()
      if (!previousCleanup.success)
        return previousCleanup
      try {
        const sqliteOptions = {
          walMode: true,
          readonly: false,
          executor: 'sync' as 'sync' | 'worker',
          workerConnectTimeoutMs: 10_000,
          ...(config.sqlite ?? {}),
        }
        const engineOptions = {
          database: config.database,
          readonly: sqliteOptions.readonly ?? false,
          walMode: sqliteOptions.walMode !== false,
        }

        // worker 执行方式把同步查询移出主线程事件循环；sync 为默认保持历史行为。
        engine = sqliteOptions.executor === 'worker'
          ? createWorkerSqliteEngine(engineOptions, sqliteOptions.workerConnectTimeoutMs ?? 10_000)
          : createSyncSqliteEngine(engineOptions)
        await engine.initialize()

        ready = true
        currentConfig = config
        logger.info('Connected to SQLite', { database: config.database, executor: sqliteOptions.executor })
        return ok(undefined)
      }
      catch (error) {
        const cleanup = await closeResource()
        const result = err(HaiReldbError.CONNECTION_FAILED, reldbM('reldb_sqliteConnectionFailed', { params: { error: String(error) } }), error)
        return cleanup.success || result.success ? result : err({ ...result.error, ext: { cleanupPending: true, cleanupError: cleanup.error } })
      }
    },

    close: closeResource,

    isConnected: () => ctx.isConnected(),
    ddl: createBaseDdlOps(ctx, rawDdl),
    sql: dmlOps,
    crud: createBaseCrudManager(dmlOps),
    tx: createBaseTxManager(ctx, beginTx),
  }
}
