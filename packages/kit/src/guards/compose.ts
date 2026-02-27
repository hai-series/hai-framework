/**
 * =============================================================================
 * @h-ai/kit - 组合守卫
 * =============================================================================
 * 组合多个守卫
 * =============================================================================
 */

import type { RequestEvent } from '@sveltejs/kit'
import type { GuardResult, RouteGuard, SessionData } from '../kit-types.js'

/**
 * 所有守卫都通过才允许访问（AND 逻辑）
 *
 * 短路求值：第一个拒绝的守卫结果会被直接返回。
 *
 * @param guards - 需要全部通过的守卫列表
 * @returns 组合后的 RouteGuard
 *
 * @example
 * ```ts
 * const adminOnly = kit.guard.all(
 *   kit.guard.auth(),
 *   kit.guard.role({ roles: ['admin'] }),
 * )
 * ```
 */
export function allGuards(...guards: RouteGuard[]): RouteGuard {
  return async (event, session): Promise<GuardResult> => {
    for (const guard of guards) {
      const result = await guard(event, session)

      if (!result.allowed) {
        return result
      }
    }

    return { allowed: true }
  }
}

/**
 * 任意一个守卫通过就允许访问（OR 逻辑）
 *
 * 短路求值：第一个允许的守卫结果会被直接返回。
 * 全部拒绝时返回最后一个拒绝结果。
 *
 * @param guards - 守卫列表
 * @returns 组合后的 RouteGuard
 *
 * @example
 * ```ts
 * const canView = kit.guard.any(
 *   kit.guard.role({ roles: ['admin'] }),
 *   kit.guard.permission({ permissions: ['article:read'] }),
 * )
 * ```
 */
export function anyGuard(...guards: RouteGuard[]): RouteGuard {
  return async (event, session): Promise<GuardResult> => {
    let lastResult: GuardResult = { allowed: false, message: 'No guards passed' }

    for (const guard of guards) {
      const result = await guard(event, session)

      if (result.allowed) {
        return result
      }

      lastResult = result
    }

    return lastResult
  }
}

/**
 * 取反守卫
 *
 * 将原守卫的判定逻辑反转：原本放行变为拒绝，原本拒绝变为放行。
 * 典型场景：「仅未登录用户可访问登录页」。
 *
 * @param guard - 需要取反的守卫
 * @param options - 拒绝时的重定向/消息
 * @returns 取反后的 RouteGuard
 *
 * @example
 * ```ts
 * // 仅未登录用户可访问
 * const guestOnly = kit.guard.not(kit.guard.auth(), { redirect: '/dashboard' })
 * ```
 */
export function notGuard(guard: RouteGuard, options: { redirect?: string, message?: string } = {}): RouteGuard {
  return async (event, session): Promise<GuardResult> => {
    const result = await guard(event, session)

    if (result.allowed) {
      return {
        allowed: false,
        redirect: options.redirect,
        message: options.message ?? 'Access denied',
      }
    }

    return { allowed: true }
  }
}

/** 条件判断函数类型：返回 `true` 时才执行后续守卫 */
type ConditionFn = (event: RequestEvent, session: SessionData | undefined) => boolean | Promise<boolean>

/**
 * 条件守卫
 *
 * 仅当 `condition` 返回 `true` 时才执行 `guard`；否则直接放行。
 *
 * @param condition - 条件判断函数
 * @param guard - 条件满足时执行的守卫
 * @returns 包装后的 RouteGuard
 *
 * @example
 * ```ts
 * // 仅 POST 请求检查 CSRF
 * kit.guard.conditional(
 *   (event) => event.request.method === 'POST',
 *   csrfGuard,
 * )
 * ```
 */
export function conditionalGuard(
  condition: ConditionFn,
  guard: RouteGuard,
): RouteGuard {
  return async (event, session): Promise<GuardResult> => {
    const shouldApply = await condition(event, session)

    if (!shouldApply) {
      return { allowed: true }
    }

    return guard(event, session)
  }
}
