/**
 * @h-ai/kit — 认证守卫
 *
 * 验证用户是否已登录
 * @module kit-auth
 */

import type { GuardResult, RouteGuard } from '../kit-types.js'
import { kitM } from '../kit-i18n.js'

/**
 * 认证守卫配置
 */
export interface AuthGuardConfig {
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
 *
 * @example
 * ```ts
 * // Hook 配置
 * guards: [
 *   { guard: kit.guard.auth({ apiMode: true }), paths: ['/api/*'] },
 *   { guard: kit.guard.auth(), paths: ['/dashboard/*'] },
 * ]
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
