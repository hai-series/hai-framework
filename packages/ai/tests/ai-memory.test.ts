/**
 * AI Memory 子模块单元测试
 *
 * 测试记忆的提取、存储、检索、injectMemories、删除操作，使用 mock LLM / Embedding。
 */

import type { MemoryConfig } from '../src/ai-config.js'
import type { EmbeddingOperations } from '../src/embedding/ai-embedding-types.js'
import type { LLMOperations } from '../src/llm/ai-llm-types.js'
import type { MemoryEntry } from '../src/memory/ai-memory-types.js'
import { describe, expect, it, vi } from 'vitest'
import { extractMemories } from '../src/memory/ai-memory-extractor.js'
import { createMemoryOperations } from '../src/memory/ai-memory-functions.js'
import { InMemoryAIStore, InMemoryVectorStore } from '../src/store/ai-store-memory.js'

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
  const store = new InMemoryAIStore<MemoryEntry>()
  const vectorStore = new InMemoryVectorStore()
  return createMemoryOperations(config, llm, embedding, store, vectorStore)
}

// ─── InMemoryAIStore 测试 ───

describe('inMemoryAIStore', () => {
  it('save 和 get', async () => {
    const store = new InMemoryAIStore<MemoryEntry>()
    const entry: MemoryEntry = {
      id: 'mem_1',
      content: '用户喜欢中文',
      type: 'preference',
      importance: 0.8,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
    }

    await store.save('mem_1', entry)
    const retrieved = await store.get('mem_1')

    expect(retrieved).toBeDefined()
    expect(retrieved!.content).toBe('用户喜欢中文')
    expect(retrieved!.type).toBe('preference')
  })

  it('query 按 where 过滤', async () => {
    const store = new InMemoryAIStore<MemoryEntry>()
    const now = Date.now()
    await store.save('1', { id: '1', content: '事实', type: 'fact', importance: 0.5, createdAt: now, lastAccessedAt: now, accessCount: 0 })
    await store.save('2', { id: '2', content: '偏好', type: 'preference', importance: 0.5, createdAt: now, lastAccessedAt: now, accessCount: 0 })

    const facts = await store.query({ where: { type: 'fact' } })
    expect(facts).toHaveLength(1)
    expect(facts[0].type).toBe('fact')
  })

  it('remove 删除记录', async () => {
    const store = new InMemoryAIStore<MemoryEntry>()
    const now = Date.now()
    await store.save('1', { id: '1', content: '待删除', type: 'fact', importance: 0.5, createdAt: now, lastAccessedAt: now, accessCount: 0 })

    const removed = await store.remove('1')
    expect(removed).toBe(true)
    expect(await store.get('1')).toBeUndefined()
  })

  it('clear 清空全部', async () => {
    const store = new InMemoryAIStore<MemoryEntry>()
    const now = Date.now()
    await store.save('1', { id: '1', content: '条目1', type: 'fact', importance: 0.5, createdAt: now, lastAccessedAt: now, accessCount: 0 })
    await store.save('2', { id: '2', content: '条目2', type: 'fact', importance: 0.5, createdAt: now, lastAccessedAt: now, accessCount: 0 })

    await store.clear()
    expect(await store.count()).toBe(0)
  })

  it('queryPage 分页查询', async () => {
    const store = new InMemoryAIStore<MemoryEntry>()
    const now = Date.now()
    for (let i = 0; i < 5; i++) {
      await store.save(`${i}`, { id: `${i}`, content: `条目${i}`, type: 'fact', importance: 0.5, createdAt: now + i, lastAccessedAt: now, accessCount: 0 })
    }

    const page = await store.queryPage({}, { offset: 1, limit: 2 })
    expect(page.items).toHaveLength(2)
    expect(page.total).toBe(5)
  })

  it('query 使用 $in 操作符过滤', async () => {
    const store = new InMemoryAIStore<MemoryEntry>()
    const now = Date.now()
    await store.save('1', { id: '1', content: '事实', type: 'fact', importance: 0.5, createdAt: now, lastAccessedAt: now, accessCount: 0 })
    await store.save('2', { id: '2', content: '偏好', type: 'preference', importance: 0.5, createdAt: now, lastAccessedAt: now, accessCount: 0 })
    await store.save('3', { id: '3', content: '实体', type: 'entity', importance: 0.5, createdAt: now, lastAccessedAt: now, accessCount: 0 })

    const results = await store.query({ where: { type: { $in: ['fact', 'preference'] } } })
    expect(results).toHaveLength(2)
    expect(results.map(r => r.type).sort()).toEqual(['fact', 'preference'])
  })

  it('query 使用 $gte 操作符过滤', async () => {
    const store = new InMemoryAIStore<MemoryEntry>()
    const now = Date.now()
    await store.save('1', { id: '1', content: '低', type: 'fact', importance: 0.2, createdAt: now, lastAccessedAt: now, accessCount: 0 })
    await store.save('2', { id: '2', content: '中', type: 'fact', importance: 0.5, createdAt: now, lastAccessedAt: now, accessCount: 0 })
    await store.save('3', { id: '3', content: '高', type: 'fact', importance: 0.8, createdAt: now, lastAccessedAt: now, accessCount: 0 })

    const results = await store.query({ where: { importance: { $gte: 0.5 } } })
    expect(results).toHaveLength(2)
    expect(results.every(r => r.importance >= 0.5)).toBe(true)
  })

  it('query 使用 $gt / $lt 操作符过滤', async () => {
    const store = new InMemoryAIStore<MemoryEntry>()
    const now = Date.now()
    await store.save('1', { id: '1', content: '低', type: 'fact', importance: 0.2, createdAt: now, lastAccessedAt: now, accessCount: 0 })
    await store.save('2', { id: '2', content: '中', type: 'fact', importance: 0.5, createdAt: now, lastAccessedAt: now, accessCount: 0 })
    await store.save('3', { id: '3', content: '高', type: 'fact', importance: 0.8, createdAt: now, lastAccessedAt: now, accessCount: 0 })

    const results = await store.query({ where: { importance: { $gt: 0.2, $lt: 0.8 } } })
    expect(results).toHaveLength(1)
    expect(results[0].importance).toBe(0.5)
  })

  it('query 使用 $lte 操作符过滤', async () => {
    const store = new InMemoryAIStore<MemoryEntry>()
    const now = Date.now()
    await store.save('1', { id: '1', content: '低', type: 'fact', importance: 0.2, createdAt: now, lastAccessedAt: now, accessCount: 0 })
    await store.save('2', { id: '2', content: '中', type: 'fact', importance: 0.5, createdAt: now, lastAccessedAt: now, accessCount: 0 })
    await store.save('3', { id: '3', content: '高', type: 'fact', importance: 0.8, createdAt: now, lastAccessedAt: now, accessCount: 0 })

    const results = await store.query({ where: { importance: { $lte: 0.5 } } })
    expect(results).toHaveLength(2)
    expect(results.every(r => r.importance <= 0.5)).toBe(true)
  })

  it('query 组合等值与操作符条件', async () => {
    const store = new InMemoryAIStore<MemoryEntry>()
    const now = Date.now()
    await store.save('1', { id: '1', content: '高重要事实', type: 'fact', importance: 0.8, createdAt: now, lastAccessedAt: now, accessCount: 0 })
    await store.save('2', { id: '2', content: '低重要事实', type: 'fact', importance: 0.2, createdAt: now, lastAccessedAt: now, accessCount: 0 })
    await store.save('3', { id: '3', content: '高重要偏好', type: 'preference', importance: 0.8, createdAt: now, lastAccessedAt: now, accessCount: 0 })

    // 等值 type + 范围 importance
    const results = await store.query({ where: { type: 'fact', importance: { $gte: 0.5 } } })
    expect(results).toHaveLength(1)
    expect(results[0].content).toBe('高重要事实')
  })

  it('removeBy 使用操作符条件', async () => {
    const store = new InMemoryAIStore<MemoryEntry>()
    const now = Date.now()
    await store.save('1', { id: '1', content: '低', type: 'fact', importance: 0.2, createdAt: now, lastAccessedAt: now, accessCount: 0 })
    await store.save('2', { id: '2', content: '高', type: 'fact', importance: 0.8, createdAt: now, lastAccessedAt: now, accessCount: 0 })

    const removed = await store.removeBy({ where: { importance: { $lt: 0.5 } } })
    expect(removed).toBe(1)
    expect(await store.count()).toBe(1)
    expect((await store.get('2'))!.importance).toBe(0.8)
  })

  it('count 使用操作符条件', async () => {
    const store = new InMemoryAIStore<MemoryEntry>()
    const now = Date.now()
    await store.save('1', { id: '1', content: '事实', type: 'fact', importance: 0.5, createdAt: now, lastAccessedAt: now, accessCount: 0 })
    await store.save('2', { id: '2', content: '偏好', type: 'preference', importance: 0.5, createdAt: now, lastAccessedAt: now, accessCount: 0 })
    await store.save('3', { id: '3', content: '实体', type: 'entity', importance: 0.5, createdAt: now, lastAccessedAt: now, accessCount: 0 })

    const cnt = await store.count({ where: { type: { $in: ['fact', 'entity'] } } })
    expect(cnt).toBe(2)
  })
})

// ─── InMemoryVectorStore 测试 ───

describe('inMemoryVectorStore', () => {
  it('upsert 和 search', async () => {
    const store = new InMemoryVectorStore()
    await store.upsert('1', [0.9, 0.1, 0.0], { type: 'fact' })
    await store.upsert('2', [0.1, 0.9, 0.0], { type: 'preference' })

    const results = await store.search([0.85, 0.15, 0.0], { topK: 1 })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('1')
    expect(results[0].score).toBeGreaterThan(0.9)
  })

  it('remove 删除向量', async () => {
    const store = new InMemoryVectorStore()
    await store.upsert('1', [0.9, 0.1, 0.0])
    await store.remove('1')

    const results = await store.search([0.9, 0.1, 0.0])
    expect(results).toHaveLength(0)
  })

  it('clear 清空全部', async () => {
    const store = new InMemoryVectorStore()
    await store.upsert('1', [0.9, 0.1, 0.0])
    await store.upsert('2', [0.1, 0.9, 0.0])

    await store.clear()
    const results = await store.search([0.9, 0.1, 0.0])
    expect(results).toHaveLength(0)
  })
})

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
})
