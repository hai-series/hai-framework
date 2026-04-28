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

import { api } from '@h-ai/api-client'
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

// Capacitor 静态构建后通过 Vite 的 import.meta.env 注入 PUBLIC_* 变量
// 此处不使用 SvelteKit 的 $env/static/public，避免脱离 SvelteKit SSR 上下文时的类型/运行时缺失
const API_BASE = (import.meta.env.PUBLIC_API_BASE as string | undefined) ?? 'http://localhost:3000'

/**
 * 初始化 API 客户端
 *
 * 应在应用启动时调用一次。
 */
export async function initApi() {
  return api.init({
    baseUrl: `${API_BASE}/api/v1`,
    auth: {
      storage: createCapacitorTokenStorage(),
      refreshUrl: '/auth/refresh',
    },
  })
}

export { api }
