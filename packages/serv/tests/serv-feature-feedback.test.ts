import type { FeedbackFunctions } from '@h-ai/feedback'
import { apiContract, FeedbackReportSchema } from '@h-ai/api-contract'
import { core, err, HaiCommonError, ok } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { createFeedbackProcedures } from '../src/features/serv-feature-feedback.js'
import { serv } from '../src/serv-main.js'

function fixture() {
  const report = FeedbackReportSchema.parse({ id: 'report-1', number: 'FB-1', appId: 'orders', scopeId: 'trusted-scope', userId: 'user-1', status: 'pending', collectionStatus: 'collecting', notificationStatus: 'pending', createdAt: 1, updatedAt: 1, version: 1, evidenceRevision: 1 })
  const unused = async () => err(HaiCommonError.NOT_FOUND, 'Missing')
  const submit = vi.fn<FeedbackFunctions['submit']>(async () => {
    await Promise.resolve()
    expect(core.context.get()).toMatchObject({ scopeId: 'trusted-scope', userId: 'user-1', requestId: 'request-1' })
    return ok(report)
  })
  const appendEvidence = vi.fn<FeedbackFunctions['appendEvidence']>(async input => ok({ acknowledged: input.evidence.map(item => item.id), evidenceRevision: 2 }))
  const feedback: FeedbackFunctions = { init: async () => ok(undefined), close: async () => ok(undefined), config: null, isInitialized: true, submit, list: unused, get: unused, getEvidence: unused, setStatus: unused, appendEvidence, completeCollection: unused, uploadAttachment: unused, getAttachment: unused, retry: unused, export: unused, getExport: unused, runJobs: unused }
  const resolveContext = vi.fn(() => ({ scopeId: 'trusted-scope', userId: 'user-1', permissions: ['feedback:create'] }))
  const app = serv.createApp({ contract: apiContract.feedback, procedures: createFeedbackProcedures({ feedback, resolveContext }), verifyToken: async () => ok({ userId: 'user-1', roles: [], permissions: [] }) })
  const request = (path: string, body: object, authenticated = true) => app.request(`/api/v1/feedback${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': 'request-1', ...(authenticated ? { authorization: 'Bearer test-token' } : {}) }, body: JSON.stringify(body) })
  return { request, submit, appendEvidence, resolveContext }
}

describe('feedback default procedures', () => {
  it('uses trusted scope and preserves request identity through asynchronous module calls', async () => {
    const f = fixture()
    const response = await f.request('/reports', { submissionId: 'operation-1', appId: 'orders' })
    expect((await response.json()).success).toBe(true)
    expect(f.submit).toHaveBeenCalledWith({ submissionId: 'operation-1', appId: 'orders' }, { scopeId: 'trusted-scope', userId: 'user-1', permissions: ['feedback:create'] })
  })
  it('rejects absent authentication and forged scope before calling the module', async () => {
    const f = fixture()
    expect((await (await f.request('/reports', { submissionId: 'operation-1', appId: 'orders' }, false)).json()).success).toBe(false)
    expect(f.resolveContext).not.toHaveBeenCalled()
    const forged = await f.request('/reports', { submissionId: 'operation-1', appId: 'orders', scopeId: 'victim' })
    expect(forged.status).toBe(400)
    expect(f.submit).not.toHaveBeenCalled()
  })
  it('returns durable per-evidence acknowledgements', async () => {
    const f = fixture()
    const evidence = [{ id: 'event-1', source: 'browser', sequence: 1, kind: 'log', timestamp: 1, data: {} }]
    const response = await f.request('/reports/report-1/evidence', { evidence })
    expect(await response.json()).toMatchObject({ success: true, data: { acknowledged: ['event-1'], evidenceRevision: 2 } })
  })
})
