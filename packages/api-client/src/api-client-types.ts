/**
 * @h-ai/api-client — 类型与错误码
 *
 * 公共类型（TokenPair、TokenStorage、ApiClientConfig 等）与标准错误集合（HaiApiClientError）。
 * 不包含实现，仅用于跨文件共享与对外导出。
 * @module api-client-types
 */

import type { ErrorInfo, HaiResult } from '@h-ai/core'
import type { CryptoFunctions } from '@h-ai/crypto'
import type { AnyContractRouter, ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import { core } from '@h-ai/core'

// ─── 错误码 ───────────────────────────────────────────────────────────────────

const ApiClientErrorInfo = {
  NETWORK_ERROR: '001:502',
  TIMEOUT: '002:504',
  SERVER_ERROR: '003:502',
  UNAUTHORIZED: '004:401',
  FORBIDDEN: '005:403',
  NOT_FOUND: '006:404',
  VALIDATION_FAILED: '007:400',
  TOKEN_REFRESH_FAILED: '008:401',
  NOT_INITIALIZED: '010:500',
  CONFIG_ERROR: '011:500',
  UNKNOWN: '099:500',
} as const satisfies ErrorInfo

/**
 * API client 标准错误集合（遵循 `@h-ai/core` 错误码规范）。
 *
 * @example
 * ```ts
 * if (!result.success && result.error.code === HaiApiClientError.UNAUTHORIZED.code) {
 *   redirectToLogin()
 * }
 * ```
 */
export const HaiApiClientError = core.error.buildHaiErrorsDef('api-client', ApiClientErrorInfo)

// ─── Token ────────────────────────────────────────────────────────────────────

/** Token 对（与 `@h-ai/iam` 的 TokenPair 对齐）。 */
export interface TokenPair {
  /** 短期访问凭证，请求时作为 `Authorization: Bearer ...`。 */
  readonly accessToken: string
  /** 长期刷新凭证；httpOnly cookie 模式下由服务端管理，响应体中可能不存在。 */
  readonly refreshToken?: string
  /** accessToken 有效期秒数。 */
  readonly expiresIn: number
  /** 固定为 `'Bearer'`。 */
  readonly tokenType: 'Bearer'
}

/**
 * Token 存储适配器。
 *
 * 内置实现：
 * - `apiClient.tokenStorage.httpOnlyCookie()` — **默认**；浏览器端推荐，refresh token 由服务端管理，防 XSS。
 * - `apiClient.tokenStorage.memory()` — Node.js 测试 / SSR（需显式传入）。
 * - `apiClient.tokenStorage.localStorage()` — 浏览器 SPA / PWA（有 XSS 风险，生产不推荐）。
 *
 * Capacitor / 小程序场景请由对应模块提供（例如 `@h-ai/capacitor`）。
 */
export interface TokenStorage {
  readonly getAccessToken: () => Promise<string | null>
  readonly setAccessToken: (token: string) => Promise<void>
  readonly getRefreshToken: () => Promise<string | null>
  readonly setRefreshToken: (token: string) => Promise<void>
  readonly clear: () => Promise<void>
}

// ─── 配置 ─────────────────────────────────────────────────────────────────────

/** Token 自动刷新配置。 */
export interface AuthConfig {
  /**
   * Token 存储适配器；默认 `apiClient.tokenStorage.httpOnlyCookie()`（refresh token 由服务端管理，防 XSS）。
   *
   * - SSR / Node.js 测试场景请显式传入 `apiClient.tokenStorage.memory()`。
   * - 浏览器 SPA 如确需持久化，可显式传 `apiClient.tokenStorage.localStorage()`，
   *   但请先评估 XSS 风险。
   * - Capacitor / 小程序请使用对应平台的安全存储适配器（如 `@h-ai/capacitor`）。
   */
  readonly storage?: TokenStorage
  /** 刷新接口路径，相对于 `baseUrl`，默认 `/auth/refresh`。 */
  readonly refreshPath?: string
  /**
   * 刷新请求超时（ms），默认 10_000。
   * 避免 refresh 接口上游挂死时所有 dedup 调用方一起 hang。
   * 超时后按现有 transient 失败处理（不清 token，下次请求可重试）。
   */
  readonly refreshTimeoutMs?: number
  /** 刷新成功回调，用于同步状态（例如多 Tab 广播）。 */
  readonly onTokenRefreshed?: (tokens: TokenPair) => void
  /** 刷新失败回调（如 refresh token 已失效），通常用于跳转登录页。 */
  readonly onRefreshFailed?: () => void
}

/** API client 初始化配置。 */
export interface ApiClientConfig {
  /** API service 完整 baseUrl，通常含 `apiPrefix`，例如 `https://api.example.com/api/v1`。 */
  readonly baseUrl: string
  /** 认证配置；不传则不启用 Token 注入与自动刷新。 */
  readonly auth?: AuthConfig
  /** 请求超时（ms），默认 30000。 */
  readonly timeout?: number
  /** 客户端标识，写入 `x-request-client` 请求头，默认 `hai-api-client`。 */
  readonly clientName?: string
  /** 额外请求头，可为静态对象或异步函数。 */
  readonly headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
  /** 自定义 fetch（测试 mock / Capacitor / 小程序桥接）。 */
  readonly fetch?: typeof globalThis.fetch
  /**
   * 启用端到端传输加密（opt-in）。
   *
   * 配置后所有出站请求会在底层 fetch 之上做一次混合加密，并自动解密
   * 标记为 `X-Encrypted: true` 的响应。服务端需启用对应的 `serv.createApp({ transport })`。
   *
   * `crypto` 字段结构与 `@h-ai/crypto` 的 `crypto` 实例兼容；通常直接传入：
   *
   * @example
   * ```ts
   * import { apiClient } from '@h-ai/api-client'
   * import { crypto } from '@h-ai/crypto'
   *
   * await crypto.init()
   * await apiClient.init({
   *   baseUrl: 'https://api.example.com/api/v1',
   *   transport: { crypto },
   * })
   * ```
   */
  readonly transport?: ApiClientTransportConfig
}

// ─── 传输加密 ────────────────────────────────────────────────────────────────

/** {@link ApiClientConfig.transport} 的配置项。 */
export interface ApiClientTransportConfig {
  /**
   * crypto 服务实例（通常直接传入 `@h-ai/crypto` 的 `crypto`）。
   * api-client 通过 `crypto.transport.createClient(...)` 创建会话。
   */
  readonly crypto: CryptoFunctions
  /**
   * 密钥协商端点路径，相对于 `baseUrl`，默认 `/_hai/key-exchange`。
   *
   * 必须与服务端 `serv.createApp({ transport: { keyExchangePath } })` 一致。
   */
  readonly keyExchangePath?: string
}

// ─── Client 接口 ──────────────────────────────────────────────────────────────

/** Token 辅助操作。 */
export interface ApiClientAuth {
  /** 手动写入 Token（例如登录成功后）。 */
  readonly setTokens: (tokens: TokenPair) => Promise<void>
  /** 清空存储的 Token（登出）。 */
  readonly clear: () => Promise<void>
  /** 订阅 Token 刷新成功事件，返回取消订阅函数。 */
  readonly onTokenRefreshed: (callback: (tokens: TokenPair) => void) => () => void
}

/** API client 生命周期能力。 */
export interface ApiClientLifecycle {
  /**
   * 初始化 client；必须在调用任何 procedure 前完成。
   *
   * @example
   * ```ts
   * await client.init({
   *   baseUrl: 'https://api.example.com/api/v1',
   *   auth: { refreshPath: '/auth/refresh' },
   *   timeout: 15_000,
   * })
   * ```
   */
  readonly init: (config: ApiClientConfig) => Promise<HaiResult<void>>
  /** 释放资源并允许重新 `init`。 */
  readonly close: () => Promise<void>
  /** 当前运行配置；未初始化时为 `null`。 */
  readonly config: ApiClientConfig | null
  /** 是否已完成初始化。 */
  readonly isInitialized: boolean
  /** Token 辅助操作。 */
  readonly auth: ApiClientAuth
}

/** 根据 oRPC contract 推导出的 typed API client（生命周期 + procedure 调用）。 */
export type ApiClient<TContract extends AnyContractRouter>
  = ApiClientLifecycle & JsonifiedClient<ContractRouterClient<TContract>>
