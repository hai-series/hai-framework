/**
 * Mem0 OSS Memory Provider 单元测试
 *
 * 通过 mock `mem0ai/oss` 验证配置映射（LLM / Embedder / VectorStore）与操作转换，
 * 不加载真实 mem0 引擎。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AIConfigSchema, MemoryConfigSchema } from '../src/ai-config.js'
import { createMem0OssMemoryOperations } from '../src/memory/providers/ai-memory-provider-mem0-oss.js'

const memoryMock = vi.hoisted(() => ({
  add: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  search: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  get: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getAll: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  update: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  delete: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  deleteAll: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  reset: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
const memoryCtorMock = vi.hoisted(() => vi.fn())

vi.mock('mem0ai/oss', () => {
  class Memory {
    constructor(config: unknown) {
      memoryCtorMock(config)
      return memoryMock as unknown as Memory
    }
  }
  return { Memory }
})

const aiConfig = AIConfigSchema.parse({ llm: { apiKey: 'sk-test', model: 'gpt-4o-mini', baseUrl: 'https://api.example.com/v1' } })
const memoryConfig = MemoryConfigSchema.parse({ provider: 'mem0' })

function createOps(vectorBackend?: { type: string, url?: string, apiKey?: string }) {
  return createMem0OssMemoryOperations({
    config: memoryConfig,
    aiConfig,
    collectionName: 'hai_ai_memory',
    embeddingDims: 1536,
    vectorBackend,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  memoryMock.add.mockResolvedValue({ results: [] })
  memoryMock.search.mockResolvedValue({ results: [] })
  memoryMock.getAll.mockResolvedValue({ results: [] })
  memoryMock.get.mockResolvedValue(null)
  memoryMock.update.mockResolvedValue({ message: 'ok' })
  memoryMock.delete.mockResolvedValue({ message: 'ok' })
  memoryMock.deleteAll.mockResolvedValue({ message: 'ok' })
  memoryMock.reset.mockResolvedValue(undefined)
})

describe('createMem0OssMemoryOperations', () => {
  it('从 AIConfig 提取 openai LLM / Embedder 配置', async () => {
    await createOps()

    const config = memoryCtorMock.mock.calls[0]?.[0] as {
      llm: { provider: string, config: Record<string, unknown> }
      embedder: { provider: string, config: Record<string, unknown> }
      disableHistory?: boolean
    }
    expect(config.llm.provider).toBe('openai')
    expect(config.llm.config.apiKey).toBe('sk-test')
    expect(config.llm.config.baseURL).toBe('https://api.example.com/v1')
    expect(config.embedder.provider).toBe('openai')
    expect(config.embedder.config.embeddingDims).toBe(1536)
    expect(config.disableHistory).toBe(true)
  })

  it('无后端时向量库退回 mem0 自带 memory 存储', async () => {
    await createOps()
    const config = memoryCtorMock.mock.calls[0]?.[0] as { vectorStore: { provider: string } }
    expect(config.vectorStore.provider).toBe('memory')
  })

  it('qdrant 后端映射为 mem0 qdrant 向量库', async () => {
    await createOps({ type: 'qdrant', url: 'http://localhost:6333', apiKey: 'qk' })
    const config = memoryCtorMock.mock.calls[0]?.[0] as { vectorStore: { provider: string, config: Record<string, unknown> } }
    expect(config.vectorStore.provider).toBe('qdrant')
    expect(config.vectorStore.config.url).toBe('http://localhost:6333')
    expect(config.vectorStore.config.apiKey).toBe('qk')
    expect(config.vectorStore.config.collectionName).toBe('hai_ai_memory')
  })

  it('extract 调用 mem0.add(infer: true) 并映射结果', async () => {
    memoryMock.add.mockResolvedValue({ results: [{ id: 'm1', memory: '用户喜欢中文', metadata: {} }] })
    const ops = await createOps()

    const result = await ops.extract([{ role: 'user', content: '我喜欢中文' }], { objectId: 'u1' })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data).toHaveLength(1)
    expect(result.data[0].content).toBe('用户喜欢中文')
    expect(memoryMock.add).toHaveBeenCalledWith(
      [{ role: 'user', content: '我喜欢中文' }],
      expect.objectContaining({ userId: 'u1', infer: true }),
    )
  })

  it('recall 调用 mem0.search 并按 importance 过滤', async () => {
    memoryMock.search.mockResolvedValue({ results: [
      { id: 'm1', memory: '高', score: 0.9, metadata: { hai_importance: 0.8 } },
      { id: 'm2', memory: '低', score: 0.5, metadata: { hai_importance: 0.1 } },
    ] })
    const ops = await createOps()

    const result = await ops.recall('q', { objectId: 'u1', minImportance: 0.5 })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data).toHaveLength(1)
    expect(result.data[0].content).toBe('高')
  })

  it('add 调用 mem0.add(infer: false) 并保留 hai 字段', async () => {
    memoryMock.add.mockResolvedValue({ results: [{ id: 'm2', memory: '手动记忆', metadata: { hai_type: 'fact', hai_importance: 0.7 } }] })
    const ops = await createOps()

    const result = await ops.add({ content: '手动记忆', type: 'fact', importance: 0.7, objectId: 'u1' })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.type).toBe('fact')
    expect(result.data.importance).toBe(0.7)
    expect(memoryMock.add).toHaveBeenCalledWith(
      [{ role: 'user', content: '手动记忆' }],
      expect.objectContaining({ infer: false }),
    )
  })

  it('get 命中返回条目，未命中返回 MEMORY_NOT_FOUND', async () => {
    const ops = await createOps()

    memoryMock.get.mockResolvedValueOnce({ id: 'm1', memory: 'x', metadata: {} })
    const hit = await ops.get('m1')
    expect(hit.success && hit.data.id).toBe('m1')

    memoryMock.get.mockResolvedValueOnce(null)
    const miss = await ops.get('nope')
    expect(miss.success).toBe(false)
  })

  it('remove 调用 mem0.delete', async () => {
    const ops = await createOps()
    const result = await ops.remove('m1')
    expect(result.success).toBe(true)
    expect(memoryMock.delete).toHaveBeenCalledWith('m1')
  })

  it('clear 带 objectId 调用 deleteAll，不带则 reset', async () => {
    const ops = await createOps()

    await ops.clear({ objectId: 'u1' })
    expect(memoryMock.deleteAll).toHaveBeenCalledWith({ userId: 'u1' })

    await ops.clear()
    expect(memoryMock.reset).toHaveBeenCalled()
  })

  it('recall 按 scope 严格过滤（issue #6，不召回其他主题/角色）', async () => {
    memoryMock.search.mockResolvedValue({ results: [
      { id: 'a', memory: '主题A', score: 0.9, metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'A' } } },
      { id: 'b', memory: '主题B', score: 0.8, metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'B' } } },
      { id: 'c', memory: '无作用域', score: 0.7, metadata: { hai_object_id: 'u1' } },
    ] })
    const ops = await createOps()

    const result = await ops.recall('q', { objectId: 'u1', scope: { topicId: 'A' } })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.map(e => e.content)).toEqual(['主题A'])
  })

  it('recall 兜底按 objectId 隔离（issue #10，过滤掉非归属条目）', async () => {
    memoryMock.search.mockResolvedValue({ results: [
      { id: 'a', memory: '属于 u1', score: 0.9, metadata: { hai_object_id: 'u1' } },
      { id: 'x', memory: '属于 u2', score: 0.8, metadata: { hai_object_id: 'u2' } },
    ] })
    const ops = await createOps()

    const result = await ops.recall('q', { objectId: 'u1' })
    expect(result.success && result.data.map(e => e.content)).toEqual(['属于 u1'])
  })

  it('add 完整保留业务 metadata（issue #9）与归属主体（issue #10）', async () => {
    memoryMock.add.mockResolvedValue({ results: [{ id: 'm9', memory: '记忆', metadata: { hai_object_id: 'u1' } }] })
    const ops = await createOps()
    await ops.add({
      content: '记忆',
      type: 'event',
      importance: 0.6,
      objectId: 'u1',
      scope: { topicId: 'A', personaId: 'p1' },
      metadata: { speakerId: 's1', turnId: 't9', interrupted: true },
    })

    const [, addOptions] = memoryMock.add.mock.calls[0] as [unknown, { metadata: Record<string, unknown> }]
    expect(addOptions.metadata.hai_object_id).toBe('u1')
    expect(addOptions.metadata.hai_scope).toEqual({ topicId: 'A', personaId: 'p1' })
    expect(addOptions.metadata.hai_metadata).toEqual({ speakerId: 's1', turnId: 't9', interrupted: true })
  })

  it('get 还原准确的 objectId 与完整 metadata（issue #9/#10）', async () => {
    memoryMock.get.mockResolvedValue({
      id: 'm1',
      memory: '记忆',
      metadata: { hai_object_id: 'u7', hai_type: 'event', hai_importance: 0.6, hai_metadata: { speakerId: 's1', topicId: 'A' } },
    })
    const ops = await createOps()

    const result = await ops.get('m1')
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.objectId).toBe('u7')
    expect(result.data.type).toBe('event')
    expect(result.data.metadata).toEqual({ speakerId: 's1', topicId: 'A' })
  })

  it('update 涉及 type/importance/metadata 时删除重建并合并（issue #8）', async () => {
    memoryMock.get.mockResolvedValue({
      id: 'm1',
      memory: '旧内容',
      createdAt: new Date('2024-01-01').toISOString(),
      metadata: { hai_object_id: 'u1', hai_type: 'fact', hai_importance: 0.5, hai_metadata: { a: 1 } },
    })
    memoryMock.add.mockResolvedValue({ results: [{ id: 'm2', memory: '旧内容', metadata: { hai_object_id: 'u1', hai_type: 'preference', hai_importance: 0.9, hai_metadata: { a: 1, b: 2 } } }] })
    const ops = await createOps()

    const result = await ops.update('m1', { type: 'preference', importance: 0.9, metadata: { a: 1, b: 2 } })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(memoryMock.delete).toHaveBeenCalledWith('m1')
    expect(result.data.type).toBe('preference')
    expect(result.data.importance).toBe(0.9)
    expect(result.data.metadata).toEqual({ a: 1, b: 2 })
    const [, addOptions] = memoryMock.add.mock.calls[0] as [unknown, { metadata: Record<string, unknown> }]
    expect(addOptions.metadata.hai_type).toBe('preference')
  })

  it('update 仅改 content 时原地更新，保持 memoryId 稳定（issue #8）', async () => {
    memoryMock.get.mockResolvedValue({ id: 'm1', memory: '新内容', metadata: { hai_object_id: 'u1', hai_type: 'fact' } })
    const ops = await createOps()

    const result = await ops.update('m1', { content: '新内容' })
    expect(result.success).toBe(true)
    expect(memoryMock.update).toHaveBeenCalledWith('m1', '新内容')
    expect(memoryMock.delete).not.toHaveBeenCalled()
  })

  it('clear 含 types 时逐条删除匹配项，不误删整个主体（issue #7）', async () => {
    memoryMock.getAll.mockResolvedValue({ results: [
      { id: 'e1', memory: '事件', metadata: { hai_object_id: 'u1', hai_type: 'event' } },
      { id: 'f1', memory: '事实', metadata: { hai_object_id: 'u1', hai_type: 'fact' } },
    ] })
    const ops = await createOps()

    await ops.clear({ objectId: 'u1', types: ['event'] })
    expect(memoryMock.deleteAll).not.toHaveBeenCalled()
    expect(memoryMock.reset).not.toHaveBeenCalled()
    expect(memoryMock.delete).toHaveBeenCalledTimes(1)
    expect(memoryMock.delete).toHaveBeenCalledWith('e1')
  })

  it('clear 仅含 types（无 objectId）也不触发 reset（issue #7 破坏性防护）', async () => {
    memoryMock.getAll.mockResolvedValue({ results: [
      { id: 'e1', memory: '事件', metadata: { hai_object_id: 'hai-global', hai_type: 'event' } },
    ] })
    const ops = await createOps()

    await ops.clear({ types: ['event'] })
    expect(memoryMock.reset).not.toHaveBeenCalled()
    expect(memoryMock.delete).toHaveBeenCalledWith('e1')
  })

  it('listPage 按 scope 过滤后分页（issue #11）', async () => {
    memoryMock.getAll.mockResolvedValue({ results: [
      { id: 'a', memory: '1', metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'A' } } },
      { id: 'b', memory: '2', metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'B' } } },
      { id: 'c', memory: '3', metadata: { hai_object_id: 'u1', hai_scope: { topicId: 'A' } } },
    ] })
    const ops = await createOps()

    const result = await ops.listPage({ objectId: 'u1', scope: { topicId: 'A' }, offset: 0, limit: 10 })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.total).toBe(2)
    expect(result.data.items.map(e => e.content)).toEqual(['1', '3'])
  })
})
