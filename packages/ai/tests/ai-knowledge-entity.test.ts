/**
 * AI Knowledge 实体提取单元测试
 *
 * 覆盖 LLM 实体提取、JSON 解析容错、批量提取去重合并。
 */

import type { LLMOperations } from '../src/llm/ai-llm-types.js'
import { describe, expect, it, vi } from 'vitest'
import { AIErrorCode } from '../src/ai-config.js'
import { extractEntities, extractEntitiesBatch } from '../src/knowledge/ai-knowledge-entity.js'

// ─── Mock LLM ───

function createMockLLM(content: string): LLMOperations {
  return {
    chat: vi.fn(async () => ({
      success: true as const,
      data: {
        id: 'test-id',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'test-model',
        choices: [{
          index: 0,
          message: { role: 'assistant' as const, content },
          finish_reason: 'stop' as const,
        }],
        usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
      },
    })),
    chatStream: vi.fn(),
  } as unknown as LLMOperations
}

function createFailLLM(): LLMOperations {
  return {
    chat: vi.fn(async () => ({
      success: false as const,
      error: { code: 7200, message: 'LLM call failed' },
    })),
    chatStream: vi.fn(),
  } as unknown as LLMOperations
}

// ─── extractEntities ───

describe('knowledge 实体提取（extractEntities）', () => {
  it('正常提取：JSON 数组格式', async () => {
    const llm = createMockLLM(JSON.stringify([
      { name: 'Alice', type: 'person', aliases: ['Alice Wang'], description: 'A researcher' },
      { name: 'GPT-4', type: 'project', description: 'Large language model' },
    ]))

    const result = await extractEntities(llm, 'Alice Wang presented GPT-4 at the conference.')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(2)
      expect(result.data[0].name).toBe('Alice')
      expect(result.data[0].type).toBe('person')
      expect(result.data[0].aliases).toEqual(['Alice Wang'])
      expect(result.data[1].name).toBe('GPT-4')
      expect(result.data[1].type).toBe('project')
    }
  })

  it('解析带 markdown 围栏的 JSON', async () => {
    const content = '```json\n[{"name": "React", "type": "project"}]\n```'
    const llm = createMockLLM(content)

    const result = await extractEntities(llm, 'React is a JavaScript framework.')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(1)
      expect(result.data[0].name).toBe('React')
    }
  })

  it('解析 { entities: [...] } 包装格式', async () => {
    const content = JSON.stringify({
      entities: [
        { name: 'Beijing', type: 'location', description: 'Capital of China' },
      ],
    })
    const llm = createMockLLM(content)

    const result = await extractEntities(llm, 'Beijing is the capital of China.')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(1)
      expect(result.data[0].name).toBe('Beijing')
      expect(result.data[0].type).toBe('location')
    }
  })

  it('无效 type 回退为 other', async () => {
    const llm = createMockLLM(JSON.stringify([
      { name: 'Foo', type: 'unknown_type' },
    ]))

    const result = await extractEntities(llm, 'Foo is something.')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(1)
      expect(result.data[0].type).toBe('other')
    }
  })

  it('过滤无效条目（缺少 name）', async () => {
    const llm = createMockLLM(JSON.stringify([
      { name: 'Valid', type: 'concept' },
      { type: 'person' }, // 缺少 name
      { name: '', type: 'project' }, // 空 name
    ]))

    const result = await extractEntities(llm, 'Some text.')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(1)
      expect(result.data[0].name).toBe('Valid')
    }
  })

  it('无效 JSON 返回空数组', async () => {
    const llm = createMockLLM('This is not JSON at all.')

    const result = await extractEntities(llm, 'Some text.')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('空文本返回空数组', async () => {
    const llm = createMockLLM('should not be called')

    const result = await extractEntities(llm, '   ')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
    // LLM 不应被调用
    expect(llm.chat).not.toHaveBeenCalled()
  })

  it('lLM 调用失败返回错误', async () => {
    const llm = createFailLLM()

    const result = await extractEntities(llm, 'Some text.')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.KNOWLEDGE_ENTITY_EXTRACT_FAILED)
    }
  })

  it('lLM 返回空数组', async () => {
    const llm = createMockLLM('[]')

    const result = await extractEntities(llm, 'A sentence with no entities.')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })
})

// ─── extractEntitiesBatch ───

describe('knowledge 批量实体提取（extractEntitiesBatch）', () => {
  it('多 chunk 提取并去重合并', async () => {
    let callCount = 0
    const llm: LLMOperations = {
      chat: vi.fn(async () => {
        callCount++
        // 两个 chunk 都提到 "Alice"，第二个也提到 "Bob"
        const entities = callCount === 1
          ? [{ name: 'Alice', type: 'person', aliases: ['Alice W'] }]
          : [{ name: 'Alice', type: 'person', aliases: ['Dr. Alice'] }, { name: 'Bob', type: 'person' }]

        return {
          success: true as const,
          data: {
            id: 'test-id',
            object: 'chat.completion' as const,
            created: Date.now(),
            model: 'test-model',
            choices: [{
              index: 0,
              message: { role: 'assistant' as const, content: JSON.stringify(entities) },
              finish_reason: 'stop' as const,
            }],
            usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
          },
        }
      }),
      chatStream: vi.fn(),
    } as unknown as LLMOperations

    const chunks = [
      { content: 'Alice presented the paper.', chunkId: 'doc1:chunk-0' },
      { content: 'Dr. Alice and Bob reviewed the code.', chunkId: 'doc1:chunk-1' },
    ]

    const result = await extractEntitiesBatch(llm, chunks)
    expect(result.success).toBe(true)
    if (result.success) {
      // Alice 应合并为 1 个实体，Bob 为 1 个
      expect(result.data.length).toBe(2)

      const alice = result.data.find(e => e.name.toLowerCase() === 'alice')
      expect(alice).toBeDefined()
      expect(alice!.chunkIds).toEqual(['doc1:chunk-0', 'doc1:chunk-1'])
      // 别名应合并（Alice W + Dr. Alice）
      expect(alice!.aliases).toContain('Alice W')
      expect(alice!.aliases).toContain('Dr. Alice')

      const bob = result.data.find(e => e.name.toLowerCase() === 'bob')
      expect(bob).toBeDefined()
      expect(bob!.chunkIds).toEqual(['doc1:chunk-1'])
    }
  })

  it('空 chunks 返回空数组', async () => {
    const llm = createMockLLM('[]')

    const result = await extractEntitiesBatch(llm, [])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('部分 chunk 提取失败不影响整体', async () => {
    let callCount = 0
    const llm: LLMOperations = {
      chat: vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          return {
            success: false as const,
            error: { code: 7200, message: 'Failed' },
          }
        }
        return {
          success: true as const,
          data: {
            id: 'test-id',
            object: 'chat.completion' as const,
            created: Date.now(),
            model: 'test-model',
            choices: [{
              index: 0,
              message: { role: 'assistant' as const, content: JSON.stringify([{ name: 'Entity1', type: 'concept' }]) },
              finish_reason: 'stop' as const,
            }],
            usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
          },
        }
      }),
      chatStream: vi.fn(),
    } as unknown as LLMOperations

    const chunks = [
      { content: 'Chunk 1 text', chunkId: 'doc:chunk-0' },
      { content: 'Chunk 2 text', chunkId: 'doc:chunk-1' },
    ]

    const result = await extractEntitiesBatch(llm, chunks, undefined, undefined, undefined, 2)
    expect(result.success).toBe(true)
    if (result.success) {
      // 第一个失败，第二个成功
      expect(result.data.length).toBe(1)
      expect(result.data[0].name).toBe('Entity1')
    }
  })

  it('更详细描述覆盖简短描述', async () => {
    let callCount = 0
    const llm: LLMOperations = {
      chat: vi.fn(async () => {
        callCount++
        const entities = callCount === 1
          ? [{ name: 'React', type: 'project', description: 'A library' }]
          : [{ name: 'React', type: 'project', description: 'A JavaScript library for building UIs' }]

        return {
          success: true as const,
          data: {
            id: 'test-id',
            object: 'chat.completion' as const,
            created: Date.now(),
            model: 'test-model',
            choices: [{
              index: 0,
              message: { role: 'assistant' as const, content: JSON.stringify(entities) },
              finish_reason: 'stop' as const,
            }],
            usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
          },
        }
      }),
      chatStream: vi.fn(),
    } as unknown as LLMOperations

    const chunks = [
      { content: 'React is a library.', chunkId: 'doc:chunk-0' },
      { content: 'React is a JavaScript library for building UIs.', chunkId: 'doc:chunk-1' },
    ]

    const result = await extractEntitiesBatch(llm, chunks)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(1)
      expect(result.data[0].description).toBe('A JavaScript library for building UIs')
    }
  })
})
