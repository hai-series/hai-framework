import type { FeedbackFunctions } from '@h-ai/feedback'
import type { RequestEvent } from '@sveltejs/kit'
import { resolveFeedbackBudget } from '@h-ai/api-contract'
import { err, HaiCommonError, ok } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { kit } from '../src/index.js'

function fixture() {
  const unused = async () => err(HaiCommonError.NOT_FOUND, 'Missing')
  const appendEvidence = vi.fn<FeedbackFunctions['appendEvidence']>(async input => ok({ acknowledged: input.evidence.map(item => item.id), evidenceRevision: 2 }))
  const feedback: FeedbackFunctions = { init: async () => ok(undefined), close: async () => ok(undefined), config: null, budget: resolveFeedbackBudget(), isInitialized: true, submit: unused, list: unused, get: unused, getEvidence: unused, setStatus: unused, appendEvidence, completeCollection: unused, uploadAttachment: unused, getAttachment: unused, retry: unused, export: unused, getExport: unused, runJobs: unused }
  const actor = { scopeId: 'trusted-scope', userId: 'user-1', permissions: ['feedback:create'] }
  const resolveContext = vi.fn(() => actor)
  const handler = kit.createFeedbackHandler({ feedback, resolveContext })
  const request = (path: string, body: unknown) => {
    const url = new URL(`https://app.test/api/feedback${path}`)
    return handler({ request: new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), url, locals: {} } as RequestEvent)
  }
  return { request, appendEvidence, feedback, actor }
}

describe('kit feedback catch-all', () => {
  it('可选反馈未就绪时端点明确503，不把默认策略当作就绪', async () => {
    const f = fixture()
    Object.defineProperty(f.feedback, 'isInitialized', { value: false })
    const response = await f.request('/reports', { appId: 'app', submissionId: 'unavailable' })
    expect(response.status).toBe(503)
  })

  it('forwards parsed evidence and trusted actor and returns durable acknowledgement', async () => {
    const f = fixture()
    const evidence = [{ id: 'event-1', source: 'browser', sequence: 1, kind: 'log', timestamp: 1, data: {} }]
    const response = await f.request('/reports/report-1/evidence', { evidence })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, data: { acknowledged: ['event-1'], evidenceRevision: 2 } })
    expect(f.appendEvidence).toHaveBeenCalledWith({ id: 'report-1', evidence }, f.actor)
  })
  it('rejects unauthorized calls, forged body identity and conflicting path identity', async () => {
    const f = fixture()
    const handler = kit.createFeedbackHandler({ feedback: f.feedback, resolveContext: () => null })
    const url = new URL('https://app.test/api/feedback/reports')
    expect((await handler({ request: new Request(url), url, locals: {} } as RequestEvent)).status).toBe(401)
    expect((await f.request('/reports/report-1/evidence', { evidence: [], scopeId: 'victim' })).status).toBe(400)
    expect((await f.request('/reports/report-1/evidence', { id: 'other-report', evidence: [] })).status).toBe(400)
    expect(f.appendEvidence).not.toHaveBeenCalled()
  })
})
