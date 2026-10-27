import type { FeedbackDetail } from '@h-ai/api-contract/feedback'
import type { FeedbackReviewActions } from '../src/client/index.js'
import { err, ok } from '@h-ai/core'
import { expect, it, vi } from 'vitest'
import { createFeedbackReview } from '../src/client/index.js'

function setup() {
  const detail: FeedbackDetail = { report: { id: 'review-report', number: 'FB-1', appId: 'app', scopeId: 'scope', userId: 'user', status: 'pending', collectionStatus: 'partial', notificationStatus: 'failed', createdAt: 1, updatedAt: 1, version: 1, evidenceRevision: 1 }, attachments: [], history: [], jobs: [] }
  const actions: FeedbackReviewActions = {
    get: vi.fn(async () => ok(detail)),
    getEvidence: async () => ok({ items: [], total: 0, page: 1, pageSize: 20 }),
    export: async () => err({ code: 'unused', message: 'Unused' }),
    getExport: async () => err({ code: 'unused', message: 'Unused' }),
    retry: vi.fn(async () => ok(undefined)),
  }
  return { detail, actions, review: createFeedbackReview(actions) }
}

it('重试材料与失败通道去重，不要求宿主编排任务类型', async () => {
  const { detail, actions, review } = setup()
  detail.jobs = ['collect', 'notify', 'webhook', 'webhook'].map((type, index) => ({ id: `job-${index}`, feedbackId: detail.report.id, type: type as 'collect' | 'notify' | 'webhook', status: 'failed', attempts: 1, createdAt: 1, updatedAt: 1 }))
  expect(await review.retryReport(detail.report.id)).toEqual(ok(undefined))
  expect(vi.mocked(actions.retry).mock.calls.map(([input]) => input.target)).toEqual(['collect', 'notify', 'webhook'])
  review.close()
})

it('完整且无失败任务时不发送重试，单项失败原样传播', async () => {
  const { detail, actions, review } = setup()
  detail.report.collectionStatus = 'complete'
  expect((await review.retryReport(detail.report.id)).success).toBe(true)
  expect(actions.retry).not.toHaveBeenCalled()
  detail.jobs = [{ id: 'webhook', feedbackId: detail.report.id, type: 'webhook', status: 'failed', attempts: 1, createdAt: 1, updatedAt: 1 }]
  vi.mocked(actions.retry).mockResolvedValueOnce(err({ code: 'review:denied', message: 'Denied' }))
  expect(await review.retryReport(detail.report.id)).toMatchObject({ success: false, error: { code: 'review:denied' } })
  review.close()
})

it('退出身份后迟到的详情不能为新身份发出重试', async () => {
  const { detail, actions, review } = setup()
  const gate = Promise.withResolvers<ReturnType<typeof ok<FeedbackDetail>>>()
  vi.mocked(actions.get).mockReturnValueOnce(gate.promise)
  const pending = review.retryReport(detail.report.id)
  review.close()
  gate.resolve(ok(detail))
  expect((await pending).success).toBe(false)
  expect(actions.retry).not.toHaveBeenCalled()
})
