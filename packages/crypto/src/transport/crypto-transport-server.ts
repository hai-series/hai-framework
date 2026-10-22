/**
 * @h-ai/crypto — 传输加密服务端实现
 *
 * 提供服务端传输加密管理器工厂。
 *
 * @module crypto-transport-server
 */

import type { HaiResult } from '@h-ai/core'
import type {
  TransportCreateServerOptions,
  TransportCryptoServiceLike,
  TransportEncryptionManager,
  TransportKeyPair,
} from './crypto-transport-types.js'
import { core, err, HaiCommonError, ok } from '@h-ai/core'
import { cryptoM } from '../crypto-i18n.js'
import { isValidSM2PublicKey } from '../crypto-public-key.js'
import { HaiCryptoError } from '../crypto-types.js'
import { hashTransportPath, isValidEncryptedPayload, openTransportPayload, sealTransportPayload, transportAuthenticationFailure } from './crypto-transport-codec.js'
import { parseTransportServerKeyRing } from './crypto-transport-keyring.js'
import { TRANSPORT_PROTOCOL } from './crypto-transport-types.js'

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
 * 3. HTTP 适配器用 authenticateTransportRequest 从实际 Request 提取绑定上下文；认证和共享 nonce 消费成功后才交给业务。
 * 4. 业务完成后，encryptResponse(verifiedContext, data, status) 生成关联原请求的认证响应。
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
  if (!options.keyStore || typeof options.keyStore.register !== 'function' || typeof options.keyStore.get !== 'function'
    || typeof options.keyStore.claimRequest !== 'function') {
    return err(HaiCryptoError.INVALID_INPUT, cryptoM('crypto_transportKeyStoreRequired'))
  }
  // eslint-disable-next-line node/prefer-global/process -- 此文件也随客户端打包，避免静态引入Node内建模块。
  if (core.module.requiresSharedState(globalThis.process?.env ?? {}) && options.keyStore.stateScope !== 'shared')
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
      if (!isValidSM2PublicKey(clientPublicKey))
        throw new TypeError(cryptoM('crypto_sm2PublicKeyInvalid'))
      return keyStore.register(clientPublicKey)
    },

    async getClientPublicKey(clientId) {
      return keyStore.get(clientId)
    },

    async encryptResponse(request, data, status) {
      try {
        const context = { ...request }
        const clientPublicKey = await keyStore.get(context.clientId)
        if (!clientPublicKey)
          return err(HaiCommonError.NOT_FOUND, cryptoM('crypto_transportClientNotRegistered'))
        const key = serverKeys.get(context.serverKeyId)
        if (!key)
          return transportAuthenticationFailure()
        return sealTransportPayload(cryptoService, data, context, 'response', status, clientPublicKey, key.privateKey)
      }
      catch {
        // registry/注入实现故障仍按 HaiResult 返回，不携带可能包含连接凭据的原始异常。
        return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportResponseEncryptFailed'))
      }
    },

    async decryptRequest(payload, expected) {
      try {
        if (!isValidEncryptedPayload(payload) || payload.direction !== 'request' || payload.status !== 0)
          return transportAuthenticationFailure()
        // 在任何异步 registry 调用前捕获快照，避免调用方修改同一对象造成认证/消费上下文错位。
        const authenticated = { ...payload, context: { ...payload.context } }
        const c = authenticated.context
        const now = Date.now()
        const pathHash = hashTransportPath(cryptoService, expected.path)
        if (!pathHash.success || c.clientId !== expected.clientId || c.method !== expected.method || c.pathHash !== pathHash.data
          || c.issuedAt > now + TRANSPORT_PROTOCOL.CLOCK_SKEW_MS
          || now >= c.issuedAt + TRANSPORT_PROTOCOL.REQUEST_WINDOW_MS) {
          return transportAuthenticationFailure()
        }
        const key = serverKeys.get(c.serverKeyId)
        const clientPublicKey = await keyStore.get(c.clientId)
        if (!key || !clientPublicKey)
          return transportAuthenticationFailure()
        const plaintext = openTransportPayload(cryptoService, authenticated, key.privateKey, clientPublicKey)
        if (!plaintext.success)
          return plaintext
        if (Date.now() >= c.issuedAt + TRANSPORT_PROTOCOL.REQUEST_WINDOW_MS)
          return transportAuthenticationFailure()
        // 只有完整认证成功后才占用 nonce；原子 claim 失败或存储故障均不向业务返回明文。
        if (!await keyStore.claimRequest(c.clientId, c.requestId, c.issuedAt + TRANSPORT_PROTOCOL.REQUEST_WINDOW_MS + 2 * TRANSPORT_PROTOCOL.CLOCK_SKEW_MS)) {
          return transportAuthenticationFailure()
        }
        if (Date.now() >= c.issuedAt + TRANSPORT_PROTOCOL.REQUEST_WINDOW_MS)
          return transportAuthenticationFailure()
        return plaintext
      }
      catch {
        return transportAuthenticationFailure()
      }
    },

    async close() {
      await keyStore.close?.()
    },
  }

  return ok(manager)
}
