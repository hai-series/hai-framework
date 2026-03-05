/**
 * @h-ai/crypto — 密码操作
 *
 * 提供 argon2id 密码哈希与校验功能。
 * @module crypto-password
 */

import type { Result } from '@h-ai/core'
import type { CryptoError, HashOperations, PasswordConfig, PasswordOperations } from './crypto-types.js'

import { core, err, ok } from '@h-ai/core'

import { CryptoErrorCode } from './crypto-config.js'
import { cryptoM } from './crypto-i18n.js'

// ─── 依赖接口 ───

/** createPasswordFunctions 所需的外部依赖 */
interface PasswordDeps {
  /** 哈希操作实例，用于迭代哈希计算 */
  hash: HashOperations
}

// ─── 工具函数 ───

/**
 * 生成加密安全的随机盐值
 *
 * 使用 Web Crypto API（crypto.getRandomValues）从大小写字母和数字中随机选取字符。
 *
 * @param length - 盐值长度（字符数）
 * @returns 随机盐值字符串
 */
function generateSalt(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const randomBytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(randomBytes)
  let salt = ''
  for (let i = 0; i < length; i++) {
    salt += chars.charAt(randomBytes[i] % chars.length)
  }
  return salt
}

/**
 * 对数据进行多次迭代哈希（密钥拉伸）
 *
 * 首次输入为 salt + data，后续每次用前一轮的哈希结果作为输入。
 * 任一轮哈希计算失败则立即返回错误。
 *
 * @param hash - 哈希操作实例
 * @param data - 原始数据（通常为密码）
 * @param salt - 盐值
 * @param iterations - 迭代次数
 * @returns 成功时返回最终哈希值（64 字符十六进制）
 */
function iterateHash(
  hash: HashOperations,
  data: string,
  salt: string,
  iterations: number,
): Result<string, CryptoError> {
  let current = salt + data
  for (let i = 0; i < iterations; i++) {
    const result = hash.hash(current)
    if (!result.success) {
      return result
    }
    current = result.data
  }
  return ok(current)
}

// ─── 密码操作工厂 ───

/**
 * 创建密码哈希操作实例
 *
 * 内部使用迭代加盐的方式生成密码哈希，格式为 `$hai$<iterations>$<salt>$<hash>`。
 *
 * @param deps - 依赖（需要注入哈希操作实例）
 * @returns PasswordOperations 接口实现
 */
export function createPasswordFunctions(deps: PasswordDeps): PasswordOperations {
  const { hash: hashOps } = deps

  return {
    /**
     * 对密码进行迭代加盐哈希
     *
     * 输出格式: `$hai$<iterations>$<salt>$<hash>`
     *
     * @param password - 明文密码（不能为空）
     * @param config - 可选配置（盐值长度、迭代次数）
     * @returns 成功时返回格式化的哈希字符串；失败时返回 INVALID_INPUT 或 HASH_FAILED
     */
    hash(password: string, config: PasswordConfig = {}): Result<string, CryptoError> {
      const { saltLength = 16, iterations = 10000 } = config

      try {
        if (!password) {
          return err({
            code: CryptoErrorCode.INVALID_INPUT,
            message: cryptoM('crypto_passwordEmpty'),
          })
        }

        const salt = generateSalt(saltLength)
        const hashResult = iterateHash(hashOps, password, salt, iterations)
        if (!hashResult.success) {
          return hashResult
        }

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
     * 验证密码是否匹配已存储的哈希
     *
     * 从哈希字符串中解析迭代次数和盐值，重新计算后比较。
     * 格式要求: `$hai$<iterations>$<salt>$<hash>`
     *
     * @param password - 待验证的明文密码
     * @param hash - 存储的哈希值
     * @returns 成功时返回 boolean；失败时返回 INVALID_INPUT 或 VERIFY_FAILED
     */
    verify(password: string, hash: string): Result<boolean, CryptoError> {
      try {
        if (!password || !hash) {
          return err({
            code: CryptoErrorCode.INVALID_INPUT,
            message: cryptoM('crypto_passwordHashEmpty'),
          })
        }

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

        const hashResult = iterateHash(hashOps, password, salt, storedIterations)
        if (!hashResult.success) {
          return hashResult
        }

        return ok(core.string.constantTimeEqual(hashResult.data, storedHash))
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
