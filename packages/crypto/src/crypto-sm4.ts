import type { Result } from '@h-ai/core'

import type {
  CryptoError,
  SM4EncryptWithIVResult,
  SM4Operations,
  SM4Options,
} from './crypto-types.js'

import { err, ok } from '@h-ai/core'
// @ts-expect-error sm-crypto 无类型定义
import smCrypto from 'sm-crypto'

import { CryptoErrorCode } from './crypto-config.js'
import { cryptoM } from './crypto-i18n.js'

const { sm3, sm4 } = smCrypto

// ─── SM4 算法实现 ───

/**
 * 创建 SM4 算法操作实例
 *
 * 基于 sm-crypto 库实现 SM4 对称加密/解密。
 * 支持 ECB（默认）和 CBC 两种模式，使用 PKCS#7 填充。
 * 密文支持 hex/base64 两种格式（解密时自动检测）。
 *
 * @returns SM4Operations 接口实现
 */
export function createSM4(): SM4Operations {
  return {
    generateKey(): string {
      return generateRandomHex(16)
    },

    generateIV(): string {
      return generateRandomHex(16)
    },

    encrypt(
      data: string,
      key: string,
      options: SM4Options = {},
    ): Result<string, CryptoError> {
      const {
        mode = 'ecb',
        iv,
        outputFormat = 'hex',
      } = options

      if (!this.isValidKey(key)) {
        return err({
          code: CryptoErrorCode.INVALID_KEY,
          message: cryptoM('crypto_sm4KeyInvalid'),
        })
      }

      if (mode === 'cbc' && !iv) {
        return err({
          code: CryptoErrorCode.INVALID_IV,
          message: cryptoM('crypto_sm4CbcNeedIv'),
        })
      }

      if (mode === 'cbc' && iv && !this.isValidIV(iv)) {
        return err({
          code: CryptoErrorCode.INVALID_IV,
          message: cryptoM('crypto_sm4IvInvalid'),
        })
      }

      try {
        const sm4Options: Record<string, unknown> = {
          mode,
          padding: 'pkcs#7',
        }

        if (mode === 'cbc' && iv) {
          sm4Options.iv = iv
        }

        const encrypted = sm4.encrypt(data, key, sm4Options)

        if (!encrypted) {
          return err({
            code: CryptoErrorCode.ENCRYPTION_FAILED,
            message: cryptoM('crypto_sm4EncryptEmpty'),
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
          message: cryptoM('crypto_sm4EncryptFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
          cause: error,
        })
      }
    },

    decrypt(
      ciphertext: string,
      key: string,
      options: SM4Options = {},
    ): Result<string, CryptoError> {
      const { mode = 'ecb', iv } = options

      if (!this.isValidKey(key)) {
        return err({
          code: CryptoErrorCode.INVALID_KEY,
          message: cryptoM('crypto_sm4KeyInvalid'),
        })
      }

      if (mode === 'cbc' && !iv) {
        return err({
          code: CryptoErrorCode.INVALID_IV,
          message: cryptoM('crypto_sm4CbcNeedIv'),
        })
      }

      try {
        // 自动检测并转换 base64 格式
        let input = ciphertext
        if (isBase64(ciphertext)) {
          input = base64ToHex(ciphertext)
        }

        const sm4Options: Record<string, unknown> = {
          mode,
          padding: 'pkcs#7',
        }

        if (mode === 'cbc' && iv) {
          sm4Options.iv = iv
        }

        const decrypted = sm4.decrypt(input, key, sm4Options)

        if (decrypted === false || decrypted === null || decrypted === undefined) {
          return err({
            code: CryptoErrorCode.DECRYPTION_FAILED,
            message: cryptoM('crypto_sm4DecryptFailed'),
          })
        }

        return ok(decrypted)
      }
      catch (error) {
        return err({
          code: CryptoErrorCode.DECRYPTION_FAILED,
          message: cryptoM('crypto_sm4DecryptFailedWithError', { params: { error: error instanceof Error ? error.message : String(error) } }),
          cause: error,
        })
      }
    },

    encryptWithIV(
      data: string,
      key: string,
    ): Result<SM4EncryptWithIVResult, CryptoError> {
      const iv = this.generateIV()
      const result = this.encrypt(data, key, { mode: 'cbc', iv })

      if (!result.success) {
        return result as Result<never, CryptoError>
      }

      return ok({ ciphertext: result.data, iv })
    },

    decryptWithIV(
      ciphertext: string,
      key: string,
      iv: string,
    ): Result<string, CryptoError> {
      return this.decrypt(ciphertext, key, { mode: 'cbc', iv })
    },

    deriveKey(password: string, salt: string): string {
      const combined = password + salt
      const hash = sm3(combined)
      // 取前 32 个十六进制字符（16 字节）
      return hash.slice(0, 32)
    },

    isValidKey(key: string): boolean {
      return /^[0-9a-f]{32}$/i.test(key)
    },

    isValidIV(iv: string): boolean {
      return /^[0-9a-f]{32}$/i.test(iv)
    },
  }
}

// ─── 辅助函数 ───

/**
 * 生成加密安全的随机十六进制字符串
 *
 * 使用 Web Crypto API（crypto.getRandomValues），前后端通用。
 *
 * @param byteLength - 字节数（输出字符数为 byteLength × 2）
 * @returns 小写十六进制字符串
 */
function generateRandomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  // Web Crypto API，前后端通用
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

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
