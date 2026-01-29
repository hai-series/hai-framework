/**
 * =============================================================================
 * @hai/kit - 类型定义
 * =============================================================================
 * SvelteKit 集成相关类型
 * =============================================================================
 */

import type { RequestEvent } from '@sveltejs/kit'

/**
 * 用户会话数据
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
 */
export type Middleware = (
  context: MiddlewareContext,
  next: () => Promise<Response>,
) => Promise<Response>

/**
 * 路由守卫结果
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
 */
export type RouteGuard = (
  event: RequestEvent,
  session?: SessionData,
) => Promise<GuardResult> | GuardResult

/**
 * 守卫配置
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
 */
export interface FormError {
  /** 字段名 */
  field: string
  /** 错误消息 */
  message: string
}

/**
 * 表单验证结果
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
 * Rate Limiter 配置
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
 * CSRF 配置
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
 * CORS 配置
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
