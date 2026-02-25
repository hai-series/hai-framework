import type { Result } from '@h-ai/core'

import type { CryptoError, PasswordConfig, PasswordOperations, SM3Operations } from './crypto-types.js'

import { err, ok } from '@h-ai/core'

import { CryptoErrorCode } from './crypto-config.js'
import { cryptoM } from './crypto-i18n.js'

// ─── 依赖接口 ───

/** createPasswordFunctions 所需的外部依赖 */
interface PasswordDeps {
  /** SM3 操作实例，用于迭代哈希计算 */
  sm3: SM3Operations
}

// ─── 工具函数 ───

/**
 * 生成随机盐值
 *
 * 从大小写字母和数字中随机选取字符组成盐值字符串。
 *
 * @param length - 盐值长度（字符数）
 * @returns 随机盐值字符串
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
 * 对数据进行多次迭代哈希（密钥拉伸）
 *
 * 首次输入为 salt + data，后续每次用前一轮的哈希结果作为输入。
 * 任一轮 SM3 计算失败则立即返回错误。
 *
 * @param sm3 - SM3 操作实例
 * @param data - 原始数据（通常为密码）
 * @param salt - 盐值
 * @param iterations - 迭代次数
 * @returns 成功时返回最终哈希值（64 字符十六进制）
 */
function iterateHash(
  sm3: SM3Operations,
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

// ─── 密码操作工厂 ───

/**
 * 创建密码哈希操作实例
 *
 * 内部使用 SM3 迭代加盐的方式生成密码哈希，格式为 `$hai$<iterations>$<salt>$<hash>`。
 *
 * @param deps - 依赖（需要注入 SM3 操作实例）
 * @returns PasswordOperations 接口实现
 */
export function createPasswordFunctions(deps: PasswordDeps): PasswordOperations {
  const { sm3 } = deps

  return {
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
        const hashResult = iterateHash(sm3, password, salt, iterations)
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

        const hashResult = iterateHash(sm3, password, salt, storedIterations)
        if (!hashResult.success) {
          return hashResult
        }

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
