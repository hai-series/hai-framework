/**
 * @h-ai/serv — Refresh Token 浏览器 / 原生传输
 *
 * **职责边界**：本文件 **仅** 负责 `refresh token` 的传输，不涉及 access token 校验。
 * - access token 校验由 `serv-context.ts` 的 `buildAuthContextFactory` 统一处理
 * - 浏览器使用 httpOnly cookie，避免 refresh token 进入 JS 可读存储
 * - 经过应用可信来源校验的原生客户端可改用 JSON body，交由系统安全存储持久化
 *
 * **挂载的路由**：
 * - login / register / loginWithOtp：浏览器写 Cookie 并擦除响应 token；受信原生请求保留响应 token
 * - logout：浏览器清除 Cookie（Max-Age=0）；原生客户端自行清理安全存储
 * - refresh：**专属路由**（不走 oRPC），按请求来源从 Cookie 或 JSON body 读取并轮换 token
 *
 * **Cookie 规格**：`HttpOnly; SameSite=Strict; Secure`（生产）/ 无 Secure（开发）
 * Cookie Path 限制为 `{apiPrefix}/auth/refresh`，最小化浏览器自动发送范围（避免 CSRF 攻击面）。
 * @module serv-cookie-auth
 */

import type { HaiResult } from '@h-ai/core'
import type { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ServIam } from './serv-context.js'
import process from 'node:process'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { getCookie } from 'hono/cookie'
import { buildHaiErrorBody } from './pipelines/serv-pipeline-helper.js'
import { servM } from './serv-i18n.js'
import { resolveRequestLocale } from './serv-validation.js'

// ─── 公共类型 ─────────────────────────────────────────────────────────────────

/**
 * Refresh 流程返回的 Token 对结构。
 * 与 `@h-ai/iam` 的 `TokenPair` 结构兼容；此处独立定义以避免对可选 peer dep 的强依赖。
 */
export interface RefreshTokenPair {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresIn?: number
  readonly tokenType?: string
}

type SafeRefreshTokenPair = Omit<RefreshTokenPair, 'refreshToken'>

/**
 * 原生客户端的 refresh token body 传输配置。
 *
 * 浏览器继续使用 httpOnly cookie；只有经过应用可信来源校验的原生请求，才允许在
 * JSON body 中接收和返回 refresh token。`isRequest` 必须同时校验客户端标识与 Origin，
 * 不能仅信任可伪造的单个请求头。
 */
export interface NativeRefreshTokenTransportConfig {
  /** 判断当前请求是否来自受信原生客户端。 */
  readonly isRequest: (request: Request) => boolean
}

/**
 * Refresh Token 传输配置。
 *
 * 传入 `serv.createApp({ refreshCookie: ... })` 后自动管理浏览器 cookie，并可选启用受信原生 body 通道。
 * access token 仍然走 `Authorization: Bearer <token>`；本配置只改变 refresh token 的传输通道。
 *
 * 刷新回调来源（优先级从高到低）：
 * 1. `onRefresh`（显式覆盖）
 * 2. 顶层 `iam.session.refresh`（推荐：`createApp({ iam, refreshCookie: {} })` 即开箱可用）
 */
export interface RefreshCookieConfig {
  /** Cookie 名，默认 `hai_refresh_token`。 */
  readonly cookieName?: string
  /**
   * Cookie Max-Age（秒），默认 `30 * 24 * 3600`（30 天）。
   * 应与 IAM 模块的 refresh token TTL 对齐。
   */
  readonly maxAge?: number
  /**
   * 强制 Secure 属性。
   * - 未传时：`NODE_ENV === 'production'` 时自动开启。
   * - 本地 HTTP 开发设为 `false` 可让 Cookie 在 HTTP 下正常工作。
   */
  readonly secure?: boolean
  /**
   * 为受信原生客户端启用 JSON body 传输。
   *
   * 启用后，匹配请求的登录、注册与刷新响应保留 `refreshToken`，刷新请求从
   * `{ refreshToken }` body 读取凭证，且不读写浏览器 Cookie。
   */
  readonly nativeTokenTransport?: NativeRefreshTokenTransportConfig
  /**
   * 自定义刷新回调（高级用法）。
   * 未提供时使用顶层 `iam.session.refresh`；两者均缺失时 `createApp` 会抛错。
   */
  readonly onRefresh?: (refreshToken: string) => Promise<HaiResult<RefreshTokenPair>>
}

// ─── 内部解析 ─────────────────────────────────────────────────────────────────

interface ResolvedRefreshCookieConfig {
  cookieName: string
  maxAge: number
  isSecure: boolean
  refreshCookiePath: string
  onRefresh: (refreshToken: string) => Promise<HaiResult<RefreshTokenPair>>
  nativeTokenTransport: NativeRefreshTokenTransportConfig | undefined
}

const IAM_AUTH_PATHS = {
  login: apiContract.pathOf(apiContract.iam.auth.login),
  loginWithOtp: apiContract.pathOf(apiContract.iam.auth.loginWithOtp),
  register: apiContract.pathOf(apiContract.iam.auth.register),
  logout: apiContract.pathOf(apiContract.iam.auth.logout),
  refresh: apiContract.pathOf(apiContract.iam.auth.refresh),
}

function resolveRefreshCookieConfig(
  apiPrefix: string,
  config: RefreshCookieConfig,
  iam: ServIam | undefined,
): ResolvedRefreshCookieConfig {
  // ⚠️ 不 `.bind(iam.session)`：IAM NotInitializedKit Proxy 在 init 后才切换为真实实现，
  //    提前 bind 会捕获未初始化 Proxy。用闭包延迟到调用点再解析。
  const onRefresh = config.onRefresh
    ?? (iam ? (refreshToken: string) => iam.session.refresh(refreshToken) : undefined)
  if (!onRefresh) {
    // 抛 HaiError 实例而非裸 Error：保留 code/system/module，便于上层错误处理识别这是
    // 配置缺失而非业务异常。该错误只在 createApp 装配阶段出现，不会泄漏到 HTTP 响应。
    throw core.error.buildHaiErrorInst(
      HaiCommonError.INTERNAL_ERROR,
      '[serv] refreshCookie requires either top-level `iam` (recommended) or `refreshCookie.onRefresh` callback',
    )
  }
  return {
    cookieName: config.cookieName ?? 'hai_refresh_token',
    maxAge: config.maxAge ?? 30 * 24 * 3600,
    isSecure: config.secure ?? (process.env.NODE_ENV === 'production'),
    refreshCookiePath: `${apiPrefix}${IAM_AUTH_PATHS.refresh}`,
    onRefresh,
    nativeTokenTransport: config.nativeTokenTransport,
  }
}

// ─── Cookie 字符串构建 ────────────────────────────────────────────────────────

function buildSetCookieHeader(
  name: string,
  value: string,
  path: string,
  maxAge: number,
  secure: boolean,
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Strict',
  ]
  if (secure)
    parts.push('Secure')
  return parts.join('; ')
}

function buildClearCookieHeader(name: string, path: string): string {
  return `${name}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=Strict`
}

// ─── 响应体解析 ───────────────────────────────────────────────────────────────

/**
 * 从 oRPC 成功响应的 `data` 字段中提取 refresh token。
 * 兼容两种结构：
 * - login/register: `{ tokens: { refreshToken, ... }, user, ... }`
 * - （保留）直接含 `{ tokens: { refreshToken } }` 的 data
 */
function extractRefreshTokenFromData(data: unknown): string | undefined {
  if (!data || typeof data !== 'object')
    return undefined
  const d = data as Record<string, unknown>
  const tokens = d.tokens
  if (!tokens || typeof tokens !== 'object')
    return undefined
  const t = tokens as Record<string, unknown>
  return typeof t.refreshToken === 'string' && t.refreshToken ? t.refreshToken : undefined
}

/**
 * 擦除响应体中的 refreshToken，确保 httpOnly 模式下 JS 无法读取长期凭证。
 *
 * 这与 `Set-Cookie` 写入 refresh token **不是重复操作**，而是刻意把两条信道分开：
 * - `Set-Cookie`：交给浏览器保存 refresh token（httpOnly，JS 不可读）
 * - JSON 响应体：交给前端 JS 消费，因此必须删除 `refreshToken`
 */
function stripRefreshTokenFromData(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return data
  const d = data as Record<string, unknown>
  const tokens = d.tokens
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens))
    return data

  const safeTokens: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(tokens)) {
    if (key !== 'refreshToken')
      safeTokens[key] = value
  }
  return { ...d, tokens: safeTokens }
}

function stripRefreshTokenFromPair(tokens: RefreshTokenPair): SafeRefreshTokenPair {
  return {
    accessToken: tokens.accessToken,
    ...(tokens.expiresIn === undefined ? {} : { expiresIn: tokens.expiresIn }),
    ...(tokens.tokenType === undefined ? {} : { tokenType: tokens.tokenType }),
  }
}

// ─── 路由挂载 ─────────────────────────────────────────────────────────────────

/* 由 createApp 在 mountOpenAPIRoutes 之前调用，在 Hono app 上挂载
 * cookie 认证相关路由。Hono 按注册顺序匹配路由，因此必须在 oRPC 通配符路由之前注册。 */
export function mountRefreshCookieRoutes(
  app: Hono,
  apiPrefix: string,
  config: RefreshCookieConfig,
  iam: ServIam | undefined,
): void {
  const {
    cookieName,
    maxAge,
    isSecure,
    refreshCookiePath,
    onRefresh,
    nativeTokenTransport,
  } = resolveRefreshCookieConfig(apiPrefix, config, iam)

  // ─── login / register / loginWithOtp：oRPC 处理后，按客户端类型选择 token 传输通道 ──
  // 路径直接从 apiContract.iam 的 route 元数据读取，保持 contract 为唯一来源。
  const loginPaths = [
    `${apiPrefix}${IAM_AUTH_PATHS.login}`,
    `${apiPrefix}${IAM_AUTH_PATHS.loginWithOtp}`,
    `${apiPrefix}${IAM_AUTH_PATHS.register}`,
  ]
  for (const path of loginPaths) {
    app.post(path, async (c, next) => {
      const useNativeTokenTransport = nativeTokenTransport?.isRequest(c.req.raw) === true
      await next()
      if (c.res.status !== 200)
        return
      // 消费响应体后必须重建 Response（ReadableStream 只能消费一次）
      const bodyText = await c.res.text()
      const headers = new Headers(c.res.headers)
      let responseBody = bodyText
      try {
        const body = JSON.parse(bodyText) as { success?: boolean, data?: unknown }
        if (body.success) {
          const refreshToken = extractRefreshTokenFromData(body.data)
          if (!useNativeTokenTransport) {
            // 刻意保留“写 cookie + 擦响应体”两步：
            // - cookie 让浏览器持久保存 refresh token，用于后续 /auth/refresh
            // - body 中删掉 refreshToken，避免任何前端 JS 直接读到长期凭证
            if (refreshToken)
              headers.append('Set-Cookie', buildSetCookieHeader(cookieName, refreshToken, refreshCookiePath, maxAge, isSecure))
            body.data = stripRefreshTokenFromData(body.data)
            responseBody = JSON.stringify(body)
            headers.delete('Content-Length')
          }
        }
      }
      catch { /* 非 JSON 响应，跳过 cookie 写入 */ }
      c.res = new Response(responseBody, { status: c.res.status, statusText: c.res.statusText, headers })
    })
  }

  // ─── logout：oRPC 处理后，拦截成功响应清除 cookie ────────────────────────────
  app.post(`${apiPrefix}${IAM_AUTH_PATHS.logout}`, async (c, next) => {
    const useNativeTokenTransport = nativeTokenTransport?.isRequest(c.req.raw) === true
    await next()
    if (c.res.status !== 200)
      return
    const bodyText = await c.res.text()
    const headers = new Headers(c.res.headers)
    try {
      const body = JSON.parse(bodyText) as { success?: boolean }
      if (body.success && !useNativeTokenTransport)
        headers.append('Set-Cookie', buildClearCookieHeader(cookieName, refreshCookiePath))
    }
    catch { /* 非 JSON，跳过 */ }
    c.res = new Response(bodyText, { status: c.res.status, statusText: c.res.statusText, headers })
  })

  // ─── refresh：专属路由，绕过 oRPC，直接从 cookie 读取 token 并刷新 ─────────
  // 此路由须在 oRPC 通配符之前注册，Hono 才能正确匹配。
  app.post(`${apiPrefix}${IAM_AUTH_PATHS.refresh}`, async (c) => {
    // access token 认证不走这里；这里只有“用 refresh token 换新 access token”这一件事。
    const useNativeTokenTransport = nativeTokenTransport?.isRequest(c.req.raw) === true
    const refreshToken = useNativeTokenTransport
      ? await readRefreshTokenFromBody(c.req.raw)
      : getCookie(c, cookieName)
    if (!refreshToken) {
      const locale = resolveRequestLocale(c.req.raw.headers)
      return c.json(buildHaiErrorBody(HaiCommonError.UNAUTHORIZED, servM('serv_errorUnauthorized', { locale })), 401)
    }

    const result = await onRefresh(refreshToken)
    if (!result.success) {
      const status = (result.error.httpStatus ?? 401) as ContentfulStatusCode
      // 浏览器刷新失败时清除失效 cookie，避免客户端循环重试；原生客户端自行清理安全存储。
      const headers = new Headers({ 'Content-Type': 'application/json' })
      if (!useNativeTokenTransport)
        headers.set('Set-Cookie', buildClearCookieHeader(cookieName, refreshCookiePath))
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status,
        headers,
      })
    }

    const tokens = result.data
    if (useNativeTokenTransport) {
      return new Response(JSON.stringify({ success: true, data: { tokens } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const setCookie = buildSetCookieHeader(cookieName, tokens.refreshToken, refreshCookiePath, maxAge, isSecure)
    return new Response(JSON.stringify({ success: true, data: { tokens: stripRefreshTokenFromPair(tokens) } }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': setCookie,
      },
    })
  })
}

/**
 * 从受信原生客户端的 JSON body 读取 refresh token。
 *
 * 非 JSON、空 body 与空字符串统一视为未提供凭证，由调用方返回 401。
 */
async function readRefreshTokenFromBody(request: Request): Promise<string | undefined> {
  const body = await request.json().catch(() => undefined) as { refreshToken?: unknown } | undefined
  return typeof body?.refreshToken === 'string' && body.refreshToken.length > 0
    ? body.refreshToken
    : undefined
}
