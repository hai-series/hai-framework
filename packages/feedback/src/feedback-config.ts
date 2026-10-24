import { z } from 'zod'

/**
 * Feedback 服务端配置，不包含依赖模块凭据；连接由宿主初始化。
 * @example
 * ```ts
 * import { FeedbackConfigSchema } from '@h-ai/feedback'
 * const config = FeedbackConfigSchema.parse({ appId: 'orders', recipients: ['admin@example.test'], adminUrl: 'https://app.example.test/admin/feedback' })
 * void config.retentionDays
 * ```
 */
export const FeedbackConfigSchema = z.strictObject({
  /** 反馈所属应用标识；应与浏览器及 API 入口配置一致。 */
  appId: z.string().min(1).max(128),
  /** 当前应用版本，作为默认诊断信息保存。 */
  appVersion: z.string().max(128).optional(),
  /** 构建标识，帮助定位发布产物。 */
  buildId: z.string().max(128).optional(),
  /** 源码提交标识，帮助定位对应代码。 */
  commit: z.string().max(128).optional(),
  /** 接收待处理反馈通知的管理员邮件地址。 */
  recipients: z.array(z.email()).min(1).max(20),
  /** 已初始化 Reach 邮件 Provider 的唯一名称。 */
  notificationProvider: z.string().min(1).default('email'),
  /** 管理员通知中的反馈管理页面地址。 */
  adminUrl: z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol)),
  /** 补充材料收集超时，单位毫秒；超时后冻结为完整或部分材料。 */
  collectionTimeoutMs: z.number().int().min(0).max(300000).default(60000),
  /** 持久任务扫描间隔，单位毫秒；零值由宿主手动运行任务。 */
  workerIntervalMs: z.number().int().min(0).max(60000).default(1000),
  /** 持久任务执行租约时长，单位毫秒；过期后允许其他实例接管。 */
  leaseMs: z.number().int().min(1000).max(300000).default(30000),
  /** 汇集、通知和导出任务最大尝试次数；到期清理持续重试。 */
  maxAttempts: z.number().int().min(1).max(20).default(5),
  /** 已受理反馈及对象附件的保留天数。 */
  retentionDays: z.number().int().min(1).max(3650).default(30),
  /** 允许采集的服务端环境变量名；凭据类名称仍按敏感信息策略排除。 */
  envAllowlist: z.array(z.string().min(1).max(128)).max(100).default([]),
  /** 单个附件允许的最大字节数。 */
  maxAttachmentBytes: z.number().int().min(1).max(5 * 1024 * 1024).default(5 * 1024 * 1024),
  /** 单份反馈累计证据允许的最大字节数。 */
  maxEvidenceBytes: z.number().int().min(1024).max(32 * 1024 * 1024).default(4 * 1024 * 1024),
  /** 单份反馈累计证据允许的最大条数。 */
  maxEvidenceCount: z.number().int().min(1).max(10000).default(2000),
})

/**
 * 已校验服务端配置，默认项均已补齐。
 * @example
 * ```ts
 * import type { FeedbackConfig } from '@h-ai/feedback'
 * function describeRetention(config: FeedbackConfig) { return `${config.appId}: ${config.retentionDays} days` }
 * void describeRetention
 * ```
 */
export type FeedbackConfig = z.infer<typeof FeedbackConfigSchema>
/**
 * 服务端输入配置，默认项可省略。
 * @example
 * ```ts
 * import type { FeedbackConfigInput } from '@h-ai/feedback'
 * const config: FeedbackConfigInput = { appId: 'orders', recipients: ['admin@example.test'], adminUrl: 'https://app.example.test/admin/feedback' }
 * void config
 * ```
 */
export type FeedbackConfigInput = z.input<typeof FeedbackConfigSchema>
