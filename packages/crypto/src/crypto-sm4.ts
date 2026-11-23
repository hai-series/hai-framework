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
import { core } from '@h-ai/core'
// @ts-expect-error sm-crypto 无类型定义
import smCrypto from 'sm-crypto'

import { cryptoM } from './crypto-i18n.js'
import {

  HaiCryptoError,

} from './crypto-types.js'
import { base64ToHex, hexToBase64 } from './crypto-utils.js'

const { sm4 } = smCrypto
const SM4_HEX_32_REGEX = /^[0-9a-f]{32}$/i

// ─── SM4 算法实现 ───

/**
 * 创建模块内部 SM4 原语，默认 CBC、随机 IV、PKCS#7 填充，返回结构化密文。
 * CBC/ECB 本身没有完整性认证；HTTP 必须使用 transport 先验签/MAC 再解密。
 * @returns 对称操作；解密需要完整 mode/encoding/iv，不猜测裸字符串。
 *
 * @example 模块内部上下文
 * ```ts
 * const symmetric = createSM4()
 * const key = symmetric.generateKey()
 * const encrypted = symmetric.encrypt('hello', key)
 * if (!encrypted.success) throw new Error(encrypted.error.message)
 * const decrypted = symmetric.decrypt(encrypted.data, key)
 * if (!decrypted.success) throw new Error(decrypted.error.message)
 * ```
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
     * 新数据使用默认 CBC，或每次显式传入新的随机 IV；CBC 仍需独立完整性认证，HTTP 使用 transport。
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
      if (!this.isValidKey(key)) {
        return core.err(
          HaiCryptoError.INVALID_KEY,
          cryptoM('crypto_sm4KeyInvalid'),
        )
      }

      try {
        const { mode = 'cbc', iv, outputFormat = 'hex' } = options
        if (typeof data !== 'string' || (mode !== 'cbc' && mode !== 'ecb')
          || (outputFormat !== 'hex' && outputFormat !== 'base64')) {
          return core.err(HaiCryptoError.INVALID_INPUT, cryptoM('crypto_inputInvalid'))
        }
        const actualIv = mode === 'cbc'
          ? iv ?? this.generateIV()
          : undefined
        if (mode === 'cbc' && (!actualIv || !this.isValidIV(actualIv)))
          return core.err(HaiCryptoError.INVALID_IV, cryptoM('crypto_sm4IvInvalid'))
        const sm4Options: Record<string, unknown> = {
          mode,
          padding: 'pkcs#7',
        }

        if (mode === 'cbc' && actualIv) {
          sm4Options.iv = actualIv
        }

        const encrypted = sm4.encrypt(data, key, sm4Options)

        if (!encrypted) {
          return core.err(
            HaiCryptoError.ENCRYPTION_FAILED,
            cryptoM('crypto_sm4EncryptEmpty'),
          )
        }

        return core.ok({
          mode,
          ciphertext: encodeCiphertext(encrypted, outputFormat),
          ...(actualIv
            ? { iv: actualIv }
            : {}),
          encoding: outputFormat,
        })
      }
      catch (error) {
        return core.err(
          HaiCryptoError.ENCRYPTION_FAILED,
          cryptoM('crypto_sm4EncryptFailed', {
            params: {
              error: error instanceof Error
                ? error.message
                : String(error),
            },
          }),
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
      if (!this.isValidKey(key)) {
        return core.err(
          HaiCryptoError.INVALID_KEY,
          cryptoM('crypto_sm4KeyInvalid'),
        )
      }

      try {
        if (!payload || typeof payload !== 'object'
          || (payload.mode !== 'cbc' && payload.mode !== 'ecb')
          || (payload.encoding !== 'hex' && payload.encoding !== 'base64')
          || typeof payload.ciphertext !== 'string') {
          return core.err(HaiCryptoError.DECRYPTION_FAILED, cryptoM('crypto_sm4DecryptFailed'))
        }
        const { mode, iv } = payload
        if (mode === 'cbc' && (!iv || !this.isValidIV(iv)))
          return core.err(HaiCryptoError.INVALID_IV, cryptoM('crypto_sm4IvInvalid'))
        const input = decodeCiphertext(payload)
        if (input.length === 0 || input.length % 32 !== 0 || /[^a-f0-9]/i.test(input))
          return core.err(HaiCryptoError.DECRYPTION_FAILED, cryptoM('crypto_sm4DecryptFailed'))

        const sm4Options: Record<string, unknown> = {
          mode,
          // 自行检查完整 PKCS#7 范围，底层会接受 0 或大于分组长度的填充值。
          padding: 'none',
          output: 'array',
        }

        if (mode === 'cbc' && iv) {
          sm4Options.iv = iv
        }

        const decrypted: number[] = sm4.decrypt(input, key, sm4Options)
        const padding = decrypted[decrypted.length - 1]
        if (padding < 1 || padding > 16
          || !decrypted.slice(-padding).every(byte => byte === padding)) {
          return core.err(
            HaiCryptoError.DECRYPTION_FAILED,
            cryptoM('crypto_sm4DecryptFailed'),
          )
        }

        // 加密入口只接受文本，解密也须拒绝非法 UTF-8，不能静默替换损坏字节。
        return core.ok(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(new Uint8Array(decrypted.slice(0, -padding))))
      }
      catch (error) {
        return core.err(
          HaiCryptoError.DECRYPTION_FAILED,
          cryptoM('crypto_sm4DecryptFailedWithError', {
            params: {
              error: error instanceof Error
                ? error.message
                : String(error),
            },
          }),
          error,
        )
      }
    },

    /**
     * 带 IV 加密（CBC 模式，自动生成随机 IV）
     *
     * @param data - 待加密明文
     * @param key - 密钥（32 字符十六进制）
     * @returns 成功时返回完整 { mode, ciphertext, iv, encoding }；失败时同 encrypt
     */
    encryptWithIV(
      data: string,
      key: string,
    ): HaiResult<EncryptWithIVResult> {
      // 随机源失败也由 encrypt 的 HaiResult 边界捕获。
      const result = this.encrypt(data, key, { mode: 'cbc' })

      if (!result.success) {
        return result
      }
      if (!result.data.iv)
        return core.err(HaiCryptoError.ENCRYPTION_FAILED, cryptoM('crypto_sm4EncryptEmpty'))

      return core.ok({
        mode: 'cbc',
        ciphertext: result.data.ciphertext,
        iv: result.data.iv,
        encoding: result.data.encoding,
      })
    },

    /**
     * 带 IV 解密（CBC 模式）
     *
     * 这是不含认证的底层 primitive；传输数据必须经 transport 验签及 MAC 后再调用，禁止直接用于 HTTP 解密。
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
      return this.decrypt({
        mode: 'cbc',
        ciphertext,
        iv,
        encoding: 'hex',
      }, key)
    },

    /** 校验密钥格式是否合法（32 字符十六进制） */
    isValidKey(key: string): boolean {
      return typeof key === 'string' && key.length === 32 && SM4_HEX_32_REGEX.test(key)
    },

    /** 校验 IV 格式是否合法（32 字符十六进制） */
    isValidIV(iv: string): boolean {
      return typeof iv === 'string' && iv.length === 32 && SM4_HEX_32_REGEX.test(iv)
    },
  }
}

// ─── 辅助函数 ───

/**
 * 使用宿主Web Crypto生成随机字节并编码为小写Hex，密钥/IV分别调用以保持独立。
 * @param byteLength - 需要的字节数。
 * @returns 长度为byteLength两倍的Hex。
 *
 * @example 模块内部上下文
 * ```ts
 * const key = generateRandomHex(16)
 * const iv = generateRandomHex(16)
 * ```
 */
function generateRandomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  // Web Crypto API，前后端通用
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 按输出编码转换 SM4 hex 密文。 */
function encodeCiphertext(ciphertext: string, encoding: SymmetricCiphertextEncoding): string {
  return encoding === 'base64'
    ? hexToBase64(ciphertext)
    : ciphertext
}

/**
 * 按已校验结构的encoding解码密文，不猜测裸字符串或丢弃IV。
 * @param payload - 完整结构化密文。
 * @returns SM4底层所需Hex字节文本。
 *
 * @example 模块内部上下文
 * ```ts
 * const payload: SymmetricDecryptInput = { mode: 'ecb', ciphertext: 'aGk=', encoding: 'base64' }
 * const bytes = decodeCiphertext(payload)
 * // 此例只演示编码转换，不执行ECB加解密，也不是有效的认证封装。
 * ```
 */
function decodeCiphertext(payload: SymmetricDecryptInput): string {
  return payload.encoding === 'base64'
    ? base64ToHex(payload.ciphertext)
    : payload.ciphertext
}
