import type { Result } from '@h-ai/core'

import type { CryptoConfig, CryptoConfigInput } from './crypto-config.js'
import type {
  CryptoError,
  CryptoFunctions,
  PasswordOperations,
  SM2Operations,
  SM3Operations,
  SM4Operations,
} from './crypto-types.js'

import { core, err, ok } from '@h-ai/core'

import { CryptoConfigSchema, CryptoErrorCode } from './crypto-config.js'
import { cryptoM } from './crypto-i18n.js'
import { createPasswordFunctions } from './crypto-password.js'
import { createSM2 } from './crypto-sm2.js'
import { createSM3 } from './crypto-sm3.js'
import { createSM4 } from './crypto-sm4.js'

// ─── 内部状态 ───

/** 当前配置（init 后赋值，close 后置 null） */
let currentConfig: CryptoConfig | null = null
/** 当前 SM2 操作实例 */
let currentSm2: SM2Operations | null = null
/** 当前 SM3 操作实例 */
let currentSm3: SM3Operations | null = null
/** 当前 SM4 操作实例 */
let currentSm4: SM4Operations | null = null
/** 当前密码哈希操作实例 */
let currentPassword: PasswordOperations | null = null

// ─── 未初始化占位 ───

const notInitialized = core.module.createNotInitializedKit<CryptoError>(
  CryptoErrorCode.NOT_INITIALIZED,
  () => cryptoM('crypto_notInitialized'),
)

/**
 * 创建同步操作的 Proxy 代理。
 * core.module.createNotInitializedKit.proxy() 默认返回异步占位，
 * 但 SM2/SM3/SM4/Password 接口为同步方法，需要使用 syncOperation。
 */
function syncProxy<T>(): T {
  return new Proxy({}, { get: () => notInitialized.syncOperation }) as T
}

const notInitializedSm2 = syncProxy<SM2Operations>()
const notInitializedSm3 = syncProxy<SM3Operations>()
const notInitializedSm4 = syncProxy<SM4Operations>()
const notInitializedPassword = syncProxy<PasswordOperations>()

// ─── 服务对象 ───

/**
 * 加密模块服务对象（统一入口）
 *
 * 使用前必须调用 `crypto.init()` 进行初始化。
 * 未初始化时访问 sm2/sm3/sm4/password 的任何方法均返回 NOT_INITIALIZED 错误。
 *
 * @example
 * ```ts
 * import { crypto } from '@h-ai/crypto'
 *
 * const result = await crypto.init({})
 * if (result.success) {
 *   const hash = crypto.sm3.hash('hello')
 *   const keyPair = crypto.sm2.generateKeyPair()
 * }
 * await crypto.close()
 * ```
 */
export const crypto: CryptoFunctions = {
  createHaiPasswordProvider(): PasswordOperations {
    const sm3 = createSM3()
    return createPasswordFunctions({ sm3 })
  },

  async init(config: CryptoConfigInput): Promise<Result<void, CryptoError>> {
    await crypto.close()
    try {
      const parsed = CryptoConfigSchema.parse(config)
      currentSm2 = createSM2()
      currentSm3 = createSM3()
      currentSm4 = createSM4()
      currentPassword = createPasswordFunctions({ sm3: currentSm3 })
      currentConfig = parsed
      return ok(undefined)
    }
    catch (error) {
      return err({
        code: CryptoErrorCode.CONFIG_ERROR,
        message: cryptoM('crypto_initFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        cause: error,
      })
    }
  },

  get sm2(): SM2Operations { return currentSm2 ?? notInitializedSm2 },
  get sm3(): SM3Operations { return currentSm3 ?? notInitializedSm3 },
  get sm4(): SM4Operations { return currentSm4 ?? notInitializedSm4 },
  get password(): PasswordOperations { return currentPassword ?? notInitializedPassword },
  get config() { return currentConfig },
  get isInitialized() { return currentConfig !== null },

  async close() {
    currentSm2 = null
    currentSm3 = null
    currentSm4 = null
    currentPassword = null
    currentConfig = null
  },
}
