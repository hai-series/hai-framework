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
  TxWrapCallback,
} from '../reldb-types.js'
import type { ReldbOpsContext } from './reldb-provider-base.js'
import type { ReldbProvider } from './reldb-provider-types.js'

import type { SqliteEngine } from './sqlite/reldb-sqlite-engine.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { core } from '@h-ai/core'
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
  /** 普通操作和事务共享唯一连接；关闭前等待已接受的操作归还执行权。 */
  let connectionQueue: Promise<void> = Promise.resolve()
  let unusableEngine: SqliteEngine | null = null
  const transactionScope = new AsyncLocalStorage<{ active: boolean }>()
  let currentConfig: ReldbConfig | null = null

  /** 保留所有权直到释放成功；合并并发关闭且立即阻止新操作。 */
  function closeResource(): Promise<HaiResult<void>> {
    ready = false
    currentConfig = null
    if (closing)
      return closing
    const owned = engine
    if (!owned)
      return Promise.resolve(core.ok(undefined))
    closing = (async (): Promise<HaiResult<void>> => {
      try {
        await connectionQueue
        await owned.close()
        engine = null
        unusableEngine = null
        return core.ok(undefined)
      }
      catch (error) {
        return core.err(HaiReldbError.CONNECTION_FAILED, reldbM('reldb_sqliteConnectionFailed', {
          params: {
            error: String(error),
          },
        }), error)
      }
    })().finally(() => { closing = null })
    return closing
  }

  /** SQLite 连接执行权获取超时（毫秒）。 */
  const CONNECTION_LOCK_TIMEOUT_MS = 30_000

  /**
   * 按调用顺序获取连接执行权。超时的队列项完成后会被跳过。
   */
  async function acquireConnectionLock(): Promise<() => void> {
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const prev = connectionQueue
    connectionQueue = prev.then(() => current)

    // 带超时的等待
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // 预先释放本项，前一项结束后队列可以继续。
        release()
        reject(new Error(`SQLite connection lock acquisition timed out after ${CONNECTION_LOCK_TIMEOUT_MS}ms`))
      }, CONNECTION_LOCK_TIMEOUT_MS)
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

  function reentrantOperationError() {
    return core.err(HaiReldbError.TRANSACTION_FAILED, reldbM('reldb_sqliteOperationRequiresTransaction'))
  }

  function canUseEngine(owned: SqliteEngine): boolean {
    return owned !== unusableEngine && owned.isOpen()
  }

  /** 回调内误用全局入口会与自己持有的执行权互等，因此直接返回失败。 */
  async function withEngine<T>(run: (owned: SqliteEngine) => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
    if (transactionScope.getStore()?.active)
      return reentrantOperationError()
    const owned = engine!
    const release = await acquireConnectionLock()
    try {
      if (!canUseEngine(owned))
        return core.err(HaiReldbError.NOT_INITIALIZED, reldbM('reldb_notInitialized'))
      return await run(owned)
    }
    finally {
      release()
    }
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
        // SQLite 文本主键需要单独应用调用方声明的非空约束。
        if (d.type === 'TEXT' && d.primaryKey && d.notNull)
          extras.push('NOT NULL')
        return extras
      },
    })
  }

  /** 事务错误消息生成 */
  function sqliteTxErrorMessage(detail: string): string {
    return reldbM('reldb_sqliteTxFailed', {
      params: { error: detail },
    })
  }

  // ─── DDL 操作 ───

  function executeDdl(sql: string): Promise<HaiResult<void>> {
    return withEngine(async (owned) => {
      await owned.exec(sql)
      return core.ok(undefined)
    })
  }

  const rawDdl: DdlOperations = {
    createTable(name, columns, ifNotExists = true) {
      const quotedTable = quoteIdentifier(name)
      const sql = buildDefaultCreateTableSql(sqliteBuildColumnSql, quotedTable, columns, ifNotExists)
      return executeDdl(sql)
    },
    dropTable(name, ifExists) {
      const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
      return executeDdl(`DROP TABLE ${ifExistsClause}${quoteIdentifier(name)}`)
    },
    addColumn(table, column, def) {
      const colSql = sqliteBuildColumnSql(column, def)
      return executeDdl(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${colSql}`)
    },
    dropColumn(table, column) {
      return executeDdl(`ALTER TABLE ${quoteIdentifier(table)} DROP COLUMN ${quoteIdentifier(column)}`)
    },
    renameTable(oldName, newName) {
      return executeDdl(buildDefaultRenameTableSql(quoteIdentifier(oldName), quoteIdentifier(newName)))
    },
    createIndex(table, index, def) {
      const sql = buildDefaultCreateIndexSql(quoteIdentifier, quoteIdentifier(table), quoteIdentifier(index), def)
      return executeDdl(sql)
    },
    dropIndex(index, ifExists = true) {
      return executeDdl(buildDefaultDropIndexSql(quoteIdentifier, index, ifExists))
    },
    raw: executeDdl,
  }

  // ─── DML 操作 ───

  function createSqliteDmlOps(run: typeof withEngine, inTransaction = false): DmlOperations {
    return {
      query<T>(sql: string, params?: unknown[]): Promise<HaiResult<T[]>> {
        return run(async owned => core.ok((await owned.all(sql, params)) as T[]))
      },
      get<T>(sql: string, params?: unknown[]): Promise<HaiResult<T | null>> {
        return run(async owned => core.ok(((await owned.get(sql, params)) as T) ?? null))
      },
      execute(sql: string, params?: unknown[]): Promise<HaiResult<ExecuteResult>> {
        return run(async owned => core.ok(await owned.run(sql, params)))
      },
      batch(statements) {
        return run(async (owned) => {
          if (inTransaction) {
            for (const { sql, params } of statements)
              await owned.run(sql, params)
            return core.ok(undefined)
          }
          try {
            await owned.batch(statements)
            return core.ok(undefined)
          }
          catch (error) {
            return core.err(HaiReldbError.QUERY_FAILED, reldbM('reldb_sqliteBatchFailed', {
              params: {
                error: String(error),
              },
            }), error)
          }
        })
      },
      queryPage<T>(options: PaginationQueryOptions): Promise<HaiResult<PaginatedResult<T>>> {
        return run(async (owned) => {
          const result = await queryPageAsync<T>((sql, params) => owned.all(sql, params), options)
          return core.ok(result)
        })
      },
    }
  }

  // ─── 事务 ───

  async function beginTx(): Promise<HaiResult<DmlWithTxOperations>> {
    if (transactionScope.getStore()?.active)
      return reentrantOperationError()
    const txEngine = engine!
    const release = await acquireConnectionLock()
    try {
      if (!canUseEngine(txEngine)) {
        release()
        return core.err(HaiReldbError.NOT_INITIALIZED, reldbM('reldb_notInitialized'))
      }
      await txEngine.exec('BEGIN TRANSACTION')
    }
    catch (error) {
      release()
      return core.err(HaiReldbError.TRANSACTION_FAILED, sqliteTxErrorMessage(String(error)), error)
    }

    // SQLite 事务内仍使用同一连接，依次运行已接受的操作。
    let transactionWork: Promise<void> = Promise.resolve()
    function withTransaction<T>(run: (owned: SqliteEngine) => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
      const result = transactionWork.then(() => run(txEngine))
      transactionWork = result.then(() => undefined, () => undefined)
      return result
    }

    async function finishTransaction(commit: boolean): Promise<void> {
      try {
        if (commit)
          await txEngine.exec('COMMIT')
        else
          await txEngine.rollbackIfActive()
      }
      catch (error) {
        try {
          // COMMIT 可能失败但保留事务，例如延迟外键检查失败或写锁竞争。
          await txEngine.rollbackIfActive()
        }
        catch (cleanupError) {
          // 仍持有连接执行权。先隔离此连接，后续 close/init 负责释放。
          unusableEngine = txEngine
          ready = false
          logger.error('SQLite transaction cleanup failed; connection disabled', {
            traceId: core.context.get().traceId ?? core.context.get().requestId,
            errorCode: HaiReldbError.TRANSACTION_FAILED.code,
          })
          throw new AggregateError([error, cleanupError], String(error), { cause: error })
        }
        throw error
      }
    }

    const guardedTxDmlOps = createBaseDmlOps({
      ...ctx,
      isConnected: () => txEngine.isOpen(),
    }, createSqliteDmlOps(withTransaction, true))
    return core.ok(createTxHandle(guardedTxDmlOps, {
      commit: () => finishTransaction(true),
      rollback: () => finishTransaction(false),
      release,
      errorMessage: sqliteTxErrorMessage,
    }))
  }

  function withTransactionScope<T>(fn: TxWrapCallback<T>): TxWrapCallback<T> {
    return async (tx) => {
      const scope = { active: true }
      try {
        return await transactionScope.run(scope, fn, tx)
      }
      finally {
        scope.active = false
      }
    }
  }

  // ─── 组装 Provider ───

  const dmlOps = createBaseDmlOps(ctx, createSqliteDmlOps(withEngine))
  const txManager = createBaseTxManager(ctx, beginTx)

  return {
    async connect(config: ReldbConfig): Promise<HaiResult<void>> {
      if (config.type !== 'sqlite') {
        return core.err(HaiReldbError.UNSUPPORTED_TYPE, reldbM('reldb_sqliteOnlySqlite'))
      }

      if (!config.database) {
        return core.err(HaiReldbError.CONFIG_ERROR, reldbM('reldb_sqliteNeedPath'))
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
        return core.ok(undefined)
      }
      catch (error) {
        const cleanup = await closeResource()
        const result = core.err(HaiReldbError.CONNECTION_FAILED, reldbM('reldb_sqliteConnectionFailed', {
          params: {
            error: String(error),
          },
        }), error)
        return cleanup.success || result.success
          ? result
          : core.err({
              ...result.error,
              ext: { cleanupPending: true, cleanupError: cleanup.error },
            })
      }
    },

    close: closeResource,

    isConnected: () => ctx.isConnected(),
    ddl: createBaseDdlOps(ctx, rawDdl),
    sql: dmlOps,
    crud: createBaseCrudManager(dmlOps),
    tx: {
      begin: txManager.begin,
      wrap: fn => txManager.wrap(withTransactionScope(fn)),
      wrapResult: fn => txManager.wrapResult(withTransactionScope(fn)),
    },
  }
}
