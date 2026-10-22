/**
 * @h-ai/crypto — SM2 公钥输入校验。
 * @module crypto-public-key
 */

// @ts-expect-error sm-crypto 未提供类型声明。
import smCrypto from 'sm-crypto'

const SM2_PUBLIC_KEY_REGEX = /^(?:04)?[0-9a-f]{128}$/i

/**
 * 纯函数校验 SM2 公钥的编码及曲线点，不初始化模块或访问 registry。
 * 仅接受128字符无前缀或130字符04前缀的十六进制非压缩点；拒绝曲线外点及其它编码。
 * @param publicKey - 不可信的输入。
 * @returns 有效字符串时为 true，并收窄类型；不证明密钥所有权，注册后仍须验签。
 *
 * @example
 * ```ts
 * import { crypto, isValidSM2PublicKey } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const generated = crypto.asymmetric.generateKeyPair()
 *   if (!generated.success) throw new Error(generated.error.message)
 *   const pair = generated.data
 *   const valid = isValidSM2PublicKey(pair.publicKey)
 *   const invalid = isValidSM2PublicKey('not-a-public-key')
 * }
 * finally { await crypto.close() }
 * ```
 */
export function isValidSM2PublicKey(publicKey: unknown): publicKey is string {
  if (typeof publicKey !== 'string' || (publicKey.length !== 128 && publicKey.length !== 130) || !SM2_PUBLIC_KEY_REGEX.test(publicKey))
    return false
  const encoded = publicKey.length === 128 ? `04${publicKey}` : publicKey
  return smCrypto.sm2.verifyPublicKey(encoded) === true
}
