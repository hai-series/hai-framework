/**
 * AI Embedding 子模块单元测试
 *
 * 使用 mock OpenAI SDK 测试 embedding 操作。
 */

import { describe, expect, it, vi } from 'vitest'
import { AIConfigSchema, HaiAIError } from '../src/ai-types.js'
import { createEmbeddingOperations } from '../src/embedding/ai-embedding-functions.js'

// ─── Mock OpenAI ───

// Embedding 函数静态依赖 openai，直接 mock 整个模块
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      embeddings = {
        create: vi.fn(async (params: { input: string | string[], model?: string }) => {
          const input = Array.isArray(params.input) ? params.input : [params.input]
          return {
            model: params.model ?? 'text-embedding-3-small',
            data: input.map((_text: string, i: number) => ({
              index: i,
              embedding: Array.from({ length: 8 }).fill(0).map((_, j) => (i + j) * 0.1),
            })),
            usage: {
              prompt_tokens: input.length * 5,
              total_tokens: input.length * 5,
            },
          }
        }),
      }

      constructor(_options: Record<string, unknown>) {
        // 接受 apiKey 等参数
      }
    },
  }
})

const mockConfig = AIConfigSchema.parse({
  llm: { apiKey: 'test-key', model: 'gpt-4' },
  embedding: { model: 'text-embedding-3-small', batchSize: 2 },
})

// ─── 测试 ───

describe('embedding operations', () => {
  it('embedText 返回向量', async () => {
    const ops = createEmbeddingOperations(mockConfig)
    const result = await ops.embedText('Hello world')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(Array.isArray(result.data)).toBe(true)
      expect(result.data.length).toBe(8)
    }
  })

  it('embed 单个文本', async () => {
    const ops = createEmbeddingOperations(mockConfig)
    const result = await ops.embed({ input: 'Test text' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.data.length).toBe(1)
      expect(result.data.data[0].embedding.length).toBe(8)
      expect(result.data.usage.prompt_tokens).toBeGreaterThan(0)
    }
  })

  it('embed 多个文本（不超过 batchSize）', async () => {
    const ops = createEmbeddingOperations(mockConfig)
    const result = await ops.embed({ input: ['Text A', 'Text B'] })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.data.length).toBe(2)
    }
  })

  it('embed 多个文本（超过 batchSize 自动分批）', async () => {
    const ops = createEmbeddingOperations(mockConfig)
    // batchSize=2，输入三个文本
    const result = await ops.embed({ input: ['A', 'B', 'C'] })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.data.length).toBe(3)
      // 验证 index 全局正确
      const indices = result.data.data.map(d => d.index).sort()
      expect(indices).toEqual([0, 1, 2])
    }
  })

  it('embedBatch 返回向量数组', async () => {
    const ops = createEmbeddingOperations(mockConfig)
    const result = await ops.embedBatch(['Hello', 'World'])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(2)
      expect(result.data[0].length).toBe(8)
    }
  })

  it('embedBatch 超过 batchSize 时分批处理', async () => {
    const ops = createEmbeddingOperations(mockConfig)
    const result = await ops.embedBatch(['A', 'B', 'C', 'D', 'E'])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(5)
    }
  })

  it('无 API Key 时返回错误', async () => {
    const noKeyConfig = AIConfigSchema.parse({
      llm: { model: 'gpt-4' },
      embedding: { model: 'text-embedding-3-small', batchSize: 100 },
    })

    // 清除环境变量
    const origKeys = {
      HAI_AI_LLM_API_KEY: process.env.HAI_AI_LLM_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    }
    delete process.env.HAI_AI_LLM_API_KEY
    delete process.env.OPENAI_API_KEY

    try {
      const ops = createEmbeddingOperations(noKeyConfig)
      const result = await ops.embedText('test')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiAIError.CONFIGURATION_ERROR.code)
      }
    }
    finally {
      // 恢复环境变量
      if (origKeys.HAI_AI_LLM_API_KEY)
        process.env.HAI_AI_LLM_API_KEY = origKeys.HAI_AI_LLM_API_KEY
      if (origKeys.OPENAI_API_KEY)
        process.env.OPENAI_API_KEY = origKeys.OPENAI_API_KEY
    }
  })

  it('自定义 model', async () => {
    const ops = createEmbeddingOperations(mockConfig)
    const result = await ops.embed({
      input: 'test',
      model: 'text-embedding-3-large',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.model).toBe('text-embedding-3-large')
    }
  })
})
