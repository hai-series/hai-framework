/**
 * @h-ai/kit — API Handler 包装器
 *
 * 统一封装 SvelteKit API Handler 的错误处理逻辑。
 * @module kit-handler
 */

import type { RequestEvent, RequestHandler } from '@sveltejs/kit'
import { HaiCommonError } from '@h-ai/core'
import { kitM } from './kit-i18n.js'
import { fromError } from './kit-response.js'
import { isResponseLike, isSvelteKitControlFlow } from './kit-utils.js'

/**
 * 创建 API Handler 包装器
 *
 * 将业务逻辑包裹在统一的异常边界中：
 * 1. 正常执行 `fn(event)` 返回 Response
 * 2. 若 `fn` throw 了 `Response`（如 `kit.guard.require` / `kit.validate.body`），直接返回该 Response
 * 3. 若 `fn` throw 了 SvelteKit 控制流（`redirect()` / `error()`），继续抛出
 * 4. 其他异常：记录日志 → 返回 `kit.response.internalError()`
 *
 * @param fn - 业务处理函数
 * @returns SvelteKit RequestHandler
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit'
 *
 * const GET = kit.handler(() => kit.response.ok({ healthy: true }))
 * void GET
 * ```
 */
export function handler(fn: (event: RequestEvent) => Promise<Response> | Response): RequestHandler {
  return async (event) => {
    try {
      return await fn(event)
    }
    catch (error) {
      // validate.body / guard.require 等场景会 throw Response，直接返回即可
      // 使用 isResponseLike 兼容 Vite 开发环境下跨模块 instanceof 失效
      if (isResponseLike(error)) {
        return error
      }

      // redirect/error 等 SvelteKit 控制流必须继续抛出
      if (isSvelteKitControlFlow(error)) {
        throw error
      }

      return fromError({
        ...HaiCommonError.INTERNAL_ERROR,
        message: kitM('kit_internalError'),
        // 由 Core 统一规范化原始异常，保留驱动码和 AggregateError 的子错误。
        cause: error,
        ext: { path: event.url.pathname, method: event.request.method },
      })
    }
  }
}
