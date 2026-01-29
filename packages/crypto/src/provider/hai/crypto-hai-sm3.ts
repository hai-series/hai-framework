/**
 * =============================================================================
 * @hai/crypto - HAI SM3 Provider
 * =============================================================================
 * SM3 国密哈希算法实现
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  SM3Error,
  SM3Options,
  SM3Provider,
} from '../../crypto-types.js'
import { err, ok } from '@hai/core'

// @ts-expect-error sm-crypto has no type definitions
import { sm3 } from 'sm-crypto'

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
 * 创建 HAI SM3 Provider
 */
export function createHaiSM3Provider(): SM3Provider {
  return {
    hash(
      data: string | Uint8Array,
      options: SM3Options = {},
    ): Result<string, SM3Error> {
      const { outputFormat = 'hex' } = options

      try {
        let input: string

        if (data instanceof Uint8Array) {
          input = Array.from(data)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
        }
        else {
          input = data
        }

        const result = sm3(input)

        if (!result) {
          return err({
            type: 'HASH_FAILED',
            message: 'SM3 hash returned empty result',
          })
        }

        if (outputFormat === 'buffer') {
          return ok(result)
        }

        return ok(result)
      }
      catch (error) {
        return err({
          type: 'HASH_FAILED',
          message: `SM3 hash failed: ${error}`,
        })
      }
    },

    hmac(data: string, key: string): Result<string, SM3Error> {
      try {
        const blockSize = 64
        const opad = 0x5C
        const ipad = 0x36

        let keyBytes: number[]
        if (key.length > blockSize) {
          const hashedKey = sm3(key)
          keyBytes = hexToBytes(hashedKey)
        }
        else {
          keyBytes = Array.from(Buffer.from(key, 'utf8'))
        }

        while (keyBytes.length < blockSize) {
          keyBytes.push(0)
        }

        const iKeyPad = keyBytes.map(b => b ^ ipad)
        const oKeyPad = keyBytes.map(b => b ^ opad)

        const innerInput = iKeyPad
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
          + Buffer.from(data, 'utf8').toString('hex')

        const innerHash = sm3(innerInput)

        const outerInput = oKeyPad
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
          + innerHash

        const result = sm3(outerInput)

        return ok(result)
      }
      catch (error) {
        return err({
          type: 'HMAC_FAILED',
          message: `HMAC-SM3 failed: ${error}`,
        })
      }
    },

    verify(data: string, expectedHash: string): Result<boolean, SM3Error> {
      try {
        const hashResult = sm3(data)
        return ok(hashResult.toLowerCase() === expectedHash.toLowerCase())
      }
      catch (error) {
        return err({
          type: 'HASH_FAILED',
          message: `SM3 verify failed: ${error}`,
        })
      }
    },
  }
}

export const haiSM3Provider = createHaiSM3Provider()
