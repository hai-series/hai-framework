/**
 * =============================================================================
 * @hai/crypto - SM4 国密对称加密算法
 * =============================================================================
 *
 * SM4 国密对称加密算法实现，基于 sm-crypto 库。
 *
 * SM4 算法特点：
 * - 分组长度 128 位（16 字节）
 * - 密钥长度 128 位（16 字节）
 * - 支持 ECB 和 CBC 模式
 * - 国家密码管理局推荐算法
 *
 * 适用场景：
 * - 数据加密存储
 * - 网络通信加密
 * - 文件加密
 * - 数据库字段加密
 *
 * 安全建议：
 * - 推荐使用 CBC 模式
 * - ECB 模式仅用于单块数据加密
 * - 每次加密使用不同的 IV
 *
 * @module crypto-sm4
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  CryptoError,
  SM4EncryptWithIVResult,
  SM4Operations,
  SM4Options,
} from './crypto-types.js'

import { err, ok } from '@hai/core'
// @ts-expect-error sm-crypto 无类型定义
import { sm3, sm4 } from 'sm-crypto'

import { CryptoErrorCode } from './crypto-config.js'

// =============================================================================
// SM4 算法实现
// =============================================================================

/**
 * 创建 SM4 算法实例
 *
 * @returns SM4 操作接口
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
          message: 'SM4 密钥必须为 16 字节（32 个十六进制字符）',
        })
      }

      if (mode === 'cbc' && !iv) {
        return err({
          code: CryptoErrorCode.INVALID_IV,
          message: 'CBC 模式必须提供 IV',
        })
      }

      if (mode === 'cbc' && iv && !this.isValidIV(iv)) {
        return err({
          code: CryptoErrorCode.INVALID_IV,
          message: 'SM4 IV 必须为 16 字节（32 个十六进制字符）',
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
            message: 'SM4 加密返回空结果',
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
          message: `SM4 加密失败: ${error}`,
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
          message: 'SM4 密钥必须为 16 字节（32 个十六进制字符）',
        })
      }

      if (mode === 'cbc' && !iv) {
        return err({
          code: CryptoErrorCode.INVALID_IV,
          message: 'CBC 模式必须提供 IV',
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
            message: 'SM4 解密失败',
          })
        }

        return ok(decrypted)
      }
      catch (error) {
        return err({
          code: CryptoErrorCode.DECRYPTION_FAILED,
          message: `SM4 解密失败: ${error}`,
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

// =============================================================================
// 辅助函数（前后端通用）
// =============================================================================

/**
 * 生成随机十六进制字符串（前后端通用）
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
 */
function isBase64(str: string): boolean {
  return str.includes('+') || str.includes('/') || str.endsWith('=')
}

/**
 * Hex 转 Base64（前后端通用）
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
 * Base64 转 Hex（前后端通用）
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
