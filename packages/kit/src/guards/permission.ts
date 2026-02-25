/**
 * =============================================================================
 * @h-ai/kit - 权限守卫
 * =============================================================================
 * 验证用户是否具有指定权限
 * =============================================================================
 */

import type { GuardResult, RouteGuard } from '../kit-types.js'

/**
 * 权限守卫配置
 */
export interface PermissionGuardConfig {
  /** 需要的权限（满足任意一个即可） */
  permissions: string[]
  /** 是否需要全部权限 */
  requireAll?: boolean
  /** 无权限时重定向 URL */
  forbiddenUrl?: string
  /** 是否返回 JSON 错误（API 模式） */
  apiMode?: boolean
}

/**
 * 创建权限守卫
 */
export function permissionGuard(config: PermissionGuardConfig): RouteGuard {
  const { permissions, requireAll = false, forbiddenUrl = '/403', apiMode = false } = config

  return (_event, session): GuardResult => {
    if (!session) {
      return {
        allowed: false,
        message: 'Authentication required',
        status: 401,
      }
    }

    const userPermissions = session.permissions ?? []

    // 支持通配符权限，如 admin:* 匹配 admin:read, admin:write 等
    const hasPermission = requireAll
      ? permissions.every(perm => matchPermission(perm, userPermissions))
      : permissions.some(perm => matchPermission(perm, userPermissions))

    if (!hasPermission) {
      if (apiMode) {
        return {
          allowed: false,
          message: `Required permissions: ${permissions.join(', ')}`,
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

/**
 * 匹配权限
 * 支持通配符：
 * - admin:* 匹配 admin:read, admin:write 等
 * - * 匹配所有权限
 */
function matchPermission(required: string, userPermissions: string[]): boolean {
  for (const userPerm of userPermissions) {
    // 完全匹配
    if (userPerm === required) {
      return true
    }

    // 用户有超级权限
    if (userPerm === '*') {
      return true
    }

    // 通配符匹配
    if (userPerm.endsWith(':*')) {
      const prefix = userPerm.slice(0, -1) // 移除 *
      if (required.startsWith(prefix)) {
        return true
      }
    }
  }

  return false
}
