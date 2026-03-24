/**
 * @h-ai/kit — 传输加密核心
 *
 * 基于非对称 + 对称的混合传输加密。
 * @module kit-transport-encryption
 */

import type { HaiResult } from '@h-ai/core'
import type {
  EncryptedPayload,
  TransportCryptoServiceLike,
  TransportEncryptionManager,
  TransportKeyPair,
} from './kit-crypto-types.js'
import { err, ok } from '@h-ai/core'
import { kitM } from '../../kit-i18n.js'

/**
 * 创建传输加密管理器
 *
 * 启动时生成服务端非对称密钥对，通过 clientId → publicKey 的内存 Map 管理客户端密钥。
 * 内置 LRU 淘汰机制，超过 maxClients 上限时自动移除最早注册的客户端。
 *
 * 注意：clientKeys 存储在进程内存中，多节点部署时各节点状态独立。
 * 客户端密钥交换后的后续请求必须路由到同一节点（如使用 sticky session），
 * 否则传输加密功能不可用。
 *
 * @param cryptoService - 传输加密服务实例（非对称 + 对称）
 * @param maxClients - 最大客户端数量（默认 10000），超过时淘汰最早注册的
 * @returns 成功返回传输加密管理器，密钥对生成失败时返回错误
 */
export function createTransportEncryption(
  cryptoService: TransportCryptoServiceLike,
  maxClients = 10000,
): HaiResult<TransportEncryptionManager> {
  // 生成服务端密钥对
  const keyPairResult = cryptoService.asymmetric.generateKeyPair()
  if (!keyPairResult.success || !keyPairResult.data) {
    return err({ code: 'KIT_TRANSPORT_KEY_GENERATION_FAILED', message: kitM('kit_transportKeyGenerationFailed') })
  }
  const serverKeyPair: TransportKeyPair = keyPairResult.data

  // 客户端公钥存储：clientId → publicKey（Map 保持插入顺序，用于 LRU 淘汰）
  const clientKeys = new Map<string, string>()
  let clientIdCounter = 0

  return ok({
    getServerPublicKey(): string {
      return serverKeyPair.publicKey
    },

    registerClientKey(clientPublicKey: string): string {
      clientIdCounter++
      const clientId = `client_${clientIdCounter}_${Date.now()}`

      // LRU 淘汰：超过上限时移除最早注册的客户端
      if (clientKeys.size >= maxClients) {
        const oldestKey = clientKeys.keys().next().value
        if (oldestKey !== undefined) {
          clientKeys.delete(oldestKey)
        }
      }

      clientKeys.set(clientId, clientPublicKey)
      return clientId
    },

    getClientPublicKey(clientId: string): string | undefined {
      return clientKeys.get(clientId)
    },

    encryptResponse(clientId: string, data: string): EncryptedPayload {
      const clientPublicKey = clientKeys.get(clientId)
      if (!clientPublicKey) {
        throw new Error(kitM('kit_transportClientKeyNotFound'))
      }

      // 1. 生成随机对称密钥
      const symmetricKey = cryptoService.symmetric.generateKey()

      // 2. 对称加密内容
      const encResult = cryptoService.symmetric.encryptWithIV(data, symmetricKey)
      if (!encResult.success || !encResult.data) {
        throw new Error(kitM('kit_transportEncryptFailed'))
      }

      // 3. 非对称加密对称密钥（使用客户端公钥）
      const keyEncResult = cryptoService.asymmetric.encrypt(symmetricKey, clientPublicKey)
      if (!keyEncResult.success || !keyEncResult.data) {
        throw new Error(kitM('kit_transportEncryptKeyFailed'))
      }

      return {
        encryptedKey: keyEncResult.data,
        ciphertext: encResult.data.ciphertext,
        iv: encResult.data.iv,
      }
    },

    decryptRequest(payload: EncryptedPayload): string {
      // 1. 非对称解密对称密钥（使用服务端私钥）
      const keyDecResult = cryptoService.asymmetric.decrypt(payload.encryptedKey, serverKeyPair.privateKey)
      if (!keyDecResult.success || !keyDecResult.data) {
        throw new Error(kitM('kit_transportDecryptKeyFailed'))
      }

      // 2. 对称解密内容
      const decResult = cryptoService.symmetric.decryptWithIV(payload.ciphertext, keyDecResult.data, payload.iv)
      if (!decResult.success || typeof decResult.data !== 'string') {
        throw new Error(kitM('kit_transportDecryptFailed'))
      }

      return decResult.data
    },
  })
}

/**
 * 创建密钥交换端点处理器
 *
 * 返回一个标准的 POST 处理函数，用于接收客户端公钥并返回服务端公钥与 clientId。
 *
 * @param manager - 传输加密管理器
 * @returns POST 处理函数，可直接用于 SvelteKit +server.ts
 *
 * @example
 * ```ts
 * // src/routes/api/kit/key-exchange/+server.ts
 * import { keyExchangeHandler } from '$lib/server/transport'
 * export const POST = keyExchangeHandler
 * ```
 */
export function createKeyExchangeHandler(
  manager: TransportEncryptionManager,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    try {
      const body = await request.json() as { clientPublicKey?: string }

      if (!body.clientPublicKey || typeof body.clientPublicKey !== 'string') {
        return new Response(
          JSON.stringify({ error: kitM('kit_transportInvalidPayload') }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        )
      }

      const clientId = manager.registerClientKey(body.clientPublicKey)
      const serverPublicKey = manager.getServerPublicKey()

      return new Response(
        JSON.stringify({ serverPublicKey, clientId }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    catch {
      return new Response(
        JSON.stringify({ error: kitM('kit_transportKeyExchangeFailed') }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }
  }
}

/**
 * 校验加密载荷格式是否合法
 *
 * @param payload - 待校验对象
 * @returns 是否为合法的 EncryptedPayload
 */
export function isValidEncryptedPayload(payload: unknown): payload is EncryptedPayload {
  if (typeof payload !== 'object' || payload === null)
    return false
  const p = payload as Record<string, unknown>
  return (
    typeof p.encryptedKey === 'string'
    && typeof p.ciphertext === 'string'
    && typeof p.iv === 'string'
    && p.encryptedKey.length > 0
    && p.ciphertext.length > 0
    && p.iv.length > 0
  )
}
