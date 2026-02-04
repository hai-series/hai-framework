/**
 * =============================================================================
 * @hai/crypto - 密码哈希提供者
 * =============================================================================
 * 基于 SM3 的密码哈希和验证功能。
 * 使用 SM3 哈希算法对密码进行加盐哈希。
 *
 * @example
 * ```ts
 * import { crypto } from '@hai/crypto'

 * const provider = crypto.password.create()
 * const result = provider.hash('password')
 * if (result.success) {
 *   provider.verify('password', result.data)
 * }
 * ```
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { CryptoError, PasswordProvider, PasswordProviderConfig } from './crypto-types.js'
import { err, ok } from '@hai/core'
import { CryptoErrorCode } from './crypto-config.js'
import { cryptoM } from './crypto-i18n.js'
import { createSM3 } from './crypto-sm3.js'

// =============================================================================
// 类型定义
// =============================================================================

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 生成随机盐值。
 */
function generateSalt(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let salt = ''
  for (let i = 0; i < length; i++) {
    salt += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return salt
}

/**
 * 对密码进行多次迭代哈希。
 */
function iterateHash(
  sm3: ReturnType<typeof createSM3>,
  data: string,
  salt: string,
  iterations: number,
): Result<string, CryptoError> {
  let current = salt + data
  for (let i = 0; i < iterations; i++) {
    const result = sm3.hash(current)
    if (!result.success) {
      return result
    }
    current = result.data
  }
  return ok(current)
}

// =============================================================================
// 密码提供者实现
// =============================================================================

/**
 * 创建基于 SM3 的密码哈希提供者。
 *
 * @param config - 配置选项
 * @returns 密码提供者实例
 *
 * @example
 * ```ts
 * import { crypto } from '@hai/crypto'
 *
 * const provider = crypto.password.create({ iterations: 12000 })
 * const hashResult = provider.hash('myPassword123')
 * if (hashResult.success) {
 *   provider.verify('myPassword123', hashResult.data)
 * }
 * ```
 */
export function createHaiPasswordProvider(config: PasswordProviderConfig = {}): PasswordProvider {
  const { saltLength = 16, iterations = 10000 } = config
  const sm3 = createSM3()

  return {
    /**
     * 对密码进行哈希。
     *
     * @param password - 明文密码
     * @returns 哈希结果
     *
     * @example
     * ```ts
     * const provider = crypto.password.create()
     * const result = provider.hash('password')
     * ```
     */
    hash(password: string): Result<string, CryptoError> {
      try {
        if (!password) {
          return err({
            code: CryptoErrorCode.INVALID_INPUT,
            message: cryptoM('crypto_passwordEmpty'),
          })
        }

        // 生成随机盐值
        const salt = generateSalt(saltLength)

        // 进行迭代哈希
        const hashResult = iterateHash(sm3, password, salt, iterations)
        if (!hashResult.success) {
          return hashResult
        }

        // 格式：$hai$iterations$salt$hash
        const formatted = `$hai$${iterations}$${salt}$${hashResult.data}`
        return ok(formatted)
      }
      catch (error) {
        return err({
          code: CryptoErrorCode.HASH_FAILED,
          message: cryptoM('crypto_passwordHashFailed'),
          cause: error,
        })
      }
    },

    /**
     * 验证密码。
     *
     * @param password - 明文密码
     * @param hash - 已存储的哈希值
     * @returns 验证结果
     *
     * @example
     * ```ts
     * const provider = crypto.password.create()
     * const result = provider.verify('password', '$hai$...')
     * ```
     */
    verify(password: string, hash: string): Result<boolean, CryptoError> {
      try {
        if (!password || !hash) {
          return err({
            code: CryptoErrorCode.INVALID_INPUT,
            message: cryptoM('crypto_passwordHashEmpty'),
          })
        }

        // 解析存储的哈希：$hai$iterations$salt$hash
        const parts = hash.split('$')
        if (parts.length !== 5 || parts[1] !== 'hai') {
          return err({
            code: CryptoErrorCode.INVALID_INPUT,
            message: cryptoM('crypto_hashFormatInvalid'),
          })
        }

        const storedIterations = Number.parseInt(parts[2], 10)
        const salt = parts[3]
        const storedHash = parts[4]

        if (Number.isNaN(storedIterations) || !salt || !storedHash) {
          return err({
            code: CryptoErrorCode.INVALID_INPUT,
            message: cryptoM('crypto_hashFormatInvalid'),
          })
        }

        // 使用相同参数重新计算哈希
        const hashResult = iterateHash(sm3, password, salt, storedIterations)
        if (!hashResult.success) {
          return hashResult
        }

        // 比较哈希值
        return ok(hashResult.data === storedHash)
      }
      catch (error) {
        return err({
          code: CryptoErrorCode.VERIFY_FAILED,
          message: cryptoM('crypto_passwordVerifyFailed'),
          cause: error,
        })
      }
    },
  }
}
