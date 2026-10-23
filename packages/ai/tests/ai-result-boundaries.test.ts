/** 通过公开入口验证后台 HaiResult 与存储异常不会冒充成功或逸出业务 API。 */
import type { HaiResult } from '@h-ai/core'
import type { ContextManager } from '../src/context/ai-context-types.js'
import type { MemoryEntry } from '../src/memory/ai-memory-types.js'
import { err, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ai, HaiAIError } from '../src/index.js'

beforeEach(async () => {
  const initialized = await ai.init({ llm: { apiKey: 'test', model: 'controlled' } })
  expect(initialized.success).toBe(true)
  vi.spyOn(ai.llm, 'chat').mockResolvedValue(ok({
    id: 'response',
    object: 'chat.completion',
    model: 'controlled',
    created: 0,
    choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', content: 'reply', refusal: null } }],
  }))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await ai.close()
})

function manager(): ContextManager {
  const created = ai.context.createManager({
    scope: { objectId: 'boundary-user', sessionId: crypto.randomUUID() },
    compress: { auto: false },
    memory: { enableExtract: true },
  })
  if (!created.success)
    throw new Error(created.error.message)
  return created.data
}

describe('background memory results', () => {
  it.each(['result', 'throw', 'reject'] as const)('%s 失败即使任务已结束也由 flush 报告，报告后不自动重放', async (failure) => {
    const extract = vi.spyOn(ai.memory, 'extract')
    if (failure === 'result')
      extract.mockResolvedValue(err(HaiAIError.MEMORY_EXTRACT_FAILED, 'private-db-password'))
    else if (failure === 'throw')
      extract.mockImplementation(() => { throw new Error('private-db-password') })
    else
      extract.mockRejectedValue(new Error('private-db-password'))
    const context = manager()
    expect((await context.chat('remember this')).success).toBe(true)
    await expect.poll(() => context.pendingMemoryTasks).toBe(0)
    const flushed = await context.flush()
    expect(flushed.success).toBe(false)
    if (!flushed.success) {
      expect(flushed.error.code).toBe(HaiAIError.MEMORY_EXTRACT_FAILED.code)
      expect(JSON.stringify(flushed)).not.toContain('private-db-password')
    }
    expect((await context.flush()).success).toBe(true)
    expect(extract).toHaveBeenCalledTimes(1)
  })

  it('并发 flush/save/reset/consolidate 观察同一批失败，均不进入后续写入', async () => {
    let complete!: (result: HaiResult<MemoryEntry[]>) => void
    const extract = vi.spyOn(ai.memory, 'extract').mockImplementation(() => new Promise((resolve) => {
      complete = resolve
    }))
    const summary = vi.spyOn(ai.summary, 'generate')
    const context = manager()
    expect((await context.chat('remember this')).success).toBe(true)
    const first = context.flush()
    const second = context.flush()
    expect(first).toBe(second)
    const observing = [first, second, context.save(), context.reset({ waitForMemoryTasks: true }), context.consolidate()]
    complete(err(HaiAIError.MEMORY_EXTRACT_FAILED, 'failed'))
    for (const result of await Promise.all(observing)) {
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.code).toBe(HaiAIError.MEMORY_EXTRACT_FAILED.code)
    }
    expect(summary).not.toHaveBeenCalled()
    expect(context.getMessages()).toMatchObject({ success: true, data: [{ role: 'user' }, { role: 'assistant' }] })
    expect(extract).toHaveBeenCalledTimes(1)
    expect((await context.save()).success).toBe(true)
  })

  it('一次报告覆盖所有失败数量，新一批失败仍单独报告', async () => {
    const extract = vi.spyOn(ai.memory, 'extract').mockResolvedValue(err(HaiAIError.MEMORY_EXTRACT_FAILED, 'failed'))
    const context = manager()
    expect((await context.chat('one')).success).toBe(true)
    expect((await context.chat('two')).success).toBe(true)
    const first = await context.flush()
    expect(first.success).toBe(false)
    if (!first.success)
      expect(first.error.message).toContain('2')
    expect((await context.chat('three')).success).toBe(true)
    expect((await context.flush()).success).toBe(false)
    expect(extract).toHaveBeenCalledTimes(3)
  })

  it('流式生成仍按流契约结束，后台失败必须通过 flush 观察', async () => {
    vi.spyOn(ai.memory, 'extract').mockRejectedValue(new Error('memory failed'))
    vi.spyOn(ai.llm, 'chatStream').mockImplementation(async function* () {
      yield { id: 'stream', object: 'chat.completion.chunk', model: 'controlled', created: 0, choices: [{ index: 0, delta: { content: 'reply' }, finish_reason: 'stop' }] }
    })
    const context = manager()
    const events = []
    for await (const event of context.chatStream('remember')) events.push(event)
    expect(events.at(-1)?.type).toBe('done')
    expect((await context.flush()).success).toBe(false)
  })
})

describe('store HaiResult boundaries', () => {
  it('restoreManager 的实际 SQL 失败转换为 HaiResult', async () => {
    vi.spyOn(reldb.sql, 'get').mockResolvedValueOnce(err(HaiAIError.STORE_FAILED, 'database unavailable'))
    await expect(ai.context.restoreManager({ objectId: 'user', sessionId: 'restore' })).resolves.toMatchObject({ success: false, error: { code: HaiAIError.STORE_FAILED.code } })
  })

  it('knowledge 就绪查询的实际 SQL 失败由每个非流式入口转换', async () => {
    vi.spyOn(reldb.sql, 'get').mockResolvedValue(err(HaiAIError.STORE_FAILED, 'database unavailable'))
    for (const operation of [
      () => ai.knowledge.ingest({ documentId: 'one', content: 'document' }),
      () => ai.knowledge.retrieve('question'),
      () => ai.knowledge.ask('question'),
      () => ai.knowledge.findByEntity('entity'),
      () => ai.knowledge.listDocuments(),
      () => ai.knowledge.removeDocument('one'),
    ]) await expect(operation()).resolves.toMatchObject({ success: false })
  })

  it('a2A listMessages SQL 失败使用领域错误码，不泄漏连接详情', async () => {
    // 当前初始化未配置 A2A，重新以同一个真实 SQLite/Vecdb 装配后注册公开 executor。
    await ai.close()
    expect((await ai.init({ llm: { apiKey: 'test' }, a2a: { agentCard: { name: 'boundary', url: 'https://agent.example' } } })).success).toBe(true)
    expect(ai.a2a.registerExecutor({ execute: async () => {}, cancelTask: async () => {} }).success).toBe(true)
    vi.spyOn(reldb.sql, 'get').mockResolvedValue(err(HaiAIError.STORE_FAILED, 'postgres://user:private-db-password@internal/db'))
    const result = await ai.a2a.listMessages({ callerId: 'owner' })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.A2A_LIST_MESSAGES_FAILED.code)
    expect(JSON.stringify(result)).not.toContain('private-db-password')
  })
})
