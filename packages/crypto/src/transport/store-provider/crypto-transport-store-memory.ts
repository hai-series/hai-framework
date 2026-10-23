/**
 * @h-ai/crypto — 传输加密内存 key store
 *
 * 提供显式开发/测试使用的进程内客户端公钥存储，生产使用共享 registry。
 * @module crypto-transport-store-memory
 */

import type { TransportKeyStore } from '../crypto-transport-types.js'
import { cryptoM } from '../../crypto-i18n.js'
import { isValidSM2PublicKey } from '../../crypto-public-key.js'

const DEFAULT_MAX_CLIENTS = 10000

function normalizeMaxClients(maxClients: number): number {
  if (!Number.isFinite(maxClients))
    return DEFAULT_MAX_CLIENTS
  return Math.max(1, Math.floor(maxClients))
}

function createClientId(counter: number): string {
  const entropy = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2, 12)

  return `c_${counter}_${Date.now()}_${entropy}`
}

/**
 * 显式创建开发/测试用进程内FIFO公钥registry；不跨进程、不持久化，生产共享状态守卫拒绝它。
 * 有效nonce不会因公钥FIFO容量而提前逐出；过期nonce惰性清理。
 * @param maxClients - 公钥容量，默认10000，超限淘汰最早公钥。
 * @returns 本地registry；无效SM2公钥拒绝Promise。
 *
 * @example
 * ```ts
 * import { crypto, createInMemoryKeyStore } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const generated = crypto.asymmetric.generateKeyPair()
 *   if (!generated.success) throw new Error(generated.error.message)
 *   const pair = generated.data
 *   const registry = createInMemoryKeyStore(100)
 *   const clientId = await registry.register(pair.publicKey)
 *   const saved = await registry.get(clientId)
 *   await registry.delete?.(clientId)
 * }
 * finally { await crypto.close() }
 * ```
 */
export function createInMemoryKeyStore(maxClients = DEFAULT_MAX_CLIENTS): TransportKeyStore {
  const clientKeys = new Map<string, string>()
  const requests = new Map<string, number>()
  const capacity = normalizeMaxClients(maxClients)
  let counter = 0

  return {
    get stateScope(): 'local' { return 'local' },
    async register(publicKey) {
      if (!isValidSM2PublicKey(publicKey))
        throw new TypeError(cryptoM('crypto_sm2PublicKeyInvalid'))
      counter++
      const clientId = createClientId(counter)

      if (clientKeys.size >= capacity) {
        const oldest = clientKeys.keys().next().value
        if (oldest !== undefined)
          clientKeys.delete(oldest)
      }

      clientKeys.set(clientId, publicKey)
      return clientId
    },

    async get(clientId) {
      return clientKeys.get(clientId)
    },

    async claimRequest(clientId, requestId, expiresAt) {
      const now = Date.now()
      for (const [id, expiry] of requests) {
        if (expiry <= now)
          requests.delete(id)
      }
      const id = JSON.stringify([clientId, requestId])
      if (requests.has(id) || expiresAt <= now)
        return false
      // 开发/测试单进程内同步 check + set，不在两步之间 await；有效 nonce 不得按容量驱逐。
      requests.set(id, expiresAt)
      return true
    },

    async delete(clientId) {
      clientKeys.delete(clientId)
    },

    async close() {
      clientKeys.clear()
      requests.clear()
    },
  }
}
