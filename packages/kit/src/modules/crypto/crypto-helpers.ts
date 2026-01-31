/**
 * =============================================================================
 * @hai/kit - Crypto Helpers
 * =============================================================================
 * 集成 @hai/crypto 的 SvelteKit 工具
 *
 * 功能：
 * - 请求签名验证（Webhook 等）
 * - CSRF Token 管理
 * - 加密 Cookie
 *
 * @example
 * ```ts
 * // src/routes/api/webhook/+server.ts
 * import { verifyWebhookSignature } from '@hai/kit/modules/crypto'
 * import { crypto } from '$lib/server/crypto'
 *
 * export const POST = async (event) => {
 *     const isValid = await verifyWebhookSignature({
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
  CryptoServiceLike,
  CsrfConfig,
  EncryptedCookieConfig,
  WebhookVerifyConfig,
} from './crypto-types.js'
import { getKitMessage } from '../../index.js'

/**
 * 验证 Webhook 签名
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
 * 生成请求签名（用于调用外部服务）
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
 */
export function createCsrfManager(config: CsrfConfig) {
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
