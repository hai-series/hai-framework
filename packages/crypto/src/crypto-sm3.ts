/**
 * @h-ai/crypto — SM3 哈希
 *
 * 提供 SM3 消息摘要与 HMAC 操作。
 * @module crypto-sm3
 */

import type { HaiResult } from '@h-ai/core'

import type { HashOperations, HashOptions } from './crypto-types.js'
import { core, err, ok } from '@h-ai/core'
// @ts-expect-error sm-crypto 无类型定义
import smCrypto from 'sm-crypto'

import { cryptoM } from './crypto-i18n.js'
import {
  HaiCryptoError,

} from './crypto-types.js'

const { sm3 } = smCrypto

// ─── SM3 算法实现 ───

/**
 * 创建模块内部 SM3 摘要/HMAC 操作；HMAC 使用 SM3，不是 HMAC-SHA256。
 * @returns 同步 HaiResult 操作；调用方判断 success 后读取摘要或匹配结果。
 *
 * @example 模块内部上下文
 * ```ts
 * const hash = createSM3()
 * const digest = hash.hash(new Uint8Array([104, 105]))
 * if (!digest.success) throw new Error(digest.error.message)
 * const verified = hash.verify('hi', digest.data)
 * if (!verified.success) throw new Error(verified.error.message)
 * ```
 */
export function createSM3(): HashOperations {
  return {
    /**
     * 计算 SM3 哈希
     *
     * 支持字符串（UTF-8/Hex）和 Uint8Array 输入。
     *
     * @param data - 待哈希数据
     * @param options - 输入编码与输出格式
     * @returns 成功时返回 64 字符十六进制哈希值；失败时返回 HASH_FAILED
     */
    hash(
      data: string | Uint8Array,
      options: HashOptions = {},
    ): HaiResult<string> {
      const { inputEncoding = 'utf8' } = options

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
          return err(
            HaiCryptoError.HASH_FAILED,
            cryptoM('crypto_sm3HashEmpty'),
          )
        }

        return ok(result)
      }
      catch (error) {
        return err(
          HaiCryptoError.HASH_FAILED,
          cryptoM('crypto_sm3HashFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
          error,
        )
      }
    },

    /**
     * 计算 HMAC-SM3 消息认证码
     *
     * 实现遵循 RFC 2104；密钥超过块大小（64 字节）时先对密钥做哈希。
     *
     * @param data - 待计算数据
     * @param key - HMAC 密钥
     * @returns 成功时返回 64 字符十六进制 HMAC 值；失败时返回 HMAC_FAILED
     */
    hmac(data: string, key: string): HaiResult<string> {
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
        return err(
          HaiCryptoError.HMAC_FAILED,
          cryptoM('crypto_sm3HmacFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
          error,
        )
      }
    },

    /**
     * 验证数据的哈希是否匹配
     *
     * 对数据做 SM3 哈希后与期望值比较（忽略大小写）。
     *
     * @param data - 原始数据
     * @param expectedHash - 期望的哈希值
     * @returns 成功时返回 boolean；失败时返回 HASH_FAILED
     */
    verify(data: string, expectedHash: string): HaiResult<boolean> {
      try {
        const hashResult = sm3(data)
        return ok(core.string.constantTimeEqual(hashResult.toLowerCase(), expectedHash.toLowerCase()))
      }
      catch (error) {
        return err(
          HaiCryptoError.HASH_FAILED,
          cryptoM('crypto_sm3VerifyFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
          error,
        )
      }
    },
  }
}

// ─── 辅助函数 ───

/**
 * 内部Hex字节转换，不执行输入校验；上游输入编码约束应在业务边界处理。
 * @param hex - 偶数长度Hex字节文本。
 * @returns 数字字节数组。
 *
 * @example 模块内部上下文
 * ```ts
 * const bytes = hexToBytes('6869')
 * ```
 */
function hexToBytes(hex: string): number[] {
  const bytes: number[] = []
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(Number.parseInt(hex.slice(i, i + 2), 16))
  }
  return bytes
}

/**
 * UTF-8 字符串转字节数组
 *
 * 使用 TextEncoder 进行编码转换。
 *
 * @param str - UTF-8 字符串
 * @returns 字节数组
 */
function stringToBytes(str: string): number[] {
  const encoder = new TextEncoder()
  return Array.from(encoder.encode(str))
}
