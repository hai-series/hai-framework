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
 * 开发/测试日志适配器配置；不证明外部投递，生产共享状态守卫拒绝console。
 *
 * @example
 * ```ts
 * import { ConsoleProviderConfigSchema } from '@h-ai/reach'
 * const config = ConsoleProviderConfigSchema.parse({ name: 'dev-log', type: 'console' })
 * ```
 */
export const ConsoleProviderConfigSchema = z.object({
  /** Provider 唯一名称 */
  name: z.string().min(1, reachM('reach_config_nameRequired')),
  type: z.literal('console'),
})

/**
 * SMTP配置，默认TLS/465；凭据来自私有环境，SMTP没有接收端持久幂等能力声明。
 *
 * @example
 * ```ts
 * import { SmtpProviderConfigSchema } from '@h-ai/reach'
 * const config = SmtpProviderConfigSchema.parse({ name: 'email', type: 'smtp', host: 'smtp.example.com', from: 'noreply@example.com', user: process.env.HAI_REACH_PROVIDERS_0_USER, pass: process.env.HAI_REACH_PROVIDERS_0_PASS })
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
 * 阿里云短信POP API配置；Secret只在服务端私有注入，发送需Provider模板编码等扩展参数。
 *
 * @example
 * ```ts
 * import { AliyunSmsProviderConfigSchema } from '@h-ai/reach'
 * const config = AliyunSmsProviderConfigSchema.parse({ name: 'sms', type: 'aliyun-sms', accessKeyId: process.env.HAI_REACH_PROVIDERS_0_ACCESSKEYID, accessKeySecret: process.env.HAI_REACH_PROVIDERS_0_ACCESSKEYSECRET, signName: process.env.HAI_REACH_PROVIDERS_0_SIGNNAME })
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
 * HTTP回调配置；idempotent默认false，只有接收端按稳定Idempotency-Key原子持久去重并覆盖旧请求迟到窗口才允许true。
 * 写入该布尔值或发送请求头本身不证明接收端具备此能力。
 *
 * @example
 * ```ts
 * import { ApiProviderConfigSchema } from '@h-ai/reach'
 * const config = ApiProviderConfigSchema.parse({ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false })
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
  /** HTTP 重定向策略；默认拒绝。敏感发送始终拒绝，即使普通发送显式允许。 */
  redirect: z.enum(['error', 'follow']).default('error'),
  /** 强制 HTTPS；省略时生产敏感发送要求 HTTPS，显式 false 仅用于受信内网传输。 */
  requireHttps: z.boolean().optional(),
  /** 接收端按 Idempotency-Key 原子持久去重，且覆盖所有重试与旧节点迟到请求时才启用；默认 false。 */
  idempotent: z.boolean().default(false),
})

/**
 * 按type区分内置Provider配置，不把name当协议类型；name用于模板/消息路由。
 *
 * @example
 * ```ts
 * import { ProviderConfigSchema } from '@h-ai/reach'
 * const config = ProviderConfigSchema.parse({ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false })
 * ```
 */
export const ProviderConfigSchema = z.discriminatedUnion('type', [
  ConsoleProviderConfigSchema,
  SmtpProviderConfigSchema,
  AliyunSmsProviderConfigSchema,
  ApiProviderConfigSchema,
])

/**
 * 由ProviderConfigSchema解析后的配置类型，默认值已经填充；与输入类型区分，秘密字段不写日志。
 *
 * @example
 * ```ts
 * import { ProviderConfigSchema, type ProviderConfig } from '@h-ai/reach'
 * const config: ProviderConfig = ProviderConfigSchema.parse({ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false })
 * ```
 */
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>

/**
 * 由ConsoleProviderConfigSchema解析后的配置类型，默认值已经填充；与输入类型区分，秘密字段不写日志。
 *
 * @example
 * ```ts
 * import { ConsoleProviderConfigSchema, type ConsoleProviderConfig } from '@h-ai/reach'
 * const config: ConsoleProviderConfig = ConsoleProviderConfigSchema.parse({ name: 'dev-log', type: 'console' })
 * ```
 */
export type ConsoleProviderConfig = z.infer<typeof ConsoleProviderConfigSchema>

/**
 * 由SmtpProviderConfigSchema解析后的配置类型，默认值已经填充；与输入类型区分，秘密字段不写日志。
 *
 * @example
 * ```ts
 * import { SmtpProviderConfigSchema, type SmtpProviderConfig } from '@h-ai/reach'
 * const config: SmtpProviderConfig = SmtpProviderConfigSchema.parse({ name: 'email', type: 'smtp', host: 'smtp.example.com', from: 'noreply@example.com', user: process.env.HAI_REACH_PROVIDERS_0_USER, pass: process.env.HAI_REACH_PROVIDERS_0_PASS })
 * ```
 */
export type SmtpProviderConfig = z.infer<typeof SmtpProviderConfigSchema>

/**
 * 由AliyunSmsProviderConfigSchema解析后的配置类型，默认值已经填充；与输入类型区分，秘密字段不写日志。
 *
 * @example
 * ```ts
 * import { AliyunSmsProviderConfigSchema, type AliyunSmsProviderConfig } from '@h-ai/reach'
 * const config: AliyunSmsProviderConfig = AliyunSmsProviderConfigSchema.parse({ name: 'sms', type: 'aliyun-sms', accessKeyId: process.env.HAI_REACH_PROVIDERS_0_ACCESSKEYID, accessKeySecret: process.env.HAI_REACH_PROVIDERS_0_ACCESSKEYSECRET, signName: process.env.HAI_REACH_PROVIDERS_0_SIGNNAME })
 * ```
 */
export type AliyunSmsProviderConfig = z.infer<typeof AliyunSmsProviderConfigSchema>

/**
 * 由ApiProviderConfigSchema解析后的配置类型，默认值已经填充；与输入类型区分，秘密字段不写日志。
 *
 * @example
 * ```ts
 * import { ApiProviderConfigSchema, type ApiProviderConfig } from '@h-ai/reach'
 * const config: ApiProviderConfig = ApiProviderConfigSchema.parse({ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false })
 * ```
 */
export type ApiProviderConfig = z.infer<typeof ApiProviderConfigSchema>

/**
 * 人工处置unknown的结构边界，仅sent/discarded，不提供重发；应用须先校验运维权限并隔离旧worker/核对外部效果。
 *
 * @example
 * ```ts
 * import { ReachUnknownResolutionSchema } from '@h-ai/reach'
 * const config = ReachUnknownResolutionSchema.parse({ status: 'discarded' })
 * ```
 */
export const ReachUnknownResolutionSchema = z.object({
  status: z.enum(['sent', 'discarded']),
  messageId: z.string().max(255).optional(),
})

/**
 * 持久入队回执UUID格式；合法UUID不代表存在，也不授予队列运维权限。
 *
 * @example
 * ```ts
 * import { ReachQueueIdSchema } from '@h-ai/reach'
 * const config = ReachQueueIdSchema.parse('00000000-0000-4000-8000-000000000001')
 * ```
 */
export const ReachQueueIdSchema = z.string().uuid()

/**
 * 可靠队列重试策略，入队时随消息持久保存；maxAttempts含首次与崩溃恢复，指数退避有上限。
 *
 * @example
 * ```ts
 * import { ReachQueueConfigSchema } from '@h-ai/reach'
 * const config = ReachQueueConfigSchema.parse({ maxAttempts: 5, retryDelayMs: 60000, maxRetryDelayMs: 3600000 })
 * ```
 */
export const ReachQueueConfigSchema = z.object({
  /** 每条队列消息最多处理多少次，包含首次发送、失败重试和异常退出后的重新处理；默认 5，范围 1–100。 */
  maxAttempts: z.number().int().min(1).max(100).default(5),
  /** 第一次发送失败后，等待多少毫秒再试；默认 60000（1 分钟），范围 1000–86400000。 */
  retryDelayMs: z.number().int().min(1000).max(86_400_000).default(60_000),
  /** 后续失败时等待时间逐次加倍，但不超过此值；默认 3600000（1 小时），不得小于 retryDelayMs。 */
  maxRetryDelayMs: z.number().int().min(1000).max(86_400_000).default(3_600_000),
}).refine(value => value.maxRetryDelayMs >= value.retryDelayMs, {
  message: reachM('reach_queueRetryInvalid'),
})

/**
 * 由ReachQueueConfigSchema解析后的配置类型，默认值已经填充；与输入类型区分，秘密字段不写日志。
 *
 * @example
 * ```ts
 * import { ReachQueueConfigSchema, type ReachQueueConfig } from '@h-ai/reach'
 * const config: ReachQueueConfig = ReachQueueConfigSchema.parse({ maxAttempts: 5, retryDelayMs: 60000, maxRetryDelayMs: 3600000 })
 * ```
 */
export type ReachQueueConfig = z.infer<typeof ReachQueueConfigSchema>

/**
 * 仅分页列出dead/unknown元数据，限制limit/offset；不返回正文/收件人，不替代服务端运维授权。
 *
 * @example
 * ```ts
 * import { ReachQueueListSchema } from '@h-ai/reach'
 * const config = ReachQueueListSchema.parse({ status: 'dead', limit: 10, offset: 0 })
 * ```
 */
export const ReachQueueListSchema = z.object({
  status: z.enum(['dead', 'unknown']),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(1_000_000).default(0),
})

/**
 * 恢复dead所需的最近updatedAt条件输入，阻止过时/并发恢复；unknown禁止此操作。
 *
 * @example
 * ```ts
 * import { ReachDeadRequeueSchema } from '@h-ai/reach'
 * const config = ReachDeadRequeueSchema.parse({ expectedUpdatedAt: 1730000000000 })
 * ```
 */
export const ReachDeadRequeueSchema = z.object({
  expectedUpdatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
})

// ─── DND（免打扰）配置 Schema ───

/**
 * 本机时区的HH:mm免打扰配置，支持跨午夜；start=end表示不拦截。
 * discard返回DND_BLOCKED；delay要求数据库队列就绪且pending写入成功才返回deferred回执。
 *
 * @example
 * ```ts
 * import { DndConfigSchema } from '@h-ai/reach'
 * const config = DndConfigSchema.parse({ enabled: true, strategy: 'delay', start: '22:00', end: '08:00' })
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

/**
 * 由DndConfigSchema解析后的配置类型，默认值已经填充；与输入类型区分，秘密字段不写日志。
 *
 * @example
 * ```ts
 * import { DndConfigSchema, type DndConfig } from '@h-ai/reach'
 * const config: DndConfig = DndConfigSchema.parse({ enabled: true, strategy: 'delay', start: '22:00', end: '08:00' })
 * ```
 */
export type DndConfig = z.infer<typeof DndConfigSchema>

// ─── 模板配置 Schema ───

/**
 * 绑定Provider名称的持久模板配置，{key}仅做文本替换；需要先初始化数据库，不提供HTML消毒。
 *
 * @example
 * ```ts
 * import { TemplateConfigSchema } from '@h-ai/reach'
 * const config = TemplateConfigSchema.parse({ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' })
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

/**
 * 由TemplateConfigSchema解析后的配置类型，默认值已经填充；与输入类型区分，秘密字段不写日志。
 *
 * @example
 * ```ts
 * import { TemplateConfigSchema, type TemplateConfig } from '@h-ai/reach'
 * const config: TemplateConfig = TemplateConfigSchema.parse({ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' })
 * ```
 */
export type TemplateConfig = z.infer<typeof TemplateConfigSchema>

// ─── 模块配置 Schema ───

/**
 * 模块配置Schema，解析Provider/模板/DND及持久重试默认值；Schema校验不证明外部服务可用或接收端幂等。
 *
 * @example
 * ```ts
 * import { ReachConfigSchema } from '@h-ai/reach'
 * const config = ReachConfigSchema.parse({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
 * ```
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

/**
 * 由ReachConfigSchema解析后的配置类型，默认值已经填充；与输入类型区分，秘密字段不写日志。
 *
 * @example
 * ```ts
 * import { ReachConfigSchema, type ReachConfig } from '@h-ai/reach'
 * const config: ReachConfig = ReachConfigSchema.parse({ providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } })
 * ```
 */
export type ReachConfig = z.infer<typeof ReachConfigSchema>

/**
 * reach.init接收的配置输入，queue默认值可省略；生产选真实Provider、共享数据库，不能用console假定通知完成。
 *
 * @example
 * ```ts
 * import { ReachConfigSchema, type ReachConfigInput } from '@h-ai/reach'
 * const input: ReachConfigInput = { providers: [{ name: 'webhook', type: 'api', url: 'https://notify.example.com/events', idempotent: false }], templates: [{ name: 'welcome', provider: 'webhook', subject: 'Welcome {userName}', body: 'Hello {userName}' }], dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } }
 * const parsed = ReachConfigSchema.parse(input)
 * ```
 */
export type ReachConfigInput = z.input<typeof ReachConfigSchema>
