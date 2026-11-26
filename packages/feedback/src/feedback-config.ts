import { FeedbackLimitsSchema } from '@h-ai/api-contract/feedback'
import { z } from 'zod'

/**
 * 应用标识、发送与采集容量、关系库保留期限。宿主先初始化 RelDB。
 * @example
 * ```ts
 * import { FeedbackConfigSchema } from '@h-ai/feedback'
 * const config = FeedbackConfigSchema.parse({ appId: 'orders', retention: { days: 90 } })
 * ```
 */
export const FeedbackConfigSchema = z.strictObject({
  /** 同一数据库中区分应用的稳定标识。 */
  appId: z.string().trim().min(1).max(128).refine(value => !value.includes('\0')),
  ...FeedbackLimitsSchema.shape,
  retention: z.strictObject({
    /** 最近一次活动后的保留天数，0 表示长期保留。 */
    days: z.int().min(0).max(3650).default(0).describe('从最近一次活动起算的保留天数，0 表示长期保留'),
  }).prefault({}).describe('反馈、消息和附件的保留设置'),
})

export type FeedbackConfig = z.infer<typeof FeedbackConfigSchema>
export type FeedbackConfigInput = z.input<typeof FeedbackConfigSchema>
