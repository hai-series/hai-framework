/**
 * @h-ai/kit — Bearer 认证工具
 *
 * 提供服务端 Cookie / Bearer Token 管理与浏览器端 Token 存储工具。
 * @module kit-auth
 */

import type { HandleFetch } from '@sveltejs/kit'
import process from 'node:process'

/** 固定 Access Token 名（Cookie 与浏览器存储统一） */
export const ACCESS_TOKEN_KEY = 'hai_access_token'

interface CookieReader {
  get: (name: string) => string | undefined
}

interface CookieWriter {
  set: (name: string, value: string, options: {
    path: string
    httpOnly: boolean
    sameSite: 'lax' | 'strict' | 'none'
    secure: boolean
    maxAge?: number
  }) => void
  delete: (name: string, options: { path: string }) => void
}

/** 浏览器 Token 存储器 */
export interface BrowserTokenStore {
  get: () => string | null
  set: (token: string) => void
  clear: () => void
}

const defaultBrowserTokenStore = createBrowserTokenStore()

// ─── 内部工具（仅 kit 包内使用） ───

/**
 * 从请求 Authorization 头提取 Bearer Token。
 */
export function getBearerTokenFromRequest(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  if (!authorization)
    return null

  const [scheme, token] = authorization.split(' ')
  if (!scheme || !token)
    return null

  if (scheme.toLowerCase() !== 'bearer')
    return null

  const trimmed = token.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * 从请求中统一提取 Access Token（Bearer 优先，其次固定 Cookie）。
 */
export function getAccessToken(request: Request, cookies?: CookieReader): string | null {
  return getBearerTokenFromRequest(request) ?? cookies?.get(ACCESS_TOKEN_KEY) ?? null
}

// ─── 服务端 Cookie 管理（通过 kit.auth 暴露） ───

/**
 * 写入固定名 Access Token Cookie。
 */
export function setAccessTokenCookie(cookies: CookieWriter, token: string, options?: { maxAge?: number }): void {
  cookies.set(ACCESS_TOKEN_KEY, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: options?.maxAge,
  })
}

/**
 * 清理固定名 Access Token Cookie。
 */
export function clearAccessTokenCookie(cookies: CookieWriter): void {
  cookies.delete(ACCESS_TOKEN_KEY, { path: '/' })
}

// ─── 浏览器端 Token 存储（通过 kit.auth 暴露） ───

/**
 * 创建浏览器端 Token 存储器（localStorage）。
 */
export function createBrowserTokenStore(key = ACCESS_TOKEN_KEY): BrowserTokenStore {
  return {
    get(): string | null {
      if (typeof window === 'undefined') {
        return null
      }
      return window.localStorage.getItem(key)
    },
    set(token: string): void {
      if (typeof window === 'undefined') {
        return
      }
      window.localStorage.setItem(key, token)
    },
    clear(): void {
      if (typeof window === 'undefined') {
        return
      }
      window.localStorage.removeItem(key)
    },
  }
}

/**
 * 写入浏览器端 Access Token（固定 key）。
 */
export function setBrowserAccessToken(token: string): void {
  defaultBrowserTokenStore.set(token)
}

/**
 * 清除浏览器端 Access Token（固定 key）。
 */
export function clearBrowserAccessToken(): void {
  defaultBrowserTokenStore.clear()
}

// ─── HandleFetch 工厂（通过 kit.auth 暴露） ───

/**
 * 创建浏览器端同源请求自动附加 Access Token 的 HandleFetch。
 */
export function createHandleFetch(tokenStore: BrowserTokenStore = createBrowserTokenStore()): HandleFetch {
  return async ({ event, request, fetch }) => {
    const requestUrl = new URL(request.url)
    if (requestUrl.origin !== event.url.origin)
      return fetch(request)

    const token = tokenStore.get()
    if (!token)
      return fetch(request)

    const headers = new Headers(request.headers)
    headers.set('Authorization', `Bearer ${token}`)

    return fetch(new Request(request, { headers }))
  }
}
