/**
 * android-app — API 客户端实例
 *
 * 使用 Capacitor Preferences 作为 Token 存储，
 * 通过 api-client 契约调用模式访问后端 API。
 *
 * @example
 * ```ts
 * import { api } from '$lib/api'
 * import { iamEndpoints } from '@h-ai/iam/api'
 *
 * const result = await api.call(iamEndpoints.login, { identifier, password })
 * ```
 */

import { PUBLIC_API_BASE } from '$env/static/public'
import { createApiClient } from '@h-ai/api-client'
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

export const api = createApiClient({
  baseUrl: `${PUBLIC_API_BASE}/api/v1`,
  auth: {
    storage: createCapacitorTokenStorage(),
    refreshUrl: '/auth/refresh',
  },
})
