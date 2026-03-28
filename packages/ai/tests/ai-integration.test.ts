/**
 * AI 全流程集成测试
 *
 * 通过 `ai` 统一入口，测试各子功能在初始化后的协同工作。
 * 使用 mock OpenAI SDK 隔离外部依赖，验证子功能间的接口衔接。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ai, HaiAIError } from '../src/index.js'

// =============================================================================
// Mock OpenAI SDK（供 LLM + Embedding 使用）
// =============================================================================

const { mockCreate, mockEmbeddingCreate, mockListModels } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockEmbeddingCreate: vi.fn(),
  mockListModels: vi.fn(),
}))

vi.mock('openai', () => {
  function MockOpenAI() {
    return {
      chat: { completions: { create: mockCreate } },
      embeddings: { create: mockEmbeddingCreate },
      models: { list: mockListModels },
    }
  }
  MockOpenAI.APIError = class extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  }
  return { default: MockOpenAI }
})

// =============================================================================
// 辅助函数
// =============================================================================

/** 构造标准 chat 响应 */
function chatResponse(content: string) {
  return {
    id: 'resp-1',
    object: 'chat.completion',
    created: Date.now(),
    model: 'gpt-4o-mini',
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}

/** 构造 embedding 响应 */
function embeddingResponse(dim: number, count = 1) {
  return {
    model: 'text-embedding-3-small',
    data: Array.from({ length: count }, (_, i) => ({
      index: i,
      embedding: Array.from({ length: dim }, (_, j) => (i + j) * 0.1),
    })),
    usage: { prompt_tokens: count * 5, total_tokens: count * 5 },
  }
}

// =============================================================================
// 测试
// =============================================================================

describe('ai 全流程集成', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await ai.init({
      llm: { model: 'gpt-4o-mini', apiKey: 'sk-test' },
      embedding: { model: 'text-embedding-3-small', apiKey: 'sk-test' },
    })
  })

  afterEach(() => {
    ai.close()
  })

  // ─── 初始化后各子模块可用 ───

  it('初始化后所有子模块可用', () => {
    expect(ai.isInitialized).toBe(true)
    expect(ai.config).not.toBeNull()

    // 验证各子模块为非空对象
    expect(ai.llm).toBeDefined()
    expect(ai.mcp).toBeDefined()
    expect(ai.tools).toBeDefined()
    expect(ai.stream).toBeDefined()
    expect(ai.embedding).toBeDefined()
    expect(ai.reasoning).toBeDefined()
    expect(ai.retrieval).toBeDefined()
    expect(ai.rag).toBeDefined()
    expect(ai.knowledge).toBeDefined()
  })

  // ─── LLM + Tools 协同 ───

  it('lLM chat + tool define + tool execute 全流程', async () => {
    // 定义工具
    const calculator = ai.tools.define({
      name: 'calculate',
      description: '计算数学表达式',
      parameters: z.object({ expression: z.string() }),
      handler: ({ expression }) => {
        return String(expression)
      },
    })

    // 工具可执行
    const toolResult = await calculator.execute({ expression: '2+3' })
    expect(toolResult.success).toBe(true)
    if (toolResult.success) {
      expect(toolResult.data).toBe('2+3')
    }

    // LLM chat 正常使用
    mockCreate.mockResolvedValueOnce(chatResponse('The answer is 5'))
    const chatResult = await ai.llm.chat({
      messages: [{ role: 'user', content: 'What is 2+3?' }],
    })
    expect(chatResult.success).toBe(true)
    if (chatResult.success) {
      expect(chatResult.data.choices[0].message.content).toContain('5')
    }
  })

  // ─── LLM + Embedding 协同 ───

  it('lLM chat + embedding 向量化在同一会话中工作', async () => {
    // LLM chat
    mockCreate.mockResolvedValueOnce(chatResponse('AI is amazing'))
    const chatResult = await ai.llm.chat({
      messages: [{ role: 'user', content: 'Tell me about AI' }],
    })
    expect(chatResult.success).toBe(true)

    // Embedding
    mockEmbeddingCreate.mockResolvedValueOnce(embeddingResponse(8, 1))
    const embedResult = await ai.embedding.embedText('AI is amazing')
    expect(embedResult.success).toBe(true)
    if (embedResult.success) {
      expect(Array.isArray(embedResult.data)).toBe(true)
      expect(embedResult.data.length).toBe(8)
    }
  })

  // ─── Embedding 批量 ───

  it('embedding 批量向量化', async () => {
    mockEmbeddingCreate.mockResolvedValueOnce(embeddingResponse(8, 3))
    const result = await ai.embedding.embedBatch(['text1', 'text2', 'text3'])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(3)
      expect(result.data[0]).toHaveLength(8)
    }
  })

  // ─── Tools 注册表 ───

  it('tools.createRegistry 注册与查询', () => {
    const registry = ai.tools.createRegistry()

    const tool1 = ai.tools.define({
      name: 'search',
      description: '搜索',
      parameters: z.object({ query: z.string() }),
      handler: ({ query }) => `results for ${query}`,
    })

    const tool2 = ai.tools.define({
      name: 'translate',
      description: '翻译',
      parameters: z.object({ text: z.string(), lang: z.string() }),
      handler: ({ text }) => text,
    })

    registry.register(tool1)
    registry.register(tool2)

    expect(registry.has('search')).toBe(true)
    expect(registry.has('translate')).toBe(true)
    expect(registry.has('nonexistent')).toBe(false)
    expect(registry.getNames()).toHaveLength(2)
  })

  // ─── MCP 注册与调用 ───

  it('mCP 工具注册 + LLM chat 在初始化后均可用', async () => {
    // MCP 注册
    const regResult = ai.mcp.registerTool(
      { name: 'echo', description: 'Echo', inputSchema: { type: 'object' } },
      async (input: unknown) => input,
    )
    expect(regResult.success).toBe(true)

    // MCP 调用
    const callResult = await ai.mcp.callTool('echo', { msg: 'hello' })
    expect(callResult.success).toBe(true)
    if (callResult.success) {
      expect(callResult.data).toEqual({ msg: 'hello' })
    }

    // LLM 同时可用
    mockCreate.mockResolvedValueOnce(chatResponse('ok'))
    const chatResult = await ai.llm.chat({
      messages: [{ role: 'user', content: 'test' }],
    })
    expect(chatResult.success).toBe(true)
  })

  // ─── Stream 工具（纯函数） ───

  it('stream 操作在初始化前后均可用', () => {
    // encodeSSE 不需要初始化
    const sse = ai.stream.encodeSSE({
      event: 'message',
      data: JSON.stringify({ content: 'hello' }),
    })
    expect(sse).toContain('event: message')
    expect(sse).toContain('data: ')
  })

  // ─── Retrieval 源管理 ───

  it('retrieval 源管理通过 ai.retrieval 可用', () => {
    const addResult = ai.retrieval.addSource({
      id: 'wiki',
      collection: 'wiki-docs',
      topK: 5,
      name: 'Wikipedia',
    })
    expect(addResult.success).toBe(true)

    const sources = ai.retrieval.listSources()
    expect(sources).toHaveLength(1)
    expect(sources[0].id).toBe('wiki')

    const removeResult = ai.retrieval.removeSource('wiki')
    expect(removeResult.success).toBe(true)
  })

  // ─── 重新初始化不互相干扰 ───

  it('重新初始化后子模块状态重置', async () => {
    // 注册 MCP 工具
    ai.mcp.registerTool(
      { name: 'temp-tool', description: 'Test', inputSchema: { type: 'object' } },
      async () => 'ok',
    )

    // 添加 retrieval 源
    ai.retrieval.addSource({ id: 'src-1', collection: 'coll-1' })

    // 重新初始化
    const result = await ai.init({
      llm: { model: 'gpt-4o', apiKey: 'sk-new' },
      embedding: { model: 'text-embedding-3-small', apiKey: 'sk-new' },
    })
    expect(result.success).toBe(true)

    // MCP 工具已重置
    const callResult = await ai.mcp.callTool('temp-tool', {})
    expect(callResult.success).toBe(false)

    // Retrieval 源已重置
    expect(ai.retrieval.listSources()).toHaveLength(0)
  })

  // ─── Close 后子模块返回 NOT_INITIALIZED ───

  it('close 后各子模块返回 NOT_INITIALIZED', async () => {
    ai.close()

    expect(ai.isInitialized).toBe(false)

    // LLM
    const chatResult = await ai.llm.chat({ messages: [{ role: 'user', content: 'test' }] })
    expect(chatResult.success).toBe(false)
    if (!chatResult.success) {
      expect(chatResult.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }

    // Embedding
    const embedResult = await ai.embedding.embedText('test')
    expect(embedResult.success).toBe(false)
    if (!embedResult.success) {
      expect(embedResult.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }

    // Reasoning
    const reasonResult = await ai.reasoning.run({ task: 'test', strategy: 'cot' })
    expect(reasonResult.success).toBe(false)
    if (!reasonResult.success) {
      expect(reasonResult.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }

    // RAG
    const ragResult = await ai.rag.query('test')
    expect(ragResult.success).toBe(false)
    if (!ragResult.success) {
      expect(ragResult.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }

    // Knowledge
    const knowledgeResult = await ai.knowledge.retrieve({ query: 'test', collection: 'test' })
    expect(knowledgeResult.success).toBe(false)
    if (!knowledgeResult.success) {
      expect(knowledgeResult.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }

    // tools 和 stream 是纯函数，仍可用
    const tool = ai.tools.define({
      name: 'test',
      description: 'test',
      parameters: z.object({}),
      handler: () => 'ok',
    })
    const toolResult = await tool.execute({})
    expect(toolResult.success).toBe(true)
  })
})
