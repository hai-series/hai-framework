/**
 * =============================================================================
 * @h-ai/kit - IAM Handle
 * =============================================================================
 * 集成 @h-ai/iam 的 SvelteKit Handle Hook
 *
 * 功能：
 * - 自动验证会话令牌
 * - 注入用户信息到 locals
 * - 支持公开路径配置
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { kit } from '@h-ai/kit'
 * import { iam } from '@h-ai/iam'
 *
 * export const handle = kit.iam.createHandle({
 *     iam,
 *     publicPaths: ['/login', '/register', '/api/health'],
 *     sessionCookieName: 'session',
 *     onUnauthenticated: (event) => {
 *         throw redirect(303, '/login')
 *     }
 * })
 * ```
 * =============================================================================
 */

import type { Handle, RequestEvent } from '@sveltejs/kit'
import type { IamHandleConfig, IamLocals } from './iam-types.js'

/**
 * 检查路径是否与模式列表匹配
 *
 * @param pathname - 当前请求路径
 * @param patterns - 匹配模式列表（支持尾部 `*` 通配）
 * @returns 是否匹配
 */
function matchPath(pathname: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.endsWith('*')) {
      // 通配符匹配
      return pathname.startsWith(pattern.slice(0, -1))
    }
    return pathname === pattern
  })
}

/**
 * 创建 IAM Handle Hook
 *
 * 执行顺序：
 * 1. 初始化 `event.locals.session` 为 `null`
 * 2. 读取会话 Cookie，调用 `iam.auth.verifyToken` 验证令牌
 * 3. 验证成功则将 session 填充到 locals
 * 4. 非公开路径且未认证时，调用 `onUnauthenticated` 或返回 401
 *
 * @param config - IAM Handle 配置
 * @returns SvelteKit Handle 函数
 *
 * @example
 * ```ts
 * export const handle = kit.iam.createHandle({
 *   iam,
 *   publicPaths: ['/login', '/register', '/api/health'],
 *   onUnauthenticated: (event) => { throw redirect(303, '/login') },
 * })
 * ```
 */
export function createIamHandle(config: IamHandleConfig): Handle {
  const {
    iam,
    publicPaths = [],
    sessionCookieName = 'hai_session',
    onUnauthenticated,
  } = config

  return async ({ event, resolve }) => {
    const pathname = event.url.pathname

    // 初始化 locals
    const locals = event.locals as unknown as IamLocals
    locals.session = null

    // 检查是否是公开路径
    const isPublicPath = matchPath(pathname, publicPaths)

    // 获取会话令牌
    const sessionToken = event.cookies.get(sessionCookieName)

    if (sessionToken) {
      try {
        // 验证令牌（verifyToken 已包含会话查询和滑动续期逻辑）
        const sessionResult = await iam.auth.verifyToken(sessionToken)

        if (sessionResult.success) {
          locals.session = sessionResult.data
        }
      }
      catch {
        // 令牌验证失败，清除 cookie
        event.cookies.delete(sessionCookieName, { path: '/' })
      }
    }

    // 非公开路径需要认证
    if (!isPublicPath && !locals.session) {
      if (onUnauthenticated) {
        return onUnauthenticated(event)
      }
      // 默认返回 401
      return new Response('Unauthorized', { status: 401 })
    }

    return resolve(event)
  }
}

/**
 * API 路由认证断言
 *
 * 从 `event.locals` 取出会话信息，若未认证则抛出 401 Response。
 * 仅适用于已经经过 `createIamHandle` 处理过的请求。
 *
 * @param event - SvelteKit 请求事件
 * @returns 受认证保护的 IamLocals（含 session）
 * @throws Response - 401 Unauthorized
 *
 * @example
 * ```ts
 * export const POST: RequestHandler = async (event) => {
 *   const { session } = kit.iam.requireAuth(event)
 *   // session 必不为 null
 * }
 * ```
 */
export function requireAuth(event: RequestEvent): IamLocals {
  const locals = event.locals as unknown as IamLocals

  if (!locals.session) {
    throw new Response('Unauthorized', { status: 401 })
  }

  return locals
}
