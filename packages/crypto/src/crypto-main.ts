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
 * // 1. SM2 非对称加密
 * const keyPair = crypto.sm2.generateKeyPair()
 * if (keyPair.success) {
 *     const encrypted = crypto.sm2.encrypt('Hello', keyPair.data.publicKey)
 *     const decrypted = crypto.sm2.decrypt(encrypted.data, keyPair.data.privateKey)
 * }
 *
 * // 2. SM2 签名验签
 * const signature = crypto.sm2.sign('data', privateKey)
 * const isValid = crypto.sm2.verify('data', signature.data, publicKey)
 *
 * // 3. SM3 哈希
 * const hash = crypto.sm3.hash('Hello, SM3!')
 * const hmac = crypto.sm3.hmac('data', 'key')
 *
 * // 4. SM4 对称加密
 * const key = crypto.sm4.generateKey()
 * const ciphertext = crypto.sm4.encrypt('data', key)
 * const plaintext = crypto.sm4.decrypt(ciphertext.data, key)
 *
 * // 5. SM4 带 IV 加密（推荐）
 * const result = crypto.sm4.encryptWithIV('data', key)
 * if (result.success) {
 *     const decrypted = crypto.sm4.decryptWithIV(
 *         result.data.ciphertext,
 *         key,
 *         result.data.iv
 *     )
 * }
 * ```
 *
 * @module crypto-main
 * =============================================================================
 */

import type {
  CryptoConfig,
  CryptoConfigInput,
  CryptoService,
  SM2Operations,
  SM3Operations,
  SM4Operations,
} from './crypto-types.js'

import { CryptoConfigSchema } from './crypto-config.js'
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
 * 获取或创建 SM2 实例
 */
function getSM2(): SM2Operations {
  if (!sm2Instance) {
    sm2Instance = createSM2()
  }
  return sm2Instance
}

/**
 * 获取或创建 SM3 实例
 */
function getSM3(): SM3Operations {
  if (!sm3Instance) {
    sm3Instance = createSM3()
  }
  return sm3Instance
}

/**
 * 获取或创建 SM4 实例
 */
function getSM4(): SM4Operations {
  if (!sm4Instance) {
    sm4Instance = createSM4()
  }
  return sm4Instance
}

/**
 * 确保已初始化
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
 * 加密服务对象
 *
 * 统一的加密访问入口，提供以下功能：
 * - `crypto.sm2` - SM2 非对称加密（密钥生成、加解密、签名验签）
 * - `crypto.sm3` - SM3 哈希（哈希、HMAC、验证）
 * - `crypto.sm4` - SM4 对称加密（密钥生成、加解密）
 * - `crypto.init()` - 重新配置（可选）
 * - `crypto.config` - 当前配置
 * - `crypto.isInitialized` - 初始化状态
 *
 * @example
 * ```ts
 * import { crypto } from '@hai/crypto'
 *
 * // SM2 加密
 * const keyPair = crypto.sm2.generateKeyPair()
 * const encrypted = crypto.sm2.encrypt('data', keyPair.data.publicKey)
 *
 * // SM3 哈希
 * const hash = crypto.sm3.hash('data')
 *
 * // SM4 加密
 * const key = crypto.sm4.generateKey()
 * const ciphertext = crypto.sm4.encrypt('data', key)
 * ```
 */
export const crypto: CryptoService = {
  /** 获取 SM2 算法 */
  get sm2(): SM2Operations {
    ensureInitialized()
    return getSM2()
  },

  /** 获取 SM3 算法 */
  get sm3(): SM3Operations {
    ensureInitialized()
    return getSM3()
  },

  /** 获取 SM4 算法 */
  get sm4(): SM4Operations {
    ensureInitialized()
    return getSM4()
  },

  /** 获取当前配置 */
  get config(): CryptoConfig {
    return { ...currentConfig }
  },

  /** 检查是否已初始化 */
  get isInitialized(): boolean {
    return initialized
  },

  /** 初始化或重新配置 */
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

// =============================================================================
// 便捷函数导出
// =============================================================================

/**
 * 创建新的加密服务实例
 *
 * 用于需要独立配置的场景。
 *
 * @param config - 可选配置
 * @returns 新的加密服务实例
 *
 * @example
 * ```ts
 * import { createCryptoService } from '@hai/crypto'
 *
 * const myCrypto = createCryptoService()
 * const hash = myCrypto.sm3.hash('data')
 * ```
 */
export function createCryptoService(config?: CryptoConfigInput): CryptoService {
  const serviceConfig = CryptoConfigSchema.parse(config ?? {})
  const sm2 = createSM2()
  const sm3 = createSM3()
  const sm4 = createSM4()

  return {
    sm2,
    sm3,
    sm4,
    config: serviceConfig,
    isInitialized: true,
    init(newConfig?: CryptoConfigInput): void {
      if (newConfig) {
        Object.assign(serviceConfig, CryptoConfigSchema.parse(newConfig))
      }
    },
  }
}
