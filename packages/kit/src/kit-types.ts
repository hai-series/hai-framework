/**
 * @h-ai/kit — 类型定义
 *
 * SvelteKit 集成相关类型
 * @module kit-types
 */

import type { AuthnOperations } from '@h-ai/iam'
import type { RequestEvent } from '@sveltejs/kit'
import type { RateLimitStore } from './middleware/kit-ratelimit.js'
import type { TransportCryptoServiceLike } from './modules/crypto/kit-crypto-types.js'

/**
 * kit.auth 认证操作（由 createHandle auth.operations 注入）
 *
 * 注入后，kit.auth.login / kit.auth.logout 等函数自动委托到 iam.auth 对应方法。
 * 传入 `iam.auth` 即可，kit 会自动提取所需方法。
 */
export type AuthOperations = Pick<AuthnOperations, 'login' | 'loginWithOtp' | 'loginWithLdap' | 'loginWithApiKey' | 'registerAndLogin' | 'logout'>

/** 认证操作提供器：支持直接传对象或按需返回最新对象的工厂函数 */
export type AuthOperationsProvider = AuthOperations | (() => AuthOperations)

/**
 * 会话数据最小接口
 *
 * 守卫和权限检查函数所需的最小会话形状。
 * 应用层扩展的 session（如添加 displayName / avatarUrl 等字段）
 * 只要包含此接口的字段即可直接传入守卫函数，无需类型断言。
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
 *
 * @example
 * ```ts
 * const session: SessionData = {
 *   userId: 'u_123',
 *   username: 'alice',
 *   roles: ['admin'],
 *   permissions: ['user:read', 'user:write'],
 * }
 *
 * // 应用层扩展
 * type AppSession = SessionData & { displayName: string, avatarUrl: string }
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
 *
 * @example
 * ```ts
 * const timing: Middleware = async (ctx, next) => {
 *   const start = Date.now()
 *   const response = await next()
 *   response.headers.set('X-Duration', `${Date.now() - start}ms`)
 *   return response
 * }
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
 *
 * @example
 * ```ts
 * const myGuard: RouteGuard = (event, session) => {
 *   if (!session) return { allowed: false, status: 401 }
 *   return { allowed: true }
 * }
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
 *
 * @example
 * ```ts
 * const config: GuardConfig = {
 *   guard: kit.guard.auth({ apiMode: true }),
 *   paths: ['/api/*'],
 *   exclude: ['/api/health'],
 * }
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
 *
 * @example
 * ```ts
 * kit.createHandle({
 *   auth: {
 *     verifyToken: validateSession,
 *     loginUrl: '/auth/login',
 *     protectedPaths: ['/admin/*', '/api/*'],
 *     publicPaths: ['/api/auth/*', '/api/public/*'],
 *   },
 * })
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
 *
 * @example
 * ```ts
 * kit.createHandle({
 *   auth: {
 *     verifyToken: validateSession,
 *     loginUrl: '/auth/login',
 *     protectedPaths: ['/admin/*', '/api/*'],
 *     publicPaths: ['/api/auth/*'],
 *   },
 *   rateLimit: { maxRequests: 100 },
 *   crypto: { crypto, transport: true },
 * })
 * ```
 */
export interface HandleConfig {
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
  rateLimit?: { windowMs?: number, maxRequests?: number } | false
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
 */
export interface HandleA2AOperations {
  /** 获取 Agent Card（返回 Result 对象） */
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
 *
 * @example
 * ```ts
 * kit.createHandle({
 *   a2a: {
 *     operations: ai.a2a,
 *     rpcPath: '/api/a2a',
 *     authenticate: 'apiKey', // 自动使用 IAM API Key 验证
 *   },
 * })
 * ```
 */
export interface HandleA2AConfig {
  /** A2A 操作接口（通常传入 `ai.a2a`） */
  operations: HandleA2AOperations
  /** Agent Card 端点路径（默认 `/.well-known/agent.json`） */
  cardPath?: string
  /** JSON-RPC 端点路径（默认 `/a2a`） */
  rpcPath?: string
  /**
   * A2A 认证
   *
   * - `'apiKey'`：自动使用 IAM API Key 认证（根据 Agent Card 的 security 配置提取 key）
   * - 函数：自定义认证回调
   */
  authenticate?: 'apiKey' | ((event: RequestEvent) => Promise<Record<string, unknown> | null | undefined>)
}

/**
 * 传输加密详细配置
 */
export interface TransportEncryptionOptions {
  /** 密钥交换端点路径（默认 `'/api/kit/key-exchange'`） */
  keyExchangePath?: string
  /** 排除路径（不加密），支持精确匹配和前缀匹配 */
  excludePaths?: string[]
  /**
   * 是否强制要求传输加密（默认 `true`）
   *
   * - `true`：非排除路径上缺少 X-Client-Id 请求头时返回 400
   * - `false`：缺少 X-Client-Id 时透传明文（渐进式迁移）
   */
  requireEncryption?: boolean
  /** 是否加密响应体（默认 `true`） */
  encryptResponse?: boolean
}

/**
 * Handle Hook 加密配置
 *
 * 在 `kit.createHandle({ crypto: { ... } })` 中使用。
 *
 * @example
 * ```ts
 * kit.createHandle({
 *   crypto: {
 *     crypto: cryptoInstance,
 *     transport: true,
 *     encryptedCookies: ['hai_session'],
 *     cookieEncryptionKey: process.env.HAI_KIT_COOKIE_KEY,
 *   },
 * })
 * ```
 */
export interface HookCryptoConfig {
  /** 注入 @h-ai/crypto 实例（传输加密所需的非对称 + 对称子集） */
  crypto: TransportCryptoServiceLike
  /**
   * 启用传输加密。
   * - `true`：使用默认配置
   * - 对象：自定义配置
   */
  transport?: boolean | TransportEncryptionOptions
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
   * 两者都未设置时 Cookie 加密不生效并输出警告。
   */
  cookieEncryptionKey?: string
}

/**
 * API 响应包装
 *
 * `kit.response.*` 系列函数统一返回此结构的 JSON 响应。
 * 成功时 `success: true` 且 `data` 有值；失败时 `success: false` 且 `error` 有值。
 *
 * @example
 * ```ts
 * // 成功
 * { success: true, data: { id: '1' }, requestId: 'req_abc' }
 * // 失败
 * { success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } }
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
 *
 * @example
 * ```ts
 * const { valid, data, errors } = await kit.validate.form(request, schema)
 * if (!valid) return kit.response.validationError(errors)
 * // data 此时类型安全
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
 * 基于可插拔存储的滑动窗口限流。超限后返回 429 状态码与 `Retry-After` 响应头。
 * 默认使用内存存储（单进程），多实例部署请传入分布式 `store` 实现。
 *
 * @example
 * ```ts
 * kit.middleware.rateLimit({
 *   windowMs: 60_000,   // 1 分钟
 *   maxRequests: 100,   // 最多 100 次
 * })
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
   * 默认使用 `MemoryRateLimitStore`（单进程）。
   * 多实例部署时传入基于 Redis / @h-ai/cache 的分布式 Store。
   */
  store?: RateLimitStore
}

/**
 * CORS 中间件配置
 *
 * 配置跨域资源共享策略。预检请求（OPTIONS）自动返回 204。
 *
 * @example
 * ```ts
 * kit.middleware.cors({
 *   origin: ['https://example.com'],
 *   credentials: true,
 *   maxAge: 86400,
 * })
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
