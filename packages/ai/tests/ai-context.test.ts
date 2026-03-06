/**
 * AI Context 子模块单元测试
 *
 * 测试上下文压缩（滑动窗口、摘要、混合）、Token 估算、摘要生成、有状态管理器。
 */

import type { ContextConfig } from '../src/ai-config.js'
import type { ChatMessage, LLMOperations } from '../src/llm/ai-llm-types.js'

import { describe, expect, it, vi } from 'vitest'
import { createContextOperations } from '../src/context/ai-context-functions.js'
import { estimateMessagesTokens, estimateTextTokens } from '../src/context/ai-context-token.js'

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

const defaultConfig: ContextConfig = {
  defaultStrategy: 'hybrid',
  defaultMaxTokens: 0,
  preserveLastN: 4,
  tokenRatio: 0.25,
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

// ─── Token 估算测试 ───

describe('estimateTextTokens', () => {
  it('英文文本估算', () => {
    const text = 'Hello world, this is a test string'
    const tokens = estimateTextTokens(text, 0.25)
    expect(tokens).toBeGreaterThan(0)
    // 33 字符 * 0.25 ≈ 9 tokens
    expect(tokens).toBeLessThan(20)
  })

  it('中文文本估算（每字约 1.5 token）', () => {
    const text = '你好世界测试'
    const tokens = estimateTextTokens(text, 0.25)
    // 6 个中文字 * 1.5 = 9 tokens
    expect(tokens).toBe(9)
  })

  it('空文本返回 0', () => {
    expect(estimateTextTokens('', 0.25)).toBe(0)
  })

  it('混合中英文', () => {
    const text = '你好 Hello 世界 World'
    const tokens = estimateTextTokens(text, 0.25)
    // 4 个中文字 * 1.5 = 6, 其余约 (12 chars * 0.25) = 3; total ≈ 9
    expect(tokens).toBeGreaterThan(5)
  })
})

describe('estimateMessagesTokens', () => {
  it('计算消息 token 包含开销', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Hello' },
    ]
    const tokens = estimateMessagesTokens(messages, 0.25)
    // 每条消息 4 token 开销 + 内容 + 2 回复标记
    expect(tokens).toBeGreaterThan(10)
  })

  it('空消息列表返回基础开销', () => {
    const tokens = estimateMessagesTokens([], 0.25)
    // 只有回复起始标记 2
    expect(tokens).toBe(2)
  })
})

// ─── compress 测试 ───

describe('context compress', () => {
  it('不需要压缩时原样返回', async () => {
    const llm = createMockLLM([])
    const ops = createContextOperations(defaultConfig, llm, 100000)

    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ]

    const result = await ops.compress(messages, { maxTokens: 10000 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.messages).toHaveLength(2)
      expect(result.data.removedCount).toBe(0)
      expect(result.data.originalTokens).toBe(result.data.compressedTokens)
    }
  })

  it('sliding-window 截断旧消息', async () => {
    const llm = createMockLLM([])
    const ops = createContextOperations(defaultConfig, llm, 8000)

    // 生成 20 条长消息
    const messages = generateMessages(20, 500)

    const result = await ops.compress(messages, {
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
    const ops = createContextOperations(defaultConfig, llm, 8000)

    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful assistant' },
      ...generateMessages(20, 500),
    ]

    const result = await ops.compress(messages, {
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
    const ops = createContextOperations(defaultConfig, llm, 8000)

    const messages = generateMessages(20, 500)

    const result = await ops.compress(messages, {
      strategy: 'summary',
      maxTokens: 500,
      preserveLastN: 4,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.summary).toBeDefined()
      expect(result.data.removedCount).toBeGreaterThan(0)
      // 应包含摘要消息
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
    const ops = createContextOperations(defaultConfig, llm, 8000)

    const messages = generateMessages(30, 500)

    const result = await ops.compress(messages, {
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

// ─── summarize 测试 ───

describe('context summarize', () => {
  it('生成消息摘要', async () => {
    const llm = createMockLLM([{
      content: 'The user discussed project architecture and testing strategies.',
    }])
    const ops = createContextOperations(defaultConfig, llm, 8000)

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
    const ops = createContextOperations(defaultConfig, llm, 8000)

    const result = await ops.summarize(
      [{ role: 'user', content: 'New topic about deployment.' }],
      { previousSummary: 'Previously discussed testing.' },
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.summary).toBeTruthy()
    }
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

    const ops = createContextOperations(defaultConfig, failingLLM, 8000)
    const result = await ops.summarize([{ role: 'user', content: 'test' }])
    expect(result.success).toBe(false)
  })
})

// ─── estimateTokens 测试 ───

describe('context estimateTokens', () => {
  it('返回 token 估算结果', () => {
    const llm = createMockLLM([])
    const ops = createContextOperations(defaultConfig, llm, 8000)

    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello world' },
      { role: 'assistant', content: 'Hi there' },
    ]

    const result = ops.estimateTokens(messages)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBeGreaterThan(0)
    }
  })
})

// ─── createManager 测试 ───

describe('context createManager', () => {
  it('创建管理器成功', () => {
    const llm = createMockLLM([])
    const ops = createContextOperations(defaultConfig, llm, 8000)

    const result = ops.createManager({ maxTokens: 4000 })
    expect(result.success).toBe(true)
    if (result.success) {
      const messages = result.data.getMessages()
      expect(messages.success).toBe(true)
      if (messages.success) {
        expect(messages.data).toHaveLength(0)
      }
    }
  })

  it('追加消息并获取', async () => {
    const llm = createMockLLM([])
    const ops = createContextOperations(defaultConfig, llm, 100000)

    const managerResult = ops.createManager({ maxTokens: 100000 })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const manager = managerResult.data
    await manager.append({ role: 'user', content: 'Hello' })
    await manager.append({ role: 'assistant', content: 'Hi there' })

    const messages = manager.getMessages()
    expect(messages.success).toBe(true)
    if (messages.success) {
      expect(messages.data).toHaveLength(2)
    }
  })

  it('超限时自动压缩', async () => {
    const llm = createMockLLM([{
      content: 'Compressed summary of conversation.',
    }])
    const ops = createContextOperations(defaultConfig, llm, 8000)

    const managerResult = ops.createManager({
      maxTokens: 100,
      strategy: 'summary',
      preserveLastN: 2,
      autoCompress: true,
    })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const manager = managerResult.data

    // 追加多条消息触发压缩
    for (let i = 0; i < 10; i++) {
      await manager.append({ role: 'user', content: `Message ${i}: ${'x'.repeat(100)}` })
      await manager.append({ role: 'assistant', content: `Reply ${i}: ${'y'.repeat(100)}` })
    }

    const messages = manager.getMessages()
    expect(messages.success).toBe(true)
    if (messages.success) {
      // 应该比原始 20 条消息少
      expect(messages.data.length).toBeLessThan(20)
    }
  })

  it('getTokenUsage 返回当前 token 和预算', async () => {
    const llm = createMockLLM([])
    const ops = createContextOperations(defaultConfig, llm, 8000)

    const managerResult = ops.createManager({ maxTokens: 5000 })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const manager = managerResult.data
    await manager.append({ role: 'user', content: 'Hello' })

    const usage = manager.getTokenUsage()
    expect(usage.success).toBe(true)
    if (usage.success) {
      expect(usage.data.budget).toBe(5000)
      expect(usage.data.current).toBeGreaterThan(0)
    }
  })

  it('reset 清空消息和摘要', async () => {
    const llm = createMockLLM([])
    const ops = createContextOperations(defaultConfig, llm, 100000)

    const managerResult = ops.createManager({ maxTokens: 100000 })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const manager = managerResult.data
    await manager.append({ role: 'user', content: 'Hello' })
    manager.reset()

    const messages = manager.getMessages()
    expect(messages.success).toBe(true)
    if (messages.success) {
      expect(messages.data).toHaveLength(0)
    }
  })

  it('autoCompress 为 false 时不自动压缩', async () => {
    const llm = createMockLLM([])
    const ops = createContextOperations(defaultConfig, llm, 8000)

    const managerResult = ops.createManager({
      maxTokens: 50,
      autoCompress: false,
    })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const manager = managerResult.data

    for (let i = 0; i < 5; i++) {
      await manager.append({ role: 'user', content: `Long message: ${'x'.repeat(200)}` })
    }

    const messages = manager.getMessages()
    expect(messages.success).toBe(true)
    if (messages.success) {
      // 不压缩，5 条全保留
      expect(messages.data).toHaveLength(5)
    }
  })
})
