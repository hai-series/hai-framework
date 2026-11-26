/**
 * @h-ai/kit — SvelteKit 速率限制中间件适配器。
 * @module kit-ratelimit
 */

import type { Middleware, RateLimitConfig } from '../kit-types.js'
import { core } from '@h-ai/core'
import { setResponseHeaders } from '../kit-utils.js'

/**
 * 使用共享固定窗口与原子计数对选定的 SvelteKit 请求限流。
 *
 * @param config - 限流窗口、次数、原子存储和可选的键与响应回调。
 * @returns 中间件；允许时继续执行并设置限流头，拒绝或存储故障时直接响应。
 * @example
 * ```ts
 * import { cache } from '@h-ai/cache'
 * import { core } from '@h-ai/core'
 * import { kit } from '@h-ai/kit'
 *
 * // 应用已初始化共享 Redis，使用同一 namespace 的节点共享计数。
 * const limiter = kit.middleware.rateLimit({
 *   store: core.access.createCacheRateLimitStore(cache, { namespace: 'api' }),
 *   maxRequests: 100,
 * })
 * void limiter
 * ```
 */
export function rateLimitMiddleware(config: RateLimitConfig): Middleware {
  const check = core.access.createRateLimiter(config)
  return async ({ event, requestId, session }, next) => {
    let clientAddress: string | undefined
    try {
      clientAddress = event.getClientAddress?.()
    }
    catch { /* 部分宿主没有连接地址，由共享限流器进行缺省计数。 */ }
    const context = {
      request: event.request,
      requestId,
      clientAddress,
      session,
    }
    const result = await check({ requestId, clientAddress, context })
    if (result instanceof Response)
      return result
    return setResponseHeaders(await next(), Object.fromEntries(result))
  }
}
