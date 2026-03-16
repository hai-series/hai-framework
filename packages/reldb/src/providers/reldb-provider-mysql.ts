/**
 * @h-ai/reldb — MySQL Provider
 *
 * 基于 mysql2 的 MySQL 数据库实现。
 * @module reldb-provider-mysql
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
import {
  buildColumnSqlBase,
  createCrudManager,
  createDdlOps,
  createSqlOps,
  createTxOps,
  createTxWrap,
  queryPageAsync,
} from './reldb-provider-base.js'

const logger = core.logger.child({ module: 'reldb', scope: 'mysql' })

// ─── mysql2 类型定义（避免强依赖） ───

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

// ─── MySQL Provider 实现 ───

/**
 * 创建 MySQL Provider 实例
 *
 * @returns MySQL Provider
 */
export function createMysqlProvider(): ReldbProvider {
  /** 连接池实例 */
  let pool: MysqlPool | null = null

  // ─── 辅助函数 ───

  /** MySQL 标识符引用（反引号） */
  function mysqlQuoteId(name: string): string {
    return `\`${name}\``
  }

  /**
   * 确保数据库已连接
   */
  function ensureConnected(): Result<MysqlPool, ReldbError> {
    if (!pool) {
      return err({
        code: ReldbErrorCode.NOT_INITIALIZED,
        message: reldbM('reldb_notInitialized'),
      })
    }
    return ok(pool)
  }

  /**
   * 获取 RawExecutor（含连接检查）
   */
  function getExecutor(): Result<RawExecutor, ReldbError> {
    const connResult = ensureConnected()
    if (!connResult.success)
      return connResult
    return ok(createExecutor(
      (s, v) => connResult.data.query(s, v),
      (s, v) => connResult.data.execute(s, v),
    ))
  }

  /**
   * 将 mysql2 的 query/execute 接口适配为 RawExecutor
   *
   * @param queryFn - mysql2 query 函数（用于读操作）
   * @param executeFn - mysql2 execute 函数（用于写操作，预编译语句）
   * @returns RawExecutor 实例
   */
  function createExecutor(
    queryFn: (sql: string, values?: unknown[]) => Promise<[unknown[], unknown]>,
    executeFn: (sql: string, values?: unknown[]) => Promise<[MysqlResult, unknown]>,
  ): RawExecutor {
    return {
      queryRows: async (sql, params) => {
        const [rows] = await queryFn(sql, params)
        return rows as unknown[]
      },
      getRow: async (sql, params) => {
        const [rows] = await queryFn(sql, params)
        return (rows as unknown[])[0]
      },
      executeStmt: async (sql, params) => {
        const [result] = await executeFn(sql, params)
        return { changes: result.affectedRows, lastInsertRowid: result.insertId }
      },
      batchStmts: async (statements) => {
        for (const { sql: s, params } of statements) {
          await executeFn(s, params)
        }
      },
      queryPage: options => queryPageAsync(
        async (sql, params) => {
          const [rows] = await queryFn(sql, params)
          return rows as unknown[]
        },
        options,
      ),
    }
  }

  /** 错误消息生成 */
  function mysqlErrorMessage(detail: string): string {
    return reldbM('reldb_queryFailed', { params: { error: detail } })
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
    queryFn: (sql: string, values?: unknown[]) => Promise<[unknown[], unknown]>,
    indexName: string,
  ): Promise<Result<string | null, ReldbError>> {
    try {
      const [rows] = await queryFn(
        'SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = ? LIMIT 1',
        [indexName],
      )
      const data = rows as Array<{ name: string }>
      return ok(data[0]?.name ?? null)
    }
    catch (error) {
      return err({
        code: ReldbErrorCode.QUERY_FAILED,
        message: mysqlErrorMessage(String(error)),
        cause: error,
      })
    }
  }

  // ─── MySQL 方言 ───

  /** MySQL 列类型映射 */
  function mapMysqlType(def: ReldbColumnDef): string {
    switch (def.type) {
      case 'TEXT':
        return 'VARCHAR(255)'
      case 'INTEGER':
        return def.autoIncrement ? 'BIGINT' : 'INT'
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

  const mysqlDialect: DdlDialect = {
    quoteId: mysqlQuoteId,
    buildColumnSql: (name, def) => buildColumnSqlBase(name, def, {
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
    }),
    buildCreateTableSql: (quotedTable, columns, ifNotExists) => {
      const columnDefs: string[] = []
      let primaryKeyCol: string | null = null

      for (const [name, def] of Object.entries(columns)) {
        columnDefs.push(mysqlDialect.buildColumnSql(name, def))
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
    },
    buildRenameTableSql: (quotedOld, quotedNew) => `RENAME TABLE ${quotedOld} TO ${quotedNew}`,
    buildCreateIndexSql: (quotedTable, quotedIndex, indexDef) => {
      const uniqueClause = indexDef.unique ? 'UNIQUE ' : ''
      const columns = indexDef.columns.map(c => mysqlQuoteId(c)).join(', ')
      return `CREATE ${uniqueClause}INDEX ${quotedIndex} ON ${quotedTable} (${columns})`
    },
    buildDropIndexSql: async (indexName, ifExists) => {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      const tableResult = await findIndexTableName((s, v) => connResult.data.query(s, v), indexName)
      if (!tableResult.success)
        return tableResult

      if (!tableResult.data) {
        if (ifExists)
          return ok(null)
        return err({
          code: ReldbErrorCode.DDL_FAILED,
          message: reldbM('reldb_ddlFailed', { params: { error: `index not found: ${indexName}` } }),
        })
      }

      return ok(`DROP INDEX ${mysqlQuoteId(indexName)} ON ${mysqlQuoteId(tableResult.data)}`)
    },
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
    dialect: mysqlDialect,
  })

  const sql = createSqlOps({
    getExecutor,
    errorMessage: mysqlErrorMessage,
    batch: async (statements) => {
      const connResult = ensureConnected()
      if (!connResult.success)
        return connResult

      let connection: MysqlConnection | null = null
      try {
        connection = await connResult.data.getConnection()
        await connection.beginTransaction()
        const connExec = createExecutor(
          (s, v) => connection!.query(s, v),
          (s, v) => connection!.execute(s, v),
        )
        await connExec.batchStmts(statements)
        await connection.commit()
        return ok(undefined)
      }
      catch (error) {
        if (connection) {
          await connection.rollback().catch(() => { })
        }
        return err({
          code: ReldbErrorCode.QUERY_FAILED,
          message: reldbM('reldb_batchFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
      finally {
        if (connection) {
          connection.release()
        }
      }
    },
  })

  const crud = createCrudManager(sql)

  // ─── 事务操作实现 ───

  /**
   * 开启事务
   *
   * 从连接池获取独立连接，执行 beginTransaction，并返回事务句柄。
   * 事务完成后（commit/rollback）自动释放连接。
   *
   * @returns 事务句柄或错误
   */
  async function beginTransaction(): Promise<Result<DmlWithTxOperations, ReldbError>> {
    const connResult = ensureConnected()
    if (!connResult.success)
      return connResult

    let connection: MysqlConnection | null = null

    try {
      connection = await pool!.getConnection()
      await connection.beginTransaction()
    }
    catch (error) {
      if (connection) {
        connection.release()
      }
      return err({
        code: ReldbErrorCode.TRANSACTION_FAILED,
        message: mysqlTxErrorMessage(String(error)),
        cause: error,
      })
    }

    const connExec = createExecutor(
      (s, v) => connection!.query(s, v),
      (s, v) => connection!.execute(s, v),
    )
    return ok(createTxOps(connExec, {
      commit: async () => { await connection!.commit() },
      rollback: async () => { await connection!.rollback() },
      release: () => connection!.release(),
      errorMessage: mysqlTxErrorMessage,
    }))
  }

  const tx: TxManager = {
    begin: beginTransaction,
    wrap: createTxWrap(beginTransaction, mysqlTxErrorMessage),
  }

  // ─── Provider 接口实现 ───

  /**
   * 连接 MySQL 数据库
   */
  const connect: ReldbProvider['connect'] = async (config: ReldbConfig): Promise<Result<void, ReldbError>> => {
    if (config.type !== 'mysql') {
      return err({
        code: ReldbErrorCode.UNSUPPORTED_TYPE,
        message: reldbM('reldb_mysqlOnlyMysql'),
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

      // 验证连接可用性
      await pool.query('SELECT 1')

      logger.info('Connected to MySQL', { host: config.host, port: config.port, database: config.database })
      return ok(undefined)
    }
    catch (error) {
      pool = null
      return err({
        code: ReldbErrorCode.CONNECTION_FAILED,
        message: reldbM('reldb_mysqlConnectionFailed', { params: { error: String(error) } }),
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
          message: reldbM('reldb_mysqlConnectionFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
      pool = null
      logger.info('Disconnected from MySQL')
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
