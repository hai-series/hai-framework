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
  /** disabled 不通知，console 输出安全摘要，reach 使用已有通知通道。 */
  notificationMode: z.enum(['disabled', 'console', 'reach']).default('reach'),
  /** Reach 接收方，由实际 Provider 校验邮箱、手机号或业务目的地。 */
  recipients: z.array(z.string().min(1).max(320)).max(20).default([]),
  /** 已初始化 Reach Provider 的唯一名称，不限制为邮件。 */
  notificationProvider: z.string().min(1).default('email'),
  /** 管理员通知中的反馈管理页面地址。 */
  adminUrl: z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol)).optional(),
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
  /** 未压缩导出总预算；客户端、附件总量和传输预算由此派生。 */
  maxTotalBytes: z.number().int().min(4 * 1024 * 1024).max(40 * 1024 * 1024).default(32 * 1024 * 1024),
  /** 单个附件允许的最大字节数；同时受总预算约束。 */
  maxAttachmentBytes: z.number().int().min(1).max(5 * 1024 * 1024).default(5 * 1024 * 1024),
  /** 单份反馈累计证据允许的最大字节数。 */
  maxEvidenceBytes: z.number().int().min(1024).max(4 * 1024 * 1024).default(4 * 1024 * 1024),
  /** 单份反馈累计证据允许的最大条数。 */
  maxEvidenceCount: z.number().int().min(1).max(10000).default(2000),
}).superRefine((config, context) => {
  if (config.notificationMode === 'reach' && !config.recipients.length)
    context.addIssue({ code: 'custom', path: ['recipients'], message: 'Reach recipients are required' })
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
