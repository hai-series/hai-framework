/**
 * AI Memory 公共入口封装测试
 *
 * 验证 `createMemoryOperations` 的作用域绑定（scoped）、管理接口（admin.clearAll）
 * 与 clear 空过滤保护。使用记录调用参数的 mock 核心操作，聚焦封装逻辑本身。
 */

import type { HaiResult } from '@h-ai/core'
import type { ChatMessage } from '../src/llm/ai-llm-types.js'
import type {
  MemoryAccessScope,
  MemoryClearOptions,
  MemoryCoreOperations,
  MemoryEntry,
  MemoryEntryInput,
} from '../src/memory/ai-memory-types.js'
import { ok } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryOperations } from '../src/memory/ai-memory-facade.js'

function makeEntry(id: string): MemoryEntry {
  return { id, content: 'x', type: 'fact', importance: 0.5, createdAt: 0, lastAccessedAt: 0, accessCount: 0 }
}

/** 记录参数的 mock 核心操作 */
function createMockCore() {
  const calls = {
    add: vi.fn(async (_entry: MemoryEntryInput): Promise<HaiResult<MemoryEntry>> => ok(makeEntry('m1'))),
    recall: vi.fn(async (): Promise<HaiResult<MemoryEntry[]>> => ok([])),
    extract: vi.fn(async (): Promise<HaiResult<MemoryEntry[]>> => ok([])),
    injectMemories: vi.fn(async (messages: ChatMessage[]): Promise<HaiResult<ChatMessage[]>> => ok(messages)),
    get: vi.fn(async (): Promise<HaiResult<MemoryEntry>> => ok(makeEntry('m1'))),
    update: vi.fn(async (): Promise<HaiResult<MemoryEntry>> => ok(makeEntry('m1'))),
    remove: vi.fn(async (): Promise<HaiResult<void>> => ok(undefined)),
    list: vi.fn(async (): Promise<HaiResult<MemoryEntry[]>> => ok([])),
    listPage: vi.fn(async (): Promise<HaiResult<{ items: MemoryEntry[], total: number }>> => ok({ items: [], total: 0 })),
    clear: vi.fn(async (): Promise<HaiResult<void>> => ok(undefined)),
  }
  const core = calls as unknown as MemoryCoreOperations
  return { core, calls }
}

describe('createMemoryOperations — clear 空过滤保护', () => {
  it('无任何过滤条件的 clear 被拒绝，且不调用核心 clear', async () => {
    const { core, calls } = createMockCore()
    const memory = createMemoryOperations(core)

    const result = await memory.clear()
    expect(result.success).toBe(false)
    expect(calls.clear).not.toHaveBeenCalled()
  })

  it('带 objectId / types / scope 的 clear 透传给核心', async () => {
    const { core, calls } = createMockCore()
    const memory = createMemoryOperations(core)

    const result = await memory.clear({ objectId: 'u-1' })
    expect(result.success).toBe(true)
    expect(calls.clear).toHaveBeenCalledWith({ objectId: 'u-1' })
  })
})

describe('createMemoryOperations — admin.clearAll', () => {
  it('未确认时拒绝，且不调用核心 clear', async () => {
    const { core, calls } = createMockCore()
    const memory = createMemoryOperations(core)

    // @ts-expect-error 故意不传 confirm
    const result = await memory.admin.clearAll({})
    expect(result.success).toBe(false)
    expect(calls.clear).not.toHaveBeenCalled()
  })

  it('confirm:true 时调用核心 clear（无过滤 = 全局清空）', async () => {
    const { core, calls } = createMockCore()
    const memory = createMemoryOperations(core)

    const result = await memory.admin.clearAll({ confirm: true })
    expect(result.success).toBe(true)
    expect(calls.clear).toHaveBeenCalledWith()
  })
})

describe('createMemoryOperations — scoped 绑定', () => {
  it('scoped 操作自动携带 objectId 与 scope', async () => {
    const { core, calls } = createMockCore()
    const memory = createMemoryOperations(core)
    const scoped = memory.scoped({ objectId: 'u-9', scope: { topicId: 't-1' } })

    await scoped.add({ content: 'hi', type: 'fact' })
    expect(calls.add).toHaveBeenCalledWith({ content: 'hi', type: 'fact', objectId: 'u-9', scope: { topicId: 't-1' } })

    await scoped.recall('q')
    expect(calls.recall.mock.calls[0][1]).toMatchObject({ objectId: 'u-9', scope: { topicId: 't-1' } })

    await scoped.list()
    expect(calls.list.mock.calls[0][0]).toMatchObject({ objectId: 'u-9', scope: { topicId: 't-1' } })
  })

  it('scoped 的 get / update / remove 自动施加归属校验（accessScope）', async () => {
    const { core, calls } = createMockCore()
    const memory = createMemoryOperations(core)
    const scoped = memory.scoped({ objectId: 'u-9', scope: { topicId: 't-1' } })
    const expectedScope: MemoryAccessScope = { objectId: 'u-9', scope: { topicId: 't-1' } }

    await scoped.get('m1')
    expect(calls.get).toHaveBeenCalledWith('m1', expectedScope)

    await scoped.remove('m1')
    expect(calls.remove).toHaveBeenCalledWith('m1', expectedScope)

    await scoped.update('m1', { importance: 0.9 })
    expect(calls.update).toHaveBeenCalledWith('m1', { importance: 0.9 }, expectedScope)
  })

  it('scoped 的 clear 永远携带 objectId（不会误清全局）', async () => {
    const { core, calls } = createMockCore()
    const memory = createMemoryOperations(core)
    const scoped = memory.scoped({ objectId: 'u-9' })

    await scoped.clear()
    const clearArg = calls.clear.mock.calls[0][0] as MemoryClearOptions
    expect(clearArg.objectId).toBe('u-9')
  })
})
