/**
 * @h-ai/serv — Pipeline 公共 helper
 *
 * 放置不属于 Hono middleware / route guard 默认实现本身、
 * 但会被多个 pipeline 复用的公共工具。
 * @module pipelines/serv-pipeline-helper
 */

import type { ServProcedureHandler } from './serv-pipeline-types.js'
import { err, HaiCommonError } from '@h-ai/core'
import { servM } from '../serv-i18n.js'

/**
 * 构造 `HaiResult` 失败分支同构的 HTTP 错误定义。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const definition: ServErrorBodyDef = HaiCommonError.UNAUTHORIZED
 * const body = buildHaiErrorBody(definition, servM('serv_errorUnauthorized'))
 * ```
 */
export interface ServErrorBodyDef {
  readonly code: string | number
  readonly httpStatus: number
  readonly system: string
  readonly module: string
}

/**
 * 构造与 `HaiResult` 失败分支同构的 HTTP 响应体。
 *
 * - 字段顺序与 `haiResultSchema()` 输出一致，便于客户端统一解析。
 * - 仅暴露最小信息（code/message/httpStatus），避免泄漏内部细节。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const body = buildHaiErrorBody(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden'))
 * // HTTP middleware 再设置 status；body 只包含安全的领域错误字段。
 * ```
 */
export function buildHaiErrorBody(def: ServErrorBodyDef, message: string) {
  return {
    success: false as const,
    error: {
      code: def.code,
      message,
      httpStatus: def.httpStatus,
      system: def.system,
      module: def.module,
    },
  }
}

/**
 * 捕获未处理异常并转换为 HaiResult。
 *
 * 由 contract router 在注册 handler 时统一应用，业务代码无需手动包装。
 *
 * @param handler - 被包装的 procedure handler
 * @returns 带异常保护的新 handler
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const wrapped = mapHaiError<{ id: string }, { id: string }>(async ({ input }) => ({ success: true, data: { id: input.id } }))
 * // oRPC 原始 options 原样传入；未处理异常在此转换为领域错误。
 * ```
 */
export function mapHaiError<TInput, TOutput>(handler: ServProcedureHandler<TInput, TOutput>): ServProcedureHandler<TInput, TOutput> {
  return async (options) => {
    try {
      return await handler(options)
    }
    catch (error) {
      // 所有未捕获异常统一在这里收口，避免直接把异常冒泡到 HTTP 层。
      return err(HaiCommonError.INTERNAL_ERROR, servM('serv_errorInternal', { locale: options.context.locale }), error)
    }
  }
}
