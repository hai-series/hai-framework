/**
 * @h-ai/serv — oRPC procedure pipeline
 *
 * 提供可组合的 procedure 包装器：异常捕获、认证检查、权限检查、审计日志。
 * 所有包装器均返回符合 `HaiResult<T>` 的 handler，支持链式套用。
 * @module pipeline/orpc
 */

import type { HaiResult } from '@h-ai/core'
import type { ServContext } from '../context/context-types.js'
import { err, HaiCommonError } from '@h-ai/core'

/** oRPC procedure handler 的最小上下文约束。 */
export interface ServProcedureOptions<TInput = unknown> {
  readonly input: TInput
  readonly context: ServContext
}

/** oRPC procedure handler。 */
export type ServProcedureHandler<TInput, TOutput> = (
  options: ServProcedureOptions<TInput>,
) => HaiResult<TOutput> | Promise<HaiResult<TOutput>>

/**
 * 捕获未处理异常并转换为 HaiResult。
 *
 * 通常作为最外层包装器使用；就算内层抛出异常，也不会泄漏到 HTTP 层。
 *
 * @param handler - 被包装的 procedure handler
 * @returns 带异常保护的新 handler
 *
 * @example
 * ```ts
 * const safeHandler = mapHaiError(myHandler)
 * ```
 */
export function mapHaiError<TInput, TOutput>(handler: ServProcedureHandler<TInput, TOutput>): ServProcedureHandler<TInput, TOutput> {
  return async (options) => {
    try {
      return await handler(options)
    }
    catch (error) {
      return err(HaiCommonError.INTERNAL_ERROR, 'Internal server error', error)
    }
  }
}

/**
 * 需要 Bearer token 的 procedure 包装器。
 *
 * context.accessToken 为空时返回 401 UNAUTHORIZED。
 * 内置调用 `mapHaiError`，无需外层再次封装。
 *
 * @param handler - 被包装的 procedure handler
 * @returns 带认证检查的新 handler
 *
 * @example
 * ```ts
 * const protectedHandler = requireAuth(myHandler)
 * ```
 */
export function requireAuth<TInput, TOutput>(handler: ServProcedureHandler<TInput, TOutput>): ServProcedureHandler<TInput, TOutput> {
  return mapHaiError(async (options) => {
    if (!options.context.accessToken) {
      return err(HaiCommonError.UNAUTHORIZED, 'Unauthorized')
    }

    return handler(options)
  })
}

/**
 * 需要指定权限的 procedure 包装器。
 *
 * 内置调用 `requireAuth`，在验证 Token 后进一步模板匹配权限列表。
 * 支持通配符 `'*'`：拥有 `'*'` 权限的用户自动通过所有权限检查。
 *
 * @param permission - 所需权限字符串（如 `'storage:upload'`）
 * @param handler - 被包装的 procedure handler
 * @returns 带权限检查的新 handler
 *
 * @example
 * ```ts
 * const adminHandler = requirePermission('user:admin', myHandler)
 * ```
 */
export function requirePermission<TInput, TOutput>(
  permission: string,
  handler: ServProcedureHandler<TInput, TOutput>,
): ServProcedureHandler<TInput, TOutput> {
  return requireAuth(async (options) => {
    const permissions = options.context.session?.permissions ?? []
    if (!permissions.includes(permission) && !permissions.includes('*')) {
      return err(HaiCommonError.FORBIDDEN, 'Forbidden')
    }

    return handler(options)
  })
}

/**
 * 记录审计信息的占位包装器，具体审计落地由应用层扩展。
 *
 * 当前只透传 `mapHaiError`；应用层可在此基础上注入审计日志逻辑。
 *
 * @param handler - 被包装的 procedure handler
 * @returns 带审计能力的新 handler
 */
export function audit<TInput, TOutput>(handler: ServProcedureHandler<TInput, TOutput>): ServProcedureHandler<TInput, TOutput> {
  return mapHaiError(handler)
}
