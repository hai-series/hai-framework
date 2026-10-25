/** 反馈在采集、HTTP 和离线包之间共用的字节预算；总量按未压缩字节计算。 */
import { z } from 'zod'

const MiB = 1024 * 1024

/**
 * 有效容量策略；只含公开上限，不暴露存储或通知配置。
 * @example
 * ```ts
 * import { FeedbackBudgetSchema, resolveFeedbackBudget } from '@h-ai/api-contract/feedback'
 * const budget = FeedbackBudgetSchema.parse(resolveFeedbackBudget())
 * ```
 */
export const FeedbackBudgetSchema = z.object({
  maxTotalBytes: z.number().int().min(4 * MiB).max(40 * MiB),
  maxAttachmentBytes: z.number().int().positive().max(5 * MiB),
  maxAttachmentsBytes: z.number().int().positive(),
  maxAttachmentCount: z.number().int().min(1).max(20),
  maxEvidenceBytes: z.number().int().positive().max(4 * MiB),
  maxEvidenceCount: z.number().int().min(1).max(2000),
  maxTransportBytes: z.number().int().positive().max(64 * MiB),
})

/**
 * 由服务端公开的有效预算。
 * @example
 * ```ts
 * import { type FeedbackBudget, resolveFeedbackBudget } from '@h-ai/api-contract/feedback'
 * const budget: FeedbackBudget = resolveFeedbackBudget()
 * ```
 */
export type FeedbackBudget = z.infer<typeof FeedbackBudgetSchema>

/**
 * 配置一次总容量，派生附件、双份证据和 JSON/Base64 传输上限；更小的旧单项限制仍生效。
 * @example
 * ```ts
 * import { resolveFeedbackBudget } from '@h-ai/api-contract/feedback'
 * const budget = resolveFeedbackBudget({ maxTotalBytes: 16 * 1024 * 1024 })
 * ```
 */
export function resolveFeedbackBudget(input: { maxTotalBytes?: number, maxAttachmentBytes?: number, maxEvidenceBytes?: number, maxEvidenceCount?: number } = {}): FeedbackBudget {
  const maxTotalBytes = input.maxTotalBytes ?? 32 * MiB
  const maxEvidenceBytes = Math.min(input.maxEvidenceBytes ?? 4 * MiB, Math.floor(maxTotalBytes / 8))
  // ZIP 中同时保存 timeline 和 records；另为修订字段、历史、摘要、查看器和目录预留 2 MiB。
  const maxAttachmentsBytes = maxTotalBytes - 2 * maxEvidenceBytes - 2 * MiB
  return FeedbackBudgetSchema.parse({ maxTotalBytes, maxEvidenceBytes, maxAttachmentsBytes, maxAttachmentBytes: Math.min(input.maxAttachmentBytes ?? 5 * MiB, maxAttachmentsBytes), maxAttachmentCount: 20, maxEvidenceCount: Math.min(input.maxEvidenceCount ?? 2000, 2000),
    // 包下载也经过双向加密；不是仅按单个上传附件推导。
    maxTransportBytes: 4 * Math.ceil(maxTotalBytes / 3) + 65536 })
}
