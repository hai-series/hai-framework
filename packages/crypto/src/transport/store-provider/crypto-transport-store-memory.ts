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
 * ⚠️ 进程内实现：多节点部署时需让客户端首次请求后保持「会话粘性」（sticky session），
 * 否则后续请求路由到其他节点会因找不到客户端公钥而失败。需要跨节点请改用
 * Redis / 数据库实现 {@link TransportKeyStore}。
 *
 * @param maxClients - 最大客户端数（默认 10000），超过后按注册顺序淘汰最早条目。
 */
export function createInMemoryKeyStore(maxClients = DEFAULT_MAX_CLIENTS): TransportKeyStore {
  const clientKeys = new Map<string, string>()
  const capacity = normalizeMaxClients(maxClients)
  let counter = 0

  return {
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

    async delete(clientId) {
      clientKeys.delete(clientId)
    },

    async close() {
      clientKeys.clear()
    },
  }
}
