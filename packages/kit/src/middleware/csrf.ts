/**
 * =============================================================================
 * @h-ai/kit - CSRF 中间件
 * =============================================================================
 * CSRF 防护
 * =============================================================================
 */

import type { CsrfConfig, Middleware } from '../kit-types.js'
import { core } from '@h-ai/core'

/**
 * 生成唯一 ID
 */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}_${timestamp}${random}`
}

/**
 * 默认 CSRF 配置
 */
const defaultConfig: Required<CsrfConfig> = {
  cookieName: 'hai_csrf',
  headerName: 'X-CSRF-Token',
  exclude: [],
}

/**
 * 创建 CSRF 中间件
 */
export function csrfMiddleware(config: CsrfConfig = {}): Middleware {
  const mergedConfig = { ...defaultConfig, ...config }

  return async (context, next) => {
    const { event, requestId } = context
    const { cookieName, headerName, exclude } = mergedConfig

    // 检查是否排除
    const pathname = event.url.pathname
    if (exclude.some(pattern => matchPath(pathname, pattern))) {
      return next()
    }

    // 安全方法不需要验证
    const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(event.request.method)

    if (safeMethod) {
      // 确保有 CSRF token
      let token = event.cookies.get(cookieName)

      if (!token) {
        token = generateId('csrf')
        event.cookies.set(cookieName, token, {
          path: '/',
          httpOnly: false, // 前端需要读取
          sameSite: 'strict',
          secure: event.url.protocol === 'https:',
        })
      }

      return next()
    }

    // 验证 CSRF token
    const cookieToken = event.cookies.get(cookieName)
    const headerToken = event.request.headers.get(headerName)

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      core.logger.warn('CSRF token validation failed', { requestId, pathname })

      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'CSRF_VALIDATION_FAILED',
            message: 'Invalid CSRF token',
          },
          requestId,
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    return next()
  }
}

/**
 * 简单路径匹配
 */
function matchPath(pathname: string, pattern: string): boolean {
  if (pattern.endsWith('/*')) {
    return pathname.startsWith(pattern.slice(0, -2))
  }
  if (pattern.endsWith('/**')) {
    return pathname.startsWith(pattern.slice(0, -3))
  }
  return pathname === pattern
}
