/**
 * @h-ai/api-client — 公共入口
 *
 * 导出 typed API client 工厂、默认 `api` 单例、Token 存储/管理、类型与错误码。
 *
 * @example 默认单例（绑定 iam / storage / ai）
 * ```ts
 * import { api } from '@h-ai/api-client'
 *
 * await api.init({ baseUrl: 'https://api.example.com/api/v1' })
 * const me = await api.iam.auth.currentUser()
 * await api.close()
 * ```
 *
 * @example 自定义 contract
 * ```ts
 * import { createApiClient } from '@h-ai/api-client'
 * import { createApiContract, iamContract } from '@h-ai/api-contract'
 *
 * const client = createApiClient(createApiContract({ iam: iamContract }))
 * await client.init({ baseUrl: 'https://api.example.com/api/v1' })
 * ```
 *
 * @module api-client
 */

export * from './api-client-auth.js'
export * from './api-client-main.js'
export * from './api-client-types.js'
