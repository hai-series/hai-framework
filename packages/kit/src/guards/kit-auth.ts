/**
 * @h-ai/kit — 认证守卫
 *
 * 验证用户是否已登录
 * @module kit-auth
 */

import type { GuardResult, RouteGuard, SessionData } from '../kit-types.js'
import { getAccessToken } from '../kit-auth.js'
import { kitM } from '../kit-i18n.js'

/**
 * 认证守卫配置
 * @example
 * ```ts
 * import type { AuthGuardConfig } from '@h-ai/kit'
 *
 * const value: AuthGuardConfig = { apiMode: true }
 * void value
 * ```
 */
export interface AuthGuardConfig {
  /** 未登录时重定向 URL（默认 `'/login'`） */
  loginUrl?: string
  /** 为 `true` 时返回 JSON 401 而非重定向（适用于 API 路由） */
  apiMode?: boolean
}

/**
 * 会话守卫配置
 * @example
 * ```ts
 * import type { SessionGuardConfig } from '@h-ai/kit'
 *
 * const value: SessionGuardConfig = { validateSession: async () => null }
 * void value
 * ```
 */
export interface SessionGuardConfig {
  /** 会话校验函数（通常由应用注入 iam.auth.verifyToken 封装） */
  validateSession: (token: string) => Promise<SessionData | null>
  /** 未登录时重定向 URL（默认 `'/login'`） */
  loginUrl?: string
  /** 为 `true` 时返回 JSON 401 而非重定向（适用于 API 路由） */
  apiMode?: boolean
}

/**
 * 创建认证守卫
 *
 * 检查会话是否存在；未认证时：
 * - 页面模式：重定向到 `loginUrl`，并携带 `returnUrl` 参数以便登录后返回。
 * - API 模式：返回 JSON `{ allowed: false, status: 401 }`。
 *
 * @param config - 守卫配置
 * @returns RouteGuard 实例
 * @example 模块内部上下文
 * ```ts
 * const guard = authGuard({ apiMode: true })
 * void guard
 * ```
 */
export function authGuard(config: AuthGuardConfig = {}): RouteGuard {
  const { loginUrl = '/login', apiMode = false } = config

  return (event, session): GuardResult => {
    if (!session) {
      if (apiMode) {
        return {
          allowed: false,
          message: kitM('kit_authRequired'),
          status: 401,
        }
      }

      // 保存原始 URL 用于登录后重定向
      const returnUrl = encodeURIComponent(event.url.pathname + event.url.search)

      return {
        allowed: false,
        redirect: `${loginUrl}?returnUrl=${returnUrl}`,
      }
    }

    return { allowed: true }
  }
}

/**
 * 创建会话守卫（支持 Bearer + 固定 Access Token Cookie 自动恢复）。
 *
 * 处理流程：
 * 1. 若上游已注入 session，直接放行
 * 2. 否则从 request/cookies 解析 token（Bearer 优先）
 * 3. 调用 validateSession 恢复并写入 event.locals.session
 * 4. 失败则按页面/API模式返回重定向或 401
 * @param config - 会话令牌验证回调和拒绝响应策略。
 * @returns 按验证结果返回 GuardResult 的路由守卫。
 * @example 模块内部上下文
 * ```ts
 * const guard = sessionGuard({ validateSession: async () => null })
 * void guard
 * ```
 */
export function sessionGuard(config: SessionGuardConfig): RouteGuard {
  const { validateSession, loginUrl = '/login', apiMode = false } = config

  return async (event, session): Promise<GuardResult> => {
    if (session) {
      return { allowed: true }
    }

    const token = getAccessToken(event.request, event.cookies)
    if (!token) {
      if (apiMode) {
        return {
          allowed: false,
          message: kitM('kit_authRequired'),
          status: 401,
        }
      }

      const returnUrl = encodeURIComponent(event.url.pathname + event.url.search)
      return {
        allowed: false,
        redirect: `${loginUrl}?returnUrl=${returnUrl}`,
      }
    }

    const recoveredSession = await validateSession(token)
    if (!recoveredSession) {
      if (apiMode) {
        return {
          allowed: false,
          message: kitM('kit_authRequired'),
          status: 401,
        }
      }

      const returnUrl = encodeURIComponent(event.url.pathname + event.url.search)
      return {
        allowed: false,
        redirect: `${loginUrl}?returnUrl=${returnUrl}`,
      }
    }

    // Workaround：SvelteKit App.Locals 是项目侧声明的 interface，库代码无法靠模块增强检查动态 key。
    const locals = event.locals as unknown as Record<string, unknown>
    locals.session = recoveredSession
    locals.accessToken = token
    return { allowed: true }
  }
}
