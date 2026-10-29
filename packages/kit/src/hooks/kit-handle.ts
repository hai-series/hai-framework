/**
 * @h-ai/kit — SvelteKit Handle Hook
 *
 * 创建 SvelteKit Handle Hook，集成请求 ID 生成、会话验证、Cookie 加密代理、
 * 路由守卫、中间件链与可选传输加密；同时提供 `sequence()` 组合多个 Handle。
 * @module kit-handle
 */

import type { AuditActorSnapshot } from '@h-ai/audit'
import type { RequestAccessCheck } from '@h-ai/core'
import type { Handle, RequestEvent, ResolveOptions } from '@sveltejs/kit'
import type { GuardConfig, GuardResult, HandleConfig, Middleware, MiddlewareContext, SessionData } from '../kit-types.js'
import type { CookieProxyConfig } from './kit-cookie-proxy.js'
import { audit } from '@h-ai/audit'
import { core, err, HaiCommonError } from '@h-ai/core'
import { TRANSPORT_PROTOCOL } from '@h-ai/crypto'
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
 * 为 SvelteKit 响应补充默认安全头。
 *
 * 仅设置不会破坏页面渲染的基础头；CSP 需要应用结合 nonce / 静态资源策略单独配置。
 */
function applyDefaultSecurityHeaders(response: Response): void {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'no-referrer')
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
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit'
 *
 * const handle = kit.createHandle({ auth: { verifyToken: async () => null, protectedPaths: ['/admin/**'] } })
 * void handle
 * ```
 */
export function createHandle(config: HandleConfig = {}): Handle {
  const resolveIp = core.access.createClientIpResolver(config.trustedProxies ?? 'auto')
  const checkAccess = config.access && core.access.createRequestCheck(config.access)
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
  if (checkAccess && checkAccess.requiresEncryption && !cryptoConfig?.transport)
    throw new Error('Request access rules require transport encryption, but Kit transport is not configured')

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
      ...rateLimitConfig,
      windowMs: rateLimitConfig.windowMs ?? 60000,
      maxRequests: rateLimitConfig.maxRequests ?? 100,
    }))
  }
  const allMiddleware = [...builtinMiddleware, ...customMiddleware]

  // ── 传输加密中间件单独包裹整个 handle 流程 ──
  const transportMiddleware = buildTransportMiddleware(cryptoConfig, checkAccess ? checkAccess.encryption : undefined)

  // ── Cookie 加密配置预处理 ──
  const cookieProxyConfig = buildCookieProxyConfig(cryptoConfig)

  return async ({ event, resolve }) => {
    const suppliedRequestId = event.request.headers.get('x-request-id')
    const requestId = suppliedRequestId && /^[\w.:-]{1,128}$/.test(suppliedRequestId) ? suppliedRequestId : generateId('req')
    let clientAddress: string | undefined
    try {
      clientAddress = event.getClientAddress()
    }
    catch { /* 静态预渲染等宿主可能没有连接地址，不能改信任请求转发头。 */ }
    const resolvedAddress = resolveIp(event.request, clientAddress)
    if (resolvedAddress !== clientAddress) {
      // IAM、审计、限流及业务路由读取同一可信地址；无效代理链不能降级为代理身份。
      event.getClientAddress = () => {
        if (!resolvedAddress)
          throw new Error('Trusted client address is unavailable')
        return resolvedAddress
      }
    }
    clientAddress = resolvedAddress
    const accessDecision = checkAccess ? checkAccess(event.url.pathname, event.request.method, clientAddress) : undefined
    return core.context.run({ requestId, userId: undefined, scopeId: undefined, jobId: undefined }, () => audit.withContext({
      actor: null,
      requestId,
      traceId: requestId,
      scopeId: undefined,
      ipAddress: clientAddress,
      userAgent: event.request.headers.get('user-agent')?.slice(0, 4096),
    }, async () => {
      let actor: AuditActorSnapshot | null = null
      let guardDenied = false
      let requestFailed = false
      const captureRequest = async (status: number) => {
        // 与 Serv 自动审计边界一致：纯站点可不装配 Audit；已就绪模块的写入失败仍须报告。
        if (!audit.isInitialized)
          return
        const resource = event.route.id ?? 'unmatched'
        const written = await audit.capture({
          action: 'request.execute',
          resource,
          userId: actor?.id ?? null,
          actorSnapshot: actor,
          category: /\/(?:auth|iam|audit)(?:\/|$)/.test(resource) ? 'system' : 'business',
          outcome: guardDenied || [401, 403, 423, 429].includes(status) ? 'denied' : requestFailed || status >= 400 ? 'failure' : 'success',
          details: { method: event.request.method, status },
        }, { read: ['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) })
        if (!written.success)
          core.logger.error('Request audit failed', { requestId, resource, error: written.error })
      }
      const context: MiddlewareContext = {
        event,
        requestId,
      }

      // 注入 requestId 到 event.locals
      // Workaround：SvelteKit App.Locals 是项目侧声明的 interface，库代码无法靠模块增强检查动态 key。
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

      const runRequest = async (): Promise<Response> => {
        try {
          if (accessDecision && !accessDecision.allowed) {
            guardDenied = true
            core.logger.info('Request access policy denied', { ruleId: accessDecision.ruleId, reason: accessDecision.reason, method: event.request.method, ipAddress: clientAddress })
            return Response.json({ success: false, error: { ...HaiCommonError.REQUEST_ACCESS_DENIED, message: core.i18n.coreM('core_requestAccessDenied'), traceId: requestId } }, { status: 403 })
          }
          if (!transportMiddleware && event.request.method !== 'OPTIONS'
            && (event.request.headers.has(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER) || event.request.headers.has(TRANSPORT_PROTOCOL.ENVELOPE_HEADER))
            && checkAccess && checkAccess.encryption(event.url.pathname, event.request.method) === 'disabled') {
            return Response.json(err({ ...HaiCommonError.VALIDATION_ERROR, message: kitM('kit_transportPlaintextRequired'), traceId: requestId }), { status: 400 })
          }
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
          context.session = session
          actor = session ? { id: session.userId, username: session.username, roles: session.roles } : null

          return await audit.withContext({ actor }, () => core.context.run({ userId: session?.userId }, async () => {
            // ── 执行守卫 ──
            for (const guardConfig of guards) {
              const guardResult = await executeGuard(guardConfig, event, session)

              if (!guardResult.allowed) {
                guardDenied = true
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
            const response = await executeMiddlewareChain(
              allMiddleware,
              context,
              () => resolve(event),
            )

            return response
          }))
        }
        catch (error) {
        // SvelteKit 控制流异常（redirect / error）必须继续抛出
          if (isSvelteKitControlFlow(error)) {
            // 控制流仍由 SvelteKit 处理；这里只记录结果，避免遗漏抛出的 HTTP 拒绝。
            if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number')
              await captureRequest(error.status)
            throw error
          }

          requestFailed = true
          core.logger.error('Request failed', { requestId, error })

          if (onError) {
            return onError(error, event)
          }

          // 默认错误响应
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: core.error.formatMessage({ message: kitM('kit_internalError'), traceId: requestId }),
                traceId: requestId,
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

      // 密钥交换由传输层短路、响应本来就是明文，先让它经过同一访问策略。
      const keyExchange = cryptoConfig?.transport
        ? cryptoConfig.transport.keyExchangePath ?? '/api/_hai/key-exchange'
        : undefined
      const deniedHandshake = accessDecision && !accessDecision.allowed && event.request.method === 'POST' && event.url.pathname === keyExchange
      const response = deniedHandshake
        ? await runRequest()
        : transportMiddleware
          ? await transportMiddleware(context, runRequest)
          : await runRequest()

      await captureRequest(response.status)
      applyDefaultSecurityHeaders(response)
      response.headers.set('X-Request-Id', requestId)
      response.headers.set('X-Trace-Id', requestId)
      return response
    }))
  }
}

// ─── 内部：构建 auth 守卫 ───

/**
 * 根据 auth 配置构建路由守卫
 *
 * - 应用内API路径（实际URL或route.id位于`/api/`）：未认证返回401 JSON
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

    // route.id不含挂载前缀；移除路由分组后仍按应用API识别，避免子目录API被当成页面重定向。
    const routePath = event.route.id?.replace(/\/\([^/]*\)/g, '')
    const isApiRoute = event.url.pathname.startsWith('/api/') || routePath?.startsWith('/api/') === true

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
  cryptoConfig: HandleConfig['crypto'],
  encryption?: RequestAccessCheck['encryption'],
): Middleware | null {
  if (!cryptoConfig?.transport)
    return null

  const transportOpts = cryptoConfig.transport

  return transportEncryptionMiddleware({
    enabled: true,
    crypto: cryptoConfig.crypto,
    serverKeyRing: transportOpts.serverKeyRing,
    keyExchangePath: transportOpts.keyExchangePath,
    excludePaths: transportOpts.excludePaths,
    keyStore: transportOpts.keyStore,
    maxPlaintextBytes: transportOpts.maxPlaintextBytes,
    routePlaintextBytes: transportOpts.routePlaintextBytes,
  }, encryption)
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
  const key = cryptoConfig.cookieEncryptionKey ?? (typeof process !== 'undefined' ? process.env?.HAI_KIT_COOKIE_KEY : undefined)
  if (!key) {
    throw new Error('Cookie encryption requires crypto.cookieEncryptionKey or HAI_KIT_COOKIE_KEY')
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
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit'
 *
 * const handle = kit.sequence(kit.createHandle({ logging: true }), kit.createHandle())
 * void handle
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
    function applyHandle(index: number, currentEvent: RequestEvent, options?: ResolveOptions): ReturnType<Handle> {
      if (index === filtered.length)
        return resolve(currentEvent, options)

      return filtered[index]({
        event: currentEvent,
        resolve: async (nextEvent, nextOptions) => {
          const merged: ResolveOptions = {
            ...options,
            ...nextOptions,
            preload: options?.preload ?? nextOptions?.preload,
            filterSerializedResponseHeaders: options?.filterSerializedResponseHeaders ?? nextOptions?.filterSerializedResponseHeaders,
          }
          // 页面转换按内层到外层执行，保留 i18n 的语言标记替换。
          if (options?.transformPageChunk || nextOptions?.transformPageChunk) {
            merged.transformPageChunk = async ({ html, done }) => {
              if (nextOptions?.transformPageChunk)
                html = (await nextOptions.transformPageChunk({ html, done })) ?? ''
              if (options?.transformPageChunk)
                html = (await options.transformPageChunk({ html, done })) ?? ''
              return html
            }
          }
          return applyHandle(index + 1, nextEvent, merged)
        },
      })
    }

    return applyHandle(0, event)
  }
}
