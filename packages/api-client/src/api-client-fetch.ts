/**
 * @h-ai/api-client — 核心 fetch 封装
 *
 * 请求/响应拦截器链、超时控制、Token 自动附加、401 自动刷新重试。
 * @module api-client-fetch
 */

import type { Result } from '@h-ai/core'
import type { TokenManager } from './api-client-auth.js'
import type {
  ApiClientConfig,
  ApiClientError,
  RequestConfig,
  RequestInterceptor,
  ResponseInterceptor,
  UploadOptions,
} from './api-client-types.js'
import { ok } from '@h-ai/core'
import { networkErrorToResult, responseToError } from './api-client-error.js'

/** 默认超时 30s */
const DEFAULT_TIMEOUT = 30_000

/**
 * 创建核心请求函数
 *
 * 封装 fetch 请求，集成：
 * - 请求/响应拦截器链
 * - 超时控制（AbortController）
 * - Token 自动附加（Authorization: Bearer）
 * - 401 自动刷新 + 重试（一次）
 *
 * @param config - ApiClient 配置
 * @param tokenManager - Token 管理器（可选）
 * @returns 请求函数集合
 */
export function createFetchClient(
  config: ApiClientConfig,
  tokenManager?: TokenManager,
) {
  const fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis)
  const timeout = config.timeout ?? DEFAULT_TIMEOUT
  const requestInterceptors: RequestInterceptor[] = config.interceptors?.request ?? []
  const responseInterceptors: ResponseInterceptor[] = config.interceptors?.response ?? []

  /**
   * 构建完整 URL
   */
  function buildUrl(path: string, params?: Record<string, unknown>): string {
    const base = config.baseUrl.replace(/\/+$/, '')
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    const url = new URL(`${base}${normalizedPath}`)

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value))
        }
      }
    }

    return url.toString()
  }

  /**
   * 执行请求（含拦截器、超时、Token、401 重试）
   */
  async function execute<T>(
    requestConfig: RequestConfig,
    retryOnUnauthorized = true,
  ): Promise<Result<T, ApiClientError>> {
    // 1. Token 注入
    if (tokenManager) {
      const accessToken = await tokenManager.storage.getAccessToken()
      if (accessToken) {
        requestConfig.headers.Authorization = `Bearer ${accessToken}`
      }
    }

    // 2. 请求拦截器
    let finalConfig = requestConfig
    for (const interceptor of requestInterceptors) {
      finalConfig = await interceptor(finalConfig)
    }

    // 3. 超时控制
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    finalConfig.signal = controller.signal

    try {
      let response = await fetchFn(finalConfig.url, {
        method: finalConfig.method,
        headers: finalConfig.headers,
        body: finalConfig.body,
        signal: finalConfig.signal,
      })

      clearTimeout(timeoutId)

      // 4. 响应拦截器
      for (const interceptor of responseInterceptors) {
        response = await interceptor(response)
      }

      // 5. 401 自动刷新 + 重试
      if (response.status === 401 && retryOnUnauthorized && tokenManager) {
        const tokens = await tokenManager.refresh()
        if (tokens) {
          // 用新 Token 重试一次
          requestConfig.headers.Authorization = `Bearer ${tokens.accessToken}`
          return execute<T>(requestConfig, false)
        }
      }

      // 6. 错误处理
      if (!response.ok) {
        return responseToError(response)
      }

      // 7. 解析成功响应
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        const body = await response.json() as { data?: T, success?: boolean }
        // 兼容标准 Result 响应格式 { success, data }
        if (body && typeof body === 'object' && 'data' in body) {
          return ok(body.data as T)
        }
        return ok(body as T)
      }

      // 非 JSON 响应（204 No Content 等）
      return ok(undefined as T)
    }
    catch (cause) {
      clearTimeout(timeoutId)
      return networkErrorToResult(cause)
    }
  }

  // ─── 通用 HTTP 方法 ───

  async function get<T>(path: string, params?: Record<string, unknown>): Promise<Result<T, ApiClientError>> {
    return execute<T>({
      url: buildUrl(path, params),
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
  }

  async function post<T>(path: string, body?: unknown): Promise<Result<T, ApiClientError>> {
    return execute<T>({
      url: buildUrl(path),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  async function put<T>(path: string, body?: unknown): Promise<Result<T, ApiClientError>> {
    return execute<T>({
      url: buildUrl(path),
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  async function patch<T>(path: string, body?: unknown): Promise<Result<T, ApiClientError>> {
    return execute<T>({
      url: buildUrl(path),
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  async function del<T>(path: string): Promise<Result<T, ApiClientError>> {
    return execute<T>({
      url: buildUrl(path),
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    })
  }

  // ─── 文件上传 ───

  async function upload(
    path: string,
    file: File | Blob,
    options?: UploadOptions,
  ): Promise<Result<unknown, ApiClientError>> {
    const formData = new FormData()
    formData.append(options?.fieldName ?? 'file', file)

    if (options?.extraFields) {
      for (const [key, value] of Object.entries(options.extraFields)) {
        formData.append(key, value)
      }
    }

    return execute({
      url: buildUrl(path),
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData as unknown as string, // FormData 走浏览器原生 multipart
    })
  }

  // ─── 流式请求 ───

  async function* stream(path: string, body?: unknown): AsyncIterable<string> {
    const requestConfig: RequestConfig = {
      url: buildUrl(path),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }

    // Token 注入
    if (tokenManager) {
      const accessToken = await tokenManager.storage.getAccessToken()
      if (accessToken) {
        requestConfig.headers.Authorization = `Bearer ${accessToken}`
      }
    }

    // 请求拦截器
    let finalConfig = requestConfig
    for (const interceptor of requestInterceptors) {
      finalConfig = await interceptor(finalConfig)
    }

    const response = await fetchFn(finalConfig.url, {
      method: finalConfig.method,
      headers: finalConfig.headers,
      body: finalConfig.body,
    })

    if (!response.ok || !response.body) {
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done)
          break

        const text = decoder.decode(value, { stream: true })
        // 按 SSE 格式解析 data: 行
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data !== '[DONE]') {
              yield data
            }
          }
        }
      }
    }
    finally {
      reader.releaseLock()
    }
  }

  return { get, post, put, patch, delete: del, upload, stream, execute, buildUrl }
}

/** Fetch Client 类型 */
export type FetchClient = ReturnType<typeof createFetchClient>
