/**
 * @h-ai/crypto — SM2 公钥输入校验。
 * @module crypto-public-key
 */

// @ts-expect-error sm-crypto 未提供类型声明。
import smCrypto from 'sm-crypto'

const SM2_PUBLIC_KEY_REGEX = /^(?:04)?[0-9a-f]{128}$/i

/**
 * 校验 SM2 非压缩公钥的编码和曲线点，不初始化 crypto 或访问 registry。
 *
 * 仅接受 128 个十六进制字符，或带 04 前缀的 130 字符编码；拒绝压缩点、无穷远点及曲线外点。
 * 先限制长度再调用当前 sm-crypto 的 verifyPublicKey，避免把任意长度输入交给大整数解析。
 * @param publicKey - 不可信的公钥输入。
 * @returns 编码和曲线点均有效时返回 true。
 * @example
 * ```ts
 * if (!isValidSM2PublicKey(body.clientPublicKey))
 *   return new Response(null, { status: 400 })
 * const clientId = await registry.register(body.clientPublicKey)
 * ```
 */
export function isValidSM2PublicKey(publicKey: unknown): publicKey is string {
  if (typeof publicKey !== 'string' || (publicKey.length !== 128 && publicKey.length !== 130) || !SM2_PUBLIC_KEY_REGEX.test(publicKey))
    return false
  const encoded = publicKey.length === 128 ? `04${publicKey}` : publicKey
  return smCrypto.sm2.verifyPublicKey(encoded) === true
}
