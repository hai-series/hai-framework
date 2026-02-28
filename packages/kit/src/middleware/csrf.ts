/**
 * =============================================================================
 * @h-ai/kit - CSRF 中间件
 * =============================================================================
 * 基于 Double-Submit Cookie 模式的 CSRF 防护中间件。
 * 使用 Web Crypto API 生成密码学安全 Token，写请求时自动校验
 * Cookie 与 Header 中的 Token 一致性。
 * =============================================================================
 */

import type { CsrfConfig, Middleware } from '../kit-types.js'
import { core } from '@h-ai/core'

/**
 * 生成密码学安全的 CSRF token
 *
 * 使用 Web Crypto API 生成 32 字节随机值，确保 token 不可预测。
 *
 * @returns 64 字符十六进制 token
 */
function generateSecureToken(): string {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
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
 * 创建 CSRF 防护中间件
 *
 * Double Submit Cookie 模式：
 * 1. 安全方法（GET/HEAD/OPTIONS）：确保 Cookie 中存在 CSRF token（无则自动创建）
 * 2. 写方法（POST/PUT/DELETE等）：比较 Cookie token 与 Header token，不一致时返回 403
 *
 * @param config - CSRF 配置
 * @returns Middleware 实例
 *
 * @example
 * ```ts
 * middleware: [
 *   kit.middleware.csrf({ exclude: ['/api/webhook/*'] }),
 * ]
 * ```
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
        token = generateSecureToken()
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
 * 简单路径通配符匹配
 *
 * 注意：`/api/*` 不会匹配 `/api-docs`，仅匹配 `/api` 或 `/api/...` 路径。
 *
 * @param pathname - 当前请求路径
 * @param pattern - 匹配模式（支持 `/*` 和 `/**` 通配符）
 * @returns 是否匹配
 */
function matchPath(pathname: string, pattern: string): boolean {
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2)
    return pathname === base || pathname.startsWith(`${base}/`)
  }
  if (pattern.endsWith('/**')) {
    const base = pattern.slice(0, -3)
    return pathname === base || pathname.startsWith(`${base}/`)
  }
  return pathname === pattern
}
