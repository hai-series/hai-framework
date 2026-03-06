/**
 * @h-ai/api-client — 模块入口
 *
 * 提供 `createApiClient()` 工厂函数，创建通用 HTTP 客户端实例。
 * 支持通用 HTTP 方法、契约调用、文件上传、流式请求与自动 Token 管理。
 * @module api-client-main
 */

import type { ApiClient, ApiClientConfig, TokenPair } from './api-client-types.js'
import { createLocalStorageTokenStorage } from './api-client-auth.js'
import { createContractCaller } from './api-client-contract.js'
import { createFetchClient } from './api-client-fetch.js'
import { createTokenManager } from './api-client-token-manager.js'

/**
 * 创建 Api Client 实例
 *
 * @param config - 客户端配置
 * @returns ApiClient 实例
 *
 * @example
 * ```ts
 * import { createApiClient } from '@h-ai/api-client'
 *
 * const api = createApiClient({
 *   baseUrl: 'https://api.example.com/api/v1',
 *   auth: {
 *     refreshUrl: '/auth/refresh',
 *   },
 * })
 *
 * // 契约调用
 * const result = await api.call(iamEndpoints.login, { identifier: 'alice', password: 'xxx' })
 *
 * // 通用 HTTP
 * const users = await api.get<User[]>('/users', { page: 1 })
 * ```
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  // 优先使用外部传入的 fetch（便于测试/跨平台注入）；未传入时回退到全局 fetch，并 bind(globalThis) 保证调用时 this 正确
  const fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis)
  // auth 开启时，默认使用 localStorage 作为 Token 存储，减少调用方配置负担
  const tokenStorage = config.auth?.storage ?? createLocalStorageTokenStorage()

  // Token 管理器（可选）
  const tokenManager = config.auth
    ? createTokenManager(
        tokenStorage,
        `${config.baseUrl.replace(/\/+$/, '')}${config.auth.refreshUrl}`,
        fetchFn,
        config.auth.onRefreshFailed,
      )
    : undefined

  // 注册外部回调
  if (config.auth?.onTokenRefreshed && tokenManager) {
    tokenManager.onTokenRefreshed(config.auth.onTokenRefreshed)
  }

  // Fetch Client
  const fetchClient = createFetchClient(config, tokenManager)

  // 契约调用
  const call = createContractCaller(fetchClient)

  // Auth 管理接口
  const auth: ApiClient['auth'] = {
    async setTokens(tokens: TokenPair) {
      if (tokenManager) {
        await tokenManager.setTokens(tokens)
      }
    },
    async clear() {
      if (tokenManager) {
        await tokenManager.clear()
      }
    },
    onTokenRefreshed(callback: (tokens: TokenPair) => void): () => void {
      if (tokenManager) {
        return tokenManager.onTokenRefreshed(callback)
      }
      return () => {}
    },
  }

  return {
    get: fetchClient.get,
    post: fetchClient.post,
    put: fetchClient.put,
    patch: fetchClient.patch,
    delete: fetchClient.delete,
    upload: fetchClient.upload,
    stream: fetchClient.stream,
    call,
    auth,
  }
}
