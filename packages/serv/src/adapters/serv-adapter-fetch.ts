/**
 * @h-ai/serv — Fetch 适配器
 *
 * 将 ServHttpApp 包装为标准 Web `fetch(Request)` 处理函数，
 * 用于 Node 兼容宿主与客户端测试的标准 fetch 注入；部署仍须满足包的 Node API 依赖。
 * @module adapters/serv-adapter-fetch
 */

import type { ServHttpApp } from '../serv-app.js'

/**
 * 标准 fetch 签名类型，供 Node 兼容宿主或客户端 in-process 测试注入。签名兼容不代表包整体不依赖 Node API，也不承诺未经验证的边缘部署。
 *
 * @example
 * ```ts
 * import type { ServFetchHandler } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * function handle(app: Parameters<typeof serv.toFetch>[0]): ServFetchHandler {
 *   return serv.toFetch(app)
 * }
 * // 兼容 fetch 签名；宿主仍须支持此包的 Node 依赖。
 * ```
 */
export type ServFetchHandler = typeof fetch

/**
 * 将应用转换为标准 fetch 签名，供 Node 兼容宿主或客户端测试注入；签名适配不代表整个包可在无 Node API 的边缘运行时加载。
 *
 * @param app - createApp 返回的应用
 * @returns fetch 兼容处理器
 * @throws Request 构造错误或下游应用异常；成功返回 Response。
 *
 * @example
 * ```ts
 * import type { ServContext } from '@h-ai/serv'
 * import { apiContract } from '@h-ai/api-contract'
 * import { serv } from '@h-ai/serv'
 *
 * const contract = apiContract.create({})
 * const procedures = serv.implement(contract).context<ServContext>().build()
 * const app = serv.createApp({ contract, procedures })
 *
 * const fetchHandler = serv.toFetch(app)
 * const response = await fetchHandler('http://service.test/health')
 * const ready = response.ok
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
