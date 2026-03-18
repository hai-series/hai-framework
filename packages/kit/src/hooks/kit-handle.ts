/**
 * @h-ai/kit — SvelteKit Handle Hook
 *
 * 创建 SvelteKit Handle Hook，集成请求 ID 生成、会话验证、Cookie 加密代理、
 * 路由守卫、中间件链与可选传输加密；同时提供 `sequence()` 组合多个 Handle。
 * @module kit-handle
 */

import type { Handle, RequestEvent } from '@sveltejs/kit'
import type { GuardConfig, GuardResult, HandleConfig, Middleware, MiddlewareContext, SessionData } from '../kit-types.js'
import type { CookieProxyConfig } from './kit-cookie-proxy.js'
import { core } from '@h-ai/core'
import { configureAuth, getAccessToken } from '../kit-auth.js'
import { kitM } from '../kit-i18n.js'
import { isSvelteKitControlFlow } from '../kit-utils.js'
import { loggingMiddleware as loggingMiddlewareFn } from '../middleware/kit-logging.js'
import { rateLimitMiddleware as rateLimitMiddlewareFn } from '../middleware/kit-ratelimit.js'
import { handleA2ARequest, resolveA2AConfig } from '../modules/a2a/kit-a2a-handle.js'
import { transportEncryptionMiddleware } from '../modules/crypto/kit-transport-middleware.js'
import { createEncryptedCookieProxy } from './kit-cookie-proxy.js'

/**
 * 生成唯一请求级 ID
 *
 * 由时间戳（base36）+ 6 位随机串拼接，用于日志追踪与响应头 `X-Request-Id`。
 */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36)
  const random = crypto.randomUUID().replace(/-/g, '').substring(0, 8)
  return `${prefix}_${timestamp}${random}`
}

/**
 * 创建 hai handle hook
 *
 * 整合会话解析、路由守卫、中间件链与统一错误处理的 SvelteKit Handle 工厂。
 *
 * 执行顺序：
 * 1. 生成 `requestId` 并写入 `event.locals`
 * 2. 根据 `auth` 配置从 Bearer / Cookie 解析会话
 * 3. 根据 `auth.protectedPaths` 自动执行路由守卫 + 额外自定义守卫
 * 4. 构建中间件链（内置 logging / rateLimit + 自定义）并执行
 * 5. 调用 `resolve(event)` 获取业务响应
 * 6. 附加 `X-Request-Id` 响应头
 *
 * @param config - Handle 配置（均有合理默认值，可零配置使用）
 * @returns SvelteKit Handle 函数
 *
 * @example
 * ```ts
 * export const handle = kit.createHandle({
 *   auth: {
 *     verifyToken: validateSession,
 *     loginUrl: '/auth/login',
 *     protectedPaths: ['/admin/*', '/api/*'],
 *     publicPaths: ['/api/auth/*', '/api/public/*'],
 *   },
 *   rateLimit: { maxRequests: 100 },
 *   crypto: { crypto, transport: true },
 * })
 * ```
 */
export function createHandle(config: HandleConfig = {}): Handle {
  const {
    auth: authConfig,
    rateLimit: rateLimitConfig,
    logging: loggingConfig = true,
    crypto: cryptoConfig,
    onError,
    guards: customGuards = [],
    middleware: customMiddleware = [],
    a2a: a2aInput,
  } = config

  // ── A2A 配置解析 ──
  const a2aResolved = resolveA2AConfig(a2aInput)

  // ── 配置 Cookie 名 + 认证操作 ──
  if (authConfig?.cookieName || authConfig?.operations) {
    configureAuth({ cookieName: authConfig.cookieName, operations: authConfig.operations })
  }

  // ── 构建守卫列表（auth 自动守卫 + 自定义守卫） ──
  const guards: GuardConfig[] = []
  if (authConfig?.protectedPaths?.length) {
    guards.push({
      guard: buildAuthGuard(authConfig.verifyToken, authConfig.loginUrl),
      paths: authConfig.protectedPaths,
      exclude: authConfig.publicPaths,
    })
  }
  guards.push(...customGuards)

  // ── 构建中间件链 ──
  const builtinMiddleware: Middleware[] = []
  if (loggingConfig) {
    const logOpts = typeof loggingConfig === 'object' ? loggingConfig : { logBody: false }
    builtinMiddleware.push(loggingMiddlewareFn(logOpts))
  }
  if (rateLimitConfig) {
    builtinMiddleware.push(rateLimitMiddlewareFn({
      windowMs: rateLimitConfig.windowMs ?? 60000,
      maxRequests: rateLimitConfig.maxRequests ?? 100,
    }))
  }
  const allMiddleware = [...builtinMiddleware, ...customMiddleware]

  // ── 传输加密中间件自动注入到最外层 ──
  const finalMiddleware = buildTransportMiddleware(allMiddleware, cryptoConfig)

  // ── Cookie 加密配置预处理 ──
  const cookieProxyConfig = buildCookieProxyConfig(cryptoConfig)

  return async ({ event, resolve }) => {
    const requestId = generateId('req')

    // 注入 requestId 到 event.locals
    const locals = event.locals as unknown as Record<string, unknown>
    locals.requestId = requestId

    // ── Cookie 加密代理（透明） ──
    if (cookieProxyConfig) {
      const proxiedCookies = createEncryptedCookieProxy(event.cookies, cookieProxyConfig)
      Object.defineProperty(event, 'cookies', {
        value: proxiedCookies,
        writable: true,
        configurable: true,
      })
    }

    try {
      // ── A2A 端点拦截（在认证/守卫之前，A2A 有专用认证） ──
      if (a2aResolved) {
        const a2aResponse = await handleA2ARequest(event, requestId, a2aResolved)
        if (a2aResponse)
          return a2aResponse
      }

      // ── 会话解析 ──
      let session: SessionData | undefined

      if (authConfig) {
        const token = getAccessToken(event.request, event.cookies)
        if (token) {
          session = await authConfig.verifyToken(token) ?? undefined
          locals.session = session
          if (session) {
            locals.accessToken = token
          }
        }
      }

      // ── 执行守卫 ──
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
                message: guardResult.message ?? kitM('kit_accessDenied'),
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

      // ── 中间件链 ──
      const context: MiddlewareContext = {
        event,
        session,
        requestId,
      }

      const response = await executeMiddlewareChain(
        finalMiddleware,
        context,
        () => resolve(event),
      )

      response.headers.set('X-Request-Id', requestId)

      return response
    }
    catch (error) {
      // SvelteKit 控制流异常（redirect / error）必须继续抛出
      if (isSvelteKitControlFlow(error)) {
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
            message: kitM('kit_internalError'),
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

// ─── 内部：构建 auth 守卫 ───

/**
 * 根据 auth 配置构建路由守卫
 *
 * - API 路径（以 `/api/` 开头）：未认证返回 401 JSON
 * - 非 API 路径：未认证时重定向到 loginUrl（若配置），否则返回 401
 */
function buildAuthGuard(
  verifyToken: (token: string) => Promise<SessionData | null>,
  loginUrl?: string,
): (event: RequestEvent, session?: SessionData) => GuardResult {
  // verifyToken 参数仅用于类型签名对齐，实际会话已在上层解析
  void verifyToken

  return (event, session) => {
    if (session) {
      return { allowed: true }
    }

    const isApiRoute = event.url.pathname.startsWith('/api/')

    if (isApiRoute) {
      return {
        allowed: false,
        message: kitM('kit_authRequired'),
        status: 401,
      }
    }

    if (loginUrl) {
      const returnUrl = encodeURIComponent(event.url.pathname + event.url.search)
      return {
        allowed: false,
        redirect: `${loginUrl}?returnUrl=${returnUrl}`,
      }
    }

    return {
      allowed: false,
      message: kitM('kit_authRequired'),
      status: 401,
    }
  }
}

// ─── 内部：守卫执行 ───

/**
 * 执行单个守卫（含路径过滤逻辑）
 */
async function executeGuard(
  config: GuardConfig,
  event: RequestEvent,
  session?: SessionData,
): Promise<GuardResult> {
  const { guard, paths, exclude } = config
  const pathname = event.url.pathname

  if (exclude?.some(pattern => matchPath(pathname, pattern))) {
    return { allowed: true }
  }

  if (paths && !paths.some(pattern => matchPath(pathname, pattern))) {
    return { allowed: true }
  }

  return guard(event, session)
}

// ─── 内部：中间件执行 ───

/**
 * 递归执行中间件链（洋葱模型）
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

// ─── 内部：路径匹配 ───

/**
 * 路径通配符匹配（`/*` `/**` 精确匹配）
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

// ─── 内部：Crypto 配置构建 ───

/**
 * 构建最终中间件链：将传输加密中间件自动插入到最外层
 */
function buildTransportMiddleware(
  userMiddleware: Middleware[],
  cryptoConfig: HandleConfig['crypto'],
): Middleware[] {
  if (!cryptoConfig?.transport)
    return userMiddleware

  const transportOpts = typeof cryptoConfig.transport === 'object' ? cryptoConfig.transport : {}

  const transportMw = transportEncryptionMiddleware({
    enabled: true,
    crypto: cryptoConfig.crypto,
    keyExchangePath: transportOpts.keyExchangePath,
    excludePaths: transportOpts.excludePaths,
    encryptResponse: transportOpts.encryptResponse,
    requireEncryption: transportOpts.requireEncryption,
  })

  return [transportMw, ...userMiddleware]
}

/**
 * 构建 Cookie 加密代理配置
 */
function buildCookieProxyConfig(
  cryptoConfig: HandleConfig['crypto'],
): CookieProxyConfig | null {
  if (!cryptoConfig?.encryptedCookies?.length)
    return null

  // eslint-disable-next-line node/prefer-global/process
  const key = cryptoConfig.cookieEncryptionKey ?? (typeof process !== 'undefined' ? process.env?.HAI_COOKIE_KEY : undefined)
  if (!key) {
    core.logger.warn('Cookie encryption configured but no key provided (set crypto.cookieEncryptionKey or HAI_COOKIE_KEY env)')
    return null
  }

  return {
    names: new Set(cryptoConfig.encryptedCookies),
    symmetric: cryptoConfig.crypto.symmetric,
    encryptionKey: key,
  }
}

/**
 * 组合多个 SvelteKit handle 为单一 handle
 *
 * 洋葱模型：`sequence(a, b, c)` 执行顺序为 a → b → c → resolve → c → b → a。
 *
 * @param handles - 待组合的 handle 函数列表
 * @returns 组合后的单一 Handle 函数
 *
 * @example
 * ```ts
 * const haiHandle = kit.createHandle({ ... })
 * export const handle = kit.sequence(i18nHandle, haiHandle)
 * ```
 */
export function sequence(...handles: Handle[]): Handle {
  const filtered = handles.filter(Boolean)
  if (filtered.length === 0) {
    return ({ event, resolve }) => resolve(event)
  }
  if (filtered.length === 1) {
    return filtered[0]
  }
  return async ({ event, resolve }) => {
    return filtered.reduceRight(
      (next, handle) => (event: RequestEvent) => handle({ event, resolve: next }),
      resolve,
    )(event)
  }
}
