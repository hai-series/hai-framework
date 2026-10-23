/**
 * @h-ai/crypto — 传输加密 Redis key store
 *
 * 通过 `@h-ai/cache` 持久化客户端公钥；通常应传入已初始化为 Redis 的 `cache` 实例。
 * @module crypto-transport-store-redis
 */

import type { CacheFunctions } from '@h-ai/cache'
import type { HaiError, HaiResult } from '@h-ai/core'
import type { TransportKeyStore } from '../crypto-transport-types.js'
import { cryptoM } from '../../crypto-i18n.js'
import { isValidSM2PublicKey } from '../../crypto-public-key.js'

const TRANSPORT_KEY_CACHE_PREFIX = 'hai:crypto:transport:client'

/**
 * 借用已初始化cache的registry配置；只有Redis provider报告shared，内存cache不能满足生产。
 * TTL是客户端公钥寿命，nonce另按认证窗口持有；连接由应用关闭。
 *
 * @example
 * ```ts
 * import { crypto, createRedisTransportKeyStore, parseTransportServerKeyRing } from '@h-ai/crypto'
 * import { cache } from '@h-ai/cache'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const connected = await cache.init({ type: 'redis', host: 'cache', port: 6379, password: process.env.HAI_CACHE_PASSWORD })
 *   if (!connected.success) throw new Error(connected.error.message)
 *   try {
 *     const registry = createRedisTransportKeyStore({ cache, ttlSeconds: 3600 })
 *     const options: import('@h-ai/crypto').CreateRedisTransportKeyStoreOptions = { cache, ttlSeconds: 3600 }
 *     const secondView = createRedisTransportKeyStore(options)
 *     const scope = secondView.stateScope
 *   }
 *   finally { await cache.close() }
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface CreateRedisTransportKeyStoreOptions {
  /** 已初始化的 `@h-ai/cache` 实例；生产环境通常应使用 Redis provider。 */
  readonly cache: CacheFunctions
  /** 客户端公钥的 TTL（正整数秒，最大 2147483647）；未传则保持不过期。 */
  readonly ttlSeconds?: number
}

function normalizeTtlSeconds(ttlSeconds: number | undefined): number | undefined {
  if (ttlSeconds === undefined)
    return undefined
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 2_147_483_647)
    throw new TypeError(cryptoM('crypto_transportKeyStoreTtlInvalid'))
  return ttlSeconds
}

function createClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return `c_${crypto.randomUUID()}`

  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

function toOperationError(operation: string, error: HaiError): Error {
  const wrapped = new Error(`${operation} failed: ${error.message}`, { cause: error }) as Error & { code?: string | number }
  wrapped.code = error.code
  return wrapped
}

function unwrapResult<T>(operation: string, result: HaiResult<T>): T {
  if (result.success)
    return result.data
  throw toOperationError(operation, result.error)
}

/**
 * 创建借用cache的公钥/nonce registry；生产必须Redis共享provider，nonce用单key原子CAS。
 * 公钥TTL省略则不过期，nonce有效期间禁止驱逐；容量由Redis部署预算管理，不提供DB maxClients。
 * @param options - 已初始化cache与可选正整数TTL秒，最大2147483647。
 * @returns registry；非法TTL同步TypeError，读写/公钥错误拒绝Promise，不关闭cache。
 *
 * @example
 * ```ts
 * import { crypto, createRedisTransportKeyStore, parseTransportServerKeyRing } from '@h-ai/crypto'
 * import { cache } from '@h-ai/cache'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const connected = await cache.init({ type: 'redis', host: 'cache', port: 6379, password: process.env.HAI_CACHE_PASSWORD })
 *   if (!connected.success) throw new Error(connected.error.message)
 *   try {
 *     const registry = createRedisTransportKeyStore({ cache, ttlSeconds: 3600 })
 *     const scope = registry.stateScope
 *   }
 *   finally { await cache.close() }
 * }
 * finally { await crypto.close() }
 * ```
 */
export function createRedisTransportKeyStore(options: CreateRedisTransportKeyStoreOptions): TransportKeyStore {
  const ttlSeconds = normalizeTtlSeconds(options.ttlSeconds)

  function buildCacheKey(clientId: string): string {
    return `${TRANSPORT_KEY_CACHE_PREFIX}:${clientId}`
  }

  return {
    get stateScope() { return options.cache.config?.type === 'redis' ? 'shared' : 'local' },
    async register(publicKey) {
      if (!isValidSM2PublicKey(publicKey))
        throw new TypeError(cryptoM('crypto_sm2PublicKeyInvalid'))
      const clientId = createClientId()
      const applied = unwrapResult(
        'cache.kv.set',
        await options.cache.kv.set(
          buildCacheKey(clientId),
          publicKey,
          ttlSeconds === undefined ? undefined : { ex: ttlSeconds },
        ),
      )
      if (!applied)
        throw new Error(cryptoM('crypto_transportClientNotRegistered'))
      return clientId
    },

    async get(clientId) {
      const publicKey = unwrapResult(
        'cache.kv.get',
        await options.cache.kv.get<string>(buildCacheKey(clientId)),
      )
      return publicKey ?? undefined
    },

    async claimRequest(clientId, requestId, expiresAt) {
      const ttl = expiresAt - Date.now()
      if (ttl <= 0)
        return false
      // 单 key 原子 CAS 在 Redis Cluster 中也只涉及一个 slot；生产禁止提前驱逐有效 nonce。
      return unwrapResult('cache.kv.compareAndSwap', await options.cache.kv.compareAndSwap(
        `hai:crypto:transport:request:${clientId}:${requestId}`,
        undefined,
        true,
        { px: ttl },
      ))
    },

    async delete(clientId) {
      unwrapResult('cache.kv.del', await options.cache.kv.del(buildCacheKey(clientId)))
    },
  }
}
