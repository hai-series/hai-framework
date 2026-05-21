/**
 * @file src/lib/api.ts
 *
 * 初始化默认 `@h-ai/api-client` 单例。
 *
 * - `baseUrl` 来自 `import.meta.env.PUBLIC_API_BASE`，默认 `http://localhost:3000/api/v1`。
 * - Token 存储：`createLocalStorageTokenStorage()`（Tauri webview 与 server 跨域，httpOnly cookie 不可用）。
 * - `onRefreshFailed`：触发跳转至 `/login`。
 */

import { api, createLocalStorageTokenStorage } from '@h-ai/api-client'
import { navigate } from './router.svelte.js'

const DEFAULT_API_BASE = 'http://localhost:3000/api/v1'

let initialized = false

/** 幂等初始化 api 客户端；可在 `main.ts` 中 `await` 调用。 */
export async function initApi(): Promise<void> {
  if (initialized)
    return

  const baseUrl = import.meta.env.PUBLIC_API_BASE ?? DEFAULT_API_BASE

  await api.init({
    baseUrl,
    auth: {
      storage: createLocalStorageTokenStorage(),
      refreshPath: '/auth/refresh',
      onRefreshFailed: () => {
        // refresh token 失效 → 强制回登录页
        navigate('/login')
      },
    },
  })

  initialized = true
}

/** 关闭 api 客户端（应用退出钩子使用）。 */
export async function closeApi(): Promise<void> {
  if (!initialized)
    return
  await api.close()
  initialized = false
}
