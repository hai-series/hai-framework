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
 * 4. 挂自定义 middleware（若提供）
 * 5. （可选）挂传输加密 middleware
 * 6. 挂基础路由（health / refresh-cookie）
 * 7. 挂业务路由（oRPC / RPC）
 * 8. 挂文档路由（openapi / docs）
 * @module serv-app
 */

import type { AudioFormat, AudioWsStartMessage } from '@h-ai/ai'
import type { HaiResult } from '@h-ai/core'
import type { ServerType } from '@hono/node-server'
import type { AnyContractRouter, OpenAPI } from '@orpc/contract'
import type { Router } from '@orpc/server'
import type { Hono, Context as HonoContext, Next } from 'hono'
import type { AudioWsDeps } from './features/serv-feature-audio.js'
import type { ServMiddleware } from './pipelines/serv-pipeline-types.js'
import type { ServHealthHttpConfig, ServHttpConfigInput } from './serv-config.js'
import type { CreateServContext, ServContext, ServIam, ServSession } from './serv-context.js'
import type { RefreshCookieConfig } from './serv-cookie-auth.js'
import type { ServTransportConfig } from './serv-transport.js'
import type { ServValidationFailureBody } from './serv-validation.js'
import { core, HaiCommonError } from '@h-ai/core'
import { createNodeWebSocket } from '@hono/node-ws'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { RPCHandler } from '@orpc/server/fetch'
import { Hono as HonoApp } from 'hono'
import { registerAudioWsRoute } from './features/serv-feature-audio.js'
import { buildHaiErrorBody } from './pipelines/serv-pipeline-helper.js'
import { requireInternalRPC } from './pipelines/serv-pipeline-require-internal-rpc.js'
import { securityHeaders } from './pipelines/serv-pipeline-security-headers.js'
import { resolveServHttpConfig } from './serv-config.js'
import { buildAuthContextFactory, parseRequestContext } from './serv-context.js'
import { mountRefreshCookieRoutes } from './serv-cookie-auth.js'
import { servM } from './serv-i18n.js'
import { createDocsPage, generateSpec, getScalarScript, SCALAR_ROUTE } from './serv-openapi.js'
import { createTransportMiddleware } from './serv-transport.js'
import { localizeZodError, resolveRequestLocale } from './serv-validation.js'

const DEFAULT_AUDIO_WS_PATH = '/ai/audio'

/** 允许通过 oRPC OpenAPIHandler 转发的 HTTP 方法。 */
const API_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const

/**
 * `serv.createApp()` 的自定义 middleware 挂载项。
 *
 * - `path` 省略时默认挂到 `'*'`
 * - 按数组顺序注册
 * - 注册位置固定在内置 `securityHeaders` 之后、`transport` / 业务路由之前
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
 */
export interface ServHttpApp {
  readonly fetch: (request: Request) => Response | Promise<Response>
  readonly request: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>
}

/**
 * 创建 ServHttpApp 的配置。
 *
 * **认证 / 会话填充设计**（遵循最小知识原则）：
 *
 * - **`iam`**（推荐）：单一顶层引用。提供后 serv 自动：
 *   1. 使用 `iam.session.verifyToken` 填充 `context.session` → `requireAuth/Permission/Role` 生效
 *   2. 若同时启用 `refreshCookie`，使用 `iam.session.refresh` 实现 cookie 刷新
 *
 * - **`refreshCookie`**（可选）：opt-in httpOnly cookie 传输 refresh token。与 `iam` 正交：
 *   `iam` 决定 *谁* 验证 token，`refreshCookie` 决定 refresh token *怎么* 传输。
 *
 * - **`verifyToken`**（高级）：不使用 IAM 模块的逆脱口。优先于 `iam.session.verifyToken`。
 *
 * - **`createContext`**（高级）：完全接管上下文构造，设置后 serv **不再**自动填充 session，
 *   由调用方负责。
 */
export interface CreateServAppOptions<
  TContract extends AnyContractRouter,
  TProcedures extends Router<AnyContractRouter, ServContext>,
> {
  readonly contract: TContract
  readonly procedures: TProcedures
  readonly http?: ServHttpConfigInput
  /**
   * 自定义 HTTP middleware（当前内部由 Hono 承载，但应用 API 不暴露 Hono app）。
   *
   * 典型用途：请求日志、trace、指标、CORS、限流、租户头校验等 HTTP 层横切逻辑。
   * 这些 middleware 会在内置安全头之后、传输加密与业务路由之前注册；
   * 因此 CORS 这类 preflight middleware 可以直接短路返回，若需要读取解密后的业务 body，
   * 应改用 context / procedure 层扩展，而不是 HTTP middleware。
   */
  readonly middlewares?: readonly ServMiddlewareMount[]
  /**
   * IAM 模块引用（推荐）。提供后 serv 自动使用 `iam.session.verifyToken` 填充 session，
   * 以及在 `refreshCookie` 启用时使用 `iam.session.refresh` 实现 cookie 刷新。
   *
   * 类型上要求 {@link ServIam}（`iam` 可以直接传入，结构类型保证兼容）。
   */
  readonly iam?: ServIam
  /**
   * 启用 httpOnly Cookie 传输 refresh token（opt-in）。
   * 需配合 `iam` 或 `refreshCookie.onRefresh` 使用。
   */
  readonly refreshCookie?: RefreshCookieConfig
  /**
   * 高级：自定义访问令牌校验回调，覆盖 `iam.session.verifyToken`。
   * 不使用 IAM 模块的场景下使用。
   */
  readonly verifyToken?: (token: string) => Promise<HaiResult<ServSession>>
  /**
   * 高级：完全接管上下文工厂。设置后上述 `iam` / `verifyToken` 均不生效（session 不会被自动填充）。
   */
  readonly createContext?: CreateServContext
  /**
   * 启用传输加密（opt-in）。提供后 serv 自动：
   * 1. 调用 `crypto.transport.createServer()` 创建管理器
   * 2. 在 oRPC 路由之前挂载中间件，自动解密请求 / 加密响应
   * 3. 在 `${apiPrefix}${keyExchangePath}` 暴露 POST 密钥协商端点
   *
   * @example
   * ```ts
   * serv.createApp({ contract, procedures, transport: { crypto } })
   * ```
   */
  readonly transport?: ServTransportConfig
  /**
   * 启用统一语音 WebSocket 入口（opt-in）。提供后 serv 自动：
   * 1. 在 `${apiPrefix}/ai/audio`（可自定义 `path`）注册语音 WebSocket 路由
   * 2. 基于 `ai.audio` 提供非实时 / 实时的语音识别与合成
   * 3. 通过一次性 Audio ticket 验证身份，再由授权回调确认付费参数
   *
   * 需配合 `serv.listen()`（Node 适配器会自动完成 WebSocket 升级注入）。
   *
   * @example
   * ```ts
   * serv.createApp({ contract, procedures, iam, audio: { ai, verifyTicket, authorize } })
   * ```
   */
  readonly audio?: ServAudioConfig
}

/** `serv.createApp()` 的语音 WebSocket 接入配置。 */
export interface ServAudioConfig {
  /** AI 服务对象（提供 `ai.audio` 领域能力）。 */
  readonly ai: AudioWsDeps['ai']
  /**
   * 校验并原子消费短期、一次性的 Audio ticket。
   *
   * ticket 的签发和存储由应用决定；成功结果必须返回建立授权所需的 IAM 会话摘要。
   */
  readonly verifyTicket: (ticket: string) => Promise<HaiResult<ServSession>>
  /**
   * 基于已验证会话授权本次操作，并返回服务端确认后的付费参数。
   *
   * 未提供时只保留操作及音频格式，客户端提交的 model / voice / instruction 不会生效。
   * 这里适合完成 IAM 权限、Persona、套餐配额和并发会话的检查/占用。
   */
  readonly authorize?: (session: ServSession, request: AudioWsStartMessage) => Promise<HaiResult<AuthorizedAudioRequest>>
  /** 会话结束钩子，供应用释放并发占用；无论成功、失败或断连都至多调用一次。 */
  readonly onSessionEnd?: (session: ServSession, request: AuthorizedAudioRequest) => void | Promise<void>
  /** 语音入口路径（相对 apiPrefix，默认 `/ai/audio`）。 */
  readonly path?: string
  /** 单条消息字节上限（默认 1 MiB）。 */
  readonly maxMessageBytes?: number
  /** 单连接累计接收音频字节上限（默认 10 MiB）。 */
  readonly maxBufferedBytes?: number
  /** 单连接累计接收文本字节上限（默认 1 MiB）。 */
  readonly maxTextBytes?: number
  /** 单连接最长持续时间（毫秒，默认 5 分钟）。 */
  readonly maxSessionMs?: number
}

/** Audio WebSocket 经应用授权后允许生效的服务端参数。 */
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
 * 语音 WebSocket 升级注入器注册表
 *
 * `createApp` 启用 audio 时将 `injectWebSocket` 写入此 WeakMap，`serv.listen()` 在创建
 * Node 服务器后取出并注入，从而不向 `ServHttpApp` 公共类型泄露 Hono / WebSocket 细节。
 */
export const audioWsInjectors = new WeakMap<ServHttpApp, (server: ServerType) => void>()

/**
 * 创建并装配 HTTP API app。
 *
 * @param options - contract/procedures/http 三段式配置
 * @returns 可被 `serv.listen()` / `serv.toFetch()` 使用的 ServHttpApp
 *
 * @example
 * ```ts
 * const app = serv.createApp({
 *   contract,
 *   procedures,
 *   http: {
 *     apiPrefix: '/api/v1',
 *     openapi: { path: '/openapi.json' },
 *     docs: { path: '/docs' },
 *   },
 * })
 * serv.listen(app, { port: 3000, host: '0.0.0.0' })
 * ```
 */
export function createApp<
  TContract extends AnyContractRouter,
  TProcedures extends Router<AnyContractRouter, ServContext>,
>(options: CreateServAppOptions<TContract, TProcedures>): ServHttpApp {
  // Step 1：先把用户输入的 HTTP 配置收敛成完整配置，后续挂载逻辑只处理一种形态。
  const http = resolveServHttpConfig(options.http)
  // Step 2：创建 Hono app 外壳，后续所有 middleware / route 都按顺序向这个实例注册。
  const app = new HonoApp()

  // Step 3：决定请求上下文工厂。这个选择直接决定后续 procedure 是否能拿到 `context.session`。
  // 上下文工厂选择优先级（顶位优先）：
  //   1. options.createContext
  //   2. options.verifyToken
  //   3. options.iam.session.verifyToken
  //   4. 都未提供 → parseRequestContext（仅解析元数据，session 始终 undefined）
  //
  // ⚠️ 对 `iam.session.verifyToken` **不**做 `.bind()`：IAM 模块使用 NotInitializedKit Proxy 模式，
  //    `iam.session` 的方法实现会在 `init()` 后切换。提前 bind 会捕获未初始化 Proxy 的方法引用。
  //    用闭包函数延迟到请求处理时再读取，确保始终调用最新实现。
  const iamRef = options.iam
  const verifyToken = options.verifyToken
    ?? (iamRef ? (token: string) => iamRef.session.verifyToken(token) : undefined)
  const createContext: CreateServContext = options.createContext
    ?? (verifyToken ? buildAuthContextFactory(verifyToken) : parseRequestContext)

  // Step 4：准备文档 spec 的懒缓存。只有真正访问 openapi/docs 时才生成，避免启动时做重活。
  // OpenAPI spec 是相对昂贵的同步生成；延迟到第一次访问 `/openapi.json` 或 `/docs` 时再算一次。
  let cachedSpec: Promise<OpenAPI.Document> | undefined
  const getSpec = (): Promise<OpenAPI.Document> => {
    cachedSpec ??= generateSpec(options.contract, { apiPrefix: http.apiPrefix })
    return cachedSpec
  }

  // Step 5：最先挂全局安全响应头，让后续所有响应（包括错误响应）都自动带上保护性 header。
  app.use('*', securityHeaders())

  // Step 6：先注册调用方自定义 middleware。位置固定在内置安全头之后、传输加密/业务路由之前，
  // 让 CORS preflight 等 HTTP 层横切逻辑可以优先短路，同时保持 transport 仍然位于业务路由之前。
  if (options.middlewares)
    mountCustomMiddlewares(app, options.middlewares)

  // Step 7：若启用传输加密，必须在业务路由之前挂载。
  // 这样请求能先被解密，响应也能在离开应用前被重新加密。
  // 传输加密必须在所有业务路由之前装载：
  // - 它需在 oRPC 读取 body 前完成解密
  // - 在下游响应返回后加密
  if (options.transport) {
    const mgr = options.transport.crypto.transport.createServer({
      keyStore: options.transport.keyStore,
      maxClients: options.transport.maxClients,
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
    const keyExchangePath = `${http.apiPrefix}${options.transport.keyExchangePath ?? '/_hai/key-exchange'}`
    app.use('*', createTransportMiddleware(mgr.data, keyExchangePath, options.transport.excludePaths))
  }

  // Step 8：挂基础探活路由。健康检查放在业务路由之外，便于基础设施直接探测。
  if (http.health !== false)
    mountHealthRoutes(app, http.health)

  // Step 9：refresh-cookie 路由要抢在 oRPC 通配符之前注册，否则会被 `${apiPrefix}/*` 吞掉。
  // refresh-cookie 路由必须在 oRPC 通配符路由之前注册，Hono 按注册顺序匹配。
  if (options.refreshCookie)
    mountRefreshCookieRoutes(app, http.apiPrefix, options.refreshCookie, options.iam)

  // Step 9.5：语音 WebSocket 入口同样要在 oRPC 通配符之前注册，避免 GET 升级请求被 `${apiPrefix}/*` 吞掉。
  if (options.audio) {
    const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })
    const audioPath = `${http.apiPrefix}${options.audio.path ?? DEFAULT_AUDIO_WS_PATH}`
    registerAudioWsRoute(app, audioPath, upgradeWebSocket, {
      ai: options.audio.ai,
      verifyTicket: options.audio.verifyTicket,
      authorize: options.audio.authorize,
      onSessionEnd: options.audio.onSessionEnd,
      maxMessageBytes: options.audio.maxMessageBytes,
      maxBufferedBytes: options.audio.maxBufferedBytes,
      maxTextBytes: options.audio.maxTextBytes,
      maxSessionMs: options.audio.maxSessionMs,
    })
    audioWsInjectors.set(app, injectWebSocket)
  }

  // Step 10：挂主业务 API 路由。所有 `${apiPrefix}/*` 请求都会在这里进入 contract + procedure 分发。
  mountOpenAPIRoutes(app, options.procedures, http.apiPrefix, createContext)

  // Step 11：按需挂内部 RPC 路由，并在入口处限制访问来源。
  if (http.rpc !== false)
    mountRPCRoutes(app, options.procedures, http.rpc, createContext)

  // Step 12：按需挂 OpenAPI JSON 文档端点。
  if (http.openapi !== false) {
    app.get(http.openapi.path, async c => c.json(await getSpec()))
  }

  // Step 13：按需挂 docs 页面；若要求登录，则重用同一套 context/session 判定逻辑。
  if (http.docs !== false) {
    const docs = http.docs
    // 挂载 Scalar UI 脚本本地路由，避免访问外网 CDN
    app.get(SCALAR_ROUTE, async (c) => {
      const content = await getScalarScript()
      if (!content)
        return c.notFound()
      c.header('Content-Type', 'application/javascript; charset=utf-8')
      c.header('Cache-Control', 'public, max-age=86400, immutable')
      return c.body(content)
    })

    app.get(docs.path, async (c) => {
      if (docs.requireAuth) {
        const context = await createContext({ request: c.req.raw })
        // 与 procedure 层 requireAuth 语义保持一致：必须是已验证 session，
        // 不能只检查 Bearer 字符串是否存在，避免任意伪造 Token 访问受保护文档。
        if (!context.session)
          return c.json(buildHaiErrorBody(HaiCommonError.UNAUTHORIZED, servM('serv_errorUnauthorized', { locale: resolveRequestLocale(c.req.raw.headers) })), 401)
      }
      const specUrl = http.openapi === false ? undefined : http.openapi.path
      return c.html(createDocsPage(await getSpec(), { specUrl }))
    })
  }

  // Step 14：所有运行时能力都已装配完毕，返回对外稳定的 HTTP app 抽象。
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

function mountOpenAPIRoutes(
  app: Hono,
  procedures: Router<AnyContractRouter, ServContext>,
  apiPrefix: `/${string}`,
  createContext: CreateServContext,
): void {
  const handler = new OpenAPIHandler(procedures)
  // 这里只为 `${apiPrefix}/*` 这个挂载前缀注册一次 multi-method catch-all。
  // 它不是“为 contract 中的每个 endpoint 各注册一遍 GET/POST/...”，
  // 真实的路由命中与输入校验都在下游 oRPC handler 中完成。
  app.on([...API_METHODS], `${apiPrefix}/*`, (c, next) => handleORPC(c, next, apiPrefix, handler, createContext))
}

function mountRPCRoutes(
  app: Hono,
  procedures: Router<AnyContractRouter, ServContext>,
  rpcConfig: { readonly prefix: `/${string}` } & Parameters<typeof requireInternalRPC>[0],
  createContext: CreateServContext,
): void {
  const handler = new RPCHandler(procedures)
  const prefix = rpcConfig.prefix
  app.use(`${prefix}/*`, requireInternalRPC(rpcConfig))
  app.on([...API_METHODS], `${prefix}/*`, (c, next) => handleORPC(c, next, prefix, handler, createContext))
}

async function handleORPC(
  c: HonoContext,
  next: Next,
  prefix: `/${string}`,
  handler: OpenAPIHandler<ServContext> | RPCHandler<ServContext>,
  createContext: CreateServContext,
): Promise<Response | void> {
  // Step A：为本次请求创建 ServContext（可能只含元数据，也可能已带 session）。
  const context = await createContext({ request: c.req.raw })
  // Step B：交给 oRPC handler 做 contract 匹配 + procedure 执行。
  const { matched, response } = await handler.handle(c.req.raw, { prefix, context })
  if (!matched) {
    // Step C：当前前缀下没有匹配路由，继续交给 Hono 后续路由处理。
    await next()
    return
  }
  // Step D：若命中的是输入校验错误，这里统一改写成本地化的 HaiResult 失败体。
  return localizeValidationResponse(response, c.req.raw.headers)
}

/**
 * 拦截 oRPC 输入校验失败响应，重写为带 i18n 与 `errors[]` 的标准 HaiResult 失败体。
 *
 * 触发条件（保守判断，避免误伤业务自定义错误）：
 * - status === 400
 * - body 为 oRPC ORPCError JSON 形态：`{ defined, code, status, message, data }`
 * - `code === 'BAD_REQUEST'` 且 `data.issues` 存在
 *
 * 不符合上述条件的响应原样透传，确保业务层主动抛出的 BAD_REQUEST 不被改写。
 */
async function localizeValidationResponse(response: Response, requestHeaders: Headers): Promise<Response> {
  if (response.status !== 400)
    return response
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json'))
    return response

  // 克隆响应再读取，避免破坏调用方对 response 的潜在二次消费。
  let payload: unknown
  try {
    payload = await response.clone().json()
  }
  catch {
    return response
  }

  if (!isOrpcValidationErrorPayload(payload))
    return response

  const issues = payload.data.issues
  const locale = resolveRequestLocale(requestHeaders)
  const errors = localizeZodError({ issues }, locale)
  // 与 `validateInputOrFail` 输出对齐：errors 同时挂在 `error.cause` 上，
  // 使两条校验路径的客户端解析逻辑一致（都从 `error.cause` 读取字段错误）。
  // 顶层 `errors` 字段保留，兼容已有客户端读法。
  const body: ServValidationFailureBody = {
    success: false,
    error: {
      code: HaiCommonError.VALIDATION_ERROR.code,
      message: servM('serv_validationFailed', { locale }),
      httpStatus: HaiCommonError.VALIDATION_ERROR.httpStatus,
      system: HaiCommonError.VALIDATION_ERROR.system,
      module: HaiCommonError.VALIDATION_ERROR.module,
      cause: errors,
    },
    errors,
  }

  // 保留原响应头（其中可能包含安全头），仅替换 body 与 status。
  const headers = new Headers(response.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), {
    status: HaiCommonError.VALIDATION_ERROR.httpStatus,
    headers,
  })
}

interface OrpcValidationErrorPayload {
  readonly defined: boolean
  readonly code: string
  readonly status: number
  readonly message: string
  readonly data: { readonly issues: unknown[] }
}

function isOrpcValidationErrorPayload(value: unknown): value is OrpcValidationErrorPayload {
  if (!value || typeof value !== 'object')
    return false
  const obj = value as Record<string, unknown>
  if (obj.code !== 'BAD_REQUEST')
    return false
  if (typeof obj.status !== 'number' || obj.status !== 400)
    return false
  const data = obj.data
  if (!data || typeof data !== 'object')
    return false
  const issues = (data as Record<string, unknown>).issues
  return Array.isArray(issues)
}
