/** API Client 公开入口，组装默认实例及客户端工厂。 */
import type { ApiClient } from './api-client-types.js'
import { apiContract } from '@h-ai/api-contract'
import { createHttpOnlyCookieTokenStorage, createMemoryTokenStorage } from './api-client-auth.js'
import { createApiClient } from './api-client-factory.js'
import { createIamAuthActions } from './api-client-iam.js'

/** Token 存储方案集合：内存 / httpOnly Cookie。 */
const tokenStorage = {
  /** 内存存储——SSR / Node 测试或一次性会话使用。 */
  memory: createMemoryTokenStorage,
  /** httpOnly Cookie 存储——浏览器场景推荐方案。 */
  httpOnlyCookie: createHttpOnlyCookieTokenStorage,
} as const

const defaultApiContract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

/**
 * 默认 iam/storage/ai typed client 与 create、tokenStorage、createAuthActions 命名空间的交叉类型。
 * 具体项目契约使用 apiClient.create 的返回类型，不给默认单例附加未知 procedure。
 *
 * @example
 * ```ts
 * import { type DefaultApiClient, apiClient } from '@h-ai/api-client'
 * const client: DefaultApiClient = apiClient
 * const initialized = await client.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const actions = client.createAuthActions(client)
 *   const result = await actions.publicConfig()
 *   if (!result.success) throw new Error(result.error.message)
 * }
 * finally {
 *   await client.close()
 * }
 * ```
 */
export type DefaultApiClient = ApiClient<typeof defaultApiContract> & {
  readonly create: typeof createApiClient
  readonly tokenStorage: typeof tokenStorage
  readonly createAuthActions: typeof createIamAuthActions
}

/**
 * API Client 公开入口：默认 iam/storage/ai 单例，以及独立实例、安全存储和认证动作工厂。
 * 未启用 auth 时不注入或刷新 Token；浏览器 auth: {} 使用 httpOnly Cookie 方案。
 * close 释放客户端运行状态/加密会话，不能替代服务端退出或 auth.clear。
 *
 * @example
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 * const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const result = await apiClient.iam.auth.currentUser()
 *   if (!result.success) throw new Error(result.error.message)
 *   const permissions = result.data.permissions
 * }
 * finally {
 *   await apiClient.close()
 * }
 * ```
 */
export const apiClient = new Proxy(createApiClient(defaultApiContract) as ApiClient<typeof defaultApiContract>, {
  get(target, property, receiver) {
    if (property === 'create')
      return createApiClient
    if (property === 'tokenStorage')
      return tokenStorage
    if (property === 'createAuthActions')
      return createIamAuthActions
    return Reflect.get(target as object, property, receiver)
  },
}) as DefaultApiClient
