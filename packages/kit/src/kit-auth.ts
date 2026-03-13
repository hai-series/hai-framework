/**
 * @h-ai/kit — Bearer 认证工具
 *
 * 提供服务端认证 Cookie 管理（login / logout）与浏览器端 Token 存储工具。
 * @module kit-auth
 */

import type { Result } from '@h-ai/core'
import type { ApiKeyCredentials, AuthResult, IamError, LdapCredentials, OtpCredentials, PasswordCredentials, RegisterOptions } from '@h-ai/iam'
import type { HandleFetch } from '@sveltejs/kit'
import type { AuthOperations } from './kit-types.js'
import process from 'node:process'

/** 默认 Token Cookie 名 */
const DEFAULT_TOKEN_COOKIE_NAME = 'hai_access_token'

/**
 * 应用级认证配置（由 createHandle 一次性初始化，生命周期同进程）
 *
 * 此状态非请求级：仅在 createHandle() 时写入一次，后续所有请求只读访问。
 */
const authState = {
  cookieName: DEFAULT_TOKEN_COOKIE_NAME,
  operations: null as AuthOperations | null,
}

/**
 * 配置认证参数
 *
 * 通常由 `createHandle` 在初始化时自动调用，无需手动调用。
 */
export function configureAuth(config: { cookieName?: string, operations?: AuthOperations }): void {
  if (config.cookieName)
    authState.cookieName = config.cookieName
  if (config.operations)
    authState.operations = config.operations
}

/**
 * 获取当前配置的 Token Cookie 名
 */
export function getTokenCookieName(): string {
  return authState.cookieName
}

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

const defaultBrowserTokenStore = createTokenStore()

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
 * 从请求中统一提取 Access Token（Bearer 优先，其次配置的 Cookie 名）。
 */
export function getAccessToken(request: Request, cookies?: CookieReader): string | null {
  return getBearerTokenFromRequest(request) ?? cookies?.get(authState.cookieName) ?? null
}

// ─── 服务端认证 Cookie 管理 ───

/**
 * 写入 Access Token Cookie（内部使用，由 login 自动调用）。
 */
function setToken(cookies: CookieWriter, token: string, maxAge?: number): void {
  cookies.set(authState.cookieName, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge,
  })
}

/**
 * 清除 Access Token Cookie（内部使用，由 logout 自动调用）。
 */
function clearToken(cookies: CookieWriter): void {
  cookies.delete(authState.cookieName, { path: '/' })
}

// ─── 服务端高级认证 API（通过 kit.auth 暴露） ───

/**
 * 获取已注入的认证操作（未配置时抛出编程错误）
 */
function getAuthOperations(): AuthOperations {
  if (!authState.operations) {
    throw new Error('kit.auth 未配置：请在 kit.createHandle() 中传入 auth.operations')
  }
  return authState.operations
}

/**
 * 内部工具：执行认证操作并在成功时写入 Token Cookie。
 */
async function executeLogin(
  cookies: CookieWriter,
  authPromise: Promise<Result<AuthResult, IamError>>,
): Promise<Result<AuthResult, IamError>> {
  const result = await authPromise
  if (result.success) {
    setToken(cookies, result.data.tokens.accessToken, result.data.tokens.expiresIn)
  }
  return result
}

/**
 * 服务端登录（密码）：内部调用 iam.auth.login，成功时自动写入 Token Cookie。
 *
 * @param cookies - SvelteKit cookies 对象
 * @param credentials - 密码凭证（identifier + password）
 * @returns 认证结果（成功时 Cookie 已自动写入）
 *
 * @example
 * ```ts
 * const result = await kit.auth.login(cookies, { identifier, password })
 * if (!result.success) return kit.response.fromError(result.error, IamErrorHttpStatus)
 * const { user, roles, permissions } = result.data
 * ```
 */
export async function login(
  cookies: CookieWriter,
  credentials: PasswordCredentials,
): Promise<Result<AuthResult, IamError>> {
  return executeLogin(cookies, getAuthOperations().login(credentials))
}

/**
 * 服务端登录（OTP 验证码）：内部调用 iam.auth.loginWithOtp，成功时自动写入 Token Cookie。
 *
 * @param cookies - SvelteKit cookies 对象
 * @param credentials - OTP 凭证（identifier + code）
 * @returns 认证结果（成功时 Cookie 已自动写入）
 *
 * @example
 * ```ts
 * const result = await kit.auth.loginWithOtp(cookies, { identifier, code })
 * ```
 */
export async function loginWithOtp(
  cookies: CookieWriter,
  credentials: OtpCredentials,
): Promise<Result<AuthResult, IamError>> {
  return executeLogin(cookies, getAuthOperations().loginWithOtp(credentials))
}

/**
 * 服务端登录（LDAP）：内部调用 iam.auth.loginWithLdap，成功时自动写入 Token Cookie。
 *
 * @param cookies - SvelteKit cookies 对象
 * @param credentials - LDAP 凭证（username + password）
 * @returns 认证结果（成功时 Cookie 已自动写入）
 *
 * @example
 * ```ts
 * const result = await kit.auth.loginWithLdap(cookies, { username, password })
 * ```
 */
export async function loginWithLdap(
  cookies: CookieWriter,
  credentials: LdapCredentials,
): Promise<Result<AuthResult, IamError>> {
  return executeLogin(cookies, getAuthOperations().loginWithLdap(credentials))
}

/**
 * 服务端登录（API Key）：内部调用 iam.auth.loginWithApiKey，成功时自动写入 Token Cookie。
 *
 * @param cookies - SvelteKit cookies 对象
 * @param credentials - API Key 凭证（key）
 * @returns 认证结果（成功时 Cookie 已自动写入）
 *
 * @example
 * ```ts
 * const result = await kit.auth.loginWithApiKey(cookies, { key: apiKey })
 * if (!result.success) return kit.response.fromError(result.error, IamErrorHttpStatus)
 * ```
 */
export async function loginWithApiKey(
  cookies: CookieWriter,
  credentials: ApiKeyCredentials,
): Promise<Result<AuthResult, IamError>> {
  return executeLogin(cookies, getAuthOperations().loginWithApiKey(credentials))
}

/**
 * 服务端注册并登录：内部调用 iam.auth.registerAndLogin，成功时自动写入 Token Cookie。
 *
 * @param cookies - SvelteKit cookies 对象
 * @param options - 注册选项（username、password、email 等）
 * @returns 认证结果（成功时 Cookie 已自动写入）
 *
 * @example
 * ```ts
 * const result = await kit.auth.registerAndLogin(cookies, { username, email, password })
 * ```
 */
export async function registerAndLogin(
  cookies: CookieWriter,
  options: RegisterOptions,
): Promise<Result<AuthResult, IamError>> {
  return executeLogin(cookies, getAuthOperations().registerAndLogin(options))
}

/**
 * 服务端登出：内部调用 iam.auth.logout 使会话失效，并清除 Token Cookie。
 *
 * @param cookies - SvelteKit cookies 对象
 * @param accessToken - 访问令牌（为 null/undefined 时仅清除 Cookie）
 *
 * @example
 * ```ts
 * await kit.auth.logout(cookies, locals.accessToken)
 * return kit.response.ok(null)
 * ```
 */
export async function logout(
  cookies: CookieWriter,
  accessToken?: string | null,
): Promise<void> {
  if (accessToken) {
    await getAuthOperations().logout(accessToken)
  }
  clearToken(cookies)
}

// ─── 浏览器端 Token 存储（通过 kit.auth 暴露） ───

/**
 * 创建浏览器端 Token 存储器（localStorage）。
 *
 * @param key - localStorage 键名，默认 `'hai_access_token'`
 */
export function createTokenStore(key = DEFAULT_TOKEN_COOKIE_NAME): BrowserTokenStore {
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
 * 写入浏览器端 Access Token。
 */
export function setBrowserToken(token: string): void {
  defaultBrowserTokenStore.set(token)
}

/**
 * 清除浏览器端 Access Token。
 */
export function clearBrowserToken(): void {
  defaultBrowserTokenStore.clear()
}

// ─── HandleFetch 工厂（通过 kit.auth 暴露） ───

/**
 * 创建浏览器端同源请求自动附加 Access Token 的 HandleFetch。
 */
export function createHandleFetch(tokenStore: BrowserTokenStore = createTokenStore()): HandleFetch {
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
