/**
 * @h-ai/crypto — 传输加密客户端实现
 *
 * 提供浏览器 / Node 环境下使用的 `encryptedFetch` 包装：
 * - 首次调用或客户端公钥临近到期时，与服务端协商；
 * - 之后所有出站请求自动以混合加密包裹；
 * - 验证响应关联、发送方签名与 MAC 后解密，缺少认证的响应拒绝。
 *
 * 与服务端协议常量统一来自 {@link TRANSPORT_PROTOCOL}，确保不漂移。
 *
 * @module crypto-transport-client
 */

import type { HaiResult } from '@h-ai/core'
import type { TransportBodyLimits } from './crypto-transport-body.js'
import type {
  KeyExchangeResponse,
  TransportClient,
  TransportCryptoServiceLike,
  TransportKeyPair,
  TransportMessageContext,
} from './crypto-transport-types.js'
import { err, HaiCommonError, ok } from '@h-ai/core'
import { cryptoM } from '../crypto-i18n.js'
import { HaiCryptoError } from '../crypto-types.js'
import { readTransportBody, resolveTransportBodyLimits, TRANSPORT_BODY_LIMITS, TransportBodyTooLargeError } from './crypto-transport-body.js'
import { hashTransportPath, isValidEncryptedPayload, isValidTransportKeyTtlSeconds, openTransportPayload, sameTransportContext, sealTransportPayload } from './crypto-transport-codec.js'
import { TransportTimeError } from './crypto-transport-error.js'
import { TRANSPORT_PROTOCOL } from './crypto-transport-types.js'

/**
 * 内部传输客户端工厂配置；模块公开入口为crypto.transport.createClient，crypto需已初始化。
 *
 * @example 模块内部上下文
 * ```ts
 * const { crypto } = await import('@h-ai/crypto')
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const options: CreateTransportClientOptions = { crypto, keyExchangeUrl: 'https://api.example.com/api/v1/_hai/key-exchange' }
 *   const client = createTransportClient(options)
 *   try { const ready = await client.init()
 *   if (!ready.success) throw new Error(ready.error.message) }
 *   finally { client.destroy() }
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface CreateTransportClientOptions {
  /** 可选本地明文上限；未指定时跟随服务端握手，指定时取两者较小值。 */
  maxPlaintextBytes?: number
  /** 加密能力实现（通常直接传 `crypto` 实例）。 */
  crypto: TransportCryptoServiceLike
  /** 密钥协商完整 URL，例如 `https://api.example.com/_hai/key-exchange`。 */
  keyExchangeUrl: string
  /**
   * 实际发送 HTTP 请求的 fetch 实现；默认使用全局 `fetch`。
   *
   * 可注入测试或平台桥接实现；实现必须遵守 fetch 的正文、响应与取消信号契约。
   */
  fetch?: typeof fetch
}

/**
 * 一次协商的密钥与容量快照，供同一请求的加密和响应验证使用。
 * @example 模块内部上下文
 * ```ts
 * function clientIdOf(session: TransportClientSession): string {
 *   return session.clientId
 * }
 * ```
 */
interface TransportClientSession {
  readonly keyPair: TransportKeyPair
  readonly serverPublicKey: string
  readonly serverKeyId: string
  readonly clientId: string
  readonly bodyLimits: TransportBodyLimits
  /** 客户端本地 Unix 毫秒期限，覆盖系统休眠。 */
  readonly renewAt: number
  /** 单调时钟毫秒期限，覆盖系统时钟回拨。 */
  readonly monotonicRenewAt: number
}

function isSessionUsable(session: TransportClientSession): boolean {
  return Date.now() < session.renewAt && performance.now() < session.monotonicRenewAt
}

/**
 * 创建传输会话；并发调用共享握手，首次使用或达到续期时间时按需协商。
 * 协议仅接受匹配原请求/HTTP状态的认证响应；明文、缺标记、错误签名/MAC一律拒绝。
 * @param options - 已初始化crypto、完整HTTPS协商URL和可选fetch。
 * @returns 会话；init返回HaiResult，encryptedFetch按fetch契约reject，destroy只清本地状态。
 *
 * @example
 * ```ts
 * import { crypto } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const client = crypto.transport.createClient({ keyExchangeUrl: 'https://api.example.com/api/v1/_hai/key-exchange' })
 *   try {
 *     const ready = await client.init()
 *     if (!ready.success) throw new Error(ready.error.message)
 *     const response = await client.encryptedFetch('https://api.example.com/api/v1/orders')
 *     if (!response.ok) throw new Error('HTTP request failed')
 *   }
 *   finally { client.destroy() }
 * }
 * finally { await crypto.close() }
 * ```
 */
export function createTransportClient(options: CreateTransportClientOptions): TransportClient {
  const baseFetch = options.fetch ?? fetch
  // 显式本地配置立即校验；未配置时由可信 TLS 握手提供服务端预算。
  const localLimits = options.maxPlaintextBytes === undefined
    ? undefined
    : resolveTransportBodyLimits(options.maxPlaintextBytes)
  let session: TransportClientSession | undefined
  /** 进行中的协商 Promise；用于并发去重。 */
  let initPromise: Promise<HaiResult<TransportClientSession>> | undefined
  let generation = 0
  let handshakeController: AbortController | undefined

  /**
   * 生成本客户端密钥，30秒预算内协商并有界读取握手，只有验证响应结构后提交会话状态。
   * @returns 协商HaiResult；失败不把部分状态当ready。
   *
   * @example 模块内部上下文
   * ```ts
   * const initialized = await doInit(generation)
   * if (!initialized.success) throw new Error(initialized.error.message)
   * ```
   */
  async function doInit(attemptGeneration: number): Promise<HaiResult<TransportClientSession>> {
    const kpResult = options.crypto.asymmetric.generateKeyPair()
    if (!kpResult.success)
      return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportClientKeyGenerateFailed'), kpResult.error)
    const localKeyPair = kpResult.data
    if (new TextEncoder().encode(localKeyPair.publicKey).byteLength > TRANSPORT_BODY_LIMITS.publicKeyBytes)
      return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportClientKeyGenerateFailed'))

    const controller = new AbortController()
    handshakeController = controller
    const exchangeStartedAt = Date.now()
    const monotonicStart = performance.now()
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
        return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportKeyExchangeHttpFailed', {
          params: { status: response.status },
        }))
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

      let bodyLimits: TransportBodyLimits
      try {
        const serverLimits = resolveTransportBodyLimits(body.maxPlaintextBytes)
        bodyLimits = resolveTransportBodyLimits(Math.min(localLimits?.plaintextBytes ?? serverLimits.plaintextBytes, serverLimits.plaintextBytes))
      }
      catch {
        return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportBodyLimitInvalid'))
      }

      if (attemptGeneration !== generation || controller.signal.aborted)
        return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportClientNotInitialized'))

      const ttlMs = body.clientKeyTtlSeconds === undefined
        ? Number.POSITIVE_INFINITY
        : body.clientKeyTtlSeconds * 1000
      // 从发出握手起计时，涵盖传输延迟，并为下一次请求留出最多 30 秒。
      const usableMs = ttlMs - Math.min(ttlMs / 10, 30_000)
      const nextSession: TransportClientSession = {
        keyPair: localKeyPair,
        serverPublicKey: body.serverPublicKey,
        serverKeyId: body.serverKeyId,
        clientId: body.clientId,
        bodyLimits,
        renewAt: exchangeStartedAt + usableMs,
        monotonicRenewAt: monotonicStart + usableMs,
      }
      if (!isSessionUsable(nextSession))
        return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportKeyExchangeRequestFailed'))
      session = nextSession
      return ok(nextSession)
    }
    finally {
      clearTimeout(timeout)
      if (handshakeController === controller)
        handshakeController = undefined
    }
  }

  /**
   * 复用可用会话，并发续期共享握手。握手结束后释放 Promise，允许下一次协商。
   * @returns 协商结果；单个业务请求取消只停止自己的等待，不中断其它调用的共享握手。
   *
   * @example 模块内部上下文
   * ```ts
   * const [first, second] = await Promise.all([ensureReady(), ensureReady()])
   * if (!first.success) throw new Error(first.error.message)
   * if (!second.success) throw new Error(second.error.message)
   * ```
   */
  async function ensureReady(): Promise<HaiResult<TransportClientSession>> {
    if (session && isSessionUsable(session))
      return ok(session)
    if (!initPromise) {
      session = undefined
      const pending = doInit(generation).finally(() => {
        if (initPromise === pending)
          initPromise = undefined
      })
      initPromise = pending
    }
    return initPromise
  }

  async function waitForSession(signal: AbortSignal | undefined): Promise<TransportClientSession> {
    signal?.throwIfAborted()
    // 单个请求取消只停止自己的等待；共享握手由独立的有界超时管理，避免取消其它调用。
    let onAbort: (() => void) | undefined
    try {
      const ready = await (signal
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
      if (!ready.success)
        throw new Error(ready.error.message)
      return ready.data
    }
    finally {
      if (onAbort)
        signal?.removeEventListener('abort', onAbort)
    }
  }

  const encryptedFetch: typeof fetch = async (input, init) => {
    const requestInput = isRequestLike(input)
      ? input
      : undefined
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

    const requestGeneration = generation
    let requestSession = await waitForSession(signal)
    if (requestGeneration !== generation)
      throw new Error(cryptoM('crypto_transportClientNotInitialized'))
    const method = (init?.method ?? requestInput?.method ?? 'GET').toUpperCase()
    // oRPC 等调用方会在 Request 上提供正文。读取原流一次，续期时复用有界明文。
    const requestBody = init?.body != null
      ? new Response(init.body).body
      : method === 'GET' || method === 'HEAD'
        ? null
        : requestInput?.body ?? null
    const plaintext = await readTransportBody(requestBody, { maxBytes: requestSession.bodyLimits.plaintextBytes, signal })
    // 读取慢流期间也可能到达续期时间，发送前再取得可用会话。
    if (requestGeneration === generation && (requestSession !== session || !isSessionUsable(requestSession)))
      requestSession = await waitForSession(signal)
    signal?.throwIfAborted()
    if (requestGeneration !== generation || !isSessionUsable(requestSession))
      throw new Error(cryptoM('crypto_transportClientNotInitialized'))
    const { bodyLimits, clientId, keyPair, serverKeyId, serverPublicKey } = requestSession

    // 请求和响应都绑定本次发送使用的会话；后续协商可以替换客户端的当前会话。
    const headers = new Headers(init?.headers ?? requestInput?.headers)
    headers.set(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER, clientId)
    const base = new URL(options.keyExchangeUrl, globalThis.location?.href ?? 'http://localhost')
    const url = new URL(targetUrl, base)
    const pathHash = hashTransportPath(options.crypto, url.pathname + url.search)
    if (!pathHash.success)
      throw new Error(pathHash.error.message)
    const context: TransportMessageContext = {
      version: TRANSPORT_PROTOCOL.VERSION,
      serverKeyId,
      clientId,
      requestId: options.crypto.symmetric.generateKey(),
      issuedAt: Date.now(),
      method,
      pathHash: pathHash.data,
    }
    const encResult = sealTransportPayload(options.crypto, plaintext, context, 'request', 0, serverPublicKey, keyPair.privateKey, bodyLimits)
    if (!encResult.success) {
      if (encResult.error.cause instanceof TransportBodyTooLargeError)
        throw encResult.error.cause
      throw new Error(encResult.error.message)
    }
    const serialized = JSON.stringify(encResult.data)
    if (new TextEncoder().encode(serialized).byteLength > bodyLimits.encryptedPayloadBytes)
      throw new TransportBodyTooLargeError(bodyLimits.encryptedPayloadBytes, new TextEncoder().encode(serialized).byteLength, { stage: 'encrypted' })
    let nextBody: BodyInit | null | undefined
    headers.delete(TRANSPORT_PROTOCOL.ENVELOPE_HEADER)
    headers.set(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER, TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE)
    headers.delete('Content-Length')
    headers.delete('Content-Encoding')
    if (method === 'GET' || method === 'HEAD') {
      // Fetch 禁止 GET/HEAD 正文；仍必须认证请求，空正文封装使用有界头字段。
      if (new TextEncoder().encode(serialized).byteLength > TRANSPORT_BODY_LIMITS.envelopeHeaderBytes)
        throw new TransportBodyTooLargeError(TRANSPORT_BODY_LIMITS.envelopeHeaderBytes, new TextEncoder().encode(serialized).byteLength, { stage: 'header' })
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

    // 请求携带认证信息，响应同样必须验证；禁止删除标记后把明文冒充当前请求的响应。
    if (response.headers.get(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER) !== TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE) {
      void response.body?.cancel().catch(() => {})
      if (response.status === 503)
        throw Object.assign(new Error(cryptoM('crypto_transportBusy')), { code: HaiCryptoError.TRANSPORT_BUSY.code, httpStatus: 503 })
      if (response.status === 413)
        throw new TransportBodyTooLargeError(bodyLimits.encryptedPayloadBytes, undefined, { stage: 'encrypted' })
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
        throw new TransportBodyTooLargeError(TRANSPORT_BODY_LIMITS.envelopeHeaderBytes, new TextEncoder().encode(envelope).byteLength, { direction: 'response', stage: 'header' })
      payload = JSON.parse(envelope ?? await readTransportBody(response.body, {
        maxBytes: bodyLimits.encryptedPayloadBytes,
        direction: 'response',
        stage: 'encrypted',
        signal,
      }))
    }
    catch (error) {
      if (error instanceof TransportBodyTooLargeError)
        throw error
      // 保留调用方取消语义；其它解析异常不携带可能包含明文/密文的原始响应片段。
      throw new Error(cryptoM('crypto_transportResponseDecryptFailed'), signal?.aborted
        ? { cause: signal.reason }
        : undefined)
    }
    if (!isValidEncryptedPayload(payload, bodyLimits) || payload.direction !== 'response' || payload.status !== response.status
      || !sameTransportContext(payload.context, context)) {
      throw new Error(cryptoM('crypto_transportResponseDecryptFailed'))
    }

    if (requestGeneration !== generation)
      throw new Error(cryptoM('crypto_transportClientNotInitialized'))
    const decResult = openTransportPayload(options.crypto, payload, keyPair.privateKey, serverPublicKey, bodyLimits)
    if (!decResult.success) {
      if (decResult.error.cause instanceof TransportBodyTooLargeError)
        throw decResult.error.cause
      throw new Error(decResult.error.message)
    }
    if (new TextEncoder().encode(decResult.data).byteLength > bodyLimits.plaintextBytes)
      throw new TransportBodyTooLargeError(bodyLimits.plaintextBytes, new TextEncoder().encode(decResult.data).byteLength, { direction: 'response' })

    // 时间建议只来自已验签/MAC、关联当前请求的响应；明文 400 不作为可信时间诊断。
    if (response.status === 400) {
      let failure: { success?: unknown, error?: { code?: unknown, details?: { serverTime?: unknown } } } | undefined
      try {
        failure = JSON.parse(decResult.data)
      }
      catch {}
      if (failure?.success === false && failure.error?.code === HaiCryptoError.TRANSPORT_TIME_INVALID.code) {
        const serverTime = failure.error.details?.serverTime
        if (typeof serverTime !== 'number')
          throw new TypeError(cryptoM('crypto_transportTimeResponseInvalid'))
        throw new TransportTimeError(undefined, serverTime)
      }
    }
    // 只从已验签/MAC、关联请求和状态的错误报文恢复服务端响应容量诊断。
    if (response.status === 500) {
      let failure: { success?: unknown, error?: { code?: unknown, details?: Record<string, unknown> } } | undefined
      try {
        failure = JSON.parse(decResult.data)
      }
      catch {}
      const details = failure?.error?.details
      if (failure?.success === false && failure.error?.code === 'hai:crypto:070' && details?.direction === 'response'
        && (details.stage === 'plaintext' || details.stage === 'encrypted' || details.stage === 'header')
        && typeof details.limitBytes === 'number' && Number.isSafeInteger(details.limitBytes) && details.limitBytes >= 0) {
        throw new TransportBodyTooLargeError(details.limitBytes, typeof details.actualBytes === 'number'
          ? details.actualBytes
          : undefined, { direction: 'response', stage: details.stage })
      }
    }

    // 透传原响应头但去掉加密标记；Content-Type 还原为下游可能期望的 JSON。
    const respHeaders = new Headers(response.headers)
    respHeaders.delete(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)
    respHeaders.delete(TRANSPORT_PROTOCOL.ENVELOPE_HEADER)
    respHeaders.delete('Content-Length')
    respHeaders.delete('Content-Encoding')
    return new Response(method === 'HEAD' || [204, 304].includes(response.status)
      ? null
      : decResult.data, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
    })
  }

  return {
    async init() {
      const ready = await ensureReady()
      return ready.success
        ? ok(undefined)
        : ready
    },
    encryptedFetch,
    ready: () => session !== undefined && isSessionUsable(session),
    destroy() {
      generation++
      handshakeController?.abort()
      handshakeController = undefined
      session = undefined
      initPromise = undefined
    },
  }
}

/**
 * 识别当前或跨Realm的Request形态，以保留原始method/body/signal；不执行请求。
 * @param input - fetch输入。
 * @returns 是否可按Request读取字段。
 *
 * @example 模块内部上下文
 * ```ts
 * const request = new Request('https://api.example.com/api/v1/orders')
 * const recognized = isRequestLike(request)
 * ```
 */
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

/**
 * 校验握手响应的有界结构/标识；TLS负责对端真实性，后续SM2操作仍检查公钥曲线点。
 * @param body - 未知JSON响应。
 * @returns 是否可提交当前会话所需字段。
 *
 * @example 模块内部上下文
 * ```ts
 * const valid = isKeyExchangeResponse({ clientId: '', serverKeyId: '', serverPublicKey: '', maxPlaintextBytes: 1024 })
 * // 空字段不构成一次合法握手。
 * ```
 */
function isKeyExchangeResponse(body: unknown): body is KeyExchangeResponse {
  if (!body || typeof body !== 'object')
    return false
  const fields = body as Record<string, unknown>
  return typeof fields.serverPublicKey === 'string' && fields.serverPublicKey.length > 0
    && new TextEncoder().encode(fields.serverPublicKey).byteLength <= TRANSPORT_BODY_LIMITS.publicKeyBytes
    && typeof fields.clientId === 'string' && fields.clientId.length > 0
    && typeof fields.serverKeyId === 'string' && /^[\w-]{1,64}$/.test(fields.serverKeyId)
    && typeof fields.maxPlaintextBytes === 'number'
    && (fields.clientKeyTtlSeconds === undefined || isValidTransportKeyTtlSeconds(fields.clientKeyTtlSeconds))
}
