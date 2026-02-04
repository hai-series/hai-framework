/**
 * =============================================================================
 * @hai/crypto - SM2 国密非对称加密算法
 * =============================================================================
 *
 * SM2 国密非对称加密算法实现，基于 sm-crypto 库。
 *
 * SM2 算法特点：
 * - 基于椭圆曲线密码学（ECC）
 * - 密钥长度 256 位
 * - 支持加密、解密、签名、验签
 * - 国家密码管理局推荐算法
 *
 * 适用场景：
 * - 数据加密传输
 * - 数字签名
 * - 身份认证
 * - 密钥协商
 *
 * @module crypto-sm2
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  CryptoError,
  SM2EncryptOptions,
  SM2KeyPair,
  SM2Operations,
  SM2SignOptions,
} from './crypto-types.js'

import { err, ok } from '@hai/core'
// @ts-expect-error sm-crypto 无类型定义
import smCrypto from 'sm-crypto'

import { CryptoErrorCode } from './crypto-config.js'
import { cryptoM } from './crypto-i18n.js'

const { sm2 } = smCrypto

// =============================================================================
// SM2 算法实现
// =============================================================================

/**
 * 创建 SM2 算法实例。
 *
 * @returns SM2 操作接口
 *
 * @example
 * ```ts
 * import { createSM2 } from '@hai/crypto'
 *
 * const sm2 = createSM2()
 * const keyPair = sm2.generateKeyPair()
 * if (keyPair.success) {
 *   sm2.encrypt('data', keyPair.data.publicKey)
 * }
 * ```
 */
export function createSM2(): SM2Operations {
  return {
    /**
     * 生成 SM2 密钥对。
     *
     * @example
     * ```ts
     * const sm2 = createSM2()
     * const keyPair = sm2.generateKeyPair()
     * if (keyPair.success) {
     *   const { publicKey, privateKey } = keyPair.data
     * }
     * ```
     */
    generateKeyPair(): Result<SM2KeyPair, CryptoError> {
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
          message: cryptoM('crypto_sm2KeyPairGenerateFailed', { error: error instanceof Error ? error.message : String(error) }),
          cause: error,
        })
      }
    },

    /**
     * 使用公钥加密数据。
     *
     * @param data - 待加密明文
     * @param publicKey - 公钥
     * @param options - 可选参数
     *
     * @example
     * ```ts
     * const sm2 = createSM2()
     * const keyPair = sm2.generateKeyPair()
     * if (keyPair.success) {
     *   sm2.encrypt('hello', keyPair.data.publicKey)
     * }
     * ```
     */
    encrypt(
      data: string,
      publicKey: string,
      options: SM2EncryptOptions = {},
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
          message: cryptoM('crypto_sm2EncryptFailed', { error: error instanceof Error ? error.message : String(error) }),
          cause: error,
        })
      }
    },

    /**
     * 使用私钥解密数据。
     *
     * @param ciphertext - 密文
     * @param privateKey - 私钥
     * @param options - 可选参数
     *
     * @example
     * ```ts
     * const sm2 = createSM2()
     * const keyPair = sm2.generateKeyPair()
     * if (keyPair.success) {
     *   const encrypted = sm2.encrypt('hello', keyPair.data.publicKey)
     *   if (encrypted.success) {
     *     sm2.decrypt(encrypted.data, keyPair.data.privateKey)
     *   }
     * }
     * ```
     */
    decrypt(
      ciphertext: string,
      privateKey: string,
      options: SM2EncryptOptions = {},
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
          message: cryptoM('crypto_sm2DecryptFailedWithError', { error: error instanceof Error ? error.message : String(error) }),
          cause: error,
        })
      }
    },

    /**
     * 使用私钥签名数据。
     *
     * @param data - 待签名数据
     * @param privateKey - 私钥
     * @param options - 可选参数
     *
     * @example
     * ```ts
     * const sm2 = createSM2()
     * const keyPair = sm2.generateKeyPair()
     * if (keyPair.success) {
     *   sm2.sign('data', keyPair.data.privateKey)
     * }
     * ```
     */
    sign(
      data: string,
      privateKey: string,
      options: SM2SignOptions = {},
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
          message: cryptoM('crypto_sm2SignFailed', { error: error instanceof Error ? error.message : String(error) }),
          cause: error,
        })
      }
    },

    /**
     * 使用公钥验签。
     *
     * @param data - 原始数据
     * @param signature - 签名
     * @param publicKey - 公钥
     * @param options - 可选参数
     *
     * @example
     * ```ts
     * const sm2 = createSM2()
     * const keyPair = sm2.generateKeyPair()
     * if (keyPair.success) {
     *   const signature = sm2.sign('data', keyPair.data.privateKey)
     *   if (signature.success) {
     *     sm2.verify('data', signature.data, keyPair.data.publicKey)
     *   }
     * }
     * ```
     */
    verify(
      data: string,
      signature: string,
      publicKey: string,
      options: SM2SignOptions = {},
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
          message: cryptoM('crypto_sm2VerifyFailed', { error: error instanceof Error ? error.message : String(error) }),
          cause: error,
        })
      }
    },

    /**
     * 校验公钥格式是否合法。
     *
     * @param key - 公钥
     * @returns 是否合法
     *
     * @example
     * ```ts
     * const sm2 = createSM2()
     * const ok = sm2.isValidPublicKey('04...')
     * ```
     */
    isValidPublicKey(key: string): boolean {
      if (!key || typeof key !== 'string')
        return false
      // 公钥长度：无前缀 128 字符，带 04 前缀 130 字符
      const cleanKey = key.startsWith('04') ? key.slice(2) : key
      return /^[0-9a-f]{128}$/i.test(cleanKey)
    },

    /**
     * 校验私钥格式是否合法。
     *
     * @param key - 私钥
     * @returns 是否合法
     *
     * @example
     * ```ts
     * const sm2 = createSM2()
     * const ok = sm2.isValidPrivateKey('...')
     * ```
     */
    isValidPrivateKey(key: string): boolean {
      if (!key || typeof key !== 'string')
        return false
      // 私钥长度：64 字符
      return /^[0-9a-f]{64}$/i.test(key)
    },
  }
}

// =============================================================================
// 辅助函数（前后端通用）
// =============================================================================

/**
 * 判断字符串是否为 Base64 格式。
 *
 * @param str - 待检测字符串
 * @returns 是否为 Base64 格式
 */
function isBase64(str: string): boolean {
  return str.includes('+') || str.includes('/') || str.endsWith('=')
}

/**
 * Hex 转 Base64（前后端通用）。
 *
 * @param hex - 十六进制字符串
 * @returns Base64 字符串
 */
function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
  }
  // 使用前后端通用的方式
  if (typeof btoa !== 'undefined') {
    // 浏览器环境
    return btoa(String.fromCharCode(...bytes))
  }
  // Node.js 环境
  // eslint-disable-next-line node/prefer-global/buffer
  return globalThis.Buffer.from(bytes).toString('base64')
}

/**
 * Base64 转 Hex（前后端通用）。
 *
 * @param base64 - Base64 字符串
 * @returns 十六进制字符串
 */
function base64ToHex(base64: string): string {
  let bytes: Uint8Array
  if (typeof atob !== 'undefined') {
    // 浏览器环境
    const binary = atob(base64)
    bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
  }
  else {
    // Node.js 环境
    // eslint-disable-next-line node/prefer-global/buffer
    bytes = new Uint8Array(globalThis.Buffer.from(base64, 'base64'))
  }
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
