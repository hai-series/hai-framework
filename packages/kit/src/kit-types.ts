/**
 * =============================================================================
 * @h-ai/kit - 类型定义
 * =============================================================================
 * SvelteKit 集成相关类型
 * =============================================================================
 */

import type { RequestEvent } from '@sveltejs/kit'

/**
 * 用户会话数据
 *
 * 在 Handle Hook 中通过 `validateSession` 解析后注入 `event.locals.session`。
 * 守卫和中间件通过此结构判断用户身份、角色与权限。
 *
 * @example
 * ```ts
 * const session: SessionData = {
 *   userId: 'u_123',
 *   username: 'alice',
 *   roles: ['admin'],
 *   permissions: ['user:read', 'user:write'],
 * }
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
}

/**
 * 扩展的请求事件
 *
 * 在 SvelteKit 原生 `RequestEvent` 基础上注入会话和请求 ID。
 */
export interface HaiRequestEvent<Params extends Record<string, string> = Record<string, string>>
  extends RequestEvent<Params> {
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
 * Hook 配置
 *
 * 传给 `kit.createHandle()` 的完整配置。
 * 执行顺序：会话解析 → guards → middleware → resolve。
 *
 * @example
 * ```ts
 * kit.createHandle({
 *   logging: true,
 *   middleware: [kit.middleware.cors()],
 *   guards: [{ guard: kit.guard.auth(), paths: ['/api/*'] }],
 * })
 * ```
 */
export interface HookConfig {
  /** 会话 Cookie 名称 */
  sessionCookieName?: string
  /** 会话验证函数 */
  validateSession?: (token: string) => Promise<SessionData | null>
  /** 中间件列表 */
  middleware?: Middleware[]
  /** 守卫列表 */
  guards?: GuardConfig[]
  /** 错误处理 */
  onError?: (error: unknown, event: RequestEvent) => Response | Promise<Response>
  /** 请求日志 */
  logging?: boolean
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
 * 基于内存滑动窗口实现。超限后返回 429 状态码与 `Retry-After` 响应头。
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
}

/**
 * CSRF 中间件配置
 *
 * 安全方法（GET/HEAD/OPTIONS）自动签发 Token Cookie；
 * 写操作方法要求 Header 与 Cookie 的 Token 一致，不一致返回 403。
 */
export interface CsrfConfig {
  /** Token Cookie 名称 */
  cookieName?: string
  /** Token Header 名称 */
  headerName?: string
  /** 排除路径 */
  exclude?: string[]
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
  /** 允许的源 */
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
}
