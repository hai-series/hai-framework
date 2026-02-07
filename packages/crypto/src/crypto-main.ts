/**
 * =============================================================================
 * @hai/crypto - 加密服务主入口
 * =============================================================================
 *
 * 本文件提供统一的 `crypto` 对象，聚合所有加密操作功能。
 *
 * 使用方式：
 * 1. 直接使用 `crypto.sm2/sm3/sm4` 进行加密操作
 * 2. 可选调用 `crypto.init()` 重新配置
 *
 * @example
 * ```ts
 * import { crypto } from '@hai/crypto'
 *
 * const keyPair = crypto.sm2.generateKeyPair()
 * if (keyPair.success) {
 *   const encrypted = crypto.sm2.encrypt('Hello', keyPair.data.publicKey)
 *   if (encrypted.success) {
 *     const decrypted = crypto.sm2.decrypt(encrypted.data, keyPair.data.privateKey)
 *   }
 * }
 *
 * const hash = crypto.sm3.hash('Hello, SM3!')
 * const key = crypto.sm4.generateKey()
 * const result = crypto.sm4.encryptWithIV('data', key)
 * if (result.success) {
 *   crypto.sm4.decryptWithIV(result.data.ciphertext, key, result.data.iv)
 * }
 * ```
 *
 * @module crypto-main
 * =============================================================================
 */

import type {
  CryptoConfig,
  CryptoConfigInput,
  PasswordProvider,
  PasswordProviderConfig,
  SM2Operations,
  SM3Operations,
  SM4Operations,
} from './crypto-types.js'

import { CryptoConfigSchema } from './crypto-config.js'
import { createHaiPasswordProvider } from './crypto-password.js'
import { createSM2 } from './crypto-sm2.js'
import { createSM3 } from './crypto-sm3.js'
import { createSM4 } from './crypto-sm4.js'

// =============================================================================
// 内部状态
// =============================================================================

/** 当前配置 */
let currentConfig: CryptoConfig = CryptoConfigSchema.parse({})

/** 是否已初始化 */
let initialized = false

/** SM2 算法实例 */
let sm2Instance: SM2Operations | null = null

/** SM3 算法实例 */
let sm3Instance: SM3Operations | null = null

/** SM4 算法实例 */
let sm4Instance: SM4Operations | null = null

// =============================================================================
// 算法工厂
// =============================================================================

/**
 * 获取或创建 SM2 实例。
 *
 * @returns SM2 操作实例
 */
function getSM2(): SM2Operations {
  if (!sm2Instance) {
    sm2Instance = createSM2()
  }
  return sm2Instance
}

/**
 * 获取或创建 SM3 实例。
 *
 * @returns SM3 操作实例
 */
function getSM3(): SM3Operations {
  if (!sm3Instance) {
    sm3Instance = createSM3()
  }
  return sm3Instance
}

/**
 * 获取或创建 SM4 实例。
 *
 * @returns SM4 操作实例
 */
function getSM4(): SM4Operations {
  if (!sm4Instance) {
    sm4Instance = createSM4()
  }
  return sm4Instance
}

/**
 * 确保已初始化。
 *
 * 如果尚未初始化，则创建 SM2/SM3/SM4 实例并标记初始化状态。
 */
function ensureInitialized(): void {
  if (!initialized) {
    sm2Instance = createSM2()
    sm3Instance = createSM3()
    sm4Instance = createSM4()
    initialized = true
  }
}

// =============================================================================
// 统一加密服务对象
// =============================================================================

/**
 * 加密服务对象。
 *
 * 统一的加密访问入口，提供以下功能：
 * - `crypto.sm2` - SM2 非对称加密（密钥生成、加解密、签名验签）
 * - `crypto.sm3` - SM3 哈希（哈希、HMAC、验证）
 * - `crypto.sm4` - SM4 对称加密（密钥生成、加解密）
 * - `crypto.password` - 密码哈希与验证
 * - `crypto.init()` - 重新配置（可选）
 * - `crypto.config` - 当前配置
 * - `crypto.isInitialized` - 初始化状态
 *
 * @example
 * ```ts
 * import { crypto } from '@hai/crypto'
 *
 * const keyPair = crypto.sm2.generateKeyPair()
 * if (keyPair.success) {
 *   const encrypted = crypto.sm2.encrypt('data', keyPair.data.publicKey)
 * }
 *
 * const hash = crypto.sm3.hash('data')
 * const key = crypto.sm4.generateKey()
 * crypto.sm4.encrypt('data', key)
 * ```
 */
export const crypto = {
  /** 获取 SM2 算法。 */
  get sm2(): SM2Operations {
    ensureInitialized()
    return getSM2()
  },

  /** 获取 SM3 算法。 */
  get sm3(): SM3Operations {
    ensureInitialized()
    return getSM3()
  },

  /** 获取 SM4 算法。 */
  get sm4(): SM4Operations {
    ensureInitialized()
    return getSM4()
  },

  /**
   * 密码哈希提供者入口。
   *
   * @example
   * ```ts
   * import { crypto } from '@hai/crypto'
   *
   * const provider = crypto.password.create({ iterations: 12000 })
   * const hash = provider.hash('password')
   * ```
   */
  password: {
    /**
     * 创建密码哈希提供者。
     *
     * @param config - 配置选项
     * @returns 密码提供者实例
     *
     * @example
     * ```ts
     * import { crypto } from '@hai/crypto'
     *
     * const provider = crypto.password.create()
     * provider.hash('password')
     * ```
     */
    create(config?: PasswordProviderConfig): PasswordProvider {
      return createHaiPasswordProvider(config)
    },
  },

  /** 获取当前配置。 */
  get config(): CryptoConfig {
    return { ...currentConfig }
  },

  /** 检查是否已初始化。 */
  get isInitialized(): boolean {
    return initialized
  },

  /**
   * 初始化或重新配置。
   *
   * @param config - 可选配置
   *
   * @example
   * ```ts
   * import { core } from '@hai/core'
   * import { crypto, CryptoConfigSchema } from '@hai/crypto'
   *
   * core.config.validate('crypto', CryptoConfigSchema)
   * const cfg = core.config.get('crypto')
   * if (cfg) {
   *   crypto.init(cfg)
   * }
   * ```
   */
  init(config?: CryptoConfigInput): void {
    if (config) {
      currentConfig = CryptoConfigSchema.parse(config)
    }

    // 重新创建算法实例
    sm2Instance = createSM2()
    sm3Instance = createSM3()
    sm4Instance = createSM4()
    initialized = true
  },
}
