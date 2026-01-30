/**
 * =============================================================================
 * @hai/crypto - 加密配置 Schema
 * =============================================================================
 *
 * 本文件定义加密模块的配置结构，使用 Zod 进行运行时校验。
 *
 * 包含：
 * - 错误码常量（4000-4999 范围）
 * - SM2/SM3/SM4 相关配置
 * - 统一的 CryptoConfig 配置结构
 *
 * @example
 * ```ts
 * import { CryptoConfigSchema, CryptoErrorCode } from '@hai/crypto'
 *
 * // 校验配置
 * const config = CryptoConfigSchema.parse({
 *     defaultAlgorithm: 'sm'
 * })
 *
 * // 使用错误码
 * if (error.code === CryptoErrorCode.ENCRYPTION_FAILED) {
 *     // 处理错误：加密失败
 * }
 * ```
 *
 * @module crypto-config
 * =============================================================================
 */

import { z } from 'zod'

// =============================================================================
// 错误码常量
// =============================================================================

/**
 * 加密错误码（数值范围 4000-4999）
 *
 * 用于标识加密操作中的各类错误，便于错误处理和日志记录。
 *
 * @example
 * ```ts
 * import { CryptoErrorCode } from '@hai/crypto'
 *
 * if (result.error?.code === CryptoErrorCode.ENCRYPTION_FAILED) {
 *     // 处理错误：加密失败
 * }
 * ```
 */
export const CryptoErrorCode = {
  // SM2 相关错误 (4000-4019)
  /** 密钥生成失败 */
  KEY_GENERATION_FAILED: 4000,
  /** 加密失败 */
  ENCRYPTION_FAILED: 4001,
  /** 解密失败 */
  DECRYPTION_FAILED: 4002,
  /** 签名失败 */
  SIGN_FAILED: 4003,
  /** 验签失败 */
  VERIFY_FAILED: 4004,
  /** 无效密钥 */
  INVALID_KEY: 4005,

  // SM3 相关错误 (4020-4039)
  /** 哈希计算失败 */
  HASH_FAILED: 4020,
  /** HMAC 计算失败 */
  HMAC_FAILED: 4021,
  /** 无效输入 */
  INVALID_INPUT: 4022,

  // SM4 相关错误 (4040-4059)
  /** 无效 IV */
  INVALID_IV: 4040,

  // 通用错误 (4060-4099)
  /** 未初始化 */
  NOT_INITIALIZED: 4060,
  /** 不支持的算法 */
  UNSUPPORTED_ALGORITHM: 4061,
  /** 配置错误 */
  CONFIG_ERROR: 4062,
  /** 操作失败 */
  OPERATION_FAILED: 4063,
} as const

/** 加密错误码类型 */
export type CryptoErrorCodeType = typeof CryptoErrorCode[keyof typeof CryptoErrorCode]

// =============================================================================
// SM2 配置 Schema
// =============================================================================

/**
 * SM2 密文模式
 *
 * - 0: C1C2C3（旧版模式）
 * - 1: C1C3C2（国标模式，推荐）
 */
export const SM2CipherModeSchema = z.union([z.literal(0), z.literal(1)]).default(1)
export type SM2CipherMode = z.infer<typeof SM2CipherModeSchema>

/**
 * SM2 加密选项 Schema
 */
export const SM2EncryptOptionsSchema = z.object({
  /** 密文模式：0=C1C2C3, 1=C1C3C2（国标） */
  cipherMode: SM2CipherModeSchema.optional(),
  /** 输出格式 */
  outputFormat: z.enum(['hex', 'base64']).default('hex').optional(),
}).optional()

/**
 * SM2 签名选项 Schema
 */
export const SM2SignOptionsSchema = z.object({
  /** 是否对数据进行哈希 */
  hash: z.boolean().default(true).optional(),
  /** 用户 ID（默认 "1234567812345678"） */
  userId: z.string().default('1234567812345678').optional(),
  /** 输出格式 */
  outputFormat: z.enum(['hex', 'der']).default('hex').optional(),
}).optional()

// =============================================================================
// SM3 配置 Schema
// =============================================================================

/**
 * SM3 选项 Schema
 */
export const SM3OptionsSchema = z.object({
  /** 输入编码 */
  inputEncoding: z.enum(['utf8', 'hex']).default('utf8').optional(),
  /** 输出格式 */
  outputFormat: z.enum(['hex', 'array']).default('hex').optional(),
}).optional()

// =============================================================================
// SM4 配置 Schema
// =============================================================================

/**
 * SM4 加密模式
 */
export const SM4ModeSchema = z.enum(['ecb', 'cbc']).default('ecb')
export type SM4Mode = z.infer<typeof SM4ModeSchema>

/**
 * SM4 选项 Schema
 */
export const SM4OptionsSchema = z.object({
  /** 加密模式 */
  mode: SM4ModeSchema.optional(),
  /** IV 向量（CBC 模式必需） */
  iv: z.string().optional(),
  /** 输入编码 */
  inputEncoding: z.enum(['utf8', 'hex']).default('utf8').optional(),
  /** 输出格式 */
  outputFormat: z.enum(['hex', 'base64']).default('hex').optional(),
}).optional()

// =============================================================================
// 统一配置 Schema
// =============================================================================

/**
 * 加密服务配置 Schema
 */
export const CryptoConfigSchema = z.object({
  /** 默认算法 */
  defaultAlgorithm: z.enum(['sm']).default('sm'),
  /** 自定义配置 */
  custom: z.record(z.string(), z.unknown()).optional(),
})

/** 加密服务配置类型 */
export type CryptoConfig = z.infer<typeof CryptoConfigSchema>

/** 加密服务配置输入类型（允许部分字段） */
export type CryptoConfigInput = z.input<typeof CryptoConfigSchema>
