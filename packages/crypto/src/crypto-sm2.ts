/**
 * @h-ai/crypto — SM2 非对称加密
 *
 * 提供 SM2 密钥对生成、加解密、签名与验签操作。
 * @module crypto-sm2
 */

import type { HaiResult } from '@h-ai/core'
import type { AsymmetricEncryptOptions, AsymmetricOperations, KeyPair, SignOptions } from './crypto-types.js'

import { err, ok } from '@h-ai/core'
// @ts-expect-error sm-crypto 无类型定义
import smCrypto from 'sm-crypto'

import { cryptoM } from './crypto-i18n.js'
import { isValidSM2PublicKey } from './crypto-public-key.js'
import {

  HaiCryptoError,

} from './crypto-types.js'
import { base64ToHex, hexToBase64, isBase64 } from './crypto-utils.js'

const { sm2 } = smCrypto
const SM2_PRIVATE_KEY_REGEX = /^[0-9a-f]{64}$/i

// ─── SM2 算法实现 ───

/**
 * 创建模块内部 SM2 原语；支持匹配的密文模式与 hex/base64 编码，公钥验证实际曲线点。
 * 包用户通过初始化后的 crypto.asymmetric 访问。
 * @returns 非对称操作；加密与签名使用不同方法，不能用加密代替发送方认证。
 *
 * @example 模块内部上下文
 * ```ts
 * const asymmetric = createSM2()
 * const generated = asymmetric.generateKeyPair()
 * if (!generated.success) throw new Error(generated.error.message)
 * const encrypted = asymmetric.encrypt('hello', generated.data.publicKey)
 * if (!encrypted.success) throw new Error(encrypted.error.message)
 * const decrypted = asymmetric.decrypt(encrypted.data, generated.data.privateKey)
 * if (!decrypted.success) throw new Error(decrypted.error.message)
 * ```
 */
export function createSM2(): AsymmetricOperations {
  return {
    /**
     * 生成 SM2 密钥对
     *
     * @returns 成功时返回包含公钥（130 字符含 04 前缀）和私钥（64 字符）的密钥对
     */
    generateKeyPair(): HaiResult<KeyPair> {
      try {
        const keyPair = sm2.generateKeyPairHex()
        return ok({
          publicKey: keyPair.publicKey,
          privateKey: keyPair.privateKey,
        })
      }
      catch (error) {
        return err(
          HaiCryptoError.KEY_GENERATION_FAILED,
          cryptoM('crypto_sm2KeyPairGenerateFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
          error,
        )
      }
    },

    /**
     * SM2 非对称加密
     *
     * 公钥自动补齐 04 前缀；支持 hex/base64 输出。
     *
     * @param data - 待加密明文
     * @param publicKey - 公钥（支持带/不带 04 前缀）
     * @param options - 加密选项（密文模式、输出格式）
     * @returns 成功时返回密文；失败时返回 INVALID_KEY 或 ENCRYPTION_FAILED
     */
    encrypt(
      data: string,
      publicKey: string,
      options: AsymmetricEncryptOptions = {},
    ): HaiResult<string> {
      const { cipherMode = 1, outputFormat = 'hex' } = options

      if (!this.isValidPublicKey(publicKey)) {
        return err(
          HaiCryptoError.INVALID_KEY,
          cryptoM('crypto_sm2PublicKeyInvalid'),
        )
      }

      try {
        // 确保公钥带 04 前缀
        const key = publicKey.length === 130 ? publicKey : `04${publicKey}`
        const encrypted = sm2.doEncrypt(data, key, cipherMode)

        if (!encrypted) {
          return err(
            HaiCryptoError.ENCRYPTION_FAILED,
            cryptoM('crypto_sm2EncryptEmpty'),
          )
        }

        if (outputFormat === 'base64') {
          return ok(hexToBase64(encrypted))
        }

        return ok(encrypted)
      }
      catch (error) {
        return err(
          HaiCryptoError.ENCRYPTION_FAILED,
          cryptoM('crypto_sm2EncryptFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
          error,
        )
      }
    },

    /**
     * SM2 非对称解密
     *
     * 自动检测 base64 格式输入并转换为 hex 后解密。
     *
     * @param ciphertext - 密文（hex 或 base64）
     * @param privateKey - 私钥（64 字符十六进制）
     * @param options - 解密选项（密文模式需与加密时一致）
     * @returns 成功时返回明文；失败时返回 INVALID_KEY 或 DECRYPTION_FAILED
     */
    decrypt(
      ciphertext: string,
      privateKey: string,
      options: AsymmetricEncryptOptions = {},
    ): HaiResult<string> {
      const { cipherMode = 1 } = options

      if (!this.isValidPrivateKey(privateKey)) {
        return err(
          HaiCryptoError.INVALID_KEY,
          cryptoM('crypto_sm2PrivateKeyInvalid'),
        )
      }

      try {
        // 自动检测并转换 base64 格式
        let input = ciphertext
        if (isBase64(ciphertext)) {
          input = base64ToHex(ciphertext)
        }

        const decrypted = sm2.doDecrypt(input, privateKey, cipherMode)

        if (decrypted === false || decrypted === null || decrypted === undefined) {
          return err(
            HaiCryptoError.DECRYPTION_FAILED,
            cryptoM('crypto_sm2DecryptFailed'),
          )
        }

        return ok(decrypted)
      }
      catch (error) {
        return err(
          HaiCryptoError.DECRYPTION_FAILED,
          cryptoM('crypto_sm2DecryptFailedWithError', { params: { error: error instanceof Error ? error.message : String(error) } }),
          error,
        )
      }
    },

    /**
     * SM2 数字签名
     *
     * 默认对数据先做哈希（hash=true），使用 userId 作为签名附加参数。
     *
     * @param data - 待签名数据
     * @param privateKey - 私钥（64 字符十六进制）
     * @param options - 签名选项（hash 开关、userId）
     * @returns 成功时返回签名字符串；失败时返回 INVALID_KEY 或 SIGN_FAILED
     */
    sign(
      data: string,
      privateKey: string,
      options: SignOptions = {},
    ): HaiResult<string> {
      const { hash = true, userId = '1234567812345678' } = options

      if (!this.isValidPrivateKey(privateKey)) {
        return err(
          HaiCryptoError.INVALID_KEY,
          cryptoM('crypto_sm2PrivateKeyInvalid'),
        )
      }

      try {
        const signature = sm2.doSignature(data, privateKey, { hash, userId })

        if (!signature) {
          return err(
            HaiCryptoError.SIGN_FAILED,
            cryptoM('crypto_sm2SignEmpty'),
          )
        }

        return ok(signature)
      }
      catch (error) {
        return err(
          HaiCryptoError.SIGN_FAILED,
          cryptoM('crypto_sm2SignFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
          error,
        )
      }
    },

    /**
     * SM2 签名验证
     *
     * 公钥自动补齐 04 前缀；hash/userId 需与签名时一致。
     *
     * @param data - 原始数据
     * @param signature - 签名值
     * @param publicKey - 公钥（支持带/不带 04 前缀）
     * @param options - 验签选项（hash 开关、userId）
     * @returns 成功时返回 boolean；失败时返回 INVALID_KEY 或 VERIFY_FAILED
     */
    verify(
      data: string,
      signature: string,
      publicKey: string,
      options: SignOptions = {},
    ): HaiResult<boolean> {
      const { hash = true, userId = '1234567812345678' } = options

      if (!this.isValidPublicKey(publicKey)) {
        return err(
          HaiCryptoError.INVALID_KEY,
          cryptoM('crypto_sm2PublicKeyInvalid'),
        )
      }

      try {
        // 确保公钥带 04 前缀
        const key = publicKey.length === 130 ? publicKey : `04${publicKey}`
        const isValid = sm2.doVerifySignature(data, signature, key, { hash, userId })
        return ok(!!isValid)
      }
      catch (error) {
        return err(
          HaiCryptoError.VERIFY_FAILED,
          cryptoM('crypto_sm2VerifyFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
          error,
        )
      }
    },

    /**
     * 校验公钥编码及曲线点是否合法
     *
     * 合法格式：128 字符十六进制（无前缀）或 130 字符（含 04 前缀）。
     *
     * @param key - 待校验公钥
     * @returns 编码有效且为 SM2 曲线上的非无穷远点时返回 true
     * @example `crypto.asymmetric.isValidPublicKey(clientPublicKey)`
     */
    isValidPublicKey(key: string): boolean {
      return isValidSM2PublicKey(key)
    },

    /**
     * 校验私钥格式是否合法
     *
     * 合法格式：64 字符十六进制。
     *
     * @param key - 待校验私钥
     * @returns 格式合法返回 true
     */
    isValidPrivateKey(key: string): boolean {
      if (!key || typeof key !== 'string')
        return false
      // 私钥长度：64 字符
      return SM2_PRIVATE_KEY_REGEX.test(key)
    },
  }
}
