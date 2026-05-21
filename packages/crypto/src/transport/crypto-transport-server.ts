/**
 * @h-ai/crypto — 传输加密服务端实现
 *
 * 提供：
 * - {@link createInMemoryKeyStore}：默认内存版 {@link TransportKeyStore}（含 LRU 淘汰）。
 * - {@link createTransportEncryption}：服务端管理器工厂。
 *
 * @module crypto-transport-server
 */

import type { HaiResult } from '@h-ai/core'
import type {
  EncryptedPayload,
  TransportCryptoServiceLike,
  TransportEncryptionManager,
  TransportKeyPair,
  TransportKeyStore,
} from './crypto-transport-types.js'
import { err, HaiCommonError, ok } from '@h-ai/core'

/**
 * 创建进程内 LRU 客户端密钥存储。
 *
 * ⚠️ 进程内实现：多节点部署时需让客户端首次请求后保持「会话粘性」（sticky session），
 * 否则后续请求路由到其他节点会因找不到客户端公钥而失败。需要跨节点请改用
 * Redis / 数据库实现 {@link TransportKeyStore}。
 *
 * @param maxClients - 最大客户端数（默认 10000），超过后按注册顺序淘汰最早条目。
 */
export function createInMemoryKeyStore(maxClients = 10000): TransportKeyStore {
  const clientKeys = new Map<string, string>()
  let counter = 0
  return {
    async register(publicKey) {
      counter++
      const clientId = `c_${counter}_${Date.now()}`
      if (clientKeys.size >= maxClients) {
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

/** {@link createTransportEncryption} 的配置项。 */
export interface CreateTransportEncryptionOptions {
  /**
   * 客户端公钥存储；默认使用 {@link createInMemoryKeyStore}。
   *
   * 多节点部署时通过此项注入 Redis 等共享存储以保证跨节点一致。
   */
  keyStore?: TransportKeyStore
  /** 默认内存 keyStore 的最大容量（仅当 `keyStore` 未提供时生效）。 */
  maxClients?: number
}

/**
 * 创建传输加密管理器。
 *
 * 启动时生成服务端非对称密钥对，所有客户端公钥由 `keyStore` 管理。
 *
 * @param cryptoService - 注入的非对称 + 对称加密实现（通常直接传入 `crypto` 实例）。
 * @param options - 可选配置。
 * @returns 成功返回管理器；密钥对生成失败返回 `HaiCommonError.INTERNAL_ERROR`。
 */
export function createTransportEncryption(
  cryptoService: TransportCryptoServiceLike,
  options: CreateTransportEncryptionOptions = {},
): HaiResult<TransportEncryptionManager> {
  const keyPairResult = cryptoService.asymmetric.generateKeyPair()
  if (!keyPairResult.success)
    return err(HaiCommonError.INTERNAL_ERROR, 'Failed to generate transport key pair', keyPairResult.error)
  const serverKeyPair: TransportKeyPair = keyPairResult.data
  const keyStore = options.keyStore ?? createInMemoryKeyStore(options.maxClients)

  const manager: TransportEncryptionManager = {
    getServerPublicKey() {
      return serverKeyPair.publicKey
    },

    async registerClientKey(clientPublicKey) {
      return keyStore.register(clientPublicKey)
    },

    async getClientPublicKey(clientId) {
      return keyStore.get(clientId)
    },

    async encryptResponse(clientId, data) {
      const clientPublicKey = await keyStore.get(clientId)
      if (!clientPublicKey)
        return err(HaiCommonError.NOT_FOUND, `Unknown transport client: ${clientId}`)

      // 1. 生成随机会话密钥；2. 用会话密钥加密内容；3. 用客户端公钥加密会话密钥。
      const symmetricKey = cryptoService.symmetric.generateKey()
      const encResult = cryptoService.symmetric.encryptWithIV(data, symmetricKey)
      if (!encResult.success)
        return err(HaiCommonError.INTERNAL_ERROR, 'Failed to encrypt response payload', encResult.error)
      const keyEncResult = cryptoService.asymmetric.encrypt(symmetricKey, clientPublicKey)
      if (!keyEncResult.success)
        return err(HaiCommonError.INTERNAL_ERROR, 'Failed to encrypt session key', keyEncResult.error)

      const payload: EncryptedPayload = {
        encryptedKey: keyEncResult.data,
        ciphertext: encResult.data.ciphertext,
        iv: encResult.data.iv,
      }
      return ok(payload)
    },

    decryptRequest(payload) {
      // 1. 用服务端私钥解出会话密钥；2. 用会话密钥解出明文。
      const keyDecResult = cryptoService.asymmetric.decrypt(payload.encryptedKey, serverKeyPair.privateKey)
      if (!keyDecResult.success)
        return err(HaiCommonError.INTERNAL_ERROR, 'Failed to decrypt session key', keyDecResult.error)
      const decResult = cryptoService.symmetric.decryptWithIV(payload.ciphertext, keyDecResult.data, payload.iv)
      if (!decResult.success)
        return err(HaiCommonError.INTERNAL_ERROR, 'Failed to decrypt request payload', decResult.error)
      return ok(decResult.data)
    },

    async close() {
      await keyStore.close?.()
    },
  }

  return ok(manager)
}

/**
 * 判断对象是否为合法 {@link EncryptedPayload}。
 *
 * 字段必须为非空字符串。用于服务端在调用 `decryptRequest` 前做形状校验，
 * 把畸形请求拦截在加密层之外。
 */
export function isValidEncryptedPayload(payload: unknown): payload is EncryptedPayload {
  if (!payload || typeof payload !== 'object')
    return false
  const p = payload as Record<string, unknown>
  return (
    typeof p.encryptedKey === 'string' && p.encryptedKey.length > 0
    && typeof p.ciphertext === 'string' && p.ciphertext.length > 0
    && typeof p.iv === 'string' && p.iv.length > 0
  )
}
