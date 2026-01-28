/**
 * =============================================================================
 * @hai/kit - 认证守卫
 * =============================================================================
 * 验证用户是否已登录
 * =============================================================================
 */

import type { GuardResult, RouteGuard, SessionData } from '../types.js'

/**
 * 认证守卫配置
 */
export interface AuthGuardConfig {
  /** 未登录时重定向 URL */
  loginUrl?: string
  /** 是否返回 JSON 错误（API 模式） */
  apiMode?: boolean
}

/**
 * 创建认证守卫
 */
export function authGuard(config: AuthGuardConfig = {}): RouteGuard {
  const { loginUrl = '/login', apiMode = false } = config
  
  return (event, session): GuardResult => {
    if (!session) {
      if (apiMode) {
        return {
          allowed: false,
          message: 'Authentication required',
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
