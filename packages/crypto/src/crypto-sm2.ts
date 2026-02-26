import type { Result } from '@h-ai/core'

import type {
  AsymmetricEncryptOptions,
  AsymmetricOperations,
  CryptoError,
  KeyPair,
  SignOptions,
} from './crypto-types.js'

import { err, ok } from '@h-ai/core'
// @ts-expect-error sm-crypto 无类型定义
import smCrypto from 'sm-crypto'

import { CryptoErrorCode } from './crypto-config.js'
import { cryptoM } from './crypto-i18n.js'

const { sm2 } = smCrypto

// ─── SM2 算法实现 ───

/**
 * 创建 SM2 算法操作实例
 *
 * 基于 sm-crypto 库实现 SM2 非对称加密、签名与验签。
 * 公钥支持带/不带 04 前缀两种格式（内部统一补齐）。
 * 密文支持 hex/base64 两种格式（解密时自动检测）。
 *
 * @returns AsymmetricOperations 接口实现
 */
export function createSM2(): AsymmetricOperations {
  return {
    /**
     * 生成 SM2 密钥对
     *
     * @returns 成功时返回包含公钥（130 字符含 04 前缀）和私钥（64 字符）的密钥对
     */
    generateKeyPair(): Result<KeyPair, CryptoError> {
      try {
        const keyPair = sm2.generateKeyPairHex()
        return ok({
          publicKey: keyPair.publicKey,
          privateKey: keyPair.privateKey,
        })
      }
      catch (error) {
        return err({
          code: CryptoErrorCode.KEY_GENERATION_FAILED,
          message: cryptoM('crypto_sm2KeyPairGenerateFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
          cause: error,
        })
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
    ): Result<string, CryptoError> {
      const { cipherMode = 1, outputFormat = 'hex' } = options

      if (!this.isValidPublicKey(publicKey)) {
        return err({
          code: CryptoErrorCode.INVALID_KEY,
          message: cryptoM('crypto_sm2PublicKeyInvalid'),
        })
      }

      try {
        // 确保公钥带 04 前缀
        const key = publicKey.startsWith('04') ? publicKey : `04${publicKey}`
        const encrypted = sm2.doEncrypt(data, key, cipherMode)

        if (!encrypted) {
          return err({
            code: CryptoErrorCode.ENCRYPTION_FAILED,
            message: cryptoM('crypto_sm2EncryptEmpty'),
          })
        }

        if (outputFormat === 'base64') {
          return ok(hexToBase64(encrypted))
        }

        return ok(encrypted)
      }
      catch (error) {
        return err({
          code: CryptoErrorCode.ENCRYPTION_FAILED,
          message: cryptoM('crypto_sm2EncryptFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
          cause: error,
        })
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
    ): Result<string, CryptoError> {
      const { cipherMode = 1 } = options

      if (!this.isValidPrivateKey(privateKey)) {
        return err({
          code: CryptoErrorCode.INVALID_KEY,
          message: cryptoM('crypto_sm2PrivateKeyInvalid'),
        })
      }

      try {
        // 自动检测并转换 base64 格式
        let input = ciphertext
        if (isBase64(ciphertext)) {
          input = base64ToHex(ciphertext)
        }

        const decrypted = sm2.doDecrypt(input, privateKey, cipherMode)

        if (decrypted === false || decrypted === null || decrypted === undefined) {
          return err({
            code: CryptoErrorCode.DECRYPTION_FAILED,
            message: cryptoM('crypto_sm2DecryptFailed'),
          })
        }

        return ok(decrypted)
      }
      catch (error) {
        return err({
          code: CryptoErrorCode.DECRYPTION_FAILED,
          message: cryptoM('crypto_sm2DecryptFailedWithError', { params: { error: error instanceof Error ? error.message : String(error) } }),
          cause: error,
        })
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
    ): Result<string, CryptoError> {
      const { hash = true, userId = '1234567812345678' } = options

      if (!this.isValidPrivateKey(privateKey)) {
        return err({
          code: CryptoErrorCode.INVALID_KEY,
          message: cryptoM('crypto_sm2PrivateKeyInvalid'),
        })
      }

      try {
        const signature = sm2.doSignature(data, privateKey, { hash, userId })

        if (!signature) {
          return err({
            code: CryptoErrorCode.SIGN_FAILED,
            message: cryptoM('crypto_sm2SignEmpty'),
          })
        }

        return ok(signature)
      }
      catch (error) {
        return err({
          code: CryptoErrorCode.SIGN_FAILED,
          message: cryptoM('crypto_sm2SignFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
          cause: error,
        })
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
    ): Result<boolean, CryptoError> {
      const { hash = true, userId = '1234567812345678' } = options

      if (!this.isValidPublicKey(publicKey)) {
        return err({
          code: CryptoErrorCode.INVALID_KEY,
          message: cryptoM('crypto_sm2PublicKeyInvalid'),
        })
      }

      try {
        // 确保公钥带 04 前缀
        const key = publicKey.startsWith('04') ? publicKey : `04${publicKey}`
        const isValid = sm2.doVerifySignature(data, signature, key, { hash, userId })
        return ok(!!isValid)
      }
      catch (error) {
        return err({
          code: CryptoErrorCode.VERIFY_FAILED,
          message: cryptoM('crypto_sm2VerifyFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
          cause: error,
        })
      }
    },

    /**
     * 校验公钥格式是否合法
     *
     * 合法格式：128 字符十六进制（无前缀）或 130 字符（含 04 前缀）。
     *
     * @param key - 待校验公钥
     * @returns 格式合法返回 true
     */
    isValidPublicKey(key: string): boolean {
      if (!key || typeof key !== 'string')
        return false
      // 公钥长度：无前缀 128 字符，带 04 前缀 130 字符
      const cleanKey = key.startsWith('04') ? key.slice(2) : key
      return /^[0-9a-f]{128}$/i.test(cleanKey)
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
      return /^[0-9a-f]{64}$/i.test(key)
    },
  }
}

// ─── 辅助函数 ───

/**
 * 判断字符串是否为 Base64 格式
 *
 * 使用简单启发式：包含 +、/ 或以 = 结尾视为 base64。
 *
 * @param str - 待检测字符串
 */
function isBase64(str: string): boolean {
  return str.includes('+') || str.includes('/') || str.endsWith('=')
}

/**
 * Hex 字符串转 Base64 编码
 *
 * 前后端通用：优先使用 btoa（浏览器），回退到 Buffer（Node.js）。
 *
 * @param hex - 十六进制字符串（长度必须为偶数）
 * @returns Base64 编码字符串
 */
function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
  }
  if (typeof btoa !== 'undefined') {
    return btoa(String.fromCharCode(...bytes))
  }
  // eslint-disable-next-line node/prefer-global/buffer
  return globalThis.Buffer.from(bytes).toString('base64')
}

/**
 * Base64 编码转 Hex 字符串
 *
 * 前后端通用：优先使用 atob（浏览器），回退到 Buffer（Node.js）。
 *
 * @param base64 - Base64 编码字符串
 * @returns 小写十六进制字符串
 */
function base64ToHex(base64: string): string {
  let bytes: Uint8Array
  if (typeof atob !== 'undefined') {
    const binary = atob(base64)
    bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
  }
  else {
    // eslint-disable-next-line node/prefer-global/buffer
    bytes = new Uint8Array(globalThis.Buffer.from(base64, 'base64'))
  }
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
