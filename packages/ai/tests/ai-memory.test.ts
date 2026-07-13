/**
 * AI Memory 子模块单元测试
 *
 * 测试记忆的提取、存储、检索、injectMemories、删除操作，使用 mock LLM / Embedding。
 */

import type { MemoryConfig } from '../src/ai-config.js'
import type { EmbeddingOperations } from '../src/embedding/ai-embedding-types.js'
import type { LLMOperations } from '../src/llm/ai-llm-types.js'
import type { MemoryEntry } from '../src/memory/ai-memory-types.js'
import type { AIRelStore, AIVectorStore, StoreFilter, StorePage, StoreScope } from '../src/store/ai-store-types.js'
import { describe, expect, it, vi } from 'vitest'
import { extractMemories } from '../src/memory/ai-memory-extractor.js'
import { createMemoryOperations } from '../src/memory/ai-memory-functions.js'

// ─── Mock 工厂 ───

/**
 * 创建 Map 支撑的 AIStore mock（测试用）
 */
interface MockStoreRecord<T> {
  data: T
  scope?: StoreScope
}

function cloneStoreValue<T>(value: T): T {
  return { ...value as object } as T
}

function matchesStoreFilter<T>(record: MockStoreRecord<T>, filter?: StoreFilter<T>): boolean {
  if (!filter)
    return true

  if (filter.objectId !== undefined && record.scope?.objectId !== filter.objectId)
    return false
  if (filter.sessionId !== undefined && record.scope?.sessionId !== filter.sessionId)
    return false
  if (filter.refId !== undefined && record.scope?.refId !== filter.refId)
    return false
  if (filter.status !== undefined) {
    const expected = Array.isArray(filter.status) ? filter.status : [filter.status]
    if (!expected.includes(record.scope?.status ?? ''))
      return false
  }

  if (filter.where && !matchesWhere(record.data, filter.where))
    return false

  return true
}

function sortByOrder<T>(items: T[], orderBy?: StoreFilter<T>['orderBy']): T[] {
  if (!orderBy)
    return items

  return [...items].sort((a, b) => {
    const left = (a as Record<string, unknown>)[orderBy.field as string]
    const right = (b as Record<string, unknown>)[orderBy.field as string]
    if (left === right)
      return 0
    if (left == null)
      return orderBy.direction === 'asc' ? -1 : 1
    if (right == null)
      return orderBy.direction === 'asc' ? 1 : -1
    return orderBy.direction === 'asc'
      ? (left > right ? 1 : -1)
      : (left > right ? -1 : 1)
  })
}

function createMockStore<T>(): AIRelStore<T> {
  const data = new Map<string, MockStoreRecord<T>>()
  return {
    save: vi.fn(async (id: string, value: T, scope?: StoreScope) => {
      data.set(id, { data: cloneStoreValue(value), scope: scope ? { ...scope } : undefined })
    }),
    saveMany: vi.fn(async (items: Array<{ id: string, data: T, scope?: StoreScope }>) => {
      for (const item of items) {
        data.set(item.id, {
          data: cloneStoreValue(item.data),
          scope: item.scope ? { ...item.scope } : undefined,
        })
      }
    }),
    get: vi.fn(async (id: string) => {
      const record = data.get(id)
      return record ? cloneStoreValue(record.data) : undefined
    }),
    query: vi.fn(async (filter: StoreFilter<T>) => {
      let items = Array.from(data.values())
        .filter(record => matchesStoreFilter(record, filter))
        .map(record => cloneStoreValue(record.data))
      items = sortByOrder(items, filter.orderBy)
      if (filter.limit !== undefined)
        items = items.slice(0, filter.limit)
      return items
    }),
    queryPage: vi.fn(async (filter: StoreFilter<T>, page: { offset: number, limit: number }): Promise<StorePage<T>> => {
      let items = Array.from(data.values())
        .filter(record => matchesStoreFilter(record, filter))
        .map(record => cloneStoreValue(record.data))
      items = sortByOrder(items, filter.orderBy)
      const total = items.length
      return { items: items.slice(page.offset, page.offset + page.limit), total }
    }),
    remove: vi.fn(async (id: string) => data.delete(id)),
    removeBy: vi.fn(async (filter: StoreFilter<T>) => {
      let count = 0
      for (const [id, record] of data.entries()) {
        if (matchesStoreFilter(record, filter)) {
          data.delete(id)
          count++
        }
      }
      return count
    }),
    count: vi.fn(async (filter?: StoreFilter<T>) => {
      if (!filter)
        return data.size
      return Array.from(data.values()).filter(record => matchesStoreFilter(record, filter)).length
    }),
    clear: vi.fn(async (filter?: StoreFilter<T>) => {
      if (!filter) {
        data.clear()
        return
      }
      for (const [id, record] of data.entries()) {
        if (matchesStoreFilter(record, filter))
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
    upsert: vi.fn(async (id: string, vector: number[], metadata?: Record<string, unknown>) => {
      vectors.set(id, { vector, metadata: metadata ? { ...metadata } : undefined })
    }),
    search: vi.fn(async (queryVec: number[], options?: { topK?: number, minScore?: number, filter?: Record<string, unknown> }) => {
      const topK = options?.topK ?? 10
      const results: Array<{ id: string, score: number, metadata?: Record<string, unknown> }> = []
      for (const [id, entry] of vectors.entries()) {
        if (options?.filter) {
          const matchesFilter = Object.entries(options.filter).every(([key, expected]) => entry.metadata?.[key] === expected)
          if (!matchesFilter)
            continue
        }
        const score = cosineSimilarity(queryVec, entry.vector)
        if (options?.minScore !== undefined && score < options.minScore)
          continue
        results.push({ id, score, metadata: entry.metadata })
      }
      results.sort((a, b) => b.score - a.score)
      return results.slice(0, topK)
    }),
    remove: vi.fn(async (id: string) => { vectors.delete(id) }),
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
            message: { role: 'assistant' as const, content: resp.content, refusal: null },
            logprobs: null,
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

type MockChatResult = Awaited<ReturnType<LLMOperations['chat']>>

function createLLMChatOk(content: string | null): MockChatResult {
  return {
    success: true as const,
    data: {
      id: 'test-id',
      object: 'chat.completion' as const,
      created: Date.now(),
      model: 'test-model',
      choices: [{
        index: 0,
        message: { role: 'assistant' as const, content, refusal: null },
        logprobs: null,
        finish_reason: 'stop' as const,
      }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    },
  } as unknown as MockChatResult
}

const defaultConfig: MemoryConfig = {
  provider: 'native',
  maxEntries: 100,
  recencyDecay: 0.95,
  embeddingEnabled: true,
  defaultTopK: 10,
  writebackRelatedTopK: 20,
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

function createTestMemoryHarness(
  config: MemoryConfig,
  llm: LLMOperations,
  embedding: EmbeddingOperations | null,
) {
  const store = createMockStore<MemoryEntry>()
  const vectorStore = createMockVectorStore()
  return {
    ops: createMemoryOperations(config, llm, embedding, store, vectorStore),
    store,
    vectorStore,
  }
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
    const llm = createMockLLM([
      { content: JSON.stringify([
        { content: '提取到的记忆', type: 'fact', importance: 0.8 },
      ]) },
      { content: JSON.stringify({ memory: [
        { text: '提取到的记忆', type: 'fact', importance: 0.8, event: 'ADD' },
      ] }) },
    ])
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

    const [request] = vi.mocked(llm.chat).mock.calls[0] ?? []
    expect(request?.messages[0]).toEqual({
      role: 'system',
      content: 'Only extract durable user preferences.',
    })
  })

  it('extract 遇到同 scope 的完全重复记忆时返回 noop', async () => {
    const llm = createMockLLM([{
      content: JSON.stringify([
        { content: '用户偏好中文', type: 'preference', importance: 0.8 },
      ]),
    }])
    const embedding = createMockEmbedding()
    const { ops } = createTestMemoryHarness(defaultConfig, llm, embedding)

    await ops.add({
      content: '用户偏好中文',
      type: 'preference',
      importance: 0.8,
      objectId: 'user-1',
    })

    const result = await ops.extract([
      { role: 'user' as const, content: '请记住我更喜欢中文回复。' },
    ], { objectId: 'user-1' })

    expect(result.success).toBe(true)
    if (!result.success) {
      return
    }

    expect(result.data).toHaveLength(0)

    const listResult = await ops.list({ objectId: 'user-1' })
    expect(listResult.success).toBe(true)
    if (listResult.success) {
      expect(listResult.data).toHaveLength(1)
      expect(listResult.data[0].content).toBe('用户偏好中文')
    }
  })

  it('extract 不会把不同 scope 的旧记忆当成重复项', async () => {
    const llm = createMockLLM([
      { content: JSON.stringify([
        { content: '用户偏好中文', type: 'preference', importance: 0.8 },
      ]) },
      { content: JSON.stringify({ memory: [
        { text: '用户偏好中文', type: 'preference', importance: 0.8, event: 'ADD' },
      ] }) },
    ])
    const embedding = createMockEmbedding()
    const { ops } = createTestMemoryHarness(defaultConfig, llm, embedding)

    await ops.add({
      content: '用户偏好中文',
      type: 'preference',
      importance: 0.8,
      objectId: 'user-1',
    })

    const result = await ops.extract([
      { role: 'user' as const, content: '请记住我喜欢中文回复。' },
    ], { objectId: 'user-2' })

    expect(result.success).toBe(true)
    if (!result.success) {
      return
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0].objectId).toBe('user-2')

    const user1List = await ops.list({ objectId: 'user-1' })
    const user2List = await ops.list({ objectId: 'user-2' })
    expect(user1List.success).toBe(true)
    expect(user2List.success).toBe(true)
    if (user1List.success && user2List.success) {
      expect(user1List.data).toHaveLength(1)
      expect(user2List.data).toHaveLength(1)
      expect(user1List.data[0].id).not.toBe(user2List.data[0].id)
    }
  })

  it('extract 遇到同一条记忆的更精确表述时更新原条目', async () => {
    const llm = createMockLLM([])
    const embedding = createMockEmbedding()
    const { ops } = createTestMemoryHarness(defaultConfig, llm, embedding)

    const existingResult = await ops.add({
      content: '用户偏好先给结论',
      type: 'instruction',
      importance: 0.7,
      objectId: 'user-1',
    })
    expect(existingResult.success).toBe(true)
    if (!existingResult.success) {
      return
    }

    vi.mocked(llm.chat)
      .mockResolvedValueOnce(createLLMChatOk(JSON.stringify([
        { content: '用户偏好先给结论，再展开说明', type: 'instruction', importance: 0.9 },
      ])))
      .mockResolvedValueOnce(createLLMChatOk(JSON.stringify({
        memory: [{
          id: existingResult.data.id,
          text: '用户偏好先给结论，再根据需要展开说明',
          type: 'instruction',
          importance: 0.9,
          event: 'UPDATE',
        }],
      })))

    const result = await ops.extract([
      { role: 'user' as const, content: '以后回答先给结论，再根据需要展开说明。' },
    ], { objectId: 'user-1' })

    expect(result.success).toBe(true)
    if (!result.success) {
      return
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).toBe(existingResult.data.id)
    expect(result.data[0].content).toBe('用户偏好先给结论，再根据需要展开说明')

    const listResult = await ops.list({ objectId: 'user-1' })
    expect(listResult.success).toBe(true)
    if (listResult.success) {
      expect(listResult.data).toHaveLength(1)
      expect(listResult.data[0].id).toBe(existingResult.data.id)
      expect(listResult.data[0].content).toBe('用户偏好先给结论，再根据需要展开说明')
    }
  })

  it('解构后的 extract 在更新分支也能正常工作', async () => {
    const llm = createMockLLM([])
    const embedding = createMockEmbedding()
    const { ops } = createTestMemoryHarness(defaultConfig, llm, embedding)

    const existingResult = await ops.add({
      content: '用户偏好先给结论',
      type: 'instruction',
      importance: 0.7,
      objectId: 'user-1',
    })
    expect(existingResult.success).toBe(true)
    if (!existingResult.success) {
      return
    }

    vi.mocked(llm.chat)
      .mockResolvedValueOnce(createLLMChatOk(JSON.stringify([
        { content: '用户偏好先给结论，再展开说明', type: 'instruction', importance: 0.9 },
      ])))
      .mockResolvedValueOnce(createLLMChatOk(JSON.stringify({
        memory: [{
          id: existingResult.data.id,
          text: '用户偏好先给结论，再根据需要展开说明',
          type: 'instruction',
          importance: 0.9,
          event: 'UPDATE',
        }],
      })))

    const { extract } = ops
    const result = await extract([
      { role: 'user' as const, content: '以后回答先给结论，再根据需要展开说明。' },
    ], { objectId: 'user-1' })

    expect(result.success).toBe(true)
    if (!result.success) {
      return
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).toBe(existingResult.data.id)
    expect(result.data[0].content).toBe('用户偏好先给结论，再根据需要展开说明')
  })

  it('extract 对账返回非法 JSON 时保底创建新记忆', async () => {
    const llm = createMockLLM([])
    const embedding = createMockEmbedding()
    const { ops } = createTestMemoryHarness(defaultConfig, llm, embedding)

    const existingResult = await ops.add({
      content: '用户偏好先给结论',
      type: 'instruction',
      importance: 0.7,
      objectId: 'user-1',
    })
    expect(existingResult.success).toBe(true)
    if (!existingResult.success) {
      return
    }

    vi.mocked(llm.chat)
      .mockResolvedValueOnce(createLLMChatOk(JSON.stringify([
        { content: '用户偏好先给结论，再展开说明', type: 'instruction', importance: 0.9 },
      ])))
      .mockResolvedValueOnce(createLLMChatOk('not-json'))

    const result = await ops.extract([
      { role: 'user' as const, content: '以后回答先给结论，再展开说明。' },
    ], { objectId: 'user-1' })

    expect(result.success).toBe(true)
    if (!result.success) {
      return
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).not.toBe(existingResult.data.id)

    const listResult = await ops.list({ objectId: 'user-1' })
    expect(listResult.success).toBe(true)
    if (listResult.success) {
      expect(listResult.data).toHaveLength(2)
    }
  })

  it('extract 对账返回无效 memoryId 时保底创建新记忆', async () => {
    const llm = createMockLLM([])
    const embedding = createMockEmbedding()
    const { ops } = createTestMemoryHarness(defaultConfig, llm, embedding)

    const existingResult = await ops.add({
      content: '用户偏好先给结论',
      type: 'instruction',
      importance: 0.7,
      objectId: 'user-1',
    })
    expect(existingResult.success).toBe(true)
    if (!existingResult.success) {
      return
    }

    vi.mocked(llm.chat)
      .mockResolvedValueOnce(createLLMChatOk(JSON.stringify([
        { content: '用户偏好先给结论，再展开说明', type: 'instruction', importance: 0.9 },
      ])))
      .mockResolvedValueOnce(createLLMChatOk(JSON.stringify({
        memory: [{
          id: 'missing-memory-id',
          text: '用户偏好先给结论，再根据需要展开说明',
          type: 'instruction',
          importance: 0.9,
          event: 'UPDATE',
        }],
      })))

    const result = await ops.extract([
      { role: 'user' as const, content: '以后回答先给结论，再根据需要展开说明。' },
    ], { objectId: 'user-1' })

    expect(result.success).toBe(true)
    if (!result.success) {
      return
    }

    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).not.toBe(existingResult.data.id)

    const listResult = await ops.list({ objectId: 'user-1' })
    expect(listResult.success).toBe(true)
    if (listResult.success) {
      expect(listResult.data).toHaveLength(2)
    }
  })

  it('extract 对账使用 writebackRelatedTopK，普通 recall 继续使用 defaultTopK', async () => {
    const llm = createMockLLM([{
      content: JSON.stringify([
        { content: '用户偏好中文', type: 'preference', importance: 0.8 },
      ]),
    }])
    const embedding = createMockEmbedding()
    const { ops, vectorStore } = createTestMemoryHarness({
      ...defaultConfig,
      defaultTopK: 2,
      writebackRelatedTopK: 5,
    }, llm, embedding)

    await ops.add({ content: '用户偏好中文', type: 'preference', importance: 0.8, objectId: 'user-1' })
    await ops.add({ content: '用户使用 TypeScript', type: 'fact', importance: 0.7, objectId: 'user-1' })

    const extractResult = await ops.extract([
      { role: 'user' as const, content: '请记住我更喜欢中文回复。' },
    ], { objectId: 'user-1' })
    expect(extractResult.success).toBe(true)

    const writebackSearchCall = vi.mocked(vectorStore.search).mock.calls[0]
    expect(writebackSearchCall?.[1]).toEqual(expect.objectContaining({ topK: 15 }))

    const recallResult = await ops.recall('中文', { objectId: 'user-1' })
    expect(recallResult.success).toBe(true)

    const promptRecallSearchCall = vi.mocked(vectorStore.search).mock.calls[1]
    expect(promptRecallSearchCall?.[1]).toEqual(expect.objectContaining({ topK: 6 }))
  })

  it('extract 对账不会增加相关旧记忆的访问元数据', async () => {
    const llm = createMockLLM([{
      content: JSON.stringify([
        { content: '用户偏好中文', type: 'preference', importance: 0.8 },
      ]),
    }])
    const embedding = createMockEmbedding()
    const { ops, store } = createTestMemoryHarness(defaultConfig, llm, embedding)

    const existingResult = await ops.add({
      content: '用户偏好中文',
      type: 'preference',
      importance: 0.8,
      objectId: 'user-1',
    })
    expect(existingResult.success).toBe(true)
    if (!existingResult.success) {
      return
    }

    const seededEntry = await store.get(existingResult.data.id)
    expect(seededEntry).toBeDefined()
    if (!seededEntry) {
      return
    }

    await store.save(seededEntry.id, {
      ...seededEntry,
      lastAccessedAt: 1234,
      accessCount: 7,
    }, { objectId: seededEntry.objectId })

    const extractResult = await ops.extract([
      { role: 'user' as const, content: '请记住我更喜欢中文回复。' },
    ], { objectId: 'user-1' })
    expect(extractResult.success).toBe(true)

    const storedEntry = await store.get(existingResult.data.id)
    expect(storedEntry?.lastAccessedAt).toBe(1234)
    expect(storedEntry?.accessCount).toBe(7)
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

// ─── Mem0 Provider（嵌入式合并）测试 ───

const mem0Config: MemoryConfig = { ...defaultConfig, provider: 'mem0' }

const mem0Messages = [
  { role: 'user' as const, content: '我喜欢中文' },
  { role: 'assistant' as const, content: '好的' },
]

/**
 * 创建 Mem0 合并测试用 LLM：第 1 次调用返回抽取事实，第 2 次调用根据传入的既有记忆动态生成合并操作
 */
function createMem0LLM(
  extraction: unknown,
  buildOps: (existing: Array<{ id: string, content: string }>) => unknown[],
): LLMOperations {
  let call = 0
  return {
    chat: vi.fn(async (req: { messages: Array<{ role: string, content: string }> }) => {
      call++
      if (call === 1)
        return createLLMChatOk(JSON.stringify(extraction))
      const userContent = req.messages.find(message => message.role === 'user')?.content ?? '{}'
      const payload = JSON.parse(userContent) as { existingMemories: Array<{ id: string, content: string }> }
      return createLLMChatOk(JSON.stringify({ memory: buildOps(payload.existingMemories) }))
    }),
    chatStream: vi.fn(),
    listModels: vi.fn(),
  } as unknown as LLMOperations
}

function createMem0Ops(llm: LLMOperations, embedding: EmbeddingOperations | null = createMockEmbedding()) {
  const store = createMockStore<MemoryEntry>()
  const vectorStore = createMockVectorStore()
  return { ops: createMemoryOperations(mem0Config, llm, embedding, store, vectorStore), store, vectorStore }
}

describe('createMemoryOperations 批量合并（Mem0 式）', () => {
  it('空库时对全部抽取事实执行 ADD', async () => {
    const llm = createMem0LLM(
      [
        { content: '用户喜欢中文', type: 'preference', importance: 0.8 },
        { content: '项目名为 HAI', type: 'fact', importance: 0.9 },
      ],
      () => [
        { text: '用户喜欢中文', type: 'preference', importance: 0.8, event: 'ADD' },
        { text: '项目名为 HAI', type: 'fact', importance: 0.9, event: 'ADD' },
      ],
    )
    const { ops } = createMem0Ops(llm)

    const result = await ops.extract(mem0Messages, { objectId: 'u1' })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data).toHaveLength(2)

    const list = await ops.list({ objectId: 'u1' })
    expect(list.success && list.data).toHaveLength(2)
  })

  it('对既有记忆执行 UPDATE（增量更新，不新增）', async () => {
    const llm = createMem0LLM(
      [{ content: '用户偏好中文回复', type: 'preference', importance: 0.9 }],
      existing => [{ id: existing[0]?.id, text: '用户偏好中文回复', type: 'preference', importance: 0.9, event: 'UPDATE' }],
    )
    const { ops } = createMem0Ops(llm)

    const added = await ops.add({ content: '用户偏好', type: 'preference', importance: 0.5, objectId: 'u1' })
    expect(added.success).toBe(true)

    const result = await ops.extract(mem0Messages, { objectId: 'u1' })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data).toHaveLength(1)
    expect(result.data[0].content).toBe('用户偏好中文回复')
    expect(result.data[0].importance).toBe(0.9)

    const list = await ops.list({ objectId: 'u1' })
    expect(list.success && list.data).toHaveLength(1) // 更新而非新增
  })

  it('对已覆盖的事实执行 NONE（去重跳过）', async () => {
    const llm = createMem0LLM(
      [{ content: '用户偏好中文', type: 'preference', importance: 0.8 }],
      existing => [{ id: existing[0]?.id, text: '用户偏好中文', type: 'preference', importance: 0.8, event: 'NONE' }],
    )
    const { ops } = createMem0Ops(llm)

    await ops.add({ content: '用户偏好中文', type: 'preference', importance: 0.8, objectId: 'u1' })
    const result = await ops.extract(mem0Messages, { objectId: 'u1' })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data).toHaveLength(0) // 无写入

    const list = await ops.list({ objectId: 'u1' })
    expect(list.success && list.data).toHaveLength(1)
  })

  it('对矛盾的记忆执行 DELETE', async () => {
    const llm = createMem0LLM(
      [{ content: '用户改用英文', type: 'preference', importance: 0.8 }],
      existing => [{ id: existing[0]?.id, text: '用户偏好中文', type: 'preference', importance: 0.8, event: 'DELETE' }],
    )
    const { ops } = createMem0Ops(llm)

    await ops.add({ content: '用户偏好中文', type: 'preference', importance: 0.8, objectId: 'u1' })
    const result = await ops.extract(mem0Messages, { objectId: 'u1' })
    expect(result.success).toBe(true)

    const list = await ops.list({ objectId: 'u1' })
    expect(list.success && list.data).toHaveLength(0) // 已删除
  })

  it('合并响应非法 JSON 时回退为 ADD-all', async () => {
    const llm = createMockLLM([
      { content: JSON.stringify([
        { content: '用户喜欢中文', type: 'preference', importance: 0.8 },
        { content: '项目名为 HAI', type: 'fact', importance: 0.9 },
      ]) },
      { content: 'not valid json' },
    ])
    const { ops } = createMem0Ops(llm)

    const result = await ops.extract(mem0Messages, { objectId: 'u1' })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data).toHaveLength(2)
  })

  it('extract 以外的操作委托给 native 引擎', async () => {
    const llm = createMockLLM([])
    const { ops } = createMem0Ops(llm)

    const added = await ops.add({ content: '直接写入的记忆', type: 'fact', importance: 0.7, objectId: 'u1' })
    expect(added.success).toBe(true)
    if (!added.success)
      return

    const got = await ops.get(added.data.id)
    expect(got.success && got.data.content).toBe('直接写入的记忆')

    const recalled = await ops.recall('记忆', { objectId: 'u1' })
    expect(recalled.success).toBe(true)
  })
})
