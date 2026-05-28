/**
 * @h-ai/crypto — SM4 对称加密
 *
 * 提供 SM4 对称加解密操作（CBC/ECB 模式）。
 * @module crypto-sm4
 */

import type { HaiResult } from '@h-ai/core'
import type {
  EncryptWithIVResult,
  SymmetricCiphertextEncoding,
  SymmetricDecryptInput,
  SymmetricEncryptedPayload,
  SymmetricEncryptOptions,
  SymmetricOperations,
} from './crypto-types.js'

import { err, ok } from '@h-ai/core'
// @ts-expect-error sm-crypto 无类型定义
import smCrypto from 'sm-crypto'

import { cryptoM } from './crypto-i18n.js'
import {

  HaiCryptoError,

} from './crypto-types.js'
import { base64ToHex, hexToBase64 } from './crypto-utils.js'

const { sm3, sm4 } = smCrypto
const SM4_HEX_32_REGEX = /^[0-9a-f]{32}$/i

// ─── SM4 算法实现 ───

/**
 * 创建 SM4 算法操作实例
 *
 * 基于 sm-crypto 库实现 SM4 对称加密/解密。
 * 支持 CBC（默认）和 ECB 两种模式，使用 PKCS#7 填充。
 * 密文以结构化字段返回，解密时不猜测字符串格式。
 *
 * @returns SymmetricOperations 接口实现
 */
export function createSM4(): SymmetricOperations {
  return {
    /** 生成随机密钥（16 字节 = 32 个十六进制字符） */
    generateKey(): string {
      return generateRandomHex(16)
    },

    /** 生成随机 IV（16 字节 = 32 个十六进制字符） */
    generateIV(): string {
      return generateRandomHex(16)
    },

    /**
     * SM4 对称加密
     *
     * 默认使用 CBC 并自动生成随机 IV，返回结构化字段。
     *
     * ⚠️ 安全警告：ECB 模式会让相同明文块产生相同密文块，泄漏结构信息。
     * 生产场景请使用默认 CBC，或显式传入 `{ mode: 'cbc', iv }`。
     *
     * @param data - 待加密明文
     * @param key - 密钥（32 字符十六进制）
     * @param options - 加密模式/IV/输出格式
     * @returns 成功时返回结构化密文；失败时返回 INVALID_KEY/INVALID_IV/ENCRYPTION_FAILED
     */
    encrypt(
      data: string,
      key: string,
      options: SymmetricEncryptOptions = {},
    ): HaiResult<SymmetricEncryptedPayload> {
      const {
        mode = 'cbc',
        iv,
        outputFormat = 'hex',
      } = options
      const actualIv = mode === 'cbc' ? iv ?? this.generateIV() : undefined

      if (!this.isValidKey(key)) {
        return err(
          HaiCryptoError.INVALID_KEY,
          cryptoM('crypto_sm4KeyInvalid'),
        )
      }

      if (mode === 'cbc') {
        if (!actualIv || !this.isValidIV(actualIv)) {
          return err(
            HaiCryptoError.INVALID_IV,
            cryptoM('crypto_sm4IvInvalid'),
          )
        }
      }

      try {
        const sm4Options: Record<string, unknown> = {
          mode,
          padding: 'pkcs#7',
        }

        if (mode === 'cbc' && actualIv) {
          sm4Options.iv = actualIv
        }

        const encrypted = sm4.encrypt(data, key, sm4Options)

        if (!encrypted) {
          return err(
            HaiCryptoError.ENCRYPTION_FAILED,
            cryptoM('crypto_sm4EncryptEmpty'),
          )
        }

        return ok({
          mode,
          ciphertext: encodeCiphertext(encrypted, outputFormat),
          ...(actualIv ? { iv: actualIv } : {}),
          encoding: outputFormat,
        })
      }
      catch (error) {
        return err(
          HaiCryptoError.ENCRYPTION_FAILED,
          cryptoM('crypto_sm4EncryptFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
          error,
        )
      }
    },

    /**
     * SM4 对称解密
     *
     * 使用结构化字段解密；解密模式、IV 与密文编码均来自 payload。
     *
     * @param payload - 结构化密文
     * @param key - 密钥（32 字符十六进制）
     * @returns 成功时返回明文；失败时返回 INVALID_KEY/INVALID_IV/DECRYPTION_FAILED
     */
    decrypt(
      payload: SymmetricDecryptInput,
      key: string,
    ): HaiResult<string> {
      const { mode, iv } = payload

      if (!this.isValidKey(key)) {
        return err(
          HaiCryptoError.INVALID_KEY,
          cryptoM('crypto_sm4KeyInvalid'),
        )
      }

      if (mode === 'cbc' && (!iv || !this.isValidIV(iv))) {
        return err(
          HaiCryptoError.INVALID_IV,
          cryptoM('crypto_sm4IvInvalid'),
        )
      }

      try {
        const input = decodeCiphertext(payload)

        const sm4Options: Record<string, unknown> = {
          mode,
          padding: 'pkcs#7',
        }

        if (mode === 'cbc' && iv) {
          sm4Options.iv = iv
        }

        const decrypted = sm4.decrypt(input, key, sm4Options)

        if (decrypted === false || decrypted === null || decrypted === undefined) {
          return err(
            HaiCryptoError.DECRYPTION_FAILED,
            cryptoM('crypto_sm4DecryptFailed'),
          )
        }

        return ok(decrypted)
      }
      catch (error) {
        return err(
          HaiCryptoError.DECRYPTION_FAILED,
          cryptoM('crypto_sm4DecryptFailedWithError', { params: { error: error instanceof Error ? error.message : String(error) } }),
          error,
        )
      }
    },

    /**
     * 带 IV 加密（CBC 模式，自动生成随机 IV）
     *
     * @param data - 待加密明文
     * @param key - 密钥（32 字符十六进制）
     * @returns 成功时返回 { ciphertext, iv }；失败时同 encrypt
     */
    encryptWithIV(
      data: string,
      key: string,
    ): HaiResult<EncryptWithIVResult> {
      const iv = this.generateIV()
      const result = this.encrypt(data, key, { mode: 'cbc', iv })

      if (!result.success) {
        return result
      }

      return ok({
        mode: 'cbc',
        ciphertext: result.data.ciphertext,
        iv,
        encoding: result.data.encoding,
      })
    },

    /**
     * 带 IV 解密（CBC 模式）
     *
     * @param ciphertext - 密文
     * @param key - 密钥
     * @param iv - 加密时使用的 IV
     * @returns 成功时返回明文；失败时同 decrypt
     */
    decryptWithIV(
      ciphertext: string,
      key: string,
      iv: string,
    ): HaiResult<string> {
      return this.decrypt({ mode: 'cbc', ciphertext, iv, encoding: 'hex' }, key)
    },

    /**
     * 从密码和盐值派生密钥
     *
     * 内部仅执行单次 SM3 哈希(password + salt)，取前 32 字符作为密钥。
     *
     * ⚠️ 安全警告：**此实现不是标准 KDF**，不具备密码爆破抗性（无迭代、无内存硬化）。
     * - **禁止用于密码存储**：密码散列请用 `crypto.password.hash()`。
     * - **禁止用于高价值密钥派生**：如需从密码派生加密密钥，请在应用层自行实现 PBKDF2 / scrypt / Argon2。
     * - 仅适用于测试、迭代兼容或不敏感的场景。
     *
     * @deprecated 未来版本可能移除。密码散列请用 `crypto.password.hash`；密钥派生请使用标准 KDF。
     * @param password - 密码
     * @param salt - 盐值
     * @returns 32 字符十六进制密钥
     */
    deriveKey(password: string, salt: string): string {
      const combined = password + salt
      const hash = sm3(combined)
      // 取前 32 个十六进制字符（16 字节）
      return hash.slice(0, 32)
    },

    /** 校验密钥格式是否合法（32 字符十六进制） */
    isValidKey(key: string): boolean {
      return SM4_HEX_32_REGEX.test(key)
    },

    /** 校验 IV 格式是否合法（32 字符十六进制） */
    isValidIV(iv: string): boolean {
      return SM4_HEX_32_REGEX.test(iv)
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

/** 按输出编码转换 SM4 hex 密文。 */
function encodeCiphertext(ciphertext: string, encoding: SymmetricCiphertextEncoding): string {
  return encoding === 'base64' ? hexToBase64(ciphertext) : ciphertext
}

/** 将结构化密文转换为 sm-crypto 需要的 hex 输入。 */
function decodeCiphertext(payload: SymmetricDecryptInput): string {
  return payload.encoding === 'base64' ? base64ToHex(payload.ciphertext) : payload.ciphertext
}
