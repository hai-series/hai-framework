/**
 * @h-ai/api-client — Token 存储适配器
 *
 * 提供 localStorage 和内存两种内置 Token 存储实现。
 * @module api-client-auth
 */

import type { TokenStorage } from './api-client-types.js'

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
 *
 * @example
 * ```ts
 * import { api, createLocalStorageTokenStorage } from '@h-ai/api-client'
 *
 * await api.init({
 *   baseUrl: 'https://api.example.com',
 *   auth: {
 *     storage: createLocalStorageTokenStorage(),
 *     refreshUrl: '/auth/refresh',
 *   },
 * })
 * ```
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
 *
 * @example
 * ```ts
 * import { api, createMemoryTokenStorage } from '@h-ai/api-client'
 *
 * await api.init({
 *   baseUrl: 'https://api.example.com',
 *   auth: {
 *     storage: createMemoryTokenStorage(),
 *     refreshUrl: '/auth/refresh',
 *   },
 * })
 * ```
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
