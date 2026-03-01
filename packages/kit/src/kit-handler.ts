/**
 * @h-ai/kit — API Handler 包装器
 *
 * 统一封装 SvelteKit API Handler 的错误处理逻辑。
 * @module kit-handler
 */

import type { RequestEvent, RequestHandler } from '@sveltejs/kit'
import { core } from '@h-ai/core'
import { internalError } from './kit-response.js'

/**
 * 检测是否为 SvelteKit 控制流对象（redirect / error）
 *
 * SvelteKit 的 `redirect()` 和 `error()` 会抛出带 `status` 属性的特殊对象，
 * 框架在上层捕获后做控制流处理。此类对象必须 re-throw，不可拦截。
 *
 * @param value - 被捕获的异常
 * @returns 是否为 SvelteKit 控制流
 */
function isSvelteKitControlFlow(value: unknown): boolean {
  if (value instanceof Response)
    return true
  if (typeof value === 'object' && value !== null && 'status' in value) {
    const status = (value as { status: unknown }).status
    return typeof status === 'number'
  }
  return false
}

/**
 * 创建 API Handler 包装器
 *
 * 将业务逻辑包裹在统一的异常边界中：
 * 1. 正常执行 `fn(event)` 返回 Response
 * 2. 若 `fn` throw 了 `Response`（如 `requirePermission` / `formOrFail`），re-throw 给 SvelteKit
 * 3. 若 `fn` throw 了 SvelteKit 控制流（`redirect()` / `error()`），re-throw
 * 4. 其他异常：记录日志 → 返回 `kit.response.internalError()`
 *
 * @param fn - 业务处理函数
 * @returns SvelteKit RequestHandler
 *
 * @example
 * ```ts
 * export const GET = kit.handler(async ({ locals }) => {
 *   kit.guard.requirePermission(locals.session, 'user:read')
 *   return kit.response.ok(await getUsers())
 * })
 * ```
 */
export function handler(fn: (event: RequestEvent) => Promise<Response> | Response): RequestHandler {
  return async (event) => {
    try {
      return await fn(event)
    }
    catch (error) {
      // SvelteKit 控制流（Response / redirect / error）必须 re-throw
      if (isSvelteKitControlFlow(error)) {
        throw error
      }

      core.logger.error('Request handler error', {
        error,
        path: event.url.pathname,
        method: event.request.method,
      })

      return internalError()
    }
  }
}
