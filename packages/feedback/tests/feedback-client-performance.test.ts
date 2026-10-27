// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { err, HaiCommonError, ok } from '@h-ai/core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createFeedbackClient } from '../src/client/index.js'

const recorder = vi.hoisted(() => vi.fn((_options: { emit: (event: unknown) => void }) => vi.fn()))
vi.mock('@rrweb/record', () => ({ record: recorder }))
const clients: ReturnType<typeof createFeedbackClient>[] = []
const actions = {
  submit: async () => err(HaiCommonError.INTERNAL_ERROR),
  upload: async () => ok(undefined),
  appendEvidence: async () => ok({ acknowledged: [], evidenceRevision: 1 }),
  completeCollection: async () => err(HaiCommonError.INTERNAL_ERROR),
}
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  recorder.mockClear()
})
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close({ discard: true })
  vi.unstubAllGlobals()
})

it('回放默认在用户准备反馈时启动，普通业务操作不安装DOM记录器', async () => {
  const client = createFeedbackClient()
  clients.push(client)
  expect((await client.init({ appId: 'lightweight', actions, screenshot: false, replay: true })).success).toBe(true)
  expect(recorder).not.toHaveBeenCalled()
  expect((await client.prepare()).success).toBe(true)
  expect(recorder).toHaveBeenCalledOnce()
  client.pause()
  expect(recorder.mock.results[0]?.value).toHaveBeenCalledOnce()
  expect(client.getDraft()).toBeDefined()
  expect((await client.prepare()).success).toBe(true)
  expect(recorder).toHaveBeenCalledTimes(2)
})

it('未显式启用关键截图时，普通错误不会启动DOM截图', async () => {
  const client = createFeedbackClient()
  clients.push(client)
  const captureScreenshot = vi.fn(async () => new Uint8Array([1]))
  expect((await client.init({ appId: 'lightweight', actions, screenshot: true, captureScreenshot })).success).toBe(true)
  client.record({ kind: 'error', data: { message: 'Business error' } })
  await Promise.resolve()
  expect(captureScreenshot).not.toHaveBeenCalled()
})

it('错误后采窗口已结束时，按需准备仍保留当前页面的初始回放快照', async () => {
  const client = createFeedbackClient()
  clients.push(client)
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  recorder.mockImplementationOnce((options) => {
    options.emit({ type: 2, timestamp: now + 60000, data: { node: { type: 0, id: 1, childNodes: [] }, initialOffset: { left: 0, top: 0 } } })
    return vi.fn()
  })
  try {
    expect((await client.init({ appId: 'late-report', actions, replay: true, screenshot: false })).success).toBe(true)
    client.record({ kind: 'error', data: { message: 'Earlier error' } })
    clock.mockReturnValue(now + 60000)
    const prepared = await client.prepare()
    expect(prepared.success).toBe(true)
    expect(client.getDraft()?.evidence.some(event => event.kind === 'replay')).toBe(true)
  }
  finally { clock.mockRestore() }
})

it('截图超时发送取消信号，但实际任务退出之前不启动重叠截图', async () => {
  const client = createFeedbackClient()
  clients.push(client)
  const completions: Array<(value: Uint8Array) => void> = []
  const signals: Array<AbortSignal | undefined> = []
  const captureScreenshot = vi.fn((options?: { signal: AbortSignal }) => {
    signals.push(options?.signal)
    return new Promise<Uint8Array>(resolve => completions.push(resolve))
  })
  expect((await client.init({ appId: 'single-capture', actions, screenshot: true, keyScreenshots: true, keyScreenshotThrottleMs: 0, screenshotTimeoutMs: 1, captureScreenshot })).success).toBe(true)
  try {
    client.record({ kind: 'error', data: { message: 'First error' } })
    await vi.waitFor(() => expect(captureScreenshot).toHaveBeenCalledOnce())
    await new Promise(resolve => setTimeout(resolve, 20))
    client.record({ kind: 'error', data: { message: 'Second error' } })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(captureScreenshot).toHaveBeenCalledOnce()
    expect(signals[0]?.aborted).toBe(true)
  }
  finally {
    for (const complete of completions) complete(new Uint8Array([1]))
  }
})
