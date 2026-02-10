/**
 * =============================================================================
 * @hai/kit - 传输加密核心
 * =============================================================================
 * 基于 SM2（非对称）+ SM4（对称）的混合传输加密。
 *
 * 流程：
 * 1. 启动时前后端各生成 SM2 密钥对，通过密钥交换端点互换公钥
 * 2. 传输时随机生成 SM4 密钥加密内容，用对方 SM2 公钥加密该密钥
 * 3. 接收方用自己 SM2 私钥解密密钥，再用 SM4 解密内容
 *
 * @example
 * ```ts
 * import { crypto } from '@hai/crypto'
 * import { createTransportEncryption } from '@hai/kit/modules/crypto'
 *
 * const te = createTransportEncryption({
 *   crypto: crypto,  // 注入 @hai/crypto 实例
 * })
 *
 * // 密钥交换
 * const serverPubKey = te.getServerPublicKey()
 * const clientId = te.registerClientKey(clientPublicKey)
 *
 * // 加密响应
 * const payload = te.encryptResponse(clientId, JSON.stringify({ hello: 'world' }))
 *
 * // 解密请求
 * const plaintext = te.decryptRequest(encryptedPayload)
 * ```
 * =============================================================================
 */

import type {
  EncryptedPayload,
  TransportCryptoServiceLike,
  TransportEncryptionManager,
  TransportKeyPair,
} from './crypto-types.js'
import { getKitMessage } from '../../index.js'

/**
 * 创建传输加密管理器
 *
 * 启动时生成服务端 SM2 密钥对，通过 clientId → publicKey 的内存 Map 管理客户端密钥。
 *
 * @param cryptoService - 传输加密服务实例（SM2 + SM4）
 * @returns 传输加密管理器
 * @throws 密钥对生成失败时抛出异常
 */
export function createTransportEncryption(
  cryptoService: TransportCryptoServiceLike,
): TransportEncryptionManager {
  // 生成服务端密钥对
  const keyPairResult = cryptoService.sm2.generateKeyPair()
  if (!keyPairResult.success || !keyPairResult.data) {
    throw new Error(getKitMessage('kit_transportKeyGenerationFailed'))
  }
  const serverKeyPair: TransportKeyPair = keyPairResult.data

  // 客户端公钥存储：clientId → publicKey
  const clientKeys = new Map<string, string>()
  let clientIdCounter = 0

  return {
    getServerPublicKey(): string {
      return serverKeyPair.publicKey
    },

    registerClientKey(clientPublicKey: string): string {
      clientIdCounter++
      const clientId = `client_${clientIdCounter}_${Date.now()}`
      clientKeys.set(clientId, clientPublicKey)
      return clientId
    },

    getClientPublicKey(clientId: string): string | undefined {
      return clientKeys.get(clientId)
    },

    encryptResponse(clientId: string, data: string): EncryptedPayload {
      const clientPublicKey = clientKeys.get(clientId)
      if (!clientPublicKey) {
        throw new Error(getKitMessage('kit_transportClientKeyNotFound'))
      }

      // 1. 生成随机 SM4 密钥
      const symmetricKey = cryptoService.sm4.generateKey()

      // 2. SM4 加密内容
      const encResult = cryptoService.sm4.encryptWithIV(data, symmetricKey)
      if (!encResult.success || !encResult.data) {
        throw new Error(getKitMessage('kit_transportEncryptFailed'))
      }

      // 3. SM2 加密对称密钥（使用客户端公钥）
      const keyEncResult = cryptoService.sm2.encrypt(symmetricKey, clientPublicKey)
      if (!keyEncResult.success || !keyEncResult.data) {
        throw new Error(getKitMessage('kit_transportEncryptKeyFailed'))
      }

      return {
        encryptedKey: keyEncResult.data,
        ciphertext: encResult.data.ciphertext,
        iv: encResult.data.iv,
      }
    },

    decryptRequest(payload: EncryptedPayload): string {
      // 1. SM2 解密对称密钥（使用服务端私钥）
      const keyDecResult = cryptoService.sm2.decrypt(payload.encryptedKey, serverKeyPair.privateKey)
      if (!keyDecResult.success || !keyDecResult.data) {
        throw new Error(getKitMessage('kit_transportDecryptKeyFailed'))
      }

      // 2. SM4 解密内容
      const decResult = cryptoService.sm4.decryptWithIV(payload.ciphertext, keyDecResult.data, payload.iv)
      if (!decResult.success || typeof decResult.data !== 'string') {
        throw new Error(getKitMessage('kit_transportDecryptFailed'))
      }

      return decResult.data
    },
  }
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
          JSON.stringify({ error: getKitMessage('kit_transportInvalidPayload') }),
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
        JSON.stringify({ error: getKitMessage('kit_transportKeyExchangeFailed') }),
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
