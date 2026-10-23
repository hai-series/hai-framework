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
 * 解析服务端私有JSON或受管对象，不读取环境或初始化模块；实际密钥配对由createServer验证。
 * @param serialized - Secret Manager提供的JSON字符串或对象。
 * @returns 结构有效的密钥环或脱敏INVALID_KEY，不回显私钥/原始输入。
 *
 * @example
 * ```ts
 * import { parseTransportServerKeyRing, type TransportServerKeyRing } from '@h-ai/crypto'
 * const parsed = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
 * if (!parsed.success) throw new Error(parsed.error.message)
 * const ring: TransportServerKeyRing = parsed.data
 * // 仅服务端使用；createServer还会校验每个版本的公私钥配对。
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

/**
 * 内部结构守卫，限制版本ID、公钥/私钥文本长度，不把配置值带入错误。
 * @param value - 未知Secret解析结果。
 * @returns 是否满足密钥环结构；真实密钥配对仍由服务端工厂校验。
 *
 * @example 模块内部上下文
 * ```ts
 * const valid = isTransportServerKeyRing({ activeKeyId: 'v1', keys: {} })
 * // 缺少活动版本的密钥对，结构校验返回false。
 * ```
 */
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
