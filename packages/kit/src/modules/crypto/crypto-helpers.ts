/**
 * =============================================================================
 * @h-ai/kit - Crypto Helpers
 * =============================================================================
 * 集成 @h-ai/crypto 的 SvelteKit 工具
 *
 * 功能：
 * - 请求签名验证（Webhook 等）
 * - CSRF Token 管理
 * - 加密 Cookie
 *
 * @example
 * ```ts
 * // src/routes/api/webhook/+server.ts
 * import { kit } from '@h-ai/kit'
 * import { crypto } from '$lib/server/crypto'
 *
 * export const POST = async (event) => {
 *     const isValid = await kit.crypto.verifyWebhookSignature({
 *         crypto,
 *         event,
 *         secretKey: 'webhook_secret',
 *         signatureHeader: 'X-Signature',
 *     })
 *
 *     if (!isValid) {
 *         return new Response('Invalid signature', { status: 401 })
 *     }
 *     // ...
 * }
 * ```
 * =============================================================================
 */

import type { Cookies, RequestEvent } from '@sveltejs/kit'
import type {
  CryptoCsrfConfig,
  CryptoServiceLike,
  EncryptedCookieConfig,
  WebhookVerifyConfig,
} from './crypto-types.js'
import { Buffer } from 'node:buffer'
import { getKitMessage } from '../../kit-i18n.js'

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
 * const valid = await kit.crypto.verifyWebhookSignature({
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

  const body = await event.request.text()

  try {
    const result = await crypto.hmac.verify(body, secretKey, signature, algorithm)
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
  const result = await crypto.hmac.sign(body, secretKey, algorithm)
  if (!result.success) {
    throw new Error(result.error?.message || '签名失败')
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
 * const csrf = kit.crypto.createCsrfManager({ crypto })
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
      const result = await crypto.random.bytes(tokenLength)
      if (!result.success) {
        throw new Error(getKitMessage('kit_csrfTokenFailed'))
      }

      const token = Buffer.from(result.data!).toString('hex')

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
          requestToken = formData.get(formFieldName) as string | null
        }
        catch {
          // 不是 form data
        }
      }

      if (!requestToken) {
        return false
      }

      // 时间安全的比较
      const result = await crypto.hash.timingSafeEqual(cookieToken, requestToken)
      return result.success && result.data === true
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
          return new Response(getKitMessage('kit_csrfVerifyFailed'), { status: 403 })
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
 * const enc = kit.crypto.createEncryptedCookie({ crypto, encryptionKey: 'my-32byte-key' })
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
      const result = await crypto.aes.encrypt(json, encryptionKey)

      if (!result.success) {
        throw new Error(getKitMessage('kit_encryptFailed'))
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
        const result = await crypto.aes.decrypt(encrypted, encryptionKey)
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
