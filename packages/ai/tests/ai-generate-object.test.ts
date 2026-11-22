/**
 * ai.llm.generateObject — 结构化输出测试
 *
 * 通过 mock OpenAI SDK 验证：schema 约束下的解析、校验失败后的修复重试。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}))

vi.mock('openai', () => {
  function MockOpenAI() {
    return {
      chat: {
        completions: { create: mockCreate },
      },
      responses: {
        create: vi.fn(),
      },
      models: {
        list: vi.fn(),
      },
      audio: {
        transcriptions: {
          create: vi.fn(),
        },
        speech: {
          create: vi.fn(),
        },
      },
    }
  }
  return {
    default: MockOpenAI,
    toFile: vi.fn(),
  }
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
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
  }
}

async function* completionChunks(fragments: string[], finishReason = 'stop') {
  for (const fragment of fragments) {
    yield {
      id: 'chatcmpl-test',
      model: 'gpt-4o-mini',
      choices: [
        {
          index: 0,
          delta: { content: fragment },
          finish_reason: null,
        },
      ],
    }
  }
  yield {
    id: 'chatcmpl-test',
    model: 'gpt-4o-mini',
    choices: [
      { index: 0, delta: {}, finish_reason: finishReason },
    ],
  }
}

describe('ai.llm.generateObject', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const init = await ai.init({
      llm: { apiKey: 'sk-test', model: 'gpt-4o-mini' },
    })
    expect(init.success).toBe(true)
  })
  afterEach(async () => {
    await ai.close()
  })

  it('返回符合 schema 的对象', async () => {
    mockCreate.mockResolvedValue(makeCompletion(JSON.stringify({
      isQuestion: true,
      targets: ['expert-1'],
    })))

    const result = await ai.llm.generateObject({
      schema: z.object({
        isQuestion: z.boolean(),
        targets: z.array(z.string()),
      }),
      messages: [
        { role: 'user', content: '这是一个问题吗？' },
      ],
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
      schema: z.object({
        value: z.number(),
      }),
      messages: [
        { role: 'user', content: '给我一个数字' },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.value).toBe(42)
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('jSON 对象模式为网关提供 JSON 指令，仍按本地 schema 验证和修复', async () => {
    mockCreate
      .mockResolvedValueOnce(makeCompletion('{"value":"wrong"}'))
      .mockResolvedValueOnce(makeCompletion('{"value":42}'))
    const result = await ai.llm.generateObject({
      schema: z.object({
        value: z.number(),
      }),
      messages: [
        { role: 'user', content: '给我一个数字' },
      ],
      responseFormat: 'json_object',
    })
    expect(result).toEqual({
      success: true,
      data: { value: 42 },
    })
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      response_format: { type: 'json_object' },
      messages: expect.arrayContaining([
        {
          role: 'system',
          content: expect.stringContaining('JSON'),
        },
      ]),
    })
  })

  it('只预览指定字段并清除未完成的生成，再返回通过 schema 校验的最终对象', async () => {
    mockCreate
      .mockResolvedValueOnce(completionChunks(['{"text":"作废"'], 'length'))
      .mockResolvedValueOnce(completionChunks(['{"hidden":{"text":"内部"},"text":"已', '记录","ready":true}']))
    const prefixes: string[] = []
    const result = await ai.llm.generateObject({
      schema: z.object({
        text: z.string(),
        ready: z.boolean(),
      }),
      messages: [
        { role: 'user', content: '给我处理结论' },
      ],
      maxTokens: 500,
      preview: {
        field: 'text',
        onPrefix: (text) => { prefixes.push(text) },
      },
    })
    expect(result).toEqual({
      success: true,
      data: { text: '已记录', ready: true },
    })
    expect(prefixes).toEqual(['作废', '', '已', '已记录'])
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ stream: true, max_tokens: 500 })
  })

  it('分块处理转义和代理对，不预览未指定字段或超出配置的输入', () => {
    const preview = ai.stream.createJsonFieldPreview('text', { maxLength: 5, maxInputLength: 80 })
    expect(preview.push('{"nested":{"text":"private"},"text":"ok\\uD8')).toBe('ok')
    expect(preview.push('3D')).toBeUndefined()
    expect(preview.push('\\uDE80! extras"}')).toBe('ok🚀!')
    expect(() => preview.push(' '.repeat(80))).toThrow(RangeError)
  })

  it('重试后仍无法解析返回 INVALID_REQUEST', async () => {
    mockCreate.mockResolvedValue(makeCompletion('永远不是 JSON'))

    const result = await ai.llm.generateObject({
      schema: z.object({
        value: z.number(),
      }),
      messages: [
        { role: 'user', content: 'x' },
      ],
      maxRepairs: 1,
    })

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.INVALID_REQUEST.code)
    // 1 次初始 + 1 次修复
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })
})
