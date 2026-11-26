import type { AudioFormat, AudioWsStartMessage } from '@h-ai/ai'
/**
 * @h-ai/serv — HTTP app 装配
 *
 * 将 oRPC contract + procedures + http 配置组合为可运行的 ServHttpApp，
 * 自动挂载安全响应头、健康检查、OpenAPI JSON、Scalar 文档页与 oRPC handler。
 *
 * 关键装配顺序：
 * 1. 解析 HTTP 配置
 * 2. 选择请求上下文工厂
 * 3. 挂基础安全 middleware
 * 4. 挂内置 CORS 包装及访问策略、按可信地址的固定窗口限流
 * 5. （可选）挂传输加密 middleware，再挂每次请求的访问策略
 * 6. 挂普通自定义 middleware（若提供）
 * 7. 挂基础路由（health / refresh-cookie）与业务路由（oRPC OpenAPI）
 * 8. 挂文档路由（openapi / docs）
 * @module serv-app
 */

import type { AuditContext } from '@h-ai/audit'
import type { HaiResult, HttpA2AHandler, HttpCorsOptions, HttpRateLimitContext, HttpRateLimitOptions, HttpVerifyToken } from '@h-ai/core'
import type { AnyContractRouter } from '@orpc/contract'
import type { Router } from '@orpc/server'
import type { Hono, Context as HonoContext } from 'hono'
import type { AudioWsDeps } from './features/serv-feature-audio.js'
import type { ServMiddleware } from './pipelines/serv-pipeline-types.js'
import type { ServHealthHttpConfig, ServHttpConfigInput } from './serv-config.js'
import type { CreateServContext, ServContext, ServIam, ServRequestMetadata, ServSession } from './serv-context.js'
import type { RefreshCookieConfig } from './serv-cookie-auth.js'
import type { ServTransportRoute } from './serv-route-transport.js'
import type { ServTransportConfig } from './serv-transport.js'
import { apiContract } from '@h-ai/api-contract'
import { audit } from '@h-ai/audit'
import { core, HaiCommonError } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { upgradeWebSocket } from '@hono/node-server'
import { Hono as HonoApp } from 'hono'
import { WebSocketServer } from 'ws'
import { registerAudioWsRoute } from './features/serv-feature-audio.js'
import { buildHaiErrorBody } from './pipelines/serv-pipeline-helper.js'
import { securityHeaders } from './pipelines/serv-pipeline-security-headers.js'
import { readRemoteAddress } from './serv-client-ip.js'
import { resolveServHttpConfig } from './serv-config.js'
import { buildAuthContextFactory, parseRequestContext, resolveRequestId, ServAuthVerificationError } from './serv-context.js'
import { createContractHandler } from './serv-contract-handler.js'
import { mountRefreshCookieRoutes } from './serv-cookie-auth.js'
import { isCorsMiddleware, isCorsPreflight } from './serv-cors.js'
import { servM } from './serv-i18n.js'
import { createTransportMiddleware } from './serv-transport.js'
import { resolveRequestLocale } from './serv-validation.js'

/**
 * `serv.createApp()` 的自定义 middleware 挂载项。
 *
 * - `path` 省略时默认挂到 `'*'`
 * - 按数组顺序注册
 * - 普通 middleware 位于 `transport` 解密和请求访问策略之后、业务路由之前
 *
 * @example
 * ```ts
 *
 * import { type ServMiddlewareMount, serv } from '@h-ai/serv'
 *
 * const mount: ServMiddlewareMount = { path: '/api/v1/*', middleware: serv.cors({ origin: 'https://app.example.com' }) }
 * // 内置 CORS 在外层补充响应头；预检仍执行访问策略。
 *```
 */
export interface ServMiddlewareMount {
  readonly path?: string
  readonly middleware: ServMiddleware
}

/**
 * `@h-ai/serv` 对外暴露的 HTTP app 抽象。
 *
 * Hono 是当前内部实现细节，应用代码只应依赖此最小接口：
 * - `fetch`：部署到 Fetch-first 运行时或交给 `serv.listen()`。
 * - `request`：测试 / 本地直连时发起 in-process 请求，避免消费方 import Hono。
 *
 * @example
 * ```ts
 *
 * import { type ServHttpApp, serv } from '@h-ai/serv'
 *
 * async function health(app: ServHttpApp): Promise<boolean> {
 *   const response = await app.request('/health')
 *   return response.ok
 * }
 *```
 */
export interface ServHttpApp {
  readonly fetch: (request: Request, metadata?: ServRequestMetadata) => Response | Promise<Response>
  readonly request: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>
}

/**
 * 创建 ServHttpApp 的配置。
 *
 * **认证 / 会话填充设计**（遵循最小知识原则）：
 *
 * - **`auth.iam`**（推荐）：单一服务引用。提供后 serv 自动：
 *   1. 使用 `iam.auth.verifyToken` 填充 `context.session` → route guard 生效
 *   2. 若同时启用 `refreshCookie`，使用 `iam.session.refresh` 实现 refresh token 轮换
 *
 * - **`refreshCookie`**（可选）：浏览器默认用 httpOnly cookie；受信原生客户端可配置 body 通道。与 `iam` 正交：
 *   `iam` 决定 *谁* 验证 token，`refreshCookie` 决定 refresh token *怎么* 传输。
 *
 * - **`auth.verifyToken`**（高级）：不使用 IAM 模块的覆盖入口。优先于 `iam.auth.verifyToken`。
 *
 * - **`createContext`**（高级）：完全接管上下文构造，设置后 serv **不再**自动填充 session，
 *   由调用方负责。
 *
 * @example
 * ```ts
 *
 * import { type CreateServAppOptions, serv } from '@h-ai/serv'
 *
 * function mount<TContract extends Parameters<typeof serv.createApp>[0]['contract'], TProcedures extends Parameters<typeof serv.createApp>[0]['procedures']>(options: CreateServAppOptions<TContract, TProcedures>) {
 *   return serv.createApp(options)
 * }
 *```
 */
export interface CreateServAppOptions<
  TContract extends AnyContractRouter,
  TProcedures extends Router<AnyContractRouter, ServContext>,
> {
  readonly contract: TContract
  readonly procedures: TProcedures
  readonly http?: Omit<ServHttpConfigInput, 'rateLimit'> & {
    /** 固定窗口限流，默认关闭；启用时显式注入原子计数存储。 */
    readonly rateLimit?: false | HttpRateLimitOptions<HttpRateLimitContext>
  }
  /**
   * 自定义 HTTP middleware（当前内部由 Hono 承载，但应用 API 不暴露 Hono app）。
   *
   * 典型用途：请求日志、trace、指标、CORS、限流、租户头校验，以及不适合放入
   * JSON/oRPC contract 的 WebSocket、文件或其它二进制 HTTP 端点。
   * 普通 middleware 位于传输解密和请求访问策略之后、业务路由之前，读取的是解密正文；
   * 提前返回仍经过传输响应加密，不能绕过访问策略。二进制端点需显式列入 transport.excludePaths。
   * 通过 serv.cors 创建的内置 CORS 会在外层补充响应头，预检仍执行请求访问策略。
   */
  readonly middlewares?: readonly ServMiddlewareMount[]
  /** 按来源控制浏览器跨域访问。省略或 false 关闭。 */
  readonly cors?: false | HttpCorsOptions
  /** 注入 IAM 或覆盖令牌验证器。两个选项同时提供时使用自定义验证器。 */
  readonly auth?: { readonly iam?: ServIam, readonly verifyToken?: HttpVerifyToken }
  /**
   * 启用 refresh token 传输（opt-in）：浏览器使用 httpOnly Cookie，可选配置受信原生 body 通道。
   * 需配合 auth.iam 或 refreshCookie.onRefresh 使用。
   */
  readonly refreshCookie?: RefreshCookieConfig
  /** 由 ai.a2a.createHttpHandler() 创建的 HTTP 端点，省略或 false 关闭。 */
  readonly a2a?: false | HttpA2AHandler
  /**
   * 高级：完全接管上下文工厂。设置后上述 `auth.iam` / `auth.verifyToken` 均不生效（session 不会被自动填充）。
   */
  readonly createContext?: CreateServContext
  /**
   * 启用传输加密（opt-in）。提供后 serv 自动：
   * 1. 使用显式 serverKeyRing / keyStore 创建受管传输管理器
   * 2. 在 oRPC 路由之前挂载中间件，自动解密请求 / 加密响应
   * 3. 在站点绝对路径 `keyExchangePath` 暴露 POST 密钥协商端点
   *
   */
  readonly transport?: false | ServTransportConfig
  /** 由宿主在 HTTPS 入口启用的 multipart、文件和 SSE 契约端点。 */
  readonly transportRoutes?: readonly ServTransportRoute[]
  /**
   * 启用统一语音 WebSocket 入口（opt-in）。提供后 serv 自动：
   * 1. 在 `${apiPrefix}/ai/audio`（可自定义 `path`）注册语音 WebSocket 路由
   * 2. 基于 `ai.audio` 提供非实时 / 实时的语音识别与合成
   * 3. 通过一次性 Audio ticket 验证身份，再由授权回调确认付费参数
   *
   * 需配合 `serv.listen()`（Node 适配器会自动完成 WebSocket 升级注入）。
   *
   */
  readonly audio?: ServAudioConfig
}

/**
 * `serv.createApp()` 的语音 WebSocket 接入配置。
 *
 * @example
 * ```ts
 *
 * import { type ServAudioConfig, serv } from '@h-ai/serv'
 *
 * import { ai } from '@h-ai/ai'
 *
 * function configureAudio(verifyTicket: ServAudioConfig['verifyTicket']): ServAudioConfig {
 *   return { ai, verifyTicket, preAuthTimeoutMs: 3000, maxSessionMs: 60000 }
 * }
 * // 应用实现 verifyTicket：原子消费共享票据并返回可信 session/grant。
 *```
 */
export interface ServAudioConfig {
  /** AI 服务对象（提供 `ai.audio` 领域能力）。 */
  readonly ai: AudioWsDeps['ai']
  /**
   * 校验并原子消费短期、一次性的 Audio ticket，返回会话与可选的能力授权（grant）。
   *
   * ticket 的签发和存储由应用决定（推荐 `iam.ticket.issue` / `iam.ticket.consume`）；
   * 成功结果必须返回建立授权所需的 IAM 会话摘要，可选返回签发时绑定的 `grant`
   * （操作 / 模型 / 会话），供服务端交叉校验 `start` 帧与票据一致。
   */
  readonly verifyTicket: (ticket: string) => Promise<HaiResult<AudioTicketVerification>>
  /**
   * 基于已验证会话授权本次操作，并返回服务端确认后的付费参数。
   *
   * 未提供时只保留操作及音频格式，客户端提交的 model / voice / instruction 不会生效。
   * 这里适合完成 IAM 权限、Persona、套餐配额和并发会话的检查/占用。
   * 第三参 `grant` 为票据绑定的能力（如有），可用于确认 `start` 未越权。
   */
  readonly authorize?: (session: ServSession, request: AudioWsStartMessage, grant?: AudioTicketGrant) => Promise<HaiResult<AuthorizedAudioRequest>>
  /** 会话结束钩子，供应用释放并发占用；无论成功、失败或断连都至多调用一次。 */
  readonly onSessionEnd?: (session: ServSession, request: AuthorizedAudioRequest) => void | Promise<void>
  /** 完整站点路径。缺省时为业务 API 前缀加 `/ai/audio`。 */
  readonly path?: `/${string}`
  /** WebSocket 接收单条消息的上限（默认 1 MiB，整数范围 1～2147483647 字节）。 */
  readonly maxMessageBytes?: number
  /** 单连接累计接收音频字节上限（默认 10 MiB）。 */
  readonly maxBufferedBytes?: number
  /** 单连接累计接收文本字节上限（默认 1 MiB）。 */
  readonly maxTextBytes?: number
  /** 单连接最长持续时间（毫秒，默认 5 分钟）。 */
  readonly maxSessionMs?: number
  /** 预鉴权超时（毫秒，默认 5000）：连接建立后未完成鉴权并收到 `start` 即关闭，独立于会话超时。 */
  readonly preAuthTimeoutMs?: number
  /** 未处理消息积压上限（默认 256）：串行处理链积压超过此数立即关闭，防止内存放大。 */
  readonly maxPendingMessages?: number
  /** 发送缓冲高水位（字节，默认 8 MiB）：`ws.bufferedAmount` 超过即以领域错误关闭慢客户端。 */
  readonly maxSendBufferBytes?: number
}

/**
 * Audio ticket 绑定的能力授权（消费时原样返回，供服务端交叉校验 start 帧）。
 *
 * @example
 * ```ts
 *
 * import { type AudioTicketGrant, serv } from '@h-ai/serv'
 *
 * const grant: AudioTicketGrant = { operation: 'synthesize', model: 'speech-model', sessionId: 'session-1' }
 * // 签发时绑定；start 帧不能覆盖服务端核准的模型与操作。
 *```
 */
export interface AudioTicketGrant {
  /** 允许的操作 */
  readonly operation?: 'transcribe' | 'synthesize'
  /** 允许的模型 ID */
  readonly model?: string
  /** 绑定的会话 ID */
  readonly sessionId?: string
  /** 应用自定义绑定字段 */
  readonly [key: string]: unknown
}

/**
 * Audio ticket 验证结果：IAM 会话 + 可选能力授权。
 *
 * @example
 * ```ts
 *
 * import { type AudioTicketVerification, serv } from '@h-ai/serv'
 *
 * function verified(session: AudioTicketVerification['session']): AudioTicketVerification {
 *   return { session, grant: { operation: 'transcribe' } }
 * }
 * // session 必须来自成功消费的可信票据，不能从客户端 JSON 直接构造。
 *```
 */
export interface AudioTicketVerification {
  /** IAM 会话摘要 */
  readonly session: ServSession
  /** 票据绑定的能力授权（如有） */
  readonly grant?: AudioTicketGrant
}

/**
 * Audio WebSocket 经应用授权后允许生效的服务端参数。
 *
 * @example
 * ```ts
 *
 * import { type AuthorizedAudioRequest, serv } from '@h-ai/serv'
 *
 * const request: AuthorizedAudioRequest = { operation: 'synthesize', format: 'mp3' }
 * // model/voice/instruction 只有经应用 authorize 确认后才生效。
 *```
 */
export interface AuthorizedAudioRequest {
  readonly operation: 'transcribe' | 'synthesize'
  /** 服务端允许的模型 ID；不传时使用 `ai.audio` 对应操作的默认模型。 */
  readonly model?: string
  readonly voice?: string
  readonly instruction?: string
  readonly format?: AudioFormat
  readonly sampleRate?: number
}

/**
 * 语音 WebSocket 服务器注册表
 *
 * `createApp` 启用 audio 时创建服务器，`serv.listen()` 交给 Node adapter 的原生升级支持，
 * 不向 `ServHttpApp` 公共类型泄露 Hono / WebSocket 细节。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function hasAudioServer(app: ServHttpApp): boolean {
 *   return audioWsServers.has(app)
 * }
 * // WeakMap 只绑定本地网络资源，不作为跨节点认证或业务状态。
 *```
 */
export const audioWsServers = new WeakMap<ServHttpApp, {
  readonly server: WebSocketServer
  readonly waitForSessionRelease: () => Promise<void>
}>()

/**
 * 创建并装配 HTTP app；同步校验配置和依赖，返回可交给 Node 或标准 fetch 适配器的应用。
 *
 * @param options - contract、procedures、HTTP、安全和可选能力依赖
 * @returns 不拥有业务模块生命周期的 ServHttpApp
 * @throws 配置或必需依赖缺失时在装配阶段抛错，宿主须停止启动并清理已初始化资源。
 *
 * @example
 * ```ts
 *
 * import { apiContract } from '@h-ai/api-contract'
 * import { type ServContext, serv } from '@h-ai/serv'
 *
 * const contract = apiContract.create({})
 * const procedures = serv.implement(contract).context<ServContext>().build()
 * const app = serv.createApp({ contract, procedures })
 *
 * const response = await app.request('/health')
 * const healthy = response.ok
 *```
 */
export function createApp<
  TContract extends AnyContractRouter,
  TProcedures extends Router<AnyContractRouter, ServContext>,
>(options: CreateServAppOptions<TContract, TProcedures>): ServHttpApp {
  // Step 1：先把用户输入的 HTTP 配置收敛成完整配置，后续挂载逻辑只处理一种形态。
  const { rateLimit, ...httpOptions } = options.http ?? {}
  const http = resolveServHttpConfig(httpOptions)
  const { keyGenerator, ...defaultKeyLimit } = rateLimit || {}
  const limitsByIp = rateLimit
    ? core.access.createRateLimiter<HttpRateLimitContext>({
        ...rateLimit,
        ...defaultKeyLimit,
        keyGenerator: undefined,
      })
    : undefined
  const limitsBySession = rateLimit && keyGenerator
    ? core.access.createRateLimiter(rateLimit)
    : undefined
  const transport = options.transport || undefined
  const { a2a } = options
  const { keyExchangePath = crypto.transport.protocol.DEFAULT_KEY_EXCHANGE_PATH } = transport ?? {}
  if (transport && !crypto.transport.isKeyExchangePath(keyExchangePath))
    throw new TypeError(servM('serv_invalidKeyExchangePath'))
  const resolveIp = core.access.createClientIpResolver(http.trustedProxies)
  const checkAccess = core.access.createRequestCheck(http.access)
  if (checkAccess.requiresEncryption && !transport)
    throw new Error('Request access rules require transport encryption, but Serv transport is not configured')
  const matchesA2AEndpoint = (path: string, method: string) => Boolean(a2a && (
    (method === 'GET' && path === a2a.cardPath) || (method === 'POST' && path === a2a.rpcPath)
  ))
  const audioPath = options.audio
    ? apiContract.resolveAudioWebSocketPath(http.apiPrefix, options.audio.path)
    : undefined
  const matchesAudioUpgrade = (request: Request, path: string) => path === audioPath && request.method === 'GET'
    && request.headers.get('upgrade')?.toLowerCase() === 'websocket'
  if (audioPath && checkAccess.encryption(audioPath, 'GET') === 'required')
    throw new TypeError('Audio WebSocket requires a standard HTTPS upgrade without application-level encryption')
  if (a2a) {
    const occupied = [
      transport && keyExchangePath,
      audioPath,
      http.health && http.health.path,
      http.health && http.health.readyPath,
      http.openapi && http.openapi.path,
      http.docs && http.docs.path,
      options.refreshCookie && `${http.apiPrefix}/auth/refresh`,
    ]
    if (occupied.some(path => path === a2a.cardPath || path === a2a.rpcPath)
      || checkAccess.encryption(a2a.cardPath, 'GET') === 'required'
      || checkAccess.encryption(a2a.rpcPath, 'POST') === 'required') {
      throw new TypeError('A2A endpoints cannot overlap a host endpoint or require application-level encryption')
    }
  }
  const encryption = (path: string, method: string, request: Request) => matchesA2AEndpoint(path, method) || matchesAudioUpgrade(request, path)
    ? 'disabled' as const
    : checkAccess.encryption(path, method)
  // Step 2：创建 Hono app 外壳，后续所有 middleware / route 都按顺序向这个实例注册。
  const app = new HonoApp()
  // 使用每次派发的宿主上下文，Fetch Request 可被外部调用反复派发。
  const requestAuditContexts = new WeakMap<HonoContext, AuditContext>()
  app.onError((error, c) => {
    const traceId = core.context.get().traceId ?? core.context.get().requestId ?? resolveRequestId(c.req.header('x-request-id') ?? null)
    const verificationFailed = error instanceof ServAuthVerificationError
    const status = verificationFailed ? error.httpStatus : 500
    core.logger.error(verificationFailed ? error.message : 'HTTP handler failed', {
      traceId,
      method: c.req.method,
      status,
      error: verificationFailed ? error.cause : error,
    })
    c.header('x-trace-id', traceId)
    const safe = core.error.toPublic({
      ...HaiCommonError.INTERNAL_ERROR,
      httpStatus: status,
      message: '',
    }, traceId, resolveRequestLocale(c.req.raw.headers))
    return Response.json({ success: false, error: safe }, { status })
  })
  // 请求的语言沿异步处理链传递，模块错误消息不依赖共享的进程默认语言。
  app.use('*', async (c, next) => {
    const requestId = resolveRequestId(c.req.header('x-request-id') ?? null)
    await core.context.run({
      requestId,
      userId: undefined,
      scopeId: undefined,
      jobId: undefined,
    }, () => core.i18n.runWithLocale(resolveRequestLocale(c.req.raw.headers), () => audit.withContext({
      actor: null,
      requestId,
      traceId: requestId,
      scopeId: undefined,
      ipAddress: resolveIp(c.req.raw, readRemoteAddress(c.env)),
      userAgent: c.req.header('user-agent')?.slice(0, 4096),
    }, async () => {
      await next()
      // 契约校验、协议或中间件拒绝不会进入 procedure；按 HTTP 状态补齐这些事件。
      if (audit.isInitialized && c.res.status >= 400) {
        const trusted = requestAuditContexts.get(c)
        const recorded = await audit.capture({
          action: 'http.reject',
          resource: c.req.routePath || 'unmatched',
          category: 'system',
          actorSnapshot: trusted?.actor ?? null,
          userId: trusted?.actor?.id ?? null,
          scopeId: trusted?.scopeId,
          outcome: [401, 403, 423, 429].includes(c.res.status)
            ? 'denied'
            : 'failure',
          details: { method: c.req.method, status: c.res.status },
        })
        if (!recorded.success)
          core.logger.error('HTTP rejection audit failed', { requestId, error: recorded.error })
      }
    })))
    c.header('x-request-id', requestId)
    c.header('x-trace-id', requestId)
  })
  // 缺失路由也返回标准 JSON，保持 404 并允许统一传输加密。
  app.notFound(c => c.json(buildHaiErrorBody(
    HaiCommonError.NOT_FOUND,
    core.i18n.coreM('core_errorNotFound', {
      locale: resolveRequestLocale(c.req.raw.headers),
    }),
  ), 404))

  // Step 3：决定请求上下文工厂。这个选择直接决定后续 procedure 是否能拿到 `context.session`。
  // 上下文工厂选择优先级（顶位优先）：
  //   1. options.createContext
  //   2. options.auth?.verifyToken
  //   3. options.auth?.iam.auth.verifyToken
  //   4. 都未提供 → parseRequestContext（仅解析元数据，session 始终 undefined）
  //
  // ⚠️ 对 `iam.auth.verifyToken` **不**做 `.bind()`：IAM 模块使用 NotInitializedKit Proxy 模式，
  //    `iam.auth` 的方法实现会在 `init()` 后切换。提前 bind 会捕获未初始化 Proxy 的方法引用。
  //    用闭包函数延迟到请求处理时再读取，确保始终调用最新实现。
  const iamRef = options.auth?.iam
  const verifyToken = options.auth?.verifyToken
    ?? (iamRef
      ? (token: string) => iamRef.auth.verifyToken(token)
      : undefined)
  const contextFactory: CreateServContext = options.createContext
    ?? (verifyToken
      ? buildAuthContextFactory(verifyToken)
      : parseRequestContext)
  const requestContexts = new WeakMap<HonoContext, Promise<ServContext>>()
  const createContext = async (c: HonoContext): Promise<ServContext> => {
    let pending = requestContexts.get(c)
    if (!pending) {
      const request = c.req.raw
      const remoteAddress = readRemoteAddress(c.env)
      pending = Promise.resolve(contextFactory({
        request,
        remoteAddress,
        ip: resolveIp(request, remoteAddress),
      })).then((context) => {
        requestAuditContexts.set(c, {
          actor: context.session
            ? {
                id: context.session.userId,
                username: context.session.username,
                roles: [...context.session.roles],
              }
            : null,
          scopeId: context.scopeId,
        })
        return context
      })
      requestContexts.set(c, pending)
    }
    return pending
  }

  const contractHandler = createContractHandler({
    contract: options.contract,
    procedures: options.procedures,
    http,
    transportRoutes: options.transportRoutes,
  })
  const contractTransport = {
    enabled: transport !== undefined,
    encryption: checkAccess.encryption,
  }

  // Step 5：最先挂全局安全响应头，让后续所有响应（包括错误响应）都自动带上保护性 header。
  app.use('*', securityHeaders())

  const accessDenied = (c: HonoContext, ipAddress = resolveIp(c.req.raw, readRemoteAddress(c.env))): Response | undefined => {
    const decision = checkAccess(c.req.path, c.req.method, ipAddress)
    if (decision.allowed) {
      if (!transport
        && (c.req.raw.headers.has(crypto.transport.protocol.ENCRYPTED_HEADER) || c.req.raw.headers.has(crypto.transport.protocol.ENVELOPE_HEADER))
        && encryption(c.req.path, c.req.method, c.req.raw) === 'disabled') {
        return c.json(buildHaiErrorBody(HaiCommonError.VALIDATION_ERROR, servM('serv_transportPlaintextRequired')), 400)
      }
      return undefined
    }
    core.logger.info('Request access policy denied', {
      ruleId: decision.ruleId,
      reason: decision.reason,
      method: c.req.method,
      ipAddress,
    })
    return c.json(buildHaiErrorBody(HaiCommonError.REQUEST_ACCESS_DENIED, core.i18n.coreM('core_requestAccessDenied')), 403)
  }
  // CORS 保持在加密外层，为策略拒绝也补齐响应头；预检只执行策略，不执行业务处理器。
  if (options.cors) {
    const checkCors = core.access.createCors(options.cors)
    app.use('*', async (c, next) => {
      const cors = checkCors(c.req.raw)
      if (!cors)
        return next()
      if (cors.preflight)
        return core.access.applyCorsHeaders(accessDenied(c) ?? new Response(null, { status: 204 }), cors.headers)
      await next()
      c.res = core.access.applyCorsHeaders(c.res, cors.headers)
    })
  }
  const cors = options.middlewares?.filter(entry => isCorsMiddleware(entry.middleware)) ?? []
  const custom = options.middlewares?.filter(entry => !isCorsMiddleware(entry.middleware)) ?? []
  for (const entry of cors) {
    if (http.access === false) {
      app.use(entry.path ?? '*', entry.middleware)
      continue
    }
    app.use(entry.path ?? '*', async (c, next) => {
      if (!isCorsPreflight(c.req.raw))
        return entry.middleware(c, next)
      const preflight = await entry.middleware(c, async () => {})
      if (!(preflight instanceof Response))
        return next()
      const rejected = accessDenied(c)
      if (!rejected)
        return preflight
      for (const [key, value] of preflight.headers)
        rejected.headers.set(key, value)
      return rejected
    })
  }
  // 预留判断结果可随 Hono 上下文穿过解密，避免重新检查时段或重复计数。
  const pendingAdmissions = new WeakMap<HonoContext, Response | null>()
  if (limitsByIp || (http.access !== false && transport)) {
    app.use('*', async (c, next) => {
      const { method, raw: request } = c.req
      const pathname = new URL(request.url).pathname
      const isKeyExchange = !!transport && method === 'POST' && pathname === keyExchangePath
      const isProbe = http.health && (method === 'GET' || method === 'HEAD')
        && (pathname === http.health.path || pathname === http.health.readyPath)
      const limiter = !limitsBySession || isKeyExchange || matchesA2AEndpoint(pathname, method) || matchesAudioUpgrade(request, pathname)
        ? limitsByIp
        : undefined
      if (!isKeyExchange && (!limiter || isProbe))
        return next()

      const clientAddress = resolveIp(request, readRemoteAddress(c.env))
      const rejected = http.access === false
        ? undefined
        : accessDenied(c, clientAddress)
      if (isKeyExchange && rejected)
        return rejected
      pendingAdmissions.set(c, rejected ?? null)
      if (rejected || !limiter)
        return next()

      const requestId = core.context.get().requestId ?? resolveRequestId(c.req.header('x-request-id') ?? null)
      const result = await limiter({
        requestId,
        clientAddress,
        context: { request, requestId, clientAddress },
      })
      if (result instanceof Response) {
        // 已提交传输认证信封的业务请求使用正常加密出口返回拒绝。
        const hasEnvelope = request.headers.has(crypto.transport.protocol.ENCRYPTED_HEADER)
          || request.headers.has(crypto.transport.protocol.ENVELOPE_HEADER)
        if (!transport || isKeyExchange || !hasEnvelope)
          return result
        pendingAdmissions.set(c, result)
        return next()
      }
      await next()
      for (const [name, value] of result)
        c.header(name, value)
    })
  }

  app.use('*', async (c, next) => {
    if (matchesA2AEndpoint(new URL(c.req.url).pathname, c.req.method))
      return next()
    return contractHandler.preflight(c.req.raw, contractTransport) ?? next()
  })

  // Step 7：若启用传输加密，必须在业务路由之前挂载。
  // 这样请求能先被解密，响应也能在离开应用前被重新加密。
  // 传输加密必须在所有业务路由之前装载：
  // - 它需在 oRPC 读取 body 前完成解密
  // - 在下游响应返回后加密
  if (transport) {
    const policy = crypto.transport.createBodyPolicy(transport.maxPlaintextBytes, transport.routePlaintextBytes)
    const mgr = transport.crypto.transport.createServer({
      serverKeyRing: transport.serverKeyRing,
      keyStore: transport.keyStore,
      maxPlaintextBytes: policy.maximum.plaintextBytes,
      maxFutureSkewSeconds: transport.maxFutureSkewSeconds,
      maxRequestAgeSeconds: transport.maxRequestAgeSeconds,
    })
    if (!mgr.success) {
      // 直接抛已存在的 HaiError 实例，保留 code/system/module/cause，便于上层定位到
      // "transport 初始化失败" 这一类配置错误，而非被 `new Error(message)` 抹平为字符串。
      throw core.error.buildHaiErrorInst(
        HaiCommonError.INTERNAL_ERROR,
        mgr.error.message,
        mgr.error,
      )
    }
    app.use('*', createTransportMiddleware(mgr.data, keyExchangePath, transport.excludePaths, policy, encryption))
  }

  // 业务拒绝位于加密管线内，客户端仍能解析标准错误；自定义静态路由也必须经过策略。
  if (http.access !== false || limitsByIp || a2a) {
    app.use('*', async (c, next) => {
      const pending = pendingAdmissions.get(c)
      return (pending === undefined && (http.access !== false || matchesA2AEndpoint(new URL(c.req.url).pathname, c.req.method))
        ? accessDenied(c)
        : pending) ?? next()
    })
  }
  if (limitsBySession) {
    app.use('*', async (c, next) => {
      const { method, raw: request } = c.req
      const { path } = c.req
      const isProbe = http.health && (method === 'GET' || method === 'HEAD')
        && (path === http.health.path || path === http.health.readyPath)
      if ((transport && path === keyExchangePath && method === 'POST') || matchesA2AEndpoint(new URL(request.url).pathname, method) || matchesAudioUpgrade(request, path) || isProbe)
        return next()
      const ctx = await createContext(c)
      const context = {
        request,
        requestId: ctx.requestId,
        clientAddress: ctx.ip,
        session: ctx.session,
      }
      const result = await limitsBySession({ requestId: ctx.requestId, clientAddress: ctx.ip, context })
      if (result instanceof Response)
        return result
      await next()
      for (const [name, value] of result)
        c.header(name, value)
    })
  }
  if (a2a) {
    app.use('*', async (c, next) => {
      if (!matchesA2AEndpoint(new URL(c.req.url).pathname, c.req.method))
        return next()
      return await a2a.handleRequest(c.req.raw, core.context.get().requestId) ?? new Response(null, { status: 404 })
    })
  }
  mountCustomMiddlewares(app, custom)

  // Step 8：挂基础探活路由。健康检查放在业务路由之外，便于基础设施直接探测。
  if (http.health !== false)
    mountHealthRoutes(app, http.health)

  // Step 9：refresh-cookie 路由要抢在 oRPC 通配符之前注册，否则会被 `${apiPrefix}/*` 吞掉。
  // refresh-cookie 路由必须在 oRPC 通配符路由之前注册，Hono 按注册顺序匹配。
  if (options.refreshCookie)
    mountRefreshCookieRoutes(app, http.apiPrefix, options.refreshCookie, options.auth?.iam)

  // Step 9.5：语音 WebSocket 入口同样要在 oRPC 通配符之前注册，避免 GET 升级请求被 `${apiPrefix}/*` 吞掉。
  if (options.audio && audioPath) {
    const audio = registerAudioWsRoute(app, audioPath, upgradeWebSocket, {
      ai: options.audio.ai,
      verifyTicket: options.audio.verifyTicket,
      authorize: options.audio.authorize,
      onSessionEnd: options.audio.onSessionEnd,
      maxMessageBytes: options.audio.maxMessageBytes,
      maxBufferedBytes: options.audio.maxBufferedBytes,
      maxTextBytes: options.audio.maxTextBytes,
      maxSessionMs: options.audio.maxSessionMs,
      preAuthTimeoutMs: options.audio.preAuthTimeoutMs,
      maxPendingMessages: options.audio.maxPendingMessages,
      maxSendBufferBytes: options.audio.maxSendBufferBytes,
    })
    audioWsServers.set(app, {
      server: new WebSocketServer({ noServer: true, maxPayload: audio.maxMessageBytes }),
      waitForSessionRelease: audio.waitForSessionRelease,
    })
  }

  // 按装配后的契约分发请求；未命中留给宿主的 404 边界。
  app.use('*', async (c, next) => await contractHandler.fetch(c.req.raw, () => createContext(c), contractTransport) ?? next())

  return app
}

function mountCustomMiddlewares(app: Hono, middlewares: readonly ServMiddlewareMount[]): void {
  for (const entry of middlewares)
    app.use(entry.path ?? '*', entry.middleware)
}

function mountHealthRoutes(app: Hono, config: ServHealthHttpConfig): void {
  app.get(config.path, c => c.json({ status: 'ok' }))
  if (config.readyPath)
    app.get(config.readyPath, c => c.json({ status: 'ready' }))
}
