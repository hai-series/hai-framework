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

const { sm3 } = smCrypto

// =============================================================================
// SM3 算法实现
// =============================================================================

/**
 * 创建 SM3 算法实例
 *
 * @returns SM3 操作接口
 */
export function createSM3(): SM3Operations {
  return {
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
            message: 'SM3 哈希返回空结果',
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
          message: `SM3 哈希计算失败: ${error}`,
          cause: error,
        })
      }
    },

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
          message: `HMAC-SM3 计算失败: ${error}`,
          cause: error,
        })
      }
    },

    verify(data: string, expectedHash: string): Result<boolean, CryptoError> {
      try {
        const hashResult = sm3(data)
        return ok(hashResult.toLowerCase() === expectedHash.toLowerCase())
      }
      catch (error) {
        return err({
          code: CryptoErrorCode.HASH_FAILED,
          message: `SM3 哈希验证失败: ${error}`,
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
 * 十六进制字符串转字节数组
 */
function hexToBytes(hex: string): number[] {
  const bytes: number[] = []
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(Number.parseInt(hex.slice(i, i + 2), 16))
  }
  return bytes
}

/**
 * UTF-8 字符串转字节数组（前后端通用）
 */
function stringToBytes(str: string): number[] {
  const encoder = new TextEncoder()
  return Array.from(encoder.encode(str))
}
