/**
 * @h-ai/kit — CSRF 中间件
 *
 * 基于 Double-Submit Cookie 模式的 CSRF 防护中间件。
 * 使用 Web Crypto API 生成密码学安全 Token，并在写请求中校验
 * Cookie 与 Header 的 Token 一致性。
 * @module kit-csrf
 */

import type { CsrfConfig, Middleware } from '../kit-types.js'
import { core } from '@h-ai/core'
import { kitM } from '../kit-i18n.js'

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

    // 使用恒定时间比较，防止时序侧信道攻击
    const tokensMatch = cookieToken && headerToken
      && cookieToken.length === headerToken.length
      && safeTokenCompare(cookieToken, headerToken)

    if (!tokensMatch) {
      core.logger.warn('CSRF token validation failed', { requestId, pathname })

      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'CSRF_VALIDATION_FAILED',
            message: kitM('kit_csrfValidationFailed'),
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
 * 恒定时间 Token 比较
 *
 * 使用逐字节异或的方式比较，无论字符在哪个位置不同，
 * 比较耗时恒定，防止时序侧信道攻击。
 * 调用方必须先确保两个字符串长度相同。
 *
 * @param a - 第一个 Token
 * @param b - 第二个 Token
 * @returns 是否相同
 */
function safeTokenCompare(a: string, b: string): boolean {
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
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
