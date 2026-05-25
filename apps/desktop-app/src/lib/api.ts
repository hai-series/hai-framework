/**
 * @file src/lib/api.ts
 *
 * 初始化默认 `@h-ai/api-client` 统一入口。
 *
 * - `baseUrl` 来自 `import.meta.env.PUBLIC_API_BASE`，默认 `http://localhost:3000/api/v1`。
 * - transport 加密配置来自 `config/_crypto.yml`。
 * - Token 存储：`apiClient.tokenStorage.localStorage()`（Tauri webview 与 server 跨域，httpOnly cookie 不可用）。
 * - `onRefreshFailed`：触发跳转至 `/login`。
 */

import { apiClient } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'
import { desktopCryptoConfig } from './crypto-config.js'
import { navigate } from './router.svelte.js'

const DEFAULT_API_BASE = 'http://localhost:3000/api/v1'

let initialized = false
let cryptoTransportEnabled = false

function resolveApiTransport() {
  if (desktopCryptoConfig.transport === false)
    return undefined

  return {
    crypto,
    keyExchangePath: desktopCryptoConfig.transport.keyExchangePath,
  }
}

/** 幂等初始化 api 客户端；可在 `main.ts` 中 `await` 调用。 */
export async function initApi(): Promise<void> {
  if (initialized)
    return

  const baseUrl = import.meta.env.PUBLIC_API_BASE ?? DEFAULT_API_BASE
  const transport = resolveApiTransport()

  if (transport) {
    const cryptoResult = await crypto.init()
    if (!cryptoResult.success)
      throw new Error(`Crypto initialization failed: ${cryptoResult.error.message}`)
  }

  try {
    await apiClient.init({
      baseUrl,
      auth: {
        storage: apiClient.tokenStorage.localStorage(),
        refreshPath: '/auth/refresh',
        onRefreshFailed: () => {
          // refresh token 失效 → 强制回登录页
          navigate('/login')
        },
      },
      ...(transport ? { transport } : {}),
    })
  }
  catch (error) {
    if (transport)
      await crypto.close()
    throw error
  }

  initialized = true
  cryptoTransportEnabled = transport !== undefined
}

/** 关闭 api 客户端（应用退出钩子使用）。 */
export async function closeApi(): Promise<void> {
  if (!initialized)
    return

  await apiClient.close()
  if (cryptoTransportEnabled)
    await crypto.close()

  initialized = false
  cryptoTransportEnabled = false
}
