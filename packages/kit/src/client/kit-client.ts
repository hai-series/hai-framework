/**
 * @h-ai/kit — 统一客户端
 *
 * 合并 CSRF Token 附加与传输加密为一个透明的 fetch 函数。 应用层只需调用一次 `createKitClient()`，后续所有 API 调用 自动完成 CSRF + 加密，业务代码无需感知。
 * @module kit-client
 */

import type { EncryptedPayload, TransportCryptoServiceLike, TransportKeyPair } from '../modules/crypto/kit-crypto-types.js'
import { isValidEncryptedPayload } from '../modules/crypto/kit-transport-encryption.js'

// ─── 类型 ───

/**
 * 传输加密客户端配置
 */
export interface ClientTransportConfig {
  /** 传输加密服务实例（@h-ai/crypto 的 asymmetric + symmetric） */
  crypto: TransportCryptoServiceLike
  /** 密钥交换端点 URL（默认 `'/api/kit/key-exchange'`） */
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
}

/**
 * Kit 客户端实例
 */
export interface KitClient {
  /** 统一 API fetch（自动 CSRF + 传输加密） */
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
  } = config

  // ── 传输加密状态 ──
  let transportReady = false
  let clientKeyPair: TransportKeyPair | null = null
  let serverPublicKey: string | null = null
  let clientId: string | null = null
  /** 密钥交换锁，防止并发 init */
  let initPromise: Promise<void> | null = null

  /**
   * 执行密钥交换
   */
  async function doKeyExchange(): Promise<void> {
    if (!transportConfig)
      return

    const { crypto: cryptoService, keyExchangeUrl = '/api/kit/key-exchange' } = transportConfig

    // 1. 生成客户端非对称密钥对
    const keyPairResult = cryptoService.asymmetric.generateKeyPair()
    if (!keyPairResult.success || !keyPairResult.data) {
      throw new Error('Failed to generate client key pair')
    }
    clientKeyPair = keyPairResult.data

    // 2. 与服务端交换公钥
    const response = await fetch(keyExchangeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientPublicKey: clientKeyPair.publicKey }),
    })

    if (!response.ok) {
      throw new Error(`Key exchange failed: ${response.status}`)
    }

    const data = await response.json() as { serverPublicKey?: string, clientId?: string }
    if (!data.serverPublicKey || !data.clientId) {
      throw new Error('Invalid key exchange response')
    }

    serverPublicKey = data.serverPublicKey
    clientId = data.clientId
    transportReady = true
  }

  /**
   * 确保密钥交换完成（lazy init + 单例锁）
   */
  async function ensureTransportReady(): Promise<void> {
    if (transportReady)
      return
    if (!initPromise) {
      initPromise = doKeyExchange().finally(() => {
        initPromise = null
      })
    }
    await initPromise
  }

  /**
   * 加密请求体
   */
  function encryptBody(bodyText: string): string {
    if (!transportConfig || !serverPublicKey)
      return bodyText

    const { crypto: cryptoService } = transportConfig

    // 1. 生成随机对称密钥
    const symmetricKey = cryptoService.symmetric.generateKey()

    // 2. 对称加密内容
    const encResult = cryptoService.symmetric.encryptWithIV(bodyText, symmetricKey)
    if (!encResult.success || !encResult.data) {
      throw new Error('Request body encryption failed')
    }

    // 3. 非对称加密对称密钥
    const keyEncResult = cryptoService.asymmetric.encrypt(symmetricKey, serverPublicKey)
    if (!keyEncResult.success || !keyEncResult.data) {
      throw new Error('Symmetric key encryption failed')
    }

    const payload: EncryptedPayload = {
      encryptedKey: keyEncResult.data,
      ciphertext: encResult.data.ciphertext,
      iv: encResult.data.iv,
    }

    return JSON.stringify(payload)
  }

  /**
   * 解密响应体
   */
  async function decryptResponse(response: Response): Promise<Response> {
    if (!clientKeyPair || !transportConfig)
      return response

    const encryptedBody = await response.json() as unknown
    if (!isValidEncryptedPayload(encryptedBody))
      return response

    const { crypto: cryptoService } = transportConfig

    // 1. 非对称解密对称密钥
    const keyDecResult = cryptoService.asymmetric.decrypt(encryptedBody.encryptedKey, clientKeyPair.privateKey)
    if (!keyDecResult.success || !keyDecResult.data) {
      throw new Error('Response key decryption failed')
    }

    // 2. 对称解密内容
    const decResult = cryptoService.symmetric.decryptWithIV(encryptedBody.ciphertext, keyDecResult.data, encryptedBody.iv)
    if (!decResult.success || typeof decResult.data !== 'string') {
      throw new Error('Response body decryption failed')
    }

    return new Response(decResult.data, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }

  /**
   * 统一 API fetch
   */
  async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase()
    const isWriteMethod = !['GET', 'HEAD', 'OPTIONS'].includes(method)

    const headers = new Headers(init.headers)

    // ── CSRF ──
    if (isWriteMethod) {
      const csrfToken = getCookie(csrfCookieName)
      if (csrfToken) {
        headers.set(csrfHeaderName, csrfToken)
      }
    }

    // ── 传输加密 ──
    if (transportConfig) {
      await ensureTransportReady()

      if (clientId) {
        headers.set('X-Client-Id', clientId)
      }

      // 加密请求体（写方法且有 body 时）
      if (init.body !== undefined && init.body !== null) {
        const bodyText = typeof init.body === 'string' ? init.body : JSON.stringify(init.body)
        const encrypted = encryptBody(bodyText)
        headers.set('Content-Type', 'application/json')

        let response = await fetch(url, { ...init, headers, body: encrypted })

        // 解密响应
        if (response.headers.get('X-Encrypted') === 'true') {
          response = await decryptResponse(response)
        }

        return response
      }
    }

    // ── 发送 ──
    let response = await fetch(url, { ...init, headers })

    // ── 解密响应（GET/无 body 写请求也可能有加密响应） ──
    if (transportConfig && response.headers.get('X-Encrypted') === 'true') {
      response = await decryptResponse(response)
    }

    return response
  }

  return {
    apiFetch,
    get ready() { return !transportConfig || transportReady },
    async init() {
      if (transportConfig)
        await ensureTransportReady()
    },
    destroy() {
      clientKeyPair = null
      serverPublicKey = null
      clientId = null
      transportReady = false
      initPromise = null
    },
  }
}
