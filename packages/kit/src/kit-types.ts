/**
 * @h-ai/kit — 类型定义
 *
 * SvelteKit 集成相关类型
 * @module kit-types
 */

import type { RequestAccessConfigInput, TrustedProxies } from '@h-ai/core'
import type { CryptoFunctions, TransportKeyStore, TransportServerKeyRing } from '@h-ai/crypto'
import type { AuthnOperations } from '@h-ai/iam'
import type { RequestEvent } from '@sveltejs/kit'
import type { RateLimitStore } from './middleware/kit-ratelimit.js'

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
 * const value: KitTransportConfig = { keyExchangePath: '/api/_hai/key-exchange', excludePaths: ['/api/health'] }
 * void value
 * ```
 */
export interface KitTransportConfig {
  /** 双向明文 UTF-8 字节上限；省略使用 1 MiB，范围 1 KiB～64 MiB。 */
  readonly maxPlaintextBytes?: number
  /** 按完整路径段匹配的明文容量；* 匹配单段。 */
  readonly routePlaintextBytes?: Readonly<Record<string, number>>
  readonly keyExchangePath: `/${string}`
  readonly excludePaths: readonly `/${string}`[]
}

/**
 * `config/_kit.yml` 的顶层配置结构。
 * @example
 * ```ts
 * import type { KitConfig } from '@h-ai/kit'
 *
 * const value: KitConfig = { server: { host: '127.0.0.1', port: 3000 }, transport: false, trustedProxies: 'auto', access: false }
 * void value
 * ```
 */
export interface KitConfig {
  readonly server: KitServerConfig
  readonly transport: false | KitTransportConfig
  /** auto 仅在受管私有容器入口采用容器网段；普通宿主忽略转发头。 */
  readonly trustedProxies: TrustedProxies
  /** 每次请求的地址/时间/路径限制，默认 false；不会限制由静态服务器直接提供的资源。 */
  readonly access: RequestAccessConfigInput
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
  readonly server?: KitServerConfigInput
  readonly transport?: false | KitTransportConfigInput
  readonly trustedProxies?: TrustedProxies
  readonly access?: RequestAccessConfigInput
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
 * kit.auth 认证操作（由 createHandle auth.operations 注入）
 *
 * 注入后，kit.auth.login / kit.auth.logout 等函数自动委托到 iam.auth 对应方法。
 * 传入 `iam.auth` 即可，kit 会自动提取所需方法。
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
 * 认证操作提供器：支持直接传对象或按需返回最新对象的工厂函数
 * @example
 * ```ts
 * import type { AuthOperationsProvider } from '@h-ai/kit'
 * import { iam } from '@h-ai/iam'
 *
 * const operations: AuthOperationsProvider = () => iam.auth
 * void operations
 * ```
 */
export type AuthOperationsProvider = AuthOperations | (() => AuthOperations)

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
export interface SessionData {
  /** 用户 ID */
  userId: string
  /** 用户名 */
  username?: string
  /** 角色列表 */
  roles: string[]
  /** 权限列表 */
  permissions: string[]
  /** 自定义数据 */
  data?: Record<string, unknown>
  /** 允许任意扩展字段 */
  [key: string]: unknown
}

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
 * import type { HandleAuthConfig } from '@h-ai/kit'
 *
 * const value: HandleAuthConfig = { verifyToken: async () => null, protectedPaths: ['/admin/**'], loginUrl: '/auth/login' }
 * void value
 * ```
 */
export interface HandleAuthConfig {
  /** 令牌验证函数，返回 SessionData 或 null */
  verifyToken: (token: string) => Promise<SessionData | null>
  /**
   * 认证操作。
   *
   * - 直接对象：`operations: iam.auth`
   * - 工厂函数：`operations: () => iam.auth`（推荐，避免模块加载阶段捕获旧引用）
   */
  operations?: AuthOperationsProvider
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
 * 2. 根据 `auth` 配置解析会话
 * 3. 执行路由守卫
 * 4. 执行中间件链（logging / rateLimit / 自定义）
 * 5. 调用 resolve + 附加 `X-Request-Id` 响应头
 * @example
 * ```ts
 * import type { HandleConfig } from '@h-ai/kit'
 *
 * const value: HandleConfig = { logging: true, auth: { verifyToken: async () => null, protectedPaths: ['/admin/**'] } }
 * void value
 * ```
 */
export interface HandleConfig {
  /** 可信入口地址；auto 只信任受管私有容器网段，空数组忽略转发头。 */
  trustedProxies?: TrustedProxies
  /** 每次请求的 IP/时间/路径策略；独立文件在创建 Handle 时读取并验证一次。 */
  access?: RequestAccessConfigInput
  /**
   * 认证配置
   *
   * 提供后自动完成 Token 解析、会话恢复、路由守卫等。
   * 不提供则不做认证处理。
   */
  auth?: HandleAuthConfig
  /**
   * 速率限制配置
   *
   * 提供对象启用速率限制；设为 `false` 显式禁用。
   * 不提供则不开启速率限制。
   */
  rateLimit?: Omit<RateLimitConfig, 'windowMs' | 'maxRequests'> & { windowMs?: number, maxRequests?: number } | false
  /**
   * 请求日志配置
   *
   * - `true`（默认）：启用日志中间件
   * - `{ logBody: true }`：启用并记录请求体
   * - `false`：禁用日志
   */
  logging?: boolean | { logBody?: boolean }
  /**
   * 加密配置（传输加密 + Cookie 加密）
   *
   * 启用后 kit 自动在 Handle 中完成：
   * - 传输加密：请求体解密 / 响应体加密 / 密钥交换端点
   * - Cookie 加密：对指定 Cookie 的 get/set 自动 AES 加解密
   */
  crypto?: HookCryptoConfig
  /** 自定义错误处理（不提供则使用内置的 500 JSON 响应） */
  onError?: (error: unknown, event: RequestEvent) => Response | Promise<Response>
  /** 自定义守卫（在 auth 自动守卫之后执行） */
  guards?: GuardConfig[]
  /** 自定义中间件（在内置 logging / rateLimit 之后执行） */
  middleware?: Middleware[]
  /**
   * A2A 协议集成
   *
   * 传入 `ai.a2a` 操作对象后，自动挂载 Agent Card 发现端点和 JSON-RPC 处理端点。
   *
   * - 简单模式：`a2a: ai.a2a`（使用默认路径）
   * - 配置模式：`a2a: { operations: ai.a2a, rpcPath: '/api/a2a' }`
   */
  a2a?: HandleA2AOperations | HandleA2AConfig
}

// ─── A2A Handle 集成类型 ───

/**
 * A2A 操作接口（用于 Handle 集成）
 *
 * 与 `ai.a2a` 结构兼容，可直接传入 `ai.a2a` 对象。
 * @example
 * ```ts
 * import type { HandleA2AOperations } from '@h-ai/kit'
 * import { ai } from '@h-ai/ai'
 *
 * function operationsAfterInit(): HandleA2AOperations { return ai.a2a }
 * ```
 */
export interface HandleA2AOperations {
  /** 获取 Agent Card（返回 HaiResult 对象） */
  getAgentCard: () => { success: boolean, data?: unknown, error?: unknown }
  /** 处理 JSON-RPC 请求 */
  handleRequest: (body: unknown, context?: Record<string, unknown>) => Promise<{
    streaming: boolean
    body?: unknown
    stream?: AsyncGenerator<unknown, void, undefined>
  }>
}

/**
 * A2A Handle 配置（高级模式）
 * @example
 * ```ts
 * import type { HandleA2AConfig } from '@h-ai/kit'
 * import { ai } from '@h-ai/ai'
 *
 * function configAfterInit(): HandleA2AConfig { return { operations: ai.a2a, authenticate: async () => null } }
 * ```
 */
export interface HandleA2AConfig {
  /** A2A 操作接口（通常传入 `ai.a2a`） */
  operations: HandleA2AOperations
  /** Agent Card 端点路径（默认 `/.well-known/agent-card.json`） */
  cardPath?: string
  /** JSON-RPC 端点路径（默认 `/a2a`） */
  rpcPath?: string
  /**
   * A2A 认证
   *
   * - `'apiKey'`：使用 IAM API Key 认证（读取 Agent Card.securitySchemes.apiKey）
   * - 函数：自定义认证回调；返回 null/undefined 拒绝请求（401）
   * 未配置此项才允许匿名请求。
   */
  authenticate?: 'apiKey' | ((event: RequestEvent) => Promise<Record<string, unknown> | null | undefined>)
}

/**
 * 传输加密详细配置
 * @example
 * ```ts
 * import type { TransportEncryptionOptions } from '@h-ai/kit'
 * import type { TransportServerKeyRing, TransportKeyStore } from '@h-ai/crypto'
 *
 * function transport(serverKeyRing: TransportServerKeyRing, keyStore: TransportKeyStore): TransportEncryptionOptions {
 *   return { serverKeyRing, keyStore, excludePaths: ['/api/health'] }
 * }
 * ```
 */
export interface TransportEncryptionOptions {
  /** 双向业务明文 UTF-8 字节上限；默认 1 MiB，整数范围 1 KiB～64 MiB。 */
  maxPlaintextBytes?: number
  /** 路由明文容量；* 匹配一个完整路径段。 */
  routePlaintextBytes?: Readonly<Record<string, number>>
  /** 受管服务端版本化密钥环，不进入公开 YAML/客户端配置。 */
  serverKeyRing: TransportServerKeyRing
  /** 密钥交换端点路径（默认 `'/api/_hai/key-exchange'`） */
  keyExchangePath?: string
  /** 排除路径（不加密），支持精确匹配和前缀匹配 */
  excludePaths?: readonly string[]
  /** 共享客户端公钥存储；适用于多节点部署。 */
  keyStore: TransportKeyStore
}

/**
 * Handle Hook 加密配置
 *
 * 在 `kit.createHandle({ crypto: { ... } })` 中使用。
 * @example
 * ```ts
 * import type { HookCryptoConfig, TransportEncryptionOptions } from '@h-ai/kit'
 * import { crypto } from '@h-ai/crypto'
 *
 * function config(transport: TransportEncryptionOptions): HookCryptoConfig { return { crypto, transport } }
 * ```
 */
export interface HookCryptoConfig {
  /** 注入 @h-ai/crypto 实例 */
  crypto: CryptoFunctions
  /**
   * 启用传输加密。
   * - `false` 或省略：关闭
   * - 对象：必填受管 serverKeyRing / keyStore，可附加公开路径配置
   */
  transport?: false | TransportEncryptionOptions
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
 * import type { RateLimitConfig } from '@h-ai/kit'
 * import { kit } from '@h-ai/kit'
 * import { cache } from '@h-ai/cache'
 *
 * const config: RateLimitConfig = { windowMs: 60_000, maxRequests: 100, store: kit.middleware.createCacheRateLimitStore(cache, { namespace: 'api' }) }
 * void config
 * ```
 */
export interface RateLimitConfig {
  /** 时间窗口 (ms) */
  windowMs: number
  /** 最大请求数 */
  maxRequests: number
  /** 自定义 key 生成 */
  keyGenerator?: (event: RequestEvent) => string
  /** 超限处理 */
  onLimitReached?: (event: RequestEvent) => Response
  /**
   * 自定义存储实现
   *
   * 必须提供原子 increment；不支持 get+set 回退。共享缓存由调用方初始化和关闭。
   */
  store: RateLimitStore
}

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
export interface CorsConfig {
  /** 允许的源（支持通配符，如 `*.example.com`） */
  origin?: string | string[] | ((origin: string) => boolean)
  /** 允许的方法 */
  methods?: string[]
  /** 允许的头 */
  allowedHeaders?: string[]
  /** 暴露的头 */
  exposedHeaders?: string[]
  /** 是否允许凭证 */
  credentials?: boolean
  /** 预检缓存时间 (秒) */
  maxAge?: number
  /** 是否自动允许 Capacitor WebView origin（默认 true） */
  capacitor?: boolean
}
