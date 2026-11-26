/**
 * @h-ai/serv — Serv 对共享 Fetch CORS 策略的中间件适配。
 * @module serv-cors
 */

import type { HttpCorsOptions } from '@h-ai/core'
import type { ServMiddleware } from './pipelines/serv-pipeline-types.js'
import { core } from '@h-ai/core'

/**
 * Serv 中间件的 CORS 配置。
 * @example
 * ```ts
 * import { type ServCorsConfig, serv } from '@h-ai/serv'
 * const config: ServCorsConfig = { origin: 'https://orders.example.com', credentials: true }
 * const middleware = serv.cors(config)
 * ```
 */
export type ServCorsConfig = HttpCorsOptions

const corsMiddlewares = new WeakSet<ServMiddleware>()

/**
 * 标记内置 CORS；宿主可把它挂在外层，让拒绝响应也携带策略规定的头。
 * @example 模块内部上下文
 * ```ts
 * const middleware = cors({ origin: 'https://orders.example.com' })
 * const supported = isCorsMiddleware(middleware)
 * ```
 */
export function isCorsMiddleware(middleware: ServMiddleware): boolean {
  return corsMiddlewares.has(middleware)
}

/**
 * 识别浏览器预检的请求格式。只有挂载的 CORS 中间件答复时才跳过业务路由与计数。
 * @example 模块内部上下文
 * ```ts
 * const request = new Request('https://orders.example.com/api', { method: 'OPTIONS' })
 * const preflight = isCorsPreflight(request)
 * ```
 */
export const isCorsPreflight = core.access.isCorsPreflight

/**
 * 为定制中间件链创建 CORS 处理器。
 * @example
 * ```ts
 * import { serv } from '@h-ai/serv'
 * const middleware = serv.cors({ origin: 'https://orders.example.com' })
 * ```
 */
export function cors(config: ServCorsConfig = {}): ServMiddleware {
  const check = core.access.createCors(config)
  const middleware: ServMiddleware = async (context, next) => {
    const result = check(context.req.raw)
    if (result?.preflight)
      return new Response(null, { status: 204, headers: result.headers })

    await next()
    if (result) {
      const response = context.res
      const decorated = core.access.applyCorsHeaders(response, result.headers)
      if (decorated !== response)
        context.res = decorated
    }
    return undefined
  }
  corsMiddlewares.add(middleware)
  return middleware
}
