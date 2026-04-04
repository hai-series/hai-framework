/**
 * @h-ai/core — 模块初始化工具
 *
 * 封装各模块共同的「未初始化」错误处理模式，消除跨模块冗余。
 * @module core-util-module
 */

import type { HaiError, HaiErrorDef, HaiResult } from '../core-types.js'

import { error as errorUtils } from '../functions/core-function-error.js'

// ─── 未初始化工具集 ───

/**
 * 未初始化工具集返回类型。
 *
 * 提供错误创建、HaiResult 包装和 Proxy 代理等能力，
 * 用于模块未初始化时的安全回退。
 *
 * @template E - 模块错误类型（必须继承 HaiError）
 */
export interface NotInitializedKit<E extends HaiError> {
  /** 创建未初始化错误对象 */
  error: () => E
  /** 创建包含未初始化错误的失败 HaiResult */
  result: <T>() => HaiResult<T>
  /**
   * 创建 Proxy 代理，拦截所有方法调用并返回未初始化错误。
   *
   * @param mode - 'async'（默认）所有方法返回 `Promise<HaiResult>`；'sync' 所有方法返回 `HaiResult`
   */
  proxy: <T>(mode?: 'async' | 'sync') => T
}

/**
 * 创建模块未初始化工具集
 *
 * 封装各模块共同的未初始化错误处理模式，包括：
 * - `error()` — 创建未初始化错误对象
 * - `result<T>()` — 创建包含未初始化错误的失败 HaiResult
 * - `proxy<T>(mode?)` — 创建 Proxy 对象（mode='async' 异步，mode='sync' 同步）
 *
 * @param codeOrDef - 模块的 NOT_INITIALIZED 错误码，或标准 HaiErrorDef 错误定义
 * @param messageFn - 返回 i18n 错误消息的函数（延迟求值，确保运行时 locale 正确）
 * @returns 未初始化工具集
 *
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 *
 * const notInitialized = core.module.createNotInitializedKit(
 *   HaiDbError.NOT_INITIALIZED,
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
export function createNotInitializedKit(codeOrDef: HaiErrorDef, messageFn: () => string): NotInitializedKit<HaiError>
export function createNotInitializedKit<E extends HaiError>(
  codeOrDef: E['code'],
  messageFn: () => string,
): NotInitializedKit<E> {
  const isHaiErrorDef = (value: HaiError['code'] | HaiErrorDef): value is HaiErrorDef => {
    return typeof value === 'object'
      && value !== null
      && 'httpStatus' in value
      && 'system' in value
      && 'module' in value
  }

  /** 创建未初始化错误 */
  const error = (): E => {
    if (isHaiErrorDef(codeOrDef)) {
      return errorUtils.buildHaiErrorInst(codeOrDef, messageFn()) as E
    }
    return { code: codeOrDef, message: messageFn() } as E
  }

  /** 创建未初始化错误的 HaiResult */
  const result = <T>(): HaiResult<T> => ({ success: false, error: error() as HaiError })

  /** 异步占位操作 */
  const asyncOp = async (): Promise<HaiResult<unknown>> => ({ success: false, error: error() as HaiError })

  /** 同步占位操作 */
  const syncOp = (): HaiResult<unknown> => ({ success: false, error: error() as HaiError })

  /** 创建 Proxy 代理 */
  const proxy = <T>(mode: 'async' | 'sync' = 'async'): T =>
    new Proxy({}, { get: () => mode === 'sync' ? syncOp : asyncOp }) as T

  return { error, result, proxy }
}

/** module 子工具类型 */
/** overloaded function type for createNotInitializedKit */
export interface CreateNotInitializedKitFn {
  (codeOrDef: HaiErrorDef, messageFn: () => string): NotInitializedKit<HaiError>
  <E extends HaiError>(codeOrDef: E['code'], messageFn: () => string): NotInitializedKit<E>
}

export interface ModuleFn { createNotInitializedKit: CreateNotInitializedKitFn }
