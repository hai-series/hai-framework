/**
 * @h-ai/crypto — 服务端受管传输密钥环的安全解析。
 * @module crypto-transport-keyring
 */

import type { HaiResult } from '@h-ai/core'
import type { TransportServerKeyRing } from './crypto-transport-types.js'
import { err, ok } from '@h-ai/core'
import { cryptoM } from '../crypto-i18n.js'
import { HaiCryptoError } from '../crypto-types.js'
import { TRANSPORT_BODY_LIMITS } from './crypto-transport-body.js'

/**
 * 解析服务端 Secret 中的 JSON 密钥环，不读取环境、不初始化 crypto。
 *
 * 返回错误不包含原始 JSON、私钥或解析异常片段；实际密钥配对在 createServer 时验证。
 * @param serialized - 来自 Secret Manager 的 JSON 或受管配置对象。
 * @returns 有效的版本化密钥环；缺失或结构错误返回 INVALID_KEY。
 * @example
 * ```ts
 * const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
 * if (!ring.success)
 *   throw new Error(ring.error.message)
 * const server = crypto.transport.createServer({ serverKeyRing: ring.data, keyStore: sharedRegistry })
 * ```
 */
export function parseTransportServerKeyRing(serialized: unknown): HaiResult<TransportServerKeyRing> {
  try {
    const value: unknown = typeof serialized === 'string' ? JSON.parse(serialized) : serialized
    if (isTransportServerKeyRing(value))
      return ok(value)
  }
  catch {}
  return err(HaiCryptoError.INVALID_KEY, cryptoM('crypto_transportServerKeyRingInvalid'))
}

/** 内部配置边界：限制版本 ID 与公钥长度，不把配置值带入错误上下文。 */
function isTransportServerKeyRing(value: unknown): value is TransportServerKeyRing {
  if (!value || typeof value !== 'object')
    return false
  const ring = value as Record<string, unknown>
  if (typeof ring.activeKeyId !== 'string' || !/^[\w-]{1,64}$/.test(ring.activeKeyId)
    || !ring.keys || typeof ring.keys !== 'object' || Array.isArray(ring.keys)) {
    return false
  }
  if (!Object.hasOwn(ring.keys, ring.activeKeyId))
    return false
  return Object.entries(ring.keys).every(([id, pair]) => {
    if (!/^[\w-]{1,64}$/.test(id) || !pair || typeof pair !== 'object')
      return false
    const fields = pair as Record<string, unknown>
    return typeof fields.publicKey === 'string' && fields.publicKey.length > 0
      && new TextEncoder().encode(fields.publicKey).byteLength <= TRANSPORT_BODY_LIMITS.publicKeyBytes
      && typeof fields.privateKey === 'string' && fields.privateKey.length > 0
      && fields.privateKey.length <= TRANSPORT_BODY_LIMITS.publicKeyBytes
  })
}
