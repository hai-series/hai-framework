/**
 * @h-ai/reldb — Provider 共享基础层
 *
 * Provider 共享基础层：Context + wrapOp → Factory 模式。
 *
 * 各 Provider 只需提供 raw DdlOperations / DmlOperations / beginTx，
 * base 层统一处理连接守卫、运行时异常捕获与 Result 包装。
 * @module reldb-provider-base
 */

import type { HaiErrorDef, HaiResult, PaginatedResult } from '@h-ai/core'

import type {
  CrudManager,
  DdlOperations,
  DmlOperations,
  PaginationQueryOptions,
  TxManager,
} from '../reldb-types.js'

import { err } from '@h-ai/core'
import { createCrud } from '../reldb-crud-kernel.js'
import { reldbM } from '../reldb-i18n.js'
import { buildPaginatedResult, normalizePagination, parseCount } from '../reldb-pagination.js'
import { validateIdentifier, validateIdentifiers } from '../reldb-security.js'
import { HaiReldbError } from '../reldb-types.js'
import { createTxWrap } from './reldb-tx-assembler.js'

// ─── 操作上下文 ───

/**
 * 操作上下文：由 Provider 在创建 ops 时传入
 *
 * 对标 VecdbOpsContext：统一的连接状态检查 + 日志记录。
 */
export interface ReldbOpsContext {
  /** 连接状态检查 */
  isConnected: () => boolean
  /** Logger 实例（用于运行时异常的错误日志） */
  logger: {
    error: (msg: string, meta?: Record<string, unknown>) => void
  }
}

// ─── 统一操作包装器 ───

/**
 * 统一操作包装器：guard → delegate → catch-all
 *
 * 对标 vecdb wrapOp：
 * 1. 连接守卫：未初始化时直接返回 NOT_INITIALIZED
 * 2. 委托给 raw ops 执行（raw ops 内部用 Result 表达业务错误）
 * 3. catch-all 安全网：捕获 raw ops 未预期的运行时异常
 */
async function wrapOp<T>(
  ctx: ReldbOpsContext,
  fn: () => Promise<HaiResult<T>>,
  errorDef: HaiErrorDef,
  errorLabel: string,
  errorMeta?: Record<string, unknown>,
): Promise<HaiResult<T>> {
  if (!ctx.isConnected()) {
    return err(HaiReldbError.NOT_INITIALIZED, reldbM('reldb_notInitialized'))
  }
  try {
    return await fn()
  }
  catch (error) {
    ctx.logger.error(errorLabel, { ...errorMeta, error })
    return err(errorDef, reldbM('reldb_queryFailed', { params: { error: String(error) } }), error)
  }
}

// ─── DDL 操作工厂 ───

/**
 * 创建标准 DDL 操作
 *
 * 各 Provider 只需提供 raw DdlOperations，base 层统一处理标识符校验、连接守卫与运行时异常。
 */
export function createBaseDdlOps(ctx: ReldbOpsContext, raw: DdlOperations): DdlOperations {
  return {
    createTable(tableName, columns, ifNotExists = true) {
      const v1 = validateIdentifier(tableName)
      if (!v1.success)
        return Promise.resolve(v1)
      const v2 = validateIdentifiers(Object.keys(columns))
      if (!v2.success)
        return Promise.resolve(v2)
      return wrapOp(ctx, () => raw.createTable(tableName, columns, ifNotExists), HaiReldbError.DDL_FAILED, 'DDL: createTable failed', { tableName })
    },

    dropTable(tableName, ifExists = true) {
      const v = validateIdentifier(tableName)
      if (!v.success)
        return Promise.resolve(v)
      return wrapOp(ctx, () => raw.dropTable(tableName, ifExists), HaiReldbError.DDL_FAILED, 'DDL: dropTable failed', { tableName })
    },

    addColumn(tableName, columnName, columnDef) {
      const v1 = validateIdentifier(tableName)
      if (!v1.success)
        return Promise.resolve(v1)
      const v2 = validateIdentifier(columnName)
      if (!v2.success)
        return Promise.resolve(v2)
      return wrapOp(ctx, () => raw.addColumn(tableName, columnName, columnDef), HaiReldbError.DDL_FAILED, 'DDL: addColumn failed', { tableName, columnName })
    },

    dropColumn(tableName, columnName) {
      const v1 = validateIdentifier(tableName)
      if (!v1.success)
        return Promise.resolve(v1)
      const v2 = validateIdentifier(columnName)
      if (!v2.success)
        return Promise.resolve(v2)
      return wrapOp(ctx, () => raw.dropColumn(tableName, columnName), HaiReldbError.DDL_FAILED, 'DDL: dropColumn failed', { tableName, columnName })
    },

    renameTable(oldName, newName) {
      const v1 = validateIdentifier(oldName)
      if (!v1.success)
        return Promise.resolve(v1)
      const v2 = validateIdentifier(newName)
      if (!v2.success)
        return Promise.resolve(v2)
      return wrapOp(ctx, () => raw.renameTable(oldName, newName), HaiReldbError.DDL_FAILED, 'DDL: renameTable failed', { oldName, newName })
    },

    createIndex(tableName, indexName, indexDef) {
      const v1 = validateIdentifier(tableName)
      if (!v1.success)
        return Promise.resolve(v1)
      const v2 = validateIdentifier(indexName)
      if (!v2.success)
        return Promise.resolve(v2)
      const v3 = validateIdentifiers(indexDef.columns)
      if (!v3.success)
        return Promise.resolve(v3)
      return wrapOp(ctx, () => raw.createIndex(tableName, indexName, indexDef), HaiReldbError.DDL_FAILED, 'DDL: createIndex failed', { tableName, indexName })
    },

    dropIndex(indexName, ifExists = true) {
      const v = validateIdentifier(indexName)
      if (!v.success)
        return Promise.resolve(v)
      return wrapOp(ctx, () => raw.dropIndex(indexName, ifExists), HaiReldbError.DDL_FAILED, 'DDL: dropIndex failed', { indexName })
    },

    raw(sql) {
      return wrapOp(ctx, () => raw.raw(sql), HaiReldbError.DDL_FAILED, 'DDL: raw failed')
    },
  }
}

// ─── DML 操作工厂 ───

/**
 * 创建标准 DML 操作
 *
 * 各 Provider 只需提供 raw DmlOperations，base 层统一处理连接守卫与运行时异常。
 */
export function createBaseDmlOps(ctx: ReldbOpsContext, raw: DmlOperations): DmlOperations {
  return {
    query: (sql, params) => wrapOp(ctx, () => raw.query(sql, params), HaiReldbError.QUERY_FAILED, 'DML: query failed'),
    get: (sql, params) => wrapOp(ctx, () => raw.get(sql, params), HaiReldbError.QUERY_FAILED, 'DML: get failed'),
    execute: (sql, params) => wrapOp(ctx, () => raw.execute(sql, params), HaiReldbError.QUERY_FAILED, 'DML: execute failed'),
    batch: stmts => wrapOp(ctx, () => raw.batch(stmts), HaiReldbError.QUERY_FAILED, 'DML: batch failed'),
    queryPage: options => wrapOp(ctx, () => raw.queryPage(options), HaiReldbError.QUERY_FAILED, 'DML: queryPage failed'),
  }
}

// ─── 事务管理器工厂 ───

/**
 * 创建标准事务管理器
 *
 * 各 Provider 只需提供 beginTx 函数，base 层统一处理连接守卫 + tx.wrap 语法糖。
 */
export function createBaseTxManager(ctx: ReldbOpsContext, beginTx: TxManager['begin']): TxManager {
  const begin: TxManager['begin'] = () => wrapOp(ctx, beginTx, HaiReldbError.TRANSACTION_FAILED, 'TX: begin failed')
  return {
    begin,
    wrap: createTxWrap(begin),
  }
}

// ─── CRUD 管理器工厂 ───

/**
 * 创建 CRUD 管理器
 *
 * @param ops - DML 操作接口
 * @returns CRUD 管理器
 */
export function createBaseCrudManager(ops: DmlOperations): CrudManager {
  return {
    table: config => createCrud(ops, config),
  }
}

// ─── 通用分页查询执行器 ───

/**
 * 通用异步分页查询
 *
 * 使用独立的 COUNT(*) 查询获取总数，再执行 LIMIT/OFFSET 获取当前页数据。
 * 各 Provider 在实现 DmlOperations.queryPage 时使用此函数。
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
