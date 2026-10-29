/**
 * @h-ai/kit — Bearer 认证工具
 *
 * 提供服务端认证 Cookie 管理（login / logout）与浏览器端 Token 存储工具。
 * @module kit-auth
 */

import type { HaiResult } from '@h-ai/core'
import type { ApiKeyCredentials, AuthRequestContext, AuthResult, LdapCredentials, OtpCredentials, PasswordCredentials, RegisterOptions } from '@h-ai/iam'
import type { AuthOperations, AuthOperationsProvider } from './kit-types.js'
import { err, ok } from '@h-ai/core'
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
 * @param config - 启动阶段注入的 Cookie 名和认证操作提供器。
 * @param config.cookieName - 认证 Cookie 名。
 * @param config.operations - 已初始化服务的认证操作或惰性提供器。
 * @example 模块内部上下文
 * ```ts
 * function configure(operations: AuthOperationsProvider) {
 *   configureAuth({ cookieName: 'hai_access_token', operations })
 * }
 * ```
 */
export function configureAuth(config: { cookieName?: string, operations?: AuthOperationsProvider }): void {
  if (config.cookieName)
    authState.cookieName = config.cookieName
  if (config.operations)
    authState.operations = config.operations
}

/**
 * 服务端认证只读 Cookie 依赖；由当前请求提供，不能跨请求缓存。
 * @example 模块内部上下文
 * ```ts
 * const cookies: CookieReader = { get: name => name === 'hai_access_token' ? 'example-only-token' : undefined }
 * const token = getAccessToken(new Request('https://app.example.com/api'), cookies)
 * void token
 * ```
 */
interface CookieReader {
  get: (name: string) => string | undefined
}

/**
 * 服务端认证写入/删除 Cookie 依赖；由当前请求提供并执行安全属性。
 * @example 模块内部上下文
 * ```ts
 * function signIn(cookies: CookieWriter, credentials: PasswordCredentials) {
 *   return login(cookies, credentials) // 业务调用者检查 success 后消费身份。
 * }
 * ```
 */
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

/**
 * 浏览器 Token 存储器；使用页面内存或平台安全存储，禁止写入 Web Storage。
 * @example 模块内部上下文
 * ```ts
 * const store: BrowserTokenStore = getDefaultBrowserTokenStore()
 * store.clear() // 当前页面内存状态；不持有服务端会话真值。
 * ```
 */
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

/**
 * 获取默认浏览器 Token 存储（页面内存，不持久化）。
 * @returns 当前页面的内存令牌存储器；不持有服务端共享状态。
 * @example 模块内部上下文
 * ```ts
 * const store = getDefaultBrowserTokenStore()
 * store.set('example-only-token')
 * store.clear()
 * ```
 */
export function getDefaultBrowserTokenStore(): BrowserTokenStore {
  return defaultBrowserTokenStore
}

// ─── 内部工具（仅 kit 包内使用） ───

/**
 * 从请求 Authorization 头提取 Bearer Token。
 */
function getBearerTokenFromRequest(request: Request): string | null {
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
 * @param request - 当前 HTTP 请求，优先读取 Authorization Bearer。
 * @param cookies - 当前请求的 Cookie 读取器；未提供时仅检查请求头。
 * @returns 解析到的令牌；均无值时为 null。
 * @example 模块内部上下文
 * ```ts
 * const request = new Request('https://app.example.com/api', { headers: { Authorization: 'Bearer example-only-token' } })
 * const token = getAccessToken(request)
 * void token
 * ```
 */
export function getAccessToken(request: Request, cookies?: CookieReader): string | null {
  return getBearerTokenFromRequest(request) ?? cookies?.get(authState.cookieName) ?? null
}

// ─── 服务端认证 Cookie 管理 ───

/**
 * 写入 Access Token Cookie（内部使用，由 login 自动调用）。
 */
function setToken(cookies: CookieWriter, token: string, maxAge?: number): void {
  // 共享文件也供浏览器内存 Token 使用，不引入 Node 内建模块；未知宿主保持安全默认值。
  // eslint-disable-next-line node/prefer-global/process
  const secure = typeof process === 'undefined' || process.env.NODE_ENV === 'production' || process.env.HAI_CORE_ENV === 'production'
  cookies.set(authState.cookieName, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // 测试开关仅放宽共享状态要求，不降低生产凭证 Cookie 的传输安全。
    secure,
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
 * @param context - 宿主提供的可信登录元数据，不从凭据输入复制 IP。
 * @returns 认证结果（成功时 Cookie 已自动写入）
 * @example 模块内部上下文
 * ```ts
 * async function signIn(cookies: CookieWriter, credentials: PasswordCredentials) {
 *   const result = await login(cookies, credentials)
 *   if (!result.success) return result.error.message
 *   return result.data
 * }
 * ```
 */
export async function login(
  cookies: CookieWriter,
  credentials: PasswordCredentials,
  context?: AuthRequestContext,
): Promise<HaiResult<AuthResult>> {
  return runAuthLogin(cookies, credentials, (ops, input) => ops.login(input, context))
}

/**
 * 服务端登录（OTP 验证码）：内部调用 iam.auth.loginWithOtp，成功时自动写入 Token Cookie。
 *
 * @param cookies - SvelteKit cookies 对象
 * @param credentials - OTP 凭证（identifier + code）
 * @param context - 宿主提供的可信登录元数据。
 * @returns 认证结果（成功时 Cookie 已自动写入）
 * @example 模块内部上下文
 * ```ts
 * async function signIn(cookies: CookieWriter, credentials: OtpCredentials) {
 *   const result = await loginWithOtp(cookies, credentials)
 *   if (!result.success) return result.error.message
 *   return result.data
 * }
 * ```
 */
export async function loginWithOtp(
  cookies: CookieWriter,
  credentials: OtpCredentials,
  context?: AuthRequestContext,
): Promise<HaiResult<AuthResult>> {
  return runAuthLogin(cookies, credentials, (ops, input) => ops.loginWithOtp(input, context))
}

/**
 * 服务端登录（LDAP）：内部调用 iam.auth.loginWithLdap，成功时自动写入 Token Cookie。
 *
 * @param cookies - SvelteKit cookies 对象
 * @param credentials - LDAP 凭证（username + password）
 * @param context - 宿主提供的可信登录元数据。
 * @returns 认证结果（成功时 Cookie 已自动写入）
 * @example 模块内部上下文
 * ```ts
 * async function signIn(cookies: CookieWriter, credentials: LdapCredentials) {
 *   const result = await loginWithLdap(cookies, credentials)
 *   if (!result.success) return result.error.message
 *   return result.data
 * }
 * ```
 */
export async function loginWithLdap(
  cookies: CookieWriter,
  credentials: LdapCredentials,
  context?: AuthRequestContext,
): Promise<HaiResult<AuthResult>> {
  return runAuthLogin(cookies, credentials, (ops, input) => ops.loginWithLdap(input, context))
}

/**
 * 服务端登录（API Key）：内部调用 iam.auth.loginWithApiKey，成功时自动写入 Token Cookie。
 *
 * @param cookies - SvelteKit cookies 对象
 * @param credentials - API Key 凭证（key）
 * @param context - 宿主提供的可信登录元数据。
 * @returns 认证结果（成功时 Cookie 已自动写入）
 * @example 模块内部上下文
 * ```ts
 * async function signIn(cookies: CookieWriter, credentials: ApiKeyCredentials) {
 *   const result = await loginWithApiKey(cookies, credentials)
 *   if (!result.success) return result.error.message
 *   return result.data
 * }
 * ```
 */
export async function loginWithApiKey(
  cookies: CookieWriter,
  credentials: ApiKeyCredentials,
  context?: AuthRequestContext,
): Promise<HaiResult<AuthResult>> {
  return runAuthLogin(cookies, credentials, (ops, input) => ops.loginWithApiKey(input, context))
}

/**
 * 服务端注册并登录：内部调用 iam.auth.registerAndLogin，成功时自动写入 Token Cookie。
 *
 * @param cookies - SvelteKit cookies 对象
 * @param options - 注册选项（username、password、email 等）
 * @returns 认证结果（成功时 Cookie 已自动写入）
 * @example 模块内部上下文
 * ```ts
 * async function signIn(cookies: CookieWriter, credentials: RegisterOptions) {
 *   const result = await registerAndLogin(cookies, credentials)
 *   if (!result.success) return result.error.message
 *   return result.data
 * }
 * ```
 */
export async function registerAndLogin(
  cookies: CookieWriter,
  options: RegisterOptions,
  context?: AuthRequestContext,
): Promise<HaiResult<AuthResult>> {
  return runAuthLogin(cookies, options, (ops, input) => ops.registerAndLogin(input, context))
}

/**
 * 服务端登出：委托 iam.auth.logout 原子撤销凭据，并始终清除当前请求的 Token Cookie。
 * Cookie 清理只代表本地退出；服务端撤销失败仍返回失败，不能由调用端改成成功响应。
 *
 * @param cookies - SvelteKit cookies 对象
 * @param accessToken - 访问令牌（为 null/undefined 时仅清除 Cookie）
 * @returns 服务端撤销结果；无令牌时仅清理 Cookie 并成功，有令牌但未配置认证操作时失败。
 * @remarks 底层控制流异常仍以 Promise 拒绝传播；Cookie 清理不吞掉业务失败。
 * @example 模块内部上下文
 * ```ts
 * async function signOut(cookies: CookieWriter, accessToken: string) {
 *   const result = await logout(cookies, accessToken)
 *   if (!result.success) return result.error.code
 *   return result.data
 * }
 * ```
 */
export async function logout(
  cookies: CookieWriter,
  accessToken?: string | null,
): Promise<HaiResult<void>> {
  try {
    if (!accessToken)
      return ok(undefined)
    const ops = getAuthOperations()
    if (!ops)
      return authNotConfiguredError()
    return await ops.logout(accessToken)
  }
  finally {
    // 本地凭据无论是否撤销确认都要移除，但失败结果仍交给调用者明确提示。
    clearToken(cookies)
  }
}

// ─── 浏览器端 Token 存储（通过 kit.auth 暴露） ───

/**
 * 写入默认浏览器端 Access Token（仅页面内存，不持久化到 localStorage）。
 * @param token - 当前页面内存中使用的 access token，不写入 Web Storage。
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit'
 *
 * kit.auth.setBrowserToken('example-only-token')
 * // 页面注销时同步清除浏览器内存令牌。
 * kit.auth.clearBrowserToken()
 * ```
 */
export function setBrowserToken(token: string): void {
  defaultBrowserTokenStore.set(token)
}

/**
 * 清除默认浏览器端 Access Token（仅页面内存）。
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit'
 *
 * kit.auth.clearBrowserToken()
 * ```
 */
export function clearBrowserToken(): void {
  defaultBrowserTokenStore.clear()
}
