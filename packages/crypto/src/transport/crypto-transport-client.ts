/**
 * @h-ai/crypto — 传输加密客户端实现
 *
 * 提供浏览器 / Node 环境下使用的 `encryptedFetch` 包装：
 * - 首次调用前自动与服务端做一次密钥协商；
 * - 之后所有出站请求自动以混合加密包裹；
 * - 验证响应关联、发送方签名与 MAC 后解密，缺少认证的响应拒绝。
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
  TransportMessageContext,
} from './crypto-transport-types.js'
import { err, HaiCommonError, ok } from '@h-ai/core'
import { cryptoM } from '../crypto-i18n.js'
import { readTransportBody, TRANSPORT_BODY_LIMITS } from './crypto-transport-body.js'
import { hashTransportPath, isValidEncryptedPayload, openTransportPayload, sameTransportContext, sealTransportPayload } from './crypto-transport-codec.js'
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
 *
 * @remarks
 * 内部流程：
 *
 * 1. `createTransportClient()` 只创建本地会话状态，不会立刻发起网络请求。
 * 2. 首次 `init()` / `encryptedFetch()` 会进入 `ensureReady()`；同一时刻只允许一个协商 Promise，避免并发重复协商。
 * 3. `doInit()` 会生成客户端非对称密钥对，并向 `keyExchangeUrl` POST `{ clientPublicKey }`。
 * 4. 服务端返回 `{ serverKeyId, serverPublicKey, clientId }` 后，会话进入 ready 状态。
 * 5. 所有请求生成随机 requestId nonce，认证 method/path/query/clientId/版本；GET/HEAD 的空正文封装放在 X-Hai-Transport 头。
 * 6. 响应必须匹配原请求上下文及 HTTP status，先验证服务端签名和 MAC，再解密；无认证不透传。
 * 7. 握手最多等待 30 秒；正文预算统一使用 TRANSPORT_BODY_LIMITS，读取超限会取消原流。
 *
 * @example
 * ```ts
 * const client = createTransportClient({ crypto, keyExchangeUrl: '/_hai/key-exchange' })
 * const response = await client.encryptedFetch('/api/info')
 * ```
 */
export function createTransportClient(options: CreateTransportClientOptions): TransportClient {
  const baseFetch = options.fetch ?? fetch
  let keyPair: TransportKeyPair | null = null
  let serverPublicKey: string | null = null
  let serverKeyId: string | null = null
  let clientId: string | null = null
  /** 进行中的协商 Promise；用于并发去重。 */
  let initPromise: Promise<HaiResult<void>> | null = null

  async function doInit(): Promise<HaiResult<void>> {
    const kpResult = options.crypto.asymmetric.generateKeyPair()
    if (!kpResult.success)
      return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportClientKeyGenerateFailed'), kpResult.error)
    const localKeyPair = kpResult.data
    if (new TextEncoder().encode(localKeyPair.publicKey).byteLength > TRANSPORT_BODY_LIMITS.publicKeyBytes)
      return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportClientKeyGenerateFailed'))

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new DOMException('Key exchange timed out', 'TimeoutError')), 30_000)
    try {
      let response: Response
      try {
        response = await baseFetch(options.keyExchangeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientPublicKey: localKeyPair.publicKey }),
          signal: controller.signal,
        })
      }
      catch (cause) {
        return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportKeyExchangeRequestFailed'), cause)
      }

      if (!response.ok) {
        void response.body?.cancel().catch(() => {})
        return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportKeyExchangeHttpFailed', { params: { status: response.status } }))
      }

      let body: unknown
      try {
        body = JSON.parse(await readTransportBody(response.body, {
          maxBytes: TRANSPORT_BODY_LIMITS.keyExchangeBytes,
          signal: controller.signal,
        }))
      }
      catch {
        // JSON 解析异常可能包含响应片段，不能进入 HaiResult/cause。
        return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportKeyExchangeInvalidJson'))
      }
      if (!isKeyExchangeResponse(body)) {
        return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportKeyExchangeMissingFields'))
      }

      keyPair = localKeyPair
      serverPublicKey = body.serverPublicKey
      serverKeyId = body.serverKeyId
      clientId = body.clientId
      return ok(undefined)
    }
    finally {
      clearTimeout(timeout)
    }
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

  function encryptBody(plaintext: string, context: TransportMessageContext): HaiResult<EncryptedPayload> {
    if (!serverPublicKey || !serverKeyId || !keyPair)
      return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportClientNotInitialized'))
    return sealTransportPayload(options.crypto, plaintext, context, 'request', 0, serverPublicKey, keyPair.privateKey)
  }

  function decryptPayload(payload: EncryptedPayload): HaiResult<string> {
    if (!keyPair || !serverPublicKey)
      return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportClientNotInitialized'))
    return openTransportPayload(options.crypto, payload, keyPair.privateKey, serverPublicKey)
  }

  const encryptedFetch: typeof fetch = async (input, init) => {
    const requestInput = isRequestLike(input) ? input : undefined
    const signal = init?.signal ?? requestInput?.signal ?? undefined
    signal?.throwIfAborted()
    // 密钥协商请求本身不加密，避免无限递归。
    const targetUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : requestInput?.url ?? String(input)
    if (targetUrl === options.keyExchangeUrl)
      return baseFetch(input, init)

    // 单个请求取消只停止自己的等待；共享握手由独立的有界超时管理，避免取消其它调用。
    let onAbort: (() => void) | undefined
    let ready: HaiResult<void>
    try {
      ready = await (signal
        ? Promise.race([
            ensureReady(),
            new Promise<never>((_resolve, reject) => {
              onAbort = () => reject(signal.reason)
              signal.addEventListener('abort', onAbort, { once: true })
              if (signal.aborted)
                onAbort()
            }),
          ])
        : ensureReady())
    }
    finally {
      if (onAbort)
        signal?.removeEventListener('abort', onAbort)
    }
    if (!ready.success)
      throw new Error(ready.error.message)

    // 复制并改造 init：附加 X-Client-Id；空正文也生成认证封装。
    const headers = new Headers(init?.headers ?? requestInput?.headers)
    headers.set(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER, clientId!)

    // 兼容 oRPC 等场景：body 可能在 Request 上而非 init.body。
    let rawBody: BodyInit | null | undefined = init?.body
    if (rawBody == null && requestInput) {
      const method = (init?.method ?? requestInput.method).toUpperCase()
      if (method !== 'GET' && method !== 'HEAD') {
        const text = await readTransportBody(requestInput.body, { maxBytes: TRANSPORT_BODY_LIMITS.plaintextBytes, signal })
        if (text)
          rawBody = text
      }
    }

    const method = (init?.method ?? requestInput?.method ?? 'GET').toUpperCase()
    const base = new URL(options.keyExchangeUrl, globalThis.location?.href ?? 'http://localhost')
    const url = new URL(targetUrl, base)
    const pathHash = hashTransportPath(options.crypto, url.pathname + url.search)
    if (!pathHash.success)
      throw new Error(pathHash.error.message)
    const context: TransportMessageContext = {
      version: TRANSPORT_PROTOCOL.VERSION,
      serverKeyId: serverKeyId!,
      clientId: clientId!,
      requestId: options.crypto.symmetric.generateKey(),
      issuedAt: Date.now(),
      method,
      pathHash: pathHash.data,
    }
    const plaintext = rawBody == null ? '' : await readTransportBody(new Response(rawBody).body, { maxBytes: TRANSPORT_BODY_LIMITS.plaintextBytes, signal })
    const encResult = encryptBody(plaintext, context)
    if (!encResult.success)
      throw new Error(encResult.error.message)
    const serialized = JSON.stringify(encResult.data)
    if (new TextEncoder().encode(serialized).byteLength > TRANSPORT_BODY_LIMITS.encryptedPayloadBytes)
      throw new RangeError('Transport request envelope byte limit exceeded')
    let nextBody: BodyInit | null | undefined
    headers.delete(TRANSPORT_PROTOCOL.ENVELOPE_HEADER)
    headers.set(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER, TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE)
    headers.delete('Content-Length')
    headers.delete('Content-Encoding')
    if (method === 'GET' || method === 'HEAD') {
      // Fetch 禁止 GET/HEAD 正文；仍必须认证请求，空正文封装使用有界头字段。
      if (new TextEncoder().encode(serialized).byteLength > TRANSPORT_BODY_LIMITS.envelopeHeaderBytes)
        throw new RangeError('Transport request envelope header byte limit exceeded')
      headers.set(TRANSPORT_PROTOCOL.ENVELOPE_HEADER, serialized)
    }
    else {
      nextBody = serialized
      headers.set('Content-Type', 'application/json')
    }

    // 当 input 是已带 body 的 Request 时，必须改用 URL 字符串作为 input，
    // 否则底层 fetch 会优先读取原始 Request 上的明文 body，覆盖我们的密文。
    const finalInput: RequestInfo | URL = requestInput ? requestInput.url : input
    const finalInit: RequestInit = {
      ...init,
      method,
      headers,
      body: nextBody,
      cache: init?.cache ?? requestInput?.cache,
      credentials: init?.credentials ?? requestInput?.credentials,
      integrity: init?.integrity ?? requestInput?.integrity,
      keepalive: init?.keepalive ?? requestInput?.keepalive,
      mode: init?.mode ?? requestInput?.mode,
      redirect: init?.redirect ?? requestInput?.redirect,
      referrer: init?.referrer ?? requestInput?.referrer,
      referrerPolicy: init?.referrerPolicy ?? requestInput?.referrerPolicy,
      signal: init?.signal ?? requestInput?.signal,
    }
    const response = await baseFetch(finalInput, finalInit)

    // 本次请求已认证，禁止删除布尔标记后把明文/其它响应冒充当前请求的响应。
    if (response.headers.get(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER) !== TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE) {
      void response.body?.cancel().catch(() => {})
      throw new Error(cryptoM('crypto_transportResponseDecryptFailed'))
    }

    let payload: unknown
    try {
      const envelope = response.headers.get(TRANSPORT_PROTOCOL.ENVELOPE_HEADER)
      if (envelope && response.body !== null) {
        void response.body.cancel().catch(() => {})
        throw new Error(cryptoM('crypto_transportResponseDecryptFailed'))
      }
      if (envelope && new TextEncoder().encode(envelope).byteLength > TRANSPORT_BODY_LIMITS.envelopeHeaderBytes)
        throw new RangeError('Transport response envelope byte limit exceeded')
      payload = JSON.parse(envelope ?? await readTransportBody(response.body, { maxBytes: TRANSPORT_BODY_LIMITS.encryptedPayloadBytes, signal }))
    }
    catch {
      // 保留调用方取消语义；其它解析异常不携带可能包含明文/密文的原始响应片段。
      throw new Error(cryptoM('crypto_transportResponseDecryptFailed'), signal?.aborted ? { cause: signal.reason } : undefined)
    }
    if (!isValidEncryptedPayload(payload) || payload.direction !== 'response' || payload.status !== response.status
      || !sameTransportContext(payload.context, context)) {
      throw new Error(cryptoM('crypto_transportResponseDecryptFailed'))
    }

    const decResult = decryptPayload(payload)
    if (!decResult.success)
      throw new Error(decResult.error.message)
    if (new TextEncoder().encode(decResult.data).byteLength > TRANSPORT_BODY_LIMITS.plaintextBytes)
      throw new RangeError('Transport response plaintext byte limit exceeded')

    // 透传原响应头但去掉加密标记；Content-Type 还原为下游可能期望的 JSON。
    const respHeaders = new Headers(response.headers)
    respHeaders.delete(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)
    respHeaders.delete(TRANSPORT_PROTOCOL.ENVELOPE_HEADER)
    respHeaders.delete('Content-Length')
    respHeaders.delete('Content-Encoding')
    return new Response(method === 'HEAD' || [204, 304].includes(response.status) ? null : decResult.data, {
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
      serverKeyId = null
      clientId = null
      initPromise = null
    },
  }
}

function isRequestLike(input: RequestInfo | URL): input is Request {
  if (typeof input !== 'object' || input === null)
    return false

  const candidate = input as Partial<Request>
  const headers = candidate.headers as { get?: unknown } | undefined
  return typeof candidate.url === 'string'
    && typeof headers?.get === 'function'
    && typeof candidate.method === 'string'
    && typeof candidate.clone === 'function'
}

function isKeyExchangeResponse(body: unknown): body is KeyExchangeResponse {
  if (!body || typeof body !== 'object')
    return false
  const fields = body as Record<string, unknown>
  return typeof fields.serverPublicKey === 'string' && fields.serverPublicKey.length > 0
    && new TextEncoder().encode(fields.serverPublicKey).byteLength <= TRANSPORT_BODY_LIMITS.publicKeyBytes
    && typeof fields.clientId === 'string' && fields.clientId.length > 0
    && typeof fields.serverKeyId === 'string' && /^[\w-]{1,64}$/.test(fields.serverKeyId)
}
