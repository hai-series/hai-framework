/**
 * @h-ai/kit — 统一客户端
 *
 * 将 CSRF Token 附加与可选传输加密封装为统一 `apiFetch`。
 * 应用层只需调用一次 `createKitClient()`，后续 API 调用即可复用同一套安全能力。
 * @module kit-client
 */

import type { CryptoFunctions, TransportClient } from '@h-ai/crypto'
import type { BrowserTokenStore } from '../kit-auth.js'
import type { KitConfig } from '../kit-config.js'
import { TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { getDefaultBrowserTokenStore } from '../kit-auth.js'
import { DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH, resolveTransportPath, shouldUseTransportForUrl } from '../modules/crypto/kit-transport-paths.js'

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
  /** 排除路径（命中后强制走明文），需与服务端 transport.excludePaths 保持一致 */
  excludePaths?: string[]
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
   * - `true`：使用默认页面内存存储（由 `kit.auth.setBrowserToken()` 写入，不读写 localStorage）
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
  /**
   * 手动触发密钥交换（transport 启用时）。
   *
   * 注意：本方法是 Client 形态的合规例外，密钥协商失败时 `throw`（与 `@h-ai/api-client` 一致），
   * 调用方需自行 `try/catch`，不返回 `HaiResult`。
   */
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

/**
 * 判断全局 fetch 包装路径下，某个 `Request` 是否可走传输加密。
 *
 * 与上方 {@link canEncryptRequestBody} 区别：本谓词服务于 {@link installBrowserTransportFetch}
 * 的全局包装路径，输入是完整 `Request`，故可基于 method（GET/HEAD 无 body 安全放行）与
 * `Content-Type`（仅 JSON 可重注入明文）综合判定；而 `canEncryptRequestBody` 服务于
 * `createKitClient` 的 `apiFetch` 路径，仅拿到 `BodyInit`，只能按 body 类型粗判。
 * 两者判定维度不同是有意为之，请勿合并。
 */
function canUseTransportForRequest(request: Request): boolean {
  const method = request.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD') {
    return true
  }

  const headers = new Headers(request.headers)
  const contentType = headers.get('Content-Type') ?? ''
  if (contentType.includes('application/json')) {
    return true
  }

  return request.body === null
}

function getCurrentOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  return 'http://localhost'
}

function toRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  if (input instanceof Request)
    return init ? new Request(input, init) : input

  return new Request(input, init)
}

type BrowserTransportFetchState = typeof globalThis & {
  __haiKitOriginalFetch?: typeof fetch
  __haiKitTransportFetchInstalled?: boolean
}

/**
 * 在浏览器启动时安装同源 transport fetch 包装。
 *
 * 该包装作用于同源 `/api/*` 与 SvelteKit `__data.json` 请求，页面文档、
 * 静态资源以及 multipart/form-data 等上传请求保持原样。应用只需安装一次，
 * 后续 `fetch` / SvelteKit 内部 data fetch / `kit.client.create()` 明文发送路径
 * 都会共用这层传输加密能力。
 */
export function installBrowserTransportFetch(transportConfig?: ClientTransportConfig): void {
  if (typeof window === 'undefined' || !transportConfig)
    return

  const fetchState = globalThis as BrowserTransportFetchState
  if (fetchState.__haiKitTransportFetchInstalled)
    return

  const originalFetch = fetchState.__haiKitOriginalFetch ?? globalThis.fetch.bind(globalThis)
  fetchState.__haiKitOriginalFetch = originalFetch

  const origin = getCurrentOrigin()
  const keyExchangeUrl = new URL(transportConfig.keyExchangeUrl ?? DEFAULT_KEY_EXCHANGE_URL, origin).toString()
  const keyExchangePath = resolveTransportPath(keyExchangeUrl, origin)
  const transportClient = transportConfig.crypto.transport.createClient({
    keyExchangeUrl,
    fetch: originalFetch,
  })

  const wrappedFetch: typeof fetch = async (input, init) => {
    const request = toRequest(input, init)
    const requestUrl = new URL(request.url, origin)
    const headers = new Headers(request.headers)

    if (!shouldUseTransportForUrl(requestUrl, {
      origin,
      keyExchangePath,
      excludePaths: transportConfig.excludePaths,
    })) {
      return originalFetch(input, init)
    }

    if (headers.has(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER))
      return originalFetch(input, init)

    if (!canUseTransportForRequest(request))
      return originalFetch(input, init)

    return transportClient.encryptedFetch(request)
  }

  globalThis.fetch = wrappedFetch
  window.fetch = wrappedFetch
  fetchState.__haiKitTransportFetchInstalled = true
}

/**
 * 用 `config/_kit.yml` 解析后的 {@link KitConfig} 一次性安装浏览器端传输加密。
 *
 * 行为：
 * - `config.transport === false` 时直接返回（不启用传输加密）；
 * - 否则启动 {@link installBrowserTransportFetch}，并预热 {@link CryptoFunctions} 模块。
 *
 * 应用层（SvelteKit `+layout.svelte` 或浏览器入口）只需调用此函数一次，
 * 之后所有同源 `/api/*` 与 `__data.json` 请求都会自动走传输加密。
 *
 * @param config 已解析的 kit 顶层配置
 * @param deps  外部依赖
 * @param deps.crypto `@h-ai/crypto` 模块实例
 *
 * @example
 * ```ts
 * import { browser } from '$app/environment'
 * import { crypto } from '@h-ai/crypto'
 * import { kit } from '@h-ai/kit'
 * import { adminConsoleKitConfig } from '$lib/config/kit-config.js'
 *
 * if (browser) {
 *   kit.client.installBrowserTransport(adminConsoleKitConfig, { crypto })
 * }
 * ```
 */
export function installBrowserTransport(
  config: KitConfig,
  deps: { crypto: CryptoFunctions },
): void {
  if (typeof window === 'undefined' || config.transport === false)
    return

  // crypto.init() 当前为同步副作用（signature 是 async 仅为接口一致性），
  // 此处不 await，以便 `+layout.svelte` 顶层模块加载阶段就完成初始化。
  void deps.crypto.init()

  installBrowserTransportFetch({
    crypto: deps.crypto,
    keyExchangeUrl: config.transport.keyExchangePath,
    excludePaths: [...config.transport.excludePaths],
  })
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
  // 安全默认：auth:true 只读取页面内存 token，避免隐式 localStorage 持久化敏感凭证。
  const authStore: BrowserTokenStore | null = authConfig
    ? (authConfig === true ? getDefaultBrowserTokenStore() : authConfig)
    : null

  // ── 传输加密状态 ──
  const transportOrigin = getCurrentOrigin()
  const transportKeyExchangeUrl = transportConfig?.keyExchangeUrl ?? DEFAULT_KEY_EXCHANGE_URL
  const transportKeyExchangePath = transportConfig
    ? resolveTransportPath(transportKeyExchangeUrl, transportOrigin)
    : DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH
  const transportClient: TransportClient | null = transportConfig
    ? transportConfig.crypto.transport.createClient({
        keyExchangeUrl: transportKeyExchangeUrl,
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
    if (
      transportClient
      && canUseTransport
      && shouldUseTransportForUrl(url, {
        origin: transportOrigin,
        keyExchangePath: transportKeyExchangePath,
        excludePaths: transportConfig?.excludePaths,
      })
    ) {
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
