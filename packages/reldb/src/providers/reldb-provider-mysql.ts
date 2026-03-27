/**
 * @h-ai/reldb — MySQL Provider
 *
 * 基于 mysql2 的 MySQL 数据库实现。
 * 按 Context + wrapOp → Factory 模式实现。
 * @module reldb-provider-mysql
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
import { HaiReldbError } from '../reldb-types.js'

import {
  buildColumnSqlBase,
} from './reldb-ddl-builder.js'
import { createBaseCrudManager, createBaseDdlOps, createBaseDmlOps, createBaseTxManager, queryPageAsync } from './reldb-provider-base.js'
import { createTxHandle } from './reldb-tx-assembler.js'

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

  // ─── 操作上下文 ───

  const ctx: ReldbOpsContext = {
    isConnected: () => pool !== null,
    logger,
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
    queryFn: (sql: string, values?: unknown[]) => Promise<[unknown[], unknown]>,
    indexName: string,
  ): Promise<HaiResult<string | null>> {
    try {
      const [rows] = await queryFn(
        'SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = ? LIMIT 1',
        [indexName],
      )
      const data = rows as Array<{ name: string }>
      return ok(data[0]?.name ?? null)
    }
    catch (error) {
      return err(HaiReldbError.QUERY_FAILED, reldbM('reldb_queryFailed', { params: { error: String(error) } }), error)
    }
  }

  // ─── MySQL 方言辅助 ───

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

  const rawDdl: DdlOperations = {
    async createTable(name, columns, ifNotExists = true) {
      const quotedTable = mysqlQuoteId(name)
      const sql = mysqlBuildCreateTableSql(quotedTable, columns, ifNotExists)
      await pool!.query(sql)
      return ok(undefined)
    },
    async dropTable(name, ifExists) {
      const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
      await pool!.query(`DROP TABLE ${ifExistsClause}${mysqlQuoteId(name)}`)
      return ok(undefined)
    },
    async addColumn(table, column, def) {
      const colSql = mysqlBuildColumnSql(column, def)
      await pool!.query(`ALTER TABLE ${mysqlQuoteId(table)} ADD COLUMN ${colSql}`)
      return ok(undefined)
    },
    async dropColumn(table, column) {
      await pool!.query(`ALTER TABLE ${mysqlQuoteId(table)} DROP COLUMN ${mysqlQuoteId(column)}`)
      return ok(undefined)
    },
    async renameTable(oldName, newName) {
      await pool!.query(`RENAME TABLE ${mysqlQuoteId(oldName)} TO ${mysqlQuoteId(newName)}`)
      return ok(undefined)
    },
    async createIndex(table, index, def) {
      const uniqueClause = def.unique ? 'UNIQUE ' : ''
      const columns = def.columns.map(c => mysqlQuoteId(c)).join(', ')
      await pool!.query(`CREATE ${uniqueClause}INDEX ${mysqlQuoteId(index)} ON ${mysqlQuoteId(table)} (${columns})`)
      return ok(undefined)
    },
    async dropIndex(index, ifExists) {
      const tableResult = await findIndexTableName((s, v) => pool!.query(s, v), index)
      if (!tableResult.success)
        return tableResult

      if (!tableResult.data) {
        if (ifExists)
          return ok(undefined)
        return err(HaiReldbError.DDL_FAILED, reldbM('reldb_ddlFailed', { params: { error: `index not found: ${index}` } }))
      }

      await pool!.query(`DROP INDEX ${mysqlQuoteId(index)} ON ${mysqlQuoteId(tableResult.data)}`)
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
      const [rows] = await pool!.query(sql, params)
      return ok(rows as T[])
    },
    async get<T>(sql: string, params?: unknown[]): Promise<HaiResult<T | null>> {
      const [rows] = await pool!.query(sql, params)
      return ok(((rows as unknown[])[0] as T) ?? null)
    },
    async execute(sql: string, params?: unknown[]): Promise<HaiResult<ExecuteResult>> {
      const [result] = await pool!.execute(sql, params)
      return ok({ changes: result.affectedRows, lastInsertRowid: result.insertId })
    },
    async batch(statements) {
      let connection: MysqlConnection | null = null
      try {
        connection = await pool!.getConnection()
        await connection.beginTransaction()
        for (const { sql: s, params } of statements) {
          await connection.execute(s, params)
        }
        await connection.commit()
        return ok(undefined)
      }
      catch (error) {
        if (connection) {
          await connection.rollback().catch(() => { })
        }
        return err(HaiReldbError.QUERY_FAILED, reldbM('reldb_batchFailed', { params: { error: String(error) } }), error)
      }
      finally {
        if (connection) {
          connection.release()
        }
      }
    },
    async queryPage<T>(options: PaginationQueryOptions): Promise<HaiResult<PaginatedResult<T>>> {
      const result = await queryPageAsync<T>(
        async (sql, params) => {
          const [rows] = await pool!.query(sql, params)
          return rows as unknown[]
        },
        options,
      )
      return ok(result)
    },
  }

  // ─── 事务 ───

  /** 创建事务连接上的 DML 操作 */
  function createMysqlTxDmlOps(conn: MysqlConnection): DmlOperations {
    return {
      async query<T>(sql: string, params?: unknown[]): Promise<HaiResult<T[]>> {
        const [rows] = await conn.query(sql, params)
        return ok(rows as T[])
      },
      async get<T>(sql: string, params?: unknown[]): Promise<HaiResult<T | null>> {
        const [rows] = await conn.query(sql, params)
        return ok(((rows as unknown[])[0] as T) ?? null)
      },
      async execute(sql: string, params?: unknown[]): Promise<HaiResult<ExecuteResult>> {
        const [result] = await conn.execute(sql, params)
        return ok({ changes: result.affectedRows, lastInsertRowid: result.insertId })
      },
      async batch(statements) {
        for (const { sql: s, params } of statements) {
          await conn.execute(s, params)
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
    let connection: MysqlConnection | null = null

    try {
      connection = await pool!.getConnection()
      await connection.beginTransaction()
    }
    catch (error) {
      if (connection) {
        connection.release()
      }
      return err(HaiReldbError.TRANSACTION_FAILED, mysqlTxErrorMessage(String(error)), error)
    }

    const txDmlOps = createMysqlTxDmlOps(connection)
    return ok(createTxHandle(txDmlOps, {
      commit: async () => { await connection!.commit() },
      rollback: async () => { await connection!.rollback() },
      release: () => connection!.release(),
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

      try {
        // eslint-disable-next-line ts/no-require-imports -- 按需加载
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
        return err(HaiReldbError.CONNECTION_FAILED, reldbM('reldb_mysqlConnectionFailed', { params: { error: String(error) } }), error)
      }
    },

    async close(): Promise<HaiResult<void>> {
      if (pool) {
        try {
          await pool.end()
        }
        catch (error) {
          pool = null
          return err(HaiReldbError.CONNECTION_FAILED, reldbM('reldb_mysqlConnectionFailed', { params: { error: String(error) } }), error)
        }
        pool = null
        logger.info('Disconnected from MySQL')
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
