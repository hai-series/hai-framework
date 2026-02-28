/**
 * =============================================================================
 * @h-ai/kit - Session Cookie 工具
 * =============================================================================
 * 统一管理 SvelteKit 的会话 Cookie 设置与清除，
 * 避免在多个 API Handler 中重复拼写 cookie 选项。
 *
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit'
 *
 * // 登录成功后
 * kit.session.setCookie(cookies, accessToken, { maxAge: 86400 })
 *
 * // 登出时
 * kit.session.clearCookie(cookies)
 * ```
 * =============================================================================
 */

import type { Cookies } from '@sveltejs/kit'

/**
 * 设置会话 Cookie 的可选配置
 */
export interface SetSessionCookieOptions {
  /** Cookie 名称（默认 `'hai_session'`） */
  cookieName?: string
  /** Cookie 有效期（秒），默认 7 天 */
  maxAge?: number
  /** 是否仅 HTTPS（默认 `true` 当 NODE_ENV 为 production） */
  secure?: boolean
  /** SameSite 属性（默认 `'lax'`） */
  sameSite?: 'strict' | 'lax' | 'none'
}

/** 默认会话有效期：7 天 */
const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60

/**
 * 设置会话 Cookie
 *
 * @param cookies - SvelteKit Cookies 对象
 * @param token - 会话令牌
 * @param options - Cookie 配置
 *
 * @example
 * ```ts
 * kit.session.setCookie(cookies, accessToken, { maxAge: 86400 })
 * ```
 */
export function setSessionCookie(
  cookies: Cookies,
  token: string,
  options: SetSessionCookieOptions = {},
): void {
  const {
    cookieName = 'hai_session',
    maxAge = DEFAULT_MAX_AGE,
    // eslint-disable-next-line node/prefer-global/process
    secure = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production',
    sameSite = 'lax',
  } = options

  cookies.set(cookieName, token, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite,
    maxAge,
  })
}

/**
 * 清除会话 Cookie 的可选配置
 */
export interface ClearSessionCookieOptions {
  /** Cookie 名称（默认 `'hai_session'`） */
  cookieName?: string
}

/**
 * 清除会话 Cookie
 *
 * @param cookies - SvelteKit Cookies 对象
 * @param options - Cookie 配置
 *
 * @example
 * ```ts
 * kit.session.clearCookie(cookies)
 * ```
 */
export function clearSessionCookie(
  cookies: Cookies,
  options: ClearSessionCookieOptions = {},
): void {
  const { cookieName = 'hai_session' } = options
  cookies.delete(cookieName, { path: '/' })
}
