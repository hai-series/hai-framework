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
 */
export function securityHeaders(): ServMiddleware {
  return async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('Referrer-Policy', 'no-referrer')
    await next()
  }
}
