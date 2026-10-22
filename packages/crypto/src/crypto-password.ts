/**
 * @h-ai/crypto — 密码操作
 *
 * 提供迭代加盐（SM3）密码哈希与校验功能。
 * @module crypto-password
 */

import type { HaiResult } from '@h-ai/core'

import type { HashOperations, PasswordConfig, PasswordOperations } from './crypto-types.js'
import { core, err, ok } from '@h-ai/core'

import { cryptoM } from './crypto-i18n.js'
import { HaiCryptoError } from './crypto-types.js'

// ─── 常量 ───

/** 迭代次数最小值（防止退化为 0 迭代导致明文等价泄漏） */
const MIN_ITERATIONS = 1
/** 迭代次数最大值（防止伪造哈希触发 CPU 饱和） */
const MAX_ITERATIONS = 1_000_000
/** 盐值长度范围，限制异常输入 */
const MIN_SALT_LENGTH = 8
const MAX_SALT_LENGTH = 128

// ─── 依赖接口 ───

/**
 * 内部密码工厂依赖；复用实际 HashOperations，不替换为另一个摘要协议。
 *
 * @example 模块内部上下文
 * ```ts
 * const { crypto } = await import('@h-ai/crypto')
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const deps: PasswordDeps = { hash: crypto.hash }
 *   const operations = createPasswordFunctions(deps)
 *   const hashed = operations.hash('test-password', { iterations: 10000, saltLength: 16 })
 *   if (!hashed.success) throw new Error(hashed.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
interface PasswordDeps {
  /** 哈希操作实例，用于迭代哈希计算 */
  hash: HashOperations
}

// ─── 工具函数 ───

/**
 * 用Web Crypto随机字节生成当前密码格式的字母数字盐；本函数按字节取模映射，不承诺字符分布完全均匀。
 * @param length - 已由密码配置校验的盐字符数。
 * @returns 新盐文本，不与不同密码记录共用。
 *
 * @example 模块内部上下文
 * ```ts
 * const salt = generateSalt(16)
 * ```
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
 * 迭代SM3进行当前密码格式的密钥拉伸；任一轮失败立即返回，不继续使用失败结果。
 * @param hash - 实际HashOperations。
 * @param data - 密码输入。
 * @param salt - 当前记录的独立盐。
 * @param iterations - 已校验的正整数轮数。
 * @returns 最终SM3或原失败HaiResult。
 *
 * @example 模块内部上下文
 * ```ts
 * const { crypto } = await import('@h-ai/crypto')
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const result = iterateHash(crypto.hash, 'test-password', generateSalt(16), 10000)
 *   if (!result.success) throw new Error(result.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
function iterateHash(
  hash: HashOperations,
  data: string,
  salt: string,
  iterations: number,
): HaiResult<string> {
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
 * 创建模块内部迭代 SM3 加盐密码操作，格式为 $hai$iterations$salt$hash；包用户使用 crypto.password。
 * @param deps - 实际哈希操作。
 * @returns 密码哈希/校验操作，业务失败返回 HaiResult。
 *
 * @example 模块内部上下文
 * ```ts
 * const { crypto } = await import('@h-ai/crypto')
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const password = createPasswordFunctions({ hash: crypto.hash })
 *   const hashed = password.hash('test-password')
 *   if (!hashed.success) throw new Error(hashed.error.message)
 *   const verified = password.verify('test-password', hashed.data)
 *   if (!verified.success) throw new Error(verified.error.message)
 *   const matches = verified.data
 * }
 * finally { await crypto.close() }
 * ```
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
    hash(password: string, config: PasswordConfig = {}): HaiResult<string> {
      const { saltLength = 16, iterations = 10000 } = config

      try {
        if (!password) {
          return err(
            HaiCryptoError.INVALID_INPUT,
            cryptoM('crypto_passwordEmpty'),
          )
        }

        if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
          return err(
            HaiCryptoError.INVALID_INPUT,
            cryptoM('crypto_hashFormatInvalid'),
          )
        }
        if (!Number.isInteger(saltLength) || saltLength < MIN_SALT_LENGTH || saltLength > MAX_SALT_LENGTH) {
          return err(
            HaiCryptoError.INVALID_INPUT,
            cryptoM('crypto_hashFormatInvalid'),
          )
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
        return err(
          HaiCryptoError.HASH_FAILED,
          cryptoM('crypto_passwordHashFailed'),
          error,
        )
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
    verify(password: string, hash: string): HaiResult<boolean> {
      try {
        if (!password || !hash) {
          return err(
            HaiCryptoError.INVALID_INPUT,
            cryptoM('crypto_passwordHashEmpty'),
          )
        }

        const parts = hash.split('$')
        if (parts.length !== 5 || parts[1] !== 'hai') {
          return err(
            HaiCryptoError.INVALID_INPUT,
            cryptoM('crypto_hashFormatInvalid'),
          )
        }

        const storedIterations = Number.parseInt(parts[2], 10)
        const salt = parts[3]
        const storedHash = parts[4]

        if (
          Number.isNaN(storedIterations)
          || storedIterations < MIN_ITERATIONS
          || storedIterations > MAX_ITERATIONS
          || !salt
          || !storedHash
        ) {
          return err(
            HaiCryptoError.INVALID_INPUT,
            cryptoM('crypto_hashFormatInvalid'),
          )
        }

        const hashResult = iterateHash(hashOps, password, salt, storedIterations)
        if (!hashResult.success) {
          return hashResult
        }

        return ok(core.string.constantTimeEqual(hashResult.data, storedHash))
      }
      catch (error) {
        return err(
          HaiCryptoError.VERIFY_FAILED,
          cryptoM('crypto_passwordVerifyFailed'),
          error,
        )
      }
    },
  }
}
