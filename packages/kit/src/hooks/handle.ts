/**
 * =============================================================================
 * @h-ai/kit - SvelteKit Handle Hook
 * =============================================================================
 * 提供 SvelteKit handle hook 的创建和组合功能
 * =============================================================================
 */

import type { Handle, RequestEvent } from '@sveltejs/kit'
import type { GuardConfig, GuardResult, HookConfig, Middleware, MiddlewareContext, SessionData } from '../kit-types.js'
import { core } from '@h-ai/core'

/**
 * 生成唯一请求级 ID
 *
 * 由时间戳（base36）+ 6 位随机串拼接，用于日志追踪与响应头 `X-Request-Id`。
 *
 * @param prefix - ID 前缀，如 `'req'`
 * @returns 格式为 `{prefix}_{timestamp}{random}` 的唯一 ID
 */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}_${timestamp}${random}`
}

/**
 * 创建 hai handle hook
 *
 * 整合会话解析、路由守卫、中间件链与统一错误处理的 SvelteKit handle hook 工厂。
 *
 * 执行顺序：
 * 1. 生成 `requestId` 并写入 `event.locals`
 * 2. 根据 Cookie 调用 `validateSession` 解析会话
 * 3. 按顺序执行 `guards`（路径过滤 → 权限判断）
 * 4. 构建 `MiddlewareContext` 并执行中间件链
 * 5. 调用 `resolve(event)` 获取业务响应
 * 6. 附加 `X-Request-Id` 响应头
 *
 * @param config - Hook 配置（均有合理默认值，可零配置使用）
 * @returns SvelteKit Handle 函数
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * export const handle = kit.hook.create({
 *   validateSession: token => iam.session.validate(token),
 *   guards: [{ guard: kit.guard.auth(), paths: ['/api/*'] }],
 *   middleware: [kit.middleware.logging()],
 * })
 * ```
 */
export function createHandle(config: HookConfig = {}): Handle {
  const {
    sessionCookieName = 'hai_session',
    validateSession,
    middleware = [],
    guards = [],
    onError,
    logging = true,
  } = config

  return async ({ event, resolve }) => {
    const startTime = Date.now()
    const requestId = generateId('req')

      // 添加请求 ID 到 event.locals
      ; (event.locals as Record<string, unknown>).requestId = requestId

    if (logging) {
      core.logger.trace('Request started', {
        requestId,
        method: event.request.method,
        path: event.url.pathname,
      })
    }

    try {
      // 解析会话
      let session: SessionData | undefined

      if (validateSession) {
        const sessionToken = event.cookies.get(sessionCookieName)

        if (sessionToken) {
          session = await validateSession(sessionToken) ?? undefined
          ; (event.locals as Record<string, unknown>).session = session
        }
      }

      // 执行守卫
      for (const guardConfig of guards) {
        const guardResult = await executeGuard(guardConfig, event, session)

        if (!guardResult.allowed) {
          if (guardResult.redirect) {
            return new Response(null, {
              status: 302,
              headers: { Location: guardResult.redirect },
            })
          }

          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: guardResult.message ?? 'Access denied',
              },
              requestId,
            }),
            {
              status: guardResult.status ?? 403,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      }

      // 构建中间件上下文
      const context: MiddlewareContext = {
        event,
        session,
        requestId,
      }

      // 执行中间件链
      const response = await executeMiddlewareChain(
        middleware,
        context,
        () => resolve(event),
      )

      // 添加请求 ID 到响应头
      response.headers.set('X-Request-Id', requestId)

      if (logging) {
        const duration = Date.now() - startTime
        core.logger.info('Request completed', {
          requestId,
          status: response.status,
          duration,
        })
      }

      return response
    }
    catch (error) {
      // 重新抛出 SvelteKit 的 redirect 和 error 异常
      // 这些异常是 SvelteKit 内部使用的控制流机制
      if (error && typeof error === 'object' && 'status' in error && 'location' in error) {
        // 这是 redirect 异常
        throw error
      }
      if (error && typeof error === 'object' && 'status' in error && 'body' in error) {
        // 这是 error 异常
        throw error
      }

      core.logger.error('Request failed', { requestId, error: error instanceof Error ? error.message : error })

      if (onError) {
        return onError(error, event)
      }

      // 默认错误响应
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Internal server error',
          },
          requestId,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }
  }
}

/**
 * 执行单个守卫（含路径过滤逻辑）
 *
 * 先检查 `exclude` 排除列表，再检查 `paths` 白名单。
 * 若路径不在守卫保护范围内，直接返回 `{ allowed: true }`。
 *
 * @param config - 守卫配置（含路径过滤）
 * @param event - SvelteKit 请求事件
 * @param session - 已解析的会话信息（可能为空）
 * @returns 守卫判定结果
 */
async function executeGuard(
  config: GuardConfig,
  event: RequestEvent,
  session?: SessionData,
): Promise<GuardResult> {
  const { guard, paths, exclude } = config
  const pathname = event.url.pathname

  // 检查是否排除
  if (exclude?.some(pattern => matchPath(pathname, pattern))) {
    return { allowed: true }
  }

  // 检查是否匹配路径
  if (paths && !paths.some(pattern => matchPath(pathname, pattern))) {
    return { allowed: true }
  }

  return guard(event, session)
}

/**
 * 递归执行中间件链
 *
 * 采用"洋葱模型"：每个中间件调用 `next()` 交给下一层，
 * 链末端调用 `final` 取得业务 Response。
 *
 * @param middleware - 待执行的中间件数组
 * @param context - 中间件共享上下文
 * @param final - 链末端的 resolve 回调
 * @returns 最终 Response
 */
async function executeMiddlewareChain(
  middleware: Middleware[],
  context: MiddlewareContext,
  final: () => Response | Promise<Response>,
): Promise<Response> {
  if (middleware.length === 0) {
    return final()
  }

  const [current, ...rest] = middleware

  return current(context, () => executeMiddlewareChain(rest, context, final))
}

/**
 * 简单路径通配符匹配
 *
 * 支持三种模式：
 * - 精确匹配：`/api/users` 仅匹配 `/api/users`
 * - 单层通配：`/api/*` 匹配 `/api/` 开头的所有路径
 * - 递归通配：`/api/**` 同上（语义等价）
 *
 * @param pathname - 当前请求路径
 * @param pattern - 匹配模式
 * @returns 是否匹配
 */
function matchPath(pathname: string, pattern: string): boolean {
  // 支持简单的通配符
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2)
    return pathname.startsWith(prefix)
  }

  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3)
    return pathname.startsWith(prefix)
  }

  return pathname === pattern
}

/**
 * 组合多个 SvelteKit handle 为单一 handle
 *
 * 从右到左嵌套：`sequence(a, b, c)` 执行顺序为 a → b → c → resolve。
 *
 * @param handles - 待组合的 handle 函数列表
 * @returns 组合后的单一 Handle 函数
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * const haiHandle = kit.hook.create({ ... })
 * const iamHandle = kit.iam.createHandle({ ... })
 * export const handle = kit.hook.sequence(haiHandle, iamHandle)
 * ```
 */
export function sequence(...handles: Handle[]): Handle {
  return async ({ event, resolve }) => {
    let currentResolve = resolve

    for (let i = handles.length - 1; i >= 0; i--) {
      const handle = handles[i]
      const nextResolve = currentResolve

      currentResolve = event => handle({ event, resolve: nextResolve })
    }

    return currentResolve(event)
  }
}
