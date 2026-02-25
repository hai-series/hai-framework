/**
 * =============================================================================
 * @h-ai/kit - 客户端传输加密 Store
 * =============================================================================
 * 浏览器端传输加密管理，封装密钥生成、密钥交换与加密 fetch。
 *
 * @example
 * ```svelte
 * <script>
 * import { kit } from '@h-ai/kit'
 * import { crypto } from '@h-ai/crypto'
 *
 * const te = kit.client.useTransportEncryption({ crypto })
 *
 * async function loadData() {
 *   const response = await $te.encryptedFetch('/api/data')
 *   const data = await response.json()
 * }
 * </script>
 *
 * {#if $te.ready}
 *   <button onclick={loadData}>加载数据</button>
 * {:else if $te.error}
 *   <p>加密初始化失败: {$te.error}</p>
 * {:else}
 *   <p>正在交换密钥...</p>
 * {/if}
 * ```
 * =============================================================================
 */

import type { Readable } from 'svelte/store'
import type { EncryptedPayload, TransportCryptoServiceLike, TransportKeyPair } from '../modules/crypto/crypto-types.js'
import { writable } from 'svelte/store'
import { isValidEncryptedPayload } from '../modules/crypto/transport-encryption.js'

/**
 * 传输加密 Store 状态
 */
export interface TransportEncryptionState {
  /** 密钥交换是否完成 */
  ready: boolean
  /** 错误信息 */
  error: string | null
  /** 加密 fetch（密钥交换完成后可用） */
  encryptedFetch: (url: string, options?: RequestInit) => Promise<Response>
}

/**
 * 传输加密 Store 接口
 */
export interface TransportEncryptionStore extends Readable<TransportEncryptionState> {
  /** 手动触发密钥交换 */
  init: () => Promise<void>
  /** 销毁，清除密钥 */
  destroy: () => void
}

/**
 * useTransportEncryption 配置
 */
export interface UseTransportEncryptionOptions {
  /** 传输加密服务实例 */
  crypto: TransportCryptoServiceLike
  /** 密钥交换端点 URL（默认 '/api/kit/key-exchange'） */
  keyExchangeUrl?: string
  /** 是否自动初始化（默认 true） */
  autoInit?: boolean
}

/**
 * 创建客户端传输加密 Store
 *
 * @param options - 配置
 * @returns Svelte Store
 */
export function useTransportEncryption(options: UseTransportEncryptionOptions): TransportEncryptionStore {
  const {
    crypto: cryptoService,
    keyExchangeUrl = '/api/kit/key-exchange',
    autoInit = true,
  } = options

  let clientKeyPair: TransportKeyPair | null = null
  let serverPublicKey: string | null = null
  let clientId: string | null = null

  const noopFetch = async (): Promise<Response> => {
    throw new Error('Transport encryption not ready')
  }

  const state = writable<TransportEncryptionState>({
    ready: false,
    error: null,
    encryptedFetch: noopFetch,
  })

  /**
   * 加密 fetch：自动加密请求体、自动解密响应
   */
  async function encryptedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (!clientKeyPair || !serverPublicKey || !clientId) {
      throw new Error('Transport encryption not ready')
    }

    const headers = new Headers(options.headers)
    headers.set('X-Client-Id', clientId)

    let body = options.body

    // 如果有请求体，加密
    if (body !== undefined && body !== null) {
      const bodyText = typeof body === 'string' ? body : JSON.stringify(body)
      const encrypted = encryptData(cryptoService, bodyText, serverPublicKey)
      body = JSON.stringify(encrypted)
      headers.set('Content-Type', 'application/json')
    }

    const response = await fetch(url, {
      ...options,
      headers,
      body,
    })

    // 如果响应标记为加密，解密
    if (response.headers.get('X-Encrypted') === 'true') {
      const encryptedResponse = await response.json() as unknown
      if (isValidEncryptedPayload(encryptedResponse)) {
        const plaintext = decryptData(cryptoService, encryptedResponse, clientKeyPair.privateKey)
        return new Response(plaintext, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        })
      }
    }

    return response
  }

  /**
   * 执行密钥交换
   */
  async function init(): Promise<void> {
    try {
      // 1. 生成客户端 SM2 密钥对
      const keyPairResult = cryptoService.sm2.generateKeyPair()
      if (!keyPairResult.success || !keyPairResult.data) {
        state.set({ ready: false, error: 'Failed to generate key pair', encryptedFetch: noopFetch })
        return
      }
      clientKeyPair = keyPairResult.data

      // 2. 发送公钥到服务端，获取服务端公钥
      const response = await fetch(keyExchangeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientPublicKey: clientKeyPair.publicKey }),
      })

      if (!response.ok) {
        state.set({ ready: false, error: `Key exchange failed: ${response.status}`, encryptedFetch: noopFetch })
        return
      }

      const data = await response.json() as { serverPublicKey?: string, clientId?: string }
      if (!data.serverPublicKey || !data.clientId) {
        state.set({ ready: false, error: 'Invalid key exchange response', encryptedFetch: noopFetch })
        return
      }

      serverPublicKey = data.serverPublicKey
      clientId = data.clientId

      // 3. 就绪
      state.set({ ready: true, error: null, encryptedFetch })
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      state.set({ ready: false, error: message, encryptedFetch: noopFetch })
    }
  }

  /**
   * 销毁，清除密钥
   */
  function destroy(): void {
    clientKeyPair = null
    serverPublicKey = null
    clientId = null
    state.set({ ready: false, error: null, encryptedFetch: noopFetch })
  }

  // 自动初始化
  if (autoInit) {
    init()
  }

  return {
    subscribe: state.subscribe,
    init,
    destroy,
  }
}

/**
 * 加密数据（客户端 → 服务端）
 */
function encryptData(
  cryptoService: TransportCryptoServiceLike,
  data: string,
  serverPublicKey: string,
): EncryptedPayload {
  // 1. 生成 SM4 对称密钥
  const symmetricKey = cryptoService.sm4.generateKey()

  // 2. SM4 加密内容
  const encResult = cryptoService.sm4.encryptWithIV(data, symmetricKey)
  if (!encResult.success || !encResult.data) {
    throw new Error('SM4 encryption failed')
  }

  // 3. SM2 加密对称密钥（使用服务端公钥）
  const keyEncResult = cryptoService.sm2.encrypt(symmetricKey, serverPublicKey)
  if (!keyEncResult.success || !keyEncResult.data) {
    throw new Error('SM2 key encryption failed')
  }

  return {
    encryptedKey: keyEncResult.data,
    ciphertext: encResult.data.ciphertext,
    iv: encResult.data.iv,
  }
}

/**
 * 解密数据（服务端 → 客户端）
 */
function decryptData(
  cryptoService: TransportCryptoServiceLike,
  payload: EncryptedPayload,
  clientPrivateKey: string,
): string {
  // 1. SM2 解密对称密钥（使用客户端私钥）
  const keyDecResult = cryptoService.sm2.decrypt(payload.encryptedKey, clientPrivateKey)
  if (!keyDecResult.success || !keyDecResult.data) {
    throw new Error('SM2 key decryption failed')
  }

  // 2. SM4 解密内容
  const decResult = cryptoService.sm4.decryptWithIV(payload.ciphertext, keyDecResult.data, payload.iv)
  if (!decResult.success || typeof decResult.data !== 'string') {
    throw new Error('SM4 decryption failed')
  }

  return decResult.data
}
