/**
 * @h-ai/crypto — 基于 @h-ai/cache 的有界传输状态。
 * 公钥、nonce 和分钟配额均有 TTL；满额拒绝新增，不逐出有效防重放记录。
 * @module crypto-transport-store-cache
 */
import type { CacheFunctions } from '@h-ai/cache'
import type { HaiError, HaiResult } from '@h-ai/core'
import type { TransportKeyStore } from '../crypto-transport-types.js'
import { cryptoM } from '../../crypto-i18n.js'
import { isValidSM2PublicKey } from '../../crypto-public-key.js'
import { HaiCryptoError } from '../../crypto-types.js'
import { isValidTransportKeyTtlSeconds } from '../crypto-transport-codec.js'
import { TRANSPORT_NONCE_RETENTION_MS, TRANSPORT_TIME_LIMITS } from '../crypto-transport-types.js'

const CACHE_PREFIX = 'hai:crypto:transport:cache'
const MINUTE_MS = 60_000
const MAX_QUOTA_ATTEMPTS = 32
// 请求签发时间可能在未来，从写入时起的 TTL 还需覆盖允许的最大未来偏差。
const MAX_NONCE_TTL_MS = TRANSPORT_NONCE_RETENTION_MS + TRANSPORT_TIME_LIMITS.maxFutureSkewSeconds * 1000

/**
 * 缓存传输状态配置；配额用于全应用缓存容量保底，不代替按 IP/用户/接口的业务限流。
 * 所有节点使用相同配额，cache 连接由应用持有。
 * @example
 * ```ts
 * import type { CreateCacheTransportKeyStoreOptions } from '@h-ai/crypto'
 * import { cache } from '@h-ai/cache'
 * const options: CreateCacheTransportKeyStoreOptions = { cache, ttlSeconds: 3600, maxRegistrationsPerMinute: 10000, maxRequestsPerMinute: 100000 }
 * ```
 */
export interface CreateCacheTransportKeyStoreOptions {
  /** 已初始化 cache；生产使用 Redis，memory 只用于开发和测试。 */
  readonly cache: CacheFunctions
  /** 公钥固定 TTL，整数 1～86400 秒，默认 3600；读取不续期。 */
  readonly ttlSeconds?: number
  /** 每分钟最多登记的公钥数，正安全整数，默认 10000；跨节点共享。 */
  readonly maxRegistrationsPerMinute?: number
  /** 每分钟最多接纳的新请求数，正安全整数，默认 100000；已用 nonce 不扣新配额。 */
  readonly maxRequestsPerMinute?: number
}

/**
 * 固定两条配额记录，不按分钟创建新键；CAS 同时更新计数和 TTL。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const counter: QuotaCounter = { used: 1, limit: 10000 }
 * ```
 */
interface QuotaCounter {
  used: number
  limit: number
}

function operationError(operation: string, error: HaiError): Error {
  // 外层只携带操作名和稳定码，避免缓存驱动错误泄漏连接凭据。
  return Object.assign(new Error(cryptoM('crypto_transportKeyStoreOperationFailed')), { operation, code: error.code })
}

function unwrap<T>(operation: string, result: HaiResult<T>): T {
  if (!result.success)
    throw operationError(operation, result.error)
  return result.data
}

function busy(): Error {
  return Object.assign(new Error(cryptoM('crypto_transportBusy')), { code: HaiCryptoError.TRANSPORT_BUSY.code })
}

function validId(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[^\w-]/.test(value)
}

/**
 * 创建统一缓存 registry；有限 TTL 配合共享分钟配额，限制公钥和 nonce 的累计量。
 * 生产必须 Redis 且有效 nonce 不得提前逐出；不关闭借用的 cache。
 * @param options - 缓存、公钥寿命及跨节点共享的新公钥/请求分钟配额。
 * @returns registry；配置无效同步抛 TypeError，操作故障 reject，配额满携带 hai:crypto:072。
 * @example
 * ```ts
 * import { cache } from '@h-ai/cache'
 * import { crypto } from '@h-ai/crypto'
 * const connected = await cache.init({ type: 'memory' })
 * if (!connected.success) throw new Error(connected.error.message)
 * try {
 *   const store = crypto.transport.createKeyStore({ cache, ttlSeconds: 3600 })
 *   const scope = store.stateScope // memory 为 local；生产应初始化 Redis。
 * }
 * finally { await cache.close() }
 * ```
 */
export function createCacheTransportKeyStore(options: CreateCacheTransportKeyStoreOptions): TransportKeyStore {
  const { cache, ttlSeconds = 3600, maxRegistrationsPerMinute = 10000, maxRequestsPerMinute = 100000 } = options
  if (!isValidTransportKeyTtlSeconds(ttlSeconds))
    throw new TypeError(cryptoM('crypto_transportKeyStoreTtlInvalid'))
  if (!Number.isSafeInteger(maxRegistrationsPerMinute) || maxRegistrationsPerMinute <= 0
    || !Number.isSafeInteger(maxRequestsPerMinute) || maxRequestsPerMinute <= 0) {
    throw new TypeError(cryptoM('crypto_transportKeyStoreQuotaInvalid'))
  }

  async function reserve(kind: 'register' | 'request', limit: number): Promise<void> {
    const key = `${CACHE_PREFIX}:quota:${kind}`
    for (let attempt = 0; attempt < MAX_QUOTA_ATTEMPTS; attempt++) {
      const previous = unwrap('cache.kv.get', await cache.kv.get<QuotaCounter>(key))
      if (previous !== null && (!Number.isSafeInteger(previous.used)
        || previous.used < 0 || previous.used > previous.limit || !Number.isSafeInteger(previous.limit))) {
        throw new Error(cryptoM('crypto_transportKeyStoreOperationFailed'))
      }
      if (previous !== null && previous.limit !== limit)
        throw new TypeError(cryptoM('crypto_transportKeyStoreQuotaMismatch'))
      // 首次写入启动 60 秒窗口，后续 CAS 保留 TTL。Redis 的原生过期统一所有节点的窗口，
      // 不用应用墙钟判断重置，避免时钟偏差使快慢节点反复领取新额度。
      const used = previous?.used ?? 0
      if (used >= limit)
        throw busy()
      if (unwrap('cache.kv.compareAndSwap', await cache.kv.compareAndSwap(
        key,
        previous ?? undefined,
        { used: used + 1, limit },
        previous === null
          ? { px: MINUTE_MS }
          : { keepTtl: true },
      ))) {
        return
      }
    }
    // 有界争用失败也拒绝写入，避免在热点期间无限重试或绕过配额。
    throw busy()
  }

  function clientKey(clientId: string): string {
    if (!validId(clientId))
      throw new TypeError(cryptoM('crypto_inputInvalid'))
    return `${CACHE_PREFIX}:client:${clientId}`
  }

  return {
    clientKeyTtlSeconds: ttlSeconds,
    get stateScope() {
      return cache.config?.type === 'redis'
        ? 'shared'
        : 'local'
    },
    async register(publicKey) {
      if (!isValidSM2PublicKey(publicKey))
        throw new TypeError(cryptoM('crypto_sm2PublicKeyInvalid'))
      await reserve('register', maxRegistrationsPerMinute)
      const clientId = `c_${globalThis.crypto.randomUUID()}`
      const applied = unwrap('cache.kv.set', await cache.kv.set(clientKey(clientId), publicKey, { ex: ttlSeconds, nx: true }))
      if (!applied)
        throw new Error(cryptoM('crypto_transportClientNotRegistered'))
      return clientId
    },
    async get(clientId) {
      return unwrap('cache.kv.get', await cache.kv.get<string>(clientKey(clientId))) ?? undefined
    },
    async claimRequest(clientId, requestId, expiresAt) {
      if (!validId(clientId) || !validId(requestId) || !Number.isSafeInteger(expiresAt))
        throw new TypeError(cryptoM('crypto_inputInvalid'))
      const remaining = expiresAt - Date.now()
      if (remaining <= 0)
        return false
      if (remaining > MAX_NONCE_TTL_MS) {
        throw new TypeError(cryptoM('crypto_transportNonceExpiryInvalid', {
          params: { maxMinutes: MAX_NONCE_TTL_MS / MINUTE_MS },
        }))
      }
      const key = `${CACHE_PREFIX}:request:${clientId}:${requestId}`
      // 常见重放不消耗新额度；并发重复最终仍由该 nonce 的单键 CAS 决定唯一胜者。
      if (unwrap('cache.kv.get', await cache.kv.get<boolean>(key)) !== null)
        return false
      await reserve('request', maxRequestsPerMinute)
      const ttl = expiresAt - Date.now()
      if (ttl <= 0)
        return false
      if (ttl > MAX_NONCE_TTL_MS) {
        throw new TypeError(cryptoM('crypto_transportNonceExpiryInvalid', {
          params: { maxMinutes: MAX_NONCE_TTL_MS / MINUTE_MS },
        }))
      }
      return unwrap('cache.kv.compareAndSwap', await cache.kv.compareAndSwap(key, undefined, true, { px: ttl }))
    },
    async delete(clientId) {
      unwrap('cache.kv.del', await cache.kv.del(clientKey(clientId)))
    },
  }
}
