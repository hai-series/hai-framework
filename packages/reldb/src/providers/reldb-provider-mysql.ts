/**
 * @h-ai/reldb — MySQL Provider
 *
 * 基于 mysql2 的 MySQL 数据库实现。
 * 按 Context + wrapOp → Factory 模式实现。
 * @module reldb-provider-mysql
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { PoolConnection as MysqlConnection, Pool as MysqlPool, ResultSetHeader } from 'mysql2/promise'
import type { MysqlPoolConfig, ReldbConfig } from '../reldb-config.js'
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

import { createRequire } from 'node:module'
import { isIP } from 'node:net'
import { performance } from 'node:perf_hooks'
import { core, err, ok } from '@h-ai/core'
import { MysqlPoolConfigSchema } from '../reldb-config.js'
import { reldbM } from '../reldb-i18n.js'
import { HaiReldbError } from '../reldb-types.js'

import {
  buildColumnSqlBase,
} from './reldb-ddl-builder.js'
import { createBaseCrudManager, createBaseDdlOps, createBaseDmlOps, createBaseTxManager, queryPageAsync } from './reldb-provider-base.js'
import { createTxHandle } from './reldb-tx-assembler.js'

const logger = core.logger.child({ module: 'reldb', scope: 'mysql' })

/** 借用真实驱动连接及其容量槽位；超时只约束借用完成前，不中止已启动 SQL。 */
interface MysqlConnectionLease {
  connection: MysqlConnection
  deadline: number
  release: () => void
}

/** 可取消的 FIFO 排队项；进入驱动前可直接移除，绝不留在 mysql2 内部队列。 */
interface MysqlConnectionWaiter {
  start: () => void
  cancel: () => void
}

// ─── MySQL Provider 实现 ───

/**
 * 创建 MySQL Provider 实例
 *
 * @returns MySQL Provider
 */
export function createMysqlProvider(): ReldbProvider {
  /** 连接池实例 */
  let pool: MysqlPool | null = null
  /** 只有健康检查完成的连接才可供业务使用；清理失败仍保留底层资源。 */
  let ready = false
  let closing: Promise<HaiResult<void>> | null = null
  let poolConfig: MysqlPoolConfig | null = null
  let activeSlots = 0
  let slotsDrained: Promise<void> = Promise.resolve()
  let resolveSlots: (() => void) | null = null
  const waiters: MysqlConnectionWaiter[] = []
  let currentConfig: ReldbConfig | null = null

  /** 归还槽位后只启动未取消的队首请求；在途建连即使已超时也须结算后才能腾出槽位。 */
  function releaseSlot(): void {
    activeSlots--
    if (ready && poolConfig) {
      const maximum = poolConfig.max
      while (waiters.length > 0) {
        if (activeSlots >= maximum)
          break
        waiters.shift()!.start()
      }
    }
    if (activeSlots === 0) {
      resolveSlots?.()
      resolveSlots = null
    }
  }

  /**
   * 在唯一截止期限内借用连接；SDK 不排队，超时排队项立即删除，迟到连接只释放而不执行 SQL。
   *
   * 已进入驱动的建连不能由 mysql2 Promise API 取消，因此保留槽位直到它完成/失败。
   * close 等待这些有限建连结算，驱动 connectTimeout 与 acquireTimeout 相同。
   */
  function acquireConnection(): Promise<HaiResult<MysqlConnectionLease>> {
    const owned = pool
    const limits = poolConfig
    if (!ready || !owned || !limits)
      return Promise.resolve(err(HaiReldbError.NOT_INITIALIZED, reldbM('reldb_notInitialized')))
    if (activeSlots >= limits.max && waiters.length >= limits.queueLimit)
      return Promise.resolve(err(HaiReldbError.POOL_EXHAUSTED, reldbM('reldb_mysqlPoolQueueFull')))

    const deadline = performance.now() + limits.acquireTimeout
    return new Promise((resolve) => {
      let completed = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeoutResult = () => err(HaiReldbError.TIMEOUT, reldbM('reldb_mysqlPoolAcquireTimeout'))
      const finish = (result: HaiResult<MysqlConnectionLease>) => {
        if (completed)
          return
        completed = true
        clearTimeout(timer)
        resolve(result)
      }
      const waiter: MysqlConnectionWaiter = {
        cancel: () => finish(err(HaiReldbError.NOT_INITIALIZED, reldbM('reldb_notInitialized'))),
        start: () => {
          if (!ready || performance.now() >= deadline) {
            finish(ready ? timeoutResult() : err(HaiReldbError.NOT_INITIALIZED, reldbM('reldb_notInitialized')))
            return
          }
          if (activeSlots++ === 0)
            slotsDrained = new Promise<void>((resolve) => { resolveSlots = resolve })
          // 独立处理失败分支，避免 Promise.race 遗留一个会在后台继续执行的连接借用。
          void Promise.resolve().then(() => owned.getConnection()).then((connection) => {
            if (completed || !ready || performance.now() >= deadline) {
              try {
                connection.release()
              }
              finally { releaseSlot() }
              finish(ready ? timeoutResult() : err(HaiReldbError.NOT_INITIALIZED, reldbM('reldb_notInitialized')))
              return
            }
            let released = false
            finish(ok({
              connection,
              deadline,
              release: () => {
                if (released)
                  return
                released = true
                try {
                  connection.release()
                }
                finally { releaseSlot() }
              },
            }))
          }, (error) => {
            releaseSlot()
            finish(err(HaiReldbError.CONNECTION_FAILED, reldbM('reldb_mysqlConnectionFailed', { params: { error: String(error) } }), error))
          }).catch((error) => {
            // 迟到连接清理异常时停止新业务，保留池供 close 重试，不泄露驱动错误。
            ready = false
            finish(err(HaiReldbError.CONNECTION_FAILED, reldbM('reldb_mysqlConnectionFailed', { params: { error: reldbM('reldb_mysqlPoolReleaseFailed') } }), error))
            logger.warn('MySQL connection release failed; pool requires cleanup')
          })
        },
      }
      timer = setTimeout(() => {
        const index = waiters.indexOf(waiter)
        if (index >= 0)
          waiters.splice(index, 1)
        finish(timeoutResult())
      }, limits.acquireTimeout)
      if (activeSlots < limits.max)
        waiter.start()
      else
        waiters.push(waiter)
    })
  }

  /** 所有池级 SQL/DDL 都先借用并归还连接，不能绕过获取超时或容量限制。 */
  async function withConnection<T>(fn: (connection: MysqlConnection) => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
    const acquired = await acquireConnection()
    if (!acquired.success)
      return acquired
    try {
      if (!ready)
        return err(HaiReldbError.NOT_INITIALIZED, reldbM('reldb_notInitialized'))
      if (performance.now() >= acquired.data.deadline)
        return err(HaiReldbError.TIMEOUT, reldbM('reldb_mysqlPoolAcquireTimeout'))
      return await fn(acquired.data.connection)
    }
    finally { acquired.data.release() }
  }

  /** 保留所有权直到释放成功；合并并发关闭且立即阻止新操作。 */
  function closeResource(): Promise<HaiResult<void>> {
    ready = false
    currentConfig = null
    for (const waiter of waiters.splice(0))
      waiter.cancel()
    if (closing)
      return closing
    const owned = pool
    if (!owned)
      return Promise.resolve(ok(undefined))
    closing = (async (): Promise<HaiResult<void>> => {
      try {
        await slotsDrained
        await owned.end()
        pool = null
        poolConfig = null
        return ok(undefined)
      }
      catch (error) {
        return err(HaiReldbError.CONNECTION_FAILED, reldbM('reldb_mysqlConnectionFailed', { params: { error: String(error) } }), error)
      }
    })().finally(() => { closing = null })
    return closing
  }

  // ─── 操作上下文 ───

  const ctx: ReldbOpsContext = {
    isConnected: () => ready && pool !== null,
    logger,
    operationLog: () => currentConfig?.operationLog,
  }

  // ─── 辅助函数 ───

  /** MySQL 标识符引用（反引号） */
  function mysqlQuoteId(name: string): string {
    return `\`${name}\``
  }

  /** 事务错误消息生成 */
  function mysqlTxErrorMessage(detail: string): string {
    return reldbM('reldb_mysqlTxFailed', { params: { error: detail } })
  }

  /**
   * 根据索引名解析所在表
   *
   * MySQL 的 `DROP INDEX` 语句需要表名，因此通过 INFORMATION_SCHEMA
   * 在当前数据库中查找索引所属表。
   */
  async function findIndexTableName(
    indexName: string,
  ): Promise<HaiResult<string | null>> {
    return withConnection(async (connection) => {
      const [rows] = await connection.query(
        'SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = ? LIMIT 1',
        [indexName],
      )
      const data = rows as Array<{ name: string }>
      return ok(data[0]?.name ?? null)
    })
  }

  // ─── MySQL 方言辅助 ───

  /** MySQL 列类型映射 */
  function mapMysqlType(def: ReldbColumnDef): string {
    switch (def.type) {
      case 'TEXT':
        return 'VARCHAR(255)'
      case 'INTEGER':
        return def.autoIncrement ? 'BIGINT' : 'INT'
      case 'BIGINT':
        return 'BIGINT'
      case 'REAL':
        return 'DOUBLE'
      case 'BLOB':
        return 'BLOB'
      case 'BOOLEAN':
        return 'TINYINT(1)'
      case 'TIMESTAMP':
        return 'DATETIME'
      case 'JSON':
        return 'JSON'
      default:
        return 'TEXT'
    }
  }

  /** MySQL buildColumnSql */
  function mysqlBuildColumnSql(name: string, def: ReldbColumnDef): string {
    return buildColumnSqlBase(name, def, {
      quoteId: mysqlQuoteId,
      mapType: mapMysqlType,
      inlinePrimaryKey: false,
      extraConstraints: (d) => {
        const extras: string[] = []
        // MySQL 主键需要显式 NOT NULL（base 的 notNull 检查排除了 primaryKey）
        if (d.primaryKey)
          extras.push('NOT NULL')
        if (d.autoIncrement)
          extras.push('AUTO_INCREMENT')
        return extras
      },
      formatDefault: (d) => {
        if (d.defaultValue === undefined)
          return undefined
        if (d.autoIncrement)
          return null // 跳过 autoIncrement 列的默认值
        if (typeof d.defaultValue === 'string'
          && (d.defaultValue === 'NOW()' || d.defaultValue === 'CURRENT_TIMESTAMP')) {
          return `DEFAULT ${d.defaultValue}`
        }
        if (typeof d.defaultValue === 'boolean') {
          return `DEFAULT ${d.defaultValue ? 1 : 0}`
        }
        return undefined // 走通用逻辑
      },
    })
  }

  /** MySQL CREATE TABLE（含 PRIMARY KEY、FOREIGN KEY、ENGINE） */
  function mysqlBuildCreateTableSql(quotedTable: string, columns: Record<string, ReldbColumnDef>, ifNotExists: boolean): string {
    const columnDefs: string[] = []
    let primaryKeyCol: string | null = null

    for (const [name, def] of Object.entries(columns)) {
      columnDefs.push(mysqlBuildColumnSql(name, def))
      if (def.primaryKey) {
        primaryKeyCol = name
      }
    }

    if (primaryKeyCol) {
      columnDefs.push(`PRIMARY KEY (${mysqlQuoteId(primaryKeyCol)})`)
    }

    // 外键约束
    for (const [name, def] of Object.entries(columns)) {
      if (def.references) {
        let fkSql = `FOREIGN KEY (${mysqlQuoteId(name)}) REFERENCES ${mysqlQuoteId(def.references.table)}(${mysqlQuoteId(def.references.column)})`
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
    return `CREATE TABLE ${ifNotExistsClause}${quotedTable} (${columnDefs.join(', ')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  }

  // ─── DDL 操作 ───

  /** 单条 DDL 共享池借用边界，释放在 finally 内完成。 */
  function executeDdl(sql: string): Promise<HaiResult<void>> {
    return withConnection(async (connection) => {
      await connection.query(sql)
      return ok(undefined)
    })
  }

  const rawDdl: DdlOperations = {
    async createTable(name, columns, ifNotExists = true) {
      const quotedTable = mysqlQuoteId(name)
      const sql = mysqlBuildCreateTableSql(quotedTable, columns, ifNotExists)
      return executeDdl(sql)
    },
    async dropTable(name, ifExists) {
      const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
      return executeDdl(`DROP TABLE ${ifExistsClause}${mysqlQuoteId(name)}`)
    },
    async addColumn(table, column, def) {
      const colSql = mysqlBuildColumnSql(column, def)
      return executeDdl(`ALTER TABLE ${mysqlQuoteId(table)} ADD COLUMN ${colSql}`)
    },
    async dropColumn(table, column) {
      return executeDdl(`ALTER TABLE ${mysqlQuoteId(table)} DROP COLUMN ${mysqlQuoteId(column)}`)
    },
    async renameTable(oldName, newName) {
      return executeDdl(`RENAME TABLE ${mysqlQuoteId(oldName)} TO ${mysqlQuoteId(newName)}`)
    },
    async createIndex(table, index, def) {
      const uniqueClause = def.unique ? 'UNIQUE ' : ''
      const columns = def.columns.map(c => mysqlQuoteId(c)).join(', ')
      return executeDdl(`CREATE ${uniqueClause}INDEX ${mysqlQuoteId(index)} ON ${mysqlQuoteId(table)} (${columns})`)
    },
    async dropIndex(index, ifExists) {
      const tableResult = await findIndexTableName(index)
      if (!tableResult.success)
        return tableResult

      if (!tableResult.data) {
        if (ifExists)
          return ok(undefined)
        return err(HaiReldbError.DDL_FAILED, reldbM('reldb_ddlFailed', { params: { error: `index not found: ${index}` } }))
      }

      return executeDdl(`DROP INDEX ${mysqlQuoteId(index)} ON ${mysqlQuoteId(tableResult.data)}`)
    },
    async raw(sql) {
      return executeDdl(sql)
    },
  }

  // ─── DML 操作 ───

  const rawDml: DmlOperations = {
    async query<T>(sql: string, params?: unknown[]): Promise<HaiResult<T[]>> {
      return withConnection(async (connection) => {
        const [rows]: [unknown, unknown] = await connection.query(sql, params)
        return ok(rows as T[])
      })
    },
    async get<T>(sql: string, params?: unknown[]): Promise<HaiResult<T | null>> {
      return withConnection(async (connection) => {
        const [rows]: [unknown, unknown] = await connection.query(sql, params)
        return ok(((rows as unknown[])[0] as T) ?? null)
      })
    },
    async execute(sql: string, params?: unknown[]): Promise<HaiResult<ExecuteResult>> {
      return withConnection(async (connection) => {
        const [result] = await connection.execute<ResultSetHeader>({ sql, values: params })
        return ok({ changes: result.affectedRows, lastInsertRowid: result.insertId })
      })
    },
    async batch(statements) {
      return withConnection(async (connection) => {
        try {
          await connection.beginTransaction()
          for (const { sql: s, params } of statements) {
            await connection.execute({ sql: s, values: params })
          }
          await connection.commit()
          return ok(undefined)
        }
        catch (error) {
          await connection.rollback().catch(() => { })
          return err(HaiReldbError.QUERY_FAILED, reldbM('reldb_batchFailed', { params: { error: String(error) } }), error)
        }
      })
    },
    async queryPage<T>(options: PaginationQueryOptions): Promise<HaiResult<PaginatedResult<T>>> {
      return withConnection(async (connection) => {
        const result = await queryPageAsync<T>(
          async (sql, params) => {
            const [rows] = await connection.query(sql, params)
            return rows as unknown[]
          },
          options,
        )
        return ok(result)
      })
    },
  }

  // ─── 事务 ───

  /** 创建事务连接上的 DML 操作 */
  function createMysqlTxDmlOps(conn: MysqlConnection): DmlOperations {
    return {
      async query<T>(sql: string, params?: unknown[]): Promise<HaiResult<T[]>> {
        const [rows]: [unknown, unknown] = await conn.query(sql, params)
        return ok(rows as T[])
      },
      async get<T>(sql: string, params?: unknown[]): Promise<HaiResult<T | null>> {
        const [rows]: [unknown, unknown] = await conn.query(sql, params)
        return ok(((rows as unknown[])[0] as T) ?? null)
      },
      async execute(sql: string, params?: unknown[]): Promise<HaiResult<ExecuteResult>> {
        const [result] = await conn.execute<ResultSetHeader>({ sql, values: params })
        return ok({ changes: result.affectedRows, lastInsertRowid: result.insertId })
      },
      async batch(statements) {
        for (const { sql: s, params } of statements) {
          await conn.execute({ sql: s, values: params })
        }
        return ok(undefined)
      },
      async queryPage<T>(options: PaginationQueryOptions): Promise<HaiResult<PaginatedResult<T>>> {
        const result = await queryPageAsync<T>(
          async (sql, params) => {
            const [rows] = await conn.query(sql, params)
            return rows as unknown[]
          },
          options,
        )
        return ok(result)
      },
    }
  }

  async function beginTx(): Promise<HaiResult<DmlWithTxOperations>> {
    const acquired = await acquireConnection()
    if (!acquired.success)
      return acquired
    let connection: MysqlConnection | null = acquired.data.connection
    try {
      if (!ready || performance.now() >= acquired.data.deadline) {
        acquired.data.release()
        return ready
          ? err(HaiReldbError.TIMEOUT, reldbM('reldb_mysqlPoolAcquireTimeout'))
          : err(HaiReldbError.NOT_INITIALIZED, reldbM('reldb_notInitialized'))
      }
      await connection.beginTransaction()
    }
    catch (error) {
      acquired.data.release()
      return err(HaiReldbError.TRANSACTION_FAILED, mysqlTxErrorMessage(String(error)), error)
    }

    const txDmlOps = createMysqlTxDmlOps(connection)
    const guardedTxDmlOps = createBaseDmlOps({ ...ctx, isConnected: () => connection !== null }, txDmlOps)
    return ok(createTxHandle(guardedTxDmlOps, {
      commit: async () => { await connection!.commit() },
      rollback: async () => { await connection!.rollback() },
      release: () => {
        try {
          acquired.data.release()
        }
        finally {
          connection = null
        }
      },
      errorMessage: mysqlTxErrorMessage,
    }))
  }

  // ─── 组装 Provider ───

  const dmlOps = createBaseDmlOps(ctx, rawDml)

  return {
    async connect(config: ReldbConfig): Promise<HaiResult<void>> {
      if (config.type !== 'mysql') {
        return err(HaiReldbError.UNSUPPORTED_TYPE, reldbM('reldb_mysqlOnlyMysql'))
      }
      const previousCleanup = await closeResource()
      if (!previousCleanup.success)
        return previousCleanup
      const host = config.url ? new URL(config.url).hostname : config.host
      if (config.ssl && config.ssl.rejectUnauthorized && config.ssl.verifyIdentity && isIP(host.replace(/^\[|\]$/g, ''))) {
        return err(HaiReldbError.CONFIG_ERROR, reldbM('reldb_mysqlTlsDnsRequired'))
      }
      if (config.ssl && (!config.ssl.rejectUnauthorized || !config.ssl.verifyIdentity)) {
        logger.warn('MySQL TLS server verification is explicitly disabled', {
          certificateVerification: config.ssl.rejectUnauthorized,
          hostnameVerification: config.ssl.rejectUnauthorized && config.ssl.verifyIdentity,
        })
      }
      try {
        // Node ESM 按需加载驱动，避免构建器生成无法执行的动态 require。
        const mysql = createRequire(import.meta.url)('mysql2/promise')

        poolConfig = config.pool ?? MysqlPoolConfigSchema.parse({})
        pool = mysql.createPool({
          // mysql2 会用非空的分字段覆盖 URI；URL 模式不能传 schema 默认 host 或冲突字段。
          ...(config.url
            ? { uri: config.url }
            : { host: config.host, port: config.port, database: config.database, user: config.user, password: config.password }),
          ssl: config.ssl,
          connectionLimit: poolConfig.max,
          // 排队由本 Provider 管理，超时项可直接移除；驱动绝不保留取消后的等待者。
          waitForConnections: false,
          connectTimeout: poolConfig.acquireTimeout,
          charset: config.mysql?.charset ?? 'utf8mb4',
        }) as MysqlPool

        // 验证连接可用性
        await pool.query('SELECT 1')

        ready = true
        currentConfig = config
        logger.info('Connected to MySQL', config.url
          ? { target: core.sanitize.sanitizeUrl(config.url) }
          : { host: config.host, port: config.port, database: config.database })
        return ok(undefined)
      }
      catch (error) {
        const cleanup = await closeResource()
        const result = err(HaiReldbError.CONNECTION_FAILED, reldbM('reldb_mysqlConnectionFailed', { params: { error: String(error) } }), error)
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
