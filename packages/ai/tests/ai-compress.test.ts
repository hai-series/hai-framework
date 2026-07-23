/**
 * AI Compress 子模块单元测试
 *
 * 测试上下文压缩：滑动窗口、摘要、混合策略。
 */

import type { CompressConfig, SummaryConfig, TokenConfig } from '../src/ai-config.js'
import type { ChatMessage, LLMOperations } from '../src/llm/ai-llm-types.js'
import type { TokenOperations } from '../src/token/ai-token-types.js'

import { describe, expect, it, vi } from 'vitest'
import { HaiAIError } from '../src/ai-types.js'
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
  tokenOps: TokenOperations = createTokenOperations(defaultTokenConfig),
) {
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
      maxTokens: 650,
      preserveLastN: 4,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.removedCount).toBeGreaterThan(0)
      expect(result.data.compressedTokens).toBeLessThanOrEqual(650)
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

  it('sliding-window 对长对话只线性扫描消息载荷', async () => {
    const llm = createMockLLM([])
    const baseTokenOps = createTokenOperations(defaultTokenConfig)
    let inspectedMessageCount = 0
    const tokenOps: TokenOperations = {
      estimateText: baseTokenOps.estimateText,
      estimateMessages(messages) {
        inspectedMessageCount += messages.length
        return baseTokenOps.estimateMessages(messages)
      },
    }
    const ops = createOps(defaultCompressConfig, llm, 8000, tokenOps)
    const messages = generateMessages(200, 40)

    const result = await ops.tryCompress(messages, {
      strategy: 'sliding-window',
      maxTokens: 2400,
      preserveLastN: 2,
    })

    expect(result.success).toBe(true)
    expect(inspectedMessageCount).toBeLessThan(1000)
  })

  it('sliding-window 不拆分 assistant tool_calls 与并行 tool results', async () => {
    const llm = createMockLLM([])
    const ops = createOps(defaultCompressConfig, llm, 8000)
    const messages: ChatMessage[] = [
      { role: 'user', content: `Old question ${'x'.repeat(4000)}` },
      { role: 'assistant', content: `Old answer ${'x'.repeat(4000)}` },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-owner',
            type: 'function',
            function: { name: 'lookup_owner', arguments: '{"taskId":"task-1"}' },
          },
          {
            id: 'call-calendar',
            type: 'function',
            function: { name: 'lookup_calendar', arguments: '{"ownerId":"owner-1"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call-owner', content: '{"owner":"Alice"}' },
      { role: 'tool', tool_call_id: 'call-calendar', content: '{"available":true}' },
      { role: 'user', content: 'Use these results to finish the assignment.' },
    ]

    const result = await ops.tryCompress(messages, {
      strategy: 'sliding-window',
      maxTokens: 500,
      preserveLastN: 3,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      const retained = result.data.messages
      expect(retained.some(message => message.role === 'assistant' && message.tool_calls?.length === 2)).toBe(true)
      expect(retained.filter(message => message.role === 'tool').map(message => message.tool_call_id)).toEqual([
        'call-owner',
        'call-calendar',
      ])
      expect(retained.at(-1)).toEqual({ role: 'user', content: 'Use these results to finish the assignment.' })
    }
  })

  it('sliding-window 在最新用户消息自身超预算时返回显式预算错误', async () => {
    const llm = createMockLLM([])
    const ops = createOps(defaultCompressConfig, llm, 8000)
    const latestUserMessage: ChatMessage = {
      role: 'user',
      content: `Required current input ${'x'.repeat(4000)}`,
    }
    const messages: ChatMessage[] = [
      { role: 'user', content: `Old question ${'x'.repeat(4000)}` },
      { role: 'assistant', content: `Old answer ${'x'.repeat(4000)}` },
      latestUserMessage,
    ]

    const result = await ops.tryCompress(messages, {
      strategy: 'sliding-window',
      maxTokens: 200,
      preserveLastN: 1,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.CONTEXT_BUDGET_EXCEEDED.code)
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
      maxTokens: 800,
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

  it('summary 保留内容以摘要前缀开头的调用方 system 消息', async () => {
    const llm = createMockLLM([{ content: 'Compressed conversation.' }])
    const ops = createOps(defaultCompressConfig, llm, 8000)
    const callerSystemMessage: ChatMessage = {
      role: 'system',
      content: '[Conversation Summary]\nThis is a permanent caller instruction.',
    }
    const messages: ChatMessage[] = [callerSystemMessage, ...generateMessages(20, 500)]

    const result = await ops.tryCompress(messages, {
      strategy: 'summary',
      maxTokens: 800,
      preserveSystem: true,
      preserveLastN: 4,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.messages).toContainEqual(callerSystemMessage)
    }
  })

  it('summary 仅按框架 name 标记替换旧摘要', async () => {
    const llm = createMockLLM([{ content: 'Replacement summary.' }])
    const ops = createOps(defaultCompressConfig, llm, 8000)
    const existingSummary: ChatMessage = {
      role: 'system',
      name: 'hai_internal_conversation_summary_v1',
      content: 'Existing framework summary without a display prefix.',
    }
    const messages: ChatMessage[] = [existingSummary, ...generateMessages(20, 500)]

    const result = await ops.tryCompress(messages, {
      strategy: 'summary',
      maxTokens: 800,
      preserveSystem: true,
      preserveLastN: 4,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      const generatedSummaries = result.data.messages.filter(message =>
        message.role === 'system' && message.name === 'hai_internal_conversation_summary_v1',
      )
      expect(generatedSummaries).toHaveLength(1)
      expect(generatedSummaries[0]?.content).toBe('[Conversation Summary]\nReplacement summary.')
    }
  })

  it('summary 多次压缩只保留最新的框架摘要', async () => {
    const llm = createMockLLM([
      { content: 'First summary.' },
      { content: 'Second summary.' },
    ])
    const ops = createOps(defaultCompressConfig, llm, 8000)
    const firstResult = await ops.tryCompress(generateMessages(20, 500), {
      strategy: 'summary',
      maxTokens: 800,
      preserveLastN: 4,
    })
    expect(firstResult.success).toBe(true)
    if (!firstResult.success)
      return

    const secondResult = await ops.tryCompress(
      [...firstResult.data.messages, ...generateMessages(20, 500)],
      {
        strategy: 'summary',
        maxTokens: 800,
        preserveLastN: 4,
      },
    )

    expect(secondResult.success).toBe(true)
    if (secondResult.success) {
      const generatedSummaries = secondResult.data.messages.filter(message =>
        message.role === 'system' && message.name === 'hai_internal_conversation_summary_v1',
      )
      expect(generatedSummaries).toHaveLength(1)
      expect(generatedSummaries[0]?.content).toBe('[Conversation Summary]\nSecond summary.')
    }
  })

  it('hybrid 摘要降级保留与摘要前缀冲突的调用方 system 消息', async () => {
    const llm = createMockLLM([{ content: 'Replacement summary.' }])
    const ops = createOps(defaultCompressConfig, llm, 8000)
    const callerSystemMessage: ChatMessage = {
      role: 'system',
      content: '[Conversation Summary]\nThis caller instruction must remain permanent.',
    }
    const existingSummary: ChatMessage = {
      role: 'system',
      name: 'hai_internal_conversation_summary_v1',
      content: `[Conversation Summary]\n${'x'.repeat(2000)}`,
    }

    const result = await ops.tryCompress(
      [callerSystemMessage, existingSummary, ...generateMessages(6, 50)],
      {
        strategy: 'hybrid',
        maxTokens: 300,
        preserveSystem: true,
        preserveLastN: 2,
      },
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.messages).toContainEqual(callerSystemMessage)
      expect(result.data.messages.filter(message =>
        message.role === 'system' && message.name === 'hai_internal_conversation_summary_v1',
      )).toHaveLength(1)
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
