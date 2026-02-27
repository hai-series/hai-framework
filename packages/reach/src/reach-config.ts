/**
 * =============================================================================
 * @h-ai/reach - 配置 Schema
 * =============================================================================
 *
 * 本文件定义触达模块的错误码、Zod Schema 和配置类型。
 *
 * 支持同时注册多个 Provider，每个 Provider 有唯一名称（name），
 * 发送时通过 `provider` 字段选择目标 Provider。
 *
 * 支持的 Provider 类型：
 * - `console` — 控制台输出（开发/测试用）
 * - `smtp` — SMTP 邮件发送
 * - `aliyun-sms` — 阿里云短信服务（直接调用 HTTP API，无需 SDK）
 * - `api` — HTTP API 回调（通用 webhook）
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
  /** Provider 未找到 */
  PROVIDER_NOT_FOUND: 8004,
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
// 单个 Provider 配置 Schema
// =============================================================================

/**
 * Console Provider 配置（开发/测试用，将消息输出到日志）
 */
export const ConsoleProviderConfigSchema = z.object({
  /** Provider 唯一名称 */
  name: z.string().min(1),
  type: z.literal('console'),
})

/**
 * SMTP 邮件 Provider 配置
 *
 * @example
 * ```ts
 * {
 *   name: 'email',
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
export const SmtpProviderConfigSchema = z.object({
  /** Provider 唯一名称 */
  name: z.string().min(1),
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
 * 阿里云短信 Provider 配置（通过 HTTP API 调用，无需 SDK）
 *
 * @example
 * ```ts
 * {
 *   name: 'sms',
 *   type: 'aliyun-sms',
 *   accessKeyId: 'LTAI...',
 *   accessKeySecret: '...',
 *   signName: '某某科技',
 *   endpoint: 'dysmsapi.aliyuncs.com'
 * }
 * ```
 */
export const AliyunSmsProviderConfigSchema = z.object({
  /** Provider 唯一名称 */
  name: z.string().min(1),
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
 * API 回调 Provider 配置（通用 HTTP 回调）
 *
 * @example
 * ```ts
 * {
 *   name: 'webhook',
 *   type: 'api',
 *   url: 'https://api.example.com/notify',
 *   method: 'POST',
 *   headers: { 'Authorization': 'Bearer xxx' }
 * }
 * ```
 */
export const ApiProviderConfigSchema = z.object({
  /** Provider 唯一名称 */
  name: z.string().min(1),
  type: z.literal('api'),
  /** 回调 URL */
  url: z.string().min(1),
  /** HTTP 方法（默认 POST） */
  method: z.enum(['POST', 'PUT']).default('POST'),
  /** 自定义请求头 */
  headers: z.record(z.string(), z.string()).optional(),
  /** 请求超时毫秒数（默认 10000） */
  timeout: z.number().int().min(0).default(10000),
})

/**
 * 单个 Provider 配置 Schema（判别联合体）
 */
export const ProviderConfigSchema = z.discriminatedUnion('type', [
  ConsoleProviderConfigSchema,
  SmtpProviderConfigSchema,
  AliyunSmsProviderConfigSchema,
  ApiProviderConfigSchema,
])

/** 单个 Provider 配置类型（parse 后） */
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>

/** Console 配置类型 */
export type ConsoleProviderConfig = z.infer<typeof ConsoleProviderConfigSchema>

/** SMTP 配置类型 */
export type SmtpProviderConfig = z.infer<typeof SmtpProviderConfigSchema>

/** 阿里云短信配置类型 */
export type AliyunSmsProviderConfig = z.infer<typeof AliyunSmsProviderConfigSchema>

/** API 回调配置类型 */
export type ApiProviderConfig = z.infer<typeof ApiProviderConfigSchema>

// =============================================================================
// 模块配置 Schema
// =============================================================================

/**
 * 触达模块配置 Schema
 *
 * 接受一个 Provider 配置数组，支持同时注册多个 Provider。
 */
export const ReachConfigSchema = z.object({
  /** Provider 配置列表 */
  providers: z.array(ProviderConfigSchema).min(1),
})

/** 触达模块配置类型（parse 后） */
export type ReachConfig = z.infer<typeof ReachConfigSchema>

/**
 * 触达模块配置输入类型
 */
export type ReachConfigInput = z.input<typeof ReachConfigSchema>
