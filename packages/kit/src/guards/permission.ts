/**
 * =============================================================================
 * @h-ai/kit - 权限守卫
 * =============================================================================
 * 验证用户是否具有指定权限。
 *
 * 提供四层权限检查能力：
 * - `permissionGuard()`：Hook 级路由守卫，用于 `kit.createHandle({ guards })` 配置
 * - `hasPermission()`：布尔判断，适用于条件分支
 * - `assertPermission()`：断言式检查，不满足时返回 403 Response，适用于 API Handler
 * - `requirePermission()`：强制要求，不满足时 throw Response（SvelteKit 控制流）
 * =============================================================================
 */

import type { GuardResult, RouteGuard, SessionLike } from '../kit-types.js'
import { getKitMessage } from '../kit-i18n.js'

/**
 * 权限守卫配置
 */
export interface PermissionGuardConfig {
  /** 需要的权限列表（默认 OR 逻辑，满足任一即通过） */
  permissions: string[]
  /** 为 `true` 时要求用户拥有 **全部** 权限（AND 逻辑） */
  requireAll?: boolean
  /** 无权限时重定向 URL（默认 `'/403'`） */
  forbiddenUrl?: string
  /** 为 `true` 时返回 JSON 403 而非重定向 */
  apiMode?: boolean
}

/**
 * 创建权限守卫
 *
 * 检查用户 `session.permissions` 是否满足配置中的权限要求。
 * 支持通配符匹配：`admin:*` 可匹配 `admin:read`、`admin:write` 等。
 * 未认证时返回 401；权限不匹配时根据 `apiMode` 返回 JSON 403 或重定向。
 *
 * @param config - 权限守卫配置
 * @returns RouteGuard 实例
 *
 * @example
 * ```ts
 * guards: [
 *   { guard: kit.guard.permission({ permissions: ['user:read', 'user:write'], requireAll: true }), paths: ['/api/users/*'] },
 * ]
 * ```
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
 *
 * 支持通配符：
 * - `admin:*` 匹配 `admin:read`、`admin:write` 等
 * - `*` 匹配所有权限
 *
 * @param required - 需要的权限码
 * @param userPermissions - 用户已有的权限列表
 * @returns 是否匹配
 */
export function matchPermission(required: string, userPermissions: string[]): boolean {
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

/**
 * 检查会话是否具有指定权限（布尔判断）
 *
 * 适用于条件分支场景（如菜单过滤、按钮显示等）。
 *
 * @param session - 当前会话数据，null/undefined 视为无权限
 * @param permission - 需要的权限码，如 `user:read`
 * @returns 是否拥有权限
 *
 * @example
 * ```ts
 * if (kit.guard.hasPermission(locals.session, 'user:read')) {
 *   // 有权限
 * }
 * ```
 */
export function hasPermission(
  session: SessionLike | null | undefined,
  permission: string,
): boolean {
  if (!session)
    return false
  return matchPermission(permission, session.permissions ?? [])
}

/**
 * 断言会话具有指定权限，不满足时返回 403 Response
 *
 * 适用于 SvelteKit API Handler 内部，不满足权限时直接返回 JSON 错误响应。
 * 调用者需检查返回值：若有返回值则表示权限不足，应直接 return。
 *
 * @param session - 当前会话数据，null/undefined 视为未认证
 * @param permission - 需要的权限码，如 `user:create`
 * @returns 权限不足时返回 Response；有权限时返回 undefined
 *
 * @example
 * ```ts
 * export const POST: RequestHandler = async ({ locals }) => {
 *   const denied = kit.guard.assertPermission(locals.session, 'user:create')
 *   if (denied) return denied
 *   // ... 正常逻辑
 * }
 * ```
 */
export function assertPermission(
  session: SessionLike | null | undefined,
  permission: string,
): Response | undefined {
  if (!session) {
    return new Response(
      JSON.stringify({ success: false, error: getKitMessage('kit_unauthorized') }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (!matchPermission(permission, session.permissions ?? [])) {
    return new Response(
      JSON.stringify({ success: false, error: getKitMessage('kit_forbidden', { params: { permission } }) }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }

  return undefined
}

/**
 * 要求会话具有指定权限，不满足时 throw Response
 *
 * 利用 SvelteKit 控制流机制：throw 的 Response 对象会被框架捕获并直接作为响应返回。
 * 搭配 `kit.handler()` 使用时，无需手动检查返回值。
 *
 * @param session - 当前会话数据，null/undefined 视为未认证
 * @param permission - 需要的权限码，如 `user:create`
 * @throws Response - 未认证 401 / 无权限 403
 *
 * @example
 * ```ts
 * export const GET = kit.handler(async ({ locals }) => {
 *   kit.guard.requirePermission(locals.session, 'user:read')
 *   // 执行到这里说明权限已通过
 *   return kit.response.ok(data)
 * })
 * ```
 */
export function requirePermission(
  session: SessionLike | null | undefined,
  permission: string,
): void {
  const denied = assertPermission(session, permission)
  if (denied) {
    throw denied
  }
}
