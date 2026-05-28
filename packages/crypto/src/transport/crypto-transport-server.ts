/**
 * @h-ai/crypto — 传输加密服务端实现
 *
 * 提供服务端传输加密管理器工厂。
 *
 * @module crypto-transport-server
 */

import type { HaiResult } from '@h-ai/core'
import type {
  EncryptedPayload,
  TransportCreateServerOptions,
  TransportCryptoServiceLike,
  TransportEncryptionManager,
  TransportKeyPair,
} from './crypto-transport-types.js'
import { err, HaiCommonError, ok } from '@h-ai/core'
import { cryptoM } from '../crypto-i18n.js'
import { createInMemoryKeyStore } from './store-provider/crypto-transport-store-memory.js'

/**
 * 创建传输加密管理器。
 *
 * 启动时生成服务端非对称密钥对，所有客户端公钥由 `keyStore` 管理。
 *
 * @param cryptoService - 注入的非对称 + 对称加密实现（通常直接传入 `crypto` 实例）。
 * @param options - 可选配置。
 * @returns 成功返回管理器；密钥对生成失败返回 `HaiCommonError.INTERNAL_ERROR`。
 *
 * @remarks
 * 内部流程：
 *
 * 1. 创建时先生成一对服务端非对称密钥，并准备 `keyStore`。
 * 2. 上层在密钥协商端点中调用 `registerClientKey()` 保存客户端公钥，再把 `getServerPublicKey()` 返回给客户端。
 * 3. 普通业务请求到达时，上层先根据 `clientId` 确认客户端已注册，再调用 `decryptRequest()` 拿到明文请求体。
 * 4. 业务逻辑完成后，上层调用 `encryptResponse(clientId, data)` 为该客户端生成密文响应。
 * 5. `close()` 负责清理 `keyStore` 等底层资源。
 *
 * 若使用 `@h-ai/serv` / `@h-ai/kit`，上述 HTTP 协商与请求包装流程通常已由上层封装完成。
 */
export function createTransportEncryption(
  cryptoService: TransportCryptoServiceLike,
  options: TransportCreateServerOptions = {},
): HaiResult<TransportEncryptionManager> {
  const keyPairResult = cryptoService.asymmetric.generateKeyPair()
  if (!keyPairResult.success)
    return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportServerKeyGenerateFailed'), keyPairResult.error)
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
        return err(HaiCommonError.NOT_FOUND, cryptoM('crypto_transportClientNotRegistered'))

      // 1. 生成随机会话密钥；2. 用会话密钥加密内容；3. 用客户端公钥加密会话密钥。
      const symmetricKey = cryptoService.symmetric.generateKey()
      const encResult = cryptoService.symmetric.encryptWithIV(data, symmetricKey)
      if (!encResult.success)
        return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportResponseEncryptFailed'), encResult.error)
      const keyEncResult = cryptoService.asymmetric.encrypt(symmetricKey, clientPublicKey)
      if (!keyEncResult.success)
        return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportSessionKeyEncryptFailed'), keyEncResult.error)

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
        return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportSessionKeyDecryptFailed'), keyDecResult.error)
      const decResult = cryptoService.symmetric.decryptWithIV(payload.ciphertext, keyDecResult.data, payload.iv)
      if (!decResult.success)
        return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportRequestDecryptFailed'), decResult.error)
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
