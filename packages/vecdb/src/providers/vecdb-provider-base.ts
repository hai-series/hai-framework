/**
 * @h-ai/vecdb — Provider 共享基础层
 *
 * 将各 Provider 的共性逻辑抽取为统一实现：连接守卫、运行时异常捕获、HaiResult 包装。
 *
 * 各 Provider 只需提供 CollectionDriver / VectorDriver（原始操作适配器），
 * base 层统一处理初始化检查与 catch-all 安全网。
 * @module vecdb-provider-base
 */

import type { HaiErrorDef, HaiResult } from '@h-ai/core'
import type { VecdbConfig, VecdbOperationLogConfig } from '../vecdb-config.js'
import type {
  CollectionCreateOptions,
  CollectionInfo,
  CollectionOperations,
  VectorDocument,
  VectorOperations,
  VectorSearchOptions,
  VectorSearchResult,
} from '../vecdb-types.js'

import { err, ok } from '@h-ai/core'

import { vecdbM } from '../vecdb-i18n.js'
import { HaiVecdbError } from '../vecdb-types.js'

// ─── Provider 接口（内部，不暴露给模块消费者） ───

/**
 * 向量数据库 Provider 接口
 *
 * 各后端实现需遵循此接口，提供统一的集合管理和向量操作能力。
 * @example 模块内部上下文
 * ```ts
 * async function list(provider: VecdbProvider, config: VecdbConfig) {
 *   const connected = await provider.connect(config)
 *   if (!connected.success) return connected
 *   try { return await provider.collection.list() } finally {
 *     const closed = await provider.close()
 *     if (!closed.success) throw new Error(closed.error.message)
 *   }
 * }
 * ```
 */
export interface VecdbProvider {
  /** Provider 名称标识 */
  readonly name: string
  /** 连接到向量数据库 */
  connect: (config: VecdbConfig) => Promise<HaiResult<void>>
  /** 关闭连接 */
  close: () => Promise<HaiResult<void>>
  /** 是否已连接 */
  isConnected: () => boolean
  /** 集合管理操作 */
  collection: CollectionOperations
  /** 向量操作 */
  vector: VectorOperations
}

// ─── 上下文与适配器接口 ───

/**
 * 操作上下文：由 Provider 在创建 ops 时传入
 * @example 模块内部上下文
 * ```ts
 * function collections(ctx: VecdbOpsContext, driver: CollectionDriver) {
 *   return createBaseCollectionOps(ctx, driver)
 * }
 * ```
 */
export interface VecdbOpsContext {
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
  operationLog?: () => VecdbOperationLogConfig | undefined
}

/**
 * 集合操作原始适配器
 *
 * Provider 将引擎特定的集合管理逻辑适配为此接口。
 * 实现方返回 HaiResult 以表达业务错误（如集合已存在）；
 * 未预期的运行时异常直接 throw，由 wrapOp 统一捕获。
 * @example 模块内部上下文
 * ```ts
 * function collections(ctx: VecdbOpsContext, driver: CollectionDriver) {
 *   const operations = createBaseCollectionOps(ctx, driver)
 *   return operations.list() // 公共包装负责连接守卫与异常转换。
 * }
 * ```
 */
export interface CollectionDriver {
  create: (name: string, options: CollectionCreateOptions) => Promise<HaiResult<void>>
  drop: (name: string) => Promise<HaiResult<void>>
  exists: (name: string) => Promise<HaiResult<boolean>>
  info: (name: string) => Promise<HaiResult<CollectionInfo>>
  list: () => Promise<HaiResult<string[]>>
}

/**
 * 向量操作原始适配器
 *
 * Provider 将引擎特定的向量管理逻辑适配为此接口。
 * 实现方返回 HaiResult 以表达业务错误（如集合不存在）；
 * 未预期的运行时异常直接 throw，由 wrapOp 统一捕获。
 * @example 模块内部上下文
 * ```ts
 * function search(ctx: VecdbOpsContext, driver: VectorDriver) {
 *   return createBaseVectorOps(ctx, driver).search('docs', [0.1, 0.2, 0.3], { topK: 5 })
 * }
 * ```
 */
export interface VectorDriver {
  insert: (collection: string, documents: VectorDocument[]) => Promise<HaiResult<void>>
  upsert: (collection: string, documents: VectorDocument[]) => Promise<HaiResult<void>>
  delete: (collection: string, ids: string[]) => Promise<HaiResult<void>>
  search: (
    collection: string,
    vector: number[],
    options?: VectorSearchOptions,
  ) => Promise<HaiResult<VectorSearchResult[]>>
  count: (collection: string) => Promise<HaiResult<number>>
}

// ─── 内部帮助 ───

/**
 * 决定操作日志是否按 read/write 开关输出的内部分类。
 * @example 模块内部上下文
 * ```ts
 * function logRead(ctx: VecdbOpsContext) {
 *   const category: VecdbOperationCategory = 'read'
 *   logVecdbOperation(ctx, category, 'collection.list', {})
 * }
 * ```
 */
type VecdbOperationCategory = 'read' | 'write'

function stringifyOperationPayload(payload: unknown, maxLength: number): string {
  if (maxLength <= 0) {
    return ''
  }

  try {
    const text = JSON.stringify(payload, (_key, value: unknown) => {
      if (typeof value === 'bigint') {
        return value.toString()
      }
      if (typeof value === 'function') {
        return '[Function]'
      }
      return value
    })
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  }
  catch {
    const text = String(payload)
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  }
}

/**
 * 按当前 Provider 配置输出可选操作日志；长度上限控制载荷，不接管连接生命周期。
 * @param ctx - 当前 Provider 的连接状态、日志与操作日志配置。
 * @param category - read 或 write，用于选择配置开关。
 * @param operation - 稳定的操作名称，用于诊断。
 * @param payload - 待截断序列化的诊断数据；不传入原始连接凭据。
 * @example 模块内部上下文
 * ```ts
 * function logRead(ctx: VecdbOpsContext) {
 *   logVecdbOperation(ctx, 'read', 'vector.count', { collection: 'docs' })
 * }
 * ```
 */
export function logVecdbOperation(
  ctx: VecdbOpsContext,
  category: VecdbOperationCategory,
  operation: string,
  payload: unknown,
): void {
  const config = ctx.operationLog?.()
  if (!config?.[category]) {
    return
  }

  ctx.logger[config.level]('VecDB operation executed', {
    category,
    operation,
    payload: stringifyOperationPayload(payload, config.maxLength),
  })
}

/** 根据错误定义获取对应的 i18n 错误消息 */
function errorMsgFromCode(def: HaiErrorDef, errorStr: string): string {
  switch (def) {
    case HaiVecdbError.DELETE_FAILED:
      return vecdbM('vecdb_deleteFailed', { params: { error: errorStr } })
    case HaiVecdbError.INSERT_FAILED:
      return vecdbM('vecdb_insertFailed', { params: { error: errorStr } })
    case HaiVecdbError.UPDATE_FAILED:
      return vecdbM('vecdb_updateFailed', { params: { error: errorStr } })
    default:
      return vecdbM('vecdb_queryFailed', { params: { error: errorStr } })
  }
}

/**
 * 统一操作包装器：guard → delegate → catch-all
 *
 * 1. 连接守卫：未初始化时直接返回 NOT_INITIALIZED
 * 2. 委托给 driver 执行（driver 内部用 HaiResult 表达业务错误）
 * 3. catch-all 安全网：捕获 driver 未预期的运行时异常
 */
async function wrapOp<T>(
  ctx: VecdbOpsContext,
  fn: () => Promise<HaiResult<T>>,
  errorDef: HaiErrorDef,
  errorLabel: string,
  errorMeta?: Record<string, unknown>,
): Promise<HaiResult<T>> {
  if (!ctx.isConnected()) {
    return err(HaiVecdbError.NOT_INITIALIZED, vecdbM('vecdb_notInitialized'))
  }
  try {
    return await fn()
  }
  catch (error) {
    ctx.logger.error(errorLabel, { ...errorMeta, error })
    return err(errorDef, errorMsgFromCode(errorDef, String(error)), error)
  }
}

// ─── 集合操作工厂 ───

/**
 * 创建标准集合操作
 *
 * 各 Provider 只需提供 CollectionDriver，base 层统一处理连接守卫与运行时异常。
 * @param ctx - 当前 Provider 的连接状态、日志与操作日志配置。
 * @param driver - 由引擎适配的原始集合或向量操作。
 * @returns 带连接守卫和 HaiResult 错误边界的公共操作。
 * @example 模块内部上下文
 * ```ts
 * function list(ctx: VecdbOpsContext, driver: CollectionDriver) {
 *   return createBaseCollectionOps(ctx, driver).list()
 * }
 * ```
 */
export function createBaseCollectionOps(ctx: VecdbOpsContext, driver: CollectionDriver): CollectionOperations {
  return {
    create: async (name, options) => {
      // 参数校验：dimension 必须为正整数（防止 pgvector SQL 插值注入）
      if (!Number.isInteger(options.dimension) || options.dimension <= 0) {
        return err(
          HaiVecdbError.DIMENSION_MISMATCH,
          vecdbM('vecdb_invalidDimension', { params: { dimension: String(options.dimension) } }),
        )
      }
      logVecdbOperation(ctx, 'write', 'collection.create', { name, options })
      return wrapOp(
        ctx,
        () => driver.create(name, options),
        HaiVecdbError.QUERY_FAILED,
        'Failed to create collection',
        { name },
      )
    },
    drop: (name) => {
      logVecdbOperation(ctx, 'write', 'collection.drop', { name })
      return wrapOp(
        ctx,
        () => driver.drop(name),
        HaiVecdbError.DELETE_FAILED,
        'Failed to drop collection',
        { name },
      )
    },
    exists: (name) => {
      logVecdbOperation(ctx, 'read', 'collection.exists', { name })
      return wrapOp(
        ctx,
        () => driver.exists(name),
        HaiVecdbError.QUERY_FAILED,
        'Failed to check collection',
        { name },
      )
    },
    info: (name) => {
      logVecdbOperation(ctx, 'read', 'collection.info', { name })
      return wrapOp(
        ctx,
        () => driver.info(name),
        HaiVecdbError.QUERY_FAILED,
        'Failed to get collection info',
        { name },
      )
    },
    list: () => {
      logVecdbOperation(ctx, 'read', 'collection.list', {})
      return wrapOp(
        ctx,
        () => driver.list(),
        HaiVecdbError.QUERY_FAILED,
        'Failed to list collections',
      )
    },
  }
}
// ─── 向量操作工厂 ───

/**
 * 创建标准向量操作
 *
 * 各 Provider 只需提供 VectorDriver，base 层统一处理连接守卫与运行时异常。
 * @param ctx - 当前 Provider 的连接状态、日志与操作日志配置。
 * @param driver - 由引擎适配的原始集合或向量操作。
 * @returns 带连接守卫和 HaiResult 错误边界的公共操作。
 * @example 模块内部上下文
 * ```ts
 * function search(ctx: VecdbOpsContext, driver: VectorDriver) {
 *   return createBaseVectorOps(ctx, driver).search('docs', [0.1, 0.2, 0.3], { topK: 5 })
 * }
 * ```
 */
export function createBaseVectorOps(ctx: VecdbOpsContext, driver: VectorDriver): VectorOperations {
  return {
    insert: (collection, documents) => {
      logVecdbOperation(ctx, 'write', 'vector.insert', { collection, count: documents.length, documents })
      return wrapOp(
        ctx,
        () => documents.length === 0 ? Promise.resolve(ok(undefined)) : driver.insert(collection, documents),
        HaiVecdbError.INSERT_FAILED,
        'Failed to insert vectors',
        { collection },
      )
    },
    upsert: (collection, documents) => {
      logVecdbOperation(ctx, 'write', 'vector.upsert', { collection, count: documents.length, documents })
      return wrapOp(
        ctx,
        () => documents.length === 0 ? Promise.resolve(ok(undefined)) : driver.upsert(collection, documents),
        HaiVecdbError.UPDATE_FAILED,
        'Failed to upsert vectors',
        { collection },
      )
    },
    delete: (collection, ids) => {
      logVecdbOperation(ctx, 'write', 'vector.delete', { collection, count: ids.length, ids })
      return wrapOp(
        ctx,
        () => ids.length === 0 ? Promise.resolve(ok(undefined)) : driver.delete(collection, ids),
        HaiVecdbError.DELETE_FAILED,
        'Failed to delete vectors',
        { collection },
      )
    },
    search: (collection, vector, options) => {
      logVecdbOperation(ctx, 'read', 'vector.search', { collection, vector, options })
      return wrapOp(
        ctx,
        () => driver.search(collection, vector, options),
        HaiVecdbError.QUERY_FAILED,
        'Failed to search vectors',
        { collection },
      )
    },
    count: (collection) => {
      logVecdbOperation(ctx, 'read', 'vector.count', { collection })
      return wrapOp(
        ctx,
        () => driver.count(collection),
        HaiVecdbError.QUERY_FAILED,
        'Failed to count vectors',
        { collection },
      )
    },
  }
}
