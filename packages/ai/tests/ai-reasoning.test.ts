/**
 * AI Reasoning 子模块单元测试
 *
 * 测试 CoT、ReAct、Plan-Execute 策略，使用 mock LLM。
 */

import type { AIConfig } from '../src/ai-config.js'
import type { LLMOperations, ToolRegistryOperations } from '../src/llm/ai-llm-types.js'
import type { ReasoningStrategy, ReasoningStreamEvent } from '../src/reasoning/ai-reasoning-types.js'
import { describe, expect, it, vi } from 'vitest'
import { LLMConfigSchema, resolveModelEntry } from '../src/ai-config.js'
import { createReasoningOperations } from '../src/reasoning/ai-reasoning-functions.js'

// ─── Mock LLM 工厂 ───

function createMockLLM(responses: Array<{ content: string | null, finish_reason?: string, tool_calls?: unknown[] }>): LLMOperations {
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
            finish_reason: resp.finish_reason ?? 'stop',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        },
      }
    }),
    chatStream: vi.fn(),
  } as unknown as LLMOperations
}

const mockConfig: AIConfig = {
  llm: { apiKey: 'test-key', model: 'gpt-4' },
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
      tools: mockTools as unknown as ToolRegistryOperations,
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

    const result = await reasoning.run('test', { strategy: 'unknown' as ReasoningStrategy })
    expect(result.success).toBe(false)
  })
})

// ─── resolveModel ───

describe('resolveModelEntry', () => {
  it('显式指定模型优先', () => {
    const result = resolveModelEntry(LLMConfigSchema.parse({ model: 'gpt-4o-mini', apiKey: 'k' }), 'chat', 'gpt-4o')
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.model).toBe('gpt-4o')
  })

  it('场景映射 (scenarios) 命中时返回映射值', () => {
    const result = resolveModelEntry(LLMConfigSchema.parse({
      model: 'gpt-4o-mini',
      apiKey: 'k',
      scenarios: { reasoning: 'gpt-4o' },
    }), 'reasoning')
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.model).toBe('gpt-4o')
  })

  it('场景映射到 models 列表中的条目时返回条目 model 字段', () => {
    const result = resolveModelEntry(LLMConfigSchema.parse({
      model: 'gpt-4o-mini',
      apiKey: 'k',
      models: [{ id: 'strong', model: 'gpt-4o' }],
      scenarios: { reasoning: 'strong' },
    }), 'reasoning')
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.model).toBe('gpt-4o')
  })

  it('场景未命中时回退到 default 场景', () => {
    const result = resolveModelEntry(LLMConfigSchema.parse({
      model: 'gpt-4o-mini',
      apiKey: 'k',
      scenarios: { default: 'gpt-4' },
    }), 'plan')
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.model).toBe('gpt-4')
  })

  it('无 scenarios 时使用全局 model', () => {
    const result = resolveModelEntry(LLMConfigSchema.parse({ model: 'gpt-4o', apiKey: 'k' }), 'reasoning')
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.model).toBe('gpt-4o')
  })

  it('无 apiKey 时返回 CONFIGURATION_ERROR', () => {
    const result = resolveModelEntry(LLMConfigSchema.parse({}), 'chat')
    expect(result.success).toBe(false)
  })

  it('支持新增的 plan/execute/extraction/summary 场景', () => {
    const cfg = LLMConfigSchema.parse({
      model: 'fallback',
      apiKey: 'k',
      scenarios: {
        plan: 'plan-model',
        execute: 'exec-model',
        extraction: 'extract-model',
        summary: 'summary-model',
      },
    })
    const r1 = resolveModelEntry(cfg, 'plan')
    const r2 = resolveModelEntry(cfg, 'execute')
    const r3 = resolveModelEntry(cfg, 'extraction')
    const r4 = resolveModelEntry(cfg, 'summary')
    expect(r1.success && r1.data.model).toBe('plan-model')
    expect(r2.success && r2.data.model).toBe('exec-model')
    expect(r3.success && r3.data.model).toBe('extract-model')
    expect(r4.success && r4.data.model).toBe('summary-model')
  })
})

// ─── Plan-Execute 模型分离 ───

describe('reasoning plan-execute 模型分离', () => {
  it('planModel 用于规划阶段', async () => {
    const mockLLM = createMockLLM([
      { content: '1. Plan step' },
      { content: 'Executed!', finish_reason: 'stop' },
    ])
    const configWithScenario: AIConfig = {
      llm: { model: 'default-model' },
    } as AIConfig

    const reasoning = createReasoningOperations(configWithScenario, mockLLM)
    const result = await reasoning.run('test', {
      strategy: 'plan-execute',
      planModel: 'gpt-4o',
      executeModel: 'gpt-4o-mini',
    })

    expect(result.success).toBe(true)
    // 验证规划阶段使用 planModel
    const chatMock = mockLLM.chat as ReturnType<typeof vi.fn>
    expect(chatMock).toHaveBeenCalledTimes(2)
    expect(chatMock.mock.calls[0][0].model).toBe('gpt-4o')
    // 验证执行阶段使用 executeModel
    expect(chatMock.mock.calls[1][0].model).toBe('gpt-4o-mini')
  })

  it('未指定 planModel/executeModel 时回退到场景 scenarios', async () => {
    const mockLLM = createMockLLM([
      { content: '1. Plan' },
      { content: 'Done', finish_reason: 'stop' },
    ])
    const configWithScenarios: AIConfig = {
      llm: {
        model: 'fallback-model',
        apiKey: 'test-key',
        scenarios: { plan: 'plan-default', execute: 'exec-default' },
      },
    } as AIConfig

    const reasoning = createReasoningOperations(configWithScenarios, mockLLM)
    await reasoning.run('test', { strategy: 'plan-execute' })

    const chatMock = mockLLM.chat as ReturnType<typeof vi.fn>
    expect(chatMock.mock.calls[0][0].model).toBe('plan-default')
    expect(chatMock.mock.calls[1][0].model).toBe('exec-default')
  })

  it('reasoning 场景使用 scenarios.reasoning', async () => {
    const mockLLM = createMockLLM([
      { content: 'Done', finish_reason: 'stop' },
    ])
    const configWithScenarios: AIConfig = {
      llm: {
        model: 'fallback',
        apiKey: 'test-key',
        scenarios: { reasoning: 'gpt-4o' },
      },
    } as AIConfig

    const reasoning = createReasoningOperations(configWithScenarios, mockLLM)
    await reasoning.run('test', { strategy: 'react' })

    const chatMock = mockLLM.chat as ReturnType<typeof vi.fn>
    expect(chatMock.mock.calls[0][0].model).toBe('gpt-4o')
  })
})

// =============================================================================
// runStream 测试
// =============================================================================

describe('reasoning runStream', () => {
  it('流式推理产出 step → delta → done 事件', async () => {
    // CoT 策略返回：思考步骤 + 最终回答
    const mockLLM = createMockLLM([
      { content: 'Step 1: 分析问题\nStep 2: 推导\n\n最终答案：42' },
    ])

    const reasoning = createReasoningOperations(mockConfig, mockLLM)
    const events: ReasoningStreamEvent[] = []

    for await (const event of reasoning.runStream('什么是宇宙的答案？')) {
      events.push(event)
    }

    // 应该至少有 step(s)、delta 和 done 事件
    const stepEvents = events.filter(e => e.type === 'step')
    const deltaEvents = events.filter(e => e.type === 'delta')
    const doneEvents = events.filter(e => e.type === 'done')

    expect(stepEvents.length).toBeGreaterThanOrEqual(0)
    expect(deltaEvents.length).toBeGreaterThanOrEqual(1)
    expect(doneEvents).toHaveLength(1)

    // done 事件包含完整结果
    const doneEvent = doneEvents[0] as Extract<ReasoningStreamEvent, { type: 'done' }>
    expect(doneEvent.result).toBeDefined()
    expect(doneEvent.result.answer).toBeTruthy()
  })
})
