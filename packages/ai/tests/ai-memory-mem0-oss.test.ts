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
})
