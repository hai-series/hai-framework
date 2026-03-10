/**
 * AI RAG 子模块单元测试
 *
 * 测试 RAG 操作：上下文构建 + LLM 生成，使用 mock retrieval 和 mock LLM。
 */

import type { LLMOperations } from '../src/llm/ai-llm-types.js'
import type { RetrievalOperations } from '../src/retrieval/ai-retrieval-types.js'
import { describe, expect, it, vi } from 'vitest'
import { AIErrorCode } from '../src/ai-config.js'
import { createRagOperations } from '../src/rag/ai-rag-functions.js'

// ─── Mock 工厂 ───

function createMockLLM(answer: string): LLMOperations {
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
          message: { role: 'assistant' as const, content: answer },
          finish_reason: 'stop' as const,
        }],
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
      },
    })),
    chatStream: vi.fn(),
  } as unknown as LLMOperations
}

function createMockRetrieval(items: Array<{ id: string, content: string, score: number, sourceId: string }>): RetrievalOperations {
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
        })),
        totalCount: items.length,
        query: 'test query',
        duration: 100,
      },
    })),
  } as unknown as RetrievalOperations
}

function createFailRetrieval(): RetrievalOperations {
  return {
    addSource: vi.fn(() => ({ success: true as const, data: undefined })),
    removeSource: vi.fn(() => ({ success: true as const, data: undefined })),
    listSources: vi.fn(() => []),
    retrieve: vi.fn(async () => ({
      success: false as const,
      error: { code: 7600, message: 'Retrieval failed' },
    })),
  } as unknown as RetrievalOperations
}

// ─── 测试 ───

describe('rAG operations', () => {
  it('基本 RAG 查询', async () => {
    const mockRetrieval = createMockRetrieval([
      { id: 'doc-1', content: 'AI is artificial intelligence', score: 0.95, sourceId: 'wiki' },
      { id: 'doc-2', content: 'Machine learning is a subset of AI', score: 0.85, sourceId: 'wiki' },
    ])
    const mockLLM = createMockLLM('AI stands for Artificial Intelligence.')
    const rag = createRagOperations(mockLLM, mockRetrieval)

    const result = await rag.query('What is AI?')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.answer).toContain('Artificial Intelligence')
      expect(result.data.context.length).toBe(2)
      expect(result.data.query).toBe('What is AI?')
    }
  })

  it('rAG 传递 topK 和 model', async () => {
    const mockRetrieval = createMockRetrieval([
      { id: 'doc-1', content: 'Content', score: 0.9, sourceId: 'kb' },
    ])
    const mockLLM = createMockLLM('Answer')
    const rag = createRagOperations(mockLLM, mockRetrieval)

    const result = await rag.query('Question?', { topK: 3, model: 'gpt-4' })
    expect(result.success).toBe(true)

    // 验证 retrieval 被调用且传入了 topK
    expect(mockRetrieval.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({ topK: 3 }),
    )
  })

  it('自定义 systemPrompt', async () => {
    const mockRetrieval = createMockRetrieval([])
    const mockLLM = createMockLLM('Custom answer')
    const rag = createRagOperations(mockLLM, mockRetrieval)

    const result = await rag.query('Q?', { systemPrompt: 'You are a math tutor.' })
    expect(result.success).toBe(true)

    // 验证 LLM 被调用时 messages[0] 是 system
    const chatCall = (mockLLM.chat as any).mock.calls[0][0]
    expect(chatCall.messages[0].content).toContain('You are a math tutor.')
  })

  it('自定义 formatContext', async () => {
    const mockRetrieval = createMockRetrieval([
      { id: 'doc-1', content: 'Test content', score: 0.9, sourceId: 'wiki' },
    ])
    const mockLLM = createMockLLM('answer')
    const rag = createRagOperations(mockLLM, mockRetrieval)

    const customFormat = (items: any[]) =>
      items.map(i => `<doc>${i.content}</doc>`).join('\n')

    const result = await rag.query('Q?', { formatContext: customFormat })
    expect(result.success).toBe(true)

    // 验证自定义格式被应用
    const chatCall = (mockLLM.chat as any).mock.calls[0][0]
    expect(chatCall.messages[0].content).toContain('<doc>Test content</doc>')
  })

  it('多轮对话传入 messages', async () => {
    const mockRetrieval = createMockRetrieval([
      { id: 'doc-1', content: 'Info', score: 0.8, sourceId: 'kb' },
    ])
    const mockLLM = createMockLLM('Follow-up answer')
    const rag = createRagOperations(mockLLM, mockRetrieval)

    const result = await rag.query('Follow-up question?', {
      messages: [
        { role: 'user', content: 'Previous question' },
        { role: 'assistant', content: 'Previous answer' },
      ],
    })
    expect(result.success).toBe(true)

    // 验证 messages 包含历史
    const chatCall = (mockLLM.chat as any).mock.calls[0][0]
    expect(chatCall.messages.length).toBeGreaterThanOrEqual(4) // system + 2 history + user
  })

  it('retrieval 失败时返回 RAG_CONTEXT_BUILD_FAILED', async () => {
    const failRetrieval = createFailRetrieval()
    const mockLLM = createMockLLM('')
    const rag = createRagOperations(mockLLM, failRetrieval)

    const result = await rag.query('test')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.RAG_CONTEXT_BUILD_FAILED)
    }
  })

  it('lLM 失败时返回 RAG_FAILED', async () => {
    const mockRetrieval = createMockRetrieval([
      { id: 'doc-1', content: 'content', score: 0.9, sourceId: 'wiki' },
    ])
    const failLLM = {
      chat: vi.fn(async () => ({
        success: false as const,
        error: { code: 7000, message: 'LLM error' },
      })),
      chatStream: vi.fn(),
    } as unknown as LLMOperations

    const rag = createRagOperations(failLLM, mockRetrieval)
    const result = await rag.query('test')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.RAG_FAILED)
    }
  })
})

// =============================================================================
// queryStream 测试
// =============================================================================

describe('rAG queryStream', () => {
  it('流式查询产出 context → delta → done 事件', async () => {
    const mockRetrieval = createMockRetrieval([
      { id: 'doc-1', content: 'AI knowledge', score: 0.9, sourceId: 'wiki' },
    ])

    const streamLLM: LLMOperations = {
      chat: vi.fn(),
      chatStream: vi.fn(() => (async function* () {
        yield {
          id: 'chunk-1',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'gpt-4o-mini',
          choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
        }
        yield {
          id: 'chunk-2',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'gpt-4o-mini',
          choices: [{ index: 0, delta: { content: ' World' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
        }
      })()),
    } as unknown as LLMOperations

    const rag = createRagOperations(streamLLM, mockRetrieval)
    const events: unknown[] = []

    for await (const event of rag.queryStream('test query')) {
      events.push(event)
    }

    // 第一个事件是 context
    expect(events[0]).toMatchObject({ type: 'context' })
    // 中间事件是 delta
    expect(events[1]).toMatchObject({ type: 'delta', text: 'Hello' })
    expect(events[2]).toMatchObject({ type: 'delta', text: ' World' })
    // 最后事件是 done
    expect(events[3]).toMatchObject({ type: 'done', answer: 'Hello World' })
  })

  it('retrieval 失败时 queryStream 抛出异常', async () => {
    const failRetrieval = createFailRetrieval()
    const mockLLM = createMockLLM('unused')
    const rag = createRagOperations(mockLLM, failRetrieval)

    await expect(async () => {
      for await (const _event of rag.queryStream('test')) {
        // 应该在第一次迭代时抛出
      }
    }).rejects.toThrow()
  })
})
