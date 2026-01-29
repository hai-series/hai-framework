/**
 * =============================================================================
 * @hai/crypto - 类型定义
 * =============================================================================
 * 定义加密模块的所有接口和类型
 * =============================================================================
 */

import type { Result } from '@hai/core'

// =============================================================================
// Provider 定义
// =============================================================================

/**
 * 加密服务提供者类型
 */
export type CryptoProvider = 'hai' | 'webcrypto' | 'node' | 'custom'

/**
 * 加密服务配置
 */
export interface CryptoConfig {
  /** 提供者类型 */
  provider: CryptoProvider
  /** 默认算法 */
  defaultAlgorithm?: 'sm' | 'aes' | 'rsa'
  /** 自定义配置 */
  custom?: Record<string, unknown>
}

// =============================================================================
// SM2 非对称加密类型
// =============================================================================

/**
 * SM2 密钥对
 */
export interface SM2KeyPair {
  /** 公钥（十六进制字符串） */
  publicKey: string
  /** 私钥（十六进制字符串） */
  privateKey: string
}

/**
 * SM2 加密选项
 */
export interface SM2EncryptOptions {
  /** 密文模式：C1C3C2 (国标) 或 C1C2C3 (旧版) */
  cipherMode?: 0 | 1
  /** 输出格式 */
  outputFormat?: 'hex' | 'base64'
}

/**
 * SM2 签名选项
 */
export interface SM2SignOptions {
  /** 哈希算法 */
  hash?: boolean
  /** 用户ID（默认 "1234567812345678"） */
  userId?: string
  /** 输出格式 */
  outputFormat?: 'hex' | 'der'
}

/**
 * SM2 错误类型
 */
export type SM2ErrorType
  = | 'KEY_GENERATION_FAILED'
    | 'ENCRYPTION_FAILED'
    | 'DECRYPTION_FAILED'
    | 'SIGN_FAILED'
    | 'VERIFY_FAILED'
    | 'INVALID_KEY'

/**
 * SM2 错误
 */
export interface SM2Error {
  type: SM2ErrorType
  message: string
}

// =============================================================================
// SM3 哈希类型
// =============================================================================

/**
 * SM3 哈希选项
 */
export interface SM3Options {
  /** 输入编码 */
  inputEncoding?: 'utf8' | 'hex'
  /** 输出格式 */
  outputFormat?: 'hex' | 'buffer'
}

/**
 * SM3 HMAC 选项
 */
export interface SM3HmacOptions extends SM3Options {
  /** HMAC 密钥 */
  key: string
}

/**
 * SM3 错误类型
 */
export type SM3ErrorType = 'HASH_FAILED' | 'HMAC_FAILED' | 'INVALID_INPUT'

/**
 * SM3 错误
 */
export interface SM3Error {
  type: SM3ErrorType
  message: string
}

// =============================================================================
// SM4 对称加密类型
// =============================================================================

/**
 * SM4 加密模式
 */
export type SM4Mode = 'ecb' | 'cbc'

/**
 * SM4 加密选项
 */
export interface SM4Options {
  /** 加密模式 */
  mode?: SM4Mode
  /** IV 向量（CBC 模式必需） */
  iv?: string
  /** 输入编码 */
  inputEncoding?: 'utf8' | 'hex'
  /** 输出格式 */
  outputFormat?: 'hex' | 'base64'
}

/**
 * SM4 错误类型
 */
export type SM4ErrorType
  = | 'ENCRYPTION_FAILED'
    | 'DECRYPTION_FAILED'
    | 'INVALID_KEY'
    | 'INVALID_IV'
    | 'INVALID_INPUT'

/**
 * SM4 错误
 */
export interface SM4Error {
  type: SM4ErrorType
  message: string
}

// =============================================================================
// 密码哈希类型
// =============================================================================

/**
 * Argon2 配置选项
 */
export interface Argon2Options {
  /** 内存成本（KB） */
  memoryCost?: number
  /** 时间成本（迭代次数） */
  timeCost?: number
  /** 并行度 */
  parallelism?: number
  /** 输出长度（字节） */
  hashLength?: number
  /** 盐长度（字节） */
  saltLength?: number
}

/**
 * 密码哈希错误类型
 */
export type PasswordErrorType
  = | 'HASH_FAILED'
    | 'VERIFY_FAILED'
    | 'INVALID_HASH'
    | 'INVALID_PASSWORD'

/**
 * 密码哈希错误
 */
export interface PasswordError {
  type: PasswordErrorType
  message: string
}

// =============================================================================
// 通用加密错误
// =============================================================================

/**
 * 加密错误类型
 */
export type CryptoErrorType
  = | 'PROVIDER_NOT_FOUND'
    | 'INITIALIZATION_FAILED'
    | 'OPERATION_FAILED'
    | SM2ErrorType
    | SM3ErrorType
    | SM4ErrorType
    | PasswordErrorType

/**
 * 加密错误
 */
export interface CryptoError {
  type: CryptoErrorType
  message: string
  cause?: unknown
}

// =============================================================================
// Provider 接口
// =============================================================================

/**
 * SM2 非对称加密 Provider
 */
export interface SM2Provider {
  /** 生成密钥对 */
  generateKeyPair: () => Result<SM2KeyPair, SM2Error>
  /** 加密 */
  encrypt: (data: string, publicKey: string, options?: SM2EncryptOptions) => Result<string, SM2Error>
  /** 解密 */
  decrypt: (ciphertext: string, privateKey: string, options?: SM2EncryptOptions) => Result<string, SM2Error>
  /** 签名 */
  sign: (data: string, privateKey: string, options?: SM2SignOptions) => Result<string, SM2Error>
  /** 验签 */
  verify: (data: string, signature: string, publicKey: string, options?: SM2SignOptions) => Result<boolean, SM2Error>
  /** 验证公钥 */
  isValidPublicKey: (key: string) => boolean
  /** 验证私钥 */
  isValidPrivateKey: (key: string) => boolean
}

/**
 * SM3 哈希 Provider
 */
export interface SM3Provider {
  /** 计算哈希 */
  hash: (data: string | Uint8Array, options?: SM3Options) => Result<string, SM3Error>
  /** 计算 HMAC */
  hmac: (data: string, key: string) => Result<string, SM3Error>
  /** 验证哈希 */
  verify: (data: string, expectedHash: string) => Result<boolean, SM3Error>
}

/**
 * SM4 对称加密 Provider
 */
export interface SM4Provider {
  /** 生成密钥 */
  generateKey: () => string
  /** 生成 IV */
  generateIV: () => string
  /** 加密 */
  encrypt: (data: string, key: string, options?: SM4Options) => Result<string, SM4Error>
  /** 解密 */
  decrypt: (ciphertext: string, key: string, options?: SM4Options) => Result<string, SM4Error>
  /** 带 IV 加密 */
  encryptWithIV: (data: string, key: string) => Result<{ ciphertext: string, iv: string }, SM4Error>
  /** 带 IV 解密 */
  decryptWithIV: (ciphertext: string, key: string, iv: string) => Result<string, SM4Error>
  /** 派生密钥 */
  deriveKey: (password: string, salt: string) => string
  /** 验证密钥 */
  isValidKey: (key: string) => boolean
  /** 验证 IV */
  isValidIV: (iv: string) => boolean
}

/**
 * 密码哈希 Provider
 */
export interface PasswordProvider {
  /** 哈希密码 */
  hash: (password: string, options?: Argon2Options) => Result<string, PasswordError>
  /** 验证密码 */
  verify: (password: string, hash: string) => Result<boolean, PasswordError>
  /** 检查是否需要重新哈希 */
  needsRehash: (hash: string, options?: Argon2Options) => boolean
}

// =============================================================================
// 统一加密服务接口
// =============================================================================

/**
 * 统一加密服务
 */
export interface CryptoService {
  /** SM2 非对称加密 */
  readonly sm2: SM2Provider
  /** SM3 哈希 */
  readonly sm3: SM3Provider
  /** SM4 对称加密 */
  readonly sm4: SM4Provider
  /** 密码哈希 */
  readonly password: PasswordProvider
  /** 当前配置 */
  readonly config: CryptoConfig
  /** 初始化 */
  init: (config?: Partial<CryptoConfig>) => Promise<void>
}
