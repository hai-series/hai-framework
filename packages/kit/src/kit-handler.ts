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
 * 检测是否为 Response 对象（兼容跨模块 instanceof 失效场景）
 *
 * 在 Vite 开发环境下，不同模块可能引用不同的 `Response` 构造器，
 * 导致 `instanceof Response` 返回 false。通过特征检测兜底辨识。
 *
 * @param value - 待检测值
 * @returns 是否为 Response（或 Response-like 对象）
 */
function isResponseLike(value: unknown): value is Response {
  if (value instanceof Response)
    return true
  // 特征检测：headers + status + text/json 方法同时具备
  if (
    typeof value === 'object'
    && value !== null
    && 'status' in value
    && 'headers' in value
    && typeof (value as Response).text === 'function'
    && typeof (value as Response).json === 'function'
  ) {
    return true
  }
  return false
}

/**
 * 检测是否为 SvelteKit 控制流对象（redirect / error）
 *
 * SvelteKit 的 `redirect()` 和 `error()` 会抛出带 `status` 属性的特殊对象，
 * 框架在上层捕获后做控制流处理。此类对象必须继续抛出，不可吞掉。
 *
 * @param value - 被捕获的异常
 * @returns 是否为 SvelteKit 控制流
 */
function isSvelteKitControlFlow(value: unknown): boolean {
  // Response 对象（含跨模块 duck-typing）不是控制流
  if (isResponseLike(value))
    return false
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
