import type { FeedbackFunctions } from '@h-ai/feedback'
import { apiContract, FeedbackReportSchema } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { serv } from '../src/serv-main.js'

function fixture() {
  const report = FeedbackReportSchema.parse({
    id: 'report-1',
    number: 'FB-1',
    appId: 'orders',
    scopeId: 'trusted-scope',
    userId: 'user-1',
    status: 'pending',
    collectionStatus: 'collecting',
    notificationStatus: 'pending',
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    evidenceRevision: 1,
  })
  const unused = async () => core.err(HaiCommonError.NOT_FOUND, 'Missing')
  const submit = vi.fn<FeedbackFunctions['submit']>(async () => {
    await Promise.resolve()
    expect(core.context.get()).toMatchObject({ scopeId: 'trusted-scope', userId: 'user-1', requestId: 'request-1' })
    return core.ok(report)
  })
  const appendEvidence = vi.fn<FeedbackFunctions['appendEvidence']>(async input => core.ok({
    acknowledged: input.evidence.map(item => item.id),
    evidenceRevision: 2,
  }))
  const listMine = vi.fn<FeedbackFunctions['listMine']>(async () => core.ok({
    items: [report],
    page: 1,
    pageSize: 20,
    total: 1,
  }))
  const feedback: FeedbackFunctions = {
    createBundle: unused,
    getBundleViewerFiles: () => ({}),
    queryBundle: () => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    }),
    readBundle: unused,
    summarizeBundle: () => '',
    init: async () => core.ok(undefined),
    close: async () => core.ok(undefined),
    config: null,
    isInitialized: true,
    budget: apiContract.resolveFeedbackBudget(),
    submit,
    list: unused,
    listMine,
    get: unused,
    getEvidence: unused,
    setStatus: unused,
    appendEvidence,
    completeCollection: unused,
    uploadAttachment: unused,
    getAttachment: unused,
    retry: unused,
    export: unused,
    getExport: unused,
    runJobs: unused,
  }
  const resolveContext = vi.fn(() => ({
    scopeId: 'trusted-scope',
    userId: 'user-1',
    permissions: ['feedback:create'],
  }))
  const app = serv.createApp({
    contract: apiContract.feedback,
    procedures: serv.createFeedbackProcedures({ feedback, resolveContext }),
    verifyToken: async () => core.ok({ userId: 'user-1', roles: [], permissions: [] }),
  })
  const request = (path: string, body: object, authenticated = true) => app.request(`/api/v1/feedback${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'request-1',
      ...(authenticated
        ? { authorization: 'Bearer test-token' }
        : {}),
    },
    body: JSON.stringify(body),
  })
  return {
    request,
    submit,
    appendEvidence,
    resolveContext,
    listMine,
    listOwn: () => app.request('/api/v1/feedback/my-reports?category=bug', {
      headers: { 'authorization': 'Bearer test-token', 'x-request-id': 'request-1' },
    }),
  }
}

describe('feedback default procedures', () => {
  it('lists the authenticated caller’s reports and preserves the category filter', async () => {
    const f = fixture()
    expect(await (await f.listOwn()).json()).toMatchObject({
      success: true,
      data: { total: 1 },
    })
    expect(f.listMine).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ category: 'bug' }), {
      scopeId: 'trusted-scope',
      userId: 'user-1',
      permissions: ['feedback:create'],
    })
  })
  it('uses trusted scope and preserves request identity through asynchronous module calls', async () => {
    const f = fixture()
    const response = await f.request('/reports', { submissionId: 'operation-1', appId: 'orders' })
    expect((await response.json()).success).toBe(true)
    expect(f.submit).toHaveBeenCalledWith({ submissionId: 'operation-1', appId: 'orders' }, {
      scopeId: 'trusted-scope',
      userId: 'user-1',
      permissions: ['feedback:create'],
    })
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
    const evidence = [
      {
        id: 'event-1',
        source: 'browser',
        sequence: 1,
        kind: 'log',
        timestamp: 1,
        data: {},
      },
    ]
    const response = await f.request('/reports/report-1/evidence', { evidence })
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        acknowledged: ['event-1'],
        evidenceRevision: 2,
      },
    })
  })
})
