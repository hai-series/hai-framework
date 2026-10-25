import { describe, expect, it } from 'vitest'
import { FeedbackSubmitInputSchema, resolveFeedbackBudget } from '../src/feedback/index.js'

describe('反馈容量与构建身份统一边界', () => {
  it.each([4, 16, 32, 40])('%s MiB 总量覆盖双份证据、附件、元数据和 Base64 导出传输', (size) => {
    const budget = resolveFeedbackBudget({ maxTotalBytes: size * 1048576 })
    expect(budget.maxAttachmentsBytes + 2 * budget.maxEvidenceBytes + 2 * 1048576).toBe(budget.maxTotalBytes)
    expect(budget.maxAttachmentBytes).toBeLessThanOrEqual(budget.maxAttachmentsBytes)
    expect(budget.maxTransportBytes).toBeGreaterThan(4 * Math.ceil(budget.maxTotalBytes / 3))
    expect(budget.maxTransportBytes).toBeLessThanOrEqual(64 * 1048576)
  })
  it('128 字符构建身份可提交，129 字符被同一公共契约拒绝', () => {
    expect(FeedbackSubmitInputSchema.safeParse({ appId: 'orders', submissionId: 'one', buildId: 'a'.repeat(128) }).success).toBe(true)
    expect(FeedbackSubmitInputSchema.safeParse({ appId: 'orders', submissionId: 'one', buildId: 'a'.repeat(129) }).success).toBe(false)
    expect(() => resolveFeedbackBudget({ maxTotalBytes: 41 * 1048576 })).toThrow()
  })
})
