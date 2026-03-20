/**
 * @h-ai/crypto — 公共类型
 *
 * 定义加密模块的对外接口类型。
 * @module crypto-types
 */

import type { Result } from '@h-ai/core'
import type { CryptoErrorCodeType } from './crypto-config.js'

/**
 * 加密模块统一错误类型
 *
 * 所有操作失败时返回此结构，code 对应 {@link CryptoErrorCode} 中的常量。
 */
export interface CryptoError {
  /** 错误码，对应 CryptoErrorCode 枚举值 */
  code: CryptoErrorCodeType
  /** 人类可读的错误描述（i18n） */
  message: string
  /** 原始错误对象（如有） */
  cause?: unknown
}

// ─── 非对称加密类型 ───

/** 密文模式：0=C1C2C3（旧版），1=C1C3C2（国标） */
export type CipherMode = 0 | 1

/** 非对称密钥对 */
export interface KeyPair {
  /** 公钥（十六进制字符串，包含 04 前缀为非压缩格式） */
  publicKey: string
  /** 私钥（十六进制字符串，64 字符） */
  privateKey: string
}

/** 非对称加密选项 */
export interface AsymmetricEncryptOptions {
  /** 密文模式：0=C1C2C3（旧版），1=C1C3C2（国标，默认） */
  cipherMode?: CipherMode
  /** 输出格式 */
  outputFormat?: 'hex' | 'base64'
}

/** 签名选项 */
export interface SignOptions {
  /** 是否对数据进行哈希（默认 true） */
  hash?: boolean
  /** 用户 ID（默认 "1234567812345678"） */
  userId?: string
  /** 输出格式 */
  outputFormat?: 'hex' | 'der'
}

// ─── 哈希类型 ───

/** 哈希选项 */
export interface HashOptions {
  /** 输入编码 */
  inputEncoding?: 'utf8' | 'hex'
}

// ─── 对称加密类型 ───

/** 对称加密模式 */
export type SymmetricMode = 'ecb' | 'cbc'

/** 对称加密选项 */
export interface SymmetricOptions {
  /** 加密模式 */
  mode?: SymmetricMode
  /** IV 向量（CBC 模式必需，32 个十六进制字符） */
  iv?: string
  /** 输入编码 */
  inputEncoding?: 'utf8' | 'hex'
  /** 输出格式 */
  outputFormat?: 'hex' | 'base64'
}

/** 带 IV 加密结果 */
export interface EncryptWithIVResult {
  /** 密文 */
  ciphertext: string
  /** IV 向量 */
  iv: string
}

// ─── 密码类型 ───

/** 密码哈希配置 */
export interface PasswordConfig {
  /** 盐值长度（默认 16） */
  saltLength?: number
  /** 迭代次数（默认 10000） */
  iterations?: number
}

// ─── 操作接口 ───

/**
 * 非对称加密操作接口
 *
 * 通过 `crypto.asymmetric` 访问，需先调用 `crypto.init()`。
 */
export interface AsymmetricOperations {
  /**
   * 生成密钥对
   *
   * @returns 成功时包含公私钥对；失败时返回 KEY_GENERATION_FAILED
   */
  generateKeyPair: () => Result<KeyPair, CryptoError>
  /**
   * 非对称加密
   *
   * @param data - 待加密明文
   * @param publicKey - 公钥（十六进制，支持带/不带 04 前缀）
   * @param options - 加密选项（密文模式、输出格式）
   * @returns 成功时返回密文字符串；失败时返回 INVALID_KEY 或 ENCRYPTION_FAILED
   */
  encrypt: (data: string, publicKey: string, options?: AsymmetricEncryptOptions) => Result<string, CryptoError>
  /**
   * 非对称解密
   *
   * 自动检测 base64 格式输入并转换为 hex。
   *
   * @param ciphertext - 密文（hex 或 base64）
   * @param privateKey - 私钥（64 字符十六进制）
   * @param options - 解密选项（密文模式需与加密时一致）
   * @returns 成功时返回明文；失败时返回 INVALID_KEY 或 DECRYPTION_FAILED
   */
  decrypt: (ciphertext: string, privateKey: string, options?: AsymmetricEncryptOptions) => Result<string, CryptoError>
  /**
   * 签名
   *
   * @param data - 待签名数据
   * @param privateKey - 私钥（64 字符十六进制）
   * @param options - 签名选项（hash 开关、userId）
   * @returns 成功时返回签名字符串；失败时返回 INVALID_KEY 或 SIGN_FAILED
   */
  sign: (data: string, privateKey: string, options?: SignOptions) => Result<string, CryptoError>
  /**
   * 验签
   *
   * @param data - 原始数据
   * @param signature - 签名（需与签名时使用相同的 hash/userId 选项）
   * @param publicKey - 公钥（支持带/不带 04 前缀）
   * @param options - 验签选项
   * @returns 成功时返回 boolean；失败时返回 INVALID_KEY 或 VERIFY_FAILED
   */
  verify: (data: string, signature: string, publicKey: string, options?: SignOptions) => Result<boolean, CryptoError>
  /**
   * 校验公钥格式是否合法
   *
   * 合法格式：128 字符十六进制（无前缀）或 130 字符（含 04 前缀）。
   */
  isValidPublicKey: (key: string) => boolean
  /**
   * 校验私钥格式是否合法
   *
   * 合法格式：64 字符十六进制。
   */
  isValidPrivateKey: (key: string) => boolean
}

/**
 * 哈希操作接口
 *
 * 通过 `crypto.hash` 访问，需先调用 `crypto.init()`。
 */
export interface HashOperations {
  /**
   * 计算哈希
   *
   * @param data - 待哈希数据（字符串或 Uint8Array）
   * @param options - 输入编码选项
   * @returns 成功时返回 64 字符十六进制哈希值；失败时返回 HASH_FAILED
   */
  hash: (data: string | Uint8Array, options?: HashOptions) => Result<string, CryptoError>
  /**
   * 计算 HMAC
   *
   * 使用 HMAC 算法（RFC 2104）计算消息认证码。
   * 当密钥长度超过块大小（64 字节）时，会先对密钥进行哈希。
   *
   * @param data - 待计算数据
   * @param key - HMAC 密钥
   * @returns 成功时返回 64 字符十六进制 HMAC 值；失败时返回 HMAC_FAILED
   */
  hmac: (data: string, key: string) => Result<string, CryptoError>
  /**
   * 验证数据的哈希是否匹配
   *
   * 比较时忽略大小写。
   *
   * @param data - 原始数据
   * @param expectedHash - 期望的哈希值
   * @returns 成功时返回 boolean；失败时返回 HASH_FAILED
   */
  verify: (data: string, expectedHash: string) => Result<boolean, CryptoError>
}

/**
 * 对称加密操作接口
 *
 * 通过 `crypto.symmetric` 访问，需先调用 `crypto.init()`。
 * 支持 ECB/CBC 两种模式，CBC 模式需要提供 IV。
 */
export interface SymmetricOperations {
  /** 生成随机密钥（16 字节 = 32 个十六进制字符） */
  generateKey: () => string
  /** 生成随机 IV（16 字节 = 32 个十六进制字符） */
  generateIV: () => string
  /**
   * 对称加密
   *
   * @param data - 待加密明文
   * @param key - 密钥（32 字符十六进制）
   * @param options - 加密模式/IV/输出格式
   * @returns 成功时返回密文；失败时返回 INVALID_KEY/INVALID_IV/ENCRYPTION_FAILED
   */
  encrypt: (data: string, key: string, options?: SymmetricOptions) => Result<string, CryptoError>
  /**
   * 对称解密
   *
   * 自动检测 base64 格式输入并转换为 hex。
   *
   * @param ciphertext - 密文（hex 或 base64）
   * @param key - 密钥（32 字符十六进制）
   * @param options - 解密模式/IV（需与加密时一致）
   * @returns 成功时返回明文；失败时返回 INVALID_KEY/INVALID_IV/DECRYPTION_FAILED
   */
  decrypt: (ciphertext: string, key: string, options?: SymmetricOptions) => Result<string, CryptoError>
  /**
   * 带 IV 加密（CBC 模式，自动生成随机 IV）
   *
   * @param data - 待加密明文
   * @param key - 密钥（32 字符十六进制）
   * @returns 成功时返回 { ciphertext, iv }；失败时同 encrypt
   */
  encryptWithIV: (data: string, key: string) => Result<EncryptWithIVResult, CryptoError>
  /**
   * 带 IV 解密（CBC 模式）
   *
   * @param ciphertext - 密文
   * @param key - 密钥
   * @param iv - 加密时使用的 IV
   * @returns 成功时返回明文；失败时同 decrypt
   */
  decryptWithIV: (ciphertext: string, key: string, iv: string) => Result<string, CryptoError>
  /**
   * 从密码和盐值派生密钥
   *
   * 内部使用哈希(password + salt) 取前 32 字符作为密钥。
   * 注意：此为简单派生，不适用于高安全场景。
   *
   * @param password - 密码
   * @param salt - 盐值
   * @returns 32 字符十六进制密钥
   */
  deriveKey: (password: string, salt: string) => string
  /** 校验密钥格式是否合法（32 字符十六进制） */
  isValidKey: (key: string) => boolean
  /** 校验 IV 格式是否合法（32 字符十六进制） */
  isValidIV: (iv: string) => boolean
}

/**
 * 密码哈希操作接口
 *
 * 通过 `crypto.password` 访问，需先调用 `crypto.init()`。
 * 使用迭代加盐的方式生成密码哈希。
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
   */
  hash: (password: string, config?: PasswordConfig) => Result<string, CryptoError>
  /**
   * 验证密码是否匹配
   *
   * 自动从哈希字符串中解析迭代次数和盐值进行重新计算。
   *
   * @param password - 待验证的明文密码
   * @param hash - 存储的哈希值（格式: `$hai$<iterations>$<salt>$<hash>`）
   * @returns 成功时返回 boolean；失败时返回 INVALID_INPUT 或 VERIFY_FAILED
   */
  verify: (password: string, hash: string) => Result<boolean, CryptoError>
}

// ─── 函数接口 ───

/**
 * 加密模块函数接口
 *
 * `crypto` 服务对象的类型定义。使用前必须调用 `init()` 初始化。
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
export interface CryptoFunctions {
  /**
   * 初始化加密模块
   *
   * 创建非对称/哈希/对称/密码哈希操作实例。
   * 重复调用会先关闭再重新初始化。
   *
   * @returns 成功时返回 ok(undefined)；失败时返回 INIT_FAILED
   */
  init: () => Promise<Result<void, CryptoError>>
  /**
   * 关闭加密模块，释放内部状态
   *
   * 关闭后再访问 asymmetric/hash/symmetric/password 会返回 NOT_INITIALIZED 错误。
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
}
