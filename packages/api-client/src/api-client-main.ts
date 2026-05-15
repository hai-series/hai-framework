/**
 * @h-ai/api-client — 默认单例 client
 *
 * 将 `createApiClient` 与 `apiServiceContract` 组合为应用层直接使用的默认单例。
 * 大多数应用只需导入 `api` 并调用 `api.init()` 即可，无需手动创建 client。
 * @module api-client-main
 */

import { apiServiceContract } from '@h-ai/api-contract/presets/api-service'
import { createApiClient } from './create-api-client.js'

/**
 * 默认 API Service typed client。
 *
 * 基于 `apiServiceContract` 预设创建，支持 iam / storage / ai 所有接口。
 *
 * @example
 * ```ts
 * import { api } from '@h-ai/api-client'
 *
 * await api.init({ baseUrl: 'http://localhost:3000/api/v1' })
 * const result = await api.iam.auth.login({ identifier: 'alice', password: 'secret' })
 * await api.close()
 * ```
 */
export const api = createApiClient(apiServiceContract)
