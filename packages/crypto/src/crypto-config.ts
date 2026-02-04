/**
 * =============================================================================
 * @hai/crypto - 加密配置 Schema
 * =============================================================================
 *
 * 本文件定义加密模块的配置结构，使用 Zod 进行运行时校验。
 *
 * 包含：
 * - 错误码常量（4000-4999 范围）
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
