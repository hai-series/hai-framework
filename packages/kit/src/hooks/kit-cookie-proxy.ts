/**
 * @h-ai/kit — Cookie 加密代理
 *
 * 通过 Proxy 拦截 SvelteKit Cookies 对象的 get/set 方法， 对指定名称的 Cookie 自动进行 SM4-CBC 加解密。
 * @module kit-cookie-proxy
 */

import type { Cookies } from '@sveltejs/kit'
import type { TransportCryptoServiceLike } from '../modules/crypto/kit-crypto-types.js'
import { core } from '@h-ai/core'

/**
 * Cookie 加密代理配置
 */
export interface CookieProxyConfig {
  /** 需要加密的 Cookie 名称集合 */
  names: Set<string>
  /** 对称加密服务（SM4） */
  symmetric: TransportCryptoServiceLike['symmetric']
  /** 加密密钥（32 字符十六进制） */
  encryptionKey: string
}

/**
 * 加密 Cookie 值的前缀标记
 *
 * 用于区分已加密和未加密的 Cookie 值，
 * 避免对明文值做解密导致乱码。
 */
const ENCRYPTED_PREFIX = 'enc:'

/**
 * 创建加密 Cookie 代理
 *
 * 返回一个 Proxy 包装的 Cookies 对象：
 * - `get(name)` —— 若 name 在加密列表中，自动解密后返回明文
 * - `set(name, value, opts)` —— 若 name 在加密列表中，自动加密后存储
 * - `delete(name, opts)` —— 透传，无需解密
 * - 其他方法原样透传
 *
 * @param cookies - SvelteKit 原始 Cookies 对象
 * @param config - 加密配置
 * @returns 代理后的 Cookies 对象（类型不变）
 */
export function createEncryptedCookieProxy(
  cookies: Cookies,
  config: CookieProxyConfig,
): Cookies {
  const { names, symmetric, encryptionKey } = config
  const logger = core.logger.child({ module: 'kit', scope: 'cookie-proxy' })

  return new Proxy(cookies, {
    get(target, prop, receiver) {
      // 拦截 get 方法：对加密 Cookie 自动解密
      if (prop === 'get') {
        return (name: string, opts?: Parameters<Cookies['get']>[1]) => {
          const raw = target.get(name, opts)
          if (!raw || !names.has(name))
            return raw

          // 仅解密带有加密前缀的值
          if (!raw.startsWith(ENCRYPTED_PREFIX))
            return raw

          try {
            const ciphertext = raw.slice(ENCRYPTED_PREFIX.length)
            // 格式: iv:ciphertext
            const separatorIndex = ciphertext.indexOf(':')
            if (separatorIndex === -1)
              return raw

            const iv = ciphertext.slice(0, separatorIndex)
            const encrypted = ciphertext.slice(separatorIndex + 1)

            const result = symmetric.decryptWithIV(encrypted, encryptionKey, iv)
            if (!result.success || typeof result.data !== 'string') {
              logger.warn('Cookie decryption failed, returning raw value', { name })
              return raw
            }

            return result.data
          }
          catch {
            logger.warn('Cookie decryption error, returning raw value', { name })
            return raw
          }
        }
      }

      // 拦截 set 方法：对加密 Cookie 自动加密
      if (prop === 'set') {
        return (name: string, value: string, opts: Parameters<Cookies['set']>[2]) => {
          if (names.has(name)) {
            try {
              const result = symmetric.encryptWithIV(value, encryptionKey)
              if (result.success && result.data) {
                // 格式: enc:iv:ciphertext
                value = `${ENCRYPTED_PREFIX}${result.data.iv}:${result.data.ciphertext}`
              }
              else {
                logger.warn('Cookie encryption failed, storing plaintext', { name })
              }
            }
            catch {
              logger.warn('Cookie encryption error, storing plaintext', { name })
            }
          }

          return target.set(name, value, opts)
        }
      }

      // 其他方法（getAll / delete / serialize）原样透传
      return Reflect.get(target, prop, receiver)
    },
  })
}
