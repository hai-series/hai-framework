/**
 * =============================================================================
 * @hai/crypto - 类型定义
 * =============================================================================
 *
 * 本文件定义加密模块的核心接口和类型（非配置相关）。
 * 配置相关类型请从 crypto-config.ts 导入。
 *
 * 包含：
 * - 错误类型（CryptoError）
 * - SM2 非对称加密类型
 * - SM3 哈希类型
 * - SM4 对称加密类型
 * - Provider 接口
 * - 统一服务接口
 *
 * @example
 * ```ts
 * import type { CryptoService, SM2KeyPair, SM4Options } from '@hai/crypto'
 *
 * // 使用 SM2 密钥对
 * const keyPair: SM2KeyPair = {
 *     publicKey: '04...',
 *     privateKey: '...'
 * }
 * ```
 *
 * @module crypto-types
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { CryptoConfig, CryptoConfigInput, CryptoErrorCodeType, SM4Mode } from './crypto-config.js'

// =============================================================================
// 重新导出配置类型（方便使用）
// =============================================================================

export type { CryptoConfig, CryptoConfigInput, CryptoErrorCodeType, SM4Mode } from './crypto-config.js'
export {
  CryptoConfigSchema,
  CryptoErrorCode,
  SM2CipherModeSchema,
  SM2EncryptOptionsSchema,
  SM2SignOptionsSchema,
  SM3OptionsSchema,
  SM4ModeSchema,
  SM4OptionsSchema,
} from './crypto-config.js'

// =============================================================================
// 错误类型
// =============================================================================

/**
 * 加密错误接口
 *
 * 所有加密操作返回的错误都遵循此接口。
 *
 * @example
 * ```ts
 * const result = crypto.sm2.encrypt('data', publicKey)
 * if (!result.success) {
 *     const error: CryptoError = result.error
 *     // 处理错误：根据 error.code / error.message 做兜底
 * }
 * ```
 */
export interface CryptoError {
  /** 错误码（数值，参见 CryptoErrorCode） */
  code: CryptoErrorCodeType
  /** 错误消息 */
  message: string
  /** 原始错误（可选） */
  cause?: unknown
}

// =============================================================================
// SM2 非对称加密类型
// =============================================================================

/**
 * SM2 密钥对
 */
export interface SM2KeyPair {
  /** 公钥（十六进制字符串，包含 04 前缀为非压缩格式） */
  publicKey: string
  /** 私钥（十六进制字符串，64 字符） */
  privateKey: string
}

/**
 * SM2 加密选项
 */
export interface SM2EncryptOptions {
  /** 密文模式：0=C1C2C3（旧版），1=C1C3C2（国标，默认） */
  cipherMode?: 0 | 1
  /** 输出格式 */
  outputFormat?: 'hex' | 'base64'
}

/**
 * SM2 签名选项
 */
export interface SM2SignOptions {
  /** 是否对数据进行哈希（默认 true） */
  hash?: boolean
  /** 用户 ID（默认 "1234567812345678"） */
  userId?: string
  /** 输出格式 */
  outputFormat?: 'hex' | 'der'
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
  outputFormat?: 'hex' | 'array'
}

// =============================================================================
// SM4 对称加密类型
// =============================================================================

/**
 * SM4 加密选项
 */
export interface SM4Options {
  /** 加密模式 */
  mode?: SM4Mode
  /** IV 向量（CBC 模式必需，32 个十六进制字符） */
  iv?: string
  /** 输入编码 */
  inputEncoding?: 'utf8' | 'hex'
  /** 输出格式 */
  outputFormat?: 'hex' | 'base64'
}

/**
 * SM4 带 IV 加密结果
 */
export interface SM4EncryptWithIVResult {
  /** 密文 */
  ciphertext: string
  /** IV 向量 */
  iv: string
}

// =============================================================================
// 算法操作接口
// =============================================================================

/**
 * SM2 非对称加密操作接口
 *
 * 提供 SM2 国密非对称加密、签名功能。
 */
export interface SM2Operations {
  /** 生成密钥对 */
  generateKeyPair: () => Result<SM2KeyPair, CryptoError>
  /** 加密 */
  encrypt: (data: string, publicKey: string, options?: SM2EncryptOptions) => Result<string, CryptoError>
  /** 解密 */
  decrypt: (ciphertext: string, privateKey: string, options?: SM2EncryptOptions) => Result<string, CryptoError>
  /** 签名 */
  sign: (data: string, privateKey: string, options?: SM2SignOptions) => Result<string, CryptoError>
  /** 验签 */
  verify: (data: string, signature: string, publicKey: string, options?: SM2SignOptions) => Result<boolean, CryptoError>
  /** 验证公钥格式是否合法 */
  isValidPublicKey: (key: string) => boolean
  /** 验证私钥格式是否合法 */
  isValidPrivateKey: (key: string) => boolean
}

/**
 * SM3 哈希操作接口
 *
 * 提供 SM3 国密哈希功能。
 */
export interface SM3Operations {
  /** 计算哈希 */
  hash: (data: string | Uint8Array, options?: SM3Options) => Result<string, CryptoError>
  /** 计算 HMAC */
  hmac: (data: string, key: string) => Result<string, CryptoError>
  /** 验证哈希是否匹配 */
  verify: (data: string, expectedHash: string) => Result<boolean, CryptoError>
}

/**
 * SM4 对称加密操作接口
 *
 * 提供 SM4 国密对称加密功能。
 */
export interface SM4Operations {
  /** 生成随机密钥（16 字节，32 个十六进制字符） */
  generateKey: () => string
  /** 生成随机 IV（16 字节，32 个十六进制字符） */
  generateIV: () => string
  /** 加密 */
  encrypt: (data: string, key: string, options?: SM4Options) => Result<string, CryptoError>
  /** 解密 */
  decrypt: (ciphertext: string, key: string, options?: SM4Options) => Result<string, CryptoError>
  /** 带 IV 加密（自动生成 IV） */
  encryptWithIV: (data: string, key: string) => Result<SM4EncryptWithIVResult, CryptoError>
  /** 带 IV 解密 */
  decryptWithIV: (ciphertext: string, key: string, iv: string) => Result<string, CryptoError>
  /** 从密码派生密钥 */
  deriveKey: (password: string, salt: string) => string
  /** 验证密钥格式是否合法 */
  isValidKey: (key: string) => boolean
  /** 验证 IV 格式是否合法 */
  isValidIV: (iv: string) => boolean
}

// =============================================================================
// 统一加密服务接口
// =============================================================================

/**
 * 统一加密服务接口
 *
 * 聚合 SM2、SM3、SM4 算法，提供统一入口。
 */
export interface CryptoService {
  /** SM2 非对称加密 */
  readonly sm2: SM2Operations
  /** SM3 哈希 */
  readonly sm3: SM3Operations
  /** SM4 对称加密 */
  readonly sm4: SM4Operations
  /** 当前配置 */
  readonly config: CryptoConfig
  /** 检查是否已初始化 */
  readonly isInitialized: boolean
  /** 初始化（可重新配置） */
  init: (config?: CryptoConfigInput) => void
}
