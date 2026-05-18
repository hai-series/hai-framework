/**
 * @h-ai/api-client — 类型与错误码
 *
 * 公共类型（TokenPair、TokenStorage、ApiClientConfig 等）与标准错误集合（HaiApiClientError）。
 * 不包含实现，仅用于跨文件共享与对外导出。
 * @module api-client-types
 */

import type { ErrorInfo, HaiResult } from '@h-ai/core'
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
  /** 长期刷新凭证，仅 refresh 接口使用。 */
  readonly refreshToken: string
  /** accessToken 有效期秒数。 */
  readonly expiresIn: number
  /** 固定为 `'Bearer'`。 */
  readonly tokenType: 'Bearer'
}

/**
 * Token 存储适配器。
 *
 * 内置实现：
 * - `createHttpOnlyCookieTokenStorage()` — **默认**；浏览器端推荐，refresh token 由服务端管理，防 XSS。
 * - `createMemoryTokenStorage()` — Node.js 测试 / SSR（需显式传入）。
 * - `createLocalStorageTokenStorage()` — 浏览器 SPA / PWA（有 XSS 风险，生产不推荐）。
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
   * Token 存储适配器；默认 `createHttpOnlyCookieTokenStorage()`（refresh token 由服务端管理，防 XSS）。
   *
   * - SSR / Node.js 测试场景请显式传入 `createMemoryTokenStorage()`。
   * - 浏览器 SPA 如确需持久化，可显式传 `createLocalStorageTokenStorage()`，
   *   但请先评估 XSS 风险。
   * - Capacitor / 小程序请使用对应平台的安全存储适配器（如 `@h-ai/capacitor`）。
   */
  readonly storage?: TokenStorage
  /** 刷新接口路径，相对于 `baseUrl`，默认 `/auth/refresh`。 */
  readonly refreshPath?: string
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
