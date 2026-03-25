/**
 * AI Memory 子模块单元测试
 *
 * 测试记忆的提取、存储、检索、injectMemories、删除操作，使用 mock LLM / Embedding。
 */

import type { MemoryConfig } from '../src/ai-config.js'
import type { EmbeddingOperations } from '../src/embedding/ai-embedding-types.js'
import type { LLMOperations } from '../src/llm/ai-llm-types.js'
import type { MemoryEntry } from '../src/memory/ai-memory-types.js'
import type { AIRelStore, AIVectorStore } from '../src/store/ai-store-types.js'
import { describe, expect, it, vi } from 'vitest'
import { extractMemories } from '../src/memory/ai-memory-extractor.js'
import { createMemoryOperations } from '../src/memory/ai-memory-functions.js'

// ─── Mock 工厂 ───

/**
 * 创建 Map 支撑的 AIStore mock（测试用）
 */
function createMockStore<T>(): AIRelStore<T> {
  const data = new Map<string, T>()
  return {
    save: vi.fn(async (id: string, value: T) => {
      data.set(id, { ...value as object } as T)
    }),
    saveMany: vi.fn(async (items: Array<{ id: string, data: T }>) => {
      for (const item of items) {
        data.set(item.id, { ...item.data as object } as T)
      }
    }),
    get: vi.fn(async (id: string) => {
      const v = data.get(id)
      return v ? { ...v as object } as T : undefined
    }),
    query: vi.fn(async (filter) => {
      let items = Array.from(data.values())
      if (filter.where) {
        items = items.filter(item => matchesWhere(item, filter.where))
      }
      if (filter.limit !== undefined)
        items = items.slice(0, filter.limit)
      return items
    }),
    queryPage: vi.fn(async (filter, page) => {
      let items = Array.from(data.values())
      if (filter.where) {
        items = items.filter(item => matchesWhere(item, filter.where))
      }
      const total = items.length
      return { items: items.slice(page.offset, page.offset + page.limit), total }
    }),
    remove: vi.fn(async (id: string) => data.delete(id)),
    removeBy: vi.fn(async (filter) => {
      let count = 0
      for (const [id, item] of data.entries()) {
        if (!filter.where || matchesWhere(item, filter.where)) {
          data.delete(id)
          count++
        }
      }
      return count
    }),
    count: vi.fn(async (filter?) => {
      if (!filter?.where)
        return data.size
      return Array.from(data.values()).filter(item => matchesWhere(item, filter.where)).length
    }),
    clear: vi.fn(async (filter?) => {
      if (!filter?.where) {
        data.clear()
        return
      }
      for (const [id, item] of data.entries()) {
        if (matchesWhere(item, filter.where))
          data.delete(id)
      }
    }),
  }
}

/**
 * 创建 Map 支撑的 AIVectorStore mock（测试用）
 */
function createMockVectorStore(): AIVectorStore {
  const vectors = new Map<string, { vector: number[], metadata?: Record<string, unknown> }>()
  return {
    upsert: vi.fn(async (id, vector, metadata) => {
      vectors.set(id, { vector, metadata })
    }),
    search: vi.fn(async (queryVec, options) => {
      const topK = options?.topK ?? 10
      const results: Array<{ id: string, score: number, metadata?: Record<string, unknown> }> = []
      for (const [id, entry] of vectors.entries()) {
        const score = cosineSimilarity(queryVec, entry.vector)
        results.push({ id, score, metadata: entry.metadata })
      }
      results.sort((a, b) => b.score - a.score)
      return results.slice(0, topK)
    }),
    remove: vi.fn(async (id) => { vectors.delete(id) }),
    clear: vi.fn(async () => { vectors.clear() }),
  }
}

interface WhereOps {
  $in?: unknown[]
  $gte?: number
  $gt?: number
  $lte?: number
  $lt?: number
}

function matchesWhere(item: unknown, where: unknown): boolean {
  if (!where)
    return true
  for (const [key, condition] of Object.entries(where as Record<string, unknown>)) {
    const value = (item as Record<string, unknown>)[key]
    if (condition === null || condition === undefined)
      continue
    if (typeof condition === 'object' && !Array.isArray(condition)) {
      const ops = condition as WhereOps
      if (ops.$in !== undefined && !ops.$in.includes(value))
        return false
      if (ops.$gte !== undefined && !((value as number) >= ops.$gte))
        return false
      if (ops.$gt !== undefined && !((value as number) > ops.$gt))
        return false
      if (ops.$lte !== undefined && !((value as number) <= ops.$lte))
        return false
      if (ops.$lt !== undefined && !((value as number) < ops.$lt))
        return false
    }
    else {
      if (value !== condition)
        return false
    }
  }
  return true
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ─── Mock 工厂 ───

function createMockLLM(responses: Array<{ content: string | null }>): LLMOperations {
  let callIndex = 0
  return {
    chat: vi.fn(async () => {
      const resp = responses[callIndex] ?? responses[responses.length - 1]
      callIndex++
      return {
        success: true as const,
        data: {
          id: 'test-id',
          object: 'chat.completion' as const,
          created: Date.now(),
          model: 'test-model',
          choices: [{
            index: 0,
            message: { role: 'assistant' as const, content: resp.content },
            finish_reason: 'stop' as const,
          }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        },
      }
    }),
    chatStream: vi.fn(),
    listModels: vi.fn(),
  } as unknown as LLMOperations
}

function createMockEmbedding(vectors?: number[][]): EmbeddingOperations {
  let callIndex = 0
  return {
    embed: vi.fn(),
    embedText: vi.fn(async () => {
      if (!vectors || vectors.length === 0) {
        return { success: true as const, data: [0.1, 0.2, 0.3] }
      }
      const vec = vectors[callIndex] ?? vectors[vectors.length - 1]
      callIndex++
      return { success: true as const, data: vec }
    }),
    embedBatch: vi.fn(),
  } as unknown as EmbeddingOperations
}

const defaultConfig: MemoryConfig = {
  maxEntries: 100,
  recencyDecay: 0.95,
  embeddingEnabled: true,
  defaultTopK: 10,
}

/**
 * 创建 MemoryOperations 并自动附带内存 store
 */
function createTestMemoryOps(
  config: MemoryConfig,
  llm: LLMOperations,
  embedding: EmbeddingOperations | null,
) {
  const store = createMockStore<MemoryEntry>()
  const vectorStore = createMockVectorStore()
  return createMemoryOperations(config, llm, embedding, store, vectorStore)
}

// ─── extractMemories 测试 ───

describe('extractMemories', () => {
  it('从对话中提取记忆条目', async () => {
    const mockLLM = createMockLLM([{
      content: JSON.stringify([
        { content: '用户喜欢中文', type: 'preference', importance: 0.8 },
        { content: '项目名为 HAI', type: 'fact', importance: 0.9 },
      ]),
    }])

    const messages = [
      { role: 'user' as const, content: '我更喜欢中文回复' },
      { role: 'assistant' as const, content: '好的，我会用中文回复' },
    ]

    const result = await extractMemories(mockLLM, messages)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      expect(result.data[0].content).toBe('用户喜欢中文')
      expect(result.data[0].type).toBe('preference')
    }
  })

  it('空对话返回空列表', async () => {
    const mockLLM = createMockLLM([{ content: '[]' }])
    const result = await extractMemories(mockLLM, [])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(0)
    }
  })

  it('去除 markdown 围栏后解析', async () => {
    const mockLLM = createMockLLM([{
      content: '```json\n[{"content":"记忆","type":"fact","importance":0.5}]\n```',
    }])

    const result = await extractMemories(mockLLM, [
      { role: 'user' as const, content: '测试' },
    ])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
    }
  })

  it('按 minImportance 过滤', async () => {
    const mockLLM = createMockLLM([{
      content: JSON.stringify([
        { content: '低重要性', type: 'fact', importance: 0.2 },
        { content: '高重要性', type: 'fact', importance: 0.9 },
      ]),
    }])

    const result = await extractMemories(mockLLM, [
      { role: 'user' as const, content: '测试' },
    ], { minImportance: 0.5 })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].content).toBe('高重要性')
    }
  })

  it('支持自定义 systemPrompt', async () => {
    const mockLLM = createMockLLM([{
      content: JSON.stringify([
        { content: '用户偏好中文', type: 'preference', importance: 0.8 },
      ]),
    }])

    const result = await extractMemories(mockLLM, [
      { role: 'user' as const, content: '请记住我喜欢中文回复。' },
    ], {
      systemPrompt: 'Only extract durable user preferences.',
    })

    expect(result.success).toBe(true)
    expect(mockLLM.chat).toHaveBeenCalledOnce()

    const [request] = vi.mocked(mockLLM.chat).mock.calls[0] ?? []
    expect(request?.messages[0]).toEqual({
      role: 'system',
      content: 'Only extract durable user preferences.',
    })
  })

  it('lLM 调用失败返回错误', async () => {
    const failingLLM: LLMOperations = {
      chat: vi.fn(async () => ({
        success: false as const,
        error: { code: 7000, message: 'LLM failed' },
      })),
      chatStream: vi.fn(),
      listModels: vi.fn(),
    } as unknown as LLMOperations

    const result = await extractMemories(failingLLM, [
      { role: 'user' as const, content: '测试' },
    ])
    expect(result.success).toBe(false)
  })
})

// ─── createMemoryOperations 测试 ───

describe('createMemoryOperations', () => {
  it('add 手动添加记忆', async () => {
    const llm = createMockLLM([])
    const embedding = createMockEmbedding()
    const ops = createTestMemoryOps(defaultConfig, llm, embedding)

    const result = await ops.add({ content: '手动记忆', type: 'fact', importance: 0.7 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.content).toBe('手动记忆')
      expect(result.data.importance).toBe(0.7)
      expect(result.data.id).toMatch(/^mem_/)
    }
  })

  it('extract 从对话中提取并存储记忆', async () => {
    const llm = createMockLLM([{
      content: JSON.stringify([
        { content: '提取到的记忆', type: 'fact', importance: 0.8 },
      ]),
    }])
    const embedding = createMockEmbedding()
    const ops = createTestMemoryOps(defaultConfig, llm, embedding)

    const result = await ops.extract([
      { role: 'user' as const, content: '我是张三' },
      { role: 'assistant' as const, content: '你好张三' },
    ])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].content).toBe('提取到的记忆')
    }

    // 验证已存储
    const listResult = await ops.list()
    expect(listResult.success).toBe(true)
    if (listResult.success) {
      expect(listResult.data).toHaveLength(1)
    }
  })

  it('extract 支持通过 options.systemPrompt 覆盖模块默认提示词', async () => {
    const llm = createMockLLM([{
      content: JSON.stringify([
        { content: '提取到的偏好', type: 'preference', importance: 0.9 },
      ]),
    }])
    const embedding = createMockEmbedding()
    const ops = createTestMemoryOps({
      ...defaultConfig,
      systemPrompt: 'Use configured memory extraction prompt.',
    }, llm, embedding)

    const result = await ops.extract([
      { role: 'user' as const, content: '请记住我喜欢中文回复。' },
    ], {
      systemPrompt: 'Only extract durable user preferences.',
    })

    expect(result.success).toBe(true)
    expect(llm.chat).toHaveBeenCalledOnce()

    const [request] = vi.mocked(llm.chat).mock.calls[0] ?? []
    expect(request?.messages[0]).toEqual({
      role: 'system',
      content: 'Only extract durable user preferences.',
    })
  })

  it('recall 检索相关记忆', async () => {
    const llm = createMockLLM([])
    const embedding = createMockEmbedding([
      [0.9, 0.1, 0.0], // 第一条记忆的向量
      [0.1, 0.9, 0.0], // 第二条记忆的向量
      [0.85, 0.15, 0.0], // 查询向量（与第一条接近）
    ])
    const ops = createTestMemoryOps(defaultConfig, llm, embedding)

    await ops.add({ content: '用户偏好中文', type: 'preference', importance: 0.8 })
    await ops.add({ content: '项目是 Python', type: 'fact', importance: 0.6 })

    const result = await ops.recall('语言偏好', { topK: 1 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].content).toBe('用户偏好中文')
    }
  })

  it('recall 无记忆时返回空列表', async () => {
    const llm = createMockLLM([])
    const ops = createTestMemoryOps(defaultConfig, llm, null)

    const result = await ops.recall('查询')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(0)
    }
  })

  it('injectMemories 注入记忆到消息列表（system 位置）', async () => {
    const llm = createMockLLM([])
    const ops = createTestMemoryOps({ ...defaultConfig, embeddingEnabled: false }, llm, null)

    await ops.add({ content: '用户叫张三', type: 'fact', importance: 0.9 })

    const messages = [
      { role: 'system' as const, content: '你是一个助手' },
      { role: 'user' as const, content: '你好' },
    ]

    const result = await ops.injectMemories(messages, { topK: 5, position: 'system' })
    expect(result.success).toBe(true)
    if (result.success) {
      const systemMsg = result.data.find(m => m.role === 'system')
      expect(systemMsg).toBeDefined()
      expect((systemMsg as { content: string }).content).toContain('张三')
    }
  })

  it('injectMemories 无用户消息时原样返回', async () => {
    const llm = createMockLLM([])
    const ops = createTestMemoryOps(defaultConfig, llm, null)

    const messages = [
      { role: 'system' as const, content: '系统提示' },
    ]
    const result = await ops.injectMemories(messages)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(messages)
    }
  })

  it('remove 删除记忆', async () => {
    const llm = createMockLLM([])
    const ops = createTestMemoryOps(defaultConfig, llm, null)

    const addResult = await ops.add({ content: '待删除', type: 'fact' })
    expect(addResult.success).toBe(true)
    if (!addResult.success)
      return

    const removeResult = await ops.remove(addResult.data.id)
    expect(removeResult.success).toBe(true)

    const listResult = await ops.list()
    expect(listResult.success).toBe(true)
    if (listResult.success) {
      expect(listResult.data).toHaveLength(0)
    }
  })

  it('remove 不存在的记忆返回错误', async () => {
    const llm = createMockLLM([])
    const ops = createTestMemoryOps(defaultConfig, llm, null)

    const result = await ops.remove('non-existent')
    expect(result.success).toBe(false)
  })

  it('list 支持按类型过滤', async () => {
    const llm = createMockLLM([])
    const ops = createTestMemoryOps(defaultConfig, llm, null)

    await ops.add({ content: '事实', type: 'fact' })
    await ops.add({ content: '偏好', type: 'preference' })

    const result = await ops.list({ types: ['preference'] })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].type).toBe('preference')
    }
  })

  it('clear 按类型清空', async () => {
    const llm = createMockLLM([])
    const ops = createTestMemoryOps(defaultConfig, llm, null)

    await ops.add({ content: '事实', type: 'fact' })
    await ops.add({ content: '偏好', type: 'preference' })

    const clearResult = await ops.clear({ types: ['fact'] })
    expect(clearResult.success).toBe(true)

    const listResult = await ops.list()
    expect(listResult.success).toBe(true)
    if (listResult.success) {
      expect(listResult.data).toHaveLength(1)
      expect(listResult.data[0].type).toBe('preference')
    }
  })

  it('clear 全部清空', async () => {
    const llm = createMockLLM([])
    const ops = createTestMemoryOps(defaultConfig, llm, null)

    await ops.add({ content: '记忆1', type: 'fact' })
    await ops.add({ content: '记忆2', type: 'preference' })

    await ops.clear()

    const listResult = await ops.list()
    expect(listResult.success).toBe(true)
    if (listResult.success) {
      expect(listResult.data).toHaveLength(0)
    }
  })

  it('embeddingEnabled 为 false 时使用关键词匹配', async () => {
    const llm = createMockLLM([])
    const ops = createTestMemoryOps({ ...defaultConfig, embeddingEnabled: false }, llm, null)

    await ops.add({ content: '用户偏好中文交流', type: 'preference', importance: 0.8 })
    await ops.add({ content: '项目使用 TypeScript', type: 'fact', importance: 0.6 })

    const result = await ops.recall('中文')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0)
      expect(result.data[0].content).toContain('中文')
    }
  })

  // ─── update 方法测试 ───

  it('update 修改 content', async () => {
    const llm = createMockLLM([])
    const embedding = createMockEmbedding()
    const ops = createTestMemoryOps(defaultConfig, llm, embedding)

    const addResult = await ops.add({ content: '旧内容', type: 'fact', importance: 0.5 })
    expect(addResult.success).toBe(true)
    if (!addResult.success)
      return

    const memoryId = addResult.data.id
    const updateResult = await ops.update(memoryId, { content: '新内容' })
    expect(updateResult.success).toBe(true)
    if (updateResult.success) {
      expect(updateResult.data.content).toBe('新内容')
      expect(updateResult.data.id).toBe(memoryId)
    }
  })

  it('update 修改 importance', async () => {
    const llm = createMockLLM([])
    const embedding = createMockEmbedding()
    const ops = createTestMemoryOps(defaultConfig, llm, embedding)

    const addResult = await ops.add({ content: '记忆', type: 'fact', importance: 0.3 })
    expect(addResult.success).toBe(true)
    if (!addResult.success)
      return

    const memoryId = addResult.data.id
    const updateResult = await ops.update(memoryId, { importance: 0.9 })
    expect(updateResult.success).toBe(true)
    if (updateResult.success) {
      expect(updateResult.data.importance).toBe(0.9)
      expect(updateResult.data.content).toBe('记忆') // content 不变
    }
  })

  it('update 不存在的记忆返回错误', async () => {
    const llm = createMockLLM([])
    const embedding = createMockEmbedding()
    const ops = createTestMemoryOps(defaultConfig, llm, embedding)

    const result = await ops.update('non-existent-id', { content: '新内容' })
    expect(result.success).toBe(false)
  })
})
