import type { FeedbackReport } from '@h-ai/api-contract/feedback'
import type { HaiResult, LogRecord } from '@h-ai/core'
// @vitest-environment jsdom
import type { FeedbackClientActions } from '../src/client/index.js'
import { Buffer } from 'node:buffer'
import { webcrypto } from 'node:crypto'
import { resolveFeedbackBudget } from '@h-ai/api-contract/feedback'
import { core, err, HaiCommonError, ok } from '@h-ai/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFeedbackBundle } from '../src/bundle/index.js'
import * as images from '../src/client/feedback-client-image.js'
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

function plainTextFile(text: string, name = 'diagnostic.log'): File {
  const file = new File([text], name, { type: 'text/plain' })
  // jsdom 未实现 Blob.text；补齐浏览器标准接口，实际 File.size 仍由构造内容决定。
  Object.defineProperty(file, 'text', { value: vi.fn(async () => text) })
  return file
}

it('服务端策略限制附件总量，失败不留下半批材料，预览在关闭时统一释放', async () => {
  const budget = resolveFeedbackBudget({ maxTotalBytes: 4 * 1048576 })
  const policy = vi.fn(async () => ok(budget))
  const transport = actions()
  const { client } = await setup({ actions: { ...transport, policy } })
  expect(policy).toHaveBeenCalledOnce()
  expect(client.budget).toEqual(budget)
  await client.prepare()
  const large = new File([new Uint8Array(budget.maxAttachmentsBytes)], 'large.webm', { type: 'video/webm' })
  Object.defineProperty(large, 'arrayBuffer', { value: async () => new Uint8Array(budget.maxAttachmentsBytes).buffer })
  expect((await client.addFiles([large, pngFile().file])).success).toBe(false)
  expect(client.getDraft()!.attachments).toHaveLength(0)
  const create = vi.fn(() => 'blob:owned-preview')
  const revoke = vi.fn()
  vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke })
  expect((await client.addFiles([pngFile().file])).success).toBe(true)
  expect(client.getView().attachments[0]?.url).toBe('blob:owned-preview')
  client.getView()
  expect(create).toHaveBeenCalledOnce()
  await client.close({ discard: true })
  expect(revoke).toHaveBeenCalledWith('blob:owned-preview')
  expect(client.getView().attachments).toEqual([])
})

function pngFile(name = 'pending.png'): { file: File, bytes: Uint8Array<ArrayBuffer> } {
  const bytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lMsAAAAASUVORK5CYII=', 'base64'))
  const file = new File([bytes], name, { type: 'image/png' })
  // jsdom 未实现 Blob.arrayBuffer；返回真实 PNG 内容，保持 File.size 与读取结果一致。
  Object.defineProperty(file, 'arrayBuffer', { value: vi.fn(async () => bytes.slice().buffer) })
  return { file, bytes }
}

afterEach(async () => {
  for (const client of clients.splice(0))
    await client.close()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('feedback browser collection', () => {
  it.each([
    ['browser.log', '', 'text/plain', 'safe log'],
    ['browser.LOG', 'application/octet-stream', 'text/plain', 'safe log'],
    ['capture.png', '', 'image/png', 'binary fixture'],
    ['capture.png', 'image/x-png', 'image/png', 'binary fixture'],
    ['facts.json', 'application/json; charset=utf-8', 'application/json', '{"enabled":true}'],
    ['document.pdf', '', 'application/pdf', '%PDF-1.7 fixture'],
  ])('选择本地附件规范化系统 MIME：%s (%s)', async (name, mime, contentType, content) => {
    const { client } = await setup()
    await client.prepare()
    const file = new File([content], name, { type: mime })
    Object.defineProperty(file, 'text', { value: async () => content })
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(content).buffer })
    expect((await client.addFiles([file])).success).toBe(true)
    expect(client.getDraft()!.attachments[0]?.contentType).toBe(contentType)
  })

  it('失败提交后的离线导出也接受 MIME 为空的日志，并拒绝真正不支持的格式', async () => {
    const transport = actions()
    vi.mocked(transport.submit).mockRejectedValueOnce(new Error('Response lost'))
    const { client } = await setup({ actions: transport })
    expect((await client.submit()).success).toBe(false)
    const file = new File(['safe log'], 'offline.log')
    Object.defineProperty(file, 'text', { value: async () => 'safe log' })
    const result = await client.exportDraft({ files: [file] })
    expect(result.success).toBe(true)
    const unsupported = await client.exportDraft({ files: [new File(['binary'], 'file.png', { type: 'application/x-msdownload' })] })
    expect(unsupported.success).toBe(false)
    if (!unsupported.success) {
      expect(unsupported.error.message).toMatch(/PNG|格式|format/i)
      expect(unsupported.error.message).toContain('traceId:')
    }
    expect(client.getDraft()!.attachments).toHaveLength(0)
  })

  it('本地失败返回安全提示与关联标识，详细脱敏日志和本地 UI trace 可检索', async () => {
    const { client } = await setup({ captureScreenshot: async () => {
      throw new Error('Capture driver unavailable verificationCode=PRIVATE_DIAGNOSTIC_CODE')
    } })
    await client.prepare()
    const records: LogRecord[] = []
    const stop = core.logger.observe(record => records.push(record))
    try {
      const result = await client.captureScreenshot()
      expect(result.success).toBe(false)
      if (result.success)
        return
      expect(result.error.message).toContain(`(traceId: ${result.error.traceId})`)
      expect(result.error.message).not.toContain('Capture driver')
      const logged = JSON.stringify(records)
      expect(logged).toContain('Capture driver unavailable')
      expect(logged).toContain(result.error.traceId!)
      expect(logged).not.toContain('PRIVATE_DIAGNOSTIC_CODE')
      core.logger.warn('UI local boundary', { traceId: 'local-ui-trace' })
      expect(client.getDraft()!.evidence.find(item => item.data.message === 'UI local boundary')?.requestId).toBe('local-ui-trace')
    }
    finally { stop() }
  })

  it('当前页面截图排在历史操作截图之前，换页重开草稿补充当前现场', async () => {
    const captureScreenshot = vi.fn(async () => pngFile().bytes)
    const { client } = await setup({ screenshot: true, captureScreenshot })
    client.record({ kind: 'error', data: { message: 'Earlier page failed' } })
    await vi.waitFor(() => expect(captureScreenshot).toHaveBeenCalledOnce())
    await client.prepare()
    const draft = client.getDraft()!
    expect(draft.attachments[0]?.name).toBe('screenshot.png')
    expect(draft.attachments[1]?.name).toMatch(/^operation-/)
    const submissionId = draft.submissionId
    const previousUrl = location.href
    try {
      history.replaceState(null, '', '/another-page')
      await client.prepare()
      expect(client.getDraft()?.submissionId).toBe(submissionId)
      expect(client.getDraft()?.attachments).toHaveLength(3)
      expect(client.getDraft()?.evidence.filter(item => item.kind === 'environment').at(-1)?.data.url).toBe(`${location.origin}/another-page`)
    }
    finally {
      history.replaceState(null, '', previousUrl)
    }
  })

  it('可补充及替换当前截图，截图失败或提交冻结不破坏原材料', async () => {
    const captureScreenshot = vi.fn(async () => pngFile().bytes)
    const { client } = await setup({ screenshot: true, captureScreenshot })
    await client.prepare()
    const first = client.getDraft()!.attachments[0]!
    expect((await client.captureScreenshot()).success).toBe(true)
    expect(client.getDraft()!.attachments).toHaveLength(2)
    expect((await client.captureScreenshot(first.id)).success).toBe(true)
    expect(client.getDraft()!.attachments).toHaveLength(2)
    expect(client.getDraft()!.attachments.some(item => item.id === first.id)).toBe(true)
    const before = [...client.getDraft()!.attachments]
    captureScreenshot.mockRejectedValueOnce(new Error('Capture unavailable'))
    expect((await client.captureScreenshot(first.id)).success).toBe(false)
    expect(client.getDraft()!.attachments).toEqual(before)
    await client.submit()
    expect((await client.captureScreenshot()).success).toBe(false)
    expect(client.getDraft()!.attachments).toEqual(before)
  })

  it('浏览器环境来自当前页面和实际构建，视频附件保留字节并可离线读取', async () => {
    const { client } = await setup({ appVersion: 'version-fixture', buildId: 'build-fixture', commit: 'commit-fixture' })
    await client.prepare()
    const env = client.getDraft()!.evidence.find(item => item.kind === 'environment')!
    expect(env.data).toMatchObject({ url: `${location.origin}${location.pathname}`, appVersion: 'version-fixture', buildId: 'build-fixture', commit: 'commit-fixture', browser: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight } })
    const bytes = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0, 0, 0, 0, 0, 0, 0, 0])
    const file = new File([bytes], 'recording.webm', { type: 'video/webm' })
    Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer })
    expect((await client.addFiles([file])).success).toBe(true)
    const exported = await client.exportDraft({ description: 'Local diagnostic' })
    expect(exported.success).toBe(true)
    if (!exported.success)
      return
    const bundle = await readFeedbackBundle(exported.data)
    expect(bundle.success).toBe(true)
    if (!bundle.success)
      return
    expect(bundle.data.report).toMatchObject({ description: 'Local diagnostic', appVersion: 'version-fixture', buildId: 'build-fixture', commit: 'commit-fixture' })
    const video = bundle.data.manifest.files.find(item => item.name === 'recording.webm')!
    expect(video.path).toMatch(/\.webm$/)
    expect(bundle.data.files[video.path]).toEqual(bytes)
  })

  it('提交期间完成的旧标注不能修改冻结附件及校验和', async () => {
    const { client, transport } = await setup({ screenshot: true, captureScreenshot: async () => pngFile().bytes })
    await client.prepare()
    const original = client.getDraft()!.attachments[0]!
    const checksum = original.checksum
    let complete!: (bytes: Uint8Array) => void
    vi.spyOn(images, 'annotateFeedbackImage').mockReturnValueOnce(new Promise(resolve => complete = resolve))
    const pending = client.annotate(original.id, { x: 0, y: 0, width: 1, height: 1, mode: 'mask' })
    expect((await client.submit()).success).toBe(true)
    complete(new Uint8Array([4, 5, 6]))
    expect((await pending).success).toBe(false)
    expect(original.checksum).toBe(checksum)
    expect(vi.mocked(transport.submit).mock.calls[0]![0].attachments?.[0]?.checksum).toBe(checksum)
  })

  it('并发重初始化仅有一个成功，日志不重复采集', async () => {
    const { client } = await setup()
    const config = { appId: 'orders', actions: actions(), screenshot: false }
    const results = await Promise.all([client.init(config), client.init(config)])
    expect(results.filter(result => result.success)).toHaveLength(1)
    core.logger.info('Lifecycle collection probe')
    await client.prepare()
    expect(client.getDraft()!.evidence.filter(item => item.kind === 'log' && item.data.message === 'Lifecycle collection probe')).toHaveLength(1)
  })

  it('截图期间关闭会话不抛异常、不复活草稿，并允许之后重新初始化', async () => {
    let complete!: (bytes: Uint8Array) => void
    const captureScreenshot = vi.fn(() => new Promise<Uint8Array>(resolve => complete = resolve))
    const { client } = await setup({ screenshot: true, captureScreenshot })
    const pending = client.prepare()
    await vi.waitFor(() => expect(captureScreenshot).toHaveBeenCalledOnce())
    const stopped = client.close()
    complete(pngFile().bytes)
    expect((await pending).success).toBe(false)
    await stopped
    expect(client.getDraft()).toBeUndefined()
    expect((await client.init({ appId: 'next', actions: actions(), screenshot: false })).success).toBe(true)
    expect((await client.prepare()).success).toBe(true)
    expect(client.getDraft()!.attachments).toEqual([])
  })

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

  it('大于8KiB的安全纯文本附件保留全文，提交上传不复用证据字段截断', async () => {
    const { client, transport } = await setup({ afterCount: 0 })
    expect((await client.prepare()).success).toBe(true)
    const text = `${'diagnostic log line completed\n'.repeat(75_000)}safe-log-tail`
    const original = new TextEncoder().encode(text)
    expect(original.byteLength).toBeGreaterThan(2 * 1024 * 1024)
    expect((await client.addFiles([plainTextFile(text)])).success).toBe(true)
    const draft = client.getDraft()!
    expect(draft.attachments).toHaveLength(1)
    expect(draft.attachments[0]!.bytes.byteLength).toBe(original.byteLength)
    expect(new TextDecoder().decode(draft.attachments[0]!.bytes) === text).toBe(true)
    expect(draft.missing.some(reason => reason.startsWith('attachment-text-truncated:'))).toBe(false)
    expect((await client.submit()).success).toBe(true)
    expect((await client.flush()).success).toBe(true)
    const uploaded = vi.mocked(transport.upload).mock.calls[0]![0]
    expect(Buffer.from(uploaded.dataBase64, 'base64').toString('utf8') === text).toBe(true)
  })

  it('纯文本附件末尾超过8KiB位置的凭据仍脱敏，安全尾部保留', async () => {
    const { client } = await setup()
    expect((await client.prepare()).success).toBe(true)
    const prefix = 'safe diagnostic entry\n'.repeat(2000)
    const text = `${prefix}{"password":"tail-password-sentinel"}\ntoken=tail-token-sentinel\nAuthorization: Basic dGFpbC1iYXNpYy1zZW50aW5lbA==\nhttps://example.test/check?token=tail-url-sentinel&visible=keep\nsafe-final-line`
    expect((await client.addFiles([plainTextFile(text)])).success).toBe(true)
    const sanitized = new TextDecoder().decode(client.getDraft()!.attachments[0]!.bytes)
    expect(sanitized.length).toBeGreaterThan(8192)
    expect(sanitized.startsWith(prefix)).toBe(true)
    expect(sanitized.endsWith('safe-final-line')).toBe(true)
    expect(sanitized).toContain('[REDACTED]')
    expect(sanitized).not.toContain('tail-password-sentinel')
    expect(sanitized).not.toContain('tail-token-sentinel')
    expect(sanitized).not.toContain('dGFpbC1iYXNpYy1zZW50aW5lbA==')
    expect(sanitized).not.toContain('tail-url-sentinel')
  })

  it('首次提交冻结后，本地导出新增纯文本也保留安全全文和末尾脱敏', async () => {
    const transport = actions()
    vi.mocked(transport.submit).mockRejectedValueOnce(new Error('Response lost'))
    const { client } = await setup({ actions: transport })
    expect((await client.submit()).success).toBe(false)
    const prefix = 'offline diagnostic line\n'.repeat(2000)
    const text = `${prefix}session=offline-session-sentinel\nsafe-offline-tail`
    const exported = await client.exportDraft({ files: [plainTextFile(text, 'offline.log')] })
    expect(exported.success).toBe(true)
    if (!exported.success)
      return
    const bundle = await readFeedbackBundle(exported.data)
    expect(bundle.success).toBe(true)
    if (!bundle.success)
      return
    const entry = bundle.data.manifest.files.find(file => file.kind === 'attachment' && file.name === 'offline.log')
    expect(entry).toBeDefined()
    if (!entry)
      return
    const sanitized = new TextDecoder().decode(bundle.data.files[entry.path])
    expect(sanitized.length).toBeGreaterThan(8192)
    expect(sanitized.startsWith(prefix)).toBe(true)
    expect(sanitized.endsWith('safe-offline-tail')).toBe(true)
    expect(sanitized).not.toContain('offline-session-sentinel')
    expect(client.getDraft()!.attachments).toHaveLength(0)
  })

  it.each([5 * 1024 * 1024, 5 * 1024 * 1024 + 1])('纯文本附件按原始文件字节数保持5MiB边界：%i', async (size) => {
    const { client, transport } = await setup()
    expect((await client.prepare()).success).toBe(true)
    const file = plainTextFile('x'.repeat(size), 'boundary.log')
    expect(file.size).toBe(size)
    const added = await client.addFiles([file])
    if (size <= 5 * 1024 * 1024) {
      expect(added.success).toBe(true)
      expect(client.getDraft()!.attachments[0]!.bytes.byteLength).toBe(size)
    }
    else {
      expect(added.success).toBe(false)
      if (!added.success)
        expect(added.error.code).toBe('hai:feedback:024')
      expect(client.getDraft()!.attachments).toHaveLength(0)
      expect(file.text).not.toHaveBeenCalled()
    }
    expect(transport.upload).not.toHaveBeenCalled()
  })

  it.each(['addFiles', 'frozen-export'] as const)('原文未超限但脱敏结果超过5MiB时拒绝，不能产生非法附件或上传：%s', async (mode) => {
    const { client, transport } = await setup()
    expect((await client.prepare()).success).toBe(true)
    if (mode === 'frozen-export') {
      vi.mocked(transport.submit).mockRejectedValueOnce(new Error('Response lost'))
      expect((await client.submit()).success).toBe(false)
    }
    const credentials = 'token=x\n'.repeat(1000)
    const text = `${'s'.repeat(5 * 1024 * 1024 - credentials.length - 1)}\n${credentials}`
    const file = plainTextFile(text, 'redaction-expansion.log')
    expect(file.size).toBe(5 * 1024 * 1024)
    const added = mode === 'addFiles'
      ? await client.addFiles([file])
      : await client.exportDraft({ files: [file] })
    expect(file.text).toHaveBeenCalledOnce()
    expect(added.success).toBe(false)
    if (!added.success)
      expect(added.error.code).toBe('hai:feedback:024')
    expect(client.getDraft()!.attachments).toHaveLength(0)
    expect(transport.upload).not.toHaveBeenCalled()
  })

  it.each(['oversized', 'invalid-type', 'json-missing'] as const)('混合附件批次%s失败保持原草稿，清空待选文件后不提交或上传隐藏文件', async (mode) => {
    const { client, transport } = await setup({ afterCount: 0, screenshot: true, captureScreenshot: async () => {
      throw new Error('Screenshot unavailable')
    } })
    expect((await client.prepare()).success).toBe(true)
    expect((await client.addFiles([plainTextFile('existing safe log', 'existing.log')])).success).toBe(true)
    const original = structuredClone(client.getDraft()!)
    const existingIds = original.attachments.map(item => item.id)
    const image = pngFile()
    let first = image.file
    if (mode === 'json-missing') {
      const text = JSON.stringify({ message: 'safe diagnostic line'.repeat(1000) })
      first = new File([text], 'pending.json', { type: 'application/json' })
      Object.defineProperty(first, 'text', { value: vi.fn(async () => text) })
    }
    const bad = mode === 'oversized'
      ? new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'oversized.png', { type: 'image/png' })
      : new File(['unsupported'], 'unsupported.bin', { type: 'application/octet-stream' })
    const result = await client.addFiles([first, bad])
    expect(mode === 'json-missing' ? first.text : first.arrayBuffer).toHaveBeenCalledOnce()
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(mode === 'oversized' ? 'hai:feedback:024' : 'hai:feedback:025')
    expect.soft(client.getDraft()).toEqual(original)
    expect((await client.submit({ files: [] })).success).toBe(true)
    expect((await client.flush()).success).toBe(true)
    const submitted = vi.mocked(transport.submit).mock.calls[0]![0]
    expect.soft(submitted.attachments?.map(item => item.id)).toEqual(existingIds)
    expect.soft(vi.mocked(transport.upload).mock.calls.map(([input]) => input.attachmentId)).toEqual(existingIds)
    expect.soft(client.getDraft()!.missing).toEqual(original.missing)
  })

  it('读取待选附件期间首次包络已冻结时拒绝补入，不生成包络之外的隐藏上传', async () => {
    const { client, transport } = await setup({ afterCount: 0 })
    expect((await client.prepare()).success).toBe(true)
    const image = pngFile('late.png')
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    vi.mocked(image.file.arrayBuffer).mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
      return image.bytes.slice().buffer
    })
    const pending = client.addFiles([image.file])
    try {
      await entered.promise
      expect((await client.submit({ files: [] })).success).toBe(true)
      expect(vi.mocked(transport.submit).mock.calls[0]![0].attachments).toEqual([])
    }
    finally {
      release.resolve()
    }
    const added = await pending
    expect.soft(added.success).toBe(false)
    if (!added.success)
      expect(added.error.code).toBe('hai:feedback:023')
    expect.soft(client.getDraft()!.attachments).toHaveLength(0)
    expect((await client.flush()).success).toBe(true)
    expect(transport.upload).not.toHaveBeenCalled()
  })

  it('并发添加附件不会用慢批次的旧快照覆盖已完成批次', async () => {
    const { client } = await setup()
    expect((await client.prepare()).success).toBe(true)
    const image = pngFile('slow.png')
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    vi.mocked(image.file.arrayBuffer).mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
      return image.bytes.slice().buffer
    })
    const pending = client.addFiles([image.file])
    try {
      await entered.promise
      expect((await client.addFiles([plainTextFile('fast safe log', 'fast.log')])).success).toBe(true)
    }
    finally {
      release.resolve()
    }
    expect((await pending).success).toBe(true)
    expect(client.getDraft()!.attachments.map(item => item.name).sort()).toEqual(['fast.log', 'slow.png'])
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

it('退出发生在策略读取期间时，迟到初始化不能复活采集会话', async () => {
  vi.stubGlobal('crypto', webcrypto)
  const client = createFeedbackClient()
  clients.push(client)
  let release!: (value: HaiResult<ReturnType<typeof resolveFeedbackBudget>>) => void
  const policy = new Promise<HaiResult<ReturnType<typeof resolveFeedbackBudget>>>((resolve) => {
    release = resolve
  })
  const pending = client.init({ appId: 'orders', actions: { ...actions(), policy: () => policy } })
  await client.close({ discard: true })
  release(ok(resolveFeedbackBudget()))
  expect((await pending).success).toBe(false)
  expect((await client.prepare()).success).toBe(false)
  expect(client.getDraft()).toBeUndefined()
})

it('离线策略请求失败仍可保存本地草稿，在线提交重新确认有效预算', async () => {
  const transport = actions()
  const policy = vi.fn().mockResolvedValueOnce(err(HaiCommonError.NETWORK_ERROR, 'Offline')).mockResolvedValueOnce(ok(resolveFeedbackBudget()))
  const { client } = await setup({ actions: { ...transport, policy } })
  expect((await client.prepare()).success).toBe(true)
  expect(client.getDraft()?.missing).toContain('server-policy-unavailable')
  const exported = await client.exportDraft({ description: 'Offline feedback' })
  expect(exported.success).toBe(true)
  expect((await client.submit()).success).toBe(true)
  expect(policy).toHaveBeenCalledTimes(2)
  expect(transport.submit).toHaveBeenCalledOnce()
})

it('删除旧附件后添加新文件按剩余预算原子合并', async () => {
  const { client } = await setup({ budget: resolveFeedbackBudget({ maxTotalBytes: 4 * 1048576 }) })
  await client.prepare()
  const file = new File([new Uint8Array(1048576)], 'old.webm', { type: 'video/webm' })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array(1048576).buffer })
  expect((await client.addFiles([file])).success).toBe(true)
  const id = client.getDraft()!.attachments[0]!.id
  expect((await client.addFiles([pngFile('replacement.png').file], [id])).success).toBe(true)
  expect(client.getDraft()?.attachments.map(file => file.name)).toEqual(['replacement.png'])
})

it('hash 路由换页重开补充当前截图，片段参数不进入诊断包', async () => {
  const original = location.href
  const { client } = await setup({ screenshot: true, captureScreenshot: async () => pngFile().bytes })
  try {
    history.replaceState({}, '', '/#/overview')
    await client.prepare()
    const id = client.getDraft()!.submissionId
    history.replaceState({}, '', '/#/users?verificationCode=HASH_PRIVATE_SENTINEL')
    await client.prepare()
    expect(client.getDraft()?.submissionId).toBe(id)
    expect(client.getDraft()?.attachments).toHaveLength(2)
    const exported = await client.exportDraft()
    expect(exported.success).toBe(true)
    if (!exported.success)
      return
    const bundle = await readFeedbackBundle(exported.data)
    expect(JSON.stringify(bundle)).not.toContain('HASH_PRIVATE_SENTINEL')
  }
  finally { history.replaceState({}, '', original) }
})
