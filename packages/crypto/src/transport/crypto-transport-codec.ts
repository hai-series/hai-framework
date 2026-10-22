/**
 * @h-ai/crypto — 两端共用的认证传输封装。
 * 独立随机密钥执行 SM4-CBC Encrypt-then-HMAC-SM3，SM2 签名证明发送方持有私钥。
 * @module crypto-transport-codec
 */
import type { HaiResult } from '@h-ai/core'
import type { EncryptedPayload, TransportCryptoServiceLike, TransportMessageContext } from './crypto-transport-types.js'
import { core, err, ok } from '@h-ai/core'
import { cryptoM } from '../crypto-i18n.js'
import { HaiCryptoError } from '../crypto-types.js'
import { TRANSPORT_BODY_LIMITS } from './crypto-transport-body.js'
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
 * 所有认证失败使用同一脱敏错误，不向对端区分验签、MAC、密钥或 CBC 失败。
 * @example `if (!verified) return transportAuthenticationFailure()`
 */
export function transportAuthenticationFailure(): HaiResult<never> {
  return err(HaiCryptoError.INVALID_INPUT, cryptoM('crypto_transportAuthenticationFailed'))
}

/**
 * 对实际 pathname + 原始 search 计算 SM3 摘要，绑定完整路径而不在 JSON/头中重复长 URL。
 * 输入最多 8192 个 UTF-8 字节；调用方不得重排或解码 URL。
 * @example `hashTransportPath(crypto, url.pathname + url.search)`
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
 * 创建认证封装；请求由客户端签名，响应由当前请求选定的服务端版本签名。
 * 密钥通过已初始化的服务生成，调用方提供可信 recipient 公钥及自己的私钥。
 * @example `sealTransportPayload(crypto, text, context, 'request', 0, serverPublicKey, clientPrivateKey)`
 */
export function sealTransportPayload(
  service: TransportCryptoServiceLike,
  plaintext: string,
  context: TransportMessageContext,
  direction: EncryptedPayload['direction'],
  status: number,
  recipientPublicKey: string,
  senderPrivateKey: string,
): HaiResult<EncryptedPayload> {
  try {
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
    return isValidEncryptedPayload(authenticated) ? ok(authenticated) : transportAuthenticationFailure()
  }
  catch {
    return transportAuthenticationFailure()
  }
}

/**
 * 验签 → 解封密钥 → 常量时间验证 MAC → CBC 解密；未认证数据绝不进入 CBC。
 * 调用方另外校验预期 HTTP 上下文；服务端还须原子消费 nonce，不能以本函数替代管理器。
 * @example `openTransportPayload(crypto, payload, clientPrivateKey, serverPublicKey)`
 */
export function openTransportPayload(
  service: TransportCryptoServiceLike,
  payload: EncryptedPayload,
  recipientPrivateKey: string,
  senderPublicKey: string,
): HaiResult<string> {
  try {
    if (!isValidEncryptedPayload(payload))
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
    return plaintext
  }
  catch {
    return transportAuthenticationFailure()
  }
}

/**
 * 校验唯一受支持的认证传输格式；不接受旧版或超出预算的字段。
 * @example
 * ```ts
 * if (!isValidEncryptedPayload(JSON.parse(body))) return new Response(null, { status: 400 })
 * ```
 */
export function isValidEncryptedPayload(value: unknown): value is EncryptedPayload {
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
    && typeof p.ciphertext === 'string' && p.ciphertext.length <= TRANSPORT_BODY_LIMITS.encryptedPayloadBytes
    && p.ciphertext.length > 0 && p.ciphertext.length % 32 === 0 && /^[a-f0-9]+$/i.test(p.ciphertext)
    && typeof p.iv === 'string' && /^[a-f0-9]{32}$/i.test(p.iv)
    && typeof p.tag === 'string' && /^[a-f0-9]{64}$/.test(p.tag)
    && typeof p.signature === 'string' && /^[a-f0-9]{128}$/i.test(p.signature)
}

/**
 * 逐字段关联响应与本次请求，避免并发响应互换及上下文混淆。
 * @example `if (!sameTransportContext(response.context, pendingRequest)) return transportAuthenticationFailure()`
 */
export function sameTransportContext(a: TransportMessageContext, b: TransportMessageContext): boolean {
  return a.version === b.version && a.serverKeyId === b.serverKeyId && a.clientId === b.clientId
    && a.requestId === b.requestId && a.issuedAt === b.issuedAt && a.method === b.method && a.pathHash === b.pathHash
}
