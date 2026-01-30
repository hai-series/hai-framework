/**
 * =============================================================================
 * @hai/crypto - 加密模块
 * =============================================================================
 * 提供国密算法（SM2/SM3/SM4）的统一加密接口
 *
 * 支持：
 * - SM2 非对称加密（密钥生成、加解密、签名验签）
 * - SM3 哈希（哈希、HMAC、验证）
 * - SM4 对称加密（ECB/CBC 模式）
 *
 * 特性：
 * - 前后端通用（Node.js / 浏览器）
 * - 基于 sm-crypto 库
 * - 完整的错误处理（Result 类型）
 *
 * @example
 * ```ts
 * import { crypto } from '@hai/crypto'
 *
 * // SM2 非对称加密
 * const keyPair = crypto.sm2.generateKeyPair()
 * if (keyPair.success) {
 *     const encrypted = crypto.sm2.encrypt('Hello', keyPair.data.publicKey)
 *     const decrypted = crypto.sm2.decrypt(encrypted.data, keyPair.data.privateKey)
 * }
 *
 * // SM2 签名验签
 * const signature = crypto.sm2.sign('data', privateKey)
 * const isValid = crypto.sm2.verify('data', signature.data, publicKey)
 *
 * // SM3 哈希
 * const hash = crypto.sm3.hash('Hello, SM3!')
 * const hmac = crypto.sm3.hmac('data', 'key')
 *
 * // SM4 对称加密（ECB 模式）
 * const key = crypto.sm4.generateKey()
 * const ciphertext = crypto.sm4.encrypt('data', key)
 * const plaintext = crypto.sm4.decrypt(ciphertext.data, key)
 *
 * // SM4 带 IV 加密（CBC 模式，推荐）
 * const result = crypto.sm4.encryptWithIV('data', key)
 * if (result.success) {
 *     const decrypted = crypto.sm4.decryptWithIV(
 *         result.data.ciphertext,
 *         key,
 *         result.data.iv
 *     )
 * }
 *
 * // 创建独立实例
 * const myCrypto = createCryptoService()
 * ```
 * =============================================================================
 */

// =============================================================================
// 自动注册 Schema 到 @hai/core
// =============================================================================
import { core } from '@hai/core'
import { CryptoConfigSchema } from './crypto-config.js'

// 配置 Schema（zod）
export * from './crypto-config.js'

// 统一服务入口
export * from './crypto-main.js'

// 密码哈希提供者
export * from './crypto-password.js'

// 类型定义
export * from './crypto-types.js'

// 注册 crypto 模块的配置 Schema
core.registerBuiltinSchema('crypto', CryptoConfigSchema)
