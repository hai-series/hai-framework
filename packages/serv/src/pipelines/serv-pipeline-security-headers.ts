/**
 * @h-ai/serv — 默认安全响应头 middleware
 * @module pipelines/serv-pipeline-security-headers
 */

import type { ServMiddleware } from './serv-pipeline-types.js'

/**
 * 添加基础安全响应头：
 * `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`。
 *
 * @returns Hono middleware
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const middleware: ServMiddleware = securityHeaders()
 * // createApp 自动装配；应用无需把此内部 helper 作为根 API 导入。
 * ```
 */
export function securityHeaders(): ServMiddleware {
  return async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('Referrer-Policy', 'no-referrer')
    await next()
  }
}
