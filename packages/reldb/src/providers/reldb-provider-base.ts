/**
 * @h-ai/reldb — Provider 共享基础层
 *
 * 将三个 Provider（SQLite / PostgreSQL / MySQL）中的共性逻辑抽取为统一实现，
 * 包括 DDL 操作、SQL 操作、CRUD 管理器、事务句柄、tx.wrap 等。
 *
 * 各 Provider 只需提供 DdlDialect（SQL 方言差异）、RawExecutor（驱动适配）、
 * TxLifecycle（事务回调）即可获得完整的 ReldbProvider 能力。
 * @module reldb-provider-base
 */

import type { PaginatedResult, Result } from '@h-ai/core'
import type {
  CrudManager,
  DdlOperations,
  DmlOperations,
  DmlWithTxOperations,
  ExecuteResult,
  PaginationQueryOptions,
  ReldbColumnDef,
  ReldbError,
  ReldbIndexDef,
  ReldbTableDef,
  TxManager,
  TxWrapCallback,
} from '../reldb-types.js'

import { err, ok } from '@h-ai/core'

import { ReldbErrorCode } from '../reldb-config.js'
import { createCrud } from '../reldb-crud-kernel.js'
import { reldbM } from '../reldb-i18n.js'
import { buildPaginatedResult, normalizePagination, parseCount } from '../reldb-pagination.js'
import { escapeSqlString, quoteIdentifier, validateIdentifier, validateIdentifiers } from '../reldb-security.js'

// ─── RawExecutor 适配器 ───

/**
 * 原始 SQL 执行适配器
 *
 * 各 Provider 将原生驱动适配为此接口，由 base 层统一做 Result 包装与分页计算。
 * 实现方只需关注"如何执行 SQL"，不需关注 Result 包装、错误码、分页算法等。
 */
export interface RawExecutor {
  /** 执行查询，返回多行 */
  queryRows: (sql: string, params?: unknown[]) => Promise<unknown[]>
  /** 执行查询，返回首行或 undefined */
  getRow: (sql: string, params?: unknown[]) => Promise<unknown | undefined>
  /** 执行写操作（INSERT/UPDATE/DELETE），返回影响行数 */
  executeStmt: (sql: string, params?: unknown[]) => Promise<ExecuteResult>
  /** 批量执行多条语句（序列化执行） */
  batchStmts: (statements: Array<{ sql: string, params?: unknown[] }>) => Promise<void>
  /** 执行分页查询（COUNT + LIMIT/OFFSET） */
  queryPage: <T>(options: PaginationQueryOptions) => Promise<PaginatedResult<T>>
}

// ─── 事务生命周期回调 ───

/**
 * 事务生命周期回调
 *
 * 各 Provider 提供具体的 commit/rollback/release 操作及错误信息。
 */
export interface TxLifecycle {
  /** 提交事务的原始操作 */
  commit: () => Promise<void>
  /** 回滚事务的原始操作 */
  rollback: () => Promise<void>
  /** 释放资源（连接归还池等），commit/rollback 后调用 */
  release: () => void
  /** 创建事务错误消息 */
  errorMessage: (detail: string) => string
}

// ─── DDL 方言接口 ───

/**
 * DDL 方言配置
 *
 * 各 Provider 提供 SQL 方言差异部分，base 层统一处理校验、Result 包装与错误处理。
 */
export interface DdlDialect {
  /** 标识符引用（SQLite/PG 使用 quoteIdentifier，MySQL 使用反引号） */
  quoteId: (name: string) => string
  /** 列定义 → SQL 片段 */
  buildColumnSql: (name: string, def: ReldbColumnDef) => string
  /** 生成完整 CREATE TABLE SQL */
  buildCreateTableSql: (quotedTable: string, columns: ReldbTableDef, ifNotExists: boolean) => string
  /** 生成 RENAME TABLE SQL */
  buildRenameTableSql: (quotedOld: string, quotedNew: string) => string
  /** 生成 CREATE INDEX SQL */
  buildCreateIndexSql: (quotedTable: string, quotedIndex: string, indexDef: ReldbIndexDef) => string
  /** 生成 DROP INDEX SQL；返回 null 表示索引不存在且 ifExists=true */
  buildDropIndexSql: (indexName: string, ifExists: boolean) => Promise<Result<string | null, ReldbError>>
}

// ─── SQL 操作配置 ───

/**
 * SQL（DML）操作配置
 *
 * 各 Provider 提供执行器获取函数和批量执行实现，base 层统一处理连接检查与 Result 包装。
 */
export interface SqlOpsConfig {
  /** 获取 RawExecutor（含连接检查） */
  getExecutor: () => Result<RawExecutor, ReldbError>
  /** 错误消息生成 */
  errorMessage: (detail: string) => string
  /** 批量执行（各 DB 的批量事务机制不同） */
  batch: (statements: Array<{ sql: string, params?: unknown[] }>) => Promise<Result<void, ReldbError>>
}

// ─── 1. DDL 操作工厂 ───

/**
 * 默认 CREATE TABLE SQL 生成（SQLite / PostgreSQL 通用）
 *
 * 列定义内联主键和外键，无额外子句。
 */
export function buildDefaultCreateTableSql(
  dialect: DdlDialect,
  quotedTable: string,
  columns: ReldbTableDef,
  ifNotExists: boolean,
): string {
  const columnDefs = Object.entries(columns)
    .map(([name, def]) => dialect.buildColumnSql(name, def))
    .join(', ')
  const ifNotExistsClause = ifNotExists ? 'IF NOT EXISTS ' : ''
  return `CREATE TABLE ${ifNotExistsClause}${quotedTable} (${columnDefs})`
}

/**
 * 默认 CREATE INDEX SQL 生成（SQLite / PostgreSQL 通用）
 *
 * 支持 IF NOT EXISTS 与 WHERE 子句。
 */
export function buildDefaultCreateIndexSql(
  dialect: DdlDialect,
  quotedTable: string,
  quotedIndex: string,
  indexDef: ReldbIndexDef,
): string {
  const uniqueClause = indexDef.unique ? 'UNIQUE ' : ''
  const columns = indexDef.columns.map(c => dialect.quoteId(c)).join(', ')
  const whereClause = indexDef.where ? ` WHERE ${indexDef.where}` : ''
  return `CREATE ${uniqueClause}INDEX IF NOT EXISTS ${quotedIndex} ON ${quotedTable} (${columns})${whereClause}`
}

/**
 * 默认 RENAME TABLE SQL 生成（SQLite / PostgreSQL 通用）
 */
export function buildDefaultRenameTableSql(quotedOld: string, quotedNew: string): string {
  return `ALTER TABLE ${quotedOld} RENAME TO ${quotedNew}`
}

/**
 * 默认 DROP INDEX SQL 生成（SQLite / PostgreSQL 通用）
 */
export function buildDefaultDropIndexSql(
  dialect: DdlDialect,
  indexName: string,
  ifExists: boolean,
): Result<string | null, ReldbError> {
  const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
  return ok(`DROP INDEX ${ifExistsClause}${dialect.quoteId(indexName)}`)
}

/**
 * 通用 buildColumnSql 骨架
 *
 * 各 Provider 仅提供 typeMap 和 overrides 即可。
 */
export function buildColumnSqlBase(
  name: string,
  def: ReldbColumnDef,
  options: {
    /** 标识符引用函数 */
    quoteId: (n: string) => string
    /** ColumnType → SQL 类型字符串 */
    mapType: (def: ReldbColumnDef) => string
    /** 是否在列定义中内联 PRIMARY KEY（SQLite/PG true，MySQL false） */
    inlinePrimaryKey: boolean
    /** 自定义约束附加（返回额外 SQL 片段数组） */
    extraConstraints?: (def: ReldbColumnDef) => string[]
    /** 默认值格式化覆盖（返回 undefined 走通用逻辑，返回 null 跳过默认值） */
    formatDefault?: (def: ReldbColumnDef) => string | null | undefined
  },
): string {
  const parts: string[] = [options.quoteId(name)]

  parts.push(options.mapType(def))

  if (options.inlinePrimaryKey && def.primaryKey) {
    parts.push('PRIMARY KEY')
  }

  // 额外约束（如 AUTOINCREMENT、AUTO_INCREMENT、NOT NULL for PK 等）
  if (options.extraConstraints) {
    parts.push(...options.extraConstraints(def))
  }

  if (def.notNull && !def.primaryKey) {
    parts.push('NOT NULL')
  }

  if (def.unique && !def.primaryKey) {
    parts.push('UNIQUE')
  }

  // 默认值
  if (def.defaultValue !== undefined) {
    const custom = options.formatDefault?.(def)
    if (custom === null) {
      // null 表示跳过默认值（如 MySQL autoIncrement）
    }
    else if (custom !== undefined) {
      parts.push(custom)
    }
    else if (def.defaultValue === null) {
      parts.push('DEFAULT NULL')
    }
    else if (typeof def.defaultValue === 'string') {
      if (def.defaultValue.startsWith('(') && def.defaultValue.endsWith(')')) {
        parts.push(`DEFAULT ${def.defaultValue}`)
      }
      else {
        parts.push(`DEFAULT '${escapeSqlString(def.defaultValue)}'`)
      }
    }
    else {
      parts.push(`DEFAULT ${def.defaultValue}`)
    }
  }

  // 外键引用（内联模式）
  if (options.inlinePrimaryKey && def.references) {
    parts.push(`REFERENCES ${quoteIdentifier(def.references.table)}(${quoteIdentifier(def.references.column)})`)
    if (def.references.onDelete) {
      parts.push(`ON DELETE ${def.references.onDelete}`)
    }
    if (def.references.onUpdate) {
      parts.push(`ON UPDATE ${def.references.onUpdate}`)
    }
  }

  return parts.join(' ')
}

/**
 * 创建 DDL 操作
 *
 * 统一校验、SQL 生成（委托 dialect）、Result 包装。
 *
 * @param config - DDL 配置
 * @param config.ensureReady - 连接检查
 * @param config.executeDdl - 执行 DDL SQL
 * @param config.dialect - SQL 方言
 * @returns ReldbDdlOperations
 */
export function createDdlOps(config: {
  /** 连接检查，返回 err 说明未连接 */
  ensureReady: () => Result<void, ReldbError>
  /** 执行 DDL SQL */
  executeDdl: (sql: string) => Promise<void>
  /** SQL 方言 */
  dialect: DdlDialect
}): DdlOperations {
  const { ensureReady, executeDdl, dialect } = config

  /** 统一执行 DDL：校验连接 → 执行 → Result 包装 */
  async function runDdl(sql: string): Promise<Result<void, ReldbError>> {
    const ready = ensureReady()
    if (!ready.success)
      return ready
    try {
      await executeDdl(sql)
      return ok(undefined)
    }
    catch (error) {
      return err({
        code: ReldbErrorCode.DDL_FAILED,
        message: reldbM('reldb_ddlFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  return {
    async createTable(tableName, columns, ifNotExists = true) {
      const tableValid = validateIdentifier(tableName)
      if (!tableValid.success)
        return tableValid
      const colsValid = validateIdentifiers(Object.keys(columns))
      if (!colsValid.success)
        return colsValid

      const quotedTable = dialect.quoteId(tableName)
      const sql = dialect.buildCreateTableSql(quotedTable, columns, ifNotExists)
      return runDdl(sql)
    },

    async dropTable(tableName, ifExists = true) {
      const tableValid = validateIdentifier(tableName)
      if (!tableValid.success)
        return tableValid

      const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
      return runDdl(`DROP TABLE ${ifExistsClause}${dialect.quoteId(tableName)}`)
    },

    async addColumn(tableName, columnName, columnDef) {
      const tableValid = validateIdentifier(tableName)
      if (!tableValid.success)
        return tableValid
      const colValid = validateIdentifier(columnName)
      if (!colValid.success)
        return colValid

      const colSql = dialect.buildColumnSql(columnName, columnDef)
      return runDdl(`ALTER TABLE ${dialect.quoteId(tableName)} ADD COLUMN ${colSql}`)
    },

    async dropColumn(tableName, columnName) {
      const tableValid = validateIdentifier(tableName)
      if (!tableValid.success)
        return tableValid
      const colValid = validateIdentifier(columnName)
      if (!colValid.success)
        return colValid

      return runDdl(`ALTER TABLE ${dialect.quoteId(tableName)} DROP COLUMN ${dialect.quoteId(columnName)}`)
    },

    async renameTable(oldName, newName) {
      const oldValid = validateIdentifier(oldName)
      if (!oldValid.success)
        return oldValid
      const newValid = validateIdentifier(newName)
      if (!newValid.success)
        return newValid

      return runDdl(dialect.buildRenameTableSql(dialect.quoteId(oldName), dialect.quoteId(newName)))
    },

    async createIndex(tableName, indexName, indexDef) {
      const tableValid = validateIdentifier(tableName)
      if (!tableValid.success)
        return tableValid
      const idxValid = validateIdentifier(indexName)
      if (!idxValid.success)
        return idxValid
      const colsValid = validateIdentifiers(indexDef.columns)
      if (!colsValid.success)
        return colsValid

      return runDdl(dialect.buildCreateIndexSql(dialect.quoteId(tableName), dialect.quoteId(indexName), indexDef))
    },

    async dropIndex(indexName, ifExists = true) {
      const idxValid = validateIdentifier(indexName)
      if (!idxValid.success)
        return idxValid

      const sqlResult = await dialect.buildDropIndexSql(indexName, ifExists)
      if (!sqlResult.success)
        return sqlResult
      // null 表示索引不存在且 ifExists=true，静默成功
      if (sqlResult.data === null)
        return ok(undefined)
      return runDdl(sqlResult.data)
    },

    async raw(sql) {
      return runDdl(sql)
    },
  }
}

// ─── 2. SQL（DML）操作工厂 ───

/**
 * 创建 SQL（DML）操作
 *
 * 统一连接检查 + Result 包装。各 Provider 只需提供 getExecutor 和 batch。
 *
 * @param config - SQL 操作配置
 * @returns DataOperations
 */
export function createSqlOps(config: SqlOpsConfig): DmlOperations {
  const { getExecutor, errorMessage, batch } = config

  return {
    async query<T>(sql: string, params?: unknown[]) {
      const execResult = getExecutor()
      if (!execResult.success)
        return execResult
      try {
        const rows = await execResult.data.queryRows(sql, params)
        return ok(rows as T[])
      }
      catch (error) {
        return err({ code: ReldbErrorCode.QUERY_FAILED, message: errorMessage(String(error)), cause: error })
      }
    },

    async get<T>(sql: string, params?: unknown[]) {
      const execResult = getExecutor()
      if (!execResult.success)
        return execResult
      try {
        const row = await execResult.data.getRow(sql, params)
        return ok((row as T) ?? null)
      }
      catch (error) {
        return err({ code: ReldbErrorCode.QUERY_FAILED, message: errorMessage(String(error)), cause: error })
      }
    },

    async execute(sql: string, params?: unknown[]) {
      const execResult = getExecutor()
      if (!execResult.success)
        return execResult
      try {
        return ok(await execResult.data.executeStmt(sql, params))
      }
      catch (error) {
        return err({ code: ReldbErrorCode.QUERY_FAILED, message: errorMessage(String(error)), cause: error })
      }
    },

    batch,

    async queryPage<T>(options: PaginationQueryOptions) {
      const execResult = getExecutor()
      if (!execResult.success)
        return execResult
      try {
        return ok(await execResult.data.queryPage<T>(options))
      }
      catch (error) {
        return err({ code: ReldbErrorCode.QUERY_FAILED, message: errorMessage(String(error)), cause: error })
      }
    },
  }
}

// ─── 3. CRUD 管理器工厂 ───

/**
 * 创建 CRUD 管理器
 *
 * @param ops - 数据操作接口
 * @returns CRUD 管理器
 */
export function createCrudManager(ops: DmlOperations): CrudManager {
  return {
    table: config => createCrud(ops, config),
  }
}

// ─── 4. 事务句柄组装 ───

/**
 * 组装完整的 ReldbTxHandle
 *
 * 内部自动管理：
 * - ensureActive 守卫（commit/rollback 后拒绝操作）
 * - DataOperations（委托给 RawExecutor，带守卫）
 * - crud（基于 DataOperations 创建）
 * - commit/rollback（调用回调 + 标记非活跃 + 释放资源）
 *
 * @param raw - 事务连接的 RawExecutor
 * @param lifecycle - 事务生命周期回调
 * @returns 完整的事务句柄
 */
export function createTxOps(raw: RawExecutor, lifecycle: TxLifecycle): DmlWithTxOperations {
  let active = true

  const ensureActive = (): Result<void, ReldbError> => {
    if (!active) {
      return err({
        code: ReldbErrorCode.TRANSACTION_FAILED,
        message: lifecycle.errorMessage('transaction finished'),
      })
    }
    return ok(undefined)
  }

  // 带守卫的 DmlOperations（复用 createSqlOps，getExecutor 始终返回当前事务的 executor）
  const baseOps = createSqlOps({
    getExecutor: () => ok(raw),
    errorMessage: detail => lifecycle.errorMessage(detail),
    batch: async (statements) => {
      try {
        await raw.batchStmts(statements)
        return ok(undefined)
      }
      catch (error) {
        return err({ code: ReldbErrorCode.QUERY_FAILED, message: lifecycle.errorMessage(String(error)), cause: error })
      }
    },
  })

  const guardedOps: DmlOperations = {
    async query<T>(sql: string, params?: unknown[]): Promise<Result<T[], ReldbError>> {
      const check = ensureActive()
      if (!check.success)
        return check
      return baseOps.query<T>(sql, params)
    },
    async get<T>(sql: string, params?: unknown[]): Promise<Result<T | null, ReldbError>> {
      const check = ensureActive()
      if (!check.success)
        return check
      return baseOps.get<T>(sql, params)
    },
    async execute(sql: string, params?: unknown[]): Promise<Result<ExecuteResult, ReldbError>> {
      const check = ensureActive()
      if (!check.success)
        return check
      return baseOps.execute(sql, params)
    },
    async batch(statements: Array<{ sql: string, params?: unknown[] }>): Promise<Result<void, ReldbError>> {
      const check = ensureActive()
      if (!check.success)
        return check
      return baseOps.batch(statements)
    },
    async queryPage<T>(options: PaginationQueryOptions): Promise<Result<PaginatedResult<T>, ReldbError>> {
      const check = ensureActive()
      if (!check.success)
        return check
      return baseOps.queryPage<T>(options)
    },
  }

  return {
    ...guardedOps,
    crud: createCrudManager(guardedOps),

    async commit(): Promise<Result<void, ReldbError>> {
      const check = ensureActive()
      if (!check.success)
        return check
      try {
        await lifecycle.commit()
        active = false
        return ok(undefined)
      }
      catch (error) {
        active = false
        return err({
          code: ReldbErrorCode.TRANSACTION_FAILED,
          message: lifecycle.errorMessage(String(error)),
          cause: error,
        })
      }
      finally {
        lifecycle.release()
      }
    },

    async rollback(): Promise<Result<void, ReldbError>> {
      const check = ensureActive()
      if (!check.success)
        return check
      try {
        await lifecycle.rollback()
        active = false
        return ok(undefined)
      }
      catch (error) {
        active = false
        return err({
          code: ReldbErrorCode.TRANSACTION_FAILED,
          message: lifecycle.errorMessage(String(error)),
          cause: error,
        })
      }
      finally {
        lifecycle.release()
      }
    },
  }
}

// ─── 5. tx.wrap 统一实现 ───

/**
 * 创建统一的 tx.wrap 函数
 *
 * @param beginTx - 开启事务函数
 * @param errorMessage - 错误消息生成函数
 * @returns tx.wrap 函数
 */
export function createTxWrap(
  beginTx: () => Promise<Result<DmlWithTxOperations, ReldbError>>,
  errorMessage: (detail: string) => string,
): TxManager['wrap'] {
  return async <T>(fn: TxWrapCallback<T>): Promise<Result<T, ReldbError>> => {
    const txResult = await beginTx()
    if (!txResult.success)
      return txResult

    try {
      const result = await fn(txResult.data)
      const commitResult = await txResult.data.commit()
      if (!commitResult.success) {
        return commitResult as Result<T, ReldbError>
      }
      return ok(result)
    }
    catch (error) {
      await txResult.data.rollback()
      return err({
        code: ReldbErrorCode.TRANSACTION_FAILED,
        message: errorMessage(String(error)),
        cause: error,
      })
    }
  }
}

// ─── 6. 通用分页查询执行器 ───

/**
 * 通用异步分页查询
 *
 * 使用独立的 COUNT(*) 查询获取总数，再执行 LIMIT/OFFSET 获取当前页数据。
 *
 * @param queryRows - 查询多行的原始函数
 * @param options - 分页查询参数
 * @returns 分页结果
 */
export async function queryPageAsync<T>(
  queryRows: (sql: string, params?: unknown[]) => Promise<unknown[]>,
  options: PaginationQueryOptions,
): Promise<PaginatedResult<T>> {
  const pagination = normalizePagination(options.pagination, options.overrides)

  // 独立 COUNT 查询
  const countSql = `SELECT COUNT(*) as cnt FROM (${options.sql}) AS t`
  const countRows = await queryRows(countSql, options.params)
  const total = (countRows as Record<string, unknown>[]).length > 0
    ? parseCount((countRows as Record<string, unknown>[])[0])
    : 0

  // 数据查询
  const dataSql = `${options.sql} LIMIT ? OFFSET ?`
  const dataParams = [...(options.params ?? []), pagination.limit, pagination.offset]
  const rows = await queryRows(dataSql, dataParams)

  return buildPaginatedResult(rows as T[], total, pagination)
}
