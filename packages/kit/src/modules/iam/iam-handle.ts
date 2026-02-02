/**
 * =============================================================================
 * @hai/kit - IAM Handle
 * =============================================================================
 * 集成 @hai/iam 的 SvelteKit Handle Hook
 *
 * 功能：
 * - 自动验证会话令牌
 * - 注入用户信息到 locals
 * - 支持公开路径配置
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { createIamHandle } from '@hai/kit/modules/iam'
 * import { iam } from '$lib/server/iam'
 *
 * export const handle = createIamHandle({
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
        // 验证令牌
        const result = await iam.session.verifyToken(sessionToken)

        if (result.success && result.data) {
          const payload = result.data

          // 获取完整会话
          const sessionResult = await iam.session.getByToken(sessionToken)

          if (sessionResult.success && sessionResult.data) {
            locals.session = sessionResult.data

            // 获取用户信息
            const userResult = await iam.user.getById(payload.userId)
            if (userResult.success && userResult.data) {
              locals.user = userResult.data
            }
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
 */
export function requireAuth(event: RequestEvent): IamLocals {
  const locals = event.locals as unknown as IamLocals

  if (!locals.session || !locals.user) {
    throw new Response('Unauthorized', { status: 401 })
  }

  return locals
}

/**
 * 检查用户是否有指定角色
 */
export async function requireRole(
  event: RequestEvent,
  roleId: string,
  config: IamHandleConfig,
): Promise<IamLocals> {
  const locals = requireAuth(event)

  const result = await config.iam.authz.hasRole({ userId: locals.user!.id }, roleId)

  if (!result.success || !result.data) {
    throw new Response('Forbidden', { status: 403 })
  }

  return locals
}

/**
 * 检查用户是否有指定权限
 */
export async function requirePermission(
  event: RequestEvent,
  permission: string,
  config: IamHandleConfig,
): Promise<IamLocals> {
  const locals = requireAuth(event)

  const result = await config.iam.authz.checkPermission({ userId: locals.user!.id }, permission)

  if (!result.success || !result.data) {
    throw new Response('Forbidden', { status: 403 })
  }

  return locals
}
