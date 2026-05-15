/**
 * @h-ai/api-client — 类型定义
 *
 * oRPC/OpenAPI typed client、TokenStorage 与生命周期类型。
 * @module api-client-types
 */

import type { ErrorInfo, HaiResult } from '@h-ai/core'
import type { AnyContractRouter, ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import { core } from '@h-ai/core'

// ─── 错误定义（照 @h-ai/core 范式） ───

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

export const HaiApiClientError = core.error.buildHaiErrorsDef('api-client', ApiClientErrorInfo)

// ─── Token ───

/** Token 对（与 @h-ai/iam 的 TokenPair 对齐）。 */
export interface TokenPair {
  /** 短期访问凭证（请求时作为 Bearer token）。 */
  readonly accessToken: string
  /** 长期刷新凭证（不需要随请求头发送）。 */
  readonly refreshToken: string
  /** accessToken 有效期秒数。 */
  readonly expiresIn: number
  /** 授权类型，固定为 'Bearer'。 */
  readonly tokenType: 'Bearer'
}

/** Token 存储适配器。内置实现：`createLocalStorageTokenStorage`（浏览器）和 `createMemoryTokenStorage`（Node/测试）。 */
export interface TokenStorage {
  readonly getAccessToken: () => Promise<string | null>
  readonly setAccessToken: (token: string) => Promise<void>
  readonly getRefreshToken: () => Promise<string | null>
  readonly setRefreshToken: (token: string) => Promise<void>
  readonly clear: () => Promise<void>
}

/** Token 刷新配置。 */
export interface AuthConfig {
  /** Token 存储适配器，默认使用 localStorage。 */
  readonly storage?: TokenStorage
  /** 刷新 Token 接口路径，相对于 baseUrl，默认 `/auth/refresh`。 */
  readonly refreshPath?: string
  /** Token 刷新成功回调。 */
  readonly onTokenRefreshed?: (tokens: TokenPair) => void
  /** Token 刷新失败回调，可用于跳转登录页。 */
  readonly onRefreshFailed?: () => void
}

/** API client 初始化配置。 */
export interface ApiClientConfig {
  /** API service 的 base URL，包含 `apiPrefix`，如 `https://api.example.com/api/v1`。 */
  readonly baseUrl: string
  /** 认证配置，不传则不使用 Token 管理。 */
  readonly auth?: AuthConfig
  /** 请求超时（ms），默认 30000。 */
  readonly timeout?: number
  /** 客户端标识，用于 `x-request-client` 请求头，默认 `hai-api-client`。 */
  readonly clientName?: string
  /** 额外请求头，可为静态对象或异步工岂函数。 */
  readonly headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
  /** 自定义 fetch 实现，默认使用 `globalThis.fetch`；测试时可注入 mock。 */
  readonly fetch?: typeof globalThis.fetch
}

/** API client 认证辅助，提供手动操作 Token 的能力。 */
export interface ApiClientAuth {
  /** 主动写入 Token 对（如登录后手动设置）。 */
  readonly setTokens: (tokens: TokenPair) => Promise<void>
  /** 清除已存储的 Token（登出时使用）。 */
  readonly clear: () => Promise<void>
  /** 注册 Token 刷新成功回调，返回取消函数。 */
  readonly onTokenRefreshed: (callback: (tokens: TokenPair) => void) => () => void
}

/** API client 生命周期能力。 */
export interface ApiClientLifecycle {
  /**
   * 初始化 client，必须在调用任何 procedure 前调用。
   *
   * @param config - 客户端配置
   * @returns 初始化结果
   *
   * @example
   * ```ts
   * await api.init({
   *   baseUrl: 'https://api.example.com/api/v1',
   *   auth: { storage: createLocalStorageTokenStorage(), refreshPath: '/auth/refresh' },
   *   timeout: 15_000,
   * })
   * ```
   */
  readonly init: (config: ApiClientConfig) => Promise<HaiResult<void>>
  /** 释放资源并清空状态（可重新 init）。 */
  readonly close: () => Promise<void>
  /** 当前运行配置，未初始化时为 null。 */
  readonly config: ApiClientConfig | null
  /** 是否已完成初始化。 */
  readonly isInitialized: boolean
  /** Token 管理辅助对象。 */
  readonly auth: ApiClientAuth
}

/** 根据 oRPC contract 推导出的 typed API client。 */
export type ApiClient<TContract extends AnyContractRouter> = ApiClientLifecycle & JsonifiedClient<ContractRouterClient<TContract>>
