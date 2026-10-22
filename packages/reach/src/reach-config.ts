/**
 * @h-ai/reach — 配置 Schema
 *
 * 本文件定义触达模块的错误码、Zod Schema 和配置类型。
 * @module reach-config
 */

import { z } from 'zod'

import { reachM } from './reach-i18n.js'

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
  url: z.string()
    .url(reachM('reach_config_urlRequired'))
    .refine(value => ['http:', 'https:'].includes(new URL(value).protocol), {
      message: reachM('reach_config_urlRequired'),
    }),
  /** HTTP 方法（默认 POST） */
  method: z.enum(['POST', 'PUT']).default('POST'),
  /** 自定义请求头 */
  headers: z.record(z.string(), z.string()).optional(),
  /** 请求超时毫秒数（默认 10000） */
  timeout: z.number().int().min(0).default(10000),
  /** 接收端按 Idempotency-Key 原子持久去重，且覆盖所有重试与旧节点迟到请求时才启用；默认 false。 */
  idempotent: z.boolean().default(false),
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

/**
 * 人工裁定 unknown 的输入限制；不允许重新排队。
 * @example ReachUnknownResolutionSchema.parse({ status: 'discarded' })
 */
export const ReachUnknownResolutionSchema = z.object({
  status: z.enum(['sent', 'discarded']),
  messageId: z.string().max(255).optional(),
})

/**
 * 持久化入队回执格式。
 * @example ReachQueueIdSchema.safeParse(queueId)
 */
export const ReachQueueIdSchema = z.string().uuid()

/**
 * 可靠队列重试策略；入队时保存到消息，不受其它节点后续配置变化影响。
 * @example ReachQueueConfigSchema.parse({ maxAttempts: 5, retryDelayMs: 60_000, maxRetryDelayMs: 3_600_000 })
 */
export const ReachQueueConfigSchema = z.object({
  /** 自动领取次数上限（含首次及崩溃恢复，默认 5，范围 1–100）。 */
  maxAttempts: z.number().int().min(1).max(100).default(5),
  /** 首次失败后的退避毫秒数（默认 60000，范围 1000–86400000）。 */
  retryDelayMs: z.number().int().min(1000).max(86_400_000).default(60_000),
  /** 指数退避上限毫秒数，不得小于 retryDelayMs（默认 3600000）。 */
  maxRetryDelayMs: z.number().int().min(1000).max(86_400_000).default(3_600_000),
}).refine(value => value.maxRetryDelayMs >= value.retryDelayMs, {
  message: reachM('reach_queueRetryInvalid'),
})

/** 持久化重试策略。@example const policy: ReachQueueConfig = ReachQueueConfigSchema.parse({}) */
export type ReachQueueConfig = z.infer<typeof ReachQueueConfigSchema>

/** 有界查询待人工处理的队列，不返回正文或收件人。@example ReachQueueListSchema.parse({ status: 'dead' }) */
export const ReachQueueListSchema = z.object({
  status: z.enum(['dead', 'unknown']),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(1_000_000).default(0),
})

/** 死信恢复要求最近读取的版本，避免过时运维请求恢复新一轮死信。@example ReachDeadRequeueSchema.parse({ expectedUpdatedAt: Date.now() }) */
export const ReachDeadRequeueSchema = z.object({
  expectedUpdatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
})

// ─── DND（免打扰）配置 Schema ───

/**
 * 免打扰时间段配置
 *
 * 在指定的时间段内，根据策略处理消息：
 * - `discard`：直接丢弃，返回 DND_BLOCKED 错误
 * - `delay`：要求已初始化的数据库及队列表；持久写入 pending 成功后返回 deferred/queueId，DND 结束后发送
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
  /** discard 丢弃；delay 要求数据库队列就绪并确认入队（默认 discard）。 */
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
  /** 可靠队列重试策略；每条消息入队时持久保存。 */
  queue: ReachQueueConfigSchema.prefault({}),
})

/** 触达模块配置类型（parse 后） */
export type ReachConfig = z.infer<typeof ReachConfigSchema>

/**
 * 触达模块配置输入类型
 */
export type ReachConfigInput = z.input<typeof ReachConfigSchema>
