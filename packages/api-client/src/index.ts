/**
 * @h-ai/api-client — 公共入口
 *
 * 统一入口为 `apiClient`：它自身就是默认单例，同时提供 `create` / `tokenStorage` 辅助能力。
 *
 * @example 默认单例（绑定 iam / storage / ai）
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 *
 * await apiClient.init({ baseUrl: 'https://api.example.com/api/v1' })
 * const me = await apiClient.iam.auth.currentUser()
 * await apiClient.close()
 * ```
 *
 * @example 自定义 contract
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const contract = apiContract.create({ iam: apiContract.iam })
 * const client = apiClient.create(contract)
 * await client.init({
 *   baseUrl: 'https://api.example.com/api/v1',
 *   auth: { storage: apiClient.tokenStorage.memory() },
 * })
 * ```
 *
 * @module api-client
 */

export type { TokenManager } from './api-client-auth.js'

// 统一公开入口——默认单例 + 工厂命名空间。
export { apiClient } from './api-client-main.js'
export type { DefaultApiClient } from './api-client-main.js'
// 类型 / 错误码。
export type {
  ApiClient,
  ApiClientAuth,
  ApiClientConfig,
  ApiClientLifecycle,
  ApiClientTransportConfig,
  AuthConfig,
  TokenPair,
  TokenStorage,
} from './api-client-types.js'
export { HaiApiClientError } from './api-client-types.js'
