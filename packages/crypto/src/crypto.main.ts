/**
 * =============================================================================
 * @hai/crypto - 统一加密服务
 * =============================================================================
 * 提供统一的加密 API，支持多种 provider
 * =============================================================================
 */

import type {
  CryptoConfig,
  CryptoService,
  PasswordProvider,
  SM2Provider,
  SM3Provider,
  SM4Provider,
} from './crypto-types.js'

import { createHaiPasswordProvider } from './provider/hai/crypto-hai-password.js'
import { createHaiSM2Provider } from './provider/hai/crypto-hai-sm2.js'
import { createHaiSM3Provider } from './provider/hai/crypto-hai-sm3.js'
import { createHaiSM4Provider } from './provider/hai/crypto-hai-sm4.js'

// =============================================================================
// 默认配置
// =============================================================================

const defaultConfig: CryptoConfig = {
  provider: 'hai',
  defaultAlgorithm: 'sm',
}

// =============================================================================
// Provider 实例
// =============================================================================

let currentConfig: CryptoConfig = { ...defaultConfig }
let sm2Provider: SM2Provider | null = null
let sm3Provider: SM3Provider | null = null
let sm4Provider: SM4Provider | null = null
let passwordProvider: PasswordProvider | null = null

// =============================================================================
// Provider 工厂
// =============================================================================

function createSM2Provider(config: CryptoConfig): SM2Provider {
  switch (config.provider) {
    case 'hai':
      return createHaiSM2Provider()
    case 'webcrypto':
    case 'node':
    case 'custom':
      // 可扩展其他实现
      return createHaiSM2Provider()
    default:
      return createHaiSM2Provider()
  }
}

function createSM3Provider(config: CryptoConfig): SM3Provider {
  switch (config.provider) {
    case 'hai':
      return createHaiSM3Provider()
    case 'webcrypto':
    case 'node':
    case 'custom':
      return createHaiSM3Provider()
    default:
      return createHaiSM3Provider()
  }
}

function createSM4Provider(config: CryptoConfig): SM4Provider {
  switch (config.provider) {
    case 'hai':
      return createHaiSM4Provider()
    case 'webcrypto':
    case 'node':
    case 'custom':
      return createHaiSM4Provider()
    default:
      return createHaiSM4Provider()
  }
}

function createPasswordProvider(config: CryptoConfig): PasswordProvider {
  switch (config.provider) {
    case 'hai':
      return createHaiPasswordProvider()
    case 'webcrypto':
    case 'node':
    case 'custom':
      return createHaiPasswordProvider()
    default:
      return createHaiPasswordProvider()
  }
}

// =============================================================================
// 初始化
// =============================================================================

function ensureInitialized() {
  if (!sm2Provider) {
    sm2Provider = createSM2Provider(currentConfig)
  }
  if (!sm3Provider) {
    sm3Provider = createSM3Provider(currentConfig)
  }
  if (!sm4Provider) {
    sm4Provider = createSM4Provider(currentConfig)
  }
  if (!passwordProvider) {
    passwordProvider = createPasswordProvider(currentConfig)
  }
}

// =============================================================================
// 统一加密服务
// =============================================================================

/**
 * 统一加密服务实例
 *
 * @example
 * ```typescript
 * import { crypto } from '@hai/crypto'
 *
 * // SM2 非对称加密
 * const keyPair = crypto.sm2.generateKeyPair()
 * const encrypted = crypto.sm2.encrypt('data', keyPair.value.publicKey)
 *
 * // SM3 哈希
 * const hash = crypto.sm3.hash('data')
 *
 * // SM4 对称加密
 * const key = crypto.sm4.generateKey()
 * const ciphertext = crypto.sm4.encrypt('data', key)
 *
 * // 密码哈希
 * const passwordHash = crypto.password.hash('user-password')
 * const isValid = crypto.password.verify('user-password', passwordHash.value)
 * ```
 */
export const crypto: CryptoService = {
  get sm2(): SM2Provider {
    ensureInitialized()
    return sm2Provider!
  },

  get sm3(): SM3Provider {
    ensureInitialized()
    return sm3Provider!
  },

  get sm4(): SM4Provider {
    ensureInitialized()
    return sm4Provider!
  },

  get password(): PasswordProvider {
    ensureInitialized()
    return passwordProvider!
  },

  get config(): CryptoConfig {
    return { ...currentConfig }
  },

  async init(config?: Partial<CryptoConfig>): Promise<void> {
    if (config) {
      currentConfig = { ...defaultConfig, ...config }
    }

    // 重新创建 providers
    sm2Provider = createSM2Provider(currentConfig)
    sm3Provider = createSM3Provider(currentConfig)
    sm4Provider = createSM4Provider(currentConfig)
    passwordProvider = createPasswordProvider(currentConfig)
  },
}

// =============================================================================
// 便捷函数导出
// =============================================================================

/**
 * 创建新的加密服务实例
 */
export function createCryptoService(config?: Partial<CryptoConfig>): CryptoService {
  const serviceConfig: CryptoConfig = { ...defaultConfig, ...config }
  const sm2 = createSM2Provider(serviceConfig)
  const sm3 = createSM3Provider(serviceConfig)
  const sm4 = createSM4Provider(serviceConfig)
  const password = createPasswordProvider(serviceConfig)

  return {
    sm2,
    sm3,
    sm4,
    password,
    config: serviceConfig,
    async init(newConfig?: Partial<CryptoConfig>): Promise<void> {
      if (newConfig) {
        Object.assign(serviceConfig, newConfig)
      }
    },
  }
}
