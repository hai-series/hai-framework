/**
 * @h-ai/api-client — Token 存储与刷新管理
 *
 * 提供两个内置 Token 存储适配器（localStorage / 内存）和一个 Token 管理器
 * （封装存储读写、自动刷新、并发去重、回调通知）。
 *
 * @example 浏览器 SPA
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 *
 * await apiClient.init({
 *   baseUrl: 'https://api.example.com/api/v1',
 *   auth: { storage: apiClient.tokenStorage.localStorage() },
 * })
 * ```
 *
 * @example Node.js 测试
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 *
 * const storage = apiClient.tokenStorage.memory()
 * await storage.setAccessToken('abc')
 * ```
 *
 * @module api-client-auth
 */

import type { TokenPair, TokenStorage } from './api-client-types.js'
import { core } from '@h-ai/core'
import { z } from 'zod'

const logger = core.logger.child({ module: 'api-client', scope: 'auth' })

/**
 * httpOnly cookie 模式哨兵值。
 * `apiClient.tokenStorage.httpOnlyCookie()` 的 `getRefreshToken()` 返回此值，
 * 告知 `doRefresh` 应依赖浏览器自动发送的 httpOnly Cookie，
 * 而不是将 refreshToken 写入请求体。
 */
const HTTPONLY_COOKIE_SENTINEL = '__httponly_cookie__'

// ─── localStorage 存储 ────────────────────────────────────────────────────────

const LS_ACCESS_KEY = 'hai_access_token'
const LS_REFRESH_KEY = 'hai_refresh_token'

/**
 * 创建基于 `localStorage` 的 Token 存储（浏览器 SPA / PWA）。
 *
 * ⚠️ 安全提示（XSS 风险）：
 * - `localStorage` 对同源脚本可读，任意 XSS 漏洞都可以偷取 Token。
 * - 生产环境应优先使用 httpOnly cookie + SameSite 或 BFF 主机代理。
 * - 本适配器仅适用于内部工具、Demo、或者已接受 XSS 风险的浏览器场景，
 *   并且在调用方明确选择使用。`apiClient.create` 默认不会使用本适配器，
 *   需调用方显式传入 `auth.storage = apiClient.tokenStorage.localStorage()`。
 *
 * @example
 * ```ts
 * await apiClient.init({
 *   baseUrl: 'https://api.example.com/api/v1',
 *   auth: { storage: apiClient.tokenStorage.localStorage() },
 * })
 * ```
 */
export function createLocalStorageTokenStorage(): TokenStorage {
  // 首次实例化时警告一次，提示调用方可能需要重新评估安全模型。
  logger.warn('apiClient.tokenStorage.localStorage: storing tokens in localStorage exposes them to XSS. Prefer httpOnly cookies for production.')
  return {
    async getAccessToken() {
      return globalThis.localStorage?.getItem(LS_ACCESS_KEY) ?? null
    },
    async setAccessToken(token) {
      globalThis.localStorage?.setItem(LS_ACCESS_KEY, token)
    },
    async getRefreshToken() {
      return globalThis.localStorage?.getItem(LS_REFRESH_KEY) ?? null
    },
    async setRefreshToken(token) {
      globalThis.localStorage?.setItem(LS_REFRESH_KEY, token)
    },
    async clear() {
      globalThis.localStorage?.removeItem(LS_ACCESS_KEY)
      globalThis.localStorage?.removeItem(LS_REFRESH_KEY)
    },
  }
}

// ─── 内存存储 ─────────────────────────────────────────────────────────────────

/**
 * 创建内存 Token 存储（Node.js 测试 / SSR / 短生命周期场景）。
 * 页面刷新后丢失。
 *
 * @example
 * ```ts
 * const storage = apiClient.tokenStorage.memory()
 * await storage.setAccessToken('abc')
 * ```
 */
export function createMemoryTokenStorage(): TokenStorage {
  let accessToken: string | null = null
  let refreshToken: string | null = null
  return {
    async getAccessToken() { return accessToken },
    async setAccessToken(token) { accessToken = token },
    async getRefreshToken() { return refreshToken },
    async setRefreshToken(token) { refreshToken = token },
    async clear() {
      accessToken = null
      refreshToken = null
    },
  }
}

// ─── httpOnly Cookie 存储 ────────────────────────────────────────────────────

/**
 * 创建基于 httpOnly cookie 的 Token 存储（生产环境推荐方案）。
 *
 * **安全模型：**
 * - `accessToken` 保存在**内存**中：JS 可读写，用于注入 `Authorization: Bearer`；
 *   页面刷新后丢失，由 refresh 流程自动补充。
 * - `refreshToken` 保存在服务端设置的 **httpOnly cookie** 中：
 *   - JS 不可读写，XSS 脚本无法直接盗取。
 *   - 结合 `SameSite=Strict` 可阻止 CSRF 攻击。
 *   - 浏览器在每次请求时自动携带，无需客户端显式传递。
 *
 * **服务端配套要求：**
 * 1. 登录端点在响应中设置：
 *    ```
 *    Set-Cookie: refresh_token=<token>; HttpOnly; SameSite=Strict; Secure;
 *               Path=/api/v1/auth/refresh; Max-Age=<seconds>
 *    ```
 *    `Path` 限定为 refresh 端点，减少 Cookie 暴露面。
 * 2. Refresh 端点从 Cookie 读取 refresh token（忽略请求体中的 `refreshToken` 字段）。
 * 3. Logout 端点清除 Cookie：
 *    ```
 *    Set-Cookie: refresh_token=; HttpOnly; SameSite=Strict; Secure;
 *               Path=/api/v1/auth/refresh; Max-Age=0
 *    ```
 *
 * **跨域注意事项：**
 * 若 API 与前端不同源，服务端还需设置：
 * `Access-Control-Allow-Origin: <前端域名>` 和 `Access-Control-Allow-Credentials: true`。
 * 调用方不需要做额外配置，`apiClient.create` 会自动识别并设置 `credentials: 'include'`。
 *
 * @example
 * ```ts
 * await apiClient.init({
 *   baseUrl: 'https://api.example.com/api/v1',
 *   auth: { storage: apiClient.tokenStorage.httpOnlyCookie() },
 * })
 * ```
 */
export function createHttpOnlyCookieTokenStorage(): TokenStorage {
  // access token 保存在内存中，用于注入 Authorization 请求头
  let memoryAccessToken: string | null = null
  return {
    async getAccessToken() { return memoryAccessToken },
    async setAccessToken(token) { memoryAccessToken = token },
    // refresh token 由服务端通过 Set-Cookie 设置为 httpOnly cookie；
    // JS 不可见，返回哨兵值让 TokenManager 识别此模式。
    async getRefreshToken() { return HTTPONLY_COOKIE_SENTINEL },
    // refresh token 由服务端管理，JS 端无法写入 httpOnly cookie，忽略此调用。
    async setRefreshToken(_token) { /* 由服务端 Set-Cookie 响应头管理，客户端无需操作 */ },
    async clear() {
      memoryAccessToken = null
      // httpOnly cookie 的清除必须由服务端 logout 端点完成（Set-Cookie: Max-Age=0）；
      // 客户端无法通过 JS 直接删除 httpOnly cookie。
    },
  }
}

// ─── Token 管理器 ─────────────────────────────────────────────────────────────

/** 校验 refresh 响应体中的 Token 字段；httpOnly cookie 模式允许不返回 refreshToken。 */
const RefreshTokenPayloadSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  expiresIn: z.number().optional(),
  tokenType: z.string().optional(),
})

type RefreshCallback = (tokens: TokenPair) => void

/**
 * 创建 Token 管理器：封装存储读写、自动刷新、并发去重与回调通知。
 *
 * 主要供 `apiClient.create` 内部使用，同时作为 named export 暴露给测试与高级用户。
 *
 * 行为约定：
 * - 并发多次 `refresh()` 共享同一个请求。
 * - refresh 接口失败、响应字段缺失或 401，都视为刷新失败：清空存储并触发 `onRefreshFailed`。
 * - 兼容两种响应格式：`{ data: tokens }` 与 `{ data: { tokens } }`（HaiResult 包装）。
 *
 * @example
 * ```ts
 * const manager = createTokenManager(
 *   apiClient.tokenStorage.memory(),
 *   'https://api.example.com/api/v1/auth/refresh',
 *   fetch,
 *   () => notifyLoginRequired(),
 * )
 *
 * const off = manager.onTokenRefreshed(tokens => syncTokens(tokens))
 * const tokens = await manager.refresh()
 * off()
 * ```
 *
 * @param storage - Token 存储适配器
 * @param refreshEndpointUrl - refresh 接口完整 URL（`baseUrl + refreshPath`）
 * @param fetchFn - fetch 实现（允许注入 mock）
 * @param onRefreshFailed - 刷新失败回调
 * @param refreshTimeoutMs - 刷新请求超时（ms），默认 10_000
 * @returns Token 管理器实例
 */
export function createTokenManager(
  storage: TokenStorage,
  refreshEndpointUrl: string,
  fetchFn: typeof globalThis.fetch,
  onRefreshFailed?: () => void,
  refreshTimeoutMs: number = 10_000,
) {
  const callbacks: RefreshCallback[] = []
  let refreshPromise: Promise<TokenPair | null> | null = null

  async function refresh(): Promise<TokenPair | null> {
    // 并发去重：同一时刻只发一次 refresh，其它调用复用同一个 Promise
    if (refreshPromise)
      return refreshPromise
    refreshPromise = doRefresh()
    try {
      return await refreshPromise
    }
    finally {
      refreshPromise = null
    }
  }

  async function doRefresh(): Promise<TokenPair | null> {
    const refreshToken = await storage.getRefreshToken()
    if (!refreshToken) {
      logger.warn('Token refresh skipped, no refresh token available')
      onRefreshFailed?.()
      return null
    }

    logger.debug('Refreshing token')
    // 超时保护：避免 refresh 接口挂死时 dedup Promise 永不 resolve，连带所有等待者 hang。
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), refreshTimeoutMs)
    try {
      // httpOnly cookie 模式：浏览器自动发送 Cookie，请求体无需携带 refreshToken；
      // 同时设置 credentials:'include' 以支持跨域 Cookie 发送。
      const useHttpOnlyCookie = refreshToken === HTTPONLY_COOKIE_SENTINEL
      const response = await fetchFn(new Request(refreshEndpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: useHttpOnlyCookie ? undefined : JSON.stringify({ refreshToken }),
        credentials: useHttpOnlyCookie ? 'include' : 'same-origin',
        signal: controller.signal,
      }))

      if (!response.ok) {
        // 仅在服务端明确返回 401/4xx 时才清除 Token（refresh token 已失效）；
        // 5xx 作为服务端临时故障，保留 Token 让下一次请求重试。
        if (response.status >= 400 && response.status < 500) {
          await storage.clear()
          onRefreshFailed?.()
        }
        else {
          logger.warn('Token refresh transient failure, keeping tokens', { status: response.status })
        }
        return null
      }

      const body = await response.json() as { data?: unknown }
      const parsed = RefreshTokenPayloadSchema.safeParse(readTokenPayload(body.data))
      if (!parsed.success) {
        logger.warn('Token refresh returned invalid data', { issues: parsed.error.issues })
        await storage.clear()
        onRefreshFailed?.()
        return null
      }
      if (!useHttpOnlyCookie && !parsed.data.refreshToken) {
        logger.warn('Token refresh returned invalid data', { issues: [{ path: ['refreshToken'], message: 'Required' }] })
        await storage.clear()
        onRefreshFailed?.()
        return null
      }

      // 默认值兜底，避免不安全强转
      const refreshTokenForStorage = parsed.data.refreshToken ?? HTTPONLY_COOKIE_SENTINEL
      const tokens: TokenPair = {
        accessToken: parsed.data.accessToken,
        refreshToken: refreshTokenForStorage,
        expiresIn: parsed.data.expiresIn ?? 3600,
        tokenType: 'Bearer',
      }
      await storage.setAccessToken(tokens.accessToken)
      await storage.setRefreshToken(refreshTokenForStorage)
      logger.info('Token refreshed successfully')
      for (const cb of callbacks) cb(tokens)
      return tokens
    }
    catch (error) {
      // 网络或 fetch 本身抛异常（超时、断网、CORS）视为可重试的暂时性错误，
      // 不清除 Token，仅记录日志。调用方可在下次请求时重试。
      logger.error('Token refresh failed (transient)', { error })
      return null
    }
    finally {
      clearTimeout(timeoutId)
    }
  }

  return {
    storage,
    refresh,
    async setTokens(tokens: TokenPair) {
      await storage.setAccessToken(tokens.accessToken)
      if (tokens.refreshToken)
        await storage.setRefreshToken(tokens.refreshToken)
    },
    async clear() {
      await storage.clear()
    },
    onTokenRefreshed(callback: RefreshCallback): () => void {
      callbacks.push(callback)
      return () => {
        const idx = callbacks.indexOf(callback)
        if (idx >= 0)
          callbacks.splice(idx, 1)
      }
    },
  }
}

/** Token 管理器类型（`createTokenManager` 返回值）。 */
export type TokenManager = ReturnType<typeof createTokenManager>

/** 兼容 `{ data: tokens }` 与 `{ data: { tokens } }` 两种 refresh 响应体。 */
function readTokenPayload(data: unknown): unknown {
  if (typeof data === 'object' && data !== null && 'tokens' in data) {
    return (data as { tokens: unknown }).tokens
  }
  return data
}
