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
 * 检查路径是否匹配
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
 * 验证会话令牌 → 查询用户信息 → 注入到 event.locals
 *
 * @param config - 配置选项
 * @returns SvelteKit Handle 函数
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
    locals.user = null

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

          // 查询用户信息
          const userResult = await iam.user.getUser(sessionResult.data.userId)
          if (userResult.success && userResult.data) {
            locals.user = userResult.data
          }
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
 * 创建 API 路由守卫中间件
 *
 * 验证当前请求是否已认证，未认证时抛出 401 Response。
 */
export function requireAuth(event: RequestEvent): IamLocals {
  const locals = event.locals as unknown as IamLocals

  if (!locals.session || !locals.user) {
    throw new Response('Unauthorized', { status: 401 })
  }

  return locals
}
