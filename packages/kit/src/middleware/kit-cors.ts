/**
 * @h-ai/kit — SvelteKit 对共享 Fetch CORS 策略的中间件适配。
 * @module kit-cors
 */

import type { CorsConfig, Middleware } from '../kit-types.js'
import { core } from '@h-ai/core'

/**
 * 为定制中间件链创建 CORS 处理器。
 * @example 模块内部上下文
 * ```ts
 * const middleware = corsMiddleware({ origin: 'https://orders.example.com', credentials: true })
 * ```
 */
export function corsMiddleware(config: CorsConfig = {}): Middleware {
  const check = core.access.createCors(config)
  return async ({ event }, next) => {
    const result = check(event.request)
    if (result?.preflight)
      return new Response(null, { status: 204, headers: result.headers })
    const response = await next()
    return result
      ? core.access.applyCorsHeaders(response, result.headers)
      : response
  }
}
