import { err, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiReachError, reach } from '../src/index.js'
import { createConsoleProvider } from '../src/providers/reach-provider-console.js'
import { executeSend } from '../src/reach-send.js'
import { createTemplateRegistry } from '../src/reach-template.js'
import { createSendLogRepository } from '../src/repositories/reach-repository-send-log.js'

const dnd = { enabled: true, strategy: 'delay' as const, start: '22:00', end: '08:00' }
const config = { providers: [{ name: 'email', type: 'console' as const }], dnd }
const message = { provider: 'email', to: 'test@example.invalid', body: 'queued notification' }

async function initializeQueue() {
  const initialized = await reldb.init({ type: 'sqlite', database: ':memory:' })
  if (!initialized.success)
    throw new Error(initialized.error.message)
  const initializedReach = await reach.init(config)
  if (!initializedReach.success)
    throw new Error(initializedReach.error.message)
  const repository = await createSendLogRepository(reldb)
  if (!repository.success)
    throw new Error(repository.error.message)
  return repository.data
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-01T23:00:00'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await reach.close()
  await reldb.close()
  vi.useRealTimers()
})

describe.sequential('persistent DND enqueue', () => {
  it('启用 delay 但数据库未初始化时拒绝启动', async () => {
    const result = await reach.init(config)
    expect(result.success).toBe(false)
    expect(reach.isInitialized).toBe(false)
    expect(reach.config).toBeNull()
  })

  it('队列建表失败时不发布已初始化状态', async () => {
    await reldb.init({ type: 'sqlite', database: ':memory:' })
    vi.spyOn(reldb.ddl, 'createTable').mockResolvedValue(err(HaiReachError.SEND_FAILED, 'queue schema unavailable'))
    const result = await reach.init(config)
    expect(result.success).toBe(false)
    expect(reach.isInitialized).toBe(false)
  })

  it('缺失持久化仓库不能伪装为 deferred', async () => {
    const result = await executeSend(message, new Map([['email', createConsoleProvider()]]), createTemplateRegistry(), dnd, null)
    expect(result.success).toBe(false)
  })

  it.each(['result', 'throw', 'no rows'] as const)('插入 %s 失败不能返回 deferred', async (failure) => {
    const repository = await initializeQueue()
    const create = vi.spyOn(repository, 'create')
    if (failure === 'result')
      create.mockResolvedValueOnce(err(HaiReachError.SEND_FAILED, 'insert unavailable'))
    else if (failure === 'no rows')
      create.mockResolvedValueOnce(ok({ changes: 0 }))
    else
      create.mockRejectedValueOnce(new Error('connection lost'))

    const result = await reach.send(message)
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiReachError.SEND_FAILED.code)
    const records = await repository.count()
    expect(records).toMatchObject({ success: true, data: 0 })
  })

  it('初始化后数据库断连不能返回 deferred', async () => {
    await initializeQueue()
    await reldb.close()
    const result = await reach.send(message)
    expect(result.success).toBe(false)
  })

  it('等待插入完成后才返回可追踪的 queueId', async () => {
    const repository = await initializeQueue()
    const create = repository.create.bind(repository)
    let signalStarted: () => void = () => {}
    let finishWrite: () => void = () => {}
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve
    })
    const released = new Promise<void>((resolve) => {
      finishWrite = resolve
    })
    vi.spyOn(repository, 'create').mockImplementationOnce(async (...args) => {
      signalStarted()
      await released
      return create(...args)
    })
    let settled = false
    const pending = reach.send(message).then((result) => {
      settled = true
      return result
    })
    await started
    expect(settled).toBe(false)
    finishWrite()
    const result = await pending
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.deferred).toBe(true)
      expect(result.data.queueId).toEqual(expect.any(String))
      const record = await repository.findAll({ where: 'queue_id = ?', params: [result.data.queueId] })
      expect(record).toMatchObject({ success: true, data: [{ queueId: result.data.queueId, status: 'pending', body: message.body }] })
    }
  })

  it('未启用 delay 时数据库仍是可选依赖', async () => {
    const initialized = await reach.init({ providers: config.providers })
    expect(initialized.success).toBe(true)
    const result = await reach.send(message)
    expect(result).toMatchObject({ success: true, data: { success: true } })
  })

  it('即时发送后普通日志写入失败不使已发送消息返回失败', async () => {
    const repository = await initializeQueue()
    vi.setSystemTime(new Date('2026-01-02T09:00:00'))
    vi.spyOn(repository, 'create').mockResolvedValueOnce(err(HaiReachError.SEND_FAILED, 'optional log unavailable'))
    const result = await reach.send(message)
    expect(result).toMatchObject({ success: true, data: { success: true } })
    if (result.success)
      expect(result.data.deferred).not.toBe(true)
  })
})
