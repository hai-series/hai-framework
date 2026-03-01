/**
 * @h-ai/kit — 角色守卫
 *
 * 验证用户是否具有指定角色
 * @module kit-role
 */

import type { GuardResult, RouteGuard } from '../kit-types.js'

/**
 * 角色守卫配置
 */
export interface RoleGuardConfig {
  /** 需要的角色列表（默认 OR 逻辑，满足任一即通过） */
  roles: string[]
  /** 为 `true` 时要求用户拥有 **全部** 角色（AND 逻辑） */
  requireAll?: boolean
  /** 无权限时重定向 URL（默认 `'/403'`） */
  forbiddenUrl?: string
  /** 为 `true` 时返回 JSON 403 而非重定向 */
  apiMode?: boolean
}

/**
 * 创建角色守卫
 *
 * 检查用户 `session.roles` 是否满足配置中的角色要求。
 * 未认证时返回 401；角色不匹配时根据 `apiMode` 返回 JSON 403 或重定向。
 *
 * @param config - 角色守卫配置
 * @returns RouteGuard 实例
 *
 * @example
 * ```ts
 * guards: [
 *   { guard: kit.guard.role({ roles: ['admin'], apiMode: true }), paths: ['/api/admin/*'] },
 * ]
 * ```
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
