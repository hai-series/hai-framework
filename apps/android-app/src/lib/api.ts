/**
 * android-app — API 客户端初始化
 *
 * 使用 Capacitor Preferences 作为 Token 存储，
 * 通过 api-client 单例调用模式访问后端 API。
 *
 * @example
 * ```ts
 * import { api } from '@h-ai/api-client'
 * import { iamEndpoints } from '@h-ai/iam/api'
 *
 * const result = await api.call(iamEndpoints.login, { identifier, password })
 * ```
 */

import { PUBLIC_API_BASE } from '$env/static/public'
import { api } from '@h-ai/api-client'
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

/**
 * 初始化 API 客户端
 *
 * 应在应用启动时调用一次。
 */
export async function initApi() {
  return api.init({
    baseUrl: `${PUBLIC_API_BASE}/api/v1`,
    auth: {
      storage: createCapacitorTokenStorage(),
      refreshUrl: '/auth/refresh',
    },
  })
}

export { api }
