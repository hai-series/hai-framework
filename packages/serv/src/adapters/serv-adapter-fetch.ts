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
 * RequestInit 的覆盖与正文锁定/消费检查交由标准 Request 构造器处理，不修改原 Request 的字段。
 * 取消会拒绝响应等待并传递给应用，不能撤回 handler 已产生的外部效果；响应交付后的流取消由应用消费 signal。
 *
 * @param app - createApp 返回的应用
 * @returns fetch 兼容处理器
 * @throws 返回的 Promise 可因 Request 构造错误、取消或下游异常而 reject；成功返回 Response。
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
 * const request = new Request('http://service.test/health')
 * const response = await fetchHandler(request, { headers: { 'x-hai-locale': 'en-US' } })
 * const ready = response.ok
 * ```
 */
export function toFetch(app: ServHttpApp): ServFetchHandler {
  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // 即使 input 已是 Request 也必须应用 init；构造错误按 fetch 契约变成 Promise 拒绝。
    const request = new Request(input, init)
    const { signal } = request
    signal.throwIfAborted()
    let onAbort: (() => void) | undefined
    const cancelled = new Promise<Response>((_resolve, reject) => {
      onAbort = () => reject(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      return await Promise.race([
        Promise.resolve().then(async () => {
          // 取消可能发生在调用到下一个微任务之间，此时不能再派发 handler。
          signal.throwIfAborted()
          const response = await app.fetch(request)
          if (signal.aborted) {
            // 调用方已取消，迟到响应不再交付；释放未消费的流，清理失败不覆盖取消原因。
            try {
              await response.body?.cancel(signal.reason)
            }
            catch { /* 应用拥有的流可能已锁定或取消失败。 */ }
            signal.throwIfAborted()
          }
          return response
        }),
        cancelled,
      ])
    }
    finally {
      // 应用即使未协作退出，取消也结束调用方等待并释放 adapter 自己的监听器。
      if (onAbort)
        signal.removeEventListener('abort', onAbort)
    }
  }
  return handler as ServFetchHandler
}
