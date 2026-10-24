/**
 * @h-ai/crypto — 两端共用的认证传输封装。
 * 独立随机密钥执行 SM4-CBC Encrypt-then-HMAC-SM3，SM2 签名证明发送方持有私钥。
 * @module crypto-transport-codec
 */
import type { HaiResult } from '@h-ai/core'
import type { TransportBodyLimits } from './crypto-transport-body.js'
import type { EncryptedPayload, TransportCryptoServiceLike, TransportMessageContext } from './crypto-transport-types.js'
import { core, err, ok } from '@h-ai/core'
import { cryptoM } from '../crypto-i18n.js'
import { HaiCryptoError } from '../crypto-types.js'
import { TRANSPORT_BODY_LIMITS, TransportBodyTooLargeError } from './crypto-transport-body.js'
import { TRANSPORT_PROTOCOL } from './crypto-transport-types.js'

/** 固定位置数组防止对象属性顺序、字段拼接或查询参数边界产生歧义。 */
function authenticatedText(payload: Omit<EncryptedPayload, 'tag' | 'signature'>): string {
  const c = payload.context
  return JSON.stringify([
    'hai-transport',
    c.version,
    payload.direction,
    c.serverKeyId,
    c.clientId,
    c.requestId,
    c.issuedAt,
    c.method,
    c.pathHash,
    payload.status,
    payload.encryptedKey,
    payload.ciphertext,
    payload.iv,
  ])
}

/**
 * 内部统一认证失败，避免向对端区分签名、MAC、密钥或CBC错误。
 * @returns 脱敏失败HaiResult，不附明文/密钥/密文。
 *
 * @example 模块内部上下文
 * ```ts
 * const failure = transportAuthenticationFailure()
 * if (!failure.success) { const code = failure.error.code }
 * ```
 */
export function transportAuthenticationFailure(): HaiResult<never> {
  return err(HaiCryptoError.INVALID_INPUT, cryptoM('crypto_transportAuthenticationFailed'))
}

/**
 * 内部计算实际pathname+原始search的SM3绑定摘要；不解码、重排查询参数，UTF-8最多8192字节。
 * @param service - SM3能力实现。
 * @param path - 实际pathname与原始search拼接值。
 * @returns SM3摘要或统一失败。
 *
 * @example 模块内部上下文
 * ```ts
 * const { crypto } = await import('@h-ai/crypto')
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const url = new URL('https://api.example.com/api/v1/orders?sort=created')
 *   const digest = hashTransportPath(crypto, url.pathname + url.search)
 *   if (!digest.success) throw new Error(digest.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export function hashTransportPath(service: TransportCryptoServiceLike, path: string): HaiResult<string> {
  try {
    if (!path.startsWith('/') || new TextEncoder().encode(path).byteLength > 8192)
      return transportAuthenticationFailure()
    const digest = service.hash.hash(path)
    return digest.success && /^[a-f0-9]{64}$/.test(digest.data) ? digest : transportAuthenticationFailure()
  }
  catch {
    return transportAuthenticationFailure()
  }
}

/**
 * 内部生成独立SM4/MAC密钥，以SM2封装并签名完整认证字段；调用方另维护可信HTTP上下文。
 * @param service - 已初始化的SM2/SM3/SM4能力。
 * @param plaintext - 已按协议限制字节预算的明文。
 * @param context - 本次可信绑定上下文。
 * @param direction - request或response认证方向。
 * @param status - 请求0；响应实际HTTP状态。
 * @param recipientPublicKey - 可信接收方公钥。
 * @param senderPrivateKey - 仅本方持有的私钥。
 * @returns 完整认证封装或统一失败；不代替服务端nonce原子消费。
 *
 * @example 模块内部上下文
 * ```ts
 * const { crypto } = await import('@h-ai/crypto')
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const generated = crypto.asymmetric.generateKeyPair()
 *   if (!generated.success) throw new Error(generated.error.message)
 *   const pair = generated.data
 *   const digest = crypto.hash.hash('/api/v1/orders?sort=created')
 *   if (!digest.success) throw new Error(digest.error.message)
 *   const context: TransportMessageContext = { version: 2, serverKeyId: 'v1', clientId: 'client-test', requestId: globalThis.crypto.randomUUID().replaceAll('-', ''), issuedAt: Date.now(), method: 'POST', pathHash: digest.data }
 *   const sealed = sealTransportPayload(crypto, 'hello', context, 'request', 0, pair.publicKey, pair.privateKey)
 *   if (!sealed.success) throw new Error(sealed.error.message)
 *   const payload = sealed.data
 * }
 * finally { await crypto.close() }
 * ```
 */
export function sealTransportPayload(
  service: TransportCryptoServiceLike,
  plaintext: string,
  context: TransportMessageContext,
  direction: EncryptedPayload['direction'],
  status: number,
  recipientPublicKey: string,
  senderPrivateKey: string,
  limits: TransportBodyLimits = TRANSPORT_BODY_LIMITS,
): HaiResult<EncryptedPayload> {
  try {
    const bytes = new TextEncoder().encode(plaintext).byteLength
    if (bytes > limits.plaintextBytes)
      return err(HaiCryptoError.TRANSPORT_PAYLOAD_TOO_LARGE, cryptoM('crypto_transportBodyTooLarge'), new TransportBodyTooLargeError(limits.plaintextBytes, bytes, { direction }))
    const encryptionKey = service.symmetric.generateKey()
    // MAC 使用独立的 256 位随机密钥，禁止直接复用 SM4 密钥。
    const authenticationKey = service.symmetric.generateKey() + service.symmetric.generateKey()
    const encrypted = service.symmetric.encryptWithIV(plaintext, encryptionKey)
    const wrapped = service.asymmetric.encrypt(JSON.stringify([encryptionKey, authenticationKey]), recipientPublicKey)
    if (!encrypted.success || !wrapped.success)
      return transportAuthenticationFailure()
    const payload = { context: { ...context }, direction, status, encryptedKey: wrapped.data, ciphertext: encrypted.data.ciphertext, iv: encrypted.data.iv }
    const text = authenticatedText(payload)
    const tag = service.hash.hmac(text, authenticationKey)
    if (!tag.success)
      return transportAuthenticationFailure()
    const signature = service.asymmetric.sign(JSON.stringify([text, tag.data]), senderPrivateKey)
    if (!signature.success)
      return transportAuthenticationFailure()
    const authenticated = { ...payload, tag: tag.data, signature: signature.data }
    return isValidEncryptedPayload(authenticated, limits) ? ok(authenticated) : transportAuthenticationFailure()
  }
  catch {
    return transportAuthenticationFailure()
  }
}

/**
 * 内部按验签→解封密钥→常量时间MAC校验→CBC解密处理；未认证数据不进入CBC。
 * @param service - 已初始化的SM2/SM3/SM4能力。
 * @param payload - 待校验封装。
 * @param recipientPrivateKey - 本方私钥。
 * @param senderPublicKey - 已认证绑定的发送方公钥。
 * @returns 明文或统一失败；HTTP绑定/时效/nonce还须由外层管理器检查。
 *
 * @example 模块内部上下文
 * ```ts
 * const { crypto } = await import('@h-ai/crypto')
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const generated = crypto.asymmetric.generateKeyPair()
 *   if (!generated.success) throw new Error(generated.error.message)
 *   const pair = generated.data
 *   const digest = crypto.hash.hash('/api/v1/orders?sort=created')
 *   if (!digest.success) throw new Error(digest.error.message)
 *   const context: TransportMessageContext = { version: 2, serverKeyId: 'v1', clientId: 'client-test', requestId: globalThis.crypto.randomUUID().replaceAll('-', ''), issuedAt: Date.now(), method: 'POST', pathHash: digest.data }
 *   const sealed = sealTransportPayload(crypto, 'hello', context, 'request', 0, pair.publicKey, pair.privateKey)
 *   if (!sealed.success) throw new Error(sealed.error.message)
 *   const opened = openTransportPayload(crypto, sealed.data, pair.privateKey, pair.publicKey)
 * if (!opened.success) throw new Error(opened.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export function openTransportPayload(
  service: TransportCryptoServiceLike,
  payload: EncryptedPayload,
  recipientPrivateKey: string,
  senderPublicKey: string,
  limits: TransportBodyLimits = TRANSPORT_BODY_LIMITS,
): HaiResult<string> {
  try {
    if (!isValidEncryptedPayload(payload, limits))
      return transportAuthenticationFailure()
    const text = authenticatedText(payload)
    const verified = service.asymmetric.verify(JSON.stringify([text, payload.tag]), payload.signature, senderPublicKey)
    if (!verified.success || !verified.data)
      return transportAuthenticationFailure()
    const unwrapped = service.asymmetric.decrypt(payload.encryptedKey, recipientPrivateKey)
    if (!unwrapped.success)
      return transportAuthenticationFailure()
    const keys: unknown = JSON.parse(unwrapped.data)
    if (!Array.isArray(keys) || keys.length !== 2
      || typeof keys[0] !== 'string' || !/^[a-f0-9]{32}$/.test(keys[0])
      || typeof keys[1] !== 'string' || !/^[a-f0-9]{64}$/.test(keys[1])) {
      return transportAuthenticationFailure()
    }
    const tag = service.hash.hmac(text, keys[1])
    if (!tag.success || !core.string.constantTimeEqual(tag.data, payload.tag))
      return transportAuthenticationFailure()
    const plaintext = service.symmetric.decryptWithIV(payload.ciphertext, keys[0], payload.iv)
    if (!plaintext.success)
      return transportAuthenticationFailure()
    const bytes = new TextEncoder().encode(plaintext.data).byteLength
    if (bytes > limits.plaintextBytes)
      return err(HaiCryptoError.TRANSPORT_PAYLOAD_TOO_LARGE, cryptoM('crypto_transportBodyTooLarge'), new TransportBodyTooLargeError(limits.plaintextBytes, bytes, { direction: payload.direction }))
    return plaintext
  }
  catch {
    return transportAuthenticationFailure()
  }
}

/**
 * 内部格式守卫，只接受v2精确字段与预算；形状合法不代表签名/MAC/时效/nonce有效。
 * @param value - 未知JSON值。
 * @returns 是否可继续执行认证校验，不能据此执行业务。
 *
 * @example 模块内部上下文
 * ```ts
 * const { crypto } = await import('@h-ai/crypto')
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const generated = crypto.asymmetric.generateKeyPair()
 *   if (!generated.success) throw new Error(generated.error.message)
 *   const pair = generated.data
 *   const digest = crypto.hash.hash('/api/v1/orders?sort=created')
 *   if (!digest.success) throw new Error(digest.error.message)
 *   const context: TransportMessageContext = { version: 2, serverKeyId: 'v1', clientId: 'client-test', requestId: globalThis.crypto.randomUUID().replaceAll('-', ''), issuedAt: Date.now(), method: 'POST', pathHash: digest.data }
 *   const sealed = sealTransportPayload(crypto, 'hello', context, 'request', 0, pair.publicKey, pair.privateKey)
 *   if (!sealed.success) throw new Error(sealed.error.message)
 *   const validShape = isValidEncryptedPayload(sealed.data)
 * }
 * finally { await crypto.close() }
 * ```
 */
export function isValidEncryptedPayload(value: unknown, limits: TransportBodyLimits = TRANSPORT_BODY_LIMITS): value is EncryptedPayload {
  if (!value || typeof value !== 'object')
    return false
  const p = value as Record<string, unknown>
  const c = p.context as Partial<TransportMessageContext> | undefined
  return Object.keys(p).length === 8 && !!c && typeof c === 'object' && Object.keys(c).length === 7 && c.version === TRANSPORT_PROTOCOL.VERSION
    && typeof c.serverKeyId === 'string' && /^[\w-]{1,64}$/.test(c.serverKeyId)
    && typeof c.clientId === 'string' && /^[\w-]{1,128}$/.test(c.clientId)
    && typeof c.requestId === 'string' && /^[a-f0-9]{32}$/.test(c.requestId)
    && Number.isSafeInteger(c.issuedAt) && c.issuedAt! > 0
    && typeof c.method === 'string' && /^[A-Z]{1,16}$/.test(c.method)
    && typeof c.pathHash === 'string' && /^[a-f0-9]{64}$/.test(c.pathHash)
    && (p.direction === 'request' || p.direction === 'response')
    && Number.isInteger(p.status) && (p.direction === 'request' ? p.status === 0 : Number(p.status) >= 100 && Number(p.status) <= 599)
    && typeof p.encryptedKey === 'string' && /^[a-f0-9]{1,8192}$/i.test(p.encryptedKey)
    && typeof p.ciphertext === 'string' && p.ciphertext.length <= limits.encryptedPayloadBytes
    && p.ciphertext.length > 0 && p.ciphertext.length % 32 === 0 && /^[a-f0-9]+$/i.test(p.ciphertext)
    && typeof p.iv === 'string' && /^[a-f0-9]{32}$/i.test(p.iv)
    && typeof p.tag === 'string' && /^[a-f0-9]{64}$/.test(p.tag)
    && typeof p.signature === 'string' && /^[a-f0-9]{128}$/i.test(p.signature)
}

/**
 * 内部逐字段关联响应与待处理请求；上下文相同仍须验证签名、MAC和状态。
 * @param a - 响应认证上下文。
 * @param b - 本次原始请求上下文。
 * @returns 全字段是否相同，不以引用相等代替关联。
 *
 * @example 模块内部上下文
 * ```ts
 * const { crypto } = await import('@h-ai/crypto')
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const digest = crypto.hash.hash('/api/v1/orders?sort=created')
 *   if (!digest.success) throw new Error(digest.error.message)
 *   const context: TransportMessageContext = { version: 2, serverKeyId: 'v1', clientId: 'client-test', requestId: globalThis.crypto.randomUUID().replaceAll('-', ''), issuedAt: Date.now(), method: 'POST', pathHash: digest.data }
 *   const matches = sameTransportContext(context, { ...context })
 * }
 * finally { await crypto.close() }
 * ```
 */
export function sameTransportContext(a: TransportMessageContext, b: TransportMessageContext): boolean {
  return a.version === b.version && a.serverKeyId === b.serverKeyId && a.clientId === b.clientId
    && a.requestId === b.requestId && a.issuedAt === b.issuedAt && a.method === b.method && a.pathHash === b.pathHash
}
