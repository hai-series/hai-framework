/**
 * @h-ai/crypto — 传输加密内存 key store
 *
 * 提供默认的进程内客户端公钥存储实现。
 * @module crypto-transport-store-memory
 */

import type { TransportKeyStore } from '../crypto-transport-types.js'

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
 * 创建进程内 FIFO 客户端密钥存储。
 *
 * 仅供显式选择的开发/测试场景；registry 不跨进程或重启持久化。
 * 生产须使用共享 Redis / 数据库 registry，并在各节点加载相同受管服务端密钥环。
 *
 * @param maxClients - 最大客户端数（默认 10000），超过后按注册顺序淘汰最早条目。
 */
export function createInMemoryKeyStore(maxClients = DEFAULT_MAX_CLIENTS): TransportKeyStore {
  const clientKeys = new Map<string, string>()
  const requests = new Map<string, number>()
  const capacity = normalizeMaxClients(maxClients)
  let counter = 0

  return {
    get stateScope(): 'local' { return 'local' },
    async register(publicKey) {
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
