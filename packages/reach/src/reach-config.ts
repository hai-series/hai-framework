/**
 * @h-ai/reach — 配置 Schema
 *
 * 本文件定义触达模块的错误码、Zod Schema 和配置类型。
 * @module reach-config
 */

import { z } from 'zod'

import { reachM } from './reach-i18n.js'

// ─── 错误码常量 ───

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
  /** 免打扰时段拦截（discard 策略） */
  DND_BLOCKED: 8005,
  /** 免打扰时段延时（delay 策略，消息已暂存） */
  DND_DEFERRED: 8006,
  /** 触达模块未初始化 */
  NOT_INITIALIZED: 8010,
  /** 不支持的 Provider 类型 */
  UNSUPPORTED_TYPE: 8011,
  /** 配置错误 */
  CONFIG_ERROR: 8012,
} as const

/** 触达模块错误码类型 */
export type ReachErrorCodeType = (typeof ReachErrorCode)[keyof typeof ReachErrorCode]

// ─── 单个 Provider 配置 Schema ───

/**
 * Console Provider 配置（开发/测试用，将消息输出到日志）
 */
export const ConsoleProviderConfigSchema = z.object({
  /** Provider 唯一名称 */
  name: z.string().min(1, reachM('reach_config_nameRequired')),
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
  name: z.string().min(1, reachM('reach_config_nameRequired')),
  type: z.literal('smtp'),
  /** SMTP 服务器地址 */
  host: z.string().min(1, reachM('reach_config_hostRequired')),
  /** SMTP 端口（默认 465） */
  port: z.number().int().min(1).max(65535).default(465),
  /** 是否使用 TLS（默认 true） */
  secure: z.boolean().default(true),
  /** SMTP 认证用户名 */
  user: z.string().optional(),
  /** SMTP 认证密码 */
  pass: z.string().optional(),
  /** 发件人地址 */
  from: z.string().min(1, reachM('reach_config_fromRequired')),
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
  name: z.string().min(1, reachM('reach_config_nameRequired')),
  type: z.literal('aliyun-sms'),
  /** 阿里云 AccessKey ID */
  accessKeyId: z.string().min(1, reachM('reach_config_accessKeyIdRequired')),
  /** 阿里云 AccessKey Secret */
  accessKeySecret: z.string().min(1, reachM('reach_config_accessKeySecretRequired')),
  /** 短信签名 */
  signName: z.string().min(1, reachM('reach_config_signNameRequired')),
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
  name: z.string().min(1, reachM('reach_config_nameRequired')),
  type: z.literal('api'),
  /** 回调 URL */
  url: z.string().min(1, reachM('reach_config_urlRequired')),
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

// ─── DND（免打扰）配置 Schema ───

/**
 * 免打扰时间段配置
 *
 * 在指定的时间段内，根据策略处理消息：
 * - `discard`：直接丢弃，返回 DND_BLOCKED 错误
 * - `delay`：暂存到数据库（状态为 pending），DND 结束后由定时任务集中发送
 *
 * 时间使用 HH:mm 格式（24 小时制），支持跨午夜（如 22:00-08:00）。
 *
 * @example
 * ```ts
 * {
 *   enabled: true,
 *   strategy: 'delay',
 *   start: '22:00',
 *   end: '08:00'
 * }
 * ```
 */
export const DndConfigSchema = z.object({
  /** 是否启用免打扰（默认 false） */
  enabled: z.boolean().default(false),
  /** 免打扰策略：discard 丢弃 / delay 延时发送（默认 discard） */
  strategy: z.enum(['discard', 'delay']).default('discard'),
  /** 免打扰开始时间（HH:mm 格式） */
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, reachM('reach_config_dndTimeInvalid')).default('00:00'),
  /** 免打扰结束时间（HH:mm 格式） */
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, reachM('reach_config_dndTimeInvalid')).default('00:00'),
})

/** DND 配置类型 */
export type DndConfig = z.infer<typeof DndConfigSchema>

// ─── 模板配置 Schema ───

/**
 * 模板配置 Schema（通过配置文件定义模板）
 *
 * @example
 * ```yaml
 * templates:
 *   - name: verification_code
 *     provider: email
 *     subject: "验证码: {code}"
 *     body: "您的验证码是 {code}，有效期 {minutes} 分钟。"
 * ```
 */
export const TemplateConfigSchema = z.object({
  /** 模板名称 */
  name: z.string().min(1, reachM('reach_config_templateNameRequired')),
  /** 绑定的 Provider 名称 */
  provider: z.string().min(1, reachM('reach_config_templateProviderRequired')),
  /** 邮件主题模板 */
  subject: z.string().optional(),
  /** 正文模板 */
  body: z.string().min(1, reachM('reach_config_templateBodyRequired')),
})

/** 模板配置类型 */
export type TemplateConfig = z.infer<typeof TemplateConfigSchema>

// ─── 模块配置 Schema ───

/**
 * 触达模块配置 Schema
 *
 * 接受一个 Provider 配置数组，支持同时注册多个 Provider。
 * 支持通过配置文件定义模板和免打扰时间段。
 */
export const ReachConfigSchema = z.object({
  /** Provider 配置列表 */
  providers: z.array(ProviderConfigSchema).min(1, reachM('reach_config_providersRequired')),
  /** 模板配置（通过配置文件注册） */
  templates: z.array(TemplateConfigSchema).optional(),
  /** 免打扰配置 */
  dnd: DndConfigSchema.optional(),
})

/** 触达模块配置类型（parse 后） */
export type ReachConfig = z.infer<typeof ReachConfigSchema>

/**
 * 触达模块配置输入类型
 */
export type ReachConfigInput = z.input<typeof ReachConfigSchema>
