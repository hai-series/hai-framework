/**
 * @module @h-ai/crypto
 *
 * 加密模块，提供非对称加密/签名、哈希/HMAC、对称加密及密码哈希功能。
 *
 * @example
 * ```ts
 * import { crypto } from '@h-ai/crypto'
 *
 * await crypto.init()
 * const hash = crypto.hash.hash('hello')
 * await crypto.close()
 * ```
 */
export * from './crypto-config.js'
export * from './crypto-main.js'
export * from './crypto-types.js'
