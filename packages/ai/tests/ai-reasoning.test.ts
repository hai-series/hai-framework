/**
 * AI Reasoning 子模块单元测试
 *
 * 测试 CoT、ReAct、Plan-Execute 策略，使用 mock LLM。
 */

import type { AIConfig } from '../src/ai-config.js'
import type { LLMOperations } from '../src/llm/ai-llm-types.js'
import { describe, expect, it, vi } from 'vitest'
import { createReasoningOperations } from '../src/reasoning/ai-reasoning-functions.js'

// ─── Mock LLM 工厂 ───

function createMockLLM(responses: Array<{ content: string | null, finish_reason?: string, tool_calls?: any[] }>): LLMOperations {
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
            message: {
              role: 'assistant' as const,
              content: resp.content,
              tool_calls: resp.tool_calls,
            },
            finish_reason: (resp.finish_reason ?? 'stop') as any,
          }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        },
      }
    }),
    chatStream: vi.fn(),
  } as unknown as LLMOperations
}

const mockConfig: AIConfig = {
  llm: { type: 'openai' as any, apiKey: 'test-key', model: 'gpt-4' },
} as AIConfig

// ─── CoT 策略 ───

describe('reasoning CoT', () => {
  it('单轮 CoT 返回分步思考和答案', async () => {
    const mockLLM = createMockLLM([
      { content: 'Step 1: Analyze.\nStep 2: Calculate.\nFinal Answer: 42' },
    ])
    const reasoning = createReasoningOperations(mockConfig, mockLLM)

    const result = await reasoning.run('What is the answer?', { strategy: 'cot' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.strategy).toBe('cot')
      expect(result.data.rounds).toBe(1)
      expect(result.data.answer).toContain('42')
      expect(result.data.steps.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('coT 无工具调用', async () => {
    const mockLLM = createMockLLM([
      { content: 'Thinking...\nAnswer: Yes' },
    ])
    const reasoning = createReasoningOperations(mockConfig, mockLLM)

    const result = await reasoning.run('Is sky blue?', { strategy: 'cot' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.steps.some(s => s.type === 'thought')).toBe(true)
    }
  })
})

// ─── ReAct 策略 ───

describe('reasoning ReAct', () => {
  it('无工具时直接完成', async () => {
    const mockLLM = createMockLLM([
      { content: 'I can answer directly: 42', finish_reason: 'stop' },
    ])
    const reasoning = createReasoningOperations(mockConfig, mockLLM)

    const result = await reasoning.run('What is 6*7?', { strategy: 'react' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.strategy).toBe('react')
      expect(result.data.answer).toContain('42')
      expect(result.data.rounds).toBe(1)
    }
  })

  it('最大轮次限制', async () => {
    // 模拟永远不停的工具调用
    const mockLLM = createMockLLM([
      {
        content: 'Thinking...',
        finish_reason: 'tool_calls',
        tool_calls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'search', arguments: '{"q":"test"}' },
        }],
      },
    ])

    const mockTools = {
      getDefinitions: () => [],
      execute: vi.fn(async () => ({
        success: true as const,
        data: { content: 'Tool result' },
      })),
    }

    const reasoning = createReasoningOperations(mockConfig, mockLLM)
    const result = await reasoning.run('Looping query', {
      strategy: 'react',
      maxRounds: 2,
      tools: mockTools as any,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.message).toContain('Max rounds')
    }
  })
})

// ─── Plan-Execute 策略 ───

describe('reasoning Plan-Execute', () => {
  it('生成计划并执行', async () => {
    const mockLLM = createMockLLM([
      // 第一次调用：生成计划
      { content: '1. Step one\n2. Step two\n3. Summarize' },
      // 第二次调用：执行计划并完成
      { content: 'Done: The answer is 42', finish_reason: 'stop' },
    ])
    const reasoning = createReasoningOperations(mockConfig, mockLLM)

    const result = await reasoning.run('Solve the problem', { strategy: 'plan-execute' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.strategy).toBe('plan-execute')
      expect(result.data.steps.some(s => s.type === 'plan')).toBe(true)
      expect(result.data.answer).toContain('42')
    }
  })
})

// ─── 默认策略 ───

describe('reasoning 默认', () => {
  it('不指定策略时使用 react', async () => {
    const mockLLM = createMockLLM([
      { content: 'Default answer', finish_reason: 'stop' },
    ])
    const reasoning = createReasoningOperations(mockConfig, mockLLM)

    const result = await reasoning.run('Hello')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.strategy).toBe('react')
    }
  })

  it('未知策略返回错误', async () => {
    const mockLLM = createMockLLM([{ content: '' }])
    const reasoning = createReasoningOperations(mockConfig, mockLLM)

    const result = await reasoning.run('test', { strategy: 'unknown' as any })
    expect(result.success).toBe(false)
  })
})
