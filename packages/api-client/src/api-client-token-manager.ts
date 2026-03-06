/**
 * @h-ai/api-client — Token 管理器（内部）
 *
 * 管理 Token 存储和自动刷新逻辑，仅供模块内部使用，不对外导出。
 * @module api-client-token-manager
 * @internal
 */

import type { TokenPair, TokenStorage } from './api-client-types.js'
import { core } from '@h-ai/core'
import { z } from 'zod'

const logger = core.logger.child({ module: 'api-client', scope: 'auth' })

/**
 * Token 刷新响应校验 Schema
 */
const TokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().optional(),
  tokenType: z.string().optional(),
})

/**
 * Token 刷新回调
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
      logger.warn('Token refresh skipped, no refresh token available')
      onRefreshFailed?.()
      return null
    }

    logger.info('Refreshing token', { url: refreshUrl })

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

      const body = await response.json() as { data?: unknown }
      const parsed = TokenPairSchema.safeParse(body.data)
      if (!parsed.success) {
        logger.warn('Token refresh returned invalid data', { issues: parsed.error.issues })
        await storage.clear()
        onRefreshFailed?.()
        return null
      }

      const tokens = parsed.data as TokenPair
      await storage.setAccessToken(tokens.accessToken)
      await storage.setRefreshToken(tokens.refreshToken)
      logger.info('Token refreshed successfully')

      // 通知回调
      for (const cb of callbacks) {
        cb(tokens)
      }

      return tokens
    }
    catch (error) {
      logger.error('Token refresh failed', { error })
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

    onTokenRefreshed(callback: RefreshCallback): () => void {
      callbacks.push(callback)
      return () => {
        const idx = callbacks.indexOf(callback)
        if (idx >= 0)
          callbacks.splice(idx, 1)
      }
    },
  }
}

/** Token 管理器类型 */
export type TokenManager = ReturnType<typeof createTokenManager>
