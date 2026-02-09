/**
 * @module @hai/crypto
 *
 * 国密算法加密模块，提供 SM2（非对称加密/签名）、SM3（哈希/HMAC）、SM4（对称加密）及密码哈希功能。
 *
 * @example
 * ```ts
 * import { crypto } from '@hai/crypto'
 *
 * await crypto.init({})
 * const hash = crypto.sm3.hash('hello')
 * await crypto.close()
 * ```
 */
export * from './crypto-config.js'
export * from './crypto-main.js'
export * from './crypto-types.js'
