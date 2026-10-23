/**
 * @h-ai/crypto — 公共类型
 *
 * 定义加密模块的对外接口类型。
 * @module crypto-types
 */

import type { ErrorInfo, HaiResult } from '@h-ai/core'
import type {
  TRANSPORT_PROTOCOL as TRANSPORT_PROTOCOL_T,
  TransportClient,
  TransportCreateServerOptions,
  TransportEncryptionManager,
} from './transport/crypto-transport-types.js'
import { core } from '@h-ai/core'

const CryptoErrorInfo = {
  INVALID_INPUT: '002:400',
  INVALID_KEY: '003:400',
  NOT_INITIALIZED: '010:500',
  INIT_FAILED: '011:500',
  KEY_GENERATION_FAILED: '020:500',
  ENCRYPTION_FAILED: '021:500',
  DECRYPTION_FAILED: '022:500',
  SIGN_FAILED: '023:500',
  VERIFY_FAILED: '024:500',
  HASH_FAILED: '040:500',
  HMAC_FAILED: '041:500',
  INVALID_IV: '060:400',
} as const satisfies ErrorInfo

/**
 * 加密领域标准错误集合；先判断 HaiResult.success，错误上下文不得附带明文或私钥。
 *
 * @example
 * ```ts
 * import { crypto, HaiCryptoError } from '@h-ai/crypto'
 * const result = crypto.hash.hash('hello')
 * if (!result.success && result.error.code === HaiCryptoError.NOT_INITIALIZED.code) {
 *   // 尚未初始化时按生命周期处理，不忽略错误继续加密。
 *   const message = result.error.message
 * }
 * ```
 */
export const HaiCryptoError = core.error.buildHaiErrorsDef('crypto', CryptoErrorInfo)

// ─── 非对称加密类型 ───

/**
 * SM2 密文排列：1为C1C3C2默认值，0为显式C1C2C3；解密必须匹配加密排列。
 *
 * @example
 * ```ts
 * import { crypto, type CipherMode } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const generated = crypto.asymmetric.generateKeyPair()
 *   if (!generated.success) throw new Error(generated.error.message)
 *   const pair = generated.data
 *   const mode: CipherMode = 1
 *   const encrypted = crypto.asymmetric.encrypt('hello', pair.publicKey, { cipherMode: mode })
 *   if (!encrypted.success) throw new Error(encrypted.error.message)
 *   const decrypted = crypto.asymmetric.decrypt(encrypted.data, pair.privateKey, { cipherMode: mode })
 *   if (!decrypted.success) throw new Error(decrypted.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export type CipherMode = 0 | 1

/**
 * SM2 公私钥对；私钥必须保密，不写日志、公开配置或响应。
 *
 * @example
 * ```ts
 * import { crypto, type KeyPair } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const generated = crypto.asymmetric.generateKeyPair()
 *   if (!generated.success) throw new Error(generated.error.message)
 *   const pair = generated.data
 *   const keyPair: KeyPair = pair
 *   const publicKey = keyPair.publicKey
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface KeyPair {
  /** 公钥（十六进制字符串，包含 04 前缀为非压缩格式） */
  publicKey: string
  /** 私钥（十六进制字符串，64 字符） */
  privateKey: string
}

/**
 * SM2 密文排列和输出编码；加解密 cipherMode 必须一致，解密可识别受支持的 base64 输出。
 *
 * @example
 * ```ts
 * import { crypto, type AsymmetricEncryptOptions } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const generated = crypto.asymmetric.generateKeyPair()
 *   if (!generated.success) throw new Error(generated.error.message)
 *   const pair = generated.data
 *   const options: AsymmetricEncryptOptions = { cipherMode: 1, outputFormat: 'base64' }
 *   const encrypted = crypto.asymmetric.encrypt('hello', pair.publicKey, options)
 *   if (!encrypted.success) throw new Error(encrypted.error.message)
 *   const decrypted = crypto.asymmetric.decrypt(encrypted.data, pair.privateKey, options)
 *   if (!decrypted.success) throw new Error(decrypted.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface AsymmetricEncryptOptions {
  /** 密文模式：0=C1C2C3（旧版），1=C1C3C2（国标，默认） */
  cipherMode?: CipherMode
  /** 输出格式 */
  outputFormat?: 'hex' | 'base64'
}

/**
 * SM2 签名的哈希与用户标识参数；验签必须使用相同设置，默认启用哈希。
 *
 * @example
 * ```ts
 * import { crypto, type SignOptions } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const generated = crypto.asymmetric.generateKeyPair()
 *   if (!generated.success) throw new Error(generated.error.message)
 *   const pair = generated.data
 *   const options: SignOptions = { hash: true, userId: 'orders-service' }
 *   const signature = crypto.asymmetric.sign('hello', pair.privateKey, options)
 *   if (!signature.success) throw new Error(signature.error.message)
 *   const verified = crypto.asymmetric.verify('hello', signature.data, pair.publicKey, options)
 *   if (!verified.success) throw new Error(verified.error.message)
 *   const accepted = verified.data
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface SignOptions {
  /** 是否对数据进行哈希（默认 true） */
  hash?: boolean
  /** 用户 ID（默认 "1234567812345678"） */
  userId?: string
}

// ─── 哈希类型 ───

/**
 * 字符串输入编码；hex 表示解码后的字节，Uint8Array 直接作为字节输入。
 *
 * @example
 * ```ts
 * import { crypto, type HashOptions } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const options: HashOptions = { inputEncoding: 'hex' }
 *   const digest = crypto.hash.hash('6869', options)
 *   if (!digest.success) throw new Error(digest.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface HashOptions {
  /** 输入编码 */
  inputEncoding?: 'utf8' | 'hex'
}

// ─── 对称加密类型 ───

/**
 * SM4 的 CBC/ECB 模式；新数据使用默认 CBC，ECB 会暴露相同明文块结构，两者都不提供 MAC。
 *
 * @example
 * ```ts
 * import { crypto, type SymmetricMode } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const mode: SymmetricMode = 'cbc'
 *   const key = crypto.symmetric.generateKey()
 *   const encrypted = crypto.symmetric.encrypt('hello', key, { mode })
 *   if (!encrypted.success) throw new Error(encrypted.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export type SymmetricMode = 'ecb' | 'cbc'

/**
 * 结构化 SM4 ciphertext 的 hex/base64 编码标识，解密必须保留。
 *
 * @example
 * ```ts
 * import { crypto, type SymmetricCiphertextEncoding } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const outputFormat: SymmetricCiphertextEncoding = 'base64'
 *   const key = crypto.symmetric.generateKey()
 *   const encrypted = crypto.symmetric.encrypt('hello', key, { outputFormat })
 *   if (!encrypted.success) throw new Error(encrypted.error.message)
 *   const decrypted = crypto.symmetric.decrypt(encrypted.data, key)
 *   if (!decrypted.success) throw new Error(decrypted.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export type SymmetricCiphertextEncoding = 'hex' | 'base64'

/**
 * SM4 模式、IV 与编码；CBC 未提供 IV 时随机生成，手动 IV 必须每次独立随机。
 *
 * @example
 * ```ts
 * import { crypto, type SymmetricEncryptOptions } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const options: SymmetricEncryptOptions = { mode: 'cbc', outputFormat: 'base64' }
 *   const key = crypto.symmetric.generateKey()
 *   const encrypted = crypto.symmetric.encrypt('hello', key, options)
 *   if (!encrypted.success) throw new Error(encrypted.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface SymmetricEncryptOptions {
  /** 加密模式；默认 cbc */
  mode?: SymmetricMode
  /** IV 向量（CBC 模式可选；未传时自动生成，32 个十六进制字符） */
  iv?: string
  /** 密文输出编码；默认 hex */
  outputFormat?: SymmetricCiphertextEncoding
}

/**
 * SM4 密文及 mode/encoding/可选 IV；保留全部字段才能正确解密，不含消息认证能力。
 *
 * @example
 * ```ts
 * import { crypto, type SymmetricEncryptedPayload } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const key = crypto.symmetric.generateKey()
 *   const encrypted = crypto.symmetric.encrypt('hello', key)
 *   if (!encrypted.success) throw new Error(encrypted.error.message)
 *   const payload: SymmetricEncryptedPayload = encrypted.data
 *   const decrypted = crypto.symmetric.decrypt(payload, key)
 *   if (!decrypted.success) throw new Error(decrypted.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface SymmetricEncryptedPayload {
  /** 加密模式 */
  readonly mode: SymmetricMode
  /** 密文内容，编码由 encoding 字段说明 */
  readonly ciphertext: string
  /** CBC 模式的 IV 向量；ECB 模式无该字段 */
  readonly iv?: string
  /** ciphertext 字段的编码 */
  readonly encoding: SymmetricCiphertextEncoding
}

/**
 * CBC 结构化密文，mode固定cbc且IV必填；仍需上层消息认证。
 *
 * @example
 * ```ts
 * import { crypto, type SymmetricCbcEncryptedPayload } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const key = crypto.symmetric.generateKey()
 *   const encrypted = crypto.symmetric.encryptWithIV('hello', key)
 *   if (!encrypted.success) throw new Error(encrypted.error.message)
 *   const payload: SymmetricCbcEncryptedPayload = encrypted.data
 *   const decrypted = crypto.symmetric.decrypt(payload, key)
 *   if (!decrypted.success) throw new Error(decrypted.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface SymmetricCbcEncryptedPayload extends SymmetricEncryptedPayload {
  readonly mode: 'cbc'
  readonly iv: string
}

/**
 * SM4 解密输入别名；传入加密返回的完整结构，不能用裸密文猜测IV或编码。
 *
 * @example
 * ```ts
 * import { crypto, type SymmetricDecryptInput } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const key = crypto.symmetric.generateKey()
 *   const encrypted = crypto.symmetric.encrypt('hello', key)
 *   if (!encrypted.success) throw new Error(encrypted.error.message)
 *   const payload: SymmetricDecryptInput = encrypted.data
 *   const decrypted = crypto.symmetric.decrypt(payload, key)
 *   if (!decrypted.success) throw new Error(decrypted.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export type SymmetricDecryptInput = SymmetricEncryptedPayload

/**
 * encryptWithIV 的CBC结构化结果别名；含 mode、ciphertext、iv 与 encoding。
 *
 * @example
 * ```ts
 * import { crypto, type EncryptWithIVResult } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const key = crypto.symmetric.generateKey()
 *   const encrypted = crypto.symmetric.encryptWithIV('hello', key)
 *   if (!encrypted.success) throw new Error(encrypted.error.message)
 *   const payload: EncryptWithIVResult = encrypted.data
 *   const decrypted = crypto.symmetric.decrypt(payload, key)
 *   if (!decrypted.success) throw new Error(decrypted.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export type EncryptWithIVResult = SymmetricCbcEncryptedPayload

// ─── 密码类型 ───

/**
 * 迭代SM3密码参数；默认盐长16、迭代10000，合法范围以实现校验为准，已有哈希自行携带参数。
 *
 * @example
 * ```ts
 * import { crypto, type PasswordConfig } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const config: PasswordConfig = { saltLength: 16, iterations: 10000 }
 *   const hashed = crypto.password.hash('test-password', config)
 *   if (!hashed.success) throw new Error(hashed.error.message)
 *   const verified = crypto.password.verify('test-password', hashed.data)
 *   if (!verified.success) throw new Error(verified.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface PasswordConfig {
  /** 盐值长度（默认 16） */
  saltLength?: number
  /** 迭代次数（默认 10000） */
  iterations?: number
}

// ─── 操作接口 ───

/**
 * SM2 操作域；先初始化，所有 HaiResult 先检查 success，boolean 校验器按直接返回值使用。
 * 公钥曲线点有效不等于对端身份可信；可信公钥分发仍由TLS/受管信任链保证。
 *
 * @example
 * ```ts
 * import { crypto, type AsymmetricOperations } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const generated = crypto.asymmetric.generateKeyPair()
 *   if (!generated.success) throw new Error(generated.error.message)
 *   const pair = generated.data
 *   const operations: AsymmetricOperations = crypto.asymmetric
 *   const signature = operations.sign('hello', pair.privateKey)
 *   if (!signature.success) throw new Error(signature.error.message)
 *   const verified = operations.verify('hello', signature.data, pair.publicKey)
 *   if (!verified.success) throw new Error(verified.error.message)
 *   const matches = verified.data
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface AsymmetricOperations {
  /**
   * 生成密钥对
   *
   * @returns 成功时包含公私钥对；失败时返回 KEY_GENERATION_FAILED
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const generated = crypto.asymmetric.generateKeyPair()
   *   if (!generated.success) throw new Error(generated.error.message)
   *   const pair = generated.data
   *   const publicKey = pair.publicKey
   * }
   * finally { await crypto.close() }
   * ```
   */
  generateKeyPair: () => HaiResult<KeyPair>
  /**
   * 非对称加密
   *
   * @param data - 待加密明文
   * @param publicKey - 公钥（十六进制，支持带/不带 04 前缀）
   * @param options - 加密选项（密文模式、输出格式）
   * @returns 成功时返回密文字符串；失败时返回 INVALID_KEY 或 ENCRYPTION_FAILED
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const generated = crypto.asymmetric.generateKeyPair()
   *   if (!generated.success) throw new Error(generated.error.message)
   *   const pair = generated.data
   *   const encrypted = crypto.asymmetric.encrypt('hello', pair.publicKey, { cipherMode: 1, outputFormat: 'hex' })
   *   if (!encrypted.success) throw new Error(encrypted.error.message)
   * }
   * finally { await crypto.close() }
   * ```
   */
  encrypt: (data: string, publicKey: string, options?: AsymmetricEncryptOptions) => HaiResult<string>
  /**
   * 非对称解密
   *
   * 自动检测 base64 格式输入并转换为 hex。
   *
   * @param ciphertext - 密文（hex 或 base64）
   * @param privateKey - 私钥（64 字符十六进制）
   * @param options - 解密选项（密文模式需与加密时一致）
   * @returns 成功时返回明文；失败时返回 INVALID_KEY 或 DECRYPTION_FAILED
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const generated = crypto.asymmetric.generateKeyPair()
   *   if (!generated.success) throw new Error(generated.error.message)
   *   const pair = generated.data
   *   const encrypted = crypto.asymmetric.encrypt('hello', pair.publicKey)
   *   if (!encrypted.success) throw new Error(encrypted.error.message)
   *   const decrypted = crypto.asymmetric.decrypt(encrypted.data, pair.privateKey)
   *   if (!decrypted.success) throw new Error(decrypted.error.message)
   * }
   * finally { await crypto.close() }
   * ```
   */
  decrypt: (ciphertext: string, privateKey: string, options?: AsymmetricEncryptOptions) => HaiResult<string>
  /**
   * 签名
   *
   * @param data - 待签名数据
   * @param privateKey - 私钥（64 字符十六进制）
   * @param options - 签名选项（hash 开关、userId）
   * @returns 成功时返回签名字符串；失败时返回 INVALID_KEY 或 SIGN_FAILED
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const generated = crypto.asymmetric.generateKeyPair()
   *   if (!generated.success) throw new Error(generated.error.message)
   *   const pair = generated.data
   *   const signature = crypto.asymmetric.sign('hello', pair.privateKey)
   *   if (!signature.success) throw new Error(signature.error.message)
   * }
   * finally { await crypto.close() }
   * ```
   */
  sign: (data: string, privateKey: string, options?: SignOptions) => HaiResult<string>
  /**
   * 验签
   *
   * @param data - 原始数据
   * @param signature - 签名（需与签名时使用相同的 hash/userId 选项）
   * @param publicKey - 公钥（支持带/不带 04 前缀）
   * @param options - 验签选项
   * @returns 成功时返回 boolean；失败时返回 INVALID_KEY 或 VERIFY_FAILED
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const generated = crypto.asymmetric.generateKeyPair()
   *   if (!generated.success) throw new Error(generated.error.message)
   *   const pair = generated.data
   *   const signature = crypto.asymmetric.sign('hello', pair.privateKey)
   *   if (!signature.success) throw new Error(signature.error.message)
   *   const verified = crypto.asymmetric.verify('hello', signature.data, pair.publicKey)
   *   if (!verified.success) throw new Error(verified.error.message)
   *   const accepted = verified.data
   * }
   * finally { await crypto.close() }
   * ```
   */
  verify: (data: string, signature: string, publicKey: string, options?: SignOptions) => HaiResult<boolean>
  /**
   * 校验128/130字符SM2非压缩公钥编码及曲线点；有效不代表对端持有私钥。
   * @param key - 本次操作的密钥，不记录到日志。
   * @returns 直接boolean，false表示不匹配/未就绪。
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const generated = crypto.asymmetric.generateKeyPair()
   *   if (!generated.success) throw new Error(generated.error.message)
   *   const pair = generated.data
   *   const valid = crypto.asymmetric.isValidPublicKey(pair.publicKey)
   * }
   * finally { await crypto.close() }
   * ```
   */
  isValidPublicKey: (key: string) => boolean
  /**
   * 校验64字符十六进制私钥格式；这是格式检查，不是密钥配对证明。
   * @param key - 本次操作的密钥，不记录到日志。
   * @returns 直接boolean，false表示不匹配/未就绪。
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const generated = crypto.asymmetric.generateKeyPair()
   *   if (!generated.success) throw new Error(generated.error.message)
   *   const pair = generated.data
   *   const valid = crypto.asymmetric.isValidPrivateKey(pair.privateKey)
   * }
   * finally { await crypto.close() }
   * ```
   */
  isValidPrivateKey: (key: string) => boolean
}

/**
 * SM3 摘要、HMAC-SM3 与常量时间摘要匹配操作；摘要不是加密，HMAC密钥不能公开。
 *
 * @example
 * ```ts
 * import { crypto, type HashOperations } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const operations: HashOperations = crypto.hash
 *   const digest = operations.hash('hello')
 *   if (!digest.success) throw new Error(digest.error.message)
 *   const verified = operations.verify('hello', digest.data)
 *   if (!verified.success) throw new Error(verified.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface HashOperations {
  /**
   * 计算哈希
   *
   * @param data - 待哈希数据（字符串或 Uint8Array）
   * @param options - 输入编码选项
   * @returns 成功时返回 64 字符十六进制哈希值；失败时返回 HASH_FAILED
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const digest = crypto.hash.hash('6869', { inputEncoding: 'hex' })
   *   if (!digest.success) throw new Error(digest.error.message)
   * }
   * finally { await crypto.close() }
   * ```
   */
  hash: (data: string | Uint8Array, options?: HashOptions) => HaiResult<string>
  /**
   * 计算 HMAC
   *
   * 使用 HMAC 算法（RFC 2104）计算消息认证码。
   * 当密钥长度超过块大小（64 字节）时，会先对密钥进行哈希。
   *
   * @param data - 待计算数据
   * @param key - HMAC 密钥
   * @returns 成功时返回 64 字符十六进制 HMAC 值；失败时返回 HMAC_FAILED
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const key = crypto.symmetric.generateKey()
   *   const tag = crypto.hash.hmac('hello', key)
   *   if (!tag.success) throw new Error(tag.error.message)
   * }
   * finally { await crypto.close() }
   * ```
   */
  hmac: (data: string, key: string) => HaiResult<string>
  /**
   * 验证数据的哈希是否匹配
   *
   * 比较时忽略大小写。
   *
   * @param data - 原始数据
   * @param expectedHash - 期望的哈希值
   * @returns 成功时返回 boolean；失败时返回 HASH_FAILED
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const digest = crypto.hash.hash('hello')
   *   if (!digest.success) throw new Error(digest.error.message)
   *   const verified = crypto.hash.verify('hello', digest.data)
   *   if (!verified.success) throw new Error(verified.error.message)
   *   const matches = verified.data
   * }
   * finally { await crypto.close() }
   * ```
   */
  verify: (data: string, expectedHash: string) => HaiResult<boolean>
}

/**
 * SM4 同步操作域；默认CBC与随机IV，返回完整结构化密文；CBC原语不提供完整性认证。
 *
 * @example
 * ```ts
 * import { crypto, type SymmetricOperations } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const operations: SymmetricOperations = crypto.symmetric
 *   const key = operations.generateKey()
 *   const encrypted = operations.encrypt('hello', key)
 *   if (!encrypted.success) throw new Error(encrypted.error.message)
 *   const decrypted = operations.decrypt(encrypted.data, key)
 *   if (!decrypted.success) throw new Error(decrypted.error.message)
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface SymmetricOperations {
  /**
   * 生成随机密钥（16 字节 = 32 个十六进制字符）
   * @returns 直接返回值，使用前先初始化模块。
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const key = crypto.symmetric.generateKey()
   *   const valid = crypto.symmetric.isValidKey(key)
   * }
   * finally { await crypto.close() }
   * ```
   */
  generateKey: () => string
  /**
   * 生成随机 IV（16 字节 = 32 个十六进制字符）
   * @returns 直接返回值，使用前先初始化模块。
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const iv = crypto.symmetric.generateIV()
   *   const valid = crypto.symmetric.isValidIV(iv)
   * }
   * finally { await crypto.close() }
   * ```
   */
  generateIV: () => string
  /**
   * 对称加密
   *
   * 默认 CBC + 自动随机 IV，返回 `{ mode, ciphertext, iv, encoding }`。
   * 显式 `{ mode: 'ecb' }` 可使用 ECB，但不推荐用于新数据。
   *
   * @param data - 待加密明文
   * @param key - 密钥（32 字符十六进制）
   * @param options - 加密模式/IV/输出格式
   * @returns 成功时返回结构化密文；失败时返回 INVALID_KEY/INVALID_IV/ENCRYPTION_FAILED
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const key = crypto.symmetric.generateKey()
   *   const encrypted = crypto.symmetric.encrypt('hello', key)
   *   if (!encrypted.success) throw new Error(encrypted.error.message)
   * }
   * finally { await crypto.close() }
   * ```
   */
  encrypt: (data: string, key: string, options?: SymmetricEncryptOptions) => HaiResult<SymmetricEncryptedPayload>
  /**
   * 对称解密
   *
   * 解密 `encrypt()` 返回的结构化密文；不猜测字符串格式。
   *
   * @param payload - 结构化密文（包含 mode/ciphertext/iv/encoding）
   * @param key - 密钥（32 字符十六进制）
   * @returns 成功时返回明文；失败时返回 INVALID_KEY/INVALID_IV/DECRYPTION_FAILED
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const key = crypto.symmetric.generateKey()
   *   const encrypted = crypto.symmetric.encrypt('hello', key)
   *   if (!encrypted.success) throw new Error(encrypted.error.message)
   *   const decrypted = crypto.symmetric.decrypt(encrypted.data, key)
   *   if (!decrypted.success) throw new Error(decrypted.error.message)
   * }
   * finally { await crypto.close() }
   * ```
   */
  decrypt: (payload: SymmetricDecryptInput, key: string) => HaiResult<string>
  /**
   * 带 IV 加密（CBC 模式，自动生成随机 IV）
   *
   * @param data - 待加密明文
   * @param key - 密钥（32 字符十六进制）
   * @returns 成功时返回完整 { mode, ciphertext, iv, encoding }；失败时同 encrypt
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const key = crypto.symmetric.generateKey()
   *   const encrypted = crypto.symmetric.encryptWithIV('hello', key)
   *   if (!encrypted.success) throw new Error(encrypted.error.message)
   * }
   * finally { await crypto.close() }
   * ```
   */
  encryptWithIV: (data: string, key: string) => HaiResult<EncryptWithIVResult>
  /**
   * 带 IV 解密（CBC 模式）
   *
   * 不提供完整性认证。传输场景必须用 transport 先验签和验证 MAC，禁止直接对 HTTP 密文调用此 primitive。
   *
   * @param ciphertext - 密文
   * @param key - 密钥
   * @param iv - 加密时使用的 IV
   * @returns 成功时返回明文；失败时同 decrypt
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const key = crypto.symmetric.generateKey()
   *   const encrypted = crypto.symmetric.encryptWithIV('hello', key)
   *   if (!encrypted.success) throw new Error(encrypted.error.message)
   *   const decrypted = crypto.symmetric.decryptWithIV(encrypted.data.ciphertext, key, encrypted.data.iv)
   *   if (!decrypted.success) throw new Error(decrypted.error.message)
   * }
   * finally { await crypto.close() }
   * ```
   */
  decryptWithIV: (ciphertext: string, key: string, iv: string) => HaiResult<string>
  /**
   * 校验密钥格式是否合法（32 字符十六进制）
   * @param key - 本次操作的密钥，不记录到日志。
   * @returns 直接boolean，false表示不匹配/未就绪。
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const key = crypto.symmetric.generateKey()
   *   const valid = crypto.symmetric.isValidKey(key)
   * }
   * finally { await crypto.close() }
   * ```
   */
  isValidKey: (key: string) => boolean
  /**
   * 校验 IV 格式是否合法（32 字符十六进制）
   * @param iv - 实际调用输入，按该方法约束验证。
   * @returns 直接boolean，false表示不匹配/未就绪。
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const iv = crypto.symmetric.generateIV()
   *   const valid = crypto.symmetric.isValidIV(iv)
   * }
   * finally { await crypto.close() }
   * ```
   */
  isValidIV: (iv: string) => boolean
}

/**
 * 迭代加盐SM3密码存储操作；验证从 $hai$ 格式读取参数，返回成功false表示密码不匹配。
 *
 * @example
 * ```ts
 * import { crypto, type PasswordOperations } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const operations: PasswordOperations = crypto.password
 *   const hashed = operations.hash('test-password')
 *   if (!hashed.success) throw new Error(hashed.error.message)
 *   const verified = operations.verify('test-password', hashed.data)
 *   if (!verified.success) throw new Error(verified.error.message)
 *   const matches = verified.data
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface PasswordOperations {
  /**
   * 对密码进行哈希
   *
   * 输出格式: `$hai$<iterations>$<salt>$<hash>`
   *
   * @param password - 明文密码（不能为空）
   * @param config - 可选配置（盐值长度、迭代次数）
   * @returns 成功时返回格式化的哈希字符串；失败时返回 INVALID_INPUT 或 HASH_FAILED
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const hashed = crypto.password.hash('test-password', { iterations: 10000, saltLength: 16 })
   *   if (!hashed.success) throw new Error(hashed.error.message)
   * }
   * finally { await crypto.close() }
   * ```
   */
  hash: (password: string, config?: PasswordConfig) => HaiResult<string>
  /**
   * 验证密码是否匹配
   *
   * 自动从哈希字符串中解析迭代次数和盐值进行重新计算。
   *
   * @param password - 待验证的明文密码
   * @param hash - 存储的哈希值（格式: `$hai$<iterations>$<salt>$<hash>`）
   * @returns 成功时返回 boolean；失败时返回 INVALID_INPUT 或 VERIFY_FAILED
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const hashed = crypto.password.hash('test-password')
   *   if (!hashed.success) throw new Error(hashed.error.message)
   *   const verified = crypto.password.verify('test-password', hashed.data)
   *   if (!verified.success) throw new Error(verified.error.message)
   *   const matches = verified.data
   * }
   * finally { await crypto.close() }
   * ```
   */
  verify: (password: string, hash: string) => HaiResult<boolean>
}

// ─── 传输加密 ───

/**
 * 认证传输工厂；需先初始化crypto，服务端显式受管密钥环+共享registry，客户端通过TLS协商公钥。
 * 协议v2绑定方向、HTTP方法/路径/状态、密钥版本和nonce，验签/MAC成功后才解密；防重放不替代业务幂等。
 *
 * @example
 * ```ts
 * import { crypto } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const client = crypto.transport.createClient({ keyExchangeUrl: 'https://api.example.com/api/v1/_hai/key-exchange' })
 *   try {
 *     const ready = await client.init()
 *     if (!ready.success) throw new Error(ready.error.message)
 *     const response = await client.encryptedFetch('https://api.example.com/api/v1/orders')
 *     if (!response.ok) throw new Error('HTTP request failed')
 *   }
 *   finally { client.destroy() }
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface TransportOperations {
  /**
   * 创建服务端传输加密管理器。
   *
   * serverKeyRing/keyStore 均必填；生产使用相同受管密钥环与共享 registry。
   * 成功返回 manager；缺失、格式错误或公私钥错配返回脱敏 HaiResult 错误。
   *
   * @remarks
   * 通常在服务启动阶段创建一次，并交给 HTTP 中间件 / 路由处理器复用。
   * @param options - 实际调用输入，按该方法约束验证。
   * @returns HaiResult，先检查success再读取data。
   *
   * @example
   * ```ts
   * import { crypto, createRedisTransportKeyStore, parseTransportServerKeyRing } from '@h-ai/crypto'
   * import { cache } from '@h-ai/cache'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const connected = await cache.init({ type: 'redis', host: 'cache', port: 6379, password: process.env.HAI_CACHE_PASSWORD })
   *   if (!connected.success) throw new Error(connected.error.message)
   *   try {
   *     const registry = createRedisTransportKeyStore({ cache, ttlSeconds: 3600 })
   *     const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
   *     if (!ring.success) throw new Error(ring.error.message)
   *     const created = crypto.transport.createServer({ serverKeyRing: ring.data, keyStore: registry })
   *     if (!created.success) throw new Error(created.error.message)
   *     const manager = created.data
   *     try {
   *       const currentVersion = manager.getServerKeyId()
   *       const publicKey = manager.getServerPublicKey()
   *     }
   *     finally { await manager.close() }
   *   }
   *   finally { await cache.close() }
   * }
   * finally { await crypto.close() }
   * ```
   */
  createServer: (options: TransportCreateServerOptions) => HaiResult<TransportEncryptionManager>
  /**
   * 创建客户端传输加密会话。
   *
   * options.keyExchangeUrl：密钥协商端点完整 URL。
   * options.fetch：实际发送 HTTP 请求的 fetch（默认 `globalThis.fetch`）。
   *
   * @remarks
   * 返回的是“单会话”客户端：同一个实例会复用已协商得到的 `clientId` 与服务端公钥；
   * 调用 `destroy()` 后会回到未协商状态。
   * @param options - 实际调用输入，按该方法约束验证。
   * @param options.keyExchangeUrl - 密钥协商端点完整 URL。
   * @param options.fetch - 实际发送 HTTP 请求的 fetch，默认 `globalThis.fetch`。
   * @returns 直接返回值，使用前先初始化模块。
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const client = crypto.transport.createClient({ keyExchangeUrl: 'https://api.example.com/api/v1/_hai/key-exchange' })
   *   try {
   *     const ready = await client.init()
   *     if (!ready.success) throw new Error(ready.error.message)
   *     const response = await client.encryptedFetch('https://api.example.com/api/v1/orders')
   *     if (!response.ok) throw new Error('HTTP request failed')
   *   }
   *   finally { client.destroy() }
   * }
   * finally { await crypto.close() }
   * ```
   */
  createClient: (options: { keyExchangeUrl: string, fetch?: typeof fetch }) => TransportClient
  /** 协议常量（headers、密钥协商默认路径）。 */
  readonly protocol: typeof TRANSPORT_PROTOCOL_T
}

// ─── 函数接口 ───

/**
 * 加密模块服务接口；init检查HaiResult，close返回void，调用不能把原语当作已认证HTTP协议。
 *
 * @example
 * ```ts
 * import { crypto } from '@h-ai/crypto'
 * const initialized = await crypto.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const digest = crypto.hash.hash('hello')
 *   if (!digest.success) throw new Error(digest.error.message)
 *   const value = digest.data
 * }
 * finally { await crypto.close() }
 * ```
 */
export interface CryptoFunctions {
  /**
   * 初始化加密模块
   *
   * 创建非对称/哈希/对称/密码哈希操作实例。
   * 重复调用会先关闭再重新初始化。
   *
   * @returns 成功时返回 ok(undefined)；失败时返回 INIT_FAILED
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * await crypto.close()
   * ```
   */
  init: () => Promise<HaiResult<void>>
  /**
   * 关闭加密模块，释放内部状态
   *
   * 关闭后再访问 asymmetric/hash/symmetric/password 会返回 NOT_INITIALIZED 错误。
   * @returns 异步操作结果；存储或网络故障按方法契约拒绝。
   *
   * @example
   * ```ts
   * import { crypto } from '@h-ai/crypto'
   * const initialized = await crypto.init()
   * if (!initialized.success) throw new Error(initialized.error.message)
   * await crypto.close()
   * const ready = crypto.isInitialized
   * ```
   */
  close: () => Promise<void>
  /** 是否已初始化 */
  readonly isInitialized: boolean
  /** 非对称加密操作（未初始化时所有方法返回 NOT_INITIALIZED） */
  readonly asymmetric: AsymmetricOperations
  /** 哈希操作（未初始化时所有方法返回 NOT_INITIALIZED） */
  readonly hash: HashOperations
  /** 对称加密操作（未初始化时所有方法返回 NOT_INITIALIZED） */
  readonly symmetric: SymmetricOperations
  /** 密码哈希操作（未初始化时所有方法返回 NOT_INITIALIZED） */
  readonly password: PasswordOperations
  /** 传输加密操作（端到端混合加密；createServer 在未初始化时返回 NOT_INITIALIZED） */
  readonly transport: TransportOperations
}
