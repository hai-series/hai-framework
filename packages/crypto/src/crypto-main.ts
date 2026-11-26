/**
 * @h-ai/crypto — 加密服务主入口
 *
 * 提供统一的 `crypto` 对象，聚合所有结构化加密操作。
 * @module crypto-main
 */

import type { HaiResult } from '@h-ai/core'
import type { AsymmetricOperations, CryptoFunctions, HashOperations, PasswordOperations, SymmetricOperations, TransportOperations } from './crypto-types.js'

import type { TransportCodec } from './transport/crypto-transport-server.js'
import { core } from '@h-ai/core'

import { cryptoM } from './crypto-i18n.js'
import { isValidSM2PublicKey } from './crypto-public-key.js'
import { createSM2 } from './crypto-sm2.js'
import { createSM3 } from './crypto-sm3.js'
import { createSM4 } from './crypto-sm4.js'
import {

  HaiCryptoError,

} from './crypto-types.js'
import { createTransportBodyPolicy, readTransportBody, resolveTransportBodyLimits, TRANSPORT_BODY_LIMITS, TRANSPORT_PLAINTEXT_RANGE } from './transport/crypto-transport-body.js'
import { createTransportClient } from './transport/crypto-transport-client.js'
import { createTransportErrorResponse } from './transport/crypto-transport-error.js'
import { parseTransportServerKeyRing } from './transport/crypto-transport-keyring.js'
import { authenticateTransportRequest, isKeyExchangePath } from './transport/crypto-transport-request.js'
import { createTransportEncryption } from './transport/crypto-transport-server.js'
import { TRANSPORT_PROTOCOL, TRANSPORT_TIME_LIMITS } from './transport/crypto-transport-types.js'
import { createCacheTransportKeyStore } from './transport/store-provider/crypto-transport-store-cache.js'

const logger = core.logger.child({ module: 'crypto', scope: 'main' })

const notInitialized = core.module.createNotInitializedKit(
  HaiCryptoError.NOT_INITIALIZED,
  () => cryptoM('crypto_notInitialized'),
)

/**
 * 创建当前入口的 Crypto 实例。服务端和浏览器共用生命周期及同步操作，入口负责装配密码操作。
 * @example 模块内部上下文
 * ```ts
 * const { createPasswordFunctions } = await import('./crypto-password.js')
 * const client = createCrypto({
 *   create: hash => ({ operations: createPasswordFunctions({ hash }) }),
 *   unavailable: kit => kit.proxy<PasswordOperations>('sync'),
 * })
 * ```
 */
export function createCrypto<Operations extends PasswordOperations>(runtime: {
  create: (hash: HashOperations) => { operations: Operations, close?: () => Promise<void> }
  unavailable: (kit: typeof notInitialized) => Operations
  createTransportCodec?: () => TransportCodec & { close: () => Promise<void> }
}): CryptoFunctions & { readonly password: Operations } {
  // ─── 内部状态 ───

  /** 是否已初始化 */
  let initialized = false
  /** 并发初始化防护标志 */
  let initInProgress = false
  /** 关闭后拒绝尚未完成的初始化重新发布操作域。 */
  let lifecycleGeneration = 0
  /** 当前非对称加密操作实例 */
  let currentAsymmetric: AsymmetricOperations | null = null
  /** 当前哈希操作实例 */
  let currentHash: HashOperations | null = null
  /** 当前对称加密操作实例 */
  let currentSymmetric: SymmetricOperations | null = null
  /** 当前密码哈希操作实例 */
  let currentPassword: ReturnType<typeof runtime.create> | null = null
  let currentTransportCodec: (TransportCodec & { close: () => Promise<void> }) | undefined
  let closing: Promise<void> | undefined

  function clearOperations(): Promise<void> | undefined {
    const password = currentPassword
    const transportCodec = currentTransportCodec
    currentAsymmetric = null
    currentHash = null
    currentSymmetric = null
    currentPassword = null
    currentTransportCodec = undefined
    initialized = false
    if (password?.close || transportCodec) {
      closing = Promise.all([
        password?.close?.(),
        transportCodec?.close(),
      ]).then(() => undefined).finally(() => { closing = undefined })
    }
    return closing
  }

  // ─── 未初始化占位 ───

  // 公钥校验是无状态边界检查；握手输入及配置解析在初始化前也需要可靠的 boolean。
  const unavailableAsymmetric = notInitialized.proxy<AsymmetricOperations>('sync')
  const notInitializedAsymmetric: AsymmetricOperations = {
    generateKeyPair: unavailableAsymmetric.generateKeyPair,
    encrypt: unavailableAsymmetric.encrypt,
    decrypt: unavailableAsymmetric.decrypt,
    sign: unavailableAsymmetric.sign,
    verify: unavailableAsymmetric.verify,
    isValidPublicKey: isValidSM2PublicKey,
    isValidPrivateKey: unavailableAsymmetric.isValidPrivateKey,
  }
  const notInitializedHash = notInitialized.proxy<HashOperations>('sync')
  const notInitializedSymmetric = notInitialized.proxy<SymmetricOperations>('sync')
  const notInitializedPassword = runtime.unavailable(notInitialized)

  // ─── 传输加密 ───
  // 直接复用顶层 crypto；服务端工厂先检查初始化，不为传输另建单例。

  // 通过函数声明（hoisted）延迟引用 `crypto`，避免 use-before-define 报错；
  // 实际调用发生在 init 之后，闭包持有的引用是安全的。
  function getCrypto(): CryptoFunctions {
    // eslint-disable-next-line ts/no-use-before-define
    return crypto
  }
  const transportOperations: TransportOperations = {
    createServer: options => getCrypto().isInitialized
      ? createTransportEncryption(getCrypto(), options, currentTransportCodec)
      : notInitialized.result(),
    createClient: options => createTransportClient({
      crypto: getCrypto(),
      ...options,
    }),
    protocol: TRANSPORT_PROTOCOL,
    isKeyExchangePath,
    bodyLimits: TRANSPORT_BODY_LIMITS,
    plaintextRange: TRANSPORT_PLAINTEXT_RANGE,
    timeLimits: TRANSPORT_TIME_LIMITS,
    createKeyStore: createCacheTransportKeyStore,
    parseServerKeyRing: parseTransportServerKeyRing,
    resolveBodyLimits: resolveTransportBodyLimits,
    createBodyPolicy: createTransportBodyPolicy,
    readBody: readTransportBody,
    authenticateRequest: authenticateTransportRequest,
    createErrorResponse: createTransportErrorResponse,
  }

  // ─── 服务对象 ───

  const crypto: CryptoFunctions & { readonly password: Operations } = {
    /**
     * 初始化加密模块
     *
     * 创建非对称/哈希/对称/密码哈希操作实例。
     * 重复调用会先关闭再重新初始化。
     *
     * @returns 成功时返回 ok(undefined)；失败时返回 INIT_FAILED
     */
    async init(): Promise<HaiResult<void>> {
      // 并发初始化防护：避免多次 init 同时执行导致资源泄漏
      if (initInProgress) {
        logger.warn('Crypto init already in progress, skipping concurrent call')
        return core.err(
          HaiCryptoError.INIT_FAILED,
          cryptoM('crypto_initFailed', {
            params: { error: 'Concurrent initialization detected' },
          }),
        )
      }
      initInProgress = true
      const generation = ++lifecycleGeneration

      try {
        // 让并发调用有机会观察到 initInProgress，确保防护逻辑真实生效。
        await Promise.resolve()
        if (generation !== lifecycleGeneration)
          return notInitialized.result()

        if (initialized)
          logger.warn('Crypto module is already initialized, reinitializing')
        if (initialized || closing) {
          await clearOperations()
          if (generation !== lifecycleGeneration)
            return notInitialized.result()
        }

        logger.info('Initializing crypto module')

        currentAsymmetric = createSM2()
        currentHash = createSM3()
        currentSymmetric = createSM4()
        currentPassword = runtime.create(currentHash)
        currentTransportCodec = runtime.createTransportCodec?.()
        initialized = true
        logger.info('Crypto module initialized')
        return core.ok(undefined)
      }
      catch (error) {
        await clearOperations()
        logger.error('Crypto module initialization failed', { error })
        return core.err(
          HaiCryptoError.INIT_FAILED,
          cryptoM('crypto_initFailed', {
            params: {
              error: error instanceof Error
                ? error.message
                : String(error),
            },
          }),
          error,
        )
      }
      finally {
        initInProgress = false
      }
    },

    /** 非对称加密操作；公钥校验不依赖初始化，其余操作需先初始化。 */
    get asymmetric(): AsymmetricOperations { return currentAsymmetric ?? notInitializedAsymmetric },
    /** 哈希操作（未初始化时所有方法返回 NOT_INITIALIZED） */
    get hash(): HashOperations { return currentHash ?? notInitializedHash },
    /** 对称加密操作（未初始化时所有方法返回 NOT_INITIALIZED） */
    get symmetric(): SymmetricOperations { return currentSymmetric ?? notInitializedSymmetric },
    /** 密码哈希操作（未初始化时所有方法返回 NOT_INITIALIZED） */
    get password(): Operations { return currentPassword?.operations ?? notInitializedPassword },
    /**
     * 传输加密操作（端到端混合加密）
     *
     * createServer 检查初始化后复用 asymmetric/symmetric；未初始化返回 NOT_INITIALIZED。
     */
    transport: transportOperations,
    /** 是否已初始化 */
    get isInitialized() { return initialized },

    /**
     * 关闭加密模块，释放内部状态
     *
     * 关闭后访问 asymmetric/hash/symmetric/password 会返回 NOT_INITIALIZED 错误。
     */
    async close() {
      lifecycleGeneration++
      if (!initialized) {
        await closing
        logger.info('Crypto module already closed, skipping')
        return
      }

      logger.info('Closing crypto module')

      await clearOperations()
      logger.info('Crypto module closed')
    },
  }
  return crypto
}
