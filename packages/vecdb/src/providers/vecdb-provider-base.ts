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
import type { VecdbConfig } from '../vecdb-config.js'
import type {
  CollectionCreateOptions,
  CollectionInfo,
  CollectionOperations,
  VectorDocument,
  VectorOperations,
  VectorSearchOptions,
  VectorSearchResult,
} from '../vecdb-types.js'

import { err } from '@h-ai/core'

import { vecdbM } from '../vecdb-i18n.js'
import { HaiVecdbError } from '../vecdb-types.js'

// ─── Provider 接口（内部，不暴露给模块消费者） ───

/**
 * 向量数据库 Provider 接口
 *
 * 各后端实现需遵循此接口，提供统一的集合管理和向量操作能力。
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

/** 操作上下文：由 Provider 在创建 ops 时传入 */
export interface VecdbOpsContext {
  /** 连接状态检查 */
  isConnected: () => boolean
  /** Logger 实例（用于运行时异常的错误日志） */
  logger: {
    error: (msg: string, meta?: Record<string, unknown>) => void
  }
}

/**
 * 集合操作原始适配器
 *
 * Provider 将引擎特定的集合管理逻辑适配为此接口。
 * 实现方返回 HaiResult 以表达业务错误（如集合已存在）；
 * 未预期的运行时异常直接 throw，由 wrapOp 统一捕获。
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
 */
export function createBaseCollectionOps(ctx: VecdbOpsContext, driver: CollectionDriver): CollectionOperations {
  return {
    create: (name, options) => wrapOp(
      ctx,
      () => driver.create(name, options),
      HaiVecdbError.QUERY_FAILED,
      'Failed to create collection',
      { name },
    ),
    drop: name => wrapOp(
      ctx,
      () => driver.drop(name),
      HaiVecdbError.DELETE_FAILED,
      'Failed to drop collection',
      { name },
    ),
    exists: name => wrapOp(
      ctx,
      () => driver.exists(name),
      HaiVecdbError.QUERY_FAILED,
      'Failed to check collection',
      { name },
    ),
    info: name => wrapOp(
      ctx,
      () => driver.info(name),
      HaiVecdbError.QUERY_FAILED,
      'Failed to get collection info',
      { name },
    ),
    list: () => wrapOp(
      ctx,
      () => driver.list(),
      HaiVecdbError.QUERY_FAILED,
      'Failed to list collections',
    ),
  }
}

// ─── 向量操作工厂 ───

/**
 * 创建标准向量操作
 *
 * 各 Provider 只需提供 VectorDriver，base 层统一处理连接守卫与运行时异常。
 */
export function createBaseVectorOps(ctx: VecdbOpsContext, driver: VectorDriver): VectorOperations {
  return {
    insert: (collection, documents) => wrapOp(
      ctx,
      () => driver.insert(collection, documents),
      HaiVecdbError.INSERT_FAILED,
      'Failed to insert vectors',
      { collection },
    ),
    upsert: (collection, documents) => wrapOp(
      ctx,
      () => driver.upsert(collection, documents),
      HaiVecdbError.UPDATE_FAILED,
      'Failed to upsert vectors',
      { collection },
    ),
    delete: (collection, ids) => wrapOp(
      ctx,
      () => driver.delete(collection, ids),
      HaiVecdbError.DELETE_FAILED,
      'Failed to delete vectors',
      { collection },
    ),
    search: (collection, vector, options) => wrapOp(
      ctx,
      () => driver.search(collection, vector, options),
      HaiVecdbError.QUERY_FAILED,
      'Failed to search vectors',
      { collection },
    ),
    count: collection => wrapOp(
      ctx,
      () => driver.count(collection),
      HaiVecdbError.QUERY_FAILED,
      'Failed to count vectors',
      { collection },
    ),
  }
}
