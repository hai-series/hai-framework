/**
 * AI Summary 子模块单元测试
 *
 * 测试摘要生成：全量摘要、增量摘要、LLM 失败处理。
 */

import type { SummaryConfig, TokenConfig } from '../src/ai-config.js'
import type { ChatMessage, LLMOperations } from '../src/llm/ai-llm-types.js'

import { describe, expect, it, vi } from 'vitest'
import { createSummaryOperations } from '../src/summary/ai-summary-functions.js'
import { createTokenOperations } from '../src/token/ai-token-functions.js'

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

const defaultLLMConfig = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: 'test-key',
  maxTokens: 4096,
  temperature: 0.7,
  timeout: 60000,
}

const defaultTokenConfig: TokenConfig = { tokenRatio: 0.25 }
const defaultSummaryConfig: SummaryConfig = {}

function createOps(
  llm: LLMOperations,
  summaryConfig: SummaryConfig = defaultSummaryConfig,
) {
  const tokenOps = createTokenOperations(defaultTokenConfig)
  return createSummaryOperations(defaultLLMConfig, llm, tokenOps, summaryConfig)
}

// ─── summarize 测试 ───

describe('summary summarize', () => {
  it('生成消息摘要', async () => {
    const llm = createMockLLM([{
      content: 'The user discussed project architecture and testing strategies.',
    }])
    const ops = createOps(llm)

    const messages: ChatMessage[] = [
      { role: 'user', content: 'Let\'s talk about the project architecture.' },
      { role: 'assistant', content: 'Sure, what aspects are you interested in?' },
      { role: 'user', content: 'Testing strategies specifically.' },
    ]

    const result = await ops.summarize(messages)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.summary).toContain('architecture')
      expect(result.data.coveredMessages).toBeGreaterThan(0)
      expect(result.data.tokenCount).toBeGreaterThan(0)
    }
  })

  it('增量摘要传入 previousSummary', async () => {
    const llm = createMockLLM([{
      content: 'Updated summary including previous context and new topics.',
    }])
    const ops = createOps(llm)

    const result = await ops.summarize(
      [{ role: 'user', content: 'New topic about deployment.' }],
      { previousSummary: 'Previously discussed testing.' },
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.summary).toBeTruthy()
    }
  })

  it('支持通过 options.systemPrompt 自定义摘要提示词', async () => {
    const llm = createMockLLM([{
      content: 'Custom prompt summary.',
    }])
    const ops = createOps(llm, { systemPrompt: 'Use configured summary prompt.' })

    const result = await ops.summarize(
      [{ role: 'user', content: 'Please summarize only key decisions.' }],
      {
        systemPrompt: 'Focus on product decisions and pending action items.',
        previousSummary: 'Earlier discussion covered the release scope.',
      },
    )

    expect(result.success).toBe(true)
    expect(llm.chat).toHaveBeenCalledOnce()

    const [request] = vi.mocked(llm.chat).mock.calls[0] ?? []
    expect(request?.messages[0]).toEqual({
      role: 'system',
      content: expect.stringContaining('Focus on product decisions and pending action items.'),
    })
    expect(request?.messages[0]?.content).toContain('Earlier discussion covered the release scope.')
  })

  it('lLM 失败返回错误', async () => {
    const failingLLM: LLMOperations = {
      chat: vi.fn(async () => ({
        success: false as const,
        error: { code: 7000, message: 'LLM error' },
      })),
      chatStream: vi.fn(),
      listModels: vi.fn(),
    } as unknown as LLMOperations

    const ops = createOps(failingLLM)
    const result = await ops.summarize([{ role: 'user', content: 'test' }])
    expect(result.success).toBe(false)
  })
})

// ─── generate 测试 ───

describe('summary generate', () => {
  it('仅生成摘要文本', async () => {
    const llm = createMockLLM([{
      content: 'Summary text only.',
    }])
    const ops = createOps(llm)

    const result = await ops.generate([{ role: 'user', content: 'Hello' }])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('Summary text only.')
    }
  })

  it('generate 支持覆盖默认 systemPrompt', async () => {
    const llm = createMockLLM([{
      content: 'Summary text only.',
    }])
    const ops = createOps(llm, { systemPrompt: 'Use configured summary prompt.' })

    const result = await ops.generate(
      [{ role: 'user', content: 'Hello' }],
      { systemPrompt: 'Summarize in one short paragraph.' },
    )

    expect(result.success).toBe(true)
    expect(llm.chat).toHaveBeenCalledOnce()

    const [request] = vi.mocked(llm.chat).mock.calls[0] ?? []
    expect(request?.messages[0]).toEqual({
      role: 'system',
      content: 'Summarize in one short paragraph.',
    })
  })
})
