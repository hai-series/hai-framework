/**
 * AI Memory 子模块单元测试
 *
 * 测试记忆的提取、存储、检索、注入、删除操作，使用 mock LLM / Embedding。
 */

import type { MemoryConfig } from '../src/ai-config.js'
import type { EmbeddingOperations } from '../src/embedding/ai-embedding-types.js'
import type { LLMOperations } from '../src/llm/ai-llm-types.js'
import { describe, expect, it, vi } from 'vitest'
import { extractMemories } from '../src/memory/ai-memory-extractor.js'
import { createMemoryOperations } from '../src/memory/ai-memory-functions.js'
import { InMemoryStore } from '../src/memory/ai-memory-store.js'

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

// ─── InMemoryStore 测试 ───

describe('inMemoryStore', () => {
  it('添加和获取记忆', () => {
    const store = new InMemoryStore(100)
    const entry = store.add({ content: '用户喜欢中文', type: 'preference', importance: 0.8 })

    expect(entry.id).toMatch(/^mem_/)
    expect(entry.content).toBe('用户喜欢中文')
    expect(entry.type).toBe('preference')
    expect(entry.importance).toBe(0.8)

    const retrieved = store.get(entry.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.accessCount).toBe(1)
  })

  it('超限时淘汰低优先级条目', () => {
    const store = new InMemoryStore(3)
    store.add({ content: '低优先级', type: 'fact', importance: 0.1 })
    store.add({ content: '中优先级', type: 'fact', importance: 0.5 })
    store.add({ content: '高优先级', type: 'fact', importance: 0.9 })

    // 第 4 条触发淘汰
    store.add({ content: '新条目', type: 'fact', importance: 0.6 })

    expect(store.size).toBe(3)
    const all = store.list()
    const contents = all.map(e => e.content)
    expect(contents).not.toContain('低优先级')
    expect(contents).toContain('新条目')
  })

  it('按类型过滤列表', () => {
    const store = new InMemoryStore(100)
    store.add({ content: '事实1', type: 'fact' })
    store.add({ content: '偏好1', type: 'preference' })
    store.add({ content: '事件1', type: 'event' })

    const facts = store.list({ types: ['fact'] })
    expect(facts).toHaveLength(1)
    expect(facts[0].type).toBe('fact')
  })

  it('按来源过滤列表', () => {
    const store = new InMemoryStore(100)
    store.add({ content: '来源A', type: 'fact', source: 'session-a' })
    store.add({ content: '来源B', type: 'fact', source: 'session-b' })

    const result = store.list({ source: 'session-a' })
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('来源A')
  })

  it('删除记忆', () => {
    const store = new InMemoryStore(100)
    const entry = store.add({ content: '待删除', type: 'fact' })
    expect(store.remove(entry.id)).toBe(true)
    expect(store.get(entry.id)).toBeUndefined()
  })

  it('清空指定类型', () => {
    const store = new InMemoryStore(100)
    store.add({ content: '事实', type: 'fact' })
    store.add({ content: '偏好', type: 'preference' })
    store.clear({ types: ['fact'] })

    expect(store.size).toBe(1)
    expect(store.list()[0].type).toBe('preference')
  })

  it('清空全部', () => {
    const store = new InMemoryStore(100)
    store.add({ content: '条目1', type: 'fact' })
    store.add({ content: '条目2', type: 'preference' })
    store.clear()
    expect(store.size).toBe(0)
  })

  it('getWithVectors 只返回有向量的条目', () => {
    const store = new InMemoryStore(100)
    store.add({ content: '有向量', type: 'fact' }, [0.1, 0.2])
    store.add({ content: '无向量', type: 'fact' })

    const withVectors = store.getWithVectors()
    expect(withVectors).toHaveLength(1)
    expect(withVectors[0].content).toBe('有向量')
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
    const ops = createMemoryOperations(defaultConfig, llm, embedding)

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
    const ops = createMemoryOperations(defaultConfig, llm, embedding)

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
    const ops = createMemoryOperations(defaultConfig, llm, embedding)

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
    const ops = createMemoryOperations(defaultConfig, llm, null)

    const result = await ops.recall('查询')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(0)
    }
  })

  it('inject 注入记忆到消息列表（system 位置）', async () => {
    const llm = createMockLLM([])
    const ops = createMemoryOperations({ ...defaultConfig, embeddingEnabled: false }, llm, null)

    await ops.add({ content: '用户叫张三', type: 'fact', importance: 0.9 })

    const messages = [
      { role: 'system' as const, content: '你是一个助手' },
      { role: 'user' as const, content: '你好' },
    ]

    const result = await ops.inject(messages, { topK: 5, position: 'system' })
    expect(result.success).toBe(true)
    if (result.success) {
      const systemMsg = result.data.find(m => m.role === 'system')
      expect(systemMsg).toBeDefined()
      expect((systemMsg as { content: string }).content).toContain('张三')
    }
  })

  it('inject 无用户消息时原样返回', async () => {
    const llm = createMockLLM([])
    const ops = createMemoryOperations(defaultConfig, llm, null)

    const messages = [
      { role: 'system' as const, content: '系统提示' },
    ]
    const result = await ops.inject(messages)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(messages)
    }
  })

  it('remove 删除记忆', async () => {
    const llm = createMockLLM([])
    const ops = createMemoryOperations(defaultConfig, llm, null)

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
    const ops = createMemoryOperations(defaultConfig, llm, null)

    const result = await ops.remove('non-existent')
    expect(result.success).toBe(false)
  })

  it('list 支持按类型过滤', async () => {
    const llm = createMockLLM([])
    const ops = createMemoryOperations(defaultConfig, llm, null)

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
    const ops = createMemoryOperations(defaultConfig, llm, null)

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
    const ops = createMemoryOperations(defaultConfig, llm, null)

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
    const ops = createMemoryOperations({ ...defaultConfig, embeddingEnabled: false }, llm, null)

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
