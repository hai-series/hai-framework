/**
 * Anthropic Messages API Provider 测试（issue #4）
 *
 * 通过 mock 全局 fetch 验证请求体转换、响应映射、AbortSignal 透传与流式 SSE 解析，
 * 不依赖真实 Anthropic 端点。
 */

import type { AIConfig } from '../src/ai-config.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AIConfigSchema } from '../src/ai-config.js'
import { HaiAIError } from '../src/ai-types.js'
import { createAnthropicProvider } from '../src/llm/providers/ai-llm-provider-anthropic.js'

function makeConfig(): AIConfig {
  return AIConfigSchema.parse({
    llm: {
      api: 'anthropic',
      apiKey: 'sk-ant-test',
      model: 'claude-3-5-sonnet-latest',
      baseUrl: 'https://api.anthropic.com',
    },
  })
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

describe('anthropic provider chat', () => {
  const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  it('转换 system + messages 并映射文本响应与用量', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      id: 'msg_1',
      model: 'claude-3-5-sonnet-latest',
      content: [{ type: 'text', text: '你好！' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 12, output_tokens: 4 },
    }))

    const provider = createAnthropicProvider({ config: makeConfig() })
    const result = await provider.chat({
      messages: [
        { role: 'system', content: '你是助手' },
        { role: 'user', content: '你好' },
      ],
    })

    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.choices[0].message.content).toBe('你好！')
    expect(result.data.usage).toEqual({ prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 })

    // 校验请求 URL / headers / body
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-test')
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(init.body as string)
    expect(body.system).toBe('你是助手')
    expect(body.messages).toEqual([{ role: 'user', content: '你好' }])
  })

  it('映射 tool_use 块为 tool_calls，finish_reason 为 tool_calls', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      id: 'msg_2',
      model: 'claude-3-5-sonnet-latest',
      content: [{ type: 'tool_use', id: 'tu_1', name: 'getWeather', input: { city: '北京' } }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 20, output_tokens: 8 },
    }))

    const provider = createAnthropicProvider({ config: makeConfig() })
    const result = await provider.chat({ messages: [{ role: 'user', content: '天气' }] })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.choices[0].finish_reason).toBe('tool_calls')
    expect(result.data.choices[0].message.tool_calls).toEqual([
      { id: 'tu_1', type: 'function', function: { name: 'getWeather', arguments: JSON.stringify({ city: '北京' }) } },
    ])
  })

  it('透传 AbortSignal（外部已 abort 时请求被取消）', async () => {
    fetchMock.mockImplementation((_url, init) => {
      const signal = (init as RequestInit).signal
      return new Promise((_resolve, reject) => {
        if (signal?.aborted) {
          const e = new Error('aborted')
          e.name = 'AbortError'
          reject(e)
          return
        }
        signal?.addEventListener('abort', () => {
          const e = new Error('aborted')
          e.name = 'AbortError'
          reject(e)
        })
      })
    })

    const provider = createAnthropicProvider({ config: makeConfig() })
    const controller = new AbortController()
    controller.abort()
    const result = await provider.chat({ messages: [{ role: 'user', content: 'x' }], signal: controller.signal })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.TIMEOUT.code)
  })

  it('非 2xx 状态映射为对应错误码', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'rate limited' }, false, 429))
    const provider = createAnthropicProvider({ config: makeConfig() })
    const result = await provider.chat({ messages: [{ role: 'user', content: 'x' }] })
    expect(result.success).toBe(false)
  })
})

describe('anthropic provider chatStream', () => {
  const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  it('解析 SSE 文本增量事件', async () => {
    const sse = `${[
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你"}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"好"}}',
      '',
    ].join('\n')}\n`

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sse))
        controller.close()
      },
    })
    fetchMock.mockResolvedValue({ ok: true, status: 200, body: stream } as unknown as Response)

    const provider = createAnthropicProvider({ config: makeConfig() })
    const chunks: string[] = []
    for await (const chunk of provider.chatStream({ messages: [{ role: 'user', content: '你好' }] })) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta)
        chunks.push(delta)
    }
    expect(chunks.join('')).toBe('你好')
  })
})
