/**
 * @h-ai/serv — Pipeline 公共 helper
 *
 * 放置不属于 Hono middleware / route guard 默认实现本身、
 * 但会被多个 pipeline 复用的公共工具。
 * @module pipelines/serv-pipeline-helper
 */

import type { ServProcedureHandler } from './serv-pipeline-types.js'
import { audit } from '@h-ai/audit'
import { core, err, HaiCommonError } from '@h-ai/core'
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
      message: core.error.formatMessage({ message, traceId: core.context.get().traceId ?? core.context.get().requestId }),
      traceId: core.context.get().traceId ?? core.context.get().requestId,
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
  return options => audit.withContext({
    actor: options.context.session ? { id: options.context.session.userId, username: options.context.session.username, roles: options.context.session.roles } : null,
    requestId: options.context.requestId,
    traceId: options.context.requestId,
    scopeId: options.context.scopeId,
    ipAddress: options.context.ip,
    userAgent: options.context.userAgent?.slice(0, 4096),
  }, async () => {
    const resource = options.path.join('.') || 'procedure'
    const capture = async (status: number, reasonCode?: string | number) => {
      const written = await audit.capture({
        action: 'request.execute',
        resource,
        category: /^(?:iam|auth|audit)(?:\.|$)/.test(resource) ? 'system' : 'business',
        outcome: [401, 403, 423, 429].includes(status) ? 'denied' : status >= 400 ? 'failure' : 'success',
        details: { method: options.context.request.method, status, ...(reasonCode === undefined ? {} : { reasonCode }) },
      }, { read: ['GET', 'HEAD', 'OPTIONS'].includes(options.context.request.method) })
      if (!written.success)
        options.context.logger.error('Request audit failed', { resource, error: written.error })
    }
    try {
      const result = await handler(options)
      await capture(result.success ? 200 : result.error.httpStatus ?? 500, result.success ? undefined : result.error.code)
      if (result.success)
        return result
      const error = core.error.toPublic(result.error, options.context.requestId, options.context.locale)
      options.context.logger.error('Procedure failed', { traceId: error.traceId, error: result.error })
      return { success: false, error }
    }
    catch (error) {
      // 所有未捕获异常统一在这里收口，避免直接把异常冒泡到 HTTP 层。
      const safe = core.error.toPublic({ ...HaiCommonError.INTERNAL_ERROR, message: servM('serv_errorInternal', { locale: options.context.locale }) }, options.context.requestId, options.context.locale)
      options.context.logger.error('Procedure threw an exception', { traceId: safe.traceId, error })
      await capture(500, HaiCommonError.INTERNAL_ERROR.code)
      return err(safe)
    }
  })
}
