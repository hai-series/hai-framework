/**
 * @h-ai/reldb — Provider 共享基础层
 *
 * Provider 共享基础层：Context + wrapOp → Factory 模式。
 *
 * 各 Provider 只需提供 raw DdlOperations / DmlOperations / beginTx，
 * base 层统一处理连接守卫、运行时异常捕获与 HaiResult 包装。
 * @module reldb-provider-base
 */

import type { HaiError, HaiErrorDef, HaiResult, PaginatedResult } from '@h-ai/core'

import type { ReldbOperationLogConfig } from '../reldb-config.js'
import type {
  CrudManager,
  DdlOperations,
  DmlOperations,
  PaginationQueryOptions,
  TxManager,
} from '../reldb-types.js'

import { core, err, ok } from '@h-ai/core'
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
 * @example 模块内部上下文
 * ```ts
 * function connected(ctx: ReldbOpsContext) {
 *   if (!ctx.isConnected()) return false
 *   ctx.logger.debug('Database ready', {})
 *   return true
 * }
 * ```
 */
export interface ReldbOpsContext {
  /** 连接状态检查 */
  isConnected: () => boolean
  /** Logger 实例（用于运行时异常的错误日志） */
  logger: {
    error: (msg: string, meta?: Record<string, unknown>) => void
    info: (msg: string, meta?: Record<string, unknown>) => void
    debug: (msg: string, meta?: Record<string, unknown>) => void
    trace: (msg: string, meta?: Record<string, unknown>) => void
  }
  /** 当前操作日志配置 */
  operationLog?: () => ReldbOperationLogConfig | undefined
}

/**
 * ReldbOperationCategory 的数据约束与操作契约。
 * @example 模块内部上下文
 * ```ts
 * const category: ReldbOperationCategory = 'read'
 * void category
 * ```
 */
type ReldbOperationCategory = 'read' | 'write'

/** 仅提取固定的数量信息；SQL 字面量、参数、默认值及错误对象不进入日志。 */
function summarizeOperationPayload(payload: unknown): Record<string, number> {
  try {
    if (!payload || typeof payload !== 'object')
      return {}
    const fields = payload as Record<string, unknown>
    return {
      ...(typeof fields.sql === 'string' ? { sqlLength: fields.sql.length } : {}),
      ...(Array.isArray(fields.params) ? { parameterCount: fields.params.length } : {}),
      ...(Array.isArray(fields.statements) ? { statementCount: fields.statements.length } : {}),
      ...(fields.columns && typeof fields.columns === 'object' ? { columnCount: Object.keys(fields.columns).length } : {}),
    }
  }
  catch {
    return {}
  }
}

/**
 * 记录不含 SQL 原文及绑定值的操作摘要。
 *
 * @param ctx - Provider 日志和配置上下文
 * @param category - 读取或写入类别
 * @param operation - 内部固定操作名
 * @param payload - 仅用于计算语句长度和参数数量，不序列化原值
 * @example 模块内部上下文
 * ```ts
 * function read(ctx: ReldbOpsContext) {
 *   logReldbOperation(ctx, 'read', 'sql.get', { sql: 'SELECT id FROM users WHERE id = ?', params: ['u1'] })
 * } // 日志仅记录 SQL 长度和参数数量。
 * ```
 */
export function logReldbOperation(
  ctx: ReldbOpsContext,
  category: ReldbOperationCategory,
  operation: string,
  payload: unknown,
): void {
  const config = ctx.operationLog?.()
  if (!config?.[category]) {
    return
  }

  ctx.logger[config.level]('RelDB operation executed', {
    category,
    operation,
    payload: config.maxLength <= 0 ? '' : JSON.stringify(summarizeOperationPayload(payload)).slice(0, config.maxLength),
  })
}

// ─── 统一操作包装器 ───

/**
 * 统一操作包装器：guard → delegate → catch-all
 *
 * 对标 vecdb wrapOp：
 * 1. 连接守卫：未初始化时直接返回 NOT_INITIALIZED
 * 2. 委托给 raw ops 执行（raw ops 内部用 HaiResult 表达业务错误）
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
  const failed = (error: unknown, original?: HaiError): HaiResult<T> => {
    let definition = original ?? errorDef
    const traceId = core.context.get().traceId ?? core.context.get().requestId ?? original?.traceId ?? core.id.uuid()
    const fields = error && typeof error === 'object' ? error as Record<string, unknown> : {}
    // 驱动差异在数据库层收敛；业务不解析本地化消息或依赖驱动类型。
    if (definition.code === HaiReldbError.QUERY_FAILED.code && (['23505', 'ER_DUP_ENTRY', 'SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY'].includes(String(fields.code)) || fields.errno === 1062))
      definition = HaiReldbError.DUPLICATE_ENTRY
    const secrets = new Set<string>()
    const seen = new WeakSet<object>()
    const collect = (value: unknown): void => {
      if (typeof value === 'string' && value) {
        secrets.add(value)
      }
      else if (typeof value === 'number' || typeof value === 'bigint') {
        secrets.add(String(value))
      }
      else if (value && typeof value === 'object' && !seen.has(value)) {
        seen.add(value)
        Object.values(value).forEach(collect)
      }
    }
    collect(errorMeta?.params)
    const payloads = [errorMeta, ...(Array.isArray(errorMeta?.statements) ? errorMeta.statements as Record<string, unknown>[] : [])]
    for (const payload of payloads) {
      collect(payload?.params)
      for (const match of (typeof payload?.sql === 'string' ? payload.sql : '').matchAll(/'((?:''|[^'])*)'/g))
        secrets.add(match[1].replaceAll('\'\'', '\''))
    }
    // 只复制驱动诊断白名单；完整 SQL、绑定参数和连接配置从不进入日志。
    const diagnostic: Record<string, unknown> = {}
    for (const key of ['name', 'message', 'stack', 'code', 'errno', 'sqlState', 'detail', 'hint', 'constraint', 'schema', 'routine', 'severity', 'table', 'column']) {
      const value: unknown = error instanceof Error && key === 'message' ? error.message : error instanceof Error && key === 'stack' ? error.stack : fields[key]
      if (typeof value === 'string') {
        if (['code', 'sqlState', 'schema', 'routine', 'severity', 'constraint', 'table', 'column'].includes(key)) {
          diagnostic[key] = core.sanitize.sanitizeText(value)
        }
        else {
          // 参数值只遮蔽诊断正文，不把数字参数误当成错误码或堆栈行号。
          const frames = key === 'stack' ? value.search(/^\s+at\s/m) : -1
          const body = frames < 0 ? value : value.slice(0, frames)
          diagnostic[key] = core.sanitize.sanitizeText(body, [...secrets]).replace(/'(?:''|[^'])*'/g, '\'[REDACTED]\'') + (frames < 0 ? '' : core.sanitize.sanitizeText(value.slice(frames)))
        }
      }
      else if (typeof value === 'number') {
        diagnostic[key] = value
      }
    }
    if (!Object.keys(diagnostic).length)
      diagnostic.message = core.sanitize.sanitizeText(String(error), [...secrets])
    ctx.logger.error(errorLabel, { ...summarizeOperationPayload(errorMeta), table: errorMeta?.tableName, column: errorMeta?.columnName, errorCode: definition.code, traceId, error: diagnostic })
    const key = definition.code === HaiReldbError.DDL_FAILED.code ? 'reldb_ddlFailed' : definition.code === HaiReldbError.TRANSACTION_FAILED.code ? 'reldb_txFailed' : 'reldb_queryFailed'
    return err({ ...definition, traceId, message: definition.code === HaiReldbError.DUPLICATE_ENTRY.code ? reldbM('reldb_duplicateEntry') : original ? core.sanitize.sanitizeText(original.message, [...secrets]) : reldbM(key), cause: diagnostic })
  }
  try {
    const result = await fn()
    return result.success ? result : failed(result.error.cause ?? result.error, result.error)
  }
  catch (error) {
    return failed(error)
  }
}

// ─── DDL 操作工厂 ───

/**
 * 创建标准 DDL 操作
 *
 * 各 Provider 只需提供 raw DdlOperations，base 层统一处理标识符校验、连接守卫与运行时异常。
 * @param ctx - 当前操作所需的输入；以声明类型和上文约束为准。
 * @param raw - 当前操作所需的输入；以声明类型和上文约束为准。
 * @returns 声明返回类型对应的操作结果。
 * @example 模块内部上下文
 * ```ts
 * function wrap(ctx: ReldbOpsContext, raw: DdlOperations) {
 *   return createBaseDdlOps(ctx, raw)
 * }
 * ```
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
      logReldbOperation(ctx, 'write', 'ddl.createTable', { tableName, columns, ifNotExists })
      return wrapOp(ctx, () => raw.createTable(tableName, columns, ifNotExists), HaiReldbError.DDL_FAILED, 'DDL: createTable failed', { tableName })
    },

    dropTable(tableName, ifExists = true) {
      const v = validateIdentifier(tableName)
      if (!v.success)
        return Promise.resolve(v)
      logReldbOperation(ctx, 'write', 'ddl.dropTable', { tableName, ifExists })
      return wrapOp(ctx, () => raw.dropTable(tableName, ifExists), HaiReldbError.DDL_FAILED, 'DDL: dropTable failed', { tableName })
    },

    addColumn(tableName, columnName, columnDef) {
      const v1 = validateIdentifier(tableName)
      if (!v1.success)
        return Promise.resolve(v1)
      const v2 = validateIdentifier(columnName)
      if (!v2.success)
        return Promise.resolve(v2)
      logReldbOperation(ctx, 'write', 'ddl.addColumn', { tableName, columnName, columnDef })
      return wrapOp(ctx, () => raw.addColumn(tableName, columnName, columnDef), HaiReldbError.DDL_FAILED, 'DDL: addColumn failed', { tableName, columnName })
    },

    dropColumn(tableName, columnName) {
      const v1 = validateIdentifier(tableName)
      if (!v1.success)
        return Promise.resolve(v1)
      const v2 = validateIdentifier(columnName)
      if (!v2.success)
        return Promise.resolve(v2)
      logReldbOperation(ctx, 'write', 'ddl.dropColumn', { tableName, columnName })
      return wrapOp(ctx, () => raw.dropColumn(tableName, columnName), HaiReldbError.DDL_FAILED, 'DDL: dropColumn failed', { tableName, columnName })
    },

    renameTable(oldName, newName) {
      const v1 = validateIdentifier(oldName)
      if (!v1.success)
        return Promise.resolve(v1)
      const v2 = validateIdentifier(newName)
      if (!v2.success)
        return Promise.resolve(v2)
      logReldbOperation(ctx, 'write', 'ddl.renameTable', { oldName, newName })
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
      logReldbOperation(ctx, 'write', 'ddl.createIndex', { tableName, indexName, indexDef })
      return wrapOp(ctx, () => raw.createIndex(tableName, indexName, indexDef), HaiReldbError.DDL_FAILED, 'DDL: createIndex failed', { tableName, indexName })
    },

    dropIndex(indexName, ifExists = true) {
      const v = validateIdentifier(indexName)
      if (!v.success)
        return Promise.resolve(v)
      logReldbOperation(ctx, 'write', 'ddl.dropIndex', { indexName, ifExists })
      return wrapOp(ctx, () => raw.dropIndex(indexName, ifExists), HaiReldbError.DDL_FAILED, 'DDL: dropIndex failed', { indexName })
    },

    raw(sql) {
      logReldbOperation(ctx, 'write', 'ddl.raw', { sql })
      return wrapOp(ctx, () => raw.raw(sql), HaiReldbError.DDL_FAILED, 'DDL: raw failed', { sql })
    },
  }
}

// ─── DML 操作工厂 ───

/**
 * 创建标准 DML 操作
 *
 * 各 Provider 只需提供 raw DmlOperations，base 层统一处理连接守卫与运行时异常。
 * @param ctx - 当前操作所需的输入；以声明类型和上文约束为准。
 * @param raw - 当前操作所需的输入；以声明类型和上文约束为准。
 * @returns 声明返回类型对应的操作结果。
 * @example 模块内部上下文
 * ```ts
 * function wrap(ctx: ReldbOpsContext, raw: DmlOperations) {
 *   return createBaseDmlOps(ctx, raw)
 * }
 * ```
 */
export function createBaseDmlOps(ctx: ReldbOpsContext, raw: DmlOperations): DmlOperations {
  return {
    query: (sql, params) => {
      logReldbOperation(ctx, 'read', 'query', { sql, params })
      return wrapOp(ctx, () => raw.query(sql, params), HaiReldbError.QUERY_FAILED, 'DML: query failed', { sql, params })
    },
    get: (sql, params) => {
      logReldbOperation(ctx, 'read', 'get', { sql, params })
      return wrapOp(ctx, () => raw.get(sql, params), HaiReldbError.QUERY_FAILED, 'DML: get failed', { sql, params })
    },
    execute: (sql, params) => {
      logReldbOperation(ctx, 'write', 'execute', { sql, params })
      return wrapOp(ctx, () => raw.execute(sql, params), HaiReldbError.QUERY_FAILED, 'DML: execute failed', { sql, params })
    },
    batch: (statements) => {
      logReldbOperation(ctx, 'write', 'batch', { count: statements.length, statements })
      return wrapOp(ctx, () => raw.batch(statements), HaiReldbError.QUERY_FAILED, 'DML: batch failed', { statements })
    },
    queryPage: (options) => {
      logReldbOperation(ctx, 'read', 'queryPage', options)
      return wrapOp(ctx, () => raw.queryPage(options), HaiReldbError.QUERY_FAILED, 'DML: queryPage failed', { ...options })
    },
  }
}

// ─── 事务管理器工厂 ───

/**
 * 创建标准事务管理器
 *
 * 各 Provider 只需提供 beginTx 函数，base 层统一处理连接守卫 + tx.wrap 语法糖。
 * @param ctx - 当前操作所需的输入；以声明类型和上文约束为准。
 * @param beginTx - 当前操作所需的输入；以声明类型和上文约束为准。
 * @returns 声明返回类型对应的操作结果。
 * @example 模块内部上下文
 * ```ts
 * function wrap(ctx: ReldbOpsContext, begin: () => Promise<HaiResult<import('../reldb-types.js').DmlWithTxOperations>>) {
 *   return createBaseTxManager(ctx, begin)
 * }
 * ```
 */
export function createBaseTxManager(ctx: ReldbOpsContext, beginTx: TxManager['begin']): TxManager {
  const begin: TxManager['begin'] = async () => {
    logReldbOperation(ctx, 'write', 'tx.begin', {})
    const result = await wrapOp(ctx, beginTx, HaiReldbError.TRANSACTION_FAILED, 'TX: begin failed')
    if (!result.success) {
      return result
    }

    const tx = result.data
    return ok({
      ...tx,
      commit: async () => {
        logReldbOperation(ctx, 'write', 'tx.commit', {})
        return tx.commit()
      },
      rollback: async () => {
        logReldbOperation(ctx, 'write', 'tx.rollback', {})
        return tx.rollback()
      },
    })
  }
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
 * @example 模块内部上下文
 * ```ts
 * function users(ops: DmlOperations) {
 *   return createBaseCrudManager(ops).table<{ id: string }>({ table: 'users', dbType: 'postgresql' })
 * }
 * ```
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
 * @example 模块内部上下文
 * ```ts
 * async function page(query: (sql: string, params?: unknown[]) => Promise<unknown[]>) {
 *   return queryPageAsync<{ id: string }>(query, { sql: 'SELECT id FROM users', pagination: { page: 1, pageSize: 10 } })
 * }
 * ```
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
