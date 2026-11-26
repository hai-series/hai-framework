/**
 * @h-ai/kit — SvelteKit Handle Hook
 *
 * 创建 SvelteKit Handle Hook，集成请求 ID 生成、会话验证、Cookie 加密代理、
 * 路由守卫、中间件链与可选传输加密；同时提供 `sequence()` 组合多个 Handle。
 * @module kit-handle
 */

import type { AuditActorSnapshot } from '@h-ai/audit'
import type { RequestEvent } from '@sveltejs/kit'
import type { Handle, ResolveOptions } from '@sveltejs/kit/hooks'
import type { GuardConfig, GuardResult, HandleConfig, Middleware, MiddlewareContext, SessionData } from '../kit-types.js'
import type { CookieProxyConfig } from './kit-cookie-proxy.js'
import process from 'node:process'
import { audit } from '@h-ai/audit'
import { core, HaiCommonError } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { getAccessToken, withRequestAuth } from '../kit-auth.js'
import { resolveKitHttpConfig } from '../kit-config.js'
import { kitM } from '../kit-i18n.js'
import { fromError } from '../kit-response.js'
import { isSvelteKitControlFlow, setResponseHeaders } from '../kit-utils.js'
import { loggingMiddleware as loggingMiddlewareFn } from '../middleware/kit-logging.js'
import { rateLimitMiddleware as rateLimitMiddlewareFn } from '../middleware/kit-ratelimit.js'
import { transportEncryptionMiddleware } from '../modules/crypto/kit-transport-middleware.js'
import { DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH } from '../modules/crypto/kit-transport-paths.js'
import { createEncryptedCookieProxy } from './kit-cookie-proxy.js'

/**
 * 生成唯一请求级 ID
 *
 * 由时间戳（base36）+ 6 位随机串拼接，用于日志追踪与响应头 `X-Request-Id`。
 */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36)
  const random = globalThis.crypto.randomUUID().replace(/-/g, '').substring(0, 8)
  return `${prefix}_${timestamp}${random}`
}

/**
 * 创建 hai handle hook
 *
 * 整合会话解析、路由守卫、中间件链与统一错误处理的 SvelteKit Handle 工厂。
 *
 * 执行顺序：
 * 1. 生成 `requestId` 并写入 `event.locals`
 * 2. 检查请求访问策略和默认客户端地址限流，处理可选传输及 A2A 端点
 * 3. 根据 `auth` 配置解析会话，执行认证和自定义守卫
 * 4. 执行日志、自定义键限流和业务中间件，再调用 `resolve(event)`
 * 5. 附加 `X-Request-Id` 和默认安全响应头
 *
 * @param config - Handle 配置（均有合理默认值，可零配置使用）
 * @returns SvelteKit Handle 函数
 * @example
 * ```ts
 * import { core, HaiCommonError } from '@h-ai/core'
 * import { kit } from '@h-ai/kit'
 *
 * const handle = kit.createHandle({ auth: { verifyToken: async () => core.err(HaiCommonError.UNAUTHORIZED), protectedPaths: ['/admin/**'] } })
 * void handle
 *```
 */
export function createHandle(config: HandleConfig = {}): Handle {
  if ('trustedProxies' in config || 'access' in config)
    throw new TypeError('Use http.trustedProxies and http.access in Kit Handle configuration')
  if ('rateLimit' in config)
    throw new TypeError('Use http.rateLimit in Kit Handle configuration')
  if (config.crypto && 'transport' in config.crypto)
    throw new TypeError('Use top-level transport instead of crypto.transport in Kit Handle configuration')
  const { rateLimit: rateLimitConfig, ...http } = config.http ?? {}
  const { trustedProxies, access } = resolveKitHttpConfig(http)
  const resolveIp = core.access.createClientIpResolver(trustedProxies)
  const checkAccess = access && core.access.createRequestCheck(access)
  const {
    auth: authConfig,
    cors,
    logging: loggingConfig = true,
    crypto: cryptoConfig,
    transport,
    onError,
    guards: customGuards = [],
    middleware: customMiddleware = [],
    contract,
    a2a,
  } = config
  const checkCors = cors
    ? core.access.createCors(cors)
    : undefined
  const keyExchangePath = transport
    ? transport.keyExchangePath ?? DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH
    : undefined
  const matchesA2AEndpoint = (path: string, method: string) => Boolean(a2a && (
    (method === 'GET' && path === a2a.cardPath) || (method === 'POST' && path === a2a.rpcPath)
  ))
  if (a2a) {
    if (keyExchangePath === a2a.cardPath || keyExchangePath === a2a.rpcPath
      || (checkAccess && (checkAccess.encryption(a2a.cardPath, 'GET') === 'required'
        || checkAccess.encryption(a2a.rpcPath, 'POST') === 'required'))) {
      throw new TypeError('A2A endpoints cannot overlap key exchange or require application-level encryption')
    }
  }
  if (checkAccess && checkAccess.requiresEncryption && !transport)
    throw new Error('Request access rules require transport encryption, but Kit transport is not configured')

  const encryption = (path: string, method: string) => matchesA2AEndpoint(path, method)
    ? 'disabled' as const
    : checkAccess
      ? checkAccess.encryption(path, method)
      : undefined
  const contractTransport = {
    enabled: Boolean(transport),
    encryption,
  }
  const iam = authConfig?.iam
  const verifyToken = authConfig?.verifyToken ?? (iam
    ? (token: string) => iam.auth.verifyToken(token)
    : undefined)
  const cookieAuthConfig = authConfig && { cookieName: authConfig.cookieName, iam: authConfig.iam }

  // ── 构建守卫列表（auth 自动守卫 + 自定义守卫） ──
  const guards: GuardConfig[] = []
  if (authConfig?.protectedPaths?.length) {
    guards.push({
      guard: buildAuthGuard(authConfig.loginUrl, contract?.apiPrefix),
      paths: authConfig.protectedPaths,
      exclude: authConfig.publicPaths,
    })
  }
  guards.push(...customGuards)

  // ── 构建中间件链 ──
  const builtinMiddleware: Middleware[] = []
  let entryRateLimit: Middleware | undefined
  let protocolRateLimit: Middleware | undefined
  if (loggingConfig) {
    const logOpts = typeof loggingConfig === 'object'
      ? loggingConfig
      : { logBody: false }
    builtinMiddleware.push(loggingMiddlewareFn(logOpts))
  }
  if (rateLimitConfig !== undefined && rateLimitConfig !== false) {
    const rateLimit = rateLimitMiddlewareFn(rateLimitConfig)
    if (rateLimitConfig.keyGenerator) {
      const { keyGenerator: _keyGenerator, ...defaultKeyConfig } = rateLimitConfig
      protocolRateLimit = rateLimitMiddlewareFn(defaultKeyConfig)
      builtinMiddleware.push(rateLimit)
    }
    else {
      entryRateLimit = rateLimit
    }
  }
  const allMiddleware = [
    ...builtinMiddleware,
    ...customMiddleware,
  ]

  // ── 传输加密中间件单独包裹整个 handle 流程 ──
  const transportMiddleware = transport
    ? transportEncryptionMiddleware({ ...transport, enabled: true, contractApiPrefix: contract?.apiPrefix }, encryption)
    : null

  // ── Cookie 加密配置预处理 ──
  const cookieProxyConfig = buildCookieProxyConfig(cryptoConfig)

  return async ({ event, resolve }) => {
    const suppliedRequestId = event.request.headers.get('x-request-id')
    const requestId = suppliedRequestId && /^[\w.:-]{1,128}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : generateId('req')
    let clientAddress: string | undefined
    try {
      clientAddress = event.getClientAddress()
    }
    catch { /* 静态预渲染等宿主可能没有连接地址，不能改信任请求转发头。 */ }
    const resolvedAddress = resolveIp(event.request, clientAddress)
    if (resolvedAddress !== clientAddress) {
      // 向下游传递新的请求视图，不修改 SvelteKit 只读事件；无效链不能降级为代理身份。
      event = {
        ...event,
        getClientAddress: () => {
          if (!resolvedAddress)
            throw new Error('Trusted client address is unavailable')
          return resolvedAddress
        },
      }
    }
    clientAddress = resolvedAddress
    const requestPath = new URL(event.request.url).pathname
    const method = event.request.method
    const isKeyExchange = method === 'POST' && requestPath === keyExchangePath
    const isA2AEndpoint = matchesA2AEndpoint(requestPath, method)
    const corsResult = checkCors?.(event.request)
    const requestRateLimit = corsResult?.preflight
      ? undefined
      : (isKeyExchange || isA2AEndpoint
          ? protocolRateLimit
          : undefined) ?? entryRateLimit
    const hasTransportEnvelope = event.request.headers.has(crypto.transport.protocol.ENCRYPTED_HEADER)
      || event.request.headers.has(crypto.transport.protocol.ENVELOPE_HEADER)
    const requestAccess = checkAccess
      ? checkAccess(requestPath, method, clientAddress)
      : undefined
    // 数据请求继续继承页面访问限制，同时检查实际 HTTP 数据端点的规则。
    const pageAccess = checkAccess && requestAccess?.allowed && event.isDataRequest && requestPath !== event.url.pathname
      ? checkAccess(event.url.pathname, method, clientAddress)
      : undefined
    const accessDecision = pageAccess?.allowed === false
      ? pageAccess
      : requestAccess
    return core.context.run({
      requestId,
      userId: undefined,
      scopeId: undefined,
      jobId: undefined,
    }, () => audit.withContext({
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
      let controlFlowStatus: number | undefined
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
          category: /\/(?:auth|iam|audit)(?:\/|$)/.test(resource)
            ? 'system'
            : 'business',
          outcome: guardDenied || [401, 403, 423, 429].includes(status)
            ? 'denied'
            : requestFailed || status >= 400
              ? 'failure'
              : 'success',
          details: { method: event.request.method, status },
        }, {
          read: ['GET', 'HEAD', 'OPTIONS'].includes(event.request.method),
        })
        if (!written.success)
          core.logger.error('Request audit failed', { requestId, resource, error: written.error })
      }
      let cookies = event.cookies
      if (cookieProxyConfig)
        cookies = createEncryptedCookieProxy(cookies, cookieProxyConfig)
      if (cookieAuthConfig)
        cookies = withRequestAuth(cookies, cookieAuthConfig)
      if (cookies !== event.cookies)
        event = { ...event, cookies }
      const context: MiddlewareContext = {
        event,
        requestId,
      }

      // 注入 requestId 到 event.locals
      // Workaround：SvelteKit App.Locals 是项目侧声明的 interface，库代码无法靠模块增强检查动态 key。
      const locals = event.locals as unknown as Record<string, unknown>
      locals.requestId = requestId

      const handleRequestError = (error: unknown): Response | Promise<Response> => {
        // 控制流交给宿主或页面数据传输处理，到最终出口时一并审计。
        if (isSvelteKitControlFlow(error)) {
          if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number')
            controlFlowStatus = error.status
          throw error
        }

        requestFailed = true
        if (onError) {
          core.logger.error('Request failed', { requestId, error })
          return onError(error, event)
        }

        return fromError({
          ...HaiCommonError.INTERNAL_ERROR,
          message: kitM('kit_internalError'),
          cause: error,
        }, requestId)
      }

      const runRequest = async (): Promise<Response> => {
        try {
          if (accessDecision && !accessDecision.allowed) {
            guardDenied = true
            core.logger.info('Request access policy denied', {
              ruleId: accessDecision.ruleId,
              reason: accessDecision.reason,
              method: event.request.method,
              ipAddress: clientAddress,
            })
            return Response.json({
              success: false,
              error: {
                ...HaiCommonError.REQUEST_ACCESS_DENIED,
                message: core.i18n.coreM('core_requestAccessDenied'),
                traceId: requestId,
              },
            }, { status: 403 })
          }
          if (corsResult?.preflight)
            return new Response(null, { status: 204 })
          if (!transportMiddleware && hasTransportEnvelope && encryption(requestPath, method) === 'disabled') {
            return Response.json(core.err({
              ...HaiCommonError.VALIDATION_ERROR,
              message: kitM('kit_transportPlaintextRequired'),
              traceId: requestId,
            }), { status: 400 })
          }
          // ── A2A 端点拦截（在认证/守卫之前，A2A 有专用认证） ──
          if (a2a && isA2AEndpoint) {
            return await a2a.handleRequest(event.request, requestId) ?? new Response(null, { status: 404 })
          }

          // ── 会话解析 ──
          let session: SessionData | undefined

          if (verifyToken) {
            const token = getAccessToken(event.request, event.cookies)
            if (token) {
              const verified = await core.auth.verifySession(verifyToken, token)
              if (!verified.success) {
                requestFailed = true
                core.logger.error(verified.error.message, { requestId, error: verified.error.cause })
                return fromError({
                  ...verified.error,
                  message: kitM('kit_internalError'),
                }, requestId)
              }
              session = verified.data
              locals.session = session
              if (session)
                locals.accessToken = token
            }
          }
          context.session = session
          actor = session
            ? { id: session.userId, username: session.username, roles: session.roles }
            : null

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

                return fromError({
                  ...(guardResult.status === 401
                    ? HaiCommonError.UNAUTHORIZED
                    : HaiCommonError.FORBIDDEN),
                  message: guardResult.message ?? kitM('kit_accessDenied'),
                  httpStatus: guardResult.status ?? 403,
                }, requestId)
              }
            }

            // ── 中间件链 ──
            const response = await executeMiddlewareChain(
              allMiddleware,
              context,
              async () => {
                const request = context.event.request
                const response = await contract?.fetch(request, () => {
                  const terminal = request.headers.get('x-hai-terminal')
                  return {
                    requestId,
                    ip: clientAddress,
                    locale: typeof locals.locale === 'string'
                      ? locals.locale
                      : undefined,
                    userAgent: request.headers.get('user-agent') ?? undefined,
                    terminalType: terminal === 'app' || terminal === 'desktop' || terminal === 'api'
                      ? terminal
                      : 'web',
                    session,
                    accessToken: session && typeof locals.accessToken === 'string'
                      ? locals.accessToken
                      : undefined,
                    scopeId: core.context.get().scopeId,
                  }
                }, contractTransport)
                return response ?? resolve(event)
              },
            )

            return response
          }))
        }
        catch (error) {
          return handleRequestError(error)
        }
      }

      // 密钥交换由传输层短路、响应本来就是明文，先让它经过同一访问策略。
      const accessDenied = accessDecision?.allowed === false
      const runTransport = () => {
        if (!accessDenied && !corsResult?.preflight && !isKeyExchange && !isA2AEndpoint) {
          const rejected = contract?.preflight(event.request, contractTransport)
          if (rejected)
            return Promise.resolve(rejected)
        }
        return transportMiddleware && !corsResult?.preflight && !(accessDenied && isKeyExchange)
          ? transportMiddleware(context, runRequest)
          : runRequest()
      }

      let response: Response | undefined
      try {
        if (requestRateLimit && !accessDenied) {
          let proceeded = false
          try {
            response = await requestRateLimit(context, () => {
              proceeded = true
              return runTransport()
            })
          }
          catch (error) {
            if (proceeded)
              throw error
            response = await handleRequestError(error)
          }
          // 已携带密文的业务请求仍须获得认证响应，但无需再执行会话及业务逻辑。
          if (!proceeded && transportMiddleware && hasTransportEnvelope && !isKeyExchange) {
            const rejected = response
            response = await transportMiddleware(context, async () => rejected)
          }
        }
        else {
          response = await runTransport()
        }
      }
      finally {
        const status = controlFlowStatus ?? response?.status
        if (status !== undefined)
          await captureRequest(status)
      }

      // 基础安全头避免影响页面渲染。CSP 由应用结合静态资源与 nonce 单独配置。
      return setResponseHeaders(corsResult
        ? core.access.applyCorsHeaders(response, corsResult.headers)
        : response, {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'X-Request-Id': requestId,
        'X-Trace-Id': requestId,
      })
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
function buildAuthGuard(loginUrl?: string, contractApiPrefix?: string): (event: RequestEvent, session?: SessionData) => GuardResult {
  return (event, session) => {
    if (session) {
      return { allowed: true }
    }

    // route.id不含挂载前缀；移除路由分组后仍按应用API识别，避免子目录API被当成页面重定向。
    const routePath = event.route.id?.replace(/\/\([^/]*\)/g, '')
    const pathname = decodeGuardPath(event.url.pathname)
    const isApiRoute = pathname.startsWith('/api/')
      || routePath?.startsWith('/api/') === true
      || (contractApiPrefix !== undefined && pathname.startsWith(`${contractApiPrefix}/`))

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
  const pathname = decodeGuardPath(event.url.pathname)

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
  const wildcard = /\/\*\*?$/.exec(pattern)?.[0]
  const base = decodeGuardPath(wildcard
    ? pattern.slice(0, -wildcard.length)
    : pattern)
  return pathname === base || (wildcard !== undefined && pathname.startsWith(`${base}/`))
}

/** 保持与 SvelteKit 路由相同的解码方式，保留编码百分号与分隔符。 */
function decodeGuardPath(pathname: string): string {
  if (!pathname.includes('%'))
    return pathname
  try {
    return pathname.split('%25').map(decodeURI).join('%25')
  }
  catch {
    // 畸形路径由宿主路由处理；仍可匹配原样配置的守卫。
    return pathname
  }
}

// ─── 内部：Crypto 配置构建 ───

/**
 * 构建 Cookie 加密代理配置
 */
function buildCookieProxyConfig(
  cryptoConfig: HandleConfig['crypto'],
): CookieProxyConfig | null {
  if (!cryptoConfig?.encryptedCookies?.length)
    return null

  const key = cryptoConfig.cookieEncryptionKey ?? process.env.HAI_KIT_COOKIE_KEY
  if (!key) {
    throw new Error('Cookie encryption requires crypto.cookieEncryptionKey or HAI_KIT_COOKIE_KEY')
  }
  if (!/^[\da-f]{32}$/i.test(key))
    throw new Error('Cookie encryption requires a 32-character hexadecimal key')

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
 *```
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
