/**
 * @h-ai/api-client — Token 存储适配器
 *
 * 提供 localStorage 和内存两种内置 Token 存储实现。
 * @module api-client-auth
 */

import type { TokenPair, TokenStorage } from './api-client-types.js'

// ─── localStorage 存储 ───

const LS_ACCESS_KEY = 'hai_access_token'
const LS_REFRESH_KEY = 'hai_refresh_token'

/**
 * 创建基于 localStorage 的 Token 存储
 *
 * 适用于浏览器端 SPA / PWA。Capacitor 环境建议使用
 * `@h-ai/capacitor` 提供的 `CapacitorTokenStorage`。
 *
 * @returns TokenStorage 实例
 */
export function createLocalStorageTokenStorage(): TokenStorage {
  return {
    async getAccessToken() {
      return globalThis.localStorage?.getItem(LS_ACCESS_KEY) ?? null
    },
    async setAccessToken(token: string) {
      globalThis.localStorage?.setItem(LS_ACCESS_KEY, token)
    },
    async getRefreshToken() {
      return globalThis.localStorage?.getItem(LS_REFRESH_KEY) ?? null
    },
    async setRefreshToken(token: string) {
      globalThis.localStorage?.setItem(LS_REFRESH_KEY, token)
    },
    async clear() {
      globalThis.localStorage?.removeItem(LS_ACCESS_KEY)
      globalThis.localStorage?.removeItem(LS_REFRESH_KEY)
    },
  }
}

// ─── 内存存储 ───

/**
 * 创建内存 Token 存储
 *
 * 适用于 Node.js 测试、SSR 或短生命周期场景。
 * 页面刷新后 Token 丢失。
 *
 * @returns TokenStorage 实例
 */
export function createMemoryTokenStorage(): TokenStorage {
  let accessToken: string | null = null
  let refreshToken: string | null = null

  return {
    async getAccessToken() {
      return accessToken
    },
    async setAccessToken(token: string) {
      accessToken = token
    },
    async getRefreshToken() {
      return refreshToken
    },
    async setRefreshToken(token: string) {
      refreshToken = token
    },
    async clear() {
      accessToken = null
      refreshToken = null
    },
  }
}

// ─── Token 管理器（内部） ───

/**
 * Token 刷新回调列表
 */
type RefreshCallback = (tokens: TokenPair) => void

/**
 * 创建 Token 管理器
 *
 * 内部使用，管理 Token 存储和刷新逻辑。
 *
 * @param storage - Token 存储适配器
 * @param refreshUrl - Refresh Token 接口完整 URL
 * @param fetchFn - fetch 实现
 * @param onRefreshFailed - 刷新失败回调
 * @returns Token 管理器
 */
export function createTokenManager(
  storage: TokenStorage,
  refreshUrl: string,
  fetchFn: typeof globalThis.fetch,
  onRefreshFailed?: () => void,
) {
  const callbacks: RefreshCallback[] = []
  let refreshPromise: Promise<TokenPair | null> | null = null

  /**
   * 刷新 Token（带并发去重）
   *
   * 多个并发 401 只发一次 refresh 请求。
   */
  async function refresh(): Promise<TokenPair | null> {
    // 去重：已有刷新请求进行中，复用
    if (refreshPromise) {
      return refreshPromise
    }

    refreshPromise = doRefresh()
    try {
      return await refreshPromise
    }
    finally {
      refreshPromise = null
    }
  }

  async function doRefresh(): Promise<TokenPair | null> {
    const refreshToken = await storage.getRefreshToken()
    if (!refreshToken) {
      onRefreshFailed?.()
      return null
    }

    try {
      const response = await fetchFn(refreshUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })

      if (!response.ok) {
        await storage.clear()
        onRefreshFailed?.()
        return null
      }

      const body = await response.json() as { data?: TokenPair }
      const tokens = body.data
      if (!tokens?.accessToken || !tokens?.refreshToken) {
        await storage.clear()
        onRefreshFailed?.()
        return null
      }

      await storage.setAccessToken(tokens.accessToken)
      await storage.setRefreshToken(tokens.refreshToken)

      // 通知回调
      for (const cb of callbacks) {
        cb(tokens)
      }

      return tokens
    }
    catch {
      await storage.clear()
      onRefreshFailed?.()
      return null
    }
  }

  return {
    storage,
    refresh,

    async setTokens(tokens: TokenPair) {
      await storage.setAccessToken(tokens.accessToken)
      await storage.setRefreshToken(tokens.refreshToken)
    },

    async clear() {
      await storage.clear()
    },

    onTokenRefreshed(callback: RefreshCallback) {
      callbacks.push(callback)
    },
  }
}

/** Token 管理器类型 */
export type TokenManager = ReturnType<typeof createTokenManager>
