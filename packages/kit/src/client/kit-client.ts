/**
 * @h-ai/kit — 统一客户端
 *
 * 将 CSRF Token 附加与可选传输加密封装为统一 `apiFetch`。
 * 应用层只需调用一次 `createKitClient()`，后续 API 调用即可复用同一套安全能力。
 * @module kit-client
 */

import type { CryptoFunctions, TransportClient } from '@h-ai/crypto'
import type { BrowserTokenStore } from '../kit-auth.js'
import { TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { createTokenStore } from '../kit-auth.js'

const DEFAULT_KEY_EXCHANGE_URL = `/api${TRANSPORT_PROTOCOL.DEFAULT_KEY_EXCHANGE_PATH}`

// ─── 类型 ───

/**
 * 传输加密客户端配置
 */
export interface ClientTransportConfig {
  /** @h-ai/crypto 服务实例 */
  crypto: CryptoFunctions
  /** 密钥交换端点 URL（默认 `'/api/_hai/key-exchange'`） */
  keyExchangeUrl?: string
}

/**
 * Kit 客户端配置
 */
export interface KitClientConfig {
  /**
   * 传输加密配置。
   * - 不提供 / undefined：不启用传输加密，仅 CSRF
   * - 提供对象：启用传输加密
   */
  transport?: ClientTransportConfig
  /** CSRF Cookie 名称（默认 `'hai_csrf'`） */
  csrfCookieName?: string
  /** CSRF Header 名称（默认 `'X-CSRF-Token'`） */
  csrfHeaderName?: string
  /**
   * 认证配置：自动从浏览器存储读取 Access Token 并注入请求头。
   * - `true`：使用默认 localStorage 存储（key = `hai_access_token`）
   * - `BrowserTokenStore`：使用自定义存储
   * - 不提供 / `false`：不自动注入
   */
  auth?: boolean | BrowserTokenStore
}

/**
 * Kit 客户端实例
 */
export interface KitClient {
  /** 统一 API fetch（写请求自动附加 CSRF，启用 transport 时自动加解密） */
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>
  /** 传输加密是否就绪（未启用传输加密时始终为 true） */
  readonly ready: boolean
  /** 手动触发密钥交换（transport 启用时） */
  init: () => Promise<void>
  /** 销毁密钥状态 */
  destroy: () => void
}

// ─── 工具函数 ───

/**
 * 从 document.cookie 中读取指定名称的 Cookie 值
 *
 * @param name - Cookie 名称
 * @returns Cookie 值；不存在或运行在服务端时返回 undefined
 */
function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined')
    return undefined
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match?.[1]
}

/**
 * 判断当前请求体是否可以作为文本载荷进行传输加密。
 *
 * 传输加密中间件会把解密后的明文重新注入 `Request`，当前仅能可靠保留
 * JSON 字符串请求体。`FormData` / `Blob` / `ArrayBuffer` 等二进制或浏览器
 * 自动生成边界的请求体必须保持原样发送，否则文件上传会被序列化成 `{}`。
 *
 * @param body fetch 请求体
 * @returns 是否支持客户端传输加密
 */
function canEncryptRequestBody(body: BodyInit | null | undefined): boolean {
  return body === undefined || body === null || typeof body === 'string'
}

// ─── 主函数 ───

/**
 * 创建 Kit 客户端
 *
 * 返回统一的 `apiFetch`，内部自动完成：
 * 1. CSRF Token 附加（写方法自动读取 Cookie + 设置 Header）
 * 2. 密钥交换（首次写请求时 lazy init，transport 启用时）
 * 3. 请求体加密（transport 启用时）
 * 4. 响应体解密（transport 启用时）
 *
 * @param config - 客户端配置
 * @returns KitClient 实例
 *
 * @example
 * ```ts
 * const client = createKitClient({ transport: { crypto } })
 * const res = await client.apiFetch('/api/users', { method: 'POST', body: '{}' })
 * ```
 */
export function createKitClient(config: KitClientConfig = {}): KitClient {
  const {
    transport: transportConfig,
    csrfCookieName = 'hai_csrf',
    csrfHeaderName = 'X-CSRF-Token',
    auth: authConfig,
  } = config

  // ── Auth token store ──
  const authStore: BrowserTokenStore | null = authConfig
    ? (authConfig === true ? createTokenStore() : authConfig)
    : null

  // ── 传输加密状态 ──
  const transportClient: TransportClient | null = transportConfig
    ? transportConfig.crypto.transport.createClient({
        keyExchangeUrl: transportConfig.keyExchangeUrl ?? DEFAULT_KEY_EXCHANGE_URL,
        fetch,
      })
    : null

  /**
   * 统一 API fetch
   */
  async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase()
    const isWriteMethod = !['GET', 'HEAD', 'OPTIONS'].includes(method)
    const canUseTransport = canEncryptRequestBody(init.body)

    const headers = new Headers(init.headers)

    // ── Auth ──
    if (authStore) {
      const token = authStore.get()
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
    }

    // ── CSRF ──
    if (isWriteMethod) {
      const csrfToken = getCookie(csrfCookieName)
      if (csrfToken) {
        headers.set(csrfHeaderName, csrfToken)
      }
    }

    // ── 传输加密 ──
    if (transportClient && canUseTransport) {
      return transportClient.encryptedFetch(url, { ...init, headers })
    }

    // ── 发送（FormData/Blob/Stream 等保持原样，不破坏浏览器边界） ──
    return fetch(url, { ...init, headers })
  }

  return {
    apiFetch,
    get ready() { return !transportClient || transportClient.ready() },
    async init() {
      if (!transportClient)
        return
      const result = await transportClient.init()
      if (!result.success)
        throw new Error(result.error.message)
    },
    destroy() {
      transportClient?.destroy()
    },
  }
}
