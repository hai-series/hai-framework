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
import { HaiCryptoError } from '../crypto-types.js'
import { parseTransportServerKeyRing } from './crypto-transport-keyring.js'

/**
 * 创建传输加密管理器。
 *
 * 启动时校验并捕获受管版本化密钥环，所有客户端公钥由显式 `keyStore` 管理。
 *
 * @param cryptoService - 注入的非对称 + 对称加密实现（通常直接传入 `crypto` 实例）。
 * @param options - 必填的受管密钥环及客户端公钥存储。
 * @returns 成功返回管理器；配置或密钥配对无效返回脱敏错误。
 *
 * @remarks
 * 内部流程：
 *
 * 1. 创建时校验服务端受管密钥环及每对公私钥，捕获不可变快照，不隐式生成密钥。
 * 2. 协商端点保存客户端公钥，返回 getServerKeyId()、getServerPublicKey() 与 clientId。
 * 3. 普通业务请求到达时，上层先根据 `clientId` 确认客户端已注册，再调用 `decryptRequest()` 拿到明文请求体。
 * 4. 业务逻辑完成后，上层调用 `encryptResponse(clientId, data)` 为该客户端生成密文响应。
 * 5. `close()` 负责清理 `keyStore` 等底层资源。
 *
 * 若使用 `@h-ai/serv` / `@h-ai/kit`，上述 HTTP 协商与请求包装流程通常已由上层封装完成。
 * @example
 * ```ts
 * const server = createTransportEncryption(crypto, { serverKeyRing, keyStore: sharedRegistry })
 * if (!server.success)
 *   throw new Error(server.error.message)
 * ```
 */
export function createTransportEncryption(
  cryptoService: TransportCryptoServiceLike,
  options: TransportCreateServerOptions,
): HaiResult<TransportEncryptionManager> {
  const ring = parseTransportServerKeyRing(options?.serverKeyRing)
  if (!ring.success)
    return ring
  if (!options.keyStore || typeof options.keyStore.register !== 'function' || typeof options.keyStore.get !== 'function')
    return err(HaiCryptoError.INVALID_INPUT, cryptoM('crypto_transportKeyStoreRequired'))
  const serverKeys = new Map<string, TransportKeyPair>()
  for (const [id, key] of Object.entries(ring.data.keys)) {
    // 同时验证密钥格式和公私钥配对；只返回无敏感上下文的配置错误。
    const probe = cryptoService.asymmetric.encrypt('hai-transport-key-check', key.publicKey)
    if (!probe.success)
      return err(HaiCryptoError.INVALID_KEY, cryptoM('crypto_transportServerKeyRingInvalid'))
    const checked = cryptoService.asymmetric.decrypt(probe.data, key.privateKey)
    if (!checked.success || checked.data !== 'hai-transport-key-check')
      return err(HaiCryptoError.INVALID_KEY, cryptoM('crypto_transportServerKeyRingInvalid'))
    serverKeys.set(id, { publicKey: key.publicKey, privateKey: key.privateKey })
  }
  // 捕获不可变快照；调用方修改原对象不能悄悄轮换或更换同一 ID 对应的私钥。
  const activeKeyId = ring.data.activeKeyId
  const serverKeyPair = serverKeys.get(activeKeyId)!
  const keyStore = options.keyStore

  const manager: TransportEncryptionManager = {
    getServerKeyId() {
      return activeKeyId
    },
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
      try {
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
      }
      catch {
        // registry/注入实现故障仍按 HaiResult 返回，不携带可能包含连接凭据的原始异常。
        return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportResponseEncryptFailed'))
      }
    },

    decryptRequest(payload) {
      const key = serverKeys.get(payload.serverKeyId)
      if (!key)
        return err(HaiCryptoError.INVALID_KEY, cryptoM('crypto_transportServerKeyUnknown'))
      // 1. 用服务端私钥解出会话密钥；2. 用会话密钥解出明文。
      const keyDecResult = cryptoService.asymmetric.decrypt(payload.encryptedKey, key.privateKey)
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
