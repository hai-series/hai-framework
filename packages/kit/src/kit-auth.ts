/**
 * @h-ai/kit — Bearer 认证工具
 *
 * 提供服务端认证 Cookie 管理（login / logout）与浏览器端 Token 存储工具。
 * @module kit-auth
 */

import type { HaiResult } from '@h-ai/core'
import type { ApiKeyCredentials, AuthResult, LdapCredentials, OtpCredentials, PasswordCredentials, RegisterOptions } from '@h-ai/iam'
import type { AuthOperations, AuthOperationsProvider } from './kit-types.js'
import process from 'node:process'
import { err } from '@h-ai/core'
import { kitM } from './kit-i18n.js'

/** 默认 Token Cookie 名 */
const DEFAULT_TOKEN_COOKIE_NAME = 'hai_access_token'

/**
 * 应用级认证配置（由 createHandle 一次性初始化，生命周期同进程）
 *
 * 此状态非请求级：仅在 createHandle() 时写入一次，后续所有请求只读访问。
 */
const authState = {
  cookieName: DEFAULT_TOKEN_COOKIE_NAME,
  operations: null as AuthOperationsProvider | null,
}

/**
 * 配置认证参数
 *
 * 通常由 `createHandle` 在初始化时自动调用，无需手动调用。
 */
export function configureAuth(config: { cookieName?: string, operations?: AuthOperationsProvider }): void {
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

function createMemoryTokenStore(): BrowserTokenStore {
  let token: string | null = null
  return {
    get: () => token,
    set: (value: string) => { token = value },
    clear: () => { token = null },
  }
}

// 默认浏览器 Token 只保存在当前页面内存中，避免 auth: true 隐式落到 localStorage。
const defaultBrowserTokenStore = createMemoryTokenStore()

/** 获取默认浏览器 Token 存储（页面内存，不持久化）。 */
export function getDefaultBrowserTokenStore(): BrowserTokenStore {
  return defaultBrowserTokenStore
}

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
 * 获取已注入的认证操作；未配置时返回 null。
 *
 * 公共 API 不应 throw，因此此处用 null 信号配合上层短路返回 HaiResult。
 */
function getAuthOperations(): AuthOperations | null {
  if (!authState.operations)
    return null
  return typeof authState.operations === 'function'
    ? authState.operations()
    : authState.operations
}

/**
 * 构造 "auth 未配置" 的标准 HaiResult 错误。
 *
 * 用于公共认证 API 在 `authState.operations` 未注入时返回，
 * 避免向调用方抛出未捕获异常。
 */
function authNotConfiguredError(): HaiResult<never> {
  return err({
    code: 'KIT_AUTH_NOT_CONFIGURED',
    message: kitM('kit_authNotConfigured'),
  })
}

/**
 * 执行已配置的认证登录操作，并在成功时写入 Token Cookie。
 *
 * @param cookies - SvelteKit cookies 对象
 * @param credentials - 认证凭证
 * @param run - 具体 IAM 认证操作
 */
async function runAuthLogin<TCredentials>(
  cookies: CookieWriter,
  credentials: TCredentials,
  run: (ops: AuthOperations, credentials: TCredentials) => Promise<HaiResult<AuthResult>>,
): Promise<HaiResult<AuthResult>> {
  const ops = getAuthOperations()
  if (!ops)
    return authNotConfiguredError()

  const result = await run(ops, credentials)
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
): Promise<HaiResult<AuthResult>> {
  return runAuthLogin(cookies, credentials, (ops, input) => ops.login(input))
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
): Promise<HaiResult<AuthResult>> {
  return runAuthLogin(cookies, credentials, (ops, input) => ops.loginWithOtp(input))
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
): Promise<HaiResult<AuthResult>> {
  return runAuthLogin(cookies, credentials, (ops, input) => ops.loginWithLdap(input))
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
): Promise<HaiResult<AuthResult>> {
  return runAuthLogin(cookies, credentials, (ops, input) => ops.loginWithApiKey(input))
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
): Promise<HaiResult<AuthResult>> {
  return runAuthLogin(cookies, options, (ops, input) => ops.registerAndLogin(input))
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
  // 即使 auth 未配置也需要清除 Cookie，保证登出语义幂等
  const ops = getAuthOperations()
  if (accessToken && ops) {
    await ops.logout(accessToken)
  }
  clearToken(cookies)
}

// ─── 浏览器端 Token 存储（通过 kit.auth 暴露） ───

/**
 * 创建浏览器端 Token 存储器（localStorage）。
 *
 * ⚠️ 安全提示：localStorage 对同源脚本可读，任意 XSS 都可能窃取 Token。
 * 本函数仅供调用方显式接受风险时使用；`kit.client.create({ auth: true })`
 * 不会默认调用它。
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
 * 写入默认浏览器端 Access Token（仅页面内存，不持久化到 localStorage）。
 */
export function setBrowserToken(token: string): void {
  defaultBrowserTokenStore.set(token)
}

/**
 * 清除默认浏览器端 Access Token（仅页面内存）。
 */
export function clearBrowserToken(): void {
  defaultBrowserTokenStore.clear()
}
