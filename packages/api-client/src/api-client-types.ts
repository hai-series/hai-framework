/**
 * @h-ai/api-client — 类型定义
 *
 * 通用 HTTP 客户端的公共类型、EndpointDef 契约接口、
 * TokenStorage 适配器接口等。
 * @module api-client-types
 */

import type { Result } from '@h-ai/core'
import type { z } from 'zod'
import type { ApiClientError } from './api-client-config.js'

// ─── API 契约 ───

/**
 * API 端点契约定义
 *
 * 描述单个 API 端点的 HTTP 方法、路径、入参/出参 Schema 与元数据。
 * 客户端通过 `api.call(endpoint, input)` 调用，服务端通过
 * `kit.fromContract(endpoint, handler)` 响应，两端共享同一份契约。
 *
 * @typeParam TInput - 入参类型（由 Zod Schema 推导）
 * @typeParam TOutput - 出参类型（由 Zod Schema 推导）
 *
 * @example
 * ```ts
 * const loginEndpoint: EndpointDef<LoginInput, LoginOutput> = {
 *   method: 'POST',
 *   path: '/auth/login',
 *   input: LoginInputSchema,
 *   output: LoginOutputSchema,
 *   requireAuth: false,
 * }
 * ```
 */
export interface EndpointDef<
  TInput = unknown,
  TOutput = unknown,
> {
  /** HTTP 方法 */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  /** 相对路径（相对于 API 前缀，如 '/auth/login'） */
  path: string
  /** 入参 Zod Schema（GET 请求为 query params，其他为 body） */
  input: z.ZodType<TInput>
  /** 出参 Zod Schema */
  output: z.ZodType<TOutput>
  /** 是否需要认证（默认 true） */
  requireAuth?: boolean
  /** OpenAPI 描述元数据 */
  meta?: {
    summary?: string
    tags?: string[]
  }
}

// ─── Token ───

/**
 * Token 对（与 @h-ai/iam 的 TokenPair 对齐）
 */
export interface TokenPair {
  /** Access Token */
  accessToken: string
  /** Refresh Token */
  refreshToken: string
  /** 过期时间（秒） */
  expiresIn: number
  /** Token 类型 */
  tokenType: 'Bearer'
}

/**
 * Token 存储适配器
 *
 * 可插拔存储后端（localStorage / memory / Capacitor Preferences / 自定义）。
 */
export interface TokenStorage {
  /** 获取 Access Token */
  getAccessToken: () => Promise<string | null>
  /** 设置 Access Token */
  setAccessToken: (token: string) => Promise<void>
  /** 获取 Refresh Token */
  getRefreshToken: () => Promise<string | null>
  /** 设置 Refresh Token */
  setRefreshToken: (token: string) => Promise<void>
  /** 清空所有 Token */
  clear: () => Promise<void>
}

// ─── 拦截器 ───

/**
 * 请求配置（传递给拦截器）
 */
export interface RequestConfig {
  /** 完整 URL */
  url: string
  /** HTTP 方法 */
  method: string
  /** 请求头 */
  headers: Record<string, string>
  /** 请求体（已序列化） */
  body?: string | FormData
  /** 信号（abort） */
  signal?: AbortSignal
}

/** 请求拦截器 */
export type RequestInterceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>

/** 响应拦截器 */
export type ResponseInterceptor = (response: Response) => Response | Promise<Response>

// ─── 配置 ───

/**
 * Token 刷新配置
 */
export interface AuthConfig {
  /** Token 存储适配器（默认 createMemoryTokenStorage，持久化需显式传入） */
  storage?: TokenStorage
  /** Refresh Token 接口路径（相对于 baseUrl） */
  refreshUrl: string
  /** Token 刷新回调 */
  onTokenRefreshed?: (tokens: TokenPair) => void
  /** Token 刷新失败回调（通常用于跳转登录页） */
  onRefreshFailed?: () => void
}

/**
 * ApiClient 配置
 */
export interface ApiClientConfig {
  /** API 基础 URL（如 https://api.example.com/api/v1） */
  baseUrl: string
  /** Token 认证配置（省略则不启用自动 Token 管理） */
  auth?: AuthConfig
  /** 请求超时（毫秒，默认 30000） */
  timeout?: number
  /** 拦截器 */
  interceptors?: {
    request?: RequestInterceptor[]
    response?: ResponseInterceptor[]
  }
  /** 自定义 fetch 实现（用于测试或特殊环境） */
  fetch?: typeof globalThis.fetch
}

// ─── 上传选项 ───

/**
 * 文件上传选项
 */
export interface UploadOptions {
  /** 文件字段名（默认 'file'） */
  fieldName?: string
  /** 附加表单字段 */
  extraFields?: Record<string, string>
}

/**
 * 流式请求选项
 */
export interface StreamOptions {
  /** 外部取消信号（例如 AbortController.signal） */
  signal?: AbortSignal
}

// ─── ApiClient 接口 ───

/**
 * Api Client 实例接口
 *
 * 提供通用 HTTP 方法和契约调用能力。
 */
export interface ApiClient {
  /** GET 请求 */
  get: <T>(path: string, params?: Record<string, unknown>) => Promise<Result<T, ApiClientError>>
  /** POST 请求 */
  post: <T>(path: string, body?: unknown) => Promise<Result<T, ApiClientError>>
  /** PUT 请求 */
  put: <T>(path: string, body?: unknown) => Promise<Result<T, ApiClientError>>
  /** PATCH 请求 */
  patch: <T>(path: string, body?: unknown) => Promise<Result<T, ApiClientError>>
  /** DELETE 请求 */
  delete: <T>(path: string, params?: Record<string, unknown>) => Promise<Result<T, ApiClientError>>

  /** 文件上传 */
  upload: (path: string, file: File | Blob, options?: UploadOptions) => Promise<Result<unknown, ApiClientError>>

  /** 流式请求（返回 AsyncIterable） */
  stream: (path: string, body?: unknown, options?: StreamOptions) => AsyncIterable<string>

  /**
   * 契约调用（推荐）
   *
   * 基于 EndpointDef 发起请求，路径、方法、入参、出参类型全由契约保证。
   */
  call: <TInput, TOutput>(
    endpoint: EndpointDef<TInput, TOutput>,
    input: TInput,
  ) => Promise<Result<TOutput, ApiClientError>>

  /** Token 管理 */
  auth: {
    /** 设置 Token */
    setTokens: (tokens: TokenPair) => Promise<void>
    /** 清空 Token */
    clear: () => Promise<void>
    /** Token 刷新回调，返回取消订阅函数 */
    onTokenRefreshed: (callback: (tokens: TokenPair) => void) => () => void
  }
}

/**
 * 辅助函数：创建端点定义（获得类型推导）
 *
 * @example
 * ```ts
 * const login = defineEndpoint({
 *   method: 'POST',
 *   path: '/auth/login',
 *   input: LoginInputSchema,
 *   output: LoginOutputSchema,
 *   requireAuth: false,
 * })
 * ```
 */
export function defineEndpoint<TInput, TOutput>(
  def: EndpointDef<TInput, TOutput>,
): EndpointDef<TInput, TOutput> {
  return def
}

// ─── ApiClientFunctions ───

/**
 * API 客户端函数接口（单例模式）
 *
 * 统一的 API 客户端访问入口：
 * - `api.init(config)` — 初始化客户端
 * - `api.close()` — 关闭客户端并释放资源
 * - `api.get / post / put / patch / delete` — 通用 HTTP 方法
 * - `api.call(endpoint, input)` — 契约调用
 * - `api.upload(path, file)` — 文件上传
 * - `api.stream(path, body)` — 流式请求
 * - `api.auth` — Token 管理
 * - `api.config` — 当前配置（未初始化时为 null）
 * - `api.isInitialized` — 初始化状态
 */
export interface ApiClientFunctions {
  /**
   * 初始化 API 客户端
   *
   * 已有实例时会先 close 再重新初始化。
   *
   * @param config - 客户端配置
   * @returns 成功 ok(undefined)；失败返回 err（含 ApiClientError）
   */
  init: (config: ApiClientConfig) => Promise<Result<void, ApiClientError>>

  /**
   * 关闭 API 客户端并释放资源
   *
   * 重复调用不会报错。
   */
  close: () => Promise<void>

  /** 当前客户端配置；未初始化或已关闭时为 null */
  readonly config: ApiClientConfig | null

  /** 是否已完成初始化 */
  readonly isInitialized: boolean

  /** GET 请求 */
  readonly get: ApiClient['get']
  /** POST 请求 */
  readonly post: ApiClient['post']
  /** PUT 请求 */
  readonly put: ApiClient['put']
  /** PATCH 请求 */
  readonly patch: ApiClient['patch']
  /** DELETE 请求 */
  readonly delete: ApiClient['delete']
  /** 文件上传 */
  readonly upload: ApiClient['upload']

  /**
   * 流式请求（返回 AsyncIterable）
   *
   * @throws 未初始化时抛出异常（async generator 无法返回 Result）
   */
  readonly stream: ApiClient['stream']

  /** 契约调用（推荐） */
  readonly call: ApiClient['call']

  /** Token 管理 */
  readonly auth: ApiClient['auth']
}
