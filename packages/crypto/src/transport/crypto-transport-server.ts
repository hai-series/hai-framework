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
import { resolveTransportBodyLimits } from './crypto-transport-body.js'
import { hashTransportPath, isValidEncryptedPayload, openTransportPayload, sealTransportPayload, transportAuthenticationFailure } from './crypto-transport-codec.js'
import { TransportTimeError } from './crypto-transport-error.js'
import { parseTransportServerKeyRing } from './crypto-transport-keyring.js'
import { TRANSPORT_PROTOCOL } from './crypto-transport-types.js'

/**
 * 内部服务端工厂；创建时校验并捕获受管密钥环快照，不随机回退生成服务端密钥。
 * 生产要求共享registry；先认证实际HTTP绑定/签名/MAC/nonce，再交给业务，响应关联原上下文与实际状态。
 * @param cryptoService - 已初始化SM2/SM3/SM4能力。
 * @param options - 必填受管密钥环和客户端registry。
 * @returns 管理器或脱敏HaiResult失败；应用持有底层cache/reldb并负责关闭。
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
 *     const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
 *     if (!ring.success) throw new Error(ring.error.message)
 *     const created = crypto.transport.createServer({ serverKeyRing: ring.data, keyStore: registry })
 *     if (!created.success) throw new Error(created.error.message)
 *     const manager = created.data
 *     try {
 *       const activeKeyId = manager.getServerKeyId()
 *     }
 *     finally { await manager.close() }
 *   }
 *   finally { await cache.close() }
 * }
 * finally { await crypto.close() }
 * ```
 */
export function createTransportEncryption(
  cryptoService: TransportCryptoServiceLike,
  options: TransportCreateServerOptions,
): HaiResult<TransportEncryptionManager> {
  let bodyLimits
  try {
    bodyLimits = resolveTransportBodyLimits(options?.maxPlaintextBytes)
  }
  catch {
    return err(HaiCryptoError.INVALID_INPUT, cryptoM('crypto_transportBodyLimitInvalid'))
  }
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
    bodyLimits,
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
        return sealTransportPayload(cryptoService, data, context, 'response', status, clientPublicKey, key.privateKey, bodyLimits)
      }
      catch {
        // registry/注入实现故障仍按 HaiResult 返回，不携带可能包含连接凭据的原始异常。
        return err(HaiCommonError.INTERNAL_ERROR, cryptoM('crypto_transportResponseEncryptFailed'))
      }
    },

    async decryptRequest(payload, expected) {
      try {
        if (!isValidEncryptedPayload(payload, bodyLimits) || payload.direction !== 'request' || payload.status !== 0)
          return transportAuthenticationFailure()
        // 在任何异步 registry 调用前捕获快照，避免调用方修改同一对象造成认证/消费上下文错位。
        const authenticated = { ...payload, context: { ...payload.context } }
        const c = authenticated.context
        const pathHash = hashTransportPath(cryptoService, expected.path)
        if (!pathHash.success || c.clientId !== expected.clientId || c.method !== expected.method || c.pathHash !== pathHash.data) {
          return transportAuthenticationFailure()
        }
        const key = serverKeys.get(c.serverKeyId)
        const clientPublicKey = await keyStore.get(c.clientId)
        if (!key || !clientPublicKey)
          return transportAuthenticationFailure()
        const plaintext = openTransportPayload(cryptoService, authenticated, key.privateKey, clientPublicKey, bodyLimits)
        if (!plaintext.success)
          return plaintext
        const timeFailure = () => {
          const error = new TransportTimeError(c)
          return err(HaiCryptoError.TRANSPORT_TIME_INVALID, error.message, error)
        }
        // 只有请求绑定、签名和 MAC 可信后才区分时间错误，不能把篡改报文误报为时钟问题。
        const now = Date.now()
        if (c.issuedAt > now + TRANSPORT_PROTOCOL.CLOCK_SKEW_MS || now >= c.issuedAt + TRANSPORT_PROTOCOL.REQUEST_WINDOW_MS)
          return timeFailure()
        // 只有完整认证成功后才占用 nonce；原子 claim 失败或存储故障均不向业务返回明文。
        if (!await keyStore.claimRequest(c.clientId, c.requestId, c.issuedAt + TRANSPORT_PROTOCOL.REQUEST_WINDOW_MS + 2 * TRANSPORT_PROTOCOL.CLOCK_SKEW_MS)) {
          return transportAuthenticationFailure()
        }
        if (Date.now() >= c.issuedAt + TRANSPORT_PROTOCOL.REQUEST_WINDOW_MS)
          return timeFailure()
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
