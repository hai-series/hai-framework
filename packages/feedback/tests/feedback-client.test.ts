import type { FeedbackReport } from '@h-ai/api-contract/feedback'
// @vitest-environment jsdom
import type { FeedbackClientActions } from '../src/client/index.js'
import { webcrypto } from 'node:crypto'
import { core, err, HaiCommonError, ok } from '@h-ai/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sanitizeFeedbackReplay } from '../src/client/feedback-client-sanitize.js'
import { createFeedbackClient } from '../src/client/index.js'

const clients: ReturnType<typeof createFeedbackClient>[] = []
const report: FeedbackReport = { id: 'report-1', number: 'FB-1', appId: 'orders', scopeId: 'scope-1', userId: 'user-1', status: 'pending', collectionStatus: 'collecting', notificationStatus: 'pending', createdAt: 1, updatedAt: 1, version: 1, evidenceRevision: 1 }

function actions(): FeedbackClientActions {
  return {
    submit: vi.fn(async () => ok(report)),
    upload: vi.fn(async () => ok(undefined)),
    appendEvidence: vi.fn(async input => ok({ acknowledged: input.evidence.map(item => item.id), evidenceRevision: 2 })),
    completeCollection: vi.fn(async () => ok({ ...report, collectionStatus: 'complete' })),
  }
}

async function setup(overrides: Partial<Parameters<ReturnType<typeof createFeedbackClient>['init']>[0]> = {}) {
  vi.stubGlobal('crypto', webcrypto)
  const client = createFeedbackClient()
  clients.push(client)
  const transport = actions()
  expect((await client.init({ appId: 'orders', actions: transport, screenshot: false, ...overrides })).success).toBe(true)
  return { client, transport }
}

afterEach(async () => {
  for (const client of clients.splice(0))
    await client.close()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('feedback browser collection', () => {
  it('没有描述、异常或截图也能提交，并将身份交给服务端', async () => {
    const { client, transport } = await setup()
    expect((await client.prepare()).success).toBe(true)
    const result = await client.submit()
    expect(result.success).toBe(true)
    expect(transport.submit).toHaveBeenCalledWith(expect.objectContaining({ submissionId: expect.any(String), appId: 'orders', anchor: expect.objectContaining({ kind: 'feedback' }) }))
    const payload = vi.mocked(transport.submit).mock.calls[0]![0]
    expect(payload).not.toHaveProperty('userId')
    expect(payload).not.toHaveProperty('scopeId')
    expect(payload.evidence?.some(item => item.kind === 'environment')).toBe(true)
  })

  it('错误前后各100条有界收集，重试只确认后才释放后续块', async () => {
    const { client, transport } = await setup()
    for (let index = 0; index < 150; index++)
      client.record({ kind: 'log', data: { message: `before-${index}` } })
    client.record({ kind: 'error', data: { message: 'failure' } })
    await client.prepare()
    for (let index = 0; index < 120; index++)
      client.record({ kind: 'log', data: { message: `after-${index}` } })
    const draft = client.getDraft()!
    expect(draft.evidence.filter(item => item.kind === 'log' && String(item.data.message).startsWith('before-'))).toHaveLength(100)
    expect(draft.evidence.filter(item => item.kind === 'log' && String(item.data.message).startsWith('after-'))).toHaveLength(100)
    expect(draft.evidence.filter(item => item.kind === 'error')).toHaveLength(1)
    expect((await client.submit()).success).toBe(true)
    expect((await client.flush()).success).toBe(true)
    expect(transport.completeCollection).toHaveBeenCalledOnce()
  })

  it('采集前脱敏自由文本/嵌套凭据，Cookie只保留普通白名单', async () => {
    document.cookie = 'theme=dark'
    document.cookie = 'access_token=never-store'
    const { client } = await setup({ cookieAllowlist: ['theme', 'access_token'] })
    client.record({ kind: 'log', data: { message: 'Authorization: Bearer never-store', nested: { password: 'private', apiKey: 'secret' } } })
    await client.prepare()
    const serialized = JSON.stringify(client.getDraft())
    expect(serialized).not.toContain('never-store')
    expect(serialized).not.toContain('"private"')
    expect(serialized).not.toContain('"secret"')
    expect(serialized).toContain('dark')
  })

  it('受理失败保留现场和稳定提交标识，重试不生成第二份问题', async () => {
    const transport = actions()
    vi.mocked(transport.submit).mockResolvedValueOnce(err(HaiCommonError.INTERNAL_ERROR, 'Unavailable'))
    const { client } = await setup({ actions: transport })
    await client.prepare()
    expect((await client.submit({ description: 'optional' })).success).toBe(false)
    const originalId = client.getDraft()!.submissionId
    expect((await client.submit({ description: 'optional' })).success).toBe(true)
    expect(vi.mocked(transport.submit).mock.calls.map(call => call[0].submissionId)).toEqual([originalId, originalId])
  })

  it('截图失败不阻塞反馈；本地包明确未取得后端材料', async () => {
    const { client } = await setup({ screenshot: true, captureScreenshot: async () => {
      throw new Error('Canvas unavailable')
    } })
    const prepared = await client.prepare()
    expect(prepared.success).toBe(true)
    expect(client.getDraft()!.missing).toContain('screenshot-unavailable')
    const bundle = await client.exportDraft()
    expect(bundle.success).toBe(true)
    if (bundle.success)
      expect(bundle.data.byteLength).toBeGreaterThan(0)
    expect((await client.submit()).success).toBe(true)
  })

  it('自动关联core日志且关闭后不再收集，忽略feedback自身材料', async () => {
    const { client } = await setup()
    core.logger.info('business event', { requestId: 'req-1' })
    core.logger.info('feedback operation', { module: 'feedback' })
    await client.prepare()
    expect(client.getDraft()!.evidence.some(item => item.requestId === 'req-1')).toBe(true)
    expect(JSON.stringify(client.getDraft())).not.toContain('feedback operation')
    await client.close()
    expect((await client.prepare()).success).toBe(false)
  })

  it('重叠错误窗口合并，同一条证据只提交一次', async () => {
    const { client } = await setup()
    for (let index = 0; index < 80; index++)
      client.record({ kind: 'log', data: { message: `first-${index}` } })
    client.record({ kind: 'error', data: { message: 'first-error' } })
    for (let index = 0; index < 80; index++)
      client.record({ kind: 'log', data: { message: `middle-${index}` } })
    client.record({ kind: 'error', data: { message: 'second-error' } })
    await client.prepare()
    const evidence = client.getDraft()!.evidence
    expect(evidence.filter(item => item.kind === 'error')).toHaveLength(2)
    expect(new Set(evidence.map(item => item.id)).size).toBe(evidence.length)
  })

  it('容量淘汰明确记录缺失，beforeCount为0不会反而返回全部历史', async () => {
    const { client } = await setup({ maxEvents: 5, beforeCount: 0 })
    for (let index = 0; index < 20; index++)
      client.record({ kind: 'log', data: { message: `entry-${index}` } })
    await client.prepare()
    expect(client.getDraft()!.evidence.filter(item => item.kind === 'log')).toHaveLength(0)
    expect(client.getDraft()!.missing.some(item => item.startsWith('browser-buffer-truncated:'))).toBe(true)
  })

  it('截图上传失败保留字节与同一附件标识，确认后才结束采集', async () => {
    const transport = actions()
    vi.mocked(transport.upload).mockResolvedValueOnce(err(HaiCommonError.INTERNAL_ERROR, 'Storage unavailable'))
    const { client } = await setup({ actions: transport, screenshot: true, captureScreenshot: async () => new Uint8Array([1, 2, 3]), afterCount: 0 })
    const result = await client.submit()
    expect(result.success).toBe(true)
    expect((await client.flush()).success).toBe(false)
    expect(client.getDraft()!.attachments[0]!.bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect((await client.flush()).success).toBe(true)
    const ids = vi.mocked(transport.upload).mock.calls.map(call => call[0].attachmentId)
    expect(new Set(ids).size).toBe(1)
    expect(transport.completeCollection).toHaveBeenCalledOnce()
  })

  it('已受理后再次打开会先确认上一份材料，再生成新的提交标识', async () => {
    const { client, transport } = await setup()
    await client.submit()
    const first = client.getDraft()!.submissionId
    await client.prepare()
    expect(client.getDraft()!.submissionId).not.toBe(first)
    expect(transport.completeCollection).toHaveBeenCalledOnce()
    await client.submit()
    expect(transport.submit).toHaveBeenCalledTimes(2)
  })

  it('持久化需要产品提供身份范围，不能把其他用户材料恢复进当前反馈', async () => {
    const client = createFeedbackClient()
    clients.push(client)
    expect((await client.init({ appId: 'orders', actions: actions(), persistDraft: true })).success).toBe(false)
  })

  it('服务端已受理而ACK丢失后，继续操作和换路由也按冻结包络重试', async () => {
    const transport = actions()
    let acceptedPayload = ''
    vi.mocked(transport.submit).mockImplementationOnce(async (input) => {
      acceptedPayload = JSON.stringify(input)
      throw new Error('Response lost after commit')
    }).mockImplementationOnce(async (input) => {
      expect(JSON.stringify(input)).toBe(acceptedPayload)
      return ok(report)
    })
    const { client } = await setup({ actions: transport })
    expect((await client.submit({ description: 'original' })).success).toBe(false)
    client.record({ kind: 'log', data: { message: 'operation after lost response' } })
    history.pushState({}, '', '/another-route')
    expect((await client.submit({ description: 'original' })).success).toBe(true)
    expect((await client.flush()).success).toBe(true)
    expect(transport.appendEvidence).toHaveBeenCalledWith(expect.objectContaining({ evidence: expect.arrayContaining([expect.objectContaining({ data: { message: 'operation after lost response' } })]) }))
  })

  it('await补传期间新增的最后一条日志必须ACK后才能结束采集', async () => {
    const { client, transport } = await setup({ afterCount: 2 })
    await client.submit()
    await client.flush()
    let release: (() => void) | undefined
    vi.mocked(transport.appendEvidence).mockImplementationOnce(input => new Promise((resolve) => {
      release = () => resolve(ok({ acknowledged: input.evidence.map(item => item.id), evidenceRevision: 2 }))
    }))
    client.record({ kind: 'log', data: { message: 'first post-submit' } })
    const draining = client.flush()
    client.record({ kind: 'log', data: { message: 'last post-submit' } })
    expect(transport.completeCollection).not.toHaveBeenCalled()
    release!()
    expect((await draining).success).toBe(true)
    expect(transport.appendEvidence).toHaveBeenCalledTimes(2)
    expect(vi.mocked(transport.appendEvidence).mock.calls[1]![0].evidence[0]!.data.message).toBe('last post-submit')
    expect(transport.completeCollection).toHaveBeenCalledOnce()
  })

  it('凭据标准名称和回放textContent均在进入离线材料前脱敏', async () => {
    const { client } = await setup()
    client.record({ kind: 'log', data: { message: 'refresh_token=REFRESH_SENTINEL access_token=ACCESS_SENTINEL accessToken=CAMEL_SENTINEL' } })
    await client.prepare()
    expect(JSON.stringify(client.getDraft())).not.toContain('SENTINEL')
    expect(JSON.stringify(sanitizeFeedbackReplay({ node: { textContent: 'token=REPLAY_SENTINEL' } }))).not.toContain('REPLAY_SENTINEL')
  })

  it('错误发生时固定前100条，即使常态环形缓冲已淘汰也保留窗口', async () => {
    const { client } = await setup({ maxEvents: 250 })
    for (let index = 0; index < 100; index++)
      client.record({ kind: 'log', data: { message: `protected-${index}` } })
    client.record({ kind: 'error', data: { message: 'anchor' } })
    for (let index = 0; index < 500; index++)
      client.record({ kind: 'log', data: { message: `later-${index}` } })
    await client.prepare()
    expect(client.getDraft()!.evidence.filter(item => String(item.data.message).startsWith('protected-'))).toHaveLength(100)
    expect(client.getDraft()!.evidence.filter(item => String(item.data.message).startsWith('later-'))).toHaveLength(100)
  })

  it('长时间空闲后不把已过期的历史日志带进新反馈', async () => {
    vi.useFakeTimers()
    const { client } = await setup({ maxAgeMs: 100 })
    client.record({ kind: 'log', data: { message: 'expired-event' } })
    vi.setSystemTime(Date.now() + 101)
    await client.prepare()
    expect(JSON.stringify(client.getDraft())).not.toContain('expired-event')
  })

  it('稳定操作触发截图早于反馈出现，后续反馈携带有界关键截图', async () => {
    const captureScreenshot = vi.fn(async () => new Uint8Array([1, 2, 3]))
    const { client } = await setup({ screenshot: true, captureScreenshot, keyScreenshotThrottleMs: 10000, maxKeyScreenshots: 1 })
    const button = document.createElement('button')
    button.dataset.feedbackAction = 'order:save'
    document.body.append(button)
    try {
      button.click()
      expect(captureScreenshot).toHaveBeenCalledOnce()
      button.click()
      expect(captureScreenshot).toHaveBeenCalledOnce()
      expect(client.getDraft()).toBeUndefined()
      await client.prepare()
      expect(client.getDraft()!.attachments).toHaveLength(2)
      expect(client.getDraft()!.attachments.some(item => item.name.startsWith('operation-'))).toBe(true)
    }
    finally {
      button.remove()
    }
  })

  it('超限自动截图记录缺失而不阻塞空说明反馈', async () => {
    const { client } = await setup({ screenshot: true, captureScreenshot: async () => new Uint8Array(5 * 1024 * 1024 + 1) })
    expect((await client.submit()).success).toBe(true)
    expect(client.getDraft()!.attachments).toHaveLength(0)
    expect(client.getDraft()!.missing).toContain('screenshot-size-limit-exceeded')
  })

  it('冻结提交后编辑输入明确返回冲突，不能静默按旧说明受理', async () => {
    const transport = actions()
    vi.mocked(transport.submit).mockRejectedValueOnce(new Error('Response lost'))
    const { client } = await setup({ actions: transport })
    expect((await client.submit({ description: 'first input' })).success).toBe(false)
    const changed = await client.submit({ description: 'edited input' })
    expect(changed.success).toBe(false)
    if (!changed.success)
      expect(changed.error.code).toBe('hai:feedback:023')
    expect(transport.submit).toHaveBeenCalledOnce()
  })
})
