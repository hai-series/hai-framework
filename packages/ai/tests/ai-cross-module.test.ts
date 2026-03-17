/**
 * AI 跨模块协作测试
 *
 * 覆盖子模块间接口衔接：
 * - Retrieval + Embedding → 向量检索流程
 * - RAG + Retrieval + LLM → 检索增强生成（含 citation）
 * - Reasoning + LLM → 推理策略
 * - Tool registry + execute → 工具链
 */

import type { AIConfig } from '../src/ai-config.js'
import type { EmbeddingOperations } from '../src/embedding/ai-embedding-types.js'
import type { LLMOperations } from '../src/llm/ai-llm-types.js'
import type { RetrievalOperations, RetrievalSource } from '../src/retrieval/ai-retrieval-types.js'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AIErrorCode } from '../src/ai-config.js'
import { ai } from '../src/index.js'
import { createRagOperations } from '../src/rag/ai-rag-functions.js'
import { createReasoningOperations } from '../src/reasoning/ai-reasoning-functions.js'
import { createRetrievalOperations } from '../src/retrieval/ai-retrieval-functions.js'

// =============================================================================
// Mock 工厂
// =============================================================================

/** 创建 mock LLM，支持多轮应答 */
function createMockLLM(responses: string[]): LLMOperations {
  let callIndex = 0
  return {
    chat: vi.fn(async () => {
      const content = responses[callIndex] ?? responses[responses.length - 1]
      callIndex++
      return {
        success: true as const,
        data: {
          id: `resp-${callIndex}`,
          object: 'chat.completion' as const,
          created: Date.now(),
          model: 'test-model',
          choices: [{
            index: 0,
            message: { role: 'assistant' as const, content },
            finish_reason: 'stop' as const,
          }],
          usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
        },
      }
    }),
    chatStream: vi.fn(),
    listModels: vi.fn(),
  } as unknown as LLMOperations
}

/** 创建 mock Embedding */
function createMockEmbedding(dim: number): EmbeddingOperations {
  return {
    embed: vi.fn(async (req: { input: string | string[] }) => {
      const inputs = Array.isArray(req.input) ? req.input : [req.input]
      return {
        success: true as const,
        data: {
          model: 'test-embedding',
          data: inputs.map((_, i) => ({
            index: i,
            embedding: Array.from({ length: dim }, (_, j) => (i + j) * 0.1),
          })),
          usage: { prompt_tokens: inputs.length * 5, total_tokens: inputs.length * 5 },
        },
      }
    }),
    embedText: vi.fn(async () => ({
      success: true as const,
      data: Array.from({ length: dim }, (_, i) => i * 0.1),
    })),
    embedBatch: vi.fn(async (texts: string[]) => ({
      success: true as const,
      data: texts.map((_, i) => Array.from({ length: dim }, (_, j) => (i + j) * 0.1)),
    })),
  } as unknown as EmbeddingOperations
}

/** 创建 mock Retrieval（带信源引用） */
function createMockRetrieval(
  items: Array<{
    id: string
    content: string
    score: number
    sourceId: string
    citation?: { documentId?: string, title?: string, url?: string, chunkId?: string, collection?: string }
  }>,
): RetrievalOperations {
  return {
    addSource: vi.fn(() => ({ success: true as const, data: undefined })),
    removeSource: vi.fn(() => ({ success: true as const, data: undefined })),
    listSources: vi.fn(() => []),
    retrieve: vi.fn(async () => ({
      success: true as const,
      data: {
        items: items.map(item => ({
          ...item,
          metadata: {},
          citation: item.citation,
        })),
        query: 'test',
        duration: 50,
      },
    })),
  } as unknown as RetrievalOperations
}

// =============================================================================
// RAG + Citation 流程测试
// =============================================================================

describe('rAG + citation 跨模块流程', () => {
  it('rAG 查询结果包含聚合信源引用', async () => {
    const mockRetrieval = createMockRetrieval([
      {
        id: 'chunk-1',
        content: 'TypeScript is a typed superset of JavaScript.',
        score: 0.95,
        sourceId: 'docs',
        citation: {
          documentId: 'doc-ts-intro',
          title: 'TypeScript Introduction',
          url: 'https://docs.example.com/ts',
          chunkId: 'chunk-1',
          collection: 'docs',
        },
      },
      {
        id: 'chunk-2',
        content: 'TypeScript compiles to JavaScript.',
        score: 0.88,
        sourceId: 'docs',
        citation: {
          documentId: 'doc-ts-intro',
          title: 'TypeScript Introduction',
          url: 'https://docs.example.com/ts',
          chunkId: 'chunk-2',
          collection: 'docs',
        },
      },
      {
        id: 'chunk-3',
        content: 'Zod is used for schema validation.',
        score: 0.72,
        sourceId: 'libs',
        citation: {
          documentId: 'doc-zod',
          title: 'Zod Documentation',
          url: 'https://zod.dev',
          chunkId: 'chunk-3',
          collection: 'libs',
        },
      },
    ])
    const mockLLM = createMockLLM(['TypeScript is a typed superset of JavaScript that compiles to pure JavaScript.'])

    const rag = createRagOperations(mockLLM, mockRetrieval)
    const result = await rag.query('What is TypeScript?')
    expect(result.success).toBe(true)

    if (result.success) {
      // 回答包含内容
      expect(result.data.answer).toContain('TypeScript')
      // 上下文有 3 项
      expect(result.data.context).toHaveLength(3)
      // 引用去重后：doc-ts-intro 和 doc-zod 共 2 条
      expect(result.data.citations.length).toBe(2)
      // 引用里包含正确信息
      const titles = result.data.citations.map(c => c.title)
      expect(titles).toContain('TypeScript Introduction')
      expect(titles).toContain('Zod Documentation')
    }
  })

  it('rAG 结果无 citation 时 citations 为空数组', async () => {
    const mockRetrieval = createMockRetrieval([
      { id: 'chunk-1', content: 'Plain content', score: 0.9, sourceId: 'src' },
    ])
    const mockLLM = createMockLLM(['Answer'])
    const rag = createRagOperations(mockLLM, mockRetrieval)

    const result = await rag.query('test')
    expect(result.success).toBe(true)
    if (result.success) {
      // 无 citation 数据源时 citations 为空
      expect(result.data.citations).toHaveLength(0)
    }
  })

  it('rAG 传入历史消息 + citation 完整流程', async () => {
    const mockRetrieval = createMockRetrieval([
      {
        id: 'c1',
        content: 'Answer context',
        score: 0.85,
        sourceId: 'wiki',
        citation: { documentId: 'wiki-1', title: 'Wiki Page', chunkId: 'c1' },
      },
    ])
    const mockLLM = createMockLLM(['Here is the follow-up answer with source.'])
    const rag = createRagOperations(mockLLM, mockRetrieval)

    const result = await rag.query('Follow-up question?', {
      messages: [
        { role: 'user', content: 'Initial question' },
        { role: 'assistant', content: 'Initial answer' },
      ],
      topK: 3,
      temperature: 0.3,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.answer).toContain('follow-up')
      expect(result.data.citations).toHaveLength(1)
      expect(result.data.citations[0].documentId).toBe('wiki-1')

      // LLM 被调用时消息列表正确（system + history + user）
      const chatCall = (mockLLM.chat as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(chatCall.messages.length).toBeGreaterThanOrEqual(4)
      expect(chatCall.temperature).toBe(0.3)
    }
  })
})

// =============================================================================
// Retrieval 源管理 + 检索流程
// =============================================================================

describe('retrieval 源管理进阶', () => {
  it('多源管理：添加、列出、删除', async () => {
    const ops = createRetrievalOperations(createMockEmbedding(8))

    ops.addSource({ id: 'wiki', collection: 'wiki-docs', topK: 5, name: 'Wiki' })
    ops.addSource({ id: 'kb', collection: 'knowledge-base', topK: 10 })
    ops.addSource({ id: 'faq', collection: 'faq-docs', minScore: 0.8 })

    const sources = ops.listSources()
    expect(sources).toHaveLength(3)

    ops.removeSource('kb')
    expect(ops.listSources()).toHaveLength(2)

    // 再次删除同一个返回错误
    const result = ops.removeSource('kb')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.RETRIEVAL_SOURCE_NOT_FOUND)
    }
  })

  it('添加带完整信源信息的源', async () => {
    const ops = createRetrievalOperations(createMockEmbedding(8))

    const source: RetrievalSource = {
      id: 'project-docs',
      collection: 'project-v2',
      name: 'Project Documentation',
      sourceType: 'document',
      url: 'https://docs.example.com',
      topK: 5,
      minScore: 0.7,
      filter: { status: 'published' },
    }

    const result = ops.addSource(source)
    expect(result.success).toBe(true)

    const sources = ops.listSources()
    expect(sources[0]).toMatchObject({
      id: 'project-docs',
      collection: 'project-v2',
      name: 'Project Documentation',
      sourceType: 'document',
    })
  })
})

// =============================================================================
// Reasoning 策略进阶
// =============================================================================

describe('reasoning 跨模块进阶', () => {
  const defaultConfig = {
    llm: { model: 'gpt-4o', apiKey: 'test' },
  } as AIConfig

  it('coT 策略正确流转', async () => {
    const mockLLM = createMockLLM([
      'Step 1: Analyze the problem.\nStep 2: Calculate.\nFinal Answer: The result is 42.',
    ])
    const reasoning = createReasoningOperations(defaultConfig, mockLLM)

    const result = await reasoning.run('What is 6 * 7?', { strategy: 'cot' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.answer).toContain('42')
      expect(result.data.strategy).toBe('cot')
    }
  })

  it('reAct 策略多轮调用', async () => {
    const mockLLM = createMockLLM([
      'Paris is the capital of France.',
    ])
    const reasoning = createReasoningOperations(defaultConfig, mockLLM)

    const result = await reasoning.run('What is the capital of France?', {
      strategy: 'react',
      maxRounds: 5,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.answer).toContain('Paris')
      expect(result.data.strategy).toBe('react')
    }
  })

  it('空任务描述 reasoning 仍可执行（LLM 自行处理）', async () => {
    const mockLLM = createMockLLM(['Final Answer: I cannot help without a task.'])
    const reasoning = createReasoningOperations(defaultConfig, mockLLM)

    const result = await reasoning.run('', { strategy: 'cot' })
    expect(result.success).toBe(true)
  })
})

// =============================================================================
// Tools + Registry 组合场景
// =============================================================================

describe('tools 注册表组合场景', () => {
  it('批量注册 + 按名查找 + 执行', async () => {
    const registry = ai.tools.createRegistry()

    const add = ai.tools.define({
      name: 'add',
      description: '加法',
      parameters: z.object({ a: z.number(), b: z.number() }),
      handler: ({ a, b }) => a + b,
    })

    const multiply = ai.tools.define({
      name: 'multiply',
      description: '乘法',
      parameters: z.object({ a: z.number(), b: z.number() }),
      handler: ({ a, b }) => a * b,
    })

    registry.register(add)
    registry.register(multiply)

    // 按名查找
    const addTool = registry.get('add')
    expect(addTool).not.toBeNull()

    const mulTool = registry.get('multiply')
    expect(mulTool).not.toBeNull()

    // 执行
    if (addTool) {
      const result = await addTool.execute({ a: 3, b: 5 })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(8)
      }
    }

    if (mulTool) {
      const result = await mulTool.execute({ a: 4, b: 7 })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(28)
      }
    }
  })

  it('获取 OpenAI 兼容工具定义列表', async () => {
    const registry = ai.tools.createRegistry()

    registry.register(ai.tools.define({
      name: 'greet',
      description: '问候',
      parameters: z.object({ name: z.string() }),
      handler: ({ name }) => `Hello ${name}`,
    }))

    const defs = registry.getDefinitions()
    expect(defs).toHaveLength(1)
    expect(defs[0].type).toBe('function')
    expect(defs[0].function.name).toBe('greet')
  })

  it('注册表 unregister + re-register', async () => {
    const registry = ai.tools.createRegistry()

    const tool = ai.tools.define({
      name: 'temp',
      description: 'Temporary',
      parameters: z.object({}),
      handler: () => 'ok',
    })

    registry.register(tool)
    expect(registry.has('temp')).toBe(true)

    registry.unregister('temp')
    expect(registry.has('temp')).toBe(false)

    // 重新注册
    registry.register(tool)
    expect(registry.has('temp')).toBe(true)
  })
})

// =============================================================================
// Embedding 边界
// =============================================================================

describe('embedding 跨模块边界', () => {
  it('embedText 失败时 retrieval 正确传播错误', async () => {
    const failEmbedding: EmbeddingOperations = {
      embed: vi.fn(async () => ({
        success: false as const,
        error: { code: AIErrorCode.EMBEDDING_API_ERROR, message: 'API failed' },
      })),
      embedText: vi.fn(async () => ({
        success: false as const,
        error: { code: AIErrorCode.EMBEDDING_API_ERROR, message: 'API failed' },
      })),
      embedBatch: vi.fn(async () => ({
        success: false as const,
        error: { code: AIErrorCode.EMBEDDING_API_ERROR, message: 'API failed' },
      })),
    } as unknown as EmbeddingOperations

    const ops = createRetrievalOperations(failEmbedding)
    ops.addSource({ id: 'test', collection: 'test-coll' })

    // 使用 mock 来避免实际加载 vecdb
    const result = await ops.retrieve({ query: 'test' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.RETRIEVAL_FAILED)
    }
  })
})

// =============================================================================
// 配置变体
// =============================================================================

describe('配置变体初始化', () => {
  it('仅 LLM 配置，无 embedding 配置', async () => {
    ai.close()
    const result = await ai.init({ llm: { model: 'gpt-4o', apiKey: 'sk-test' } })
    expect(result.success).toBe(true)
    expect(ai.config?.llm?.model).toBe('gpt-4o')
    ai.close()
  })

  it('仅 embedding 配置', async () => {
    ai.close()
    const result = await ai.init({ llm: { apiKey: 'sk-test', scenarios: { embedding: 'text-embedding-3-small' } } })
    expect(result.success).toBe(true)
    expect(ai.config?.llm?.scenarios?.embedding).toBe('text-embedding-3-small')
    ai.close()
  })

  it('完整配置（LLM + Embedding）', async () => {
    ai.close()
    const result = await ai.init({
      llm: { model: 'gpt-4o', apiKey: 'sk-test', temperature: 0.7, maxTokens: 4096, scenarios: { embedding: 'text-embedding-3-large' } },
    })
    expect(result.success).toBe(true)
    expect(ai.config?.llm?.temperature).toBe(0.7)
    expect(ai.config?.llm?.scenarios?.embedding).toBe('text-embedding-3-large')
    ai.close()
  })

  it('空配置初始化（使用所有默认值）', async () => {
    ai.close()
    const result = await ai.init()
    expect(result.success).toBe(true)
    expect(ai.config).not.toBeNull()
    ai.close()
  })

  it('knowledge 配置项', async () => {
    ai.close()
    const result = await ai.init({
      llm: { model: 'gpt-4o', apiKey: 'sk-test' },
      knowledge: {
        chunkSize: 500,
        chunkOverlap: 50,
        entityExtraction: true,
      },
    })
    expect(result.success).toBe(true)
    ai.close()
  })
})
