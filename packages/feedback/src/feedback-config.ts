import { z } from 'zod'

/**
 * Feedback 服务端配置；数据库、存储和通知连接由宿主初始化。
 * @example
 * ```ts
 * import { FeedbackConfigSchema } from '@h-ai/feedback'
 * const config = FeedbackConfigSchema.parse({ appId: 'orders', notification: { mode: 'console' } })
 * void config.retention.days
 * ```
 */
export const FeedbackConfigSchema = z.strictObject({
  /** 反馈所属应用标识；应与浏览器及 API 入口配置一致。 */
  appId: z.string().min(1).max(128),
  /** 服务端构建信息；生成应用注入实际产物的版本、构建标识和提交。 */
  build: z.strictObject({
    /** 当前应用版本，作为默认诊断信息保存。 */
    appVersion: z.string().max(128).optional(),
    /** 构建标识，帮助定位发布产物。 */
    buildId: z.string().max(128).optional(),
    /** 源码提交标识，帮助定位对应代码。 */
    commit: z.string().max(128).optional(),
  }).prefault({}),
  /** 受理通知；Webhook 独立配置。 */
  notification: z.strictObject({
    /** disabled 不通知，console 默认仅输出元数据，reach 使用已有通知通道。 */
    mode: z.enum(['disabled', 'console', 'reach']).default('reach'),
    /** console 通知内容；metadata 只输出定位和采集状态，summary 显式加入通用脱敏摘要。 */
    consoleContent: z.enum(['metadata', 'summary']).default('metadata'),
    /** Reach 接收方，由实际 Provider 校验邮箱、手机号或业务目的地。 */
    recipients: z.array(z.string().min(1).max(320)).max(20).default([]),
    /** 已初始化 Reach Provider 的唯一名称，不限制为邮件。 */
    provider: z.string().min(1).default('email'),
    /** 管理员通知中的反馈管理页面地址。 */
    adminUrl: z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol)).optional(),
  }).prefault({}),
  /** 独立的反馈受理回调，默认禁用。 */
  webhook: z.strictObject({
    /** 反馈采集结束后的 Webhook 地址；空字符串禁用，只允许可信 HTTP(S) 地址且不跟随重定向。 */
    url: z.string().max(2048).refine((value) => {
      if (!value)
        return true
      if (!URL.canParse(value))
        return false
      const url = new URL(value)
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash
    }).default(''),
    /** Webhook HMAC-SHA256 签名密钥；空字符串不签名，仅服务端私有环境配置。 */
    secret: z.string().max(4096).default(''),
    /** 单次 Webhook 请求超时，单位毫秒；非 2xx 或超时均进入持久重试。 */
    timeoutMs: z.number().int().min(1).max(60000).default(10000),
  }).prefault({}),
  /** 现场收集期限与服务端环境白名单。 */
  collection: z.strictObject({
    /** 补充材料收集超时，单位毫秒；超时后冻结为完整或部分材料。 */
    timeoutMs: z.number().int().min(0).max(300000).default(60000),
    /** 业务 collectEvidence 异步回调的等待上限，单位毫秒；超时后重试采集任务。 */
    businessTimeoutMs: z.number().int().min(1).max(300000).default(30000),
    /** 允许采集的服务端环境变量名；凭据类名称仍按敏感信息策略排除。 */
    envAllowlist: z.array(z.string().min(1).max(128)).max(100).default([]),
  }).prefault({}),
  /** 反馈报告及导出包的保留时间。 */
  retention: z.strictObject({
    /** 已受理反馈及对象附件的保留天数。 */
    days: z.number().int().min(1).max(3650).default(30),
    /** 已完成导出的有效小时数；过期禁止下载，后台删除对象，默认 24 小时。 */
    exportHours: z.number().int().min(1).max(720).default(24),
  }).prefault({}),
  /** 报告额度、存储预留和材料容量。 */
  limits: z.strictObject({
    /** 单个用户按数据库 UTC 日累计受理上限；幂等重试不重复计数。 */
    maxReportsPerUserDay: z.number().int().min(1).max(10000).default(20),
    /** 单个用户每日预留存储字节（报告与最多历史导出）；默认 2 GiB。 */
    maxBytesPerUserDay: z.number().int().min(4 * 1024 * 1024).max(1024 ** 4).default(2 * 1024 ** 3),
    /** 应用内单个 scope 的持久材料预留容量；到期清理成功后释放，默认 10 GiB。 */
    maxStoredBytesPerScope: z.number().int().min(4 * 1024 * 1024).max(1024 ** 4).default(10 * 1024 ** 3),
    /** 单份报告最多历史导出数；已有有效快照复用，不重复计数。 */
    maxExportsPerReport: z.number().int().min(1).max(20).default(5),
    /** 未压缩导出总预算；客户端、附件总量和传输预算由此派生。 */
    maxTotalBytes: z.number().int().min(4 * 1024 * 1024).max(40 * 1024 * 1024).default(32 * 1024 * 1024),
    /** 单个附件允许的最大字节数；同时受总预算约束。 */
    maxAttachmentBytes: z.number().int().min(1).max(5 * 1024 * 1024).default(5 * 1024 * 1024),
    /** 单份反馈累计证据允许的最大字节数。 */
    maxEvidenceBytes: z.number().int().min(1024).max(4 * 1024 * 1024).default(4 * 1024 * 1024),
    /** 单份反馈累计证据允许的最大条数，有效上限为 2000。 */
    maxEvidenceCount: z.number().int().min(1).max(10000).default(2000),
  }).prefault({}),
  /** 持久任务扫描、租约和重试。 */
  worker: z.strictObject({
    /** 持久任务扫描间隔，单位毫秒；零值由宿主手动运行任务。 */
    intervalMs: z.number().int().min(0).max(60000).default(1000),
    /** 持久任务执行租约时长，单位毫秒；过期后允许其他实例接管。 */
    leaseMs: z.number().int().min(1000).max(300000).default(30000),
    /** 汇集、通知、Webhook 和导出任务最大尝试次数；到期清理持续重试。 */
    maxAttempts: z.number().int().min(1).max(20).default(5),
  }).prefault({}),
}).superRefine((config, context) => {
  if (config.notification.mode === 'reach' && !config.notification.recipients.length) {
    context.addIssue({
      code: 'custom',
      path: ['notification', 'recipients'],
      message: 'Reach recipients are required',
    })
  }
})

/**
 * 已校验服务端配置，默认项均已补齐。
 * @example
 * ```ts
 * import type { FeedbackConfig } from '@h-ai/feedback'
 * function describeRetention(config: FeedbackConfig) { return `${config.appId}: ${config.retention.days} days` }
 * void describeRetention
 * ```
 */
export type FeedbackConfig = z.infer<typeof FeedbackConfigSchema>

/**
 * 服务端输入配置，默认项可省略；缺省 Reach 通知仍需接收方。
 * @example
 * ```ts
 * import type { FeedbackConfigInput } from '@h-ai/feedback'
 * const config: FeedbackConfigInput = { appId: 'orders', notification: { recipients: ['admin@example.test'] } }
 * void config
 * ```
 */
export type FeedbackConfigInput = z.input<typeof FeedbackConfigSchema>
