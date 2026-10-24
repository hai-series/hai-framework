import { describe, expect, it } from 'vitest'
import { apiContract, FeedbackEvidenceInputSchema, FeedbackSubmitInputSchema, FeedbackUploadInputSchema } from '../src/index.js'

describe('feedback public contract', () => {
  it('allows a minimal no-description submission and rejects client-provided authorization', () => {
    expect(FeedbackSubmitInputSchema.safeParse({ submissionId: 'operation-1', appId: 'orders' }).success).toBe(true)
    for (const identity of [{ scopeId: 'other' }, { userId: 'victim' }, { permissions: ['feedback:*'] }])
      expect(FeedbackSubmitInputSchema.safeParse({ submissionId: 'operation-1', appId: 'orders', ...identity }).success).toBe(false)
  })
  it('accepts only JSON evidence and bounds raw attachment encodings', () => {
    const event = { id: 'event-1', source: 'browser', sequence: 1, kind: 'log', timestamp: 1, data: {} }
    expect(FeedbackEvidenceInputSchema.safeParse(event).success).toBe(true)
    expect(FeedbackEvidenceInputSchema.safeParse({ ...event, data: { method() {} } }).success).toBe(false)
    expect(FeedbackUploadInputSchema.safeParse({ id: 'report-1', attachmentId: 'image-1', dataBase64: '../fake' }).success).toBe(false)
    expect(FeedbackUploadInputSchema.safeParse({ id: 'report-1', attachmentId: 'image-1', dataBase64: 'a'.repeat(7 * 1024 * 1024) }).success).toBe(false)
  })
  it('exposes submission and evidence routes without binding an application', () => {
    expect(apiContract.pathOf(apiContract.feedback.reports.submit)).toBe('/feedback/reports')
    expect(apiContract.pathOf(apiContract.feedback.reports.appendEvidence)).toBe('/feedback/reports/{id}/evidence')
  })
})
