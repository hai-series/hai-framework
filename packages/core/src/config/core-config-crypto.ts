/**
 * =============================================================================
 * @hai/core - 加密配置 Schema
 * =============================================================================
 * 定义加密相关配置的 Zod schema
 *
 * 对应配置文件: _crypto.yml
 * =============================================================================
 */

import { z } from 'zod'

// =============================================================================
// 错误码（加密 6000-6999）
// =============================================================================

/**
 * 加密错误码 (6000-6999)
 */
export const CryptoErrorCode = {
  ENCRYPT_FAILED: 6000,
  DECRYPT_FAILED: 6001,
  SIGN_FAILED: 6002,
  VERIFY_FAILED: 6003,
  KEY_GENERATION_FAILED: 6004,
  INVALID_KEY: 6005,
  KEY_NOT_FOUND: 6006,
  HASH_FAILED: 6007,
  RANDOM_FAILED: 6008,
  ALGORITHM_NOT_SUPPORTED: 6009,
} as const
// eslint-disable-next-line ts/no-redeclare -- 同时导出 value/type，提供更直观的公共 API
export type CryptoErrorCode = typeof CryptoErrorCode[keyof typeof CryptoErrorCode]

// =============================================================================
// 配置类型
// =============================================================================

/**
 * 加密提供者类型
 */
export const CryptoProviderTypeSchema = z.enum(['hai', 'native', 'custom'])
export type CryptoProviderType = z.infer<typeof CryptoProviderTypeSchema>

/**
 * SM2 配置
 */
export const SM2ConfigSchema = z.object({
  /** 是否启用 SM2 */
  enabled: z.boolean().default(true),
  /** 密钥轮换间隔（小时） */
  keyRotationInterval: z.number().int().positive().default(24),
  /** 公钥（生产环境应使用环境变量） */
  publicKey: z.string().optional(),
  /** 私钥（生产环境应使用环境变量） */
  privateKey: z.string().optional(),
})
export type SM2Config = z.infer<typeof SM2ConfigSchema>

/**
 * SM3 配置
 */
export const SM3ConfigSchema = z.object({
  /** 是否启用 SM3 */
  enabled: z.boolean().default(true),
  /** HMAC 密钥（用于 HMAC-SM3） */
  hmacKey: z.string().optional(),
})
export type SM3Config = z.infer<typeof SM3ConfigSchema>

/**
 * SM4 配置
 */
export const SM4ConfigSchema = z.object({
  /** 是否启用 SM4 */
  enabled: z.boolean().default(true),
  /** 默认模式 */
  defaultMode: z.enum(['ecb', 'cbc', 'cfb', 'ofb', 'ctr', 'gcm']).default('gcm'),
  /** 默认密钥（生产环境应使用环境变量） */
  defaultKey: z.string().optional(),
  /** 默认 IV（CBC/CFB/OFB 模式） */
  defaultIv: z.string().optional(),
})
export type SM4Config = z.infer<typeof SM4ConfigSchema>

/**
 * Argon2 配置
 */
export const Argon2ConfigSchema = z.object({
  /** 内存成本（KB） */
  memoryCost: z.number().int().min(1024).default(65536),
  /** 时间成本 */
  timeCost: z.number().int().min(1).default(3),
  /** 并行度 */
  parallelism: z.number().int().min(1).default(4),
  /** 输出长度 */
  hashLength: z.number().int().min(16).default(32),
})
export type Argon2Config = z.infer<typeof Argon2ConfigSchema>

/**
 * AES 配置
 */
export const AESConfigSchema = z.object({
  /** 是否启用 AES */
  enabled: z.boolean().default(true),
  /** 密钥长度 */
  keyLength: z.enum(['128', '192', '256']).default('256'),
  /** 默认模式 */
  defaultMode: z.enum(['gcm', 'cbc', 'ctr']).default('gcm'),
})
export type AESConfig = z.infer<typeof AESConfigSchema>

/**
 * 加密配置
 */
export const CryptoConfigSchema = z.object({
  /** 提供者类型 */
  provider: CryptoProviderTypeSchema.default('hai'),
  /** SM2 配置 */
  sm2: SM2ConfigSchema.optional(),
  /** SM3 配置 */
  sm3: SM3ConfigSchema.optional(),
  /** SM4 配置 */
  sm4: SM4ConfigSchema.optional(),
  /** Argon2 配置 */
  argon2: Argon2ConfigSchema.optional(),
  /** AES 配置 */
  aes: AESConfigSchema.optional(),
  /** 是否优先使用国密算法 */
  preferGM: z.boolean().default(true),
})
export type CryptoConfig = z.infer<typeof CryptoConfigSchema>
