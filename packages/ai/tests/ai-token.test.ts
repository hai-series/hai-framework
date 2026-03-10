/**
 * AI Token 子模块单元测试
 *
 * 测试纯函数 Token 估算：文本估算、消息列表估算（含开销）。
 */

import type { TokenConfig } from '../src/ai-config.js'
import type { ChatMessage } from '../src/llm/ai-llm-types.js'

import { describe, expect, it } from 'vitest'
import { createTokenOperations, estimateMessagesTokens, estimateTextTokens } from '../src/token/ai-token-functions.js'

// ─── estimateTextTokens 测试 ───

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

// ─── estimateMessagesTokens 测试 ───

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

// ─── createTokenOperations 测试 ───

describe('createTokenOperations', () => {
  const config: TokenConfig = { tokenRatio: 0.25 }

  it('estimateText 绑定 tokenRatio', () => {
    const ops = createTokenOperations(config)
    const tokens = ops.estimateText('Hello world')
    expect(tokens).toBeGreaterThan(0)
  })

  it('estimateMessages 绑定 tokenRatio', () => {
    const ops = createTokenOperations(config)
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ]
    const tokens = ops.estimateMessages(messages)
    expect(tokens).toBeGreaterThan(0)
  })
})
