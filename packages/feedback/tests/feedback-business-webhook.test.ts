import type { FeedbackInitOptions } from '../src/index.js'
import { Buffer } from 'node:buffer'
import { createHmac } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { err } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFeedbackBundle } from '../src/bundle/index.js'
import { feedback, FeedbackConfigSchema, HaiFeedbackError } from '../src/index.js'

let directory: string
let webhookUrl: string
let responseStatus = 204
let holdResponse = false
const requests: Array<{ body: string, headers: import('node:http').IncomingHttpHeaders }> = []
const server = createServer(async (request, response) => {
  let body = ''
  for await (const chunk of request)
    body += String(chunk)
  requests.push({ body, headers: request.headers })
  if (holdResponse)
    return
  response.writeHead(responseStatus, { Location: '/redirect-target' }).end()
})
const actor = { scopeId: 'business', userId: 'user', permissions: ['feedback:*'] }
const config = { appId: 'business-test', notificationMode: 'disabled' as const, workerIntervalMs: 0 }

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hai-feedback-business-'))
  requests.length = 0
  responseStatus = 204
  holdResponse = false
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing test address')
  webhookUrl = `http://127.0.0.1:${address.port}/feedback`
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await feedback.close()
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  await storage.close()
  await reldb.close()
  await rm(directory, { recursive: true, force: true })
})

async function submit(id = 'one') {
  const accepted = await feedback.submit({ appId: config.appId, submissionId: id }, actor)
  expect(accepted.success).toBe(true)
  if (!accepted.success)
    throw new Error('Feedback intake failed')
  expect((await feedback.completeCollection({ id: accepted.data.id }, actor)).success).toBe(true)
  return accepted.data
}
async function drain() {
  for (let round = 0; round < 3; round++) {
    expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET next_run_at = 0 WHERE kind <> \'cleanup\' AND status = \'pending\'')).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
  }
}

describe('业务补采与反馈 Webhook', () => {
  it('等待异步业务日志和 ZIP，脱敏文本，详情/离线包可读取且重复提交不重复采集', async () => {
    const archive = zipSync({ 'safe.log': strToU8('Order diagnostic log') })
    const collectEvidence = vi.fn<NonNullable<FeedbackInitOptions['collectEvidence']>>(async ({ report, signal }) => {
      await Promise.resolve()
      expect(signal.aborted).toBe(false)
      return { text: `Order ${report.number}, password=private-sentinel`, data: { orderId: 'order-1' }, attachments: [{ id: 'logs', name: 'logs.zip', contentType: 'application/zip', bytes: archive }] }
    })
    expect((await feedback.init(config, { collectEvidence })).success).toBe(true)
    const report = await submit()
    expect(collectEvidence).not.toHaveBeenCalled()
    await drain()
    expect(collectEvidence).toHaveBeenCalledTimes(1)
    const events = await feedback.getEvidence({ id: report.id, kind: 'business' }, actor)
    expect(events.success && events.data.items).toEqual([expect.objectContaining({ source: 'server:business', data: expect.objectContaining({ orderId: 'order-1' }) })])
    expect(JSON.stringify(events)).not.toContain('private-sentinel')
    const detail = await feedback.get(report.id, actor)
    expect(detail.success && detail.data.attachments).toEqual([expect.objectContaining({ name: 'logs.zip', status: 'available' })])
    if (!detail.success)
      return
    const file = await feedback.getAttachment({ id: report.id, attachmentId: detail.data.attachments[0]!.id }, actor)
    expect(file.success && Buffer.from(file.data.dataBase64, 'base64')).toEqual(Buffer.from(archive))
    expect((await feedback.getAttachment({ id: report.id, attachmentId: detail.data.attachments[0]!.id }, { ...actor, scopeId: 'other' })).success).toBe(false)
    const exported = await feedback.export({ id: report.id }, actor)
    expect(exported.success).toBe(true)
    if (!exported.success)
      return
    await drain()
    const downloaded = await feedback.getExport({ id: report.id, jobId: exported.data.id }, actor)
    expect(downloaded.success).toBe(true)
    if (downloaded.success) {
      const bundle = await readFeedbackBundle(Buffer.from(downloaded.data.dataBase64, 'base64'))
      expect(bundle.success && bundle.data.manifest.files.some(item => item.name === 'logs.zip')).toBe(true)
    }
    expect((await feedback.submit({ appId: config.appId, submissionId: 'one' }, actor)).success).toBe(true)
    await drain()
    expect(collectEvidence).toHaveBeenCalledTimes(1)
  })

  it('采集超时会取消并持久重试，缺少同一采集器的重启不能静默成功', async () => {
    let signal: AbortSignal | undefined
    expect((await feedback.init({ ...config, businessCollectionTimeoutMs: 15, maxAttempts: 2 }, { collectEvidence: (context) => {
      signal = context.signal
      return new Promise(() => {})
    } })).success).toBe(true)
    const report = await submit()
    expect((await feedback.runJobs()).success).toBe(true)
    expect(signal?.aborted).toBe(true)
    await feedback.close()
    expect((await feedback.init({ ...config, maxAttempts: 2 })).success).toBe(true)
    await drain()
    const detail = await feedback.get(report.id, actor)
    expect(detail).toMatchObject({ success: true, data: { report: { collectionStatus: 'failed' }, jobs: expect.arrayContaining([expect.objectContaining({ type: 'collect', status: 'failed', attempts: 2 })]) } })
  })

  it('关闭模块时中止等待中的业务采集并释放任务，不等待完整超时', async () => {
    let signal: AbortSignal | undefined
    expect((await feedback.init(config, { collectEvidence: (context) => {
      signal = context.signal
      return new Promise(() => {})
    } })).success).toBe(true)
    await submit()
    const running = feedback.runJobs()
    await vi.waitFor(() => expect(signal).toBeDefined())
    expect((await feedback.close()).success).toBe(true)
    expect(signal?.aborted).toBe(true)
    expect((await running).success).toBe(true)
  })

  it('拒绝超量/伪造压缩包且不保存半批附件，管理员重试后可以恢复', async () => {
    const collectEvidence = vi.fn<NonNullable<FeedbackInitOptions['collectEvidence']>>(() => ({ attachments: [{ id: 'invalid', name: 'bad.zip', contentType: 'application/zip', bytes: strToU8('not zip') }] }))
    expect((await feedback.init({ ...config, maxAttempts: 1 }, { collectEvidence })).success).toBe(true)
    const report = await submit()
    await drain()
    expect(await feedback.get(report.id, actor)).toMatchObject({ success: true, data: { report: { collectionStatus: 'failed' }, attachments: [] } })
    collectEvidence.mockImplementation(() => ({ attachments: [{ id: 'large', name: 'huge.log', contentType: 'text/plain', bytes: new Uint8Array(feedback.budget.maxAttachmentBytes + 1) }] }))
    expect((await feedback.retry({ id: report.id, target: 'collect' }, actor)).success).toBe(true)
    await drain()
    expect(await feedback.get(report.id, actor)).toMatchObject({ success: true, data: { report: { collectionStatus: 'failed' }, attachments: [] } })
    collectEvidence.mockImplementation(() => ({ text: 'Recovered diagnostics' }))
    expect((await feedback.retry({ id: report.id, target: 'collect' }, actor)).success).toBe(true)
    await drain()
    expect(await feedback.getEvidence({ id: report.id, kind: 'business' }, actor)).toMatchObject({ success: true, data: { total: 1 } })
  })

  it('业务附件与用户附件共享总预算，超限时不发布业务证据', async () => {
    expect((await feedback.init({ ...config, maxTotalBytes: 4 * 1048576, maxAttempts: 1 }, { collectEvidence: () => ({ attachments: [{ id: 'extra', name: 'extra.log', contentType: 'text/plain', bytes: Buffer.from('x'.repeat(400000)) }] }) })).success).toBe(true)
    const accepted = await feedback.submit({ appId: config.appId, submissionId: 'budget', attachments: [{ id: 'client', name: 'client.log', contentType: 'text/plain', size: 700000, checksum: '0'.repeat(64) }] }, actor)
    expect(accepted.success).toBe(true)
    if (!accepted.success)
      return
    await feedback.completeCollection({ id: accepted.data.id }, actor)
    await drain()
    expect(await feedback.getEvidence({ id: accepted.data.id, kind: 'business' }, actor)).toMatchObject({ success: true, data: { total: 0 } })
    expect(await feedback.get(accepted.data.id, actor)).toMatchObject({ success: true, data: { report: { collectionStatus: 'failed' }, attachments: [expect.objectContaining({ id: 'client' })] } })
  })

  it('对象保存失败不发布半批材料，持久重试可完整恢复', async () => {
    const options: FeedbackInitOptions = { collectEvidence: () => ({ text: 'Complete batch', attachments: ['first', 'second'].map(id => ({ id, name: `${id}.log`, contentType: 'text/plain', bytes: strToU8(id) })) }) }
    expect((await feedback.init(config, options)).success).toBe(true)
    const report = await submit()
    const put = storage.file.put.bind(storage.file)
    let count = 0
    const fail = vi.spyOn(storage.file, 'put').mockImplementation(async (...args) => ++count === 2 ? err(HaiFeedbackError.OPERATION_FAILED, 'Storage test failure') : put(...args))
    expect((await feedback.runJobs()).success).toBe(true)
    expect(await feedback.get(report.id, actor)).toMatchObject({ success: true, data: { attachments: [] } })
    expect(await feedback.getEvidence({ id: report.id, kind: 'business' }, actor)).toMatchObject({ success: true, data: { total: 0 } })
    fail.mockRestore()
    await drain()
    const detail = await feedback.get(report.id, actor)
    expect(detail.success && detail.data.attachments).toHaveLength(2)
  })

  it('失去租约的迟到业务采集不能发布证据或附件', async () => {
    let finish: ((value: { text: string }) => void) | undefined
    expect((await feedback.init(config, { collectEvidence: () => new Promise((resolve) => {
      finish = resolve
    }) })).success).toBe(true)
    const report = await submit()
    const running = feedback.runJobs()
    await vi.waitFor(() => expect(finish).toBeDefined())
    expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET token = \'another-worker\', lease_until = lease_until + 60000 WHERE kind = \'collect\'')).success).toBe(true)
    finish!({ text: 'Late evidence' })
    await running
    expect(await feedback.getEvidence({ id: report.id, kind: 'business' }, actor)).toMatchObject({ success: true, data: { total: 0 } })
  })

  it('独立 Webhook 在补采后发送固定载荷、签名和稳定幂等键，故障/重启后重试', async () => {
    responseStatus = 503
    const initialized = await feedback.init({ ...config, webhookUrl, webhookSecret: 'test-signing-key' }, { collectEvidence: async () => ({ text: 'Collected business evidence' }) })
    expect(initialized.success).toBe(true)
    const report = await submit()
    await drain()
    expect(requests.length).toBeGreaterThan(0)
    const first = requests[0]!
    expect(JSON.parse(first.body)).toMatchObject({ event: 'feedback.created', report: { id: report.id }, evidence: { business: true } })
    expect(JSON.parse(first.body).report.collectionStatus).not.toBe('collecting')
    const timestamp = first.headers['x-hai-feedback-timestamp']
    expect(first.headers['x-hai-feedback-signature']).toBe(`sha256=${createHmac('sha256', 'test-signing-key').update(`${timestamp}.${first.body}`).digest('hex')}`)
    const idempotencyKey = first.headers['idempotency-key']
    expect(idempotencyKey).toBeTruthy()
    await feedback.close()
    responseStatus = 204
    expect((await feedback.init({ ...config, webhookUrl, webhookSecret: 'test-signing-key' })).success).toBe(true)
    await drain()
    const last = requests.at(-1)!
    expect(last.body).toBe(first.body)
    expect(last.headers['idempotency-key']).toBe(idempotencyKey)
    expect(await feedback.get(report.id, actor)).toMatchObject({ success: true, data: { report: { notificationStatus: 'disabled' }, jobs: expect.arrayContaining([expect.objectContaining({ type: 'webhook', status: 'succeeded' })]) } })
    const count = requests.length
    await drain()
    expect(requests).toHaveLength(count)
  })

  it('webhook 不跟随重定向，终态失败可由管理员重试', async () => {
    responseStatus = 302
    expect((await feedback.init({ ...config, webhookUrl, maxAttempts: 1 })).success).toBe(true)
    const report = await submit()
    await drain()
    expect(requests).toHaveLength(1)
    expect(await feedback.get(report.id, actor)).toMatchObject({ success: true, data: { jobs: expect.arrayContaining([expect.objectContaining({ type: 'webhook', status: 'failed' })]) } })
    expect((await feedback.retry({ id: report.id, target: 'webhook' }, { ...actor, permissions: ['feedback:create'] })).success).toBe(false)
    responseStatus = 204
    expect((await feedback.retry({ id: report.id, target: 'webhook' }, actor)).success).toBe(true)
    await drain()
    expect(requests).toHaveLength(2)
  })

  it('webhook 超时有界失败，不泄漏回调 URL 或签名密钥', async () => {
    holdResponse = true
    expect((await feedback.init({ ...config, webhookUrl: `${webhookUrl}?token=private-url-sentinel`, webhookSecret: 'private-secret-sentinel', webhookTimeoutMs: 15, maxAttempts: 1 })).success).toBe(true)
    const report = await submit()
    await drain()
    const detail = await feedback.get(report.id, actor)
    expect(detail).toMatchObject({ success: true, data: { jobs: expect.arrayContaining([expect.objectContaining({ type: 'webhook', status: 'failed' })]) } })
    expect(JSON.stringify(detail)).not.toContain('private-url-sentinel')
    expect(JSON.stringify(detail)).not.toContain('private-secret-sentinel')
  })

  it('未配置时不创建 Webhook 任务，拒绝非法协议和携带用户凭据的地址', async () => {
    for (const url of ['file:///tmp/a', 'https://user:private@example.test/hook', 'https://example.test/#secret'])
      expect(FeedbackConfigSchema.safeParse({ ...config, webhookUrl: url }).success).toBe(false)
    expect((await feedback.init(config)).success).toBe(true)
    const report = await submit()
    await drain()
    const detail = await feedback.get(report.id, actor)
    expect(detail.success && detail.data.jobs.some(job => job.type === 'webhook')).toBe(false)
    expect(requests).toHaveLength(0)
  })
})
