/**
 * =============================================================================
 * @h-ai/reach - 配置 Schema
 * =============================================================================
 *
 * 本文件定义触达模块的错误码、Zod Schema 和配置类型。
 *
 * 支持的 Provider 类型：
 * - `console` — 控制台输出（开发/测试用）
 * - `smtp` — SMTP 邮件发送
 * - `aliyun-sms` — 阿里云短信服务
 *
 * @module reach-config
 * =============================================================================
 */

import { z } from 'zod'

// =============================================================================
// 错误码常量
// =============================================================================

/**
 * 触达模块错误码（数值范围 8000-8099）
 *
 * @example
 * ```ts
 * import { ReachErrorCode } from '@h-ai/reach'
 *
 * if (result.error?.code === ReachErrorCode.SEND_FAILED) {
 *     // 处理发送失败
 * }
 * ```
 */
export const ReachErrorCode = {
  /** 发送失败 */
  SEND_FAILED: 8000,
  /** 模板未找到 */
  TEMPLATE_NOT_FOUND: 8001,
  /** 模板渲染失败 */
  TEMPLATE_RENDER_FAILED: 8002,
  /** 无效接收方 */
  INVALID_RECIPIENT: 8003,
  /** 触达模块未初始化 */
  NOT_INITIALIZED: 8010,
  /** 不支持的 Provider 类型 */
  UNSUPPORTED_TYPE: 8011,
  /** 配置错误 */
  CONFIG_ERROR: 8012,
} as const

/** 触达模块错误码类型 */
export type ReachErrorCodeType = (typeof ReachErrorCode)[keyof typeof ReachErrorCode]

// =============================================================================
// 配置 Schema
// =============================================================================

/**
 * Console Provider 配置（开发/测试用，将消息输出到日志）
 */
export const ConsoleConfigSchema = z.object({
  type: z.literal('console'),
})

/**
 * SMTP 邮件 Provider 配置
 *
 * @example
 * ```ts
 * {
 *   type: 'smtp',
 *   host: 'smtp.example.com',
 *   port: 465,
 *   secure: true,
 *   user: 'noreply@example.com',
 *   pass: 'password',
 *   from: 'noreply@example.com'
 * }
 * ```
 */
export const SmtpConfigSchema = z.object({
  type: z.literal('smtp'),
  /** SMTP 服务器地址 */
  host: z.string().min(1),
  /** SMTP 端口（默认 465） */
  port: z.number().int().min(1).max(65535).default(465),
  /** 是否使用 TLS（默认 true） */
  secure: z.boolean().default(true),
  /** SMTP 认证用户名 */
  user: z.string().optional(),
  /** SMTP 认证密码 */
  pass: z.string().optional(),
  /** 发件人地址 */
  from: z.string().min(1),
})

/**
 * 阿里云短信 Provider 配置
 *
 * @example
 * ```ts
 * {
 *   type: 'aliyun-sms',
 *   accessKeyId: 'LTAI...',
 *   accessKeySecret: '...',
 *   signName: '某某科技',
 *   endpoint: 'dysmsapi.aliyuncs.com'
 * }
 * ```
 */
export const AliyunSmsConfigSchema = z.object({
  type: z.literal('aliyun-sms'),
  /** 阿里云 AccessKey ID */
  accessKeyId: z.string().min(1),
  /** 阿里云 AccessKey Secret */
  accessKeySecret: z.string().min(1),
  /** 短信签名 */
  signName: z.string().min(1),
  /** API 端点（默认 dysmsapi.aliyuncs.com） */
  endpoint: z.string().default('dysmsapi.aliyuncs.com'),
})

/**
 * 触达模块配置 Schema（判别联合体）
 *
 * 根据 `type` 字段区分不同 Provider 类型的配置。
 */
export const ReachConfigSchema = z.discriminatedUnion('type', [
  ConsoleConfigSchema,
  SmtpConfigSchema,
  AliyunSmsConfigSchema,
])

/** 触达模块配置类型（parse 后） */
export type ReachConfig = z.infer<typeof ReachConfigSchema>

/** Console 配置类型 */
export type ConsoleConfig = z.infer<typeof ConsoleConfigSchema>

/** SMTP 配置类型 */
export type SmtpConfig = z.infer<typeof SmtpConfigSchema>

/** 阿里云短信配置类型 */
export type AliyunSmsConfig = z.infer<typeof AliyunSmsConfigSchema>

/**
 * 触达模块配置输入类型
 *
 * 说明：Zod 的 default 会让输入端字段可省略，但输出端字段为必填。
 */
export type ReachConfigInput = z.input<typeof ReachConfigSchema>
