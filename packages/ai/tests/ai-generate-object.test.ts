/**
 * ai.llm.generateObject — 结构化输出测试
 *
 * 通过 mock OpenAI SDK 验证：schema 约束下的解析、校验失败后的修复重试。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('openai', () => {
  function MockOpenAI() {
    return {
      chat: { completions: { create: mockCreate } },
      responses: { create: vi.fn() },
      models: { list: vi.fn() },
      audio: { transcriptions: { create: vi.fn() }, speech: { create: vi.fn() } },
    }
  }
  return { default: MockOpenAI, toFile: vi.fn() }
})

// eslint-disable-next-line import/first -- vi.mock 需在 import 之前
import { ai, HaiAIError } from '../src/index.js'

/** 构造仅含文本内容的 SDK ChatCompletion 响应 */
function makeCompletion(content: string) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1700000000,
    model: 'gpt-4o-mini',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
  }
}

describe('ai.llm.generateObject', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const init = await ai.init({ llm: { apiKey: 'sk-test', model: 'gpt-4o-mini' } })
    expect(init.success).toBe(true)
  })
  afterEach(async () => {
    await ai.close()
  })

  it('返回符合 schema 的对象', async () => {
    mockCreate.mockResolvedValue(makeCompletion(JSON.stringify({ isQuestion: true, targets: ['expert-1'] })))

    const result = await ai.llm.generateObject({
      schema: z.object({ isQuestion: z.boolean(), targets: z.array(z.string()) }),
      messages: [{ role: 'user', content: '这是一个问题吗？' }],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.isQuestion).toBe(true)
      expect(result.data.targets).toEqual(['expert-1'])
    }
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('首次输出非 JSON 时自动修复重试', async () => {
    mockCreate
      .mockResolvedValueOnce(makeCompletion('抱歉，这不是 JSON'))
      .mockResolvedValueOnce(makeCompletion(JSON.stringify({ value: 42 })))

    const result = await ai.llm.generateObject({
      schema: z.object({ value: z.number() }),
      messages: [{ role: 'user', content: '给我一个数字' }],
    })

    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.value).toBe(42)
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('重试后仍无法解析返回 INVALID_REQUEST', async () => {
    mockCreate.mockResolvedValue(makeCompletion('永远不是 JSON'))

    const result = await ai.llm.generateObject({
      schema: z.object({ value: z.number() }),
      messages: [{ role: 'user', content: 'x' }],
      maxRepairs: 1,
    })

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.INVALID_REQUEST.code)
    // 1 次初始 + 1 次修复
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })
})
