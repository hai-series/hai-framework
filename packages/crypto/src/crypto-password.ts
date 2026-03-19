/**
 * @h-ai/crypto — 密码操作
 *
 * 提供迭代加盐（SM3）密码哈希与校验功能。
 * @module crypto-password
 */

import type { Result } from '@h-ai/core'
import type { CryptoError, HashOperations, PasswordConfig, PasswordOperations } from './crypto-types.js'

import { core, err, ok } from '@h-ai/core'
import { pbkdf2Sync, randomBytes } from 'node:crypto'

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
 * 生成加密安全的随机盐值（hex）
 *
 * @param length - 盐值长度（字节数）
 * @returns 随机盐值字符串
 */
function generateSalt(length: number): string {
  return randomBytes(length).toString('hex')
}

/**
 * 旧版 `$hai$<iterations>$<salt>$<hash>` 的迭代哈希（兼容验证迁移）
 *
 * 首次输入为 salt + data，后续每次用前一轮哈希结果作为输入。
 * 任一轮哈希计算失败则立即返回错误。
 *
 * @param hash - 哈希操作实例
 * @param data - 原始数据（通常为密码）
 * @param salt - 盐值
 * @param iterations - 迭代次数
 * @returns 成功时返回最终哈希值（64 字符十六进制）
 */
function iterateLegacyHash(
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

const HASH_VERSION = 'v2'
const HASH_ALGORITHM = 'pbkdf2-sha256'
const DEFAULT_ITERATIONS = 210_000
const DEFAULT_SALT_BYTES = 16
const DERIVED_KEY_BYTES = 32

function formatV2Hash(iterations: number, saltHex: string, derivedHex: string): string {
  return `$hai$${HASH_VERSION}$${HASH_ALGORITHM}$${iterations}$${saltHex}$${derivedHex}`
}

// ─── 密码操作工厂 ───

/**
 * 创建密码哈希操作实例
 *
 * 内部使用标准 KDF（PBKDF2-SHA256）生成密码哈希，格式为：
 * `$hai$v2$pbkdf2-sha256$<iterations>$<saltHex>$<derivedHex>`。
 *
 * 同时保留对旧格式 `$hai$<iterations>$<salt>$<hash>` 的验证兼容，
 * 以支持线上平滑迁移。
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
      const { saltLength = DEFAULT_SALT_BYTES, iterations = DEFAULT_ITERATIONS } = config

      try {
        if (!password) {
          return err({
            code: CryptoErrorCode.INVALID_INPUT,
            message: cryptoM('crypto_passwordEmpty'),
          })
        }
        if (!Number.isInteger(saltLength) || saltLength <= 0 || !Number.isInteger(iterations) || iterations <= 0) {
          return err({
            code: CryptoErrorCode.INVALID_INPUT,
            message: cryptoM('crypto_hashFormatInvalid'),
          })
        }

        const salt = generateSalt(saltLength)
        const derived = pbkdf2Sync(password, Buffer.from(salt, 'hex'), iterations, DERIVED_KEY_BYTES, 'sha256')
        const formatted = formatV2Hash(iterations, salt, derived.toString('hex'))

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
     * 兼容两种格式：
     * - v2: `$hai$v2$pbkdf2-sha256$<iterations>$<saltHex>$<derivedHex>`
     * - legacy: `$hai$<iterations>$<salt>$<hash>`
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
        if (parts.length < 5 || parts[1] !== 'hai') {
          return err({
            code: CryptoErrorCode.INVALID_INPUT,
            message: cryptoM('crypto_hashFormatInvalid'),
          })
        }

        // v2: $hai$v2$pbkdf2-sha256$<iterations>$<saltHex>$<derivedHex>
        if (parts[2] === HASH_VERSION) {
          if (parts.length !== 7 || parts[3] !== HASH_ALGORITHM) {
            return err({
              code: CryptoErrorCode.INVALID_INPUT,
              message: cryptoM('crypto_hashFormatInvalid'),
            })
          }

          const storedIterations = Number.parseInt(parts[4], 10)
          const saltHex = parts[5]
          const storedHash = parts[6]

          if (Number.isNaN(storedIterations) || !saltHex || !storedHash) {
            return err({
              code: CryptoErrorCode.INVALID_INPUT,
              message: cryptoM('crypto_hashFormatInvalid'),
            })
          }

          const derived = pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), storedIterations, DERIVED_KEY_BYTES, 'sha256')
          return ok(core.string.constantTimeEqual(derived.toString('hex'), storedHash))
        }

        // legacy: $hai$<iterations>$<salt>$<hash>
        if (parts.length !== 5) {
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

        const hashResult = iterateLegacyHash(hashOps, password, salt, storedIterations)
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
