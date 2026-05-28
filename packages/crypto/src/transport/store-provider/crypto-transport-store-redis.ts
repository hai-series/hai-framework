/**
 * @h-ai/crypto — 传输加密 Redis key store
 *
 * 通过 `@h-ai/cache` 持久化客户端公钥；通常应传入已初始化为 Redis 的 `cache` 实例。
 * @module crypto-transport-store-redis
 */

import type { CacheFunctions } from '@h-ai/cache'
import type { HaiError, HaiResult } from '@h-ai/core'
import type { TransportKeyStore } from '../crypto-transport-types.js'

const TRANSPORT_KEY_CACHE_PREFIX = 'hai:crypto:transport:client'

/** 创建 Redis 版传输 key store 的配置。 */
export interface CreateRedisTransportKeyStoreOptions {
  /** 已初始化的 `@h-ai/cache` 实例；生产环境通常应使用 Redis provider。 */
  readonly cache: CacheFunctions
  /** 客户端公钥的 TTL（秒）；未传则保持不过期。 */
  readonly ttlSeconds?: number
}

function normalizeTtlSeconds(ttlSeconds: number | undefined): number | undefined {
  if (ttlSeconds === undefined || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0)
    return undefined
  return Math.floor(ttlSeconds)
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
 * 创建基于 `@h-ai/cache` 的传输 key store。
 *
 * 说明：本实现依赖 cache 模块的 KV 语义；若要获得跨节点共享能力，应传入
 * 已连接 Redis 的 `cache` 实例，而不是内存 provider。
 */
export function createRedisTransportKeyStore(options: CreateRedisTransportKeyStoreOptions): TransportKeyStore {
  const ttlSeconds = normalizeTtlSeconds(options.ttlSeconds)

  function buildCacheKey(clientId: string): string {
    return `${TRANSPORT_KEY_CACHE_PREFIX}:${clientId}`
  }

  return {
    async register(publicKey) {
      const clientId = createClientId()
      unwrapResult(
        'cache.kv.set',
        await options.cache.kv.set(
          buildCacheKey(clientId),
          publicKey,
          ttlSeconds === undefined ? undefined : { ex: ttlSeconds },
        ),
      )
      return clientId
    },

    async get(clientId) {
      const publicKey = unwrapResult(
        'cache.kv.get',
        await options.cache.kv.get<string>(buildCacheKey(clientId)),
      )
      return publicKey ?? undefined
    },

    async delete(clientId) {
      unwrapResult('cache.kv.del', await options.cache.kv.del(buildCacheKey(clientId)))
    },
  }
}
