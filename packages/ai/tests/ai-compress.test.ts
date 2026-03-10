/**
 * AI Compress 子模块单元测试
 *
 * 测试上下文压缩：滑动窗口、摘要、混合策略。
 */

import type { CompressConfig, SummaryConfig, TokenConfig } from '../src/ai-config.js'
import type { ChatMessage, LLMOperations } from '../src/llm/ai-llm-types.js'

import { describe, expect, it, vi } from 'vitest'
import { createCompressOperations } from '../src/compress/ai-compress-functions.js'
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
const defaultCompressConfig: CompressConfig = {
  defaultStrategy: 'hybrid',
  defaultMaxTokens: 0,
  preserveLastN: 4,
}

function createOps(
  compressConfig: CompressConfig,
  llm: LLMOperations,
  modelMaxTokens: number,
) {
  const tokenOps = createTokenOperations(defaultTokenConfig)
  const summaryOps = createSummaryOperations(defaultLLMConfig, llm, tokenOps, defaultSummaryConfig)
  return createCompressOperations(compressConfig, tokenOps, summaryOps, modelMaxTokens)
}

/**
 * 生成 N 条用户/助手交替消息
 */
function generateMessages(count: number, msgLength = 200): ChatMessage[] {
  const messages: ChatMessage[] = []
  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? 'user' : 'assistant'
    const content = `Message ${i}: ${'x'.repeat(msgLength)}`
    if (role === 'user') {
      messages.push({ role: 'user', content })
    }
    else {
      messages.push({ role: 'assistant', content })
    }
  }
  return messages
}

// ─── compress 测试 ───

describe('compress tryCompress', () => {
  it('不需要压缩时原样返回', async () => {
    const llm = createMockLLM([])
    const ops = createOps(defaultCompressConfig, llm, 100000)

    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ]

    const result = await ops.tryCompress(messages, { maxTokens: 10000 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.messages).toHaveLength(2)
      expect(result.data.removedCount).toBe(0)
      expect(result.data.originalTokens).toBe(result.data.compressedTokens)
    }
  })

  it('sliding-window 截断旧消息', async () => {
    const llm = createMockLLM([])
    const ops = createOps(defaultCompressConfig, llm, 8000)

    const messages = generateMessages(20, 500)

    const result = await ops.tryCompress(messages, {
      strategy: 'sliding-window',
      maxTokens: 500,
      preserveLastN: 4,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.removedCount).toBeGreaterThan(0)
      expect(result.data.compressedTokens).toBeLessThanOrEqual(500)
      expect(result.data.messages.length).toBeLessThan(messages.length)
    }
  })

  it('sliding-window 保留 system 消息', async () => {
    const llm = createMockLLM([])
    const ops = createOps(defaultCompressConfig, llm, 8000)

    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful assistant' },
      ...generateMessages(20, 500),
    ]

    const result = await ops.tryCompress(messages, {
      strategy: 'sliding-window',
      maxTokens: 500,
      preserveSystem: true,
      preserveLastN: 2,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      const systemMsgs = result.data.messages.filter(m => m.role === 'system')
      expect(systemMsgs.length).toBeGreaterThanOrEqual(1)
      expect((systemMsgs[0] as { content: string }).content).toBe('You are a helpful assistant')
    }
  })

  it('summary 策略生成摘要替换旧消息', async () => {
    const llm = createMockLLM([{
      content: 'Summary: The user asked about TypeScript and received explanations.',
    }])
    const ops = createOps(defaultCompressConfig, llm, 8000)

    const messages = generateMessages(20, 500)

    const result = await ops.tryCompress(messages, {
      strategy: 'summary',
      maxTokens: 500,
      preserveLastN: 4,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.summary).toBeDefined()
      expect(result.data.removedCount).toBeGreaterThan(0)
      const summaryMsg = result.data.messages.find(m =>
        m.role === 'system' && (m as { content: string }).content.includes('[Conversation Summary]'),
      )
      expect(summaryMsg).toBeDefined()
    }
  })

  it('hybrid 策略先窗口后摘要', async () => {
    const llm = createMockLLM([{
      content: 'Hybrid summary of older messages.',
    }])
    const ops = createOps(defaultCompressConfig, llm, 8000)

    const messages = generateMessages(30, 500)

    const result = await ops.tryCompress(messages, {
      strategy: 'hybrid',
      maxTokens: 500,
      preserveLastN: 2,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.removedCount).toBeGreaterThan(0)
    }
  })
})
