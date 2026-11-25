import type { FeedbackFunctions } from '@h-ai/feedback'
import type { RequestEvent } from '@sveltejs/kit'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { kit } from '../src/index.js'

function fixture() {
  const unused = async () => core.err(HaiCommonError.NOT_FOUND, 'Missing')
  const appendEvidence = vi.fn<FeedbackFunctions['appendEvidence']>(async input => core.ok({
    acknowledged: input.evidence.map(item => item.id),
    evidenceRevision: 2,
  }))
  const list = vi.fn<FeedbackFunctions['list']>(async () => core.err(HaiCommonError.FORBIDDEN, 'Forbidden'))
  const listMine = vi.fn<FeedbackFunctions['listMine']>(async input => core.ok({
    items: [],
    total: 0,
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 20,
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
    budget: apiContract.resolveFeedbackBudget(),
    isInitialized: true,
    submit: unused,
    list,
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
  const actor = {
    scopeId: 'trusted-scope',
    userId: 'user-1',
    permissions: ['feedback:create'],
  }
  const resolveContext = vi.fn(() => actor)
  const handler = kit.createFeedbackHandler({ feedback, resolveContext })
  const request = (path: string, body?: unknown) => {
    const url = new URL(`https://app.test/api/feedback${path}`)
    return handler({
      request: new Request(url, body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
      url,
      locals: {},
    } as RequestEvent)
  }
  return {
    request,
    appendEvidence,
    list,
    listMine,
    feedback,
    actor,
  }
}

describe('kit feedback catch-all', () => {
  it('本人列表使用可信作者与分页筛选，管理列表仍独立鉴权', async () => {
    const f = fixture()
    expect(await (await f.request('/my-reports?page=2&pageSize=1&category=bug')).json()).toEqual({
      success: true,
      data: {
        items: [],
        total: 0,
        page: 2,
        pageSize: 1,
      },
    })
    expect(f.listMine).toHaveBeenCalledExactlyOnceWith({ page: 2, pageSize: 1, category: 'bug' }, f.actor)
    expect(f.list).not.toHaveBeenCalled()
    expect((await f.request('/my-reports?userId=untrusted')).status).toBe(400)
    expect((await f.request('/my-reports', {})).status).toBe(404)
    expect((await f.request('/reports')).status).toBe(403)
    expect(f.list).toHaveBeenCalledExactlyOnceWith({}, f.actor)
  })

  it('挂载目录只裁去尾部斜杠，中间连续斜杠保持字面路径', async () => {
    const f = fixture()
    const path = `/feedback/${'/'.repeat(120_000)}tenant`
    const started = performance.now()
    const handler = kit.createFeedbackHandler({
      feedback: f.feedback,
      resolveContext: () => f.actor,
      basePath: `${path}///`,
    })
    expect(performance.now() - started).toBeLessThan(2000)
    const url = new URL(`https://app.test${path}/policy`)
    const response = await handler({
      request: new Request(url),
      url,
      locals: {},
    } as RequestEvent)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, data: f.feedback.budget })
  })

  it('可选反馈未就绪时端点明确503，不把默认策略当作就绪', async () => {
    const f = fixture()
    Object.defineProperty(f.feedback, 'isInitialized', { value: false })
    const response = await f.request('/reports', { appId: 'app', submissionId: 'unavailable' })
    expect(response.status).toBe(503)
  })

  it('forwards parsed evidence and trusted actor and returns durable acknowledgement', async () => {
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
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        acknowledged: ['event-1'],
        evidenceRevision: 2,
      },
    })
    expect(f.appendEvidence).toHaveBeenCalledWith({ id: 'report-1', evidence }, f.actor)
  })
  it('rejects unauthorized calls, forged body identity and conflicting path identity', async () => {
    const f = fixture()
    const handler = kit.createFeedbackHandler({
      feedback: f.feedback,
      resolveContext: () => null,
    })
    const url = new URL('https://app.test/api/feedback/reports')
    expect((await handler({
      request: new Request(url),
      url,
      locals: {},
    } as RequestEvent)).status).toBe(401)
    expect((await f.request('/reports/report-1/evidence', { evidence: [], scopeId: 'victim' })).status).toBe(400)
    expect((await f.request('/reports/report-1/evidence', { id: 'other-report', evidence: [] })).status).toBe(400)
    expect(f.appendEvidence).not.toHaveBeenCalled()
  })
})
