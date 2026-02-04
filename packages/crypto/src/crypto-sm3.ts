/**
 * =============================================================================
 * @hai/crypto - SM3 国密哈希算法
 * =============================================================================
 *
 * SM3 国密哈希算法实现，基于 sm-crypto 库。
 *
 * SM3 算法特点：
 * - 输出长度 256 位（32 字节，64 个十六进制字符）
 * - 单向不可逆
 * - 抗碰撞性强
 * - 国家密码管理局推荐算法
 *
 * 适用场景：
 * - 数据完整性校验
 * - 数字签名的哈希预处理
 * - 消息认证码（HMAC）
 * - 密钥派生
 *
 * @module crypto-sm3
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  CryptoError,
  SM3Operations,
  SM3Options,
} from './crypto-types.js'

import { err, ok } from '@hai/core'
// @ts-expect-error sm-crypto 无类型定义
import smCrypto from 'sm-crypto'

import { CryptoErrorCode } from './crypto-config.js'
import { cryptoM } from './crypto-i18n.js'

const { sm3 } = smCrypto

// =============================================================================
// SM3 算法实现
// =============================================================================

/**
 * 创建 SM3 算法实例。
 *
 * @returns SM3 操作接口
 *
 * @example
 * ```ts
 * import { createSM3 } from '@hai/crypto'
 *
 * const sm3 = createSM3()
 * sm3.hash('data')
 * sm3.hmac('data', 'key')
 * ```
 */
export function createSM3(): SM3Operations {
  return {
    /**
     * 计算 SM3 哈希。
     *
     * @param data - 待哈希数据
     * @param options - 可选参数
     * @returns 哈希结果
     *
     * @example
     * ```ts
     * const sm3 = createSM3()
     * sm3.hash('hello')
     * ```
     */
    hash(
      data: string | Uint8Array,
      options: SM3Options = {},
    ): Result<string, CryptoError> {
      const { inputEncoding = 'utf8', outputFormat = 'hex' } = options

      try {
        let input: string | number[]

        if (data instanceof Uint8Array) {
          // Uint8Array 转为数字数组（sm-crypto 支持的格式）
          input = Array.from(data)
        }
        else if (inputEncoding === 'hex') {
          // 十六进制字符串转为数字数组
          input = hexToBytes(data)
        }
        else {
          // UTF-8 字符串直接传入
          input = data
        }

        const result = sm3(input)

        if (!result) {
          return err({
            code: CryptoErrorCode.HASH_FAILED,
            message: cryptoM('crypto_sm3HashEmpty'),
          })
        }

        if (outputFormat === 'array') {
          // 返回十六进制字符串（调用方可自行转换）
          return ok(result)
        }

        return ok(result)
      }
      catch (error) {
        return err({
          code: CryptoErrorCode.HASH_FAILED,
          message: cryptoM('crypto_sm3HashFailed', { error: error instanceof Error ? error.message : String(error) }),
          cause: error,
        })
      }
    },

    /**
     * 计算 HMAC-SM3。
     *
     * @param data - 待计算数据
     * @param key - 密钥
     * @returns HMAC 结果
     *
     * @example
     * ```ts
     * const sm3 = createSM3()
     * sm3.hmac('data', 'secret')
     * ```
     */
    hmac(data: string, key: string): Result<string, CryptoError> {
      try {
        const blockSize = 64
        const opad = 0x5C
        const ipad = 0x36

        // 处理密钥
        let keyBytes: number[]
        if (key.length > blockSize) {
          const hashedKey = sm3(key)
          keyBytes = hexToBytes(hashedKey)
        }
        else {
          keyBytes = stringToBytes(key)
        }

        // 填充密钥到块大小
        while (keyBytes.length < blockSize) {
          keyBytes.push(0)
        }

        // 计算 iKeyPad 和 oKeyPad
        const iKeyPad = keyBytes.map(b => b ^ ipad)
        const oKeyPad = keyBytes.map(b => b ^ opad)

        // 计算内层哈希：H(iKeyPad || data)
        const innerInput = iKeyPad.concat(stringToBytes(data))
        const innerHash = sm3(innerInput)

        // 计算外层哈希：H(oKeyPad || innerHash)
        const outerInput = oKeyPad.concat(hexToBytes(innerHash))
        const result = sm3(outerInput)

        return ok(result)
      }
      catch (error) {
        return err({
          code: CryptoErrorCode.HMAC_FAILED,
          message: cryptoM('crypto_sm3HmacFailed', { error: error instanceof Error ? error.message : String(error) }),
          cause: error,
        })
      }
    },

    /**
     * 验证哈希是否匹配。
     *
     * @param data - 原始数据
     * @param expectedHash - 期望哈希
     * @returns 是否匹配
     *
     * @example
     * ```ts
     * const sm3 = createSM3()
     * const hash = sm3.hash('data')
     * if (hash.success) {
     *   sm3.verify('data', hash.data)
     * }
     * ```
     */
    verify(data: string, expectedHash: string): Result<boolean, CryptoError> {
      try {
        const hashResult = sm3(data)
        return ok(hashResult.toLowerCase() === expectedHash.toLowerCase())
      }
      catch (error) {
        return err({
          code: CryptoErrorCode.HASH_FAILED,
          message: cryptoM('crypto_sm3VerifyFailed', { error: error instanceof Error ? error.message : String(error) }),
          cause: error,
        })
      }
    },
  }
}

// =============================================================================
// 辅助函数（前后端通用）
// =============================================================================

/**
 * 十六进制字符串转字节数组。
 */
function hexToBytes(hex: string): number[] {
  const bytes: number[] = []
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(Number.parseInt(hex.slice(i, i + 2), 16))
  }
  return bytes
}

/**
 * UTF-8 字符串转字节数组（前后端通用）。
 */
function stringToBytes(str: string): number[] {
  const encoder = new TextEncoder()
  return Array.from(encoder.encode(str))
}
