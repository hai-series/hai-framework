import { z } from 'zod'

/**
 * 同一数据库内的应用标识。宿主先初始化 RelDB，再传入此配置。
 * @example
 * ```ts
 * import { FeedbackConfigSchema } from '@h-ai/feedback'
 * const config = FeedbackConfigSchema.parse({ appId: 'orders' })
 * ```
 */
export const FeedbackConfigSchema = z.strictObject({
  /** 同一数据库中区分应用的稳定标识。 */
  appId: z.string().trim().min(1).max(128).refine(value => !value.includes('\0')),
})

export type FeedbackConfig = z.infer<typeof FeedbackConfigSchema>
export type FeedbackConfigInput = z.input<typeof FeedbackConfigSchema>
