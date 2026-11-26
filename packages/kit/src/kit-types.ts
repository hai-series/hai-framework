/**
 * @h-ai/kit — 类型定义
 *
 * SvelteKit 集成相关类型
 * @module kit-types
 */

import type { HttpContractHandler } from '@h-ai/api-contract'
import type { core, HaiError, HaiResult, HttpA2AHandler, HttpCorsConfig, HttpCorsConfigInput, HttpCorsOptions, HttpHostA2AConfig, HttpHostA2AConfigInput, HttpRateLimitConfig, HttpRateLimitConfigInput, HttpRateLimitContext, HttpRateLimitOptions, HttpSession, HttpVerifyToken, RequestAccessConfigInput, TrustedProxies } from '@h-ai/core'
import type { CryptoFunctions, TransportKeyStore, TransportServerKeyRing } from '@h-ai/crypto'
import type { ApiKeyCredentials, AuthnOperations, AuthRequestContext, AuthResult, LdapCredentials, OtpCredentials, PasswordCredentials, RegisterOptions } from '@h-ai/iam'
import type { RequestEvent } from '@sveltejs/kit'

import type { createKitAuthActions } from './client/kit-client-auth.js'
import type { createKitClient, installBrowserTransport, installBrowserTransportFetch } from './client/kit-client.js'
import type { defineCrud, resolveOptions, resolveText } from './crud/kit-crud.js'
import type { hasPermission, matchPermission, requirePermission } from './guards/kit-permission.js'
import type { requireSensitiveOperation } from './guards/kit-sensitive.js'
import type { createHandle, sequence } from './hooks/kit-handle.js'
import type { createAuthApi, createSessionFingerprint } from './kit-auth-api.js'
import type { createFeedbackHandler } from './kit-feedback.js'
import type { handler } from './kit-handler.js'
import type { badRequest, conflict, created, error, forbidden, fromError, fromResult, internalError, noContent, notFound, ok, redirect, unauthorized, validationError } from './kit-response.js'
import type { IdParamSchema, PaginationQuerySchema, validateFormOrFail, validateParamsOrFail, validateQueryOrFail } from './kit-validation.js'

/**
 * 当前请求的认证 Cookie 写入契约；不持有跨请求状态。
 * @example
 * ```ts
 *
 * import { type AuthCookieWriter, kit } from '@h-ai/kit'
 *
 * async function signOut(cookies: AuthCookieWriter) {
 *   const result = await kit.auth.logout(cookies)
 *   return result.success
 * }
 * ```
 */
export interface AuthCookieWriter {
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
 * Kit 服务端公开命名空间；消费者声明只引用公开类型，不暴露内部函数入口。
 * @example
 * ```ts
 *
 * import { type KitFunctions, kit } from '@h-ai/kit'
 *
 * const runtime: KitFunctions = kit
 * const response = runtime.response.ok({ ready: true })
 * void response.status
 * ```
 */
export interface KitFunctions {
  /** 服务端传输加密中间件；浏览器安装入口仍使用 client。 */
  crypto: {
    transportEncryptionMiddleware: typeof import('./modules/crypto/kit-transport-middleware.js').transportEncryptionMiddleware
  }
  /** 校验并应用 Kit 配置默认值。 */
  resolveConfig: typeof import('./kit-config.js').resolveKitConfig
  /** 解析公开传输配置。 */
  resolveTransportConfig: typeof import('./kit-config.js').resolveKitTransportConfig
  createFeedbackHandler: typeof createFeedbackHandler
  middleware: {
    rateLimit: (config: RateLimitConfig) => Middleware
  }
  createHandle: typeof createHandle
  sequence: typeof sequence
  handler: typeof handler
  guard: {
    requireSensitive: typeof requireSensitiveOperation
    require: typeof requirePermission
    check: typeof hasPermission
    matchPermission: typeof matchPermission
  }
  response: {
    ok: typeof ok
    created: typeof created
    noContent: typeof noContent
    error: typeof error
    badRequest: typeof badRequest
    unauthorized: typeof unauthorized
    forbidden: typeof forbidden
    notFound: typeof notFound
    conflict: typeof conflict
    validationError: typeof validationError
    internalError: typeof internalError
    redirect: typeof redirect
    fromResult: typeof fromResult
    fromError: typeof fromError
  }
  validate: {
    body: typeof validateFormOrFail
    query: typeof validateQueryOrFail
    params: typeof validateParamsOrFail
    IdParamSchema: typeof IdParamSchema
    PaginationQuerySchema: typeof PaginationQuerySchema
  }
  client: {
    create: typeof createKitClient
    createAuthActions: typeof createKitAuthActions
    installBrowserTransport: typeof installBrowserTransport
    installBrowserTransportFetch: typeof installBrowserTransportFetch
  }
  auth: {
    publicPaths: string[]
    createApi: typeof createAuthApi
    sessionFingerprint: typeof createSessionFingerprint
    login: (cookies: AuthCookieWriter, credentials: PasswordCredentials, context?: AuthRequestContext) => Promise<HaiResult<AuthResult>>
    loginWithOtp: (cookies: AuthCookieWriter, credentials: OtpCredentials, context?: AuthRequestContext) => Promise<HaiResult<AuthResult>>
    loginWithLdap: (cookies: AuthCookieWriter, credentials: LdapCredentials, context?: AuthRequestContext) => Promise<HaiResult<AuthResult>>
    loginWithApiKey: (cookies: AuthCookieWriter, credentials: ApiKeyCredentials, context?: AuthRequestContext) => Promise<HaiResult<AuthResult>>
    registerAndLogin: (cookies: AuthCookieWriter, options: RegisterOptions, context?: AuthRequestContext) => Promise<HaiResult<AuthResult>>
    logout: (cookies: AuthCookieWriter, accessToken?: string | null) => Promise<HaiResult<void>>
    setBrowserToken: (token: string) => void
    clearBrowserToken: () => void
  }
  crud: {
    define: typeof defineCrud
    resolveOptions: typeof resolveOptions
    resolveText: typeof resolveText
  }
  i18n: {
    setLocale: (locale: string) => void
    runWithLocale: typeof core.i18n.runWithLocale
  }
}

/**
 * 浏览器实际可用的 Kit 命名空间；不含服务端认证、Hook 或中间件。
 * @example
 * ```ts
 *
 * import { type BrowserKitFunctions, kit } from '@h-ai/kit'
 *
 * const browser: BrowserKitFunctions = kit
 * browser.auth.clearBrowserToken()
 * ```
 */
export interface BrowserKitFunctions {
  /** 校验并应用 Kit 配置默认值。 */
  resolveConfig: typeof import('./kit-config.js').resolveKitConfig
  /** 解析公开传输配置。 */
  resolveTransportConfig: typeof import('./kit-config.js').resolveKitTransportConfig
  guard: {
    matchPermission: typeof matchPermission
  }
  client: {
    create: typeof createKitClient
    createAuthActions: typeof createKitAuthActions
    installBrowserTransport: typeof installBrowserTransport
    installBrowserTransportFetch: typeof installBrowserTransportFetch
  }
  crud: {
    define: typeof defineCrud
    resolveOptions: typeof resolveOptions
    resolveText: typeof resolveText
  }
  auth: {
    setBrowserToken: (token: string) => void
    clearBrowserToken: () => void
  }
  i18n: {
    setLocale: (locale: string) => void
  }
}

/**
 * 服务器监听配置（对应 `config/_kit.yml` 的 `server`）。
 * @example
 * ```ts
 * import type { KitServerConfig } from '@h-ai/kit'
 *
 * const value: KitServerConfig = { host: '127.0.0.1', port: 3000 }
 * void value
 * ```
 */
export interface KitServerConfig {
  readonly host: string
  readonly port: number
}

/**
 * `config/_kit.yml` 中的服务器监听输入类型。
 * @example
 * ```ts
 * import type { KitServerConfigInput } from '@h-ai/kit'
 *
 * const value: KitServerConfigInput = { port: 4000 }
 * void value
 * ```
 */
export type KitServerConfigInput = Partial<KitServerConfig>

/**
 * `config/_kit.yml` 中的 transport 配置。
 * @example
 * ```ts
 * import type { KitTransportConfig } from '@h-ai/kit'
 *
 * const value: KitTransportConfig = { keyExchangePath: '/api/v1/_hai/key-exchange', excludePaths: ['/api/health'] }
 * void value
 * ```
 */
export interface KitTransportConfig {
  /** 双向明文 UTF-8 字节上限；省略使用 1 MiB，范围 1 KiB～64 MiB。 */
  readonly maxPlaintextBytes?: number
  /** 请求时间允许领先服务器的秒数，默认 30，整数范围 0～1800。 */
  readonly maxFutureSkewSeconds?: number
  /** 请求从签发起的有效秒数，默认 300，整数范围 1～3600。 */
  readonly maxRequestAgeSeconds?: number
  /** 按完整路径段匹配的明文容量；* 匹配单段。 */
  readonly routePlaintextBytes?: Readonly<Record<string, number>>
  readonly keyExchangePath: `/${string}`
  readonly excludePaths: readonly `/${string}`[]
}

/**
 * Kit HTTP 策略配置；按真实请求路径执行访问规则和限流。
 * @example
 * ```ts
 * import type { KitHttpConfig } from '@h-ai/kit'
 * const http: KitHttpConfig = { trustedProxies: [], access: false, rateLimit: false }
 * void http
 * ```
 */
export interface KitHttpConfig {
  /** auto 仅在受管私有容器入口采用容器网段；普通宿主忽略转发头。 */
  readonly trustedProxies: TrustedProxies
  /** 每次请求的地址、时间和路径限制；静态服务器直接提供的资源不经过 Handle。 */
  readonly access: RequestAccessConfigInput
  /** 固定窗口参数；运行时另行注入原子计数存储。 */
  readonly rateLimit: HttpRateLimitConfig
}

/**
 * Kit HTTP 策略输入；默认自动选择可信代理，关闭访问策略与限流。
 * @example
 * ```ts
 * import type { KitHttpConfigInput } from '@h-ai/kit'
 * const http: KitHttpConfigInput = { trustedProxies: ['192.0.2.10'] }
 * void http
 * ```
 */
export type KitHttpConfigInput = Omit<Partial<KitHttpConfig>, 'rateLimit'> & { readonly rateLimit?: HttpRateLimitConfigInput }

/**
 * `config/_kit.yml` 的顶层配置结构。
 * @example
 * ```ts
 * import type { KitConfig } from '@h-ai/kit'
 *
 * const value: KitConfig = { a2a: false, cors: false, server: { host: '127.0.0.1', port: 3000 }, transport: false, http: { trustedProxies: 'auto', access: false, rateLimit: false } }
 * void value
 * ```
 */
export interface KitConfig {
  readonly cors: HttpCorsConfig
  readonly a2a: HttpHostA2AConfig
  readonly server: KitServerConfig
  readonly transport: false | KitTransportConfig
  readonly http: KitHttpConfig
}

/**
 * `config/_kit.yml` 中的 transport 输入类型。
 * @example
 * ```ts
 * import type { KitTransportConfigInput } from '@h-ai/kit'
 *
 * const value: KitTransportConfigInput = { excludePaths: ['/api/health'] }
 * void value
 * ```
 */
export type KitTransportConfigInput = Partial<{
  readonly maxPlaintextBytes: number | 'auto'
  readonly maxFutureSkewSeconds: number
  readonly maxRequestAgeSeconds: number
  readonly routePlaintextBytes: Readonly<Record<string, number>>
  readonly keyExchangePath: `/${string}`
  readonly excludePaths: readonly `/${string}`[]
}>

/**
 * `config/_kit.yml` 的顶层输入类型。
 * @example
 * ```ts
 * import type { KitConfigInput } from '@h-ai/kit'
 *
 * const value: KitConfigInput = { transport: false }
 * void value
 * ```
 */
export interface KitConfigInput {
  readonly cors?: HttpCorsConfigInput
  readonly a2a?: HttpHostA2AConfigInput
  readonly server?: KitServerConfigInput
  readonly transport?: false | KitTransportConfigInput
  readonly http?: KitHttpConfigInput
}

/**
 * 浏览器可接收的 Kit 公共配置，仅包含传输协议路径和开关。
 * @example
 * ```ts
 * import type { KitPublicConfig } from '@h-ai/kit'
 * const config: KitPublicConfig = { transport: false }
 * ```
 */
export type KitPublicConfig = Pick<KitConfig, 'transport'>

/**
 * kit.auth 认证操作（由 createHandle auth.iam 注入）
 *
 * 注入后，kit.auth.login / kit.auth.logout 等函数自动委托到 iam.auth 对应方法。
 * 传入 `iam` 即可，kit 会自动提取所需方法。
 * @example
 * ```ts
 * import type { AuthOperations } from '@h-ai/kit'
 * import { iam } from '@h-ai/iam'
 *
 * // 在 IAM 初始化后注入其当前操作对象。
 * const operations: AuthOperations = iam.auth
 * void operations
 * ```
 */
export type AuthOperations = Pick<AuthnOperations, 'login' | 'loginWithOtp' | 'loginWithLdap' | 'loginWithApiKey' | 'registerAndLogin' | 'logout'>

/**
 * Kit 所需的 IAM 验证与 Cookie 认证操作。
 * @example
 * ```ts
 * import { iam } from '@h-ai/iam'
 * import type { KitIam } from '@h-ai/kit'
 * const identity: KitIam = iam
 * ```
 */
export interface KitIam {
  readonly auth: AuthOperations & { readonly verifyToken: HttpVerifyToken }
}

/**
 * 会话数据最小接口
 *
 * 守卫和权限检查函数所需的最小会话形状。
 * 应用层扩展的 session（如添加 displayName / avatarUrl 等字段）
 * 只要包含此接口的字段即可直接传入守卫函数，无需类型断言。
 * @example
 * ```ts
 * import type { SessionLike } from '@h-ai/kit'
 *
 * const value: SessionLike = { userId: 'user_1', roles: ['editor'], permissions: ['article:read'] }
 * void value
 * ```
 */
export interface SessionLike {
  /** 用户 ID */
  userId: string
  /** 角色列表 */
  roles: string[]
  /** 权限列表 */
  permissions: string[]
  /** 允许任意扩展字段 */
  [key: string]: unknown
}

/**
 * 用户会话数据
 *
 * 在 Handle Hook 中通过 `validateSession` 解析后注入 `event.locals.session`。
 * 守卫和中间件通过此结构判断用户身份、角色与权限。
 *
 * 应用层可通过 `& { displayName: string }` 等方式扩展，
 * 扩展后的类型自动兼容所有守卫和权限检查函数（它们接受 `SessionLike`）。
 * @example
 * ```ts
 * import type { SessionData } from '@h-ai/kit'
 *
 * const value: SessionData = { userId: 'user_1', username: 'alice', roles: ['editor'], permissions: ['article:read'] }
 * void value
 * ```
 */
export type SessionData = HttpSession

/**
 * 扩展的请求事件
 *
 * 在 SvelteKit 原生 `RequestEvent` 基础上注入会话和请求 ID。
 * @example
 * ```ts
 * import type { HaiRequestEvent } from '@h-ai/kit'
 *
 * function requestLabel(event: HaiRequestEvent) {
 *   return { requestId: event.requestId, userId: event.session?.userId }
 * }
 * ```
 */
export interface HaiRequestEvent
  extends RequestEvent {
  /** 会话数据 */
  session?: SessionData
  /** 请求 ID */
  requestId: string
}

/**
 * 中间件上下文
 *
 * 由 `createHandle` 构建，传递给所有中间件函数。
 * 包含当前请求事件、已解析的会话以及请求唯一 ID。
 * @example
 * ```ts
 * import type { MiddlewareContext } from '@h-ai/kit'
 *
 * function requestLabel(context: MiddlewareContext) {
 *   return context.event.url.pathname + ':' + context.requestId
 * }
 * ```
 */
export interface MiddlewareContext {
  /** 请求事件 */
  event: RequestEvent
  /** 会话数据 */
  session?: SessionData
  /** 请求 ID */
  requestId: string
}

/**
 * 中间件函数
 *
 * 遵循洋葱模型：调用 `next()` 前执行前置逻辑，调用后执行后置逻辑。
 * @example
 * ```ts
 * import type { Middleware } from '@h-ai/kit'
 *
 * const value: Middleware = async (_context, next) => { const response = await next(); response.headers.set('X-Example', 'enabled'); return response }
 * void value
 * ```
 */
export type Middleware = (
  context: MiddlewareContext,
  next: () => Promise<Response>,
) => Promise<Response>

/**
 * 路由守卫结果
 *
 * 守卫函数必须返回此结构。`allowed: true` 表示放行，否则根据
 * `redirect` / `message` / `status` 决定拦截行为。
 * @example
 * ```ts
 * import type { GuardResult } from '@h-ai/kit'
 *
 * const value: GuardResult = { allowed: false, status: 403 }
 * void value
 * ```
 */
export interface GuardResult {
  /** 是否允许访问 */
  allowed: boolean
  /** 重定向 URL（拒绝时） */
  redirect?: string
  /** 错误消息（拒绝时） */
  message?: string
  /** HTTP 状态码 */
  status?: number
}

/**
 * 路由守卫函数
 *
 * 接收请求事件与可选会话，返回 `GuardResult`（同步或异步均可）。
 * @example
 * ```ts
 * import type { RouteGuard } from '@h-ai/kit'
 *
 * const value: RouteGuard = (_event, session) => ({ allowed: session?.permissions.includes('article:read') ?? false, status: 403 })
 * void value
 * ```
 */
export type RouteGuard = (
  event: RequestEvent,
  session?: SessionData,
) => Promise<GuardResult> | GuardResult

/**
 * 守卫配置
 *
 * 在 `createHandle({ guards })` 中使用。
 * `paths` 支持 `/*` 和 `/**` 通配符，`exclude` 优先于 `paths`。
 * @example
 * ```ts
 * import type { GuardConfig } from '@h-ai/kit'
 *
 * const value: GuardConfig = { paths: ['/admin/**'], guard: (_event, session) => ({ allowed: Boolean(session) }) }
 * void value
 * ```
 */
export interface GuardConfig {
  /** 守卫函数 */
  guard: RouteGuard
  /** 适用路径（glob 模式） */
  paths?: string[]
  /** 排除路径 */
  exclude?: string[]
}

/**
 * 认证配置
 *
 * 在 `HandleConfig.auth` 中使用，自动完成：
 * 1. 从 Bearer header / Cookie 提取 Token
 * 2. 调用 verifyToken 恢复会话
 * 3. 根据 protectedPaths / publicPaths 自动生成路由守卫
 *
 * API 路径（以 `/api/` 开头）未认证时返回 401 JSON；
 * 非 API 路径未认证时重定向到 `loginUrl`（若配置）或返回 401。
 * @example
 * ```ts
 * import { core, HaiCommonError } from '@h-ai/core'
 * import type { HandleAuthConfig } from '@h-ai/kit'
 *
 * const value: HandleAuthConfig = { verifyToken: async () => core.err(HaiCommonError.UNAUTHORIZED), protectedPaths: ['/admin/**'], loginUrl: '/auth/login' }
 * void value
 * ```
 */
export interface HandleAuthConfig {
  /** 注入 IAM 验证令牌，并供 Cookie 认证操作使用。 */
  iam?: KitIam
  /** 自定义令牌验证器，优先于 iam.auth.verifyToken。 */
  verifyToken?: HttpVerifyToken
  /** 未认证时 UI 路由重定向地址（如 `'/auth/login'`） */
  loginUrl?: string
  /** Token Cookie 名（默认 `'hai_access_token'`） */
  cookieName?: string
  /** 需要认证的路径（支持 `/*` `/**` 通配符） */
  protectedPaths?: string[]
  /** 免认证的路径（优先于 protectedPaths） */
  publicPaths?: string[]
}

/**
 * Handle Hook 配置
 *
 * 传给 `kit.createHandle()` 的配置。
 *
 * 自动完成：
 * 1. 生成 requestId 并注入 `event.locals`
 * 2. 检查访问策略和默认地址限流，处理可选传输及 A2A 端点
 * 3. 根据 `auth` 配置解析会话并执行路由守卫
 * 4. 执行日志、自定义键限流和业务中间件
 * 5. 调用 resolve + 附加 `X-Request-Id` 响应头
 * @example
 * ```ts
 * import { core, HaiCommonError } from '@h-ai/core'
 * import type { HandleConfig } from '@h-ai/kit'
 *
 * const value: HandleConfig = { logging: true, auth: { verifyToken: async () => core.err(HaiCommonError.UNAUTHORIZED), protectedPaths: ['/admin/**'] } }
 * void value
 * ```
 */
export interface HandleConfig {
  /** 可信代理、请求访问策略及限流；独立规则文件在创建 Handle 时读取并验证一次。 */
  http?: Omit<KitHttpConfigInput, 'rateLimit'> & {
    /** 省略或 false 关闭。默认按可信地址在传输前计数，自定义键于会话解析和路由守卫后计算。 */
    rateLimit?: false | RateLimitConfig
  }
  /**
   * 认证配置
   *
   * 提供后自动完成 Token 解析、会话恢复、路由守卫等。
   * 不提供则不做认证处理。
   */
  auth?: HandleAuthConfig
  /** 跨域 HTTP 配置。省略或 false 关闭。 */
  cors?: false | HttpCorsOptions
  /**
   * 请求日志配置
   *
   * - `true`（默认）：启用日志中间件
   * - `{ logBody: true }`：启用并记录是否带有正文
   * - `false`：禁用日志
   */
  logging?: boolean | { logBody?: boolean }
  /** HTTP 请求和响应加密；false 或省略时关闭。 */
  transport?: false | TransportEncryptionOptions
  /** 对指定 Cookie 进行带认证的加密。 */
  crypto?: HookCryptoConfig
  /** 自定义错误处理（不提供则使用内置的 500 JSON 响应） */
  onError?: (error: unknown, event: RequestEvent) => Response | Promise<Response>
  /** 自定义守卫（在 auth 自动守卫之后执行） */
  guards?: GuardConfig[]
  /** 自定义中间件（在日志及自定义键限流后执行） */
  middleware?: Middleware[]
  /** 在请求访问和会话检查后分发契约。启用 transport 时，契约 apiPrefix 加入默认保护范围。 */
  contract?: HttpContractHandler
  /** 挂载由 ai.a2a.createHttpHandler() 创建的 Fetch 处理器。 */
  a2a?: false | HttpA2AHandler
}

/**
 * 传输加密详细配置
 * @example
 * ```ts
 * import type { TransportEncryptionOptions } from '@h-ai/kit'
 * import { type TransportServerKeyRing, type TransportKeyStore, crypto } from '@h-ai/crypto'
 *
 * function transport(serverKeyRing: TransportServerKeyRing, keyStore: TransportKeyStore): TransportEncryptionOptions {
 *   return { crypto, serverKeyRing, keyStore, excludePaths: ['/api/health'] }
 * }
 * ```
 */
export interface TransportEncryptionOptions {
  /** 宿主提供的已初始化加密模块。 */
  crypto: CryptoFunctions
  /** 宿主构建挂载目录，默认空字符串；SvelteKit 传入 paths.relative=false 时的 resolve('/').replace(/\/$/, '')。 */
  basePath?: string
  /** 双向业务明文 UTF-8 字节上限；默认 1 MiB，整数范围 1 KiB～64 MiB。 */
  maxPlaintextBytes?: number
  /** 请求时间允许领先服务器的秒数，默认 30，整数范围 0～1800。 */
  maxFutureSkewSeconds?: number
  /** 请求从签发起的有效秒数，默认 300，整数范围 1～3600。 */
  maxRequestAgeSeconds?: number
  /** 路由明文容量；* 匹配一个完整路径段。 */
  routePlaintextBytes?: Readonly<Record<string, number>>
  /** 受管服务端版本化密钥环，不进入公开 YAML/客户端配置。 */
  serverKeyRing: TransportServerKeyRing
  /** 实际请求绝对路径；默认 `/api/v1/_hai/key-exchange`。子目录挂载显式指定。 */
  keyExchangePath?: `/${string}`
  /** 排除路径（不加密），支持精确匹配和前缀匹配 */
  excludePaths?: readonly string[]
  /** 共享客户端公钥存储；适用于多节点部署。 */
  keyStore: TransportKeyStore
}

/**
 * Handle Hook 的 Cookie 加密配置。
 *
 * 在 `kit.createHandle({ crypto: { ... } })` 中使用。
 * @example
 * ```ts
 * import type { HookCryptoConfig } from '@h-ai/kit'
 * import { crypto } from '@h-ai/crypto'
 *
 * const config: HookCryptoConfig = { crypto, encryptedCookies: ['preferences'] }
 * ```
 */
export interface HookCryptoConfig {
  /** 注入 @h-ai/crypto 实例 */
  crypto: CryptoFunctions
  /**
   * 需要加密的 Cookie 名称列表
   *
   * 列出的 Cookie 在 set 时自动 SM4-CBC 加密，get 时自动解密。
   */
  encryptedCookies?: string[]
  /**
   * Cookie 加密密钥（32 字符十六进制 = 16 字节 SM4 密钥）
   *
   * 如不提供，则从环境变量 `HAI_KIT_COOKIE_KEY` 读取。
   * 配置了 `encryptedCookies` 但两者都未设置时，`kit.createHandle()` 会立即抛出配置错误，
   * 避免受保护 Cookie 静默降级为明文。
   */
  cookieEncryptionKey?: string
}

/**
 * API 响应包装
 *
 * `kit.response.*` 系列函数统一返回此结构的 JSON 响应。
 * 成功时 `success: true` 且 `data` 有值；失败时 `success: false` 且 `error` 有值。
 * @example
 * ```ts
 * import type { ApiResponse } from '@h-ai/kit'
 *
 * const value: ApiResponse<{ id: string }> = { success: true, data: { id: 'article_1' } }
 * void value
 * ```
 */
export interface ApiResponse<T = unknown> {
  /** 是否成功 */
  success: boolean
  /** 数据 */
  data?: T
  /** 错误信息 */
  error?: {
    code: string
    message: string
    traceId?: string
    /** 对应 HTTP 状态 */
    httpStatus?: number
    /** 仅含已本地化 field/message 的字段校验信息 */
    cause?: HaiError['cause']
    /** 经公开边界脱敏的扩展信息 */
    ext?: HaiError['ext']
    details?: unknown
  }
  /** 请求 ID */
  requestId?: string
}

/**
 * 表单验证错误
 *
 * 由 `kit.validate.*` 在校验失败时返回。
 * `field` 使用点号路径（如 `'address.city'`），`_` 表示全局错误。
 * @example
 * ```ts
 * import type { FormError } from '@h-ai/kit'
 *
 * const value: FormError = { field: 'title', message: 'Title is required' }
 * void value
 * ```
 */
export interface FormError {
  /** 字段名 */
  field: string
  /** 错误消息 */
  message: string
}

/**
 * 表单验证结果
 *
 * @template T - Zod schema 推导出的数据类型
 * @example
 * ```ts
 * import type { FormValidationResult } from '@h-ai/kit'
 *
 * const value: FormValidationResult<{ title: string }> = { valid: true, data: { title: 'Example' }, errors: [] }
 * void value
 * ```
 */
export interface FormValidationResult<T> {
  /** 是否有效 */
  valid: boolean
  /** 解析后的数据 */
  data?: T
  /** 错误列表 */
  errors: FormError[]
}

/**
 * 速率限制配置
 *
 * 基于可插拔原子存储的固定窗口限流。超限后返回 429 状态码与 `Retry-After` 响应头。
 * 必须显式传入 store；生产使用共享计数器，故障返回503。
 * @example
 * ```ts
 *
 * import { core } from '@h-ai/core'
 * import type { RateLimitConfig } from '@h-ai/kit'
 * import { cache } from '@h-ai/cache'
 *
 * const config: RateLimitConfig = { windowMs: 60_000, maxRequests: 100, store: core.access.createCacheRateLimitStore(cache, { namespace: 'api' }) }
 * void config
 * ```
 */
export type RateLimitConfig = HttpRateLimitOptions<HttpRateLimitContext>

/**
 * CORS 中间件配置
 *
 * 配置跨域资源共享策略。预检请求（OPTIONS）自动返回 204。
 * @example
 * ```ts
 * import type { CorsConfig } from '@h-ai/kit'
 *
 * const value: CorsConfig = { origin: ['https://app.example.com'], credentials: true }
 * void value
 * ```
 */
export type CorsConfig = HttpCorsOptions
