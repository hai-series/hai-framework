/**
 * @h-ai/kit — Cookie 加密代理
 *
 * 通过 Proxy 对指定 Cookie 进行 SM4-CBC 加密和 HMAC-SHA256 认证，先验真再解密。
 * @module kit-cookie-proxy
 */

import type { CryptoFunctions } from '@h-ai/crypto'
import type { Cookies } from '@sveltejs/kit'
import { Buffer } from 'node:buffer'
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'
import { core } from '@h-ai/core'

/**
 * Cookie 加密代理配置
 * @example
 * ```ts
 * import type { CookieProxyConfig } from '@h-ai/kit'
 * import { crypto } from '@h-ai/crypto'
 *
 * function config(encryptionKey: string): CookieProxyConfig {
 *   return { names: new Set(['session']), symmetric: crypto.symmetric, encryptionKey }
 * }
 * ```
 */
export interface CookieProxyConfig {
  /** 需要加密的 Cookie 名称集合 */
  names: Set<string>
  /** 对称加密服务（SM4） */
  symmetric: CryptoFunctions['symmetric']
  /** 加密密钥（32 字符十六进制） */
  encryptionKey: string
}

/**
 * 加密 Cookie 值的前缀标记
 *
 * 用于区分已加密和未加密的 Cookie 值，
 * 避免对明文值做解密导致乱码。
 */
const ENCRYPTED_PREFIX = 'enc:v2:'

/**
 * 创建加密 Cookie 代理
 *
 * 返回一个 Proxy 包装的 Cookies 对象：
 * - `get(name)` —— 若 name 在加密列表中，自动解密后返回明文；格式或解密失败时返回 `undefined`
 * - `set(name, value, opts)` —— 若 name 在加密列表中，自动加密后存储；加密失败时拒绝写入
 * - `delete(name, opts)` —— 透传，无需解密
 * - 其他方法原样透传
 *
 * @param cookies - SvelteKit 原始 Cookies 对象
 * @param config - 加密配置
 * @returns 代理后的 Cookies 对象（类型不变）
 * @example 模块内部上下文
 * ```ts
 * function wrap(cookies: Cookies, config: CookieProxyConfig) {
 *   const protectedCookies = createEncryptedCookieProxy(cookies, config)
 *   return protectedCookies.get('session')
 * }
 * ```
 */
export function createEncryptedCookieProxy(
  cookies: Cookies,
  config: CookieProxyConfig,
): Cookies {
  const { names, symmetric, encryptionKey } = config
  const logger = core.logger.child({ module: 'kit', scope: 'cookie-proxy' })
  if (!/^[\da-f]{32}$/i.test(encryptionKey))
    throw new Error('Cookie encryption requires a 32-character hexadecimal key')
  // 从宿主密钥分离加密与认证子密钥；版本、Cookie 名、IV 和密文一起认证。
  const keys = Buffer.from(hkdfSync('sha256', Buffer.from(encryptionKey, 'hex'), Buffer.alloc(0), 'hai:kit:cookie:v2', 48))
  const cipherKey = keys.subarray(0, 16).toString('hex')
  const macKey = keys.subarray(16)
  const authenticate = (name: string, iv: string, ciphertext: string) =>
    createHmac('sha256', macKey).update(JSON.stringify(['v2', name, iv, ciphertext])).digest()

  return new Proxy(cookies, {
    get(target, prop, receiver) {
      // 拦截 get 方法：对加密 Cookie 自动解密
      if (prop === 'get') {
        return (name: string, opts?: Parameters<Cookies['get']>[1]) => {
          const raw = target.get(name, opts)
          if (!raw || !names.has(name))
            return raw

          // 受保护 Cookie 不接受明文，避免攻击者绕过加密边界注入伪造值。
          if (!raw.startsWith(ENCRYPTED_PREFIX)) {
            logger.warn('Encrypted cookie has invalid format', { name })
            return undefined
          }

          try {
            const ciphertext = raw.slice(ENCRYPTED_PREFIX.length)
            // 旧版无认证格式不再接受，不能以兼容回退绕过验真。
            const parts = ciphertext.split(':')
            if (parts.length !== 3 || !/^[\da-f]{64}$/i.test(parts[2]!)) {
              logger.warn('Encrypted cookie has invalid format', { name })
              return undefined
            }

            const [iv, encrypted, signature] = parts as [string, string, string]
            if (!timingSafeEqual(authenticate(name, iv, encrypted), Buffer.from(signature, 'hex'))) {
              logger.warn('Cookie authentication failed', { name })
              return undefined
            }

            const result = symmetric.decryptWithIV(encrypted, cipherKey, iv)
            if (!result.success || typeof result.data !== 'string') {
              logger.warn('Cookie decryption failed', { name })
              return undefined
            }

            return result.data
          }
          catch {
            logger.warn('Cookie decryption error', { name })
            return undefined
          }
        }
      }

      // 拦截 set 方法：对加密 Cookie 自动加密
      if (prop === 'set') {
        return (name: string, value: string, opts: Parameters<Cookies['set']>[2]) => {
          if (names.has(name)) {
            const result = symmetric.encryptWithIV(value, cipherKey)
            if (!result.success || !result.data) {
              logger.error('Cookie encryption failed', { name })
              throw new Error('Cookie encryption failed')
            }
            const { iv, ciphertext } = result.data
            value = `${ENCRYPTED_PREFIX}${iv}:${ciphertext}:${authenticate(name, iv, ciphertext).toString('hex')}`
          }

          return target.set(name, value, opts)
        }
      }

      // 其他方法（getAll / delete / serialize）原样透传
      return Reflect.get(target, prop, receiver)
    },
  })
}
