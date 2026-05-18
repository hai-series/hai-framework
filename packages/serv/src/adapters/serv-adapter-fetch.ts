/**
 * @h-ai/serv — Fetch 适配器
 *
 * 将 Hono app 包装为标准 Web `fetch(Request)` 处理函数，
 * 适用于 Cloudflare Workers、Deno、Bun 等 Fetch-first 运行时。
 * @module adapters/serv-adapter-fetch
 */

import type { Hono } from 'hono'

/** Fetch runtime handler。 */
export type ServFetchHandler = (request: Request) => Response | Promise<Response>

/**
 * 将 Hono app 转成 Fetch handler。
 *
 * @param app - Hono app
 * @returns fetch-compatible handler
 *
 * @example
 * ```ts
 * // Cloudflare Workers
 * export default { fetch: serv.toFetch(app) }
 *
 * // Bun
 * Bun.serve({ fetch: serv.toFetch(app), port: 3000 })
 * ```
 */
export function toFetch(app: Hono): ServFetchHandler {
  return request => app.fetch(request)
}
