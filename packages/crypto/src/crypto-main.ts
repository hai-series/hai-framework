import type { Result } from '@h-ai/core'

import type {
  AsymmetricOperations,
  CryptoError,
  CryptoFunctions,
  HashOperations,
  PasswordOperations,
  SymmetricOperations,
} from './crypto-types.js'

import { core, err, ok } from '@h-ai/core'

import { CryptoErrorCode } from './crypto-config.js'
import { cryptoM } from './crypto-i18n.js'
import { createPasswordFunctions } from './crypto-password.js'
import { createSM2 } from './crypto-sm2.js'
import { createSM3 } from './crypto-sm3.js'
import { createSM4 } from './crypto-sm4.js'

// ─── 内部状态 ───

/** 是否已初始化 */
let initialized = false
/** 当前非对称加密操作实例 */
let currentAsymmetric: AsymmetricOperations | null = null
/** 当前哈希操作实例 */
let currentHash: HashOperations | null = null
/** 当前对称加密操作实例 */
let currentSymmetric: SymmetricOperations | null = null
/** 当前密码哈希操作实例 */
let currentPassword: PasswordOperations | null = null

// ─── 未初始化占位 ───

const notInitialized = core.module.createNotInitializedKit<CryptoError>(
  CryptoErrorCode.NOT_INITIALIZED,
  () => cryptoM('crypto_notInitialized'),
)

const notInitializedAsymmetric = notInitialized.proxy<AsymmetricOperations>('sync')
const notInitializedHash = notInitialized.proxy<HashOperations>('sync')
const notInitializedSymmetric = notInitialized.proxy<SymmetricOperations>('sync')
const notInitializedPassword = notInitialized.proxy<PasswordOperations>('sync')

// ─── 服务对象 ───

/**
 * 加密模块服务对象（统一入口）
 *
 * 使用前必须调用 `crypto.init()` 进行初始化。
 * 未初始化时访问 asymmetric/hash/symmetric/password 的任何方法均返回 NOT_INITIALIZED 错误。
 *
 * @example
 * ```ts
 * import { crypto } from '@h-ai/crypto'
 *
 * await crypto.init()
 * const hash = crypto.hash.hash('hello')
 * const keyPair = crypto.asymmetric.generateKeyPair()
 * await crypto.close()
 * ```
 */
export const crypto: CryptoFunctions = {
  /**
   * 初始化加密模块
   *
   * 创建非对称/哈希/对称/密码哈希操作实例。
   * 重复调用会先关闭再重新初始化。
   *
   * @returns 成功时返回 ok(undefined)；失败时返回 INIT_FAILED
   */
  async init(): Promise<Result<void, CryptoError>> {
    await crypto.close()
    try {
      currentAsymmetric = createSM2()
      currentHash = createSM3()
      currentSymmetric = createSM4()
      currentPassword = createPasswordFunctions({ hash: currentHash })
      initialized = true
      return ok(undefined)
    }
    catch (error) {
      return err({
        code: CryptoErrorCode.INIT_FAILED,
        message: cryptoM('crypto_initFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        cause: error,
      })
    }
  },

  /** 非对称加密操作（未初始化时所有方法返回 NOT_INITIALIZED） */
  get asymmetric(): AsymmetricOperations { return currentAsymmetric ?? notInitializedAsymmetric },
  /** 哈希操作（未初始化时所有方法返回 NOT_INITIALIZED） */
  get hash(): HashOperations { return currentHash ?? notInitializedHash },
  /** 对称加密操作（未初始化时所有方法返回 NOT_INITIALIZED） */
  get symmetric(): SymmetricOperations { return currentSymmetric ?? notInitializedSymmetric },
  /** 密码哈希操作（未初始化时所有方法返回 NOT_INITIALIZED） */
  get password(): PasswordOperations { return currentPassword ?? notInitializedPassword },
  /** 是否已初始化 */
  get isInitialized() { return initialized },

  /**
   * 关闭加密模块，释放内部状态
   *
   * 关闭后访问 asymmetric/hash/symmetric/password 会返回 NOT_INITIALIZED 错误。
   */
  async close() {
    currentAsymmetric = null
    currentHash = null
    currentSymmetric = null
    currentPassword = null
    initialized = false
  },
}
