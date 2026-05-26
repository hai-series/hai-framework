/**
 * @h-ai/serv — Fetch 适配器
 *
 * 将 ServHttpApp 包装为标准 Web `fetch(Request)` 处理函数，
 * 适用于 Cloudflare Workers、Deno、Bun 等 Fetch-first 运行时。
 * @module adapters/serv-adapter-fetch
 */

import type { ServHttpApp } from '../serv-app.js'

/**
 * Fetch runtime handler。
 *
 * 兼容标准 Web `fetch` 签名 `(input, init)` —— 既可作为 Cloudflare Workers / Bun
 * 的 `fetch` 导出，也可作为 oRPC client `fetch` 选项的替代实现，让客户端在测试
 * 中直连 in-process 服务。
 */
export type ServFetchHandler = typeof fetch

/**
 * 将 ServHttpApp 转成 Fetch handler。
 *
 * @param app - `serv.createApp()` 返回的 HTTP app
 * @returns fetch-compatible handler
 *
 * @example
 * ```ts
 * // Cloudflare Workers
 * export default { fetch: serv.toFetch(app) }
 *
 * // Bun
 * Bun.serve({ fetch: serv.toFetch(app), port: 3000 })
 *
 * // 测试：把服务端 app 当作 fetch 注入到 client，免去 HTTP 监听
 * const client = apiClient.create(contract)
 * await client.init({ baseUrl: 'http://test', fetch: serv.toFetch(app) })
 * ```
 */
export function toFetch(app: ServHttpApp): ServFetchHandler {
  // 包装为标准 fetch 签名：接受 `Request | URL | string` + `RequestInit?`，
  // 内部统一转为 `Request` 再委托给 ServHttpApp。
  const handler = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request
      ? input
      : new Request(typeof input === 'string' ? input : input.toString(), init)
    return Promise.resolve(app.fetch(request))
  }
  return handler as ServFetchHandler
}
