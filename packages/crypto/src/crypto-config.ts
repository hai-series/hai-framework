import { z } from 'zod'

// ─── 错误码 ───

/**
 * 加密模块错误码常量表
 *
 * 按功能分段编号：
 * - 2000–2009：通用错误
 * - 2010–2019：初始化与配置
 * - 2020–2029：SM2（非对称加密/签名）
 * - 2040–2049：SM3（哈希/HMAC）
 * - 2060–2069：SM4（对称加密）
 *
 * @example
 * ```ts
 * import { CryptoErrorCode } from '@h-ai/crypto'
 *
 * if (!result.success && result.error.code === CryptoErrorCode.INVALID_KEY) {
 *   // 处理无效密钥
 * }
 * ```
 */
export const CryptoErrorCode = {
  /** 操作失败 */
  OPERATION_FAILED: 2000,
  /** 无效输入 */
  INVALID_INPUT: 2001,
  /** 无效密钥 */
  INVALID_KEY: 2002,

  /** 未初始化 */
  NOT_INITIALIZED: 2010,
  /** 配置错误 */
  CONFIG_ERROR: 2011,
  /** 不支持的算法 */
  UNSUPPORTED_ALGORITHM: 2012,

  /** 密钥生成失败 */
  KEY_GENERATION_FAILED: 2020,
  /** 加密失败 */
  ENCRYPTION_FAILED: 2021,
  /** 解密失败 */
  DECRYPTION_FAILED: 2022,
  /** 签名失败 */
  SIGN_FAILED: 2023,
  /** 验签失败 */
  VERIFY_FAILED: 2024,

  /** 哈希计算失败 */
  HASH_FAILED: 2040,
  /** HMAC 计算失败 */
  HMAC_FAILED: 2041,

  /** 无效 IV */
  INVALID_IV: 2060,
} as const

/** 错误码类型（CryptoErrorCode 值的联合类型） */
export type CryptoErrorCodeType = (typeof CryptoErrorCode)[keyof typeof CryptoErrorCode]

// ─── 配置 Schema ───

/**
 * 加密模块配置的 Zod Schema
 *
 * 用于 `crypto.init()` 的参数校验，所有字段均有默认值。
 *
 * @example
 * ```ts
 * import { CryptoConfigSchema } from '@h-ai/crypto'
 *
 * const config = CryptoConfigSchema.parse({}) // { defaultAlgorithm: 'sm' }
 * ```
 */
export const CryptoConfigSchema = z.object({
  /** 默认算法 */
  defaultAlgorithm: z.enum(['sm']).default('sm'),
})

/** 加密模块配置（Schema 解析后的完整类型，所有字段已填充默认值） */
export type CryptoConfig = z.infer<typeof CryptoConfigSchema>

/** 加密模块配置输入（允许省略有默认值的字段） */
export type CryptoConfigInput = z.input<typeof CryptoConfigSchema>
