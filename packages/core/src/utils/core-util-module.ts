/**
 * =============================================================================
 * @h-ai/core - 模块初始化工具
 * =============================================================================
 * 封装各模块共同的「未初始化」错误处理模式，消除跨模块冗余。
 *
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * import type { MyError } from './my-types.js'
 *
 * const notInitialized = core.module.createNotInitializedKit<MyError>(
 *   MyErrorCode.NOT_INITIALIZED,
 *   () => myM('my_notInitialized'),
 * )
 *
 * // 创建错误对象
 * const error = notInitialized.error()
 *
 * // 创建失败 Result
 * const result = notInitialized.result<string>()
 *
 * // 异步 Proxy 代理（默认，所有方法均返回 Promise<Result>）
 * const asyncOps = notInitialized.proxy<FileOperations>()
 *
 * // 同步 Proxy 代理（所有方法均返回 Result）
 * const syncOps = notInitialized.proxy<HashOperations>('sync')
 * ```
 * =============================================================================
 */

import type { Result } from '../core-types.js'
import { err } from '../core-types.js'

// =============================================================================
// 基础类型
// =============================================================================

/**
 * 模块错误基础接口。
 *
 * 所有模块的错误类型必须至少包含 `code` 和 `message` 字段。
 *
 * @example
 * ```ts
 * interface DbError extends BaseModuleError {
 *   code: number
 *   message: string
 *   details?: unknown
 * }
 * ```
 */
export interface BaseModuleError {
  /** 错误码（各模块自定义数值范围） */
  code: number
  /** 错误描述（i18n 消息） */
  message: string
}

// =============================================================================
// 未初始化工具集
// =============================================================================

/**
 * 未初始化工具集返回类型。
 *
 * 提供错误创建、Result 包装和 Proxy 代理等能力，
 * 用于模块未初始化时的安全回退。
 *
 * @template E - 模块错误类型（必须继承 BaseModuleError）
 */
export interface NotInitializedKit<E extends BaseModuleError> {
  /** 创建未初始化错误对象 */
  error: () => E
  /** 创建包含未初始化错误的失败 Result */
  result: <T>() => Result<T, E>
  /**
   * 创建 Proxy 代理，拦截所有方法调用并返回未初始化错误。
   *
   * @param mode - 'async'（默认）所有方法返回 `Promise<Result>`；'sync' 所有方法返回 `Result`
   */
  proxy: <T>(mode?: 'async' | 'sync') => T
}

/**
 * 创建模块未初始化工具集
 *
 * 封装各模块共同的未初始化错误处理模式，包括：
 * - `error()` — 创建未初始化错误对象
 * - `result<T>()` — 创建包含未初始化错误的失败 Result
 * - `proxy<T>(mode?)` — 创建 Proxy 对象（mode='async' 异步，mode='sync' 同步）
 *
 * @param code - 模块的 NOT_INITIALIZED 错误码
 * @param messageFn - 返回 i18n 错误消息的函数（延迟求值，确保运行时 locale 正确）
 * @returns 未初始化工具集
 *
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 *
 * const notInitialized = core.module.createNotInitializedKit<DbError>(
 *   DbErrorCode.NOT_INITIALIZED,
 *   () => dbM('db_notInitialized'),
 * )
 *
 * // 异步接口占位（默认）
 * const ddlProxy = notInitialized.proxy<DdlOperations>()
 *
 * // 同步接口占位
 * const hashProxy = notInitialized.proxy<HashOperations>('sync')
 *
 * // 在服务对象中使用
 * const db = {
 *   get ddl() { return currentProvider?.ddl ?? ddlProxy },
 *   get sql() { return currentProvider?.sql ?? notInitialized.proxy<SqlOperations>() },
 * }
 * ```
 */
export function createNotInitializedKit<E extends BaseModuleError>(
  code: E['code'],
  messageFn: () => string,
): NotInitializedKit<E> {
  /** 创建未初始化错误 */
  const error = (): E => ({ code, message: messageFn() }) as E

  /** 创建未初始化错误的 Result */
  const result = <T>(): Result<T, E> => err(error())

  /** 异步占位操作 */
  const asyncOp = async (): Promise<Result<unknown, E>> => err(error())

  /** 同步占位操作 */
  const syncOp = (): Result<unknown, E> => err(error())

  /** 创建 Proxy 代理 */
  const proxy = <T>(mode: 'async' | 'sync' = 'async'): T =>
    new Proxy({}, { get: () => mode === 'sync' ? syncOp : asyncOp }) as T

  return { error, result, proxy }
}
