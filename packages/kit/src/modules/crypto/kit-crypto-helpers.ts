/**
 * @h-ai/kit — Crypto Helpers
 *
 * 集成 @h-ai/crypto 的 SvelteKit 工具
 * @module kit-crypto-helpers
 */

import type { Cookies, RequestEvent } from '@sveltejs/kit'
import type {
  CryptoCsrfConfig,
  CryptoServiceLike,
  EncryptedCookieConfig,
  WebhookVerifyConfig,
} from './kit-crypto-types.js'
import { core } from '@h-ai/core'
import { kitM } from '../../kit-i18n.js'

const SYMMETRIC_COOKIE_PREFIX = 'encv1:'

interface ResultLike<T> {
  success: boolean
  data?: T
  error?: { code: number, message: string }
}

function bytesToHex(data: Uint8Array): string {
  return Array.from(data)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function createWebCryptoHmacSignature(
  body: string,
  secretKey: string,
  algorithm: string,
): Promise<ResultLike<string>> {
  const subtle = globalThis.crypto?.subtle
  const hashAlgorithm = algorithm === 'sha256'
    ? 'SHA-256'
    : algorithm === 'sha512'
      ? 'SHA-512'
      : null

  if (!subtle || !hashAlgorithm) {
    return { success: false, error: { code: 500, message: kitM('kit_signFailed') } }
  }

  try {
    const encoder = new TextEncoder()
    const key = await subtle.importKey(
      'raw',
      encoder.encode(secretKey),
      { name: 'HMAC', hash: hashAlgorithm },
      false,
      ['sign'],
    )
    const signature = await subtle.sign('HMAC', key, encoder.encode(body))
    return { success: true, data: bytesToHex(new Uint8Array(signature)) }
  }
  catch (error) {
    return {
      success: false,
      error: { code: 500, message: error instanceof Error ? error.message : String(error) },
    }
  }
}

async function createSignature(
  crypto: CryptoServiceLike,
  body: string,
  secretKey: string,
  algorithm: string,
): Promise<ResultLike<string>> {
  if (crypto.hmac?.sign) {
    return await crypto.hmac.sign(body, secretKey, algorithm)
  }

  if (algorithm === 'sha256' || algorithm === 'sha512') {
    return await createWebCryptoHmacSignature(body, secretKey, algorithm)
  }

  if (crypto.hash.hmac) {
    return await crypto.hash.hmac(body, secretKey, algorithm)
  }

  return { success: false, error: { code: 500, message: kitM('kit_signFailed') } }
}

async function verifySignature(
  crypto: CryptoServiceLike,
  body: string,
  secretKey: string,
  signature: string,
  algorithm: string,
): Promise<ResultLike<boolean>> {
  if (crypto.hmac?.verify) {
    return await crypto.hmac.verify(body, secretKey, signature, algorithm)
  }

  const signResult = await createSignature(crypto, body, secretKey, algorithm)
  if (!signResult.success || !signResult.data) {
    return {
      success: false,
      error: signResult.error ?? { code: 500, message: kitM('kit_signFailed') },
    }
  }

  return { success: true, data: await constantTimeEqualsAsync(crypto, signResult.data, signature) }
}

async function constantTimeEqualsAsync(crypto: CryptoServiceLike, a: string, b: string): Promise<boolean> {
  if (crypto.hash.timingSafeEqual) {
    const result = await crypto.hash.timingSafeEqual(a, b)
    if (result.success && typeof result.data === 'boolean') {
      return result.data
    }
  }
  return core.string.constantTimeEqual(a, b)
}

async function getRandomBytes(crypto: CryptoServiceLike, length: number): Promise<ResultLike<Uint8Array>> {
  if (crypto.random?.bytes) {
    return await crypto.random.bytes(length)
  }

  try {
    const data = new Uint8Array(length)
    globalThis.crypto.getRandomValues(data)
    return { success: true, data }
  }
  catch (error) {
    return {
      success: false,
      error: { code: 500, message: error instanceof Error ? error.message : String(error) },
    }
  }
}

async function encryptCookieString(
  crypto: CryptoServiceLike,
  value: string,
  key: string,
): Promise<ResultLike<string>> {
  if (crypto.aes?.encrypt) {
    return await crypto.aes.encrypt(value, key)
  }

  if (crypto.symmetric?.encryptWithIV) {
    const result = await crypto.symmetric.encryptWithIV(value, key)
    if (!result.success || !result.data) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      data: `${SYMMETRIC_COOKIE_PREFIX}${result.data.iv}:${result.data.ciphertext}`,
    }
  }

  return { success: false, error: { code: 500, message: kitM('kit_encryptFailed') } }
}

async function decryptCookieString(
  crypto: CryptoServiceLike,
  encrypted: string,
  key: string,
): Promise<ResultLike<string>> {
  if (encrypted.startsWith(SYMMETRIC_COOKIE_PREFIX)) {
    if (!crypto.symmetric?.decryptWithIV) {
      return { success: false, error: { code: 500, message: kitM('kit_transportDecryptFailed') } }
    }

    const payload = encrypted.slice(SYMMETRIC_COOKIE_PREFIX.length)
    const separator = payload.indexOf(':')
    if (separator === -1) {
      return { success: false, error: { code: 400, message: kitM('kit_transportDecryptFailed') } }
    }

    const iv = payload.slice(0, separator)
    const ciphertext = payload.slice(separator + 1)
    return await crypto.symmetric.decryptWithIV(ciphertext, key, iv)
  }

  if (crypto.aes?.decrypt) {
    return await crypto.aes.decrypt(encrypted, key)
  }

  if (crypto.symmetric?.decryptWithIV) {
    return { success: false, error: { code: 400, message: kitM('kit_transportDecryptFailed') } }
  }

  return { success: false, error: { code: 500, message: kitM('kit_transportDecryptFailed') } }
}

/**
 * 验证 Webhook 签名
 *
 * 从请求头取出签名，用 HMAC 对原始 Body 进行比较验证。
 *
 * @param config - 签名验证配置
 * @returns 签名是否合法
 *
 * @example
 * ```ts
 * const valid = await verifyWebhookSignature({
 *   crypto, event, secretKey: 'wh_secret', signatureHeader: 'X-Signature',
 * })
 * if (!valid) return new Response('Invalid signature', { status: 401 })
 * ```
 */
export async function verifyWebhookSignature(config: WebhookVerifyConfig): Promise<boolean> {
  const {
    crypto,
    event,
    secretKey,
    signatureHeader = 'X-Signature',
    algorithm = 'sha256',
  } = config

  const signature = event.request.headers.get(signatureHeader)
  if (!signature) {
    return false
  }

  const body = await event.request.clone().text()

  try {
    const result = await verifySignature(crypto, body, secretKey, signature, algorithm)
    return result.success && result.data === true
  }
  catch {
    return false
  }
}

/**
 * 生成请求 HMAC 签名（用于调用外部服务）
 *
 * @param crypto - @h-ai/crypto 服务实例
 * @param body - 请求体字符串
 * @param secretKey - 共享密钥
 * @param algorithm - 哈希算法（默认 `'sha256'`）
 * @returns 签名字符串
 * @throws 签名失败时抛出 Error
 */
export async function signRequest(
  crypto: CryptoServiceLike,
  body: string,
  secretKey: string,
  algorithm = 'sha256',
): Promise<string> {
  const result = await createSignature(crypto, body, secretKey, algorithm)
  if (!result.success) {
    throw new Error(result.error?.message || kitM('kit_signFailed'))
  }
  return result.data!
}

/**
 * 创建 CSRF Token 管理器
 *
 * 基于 `@h-ai/crypto` 随机字节 + 时间安全比较，
 * 提供 token 生成、验证和 SvelteKit handle 中间件。
 *
 * @param config - CSRF 配置（crypto 实例、Cookie 名、Header 名等）
 * @returns `{ generate, verify, createHandle }`
 *
 * @example
 * ```ts
 * const csrf = createCsrfManager({ crypto })
 * // 在 load 中生成
 * const token = await csrf.generate(cookies)
 * // 在 action 中验证
 * const ok = await csrf.verify(event)
 * ```
 */
export function createCsrfManager(config: CryptoCsrfConfig) {
  const {
    crypto,
    cookieName = 'csrf_token',
    headerName = 'X-CSRF-Token',
    formFieldName = '_csrf',
    tokenLength = 32,
    cookieOptions = {},
  } = config

  return {
    /**
     * 生成新的 CSRF Token 并设置 Cookie
     */
    async generate(cookies: Cookies): Promise<string> {
      const result = await getRandomBytes(crypto, tokenLength)
      if (!result.success) {
        throw new Error(kitM('kit_csrfTokenFailed'))
      }

      const token = Array.from(result.data!)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      cookies.set(cookieName, token, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        ...cookieOptions,
      })

      return token
    },

    /**
     * 验证 CSRF Token
     */
    async verify(event: RequestEvent): Promise<boolean> {
      const cookieToken = event.cookies.get(cookieName)
      if (!cookieToken) {
        return false
      }

      // 从 header 或 form data 获取 token
      let requestToken = event.request.headers.get(headerName)

      if (!requestToken && event.request.method === 'POST') {
        try {
          const formData = await event.request.clone().formData()
          const fieldValue = formData.get(formFieldName)
          requestToken = typeof fieldValue === 'string' ? fieldValue : null
        }
        catch {
          // 不是 form data
        }
      }

      if (!requestToken) {
        return false
      }

      // 时间安全的比较
      return await constantTimeEqualsAsync(crypto, cookieToken, requestToken)
    },

    /**
     * 创建 CSRF 验证中间件
     */
    createHandle() {
      return async ({ event, resolve }: { event: RequestEvent, resolve: (event: RequestEvent) => Promise<Response> }) => {
        // 跳过安全方法
        const safeMethods = ['GET', 'HEAD', 'OPTIONS']
        if (safeMethods.includes(event.request.method)) {
          return resolve(event)
        }

        const isValid = await this.verify(event)
        if (!isValid) {
          return new Response(kitM('kit_csrfVerifyFailed'), { status: 403 })
        }

        return resolve(event)
      }
    },
  }
}

/**
 * 创建加密 Cookie 管理器
 *
 * 使用 AES 对 Cookie 值进行加解密，防止客户端篡改。
 *
 * @param config - 加密 Cookie 配置（含加密密钥）
 * @returns `{ set, get, delete }`
 *
 * @example
 * ```ts
 * const enc = createEncryptedCookie({ crypto, encryptionKey: 'my-32byte-key' })
 * await enc.set(cookies, 'prefs', { theme: 'dark' })
 * const prefs = await enc.get(cookies, 'prefs')
 * ```
 */
export function createEncryptedCookie(config: EncryptedCookieConfig) {
  const { crypto, encryptionKey, cookieOptions = {} } = config

  return {
    /**
     * 设置加密 Cookie
     */
    async set(cookies: Cookies, name: string, value: unknown): Promise<void> {
      const json = JSON.stringify(value)
      const result = await encryptCookieString(crypto, json, encryptionKey)

      if (!result.success) {
        throw new Error(kitM('kit_encryptFailed'))
      }

      cookies.set(name, result.data!, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        ...cookieOptions,
      })
    },

    /**
     * 获取并解密 Cookie
     */
    async get<T = unknown>(cookies: Cookies, name: string): Promise<T | null> {
      const encrypted = cookies.get(name)
      if (!encrypted) {
        return null
      }

      try {
        const result = await decryptCookieString(crypto, encrypted, encryptionKey)
        if (!result.success) {
          return null
        }

        return JSON.parse(result.data!) as T
      }
      catch {
        return null
      }
    },

    /**
     * 删除 Cookie
     */
    delete(cookies: Cookies, name: string): void {
      cookies.delete(name, { path: '/' })
    },
  }
}
