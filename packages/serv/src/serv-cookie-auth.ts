/**
 * @h-ai/serv — Refresh Token httpOnly Cookie 传输中间件
 *
 * **职责边界**：本文件 **仅** 负责 `refresh token` 的 cookie 化传输，不涉及 access token 校验。
 * - access token 校验由 `serv-context.ts` 的 `buildAuthContextFactory` 统一处理
 * - 本文件只关心：浏览器场景下，refresh token 不应写入 JS 可读存储（防 XSS），改走 httpOnly cookie
 *
 * **挂载的路由**：
 * - login / register / loginWithOtp：拦截 oRPC 成功响应，从响应体提取 refresh token → Set-Cookie，并从响应体擦除
 * - logout：拦截 oRPC 成功响应，清除 Cookie（Max-Age=0）
 * - refresh：**专属路由**（不走 oRPC），从 Cookie 读取 refresh token → 调用 `onRefresh` → 更新 Cookie
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
import { IAM_AUTH_ROUTES } from '@h-ai/api-contract'
import { HaiCommonError } from '@h-ai/core'
import { getCookie } from 'hono/cookie'
import { servM } from './serv-i18n.js'
import { buildHaiErrorBody } from './serv-pipeline.js'
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

/**
 * Refresh Token Cookie 传输配置。
 *
 * 传入 `serv.createApp({ refreshCookie: ... })` 后自动管理 refresh token cookie。
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
    throw new Error(
      '[serv] refreshCookie requires either top-level `iam` (recommended) '
      + 'or `refreshCookie.onRefresh` callback',
    )
  }
  return {
    cookieName: config.cookieName ?? 'hai_refresh_token',
    maxAge: config.maxAge ?? 30 * 24 * 3600,
    isSecure: config.secure ?? (process.env.NODE_ENV === 'production'),
    refreshCookiePath: `${apiPrefix}${IAM_AUTH_ROUTES.refresh}`,
    onRefresh,
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

// ─── 路由挂载 ─────────────────────────────────────────────────────────────────

/* 由 createApp 在 mountOpenAPIRoutes 之前调用，在 Hono app 上挂载
 * cookie 认证相关路由。Hono 按注册顺序匹配路由，因此必须在 oRPC 通配符路由之前注册。 */
export function mountRefreshCookieRoutes(
  app: Hono,
  apiPrefix: string,
  config: RefreshCookieConfig,
  iam: ServIam | undefined,
): void {
  const { cookieName, maxAge, isSecure, refreshCookiePath, onRefresh } = resolveRefreshCookieConfig(apiPrefix, config, iam)

  // ─── login / register / loginWithOtp：oRPC 处理后，拦截成功响应写入 cookie ──
  // 路径从 iamContract（IAM_AUTH_ROUTES）读取，保持与 contract 定义同步。
  const loginPaths = [
    `${apiPrefix}${IAM_AUTH_ROUTES.login}`,
    `${apiPrefix}${IAM_AUTH_ROUTES.loginWithOtp}`,
    `${apiPrefix}${IAM_AUTH_ROUTES.register}`,
  ]
  for (const path of loginPaths) {
    app.post(path, async (c, next) => {
      await next()
      if (c.res.status !== 200)
        return
      // 消费响应体后必须重建 Response（ReadableStream 只能消费一次）
      const bodyText = await c.res.text()
      const headers = new Headers(c.res.headers)
      try {
        const body = JSON.parse(bodyText) as { success?: boolean, data?: unknown }
        if (body.success) {
          const refreshToken = extractRefreshTokenFromData(body.data)
          if (refreshToken)
            headers.append('Set-Cookie', buildSetCookieHeader(cookieName, refreshToken, refreshCookiePath, maxAge, isSecure))
        }
      }
      catch { /* 非 JSON 响应，跳过 cookie 写入 */ }
      c.res = new Response(bodyText, { status: c.res.status, statusText: c.res.statusText, headers })
    })
  }

  // ─── logout：oRPC 处理后，拦截成功响应清除 cookie ────────────────────────────
  app.post(`${apiPrefix}${IAM_AUTH_ROUTES.logout}`, async (c, next) => {
    await next()
    if (c.res.status !== 200)
      return
    const bodyText = await c.res.text()
    const headers = new Headers(c.res.headers)
    try {
      const body = JSON.parse(bodyText) as { success?: boolean }
      if (body.success)
        headers.append('Set-Cookie', buildClearCookieHeader(cookieName, refreshCookiePath))
    }
    catch { /* 非 JSON，跳过 */ }
    c.res = new Response(bodyText, { status: c.res.status, statusText: c.res.statusText, headers })
  })

  // ─── refresh：专属路由，绕过 oRPC，直接从 cookie 读取 token 并刷新 ─────────
  // 此路由须在 oRPC 通配符之前注册，Hono 才能正确匹配。
  app.post(`${apiPrefix}${IAM_AUTH_ROUTES.refresh}`, async (c) => {
    const refreshToken = getCookie(c, cookieName)
    if (!refreshToken) {
      const locale = resolveRequestLocale(c.req.raw.headers)
      return c.json(buildHaiErrorBody(HaiCommonError.UNAUTHORIZED, servM('serv_errorUnauthorized', { locale })), 401)
    }

    const result = await onRefresh(refreshToken)
    if (!result.success) {
      const status = (result.error.httpStatus ?? 401) as ContentfulStatusCode
      // 刷新失败时清除失效 cookie，避免客户端循环重试
      const clearCookie = buildClearCookieHeader(cookieName, refreshCookiePath)
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': clearCookie,
        },
      })
    }

    const tokens = result.data
    const setCookie = buildSetCookieHeader(cookieName, tokens.refreshToken, refreshCookiePath, maxAge, isSecure)
    return new Response(JSON.stringify({ success: true, data: { tokens } }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': setCookie,
      },
    })
  })
}
