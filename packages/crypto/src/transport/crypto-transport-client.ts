/**
 * @h-ai/crypto — 传输加密客户端实现
 *
 * 提供浏览器 / Node 环境下使用的 `encryptedFetch` 包装：
 * - 首次调用前自动与服务端做一次密钥协商；
 * - 之后所有出站请求自动以混合加密包裹；
 * - 标记为 `X-Encrypted: true` 的响应自动解密。
 *
 * 与服务端协议常量统一来自 {@link TRANSPORT_PROTOCOL}，确保不漂移。
 *
 * @module crypto-transport-client
 */

import type { HaiResult } from '@h-ai/core'
import type {
  EncryptedPayload,
  KeyExchangeResponse,
  TransportClient,
  TransportCryptoServiceLike,
  TransportKeyPair,
} from './crypto-transport-types.js'
import { err, HaiCommonError, ok } from '@h-ai/core'
import { TRANSPORT_PROTOCOL } from './crypto-transport-types.js'

/** {@link createTransportClient} 的配置项。 */
export interface CreateTransportClientOptions {
  /** 加密能力实现（通常直接传 `crypto` 实例）。 */
  crypto: TransportCryptoServiceLike
  /** 密钥协商完整 URL，例如 `https://api.example.com/_hai/key-exchange`。 */
  keyExchangeUrl: string
  /**
   * 实际发送 HTTP 请求的 fetch 实现；默认使用全局 `fetch`。
   *
   * 在测试中可注入 mock；在 Node < 18 环境中需注入 polyfill。
   */
  fetch?: typeof fetch
}

/**
 * 创建传输加密客户端。
 *
 * 返回的 `encryptedFetch` 与全局 `fetch` 同签名，可直接替换业务代码中的 `fetch`。
 * 内部首次请求前会自动完成密钥协商（线程安全；并发请求只触发一次协商）。
 */
export function createTransportClient(options: CreateTransportClientOptions): TransportClient {
  const baseFetch = options.fetch ?? fetch
  let keyPair: TransportKeyPair | null = null
  let serverPublicKey: string | null = null
  let clientId: string | null = null
  /** 进行中的协商 Promise；用于并发去重。 */
  let initPromise: Promise<HaiResult<void>> | null = null

  async function doInit(): Promise<HaiResult<void>> {
    const kpResult = options.crypto.asymmetric.generateKeyPair()
    if (!kpResult.success)
      return err(HaiCommonError.INTERNAL_ERROR, 'Failed to generate client key pair', kpResult.error)
    const localKeyPair = kpResult.data

    let response: Response
    try {
      response = await baseFetch(options.keyExchangeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientPublicKey: localKeyPair.publicKey }),
      })
    }
    catch (cause) {
      return err(HaiCommonError.INTERNAL_ERROR, 'Key exchange request failed', cause)
    }

    if (!response.ok)
      return err(HaiCommonError.INTERNAL_ERROR, `Key exchange returned HTTP ${response.status}`)

    let body: KeyExchangeResponse
    try {
      body = await response.json() as KeyExchangeResponse
    }
    catch (cause) {
      return err(HaiCommonError.INTERNAL_ERROR, 'Key exchange response is not valid JSON', cause)
    }
    if (!body.serverPublicKey || !body.clientId)
      return err(HaiCommonError.INTERNAL_ERROR, 'Key exchange response missing fields')

    keyPair = localKeyPair
    serverPublicKey = body.serverPublicKey
    clientId = body.clientId
    return ok(undefined)
  }

  async function ensureReady(): Promise<HaiResult<void>> {
    if (clientId && serverPublicKey)
      return ok(undefined)
    if (!initPromise) {
      initPromise = doInit().then((result) => {
        // 失败时清空 promise，允许下次重试；成功时保留即可。
        if (!result.success)
          initPromise = null
        return result
      })
    }
    return initPromise
  }

  function encryptBody(plaintext: string): HaiResult<EncryptedPayload> {
    if (!serverPublicKey)
      return err(HaiCommonError.INTERNAL_ERROR, 'Transport client not initialized')
    const symKey = options.crypto.symmetric.generateKey()
    const encResult = options.crypto.symmetric.encryptWithIV(plaintext, symKey)
    if (!encResult.success)
      return err(HaiCommonError.INTERNAL_ERROR, 'Failed to encrypt request body', encResult.error)
    const keyEncResult = options.crypto.asymmetric.encrypt(symKey, serverPublicKey)
    if (!keyEncResult.success)
      return err(HaiCommonError.INTERNAL_ERROR, 'Failed to encrypt session key', keyEncResult.error)
    return ok({
      encryptedKey: keyEncResult.data,
      ciphertext: encResult.data.ciphertext,
      iv: encResult.data.iv,
    })
  }

  function decryptPayload(payload: EncryptedPayload): HaiResult<string> {
    if (!keyPair)
      return err(HaiCommonError.INTERNAL_ERROR, 'Transport client not initialized')
    const keyDec = options.crypto.asymmetric.decrypt(payload.encryptedKey, keyPair.privateKey)
    if (!keyDec.success)
      return err(HaiCommonError.INTERNAL_ERROR, 'Failed to decrypt session key', keyDec.error)
    const dec = options.crypto.symmetric.decryptWithIV(payload.ciphertext, keyDec.data, payload.iv)
    if (!dec.success)
      return err(HaiCommonError.INTERNAL_ERROR, 'Failed to decrypt response body', dec.error)
    return ok(dec.data)
  }

  const encryptedFetch: typeof fetch = async (input, init) => {
    // 密钥协商请求本身不加密，避免无限递归。
    const targetUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
    if (targetUrl === options.keyExchangeUrl)
      return baseFetch(input, init)

    const ready = await ensureReady()
    if (!ready.success)
      throw new Error(ready.error.message)

    // 复制并改造 init：附加 X-Client-Id；若有 body，则加密。
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER, clientId!)

    // 兼容 oRPC 等场景：body 可能在 Request 上而非 init.body。
    let rawBody: BodyInit | null | undefined = init?.body
    if (rawBody == null && input instanceof Request) {
      const method = (init?.method ?? input.method).toUpperCase()
      if (method !== 'GET' && method !== 'HEAD') {
        const text = await input.clone().text()
        if (text)
          rawBody = text
      }
    }

    let nextBody: BodyInit | null | undefined = rawBody
    if (rawBody != null) {
      const plaintext = await bodyToText(rawBody)
      const encResult = encryptBody(plaintext)
      if (!encResult.success)
        throw new Error(encResult.error.message)
      nextBody = JSON.stringify(encResult.data)
      headers.set('Content-Type', 'application/json')
      headers.set(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER, TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE)
    }

    // 当 input 是已带 body 的 Request 时，必须改用 URL 字符串作为 input，
    // 否则底层 fetch 会优先读取原始 Request 上的明文 body，覆盖我们的密文。
    const finalInput: RequestInfo | URL = input instanceof Request ? input.url : input
    const finalInit: RequestInit = {
      ...init,
      method: init?.method ?? (input instanceof Request ? input.method : undefined),
      headers,
      body: nextBody,
    }
    const response = await baseFetch(finalInput, finalInit)

    // 响应未加密：直接返回。
    if (response.headers.get(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER) !== TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE)
      return response

    const cloned = response.clone()
    let payload: unknown
    try {
      payload = await cloned.json()
    }
    catch {
      return response
    }
    if (!isEncryptedPayload(payload))
      return response

    const decResult = decryptPayload(payload)
    if (!decResult.success)
      throw new Error(decResult.error.message)

    // 透传原响应头但去掉加密标记；Content-Type 还原为下游可能期望的 JSON。
    const respHeaders = new Headers(response.headers)
    respHeaders.delete(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)
    respHeaders.delete('Content-Length')
    return new Response(decResult.data, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
    })
  }

  return {
    init: ensureReady,
    encryptedFetch,
    ready: () => clientId !== null && serverPublicKey !== null,
    destroy() {
      keyPair = null
      serverPublicKey = null
      clientId = null
      initPromise = null
    },
  }
}

/** 把任意 `BodyInit` 转为字符串明文，便于统一加密。 */
async function bodyToText(body: BodyInit): Promise<string> {
  if (typeof body === 'string')
    return body
  if (body instanceof URLSearchParams)
    return body.toString()
  if (body instanceof Blob)
    return body.text()
  if (body instanceof ArrayBuffer)
    return new TextDecoder().decode(body)
  if (ArrayBuffer.isView(body))
    return new TextDecoder().decode(body.buffer as ArrayBuffer)
  // FormData / ReadableStream：转为 Response 再读 text，由运行时序列化。
  return new Response(body as BodyInit).text()
}

function isEncryptedPayload(payload: unknown): payload is EncryptedPayload {
  if (!payload || typeof payload !== 'object')
    return false
  const p = payload as Record<string, unknown>
  return typeof p.encryptedKey === 'string' && typeof p.ciphertext === 'string' && typeof p.iv === 'string'
}
