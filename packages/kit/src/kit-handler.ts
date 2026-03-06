/**
 * @h-ai/kit — API Handler 包装器
 *
 * 统一封装 SvelteKit API Handler 的错误处理逻辑。
 * @module kit-handler
 */

import type { RequestEvent, RequestHandler } from '@sveltejs/kit'
import { core } from '@h-ai/core'
import { internalError } from './kit-response.js'
import { isResponseLike, isSvelteKitControlFlow } from './kit-utils.js'

/**
 * 创建 API Handler 包装器
 *
 * 将业务逻辑包裹在统一的异常边界中：
 * 1. 正常执行 `fn(event)` 返回 Response
 * 2. 若 `fn` throw 了 `Response`（如 `requirePermission` / `formOrFail`），直接返回该 Response
 * 3. 若 `fn` throw 了 SvelteKit 控制流（`redirect()` / `error()`），继续抛出
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
      // validate.*OrFail / requirePermission 等场景会 throw Response，直接返回即可
      // 使用 isResponseLike 兼容 Vite 开发环境下跨模块 instanceof 失效
      if (isResponseLike(error)) {
        return error
      }

      // redirect/error 等 SvelteKit 控制流必须继续抛出
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
