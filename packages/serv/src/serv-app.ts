/**
 * @h-ai/serv — Hono app 装配
 *
 * 将 oRPC contract + procedures + http 配置组合为可运行的 Hono app，
 * 自动挂载安全响应头、健康检查、OpenAPI JSON、Scalar 文档页与 oRPC handler。
 * @module serv-app
 */

import type { HaiResult } from '@h-ai/core'
import type { AnyContractRouter, OpenAPI } from '@orpc/contract'
import type { Router } from '@orpc/server'
import type { Hono, Context as HonoContext, Next } from 'hono'
import type { ServHealthHttpConfig, ServHttpConfigInput } from './serv-config.js'
import type { CreateServContext, ServContext, ServIam, ServSession } from './serv-context.js'
import type { RefreshCookieConfig } from './serv-cookie-auth.js'
import type { ServTransportConfig } from './serv-transport.js'
import { readFile } from 'node:fs/promises'
import { HaiCommonError } from '@h-ai/core'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { RPCHandler } from '@orpc/server/fetch'
import { Hono as HonoApp } from 'hono'
import { resolveServHttpConfig } from './serv-config.js'
import { buildAuthContextFactory, parseRequestContext } from './serv-context.js'
import { mountRefreshCookieRoutes } from './serv-cookie-auth.js'
import { createDocsPage, generateSpec } from './serv-openapi.js'
import { buildHaiErrorBody, requireInternalRPC, securityHeaders } from './serv-pipeline.js'
import { createTransportMiddleware } from './serv-transport.js'
import { buildValidationFailureBody, localizeZodError, resolveRequestLocale } from './serv-validation.js'

/** Scalar UI 脚本本地路由，由 createApp 自动挂载，无需外网 CDN。 */
const SCALAR_ROUTE = '/_hai/scalar.js'

/** Scalar browser bundle 兜底路径；优先使用 package.json 的 browser 字段。 */
const SCALAR_BROWSER_ENTRY_FALLBACK = './dist/browser/standalone.js'

/** 允许通过 oRPC OpenAPIHandler 转发的 HTTP 方法。 */
const API_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const

/** 缓存 Scalar UI 脚本内容（启动后不变，缓存避免重复读取）。 */
let scalarScriptCache: string | undefined

async function getScalarScript(): Promise<string | undefined> {
  if (scalarScriptCache !== undefined)
    return scalarScriptCache || undefined
  try {
    const fileUrl = await resolveScalarBrowserScriptUrl()
    scalarScriptCache = await readFile(fileUrl, 'utf8')
  }
  catch {
    scalarScriptCache = ''
  }
  return scalarScriptCache || undefined
}

async function resolveScalarBrowserScriptUrl(): Promise<URL> {
  const packageEntryUrl = import.meta.resolve('@scalar/api-reference')
  const packageJsonUrl = new URL('../package.json', packageEntryUrl)
  const packageInfo: unknown = JSON.parse(await readFile(packageJsonUrl, 'utf8'))
  const browserEntry = readScalarBrowserEntry(packageInfo) ?? SCALAR_BROWSER_ENTRY_FALLBACK
  return new URL(browserEntry, packageJsonUrl)
}

function readScalarBrowserEntry(packageInfo: unknown): string | undefined {
  if (typeof packageInfo !== 'object' || packageInfo === null || Array.isArray(packageInfo))
    return undefined
  const browser = (packageInfo as Record<string, unknown>).browser
  return typeof browser === 'string' ? browser : undefined
}

/**
 * 创建 Hono app 的配置。
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
}

/**
 * 创建并装配 Hono API app。
 *
 * @param options - contract/procedures/http 三段式配置
 * @returns Hono app
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
>(options: CreateServAppOptions<TContract, TProcedures>): Hono {
  const http = resolveServHttpConfig(options.http)
  const app = new HonoApp()

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

  // OpenAPI spec 是相对昂贵的同步生成；延迟到第一次访问 `/openapi.json` 或 `/docs` 时再算一次。
  let cachedSpec: Promise<OpenAPI.Document> | undefined
  const getSpec = (): Promise<OpenAPI.Document> => {
    cachedSpec ??= generateSpec(options.contract, { apiPrefix: http.apiPrefix })
    return cachedSpec
  }

  app.use('*', securityHeaders())

  // 传输加密必须在所有业务路由之前装载：
  // - 它需在 oRPC 读取 body 前完成解密
  // - 在下游响应返回后加密
  if (options.transport) {
    const mgr = options.transport.crypto.transport.createServer({ maxClients: options.transport.maxClients })
    if (!mgr.success)
      throw new Error(mgr.error.message)
    const keyExchangePath = `${http.apiPrefix}${options.transport.keyExchangePath ?? '/_hai/key-exchange'}`
    app.use('*', createTransportMiddleware(mgr.data, keyExchangePath, options.transport.excludePaths))
  }

  if (http.health !== false)
    mountHealthRoutes(app, http.health)

  // refresh-cookie 路由必须在 oRPC 通配符路由之前注册，Hono 按注册顺序匹配。
  if (options.refreshCookie)
    mountRefreshCookieRoutes(app, http.apiPrefix, options.refreshCookie, options.iam)

  mountOpenAPIRoutes(app, options.procedures, http.apiPrefix, createContext)

  if (http.rpc !== false)
    mountRPCRoutes(app, options.procedures, http.rpc, createContext)

  if (http.openapi !== false) {
    app.get(http.openapi.path, async c => c.json(await getSpec()))
  }

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
        // 注意：此处仅校验 Bearer Token 是否存在；真正的鉴权由具体业务的
        // procedure 包装器（如 requireAuth）在调用 API 时完成。
        // 文档页本身只是一个静态壳，不会泄漏受保护数据。
        if (!context.accessToken)
          return c.json(buildHaiErrorBody(HaiCommonError.UNAUTHORIZED, 'Unauthorized'), 401)
      }
      const specUrl = http.openapi === false ? undefined : http.openapi.path
      return c.html(createDocsPage(await getSpec(), { specUrl }))
    })
  }

  return app
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
  for (const method of API_METHODS) {
    app.on(method, `${apiPrefix}/*`, (c, next) => handleORPC(c, next, apiPrefix, handler, createContext))
  }
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
  for (const method of API_METHODS) {
    app.on(method, `${prefix}/*`, (c, next) => handleORPC(c, next, prefix, handler, createContext))
  }
}

async function handleORPC(
  c: HonoContext,
  next: Next,
  prefix: `/${string}`,
  handler: OpenAPIHandler<ServContext> | RPCHandler<ServContext>,
  createContext: CreateServContext,
): Promise<Response | void> {
  const context = await createContext({ request: c.req.raw })
  const { matched, response } = await handler.handle(c.req.raw, { prefix, context })
  if (!matched) {
    await next()
    return
  }
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
  const body = buildValidationFailureBody(locale, errors)

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
