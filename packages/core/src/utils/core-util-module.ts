import type { HaiError, HaiErrorDef, HaiResult, NotInitializedKit } from '../core-types.js'
/**
 * @h-ai/core — 模块初始化工具
 *
 * 封装各模块共同的「未初始化」错误处理模式，消除跨模块冗余。
 * @module core-util-module
 */

import { error as errorUtils } from '../functions/core-function-error.js'

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
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * import { HaiCommonError, type HaiResult } from '@h-ai/core'
 * const state = core.module.createNotInitializedKit(HaiCommonError.NOT_INITIALIZED, () => 'Not initialized')
 * const operations = state.proxy<{ read: () => Promise<HaiResult<string>> }>()
 * const result = await operations.read()
 * if (!result.success) core.logger.warn('Read rejected', { code: result.error.code })
 * ```
 */
export function createNotInitializedKit(codeOrDef: HaiErrorDef, messageFn: () => string): NotInitializedKit<HaiError>
/**
 * 创建指定错误码的同步或异步未初始化操作代理；消息在实际调用时求值。
 * @param codeOrDef - 模块 NOT_INITIALIZED 错误定义或错误码。
 * @param messageFn - 每次失败时读取当前请求语言的消息函数。
 * @returns 包含 error、result 和同步/异步 proxy 的占位工具集。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * import { HaiCommonError, type HaiResult } from '@h-ai/core'
 * const state = core.module.createNotInitializedKit(HaiCommonError.NOT_INITIALIZED, () => 'Not initialized')
 * const operations = state.proxy<{ read: () => Promise<HaiResult<string>> }>()
 * const result = await operations.read()
 * if (!result.success) core.logger.warn('Read rejected', { code: result.error.code })
 * ```
 */
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

/**
 * 生产进程默认要求跨主机共享状态；显式E2E测试可使用测试替身。
 * @param environment - 服务端实际进程环境，不接受请求参数
 * @param environment.NODE_ENV - 实际运行环境
 * @param environment.HAI_CORE_ENV - 框架环境文件声明的运行环境
 * @param environment.HAI_E2E - 显式真实端到端测试标记
 * @param environment.HAI_E2E_MOCK - 显式模拟端到端测试标记
 * @returns 是否拒绝仅本机/进程有效的状态后端
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const production = core.module.requiresSharedState({ HAI_CORE_ENV: 'production' }) // true
 * const test = core.module.requiresSharedState({ NODE_ENV: 'production', HAI_E2E: '1' }) // false
 * ```
 */
export function requiresSharedState(environment: { NODE_ENV?: string, HAI_CORE_ENV?: string, HAI_E2E?: string, HAI_E2E_MOCK?: string }): boolean {
  return (environment.NODE_ENV === 'production' || environment.HAI_CORE_ENV === 'production') && environment.HAI_E2E !== '1' && environment.HAI_E2E_MOCK !== '1'
}
