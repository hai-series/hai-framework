/**
 * =============================================================================
 * @hai/kit - 角色守卫
 * =============================================================================
 * 验证用户是否具有指定角色
 * =============================================================================
 */

import type { GuardResult, RouteGuard } from '../kit-types.js'

/**
 * 角色守卫配置
 */
export interface RoleGuardConfig {
  /** 需要的角色（满足任意一个即可） */
  roles: string[]
  /** 是否需要全部角色 */
  requireAll?: boolean
  /** 无权限时重定向 URL */
  forbiddenUrl?: string
  /** 是否返回 JSON 错误（API 模式） */
  apiMode?: boolean
}

/**
 * 创建角色守卫
 */
export function roleGuard(config: RoleGuardConfig): RouteGuard {
  const { roles, requireAll = false, forbiddenUrl = '/403', apiMode = false } = config

  return (_event, session): GuardResult => {
    if (!session) {
      return {
        allowed: false,
        message: 'Authentication required',
        status: 401,
      }
    }

    const userRoles = session.roles ?? []

    const hasRole = requireAll
      ? roles.every(role => userRoles.includes(role))
      : roles.some(role => userRoles.includes(role))

    if (!hasRole) {
      if (apiMode) {
        return {
          allowed: false,
          message: `Required roles: ${roles.join(', ')}`,
          status: 403,
        }
      }

      return {
        allowed: false,
        redirect: forbiddenUrl,
      }
    }

    return { allowed: true }
  }
}
