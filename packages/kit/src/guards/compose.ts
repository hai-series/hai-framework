/**
 * =============================================================================
 * @hai/kit - 组合守卫
 * =============================================================================
 * 组合多个守卫
 * =============================================================================
 */

import type { RequestEvent } from '@sveltejs/kit'
import type { GuardResult, RouteGuard, SessionData } from '../types.js'

/**
 * 所有守卫都通过才允许访问（AND 逻辑）
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

/** 条件判断函数类型 */
type ConditionFn = (event: RequestEvent, session: SessionData | undefined) => boolean | Promise<boolean>

/**
 * 条件守卫
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
