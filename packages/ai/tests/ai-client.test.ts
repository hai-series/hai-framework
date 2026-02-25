/**
 * createAIClient / parseSSE / collectStreamContent 测试
 *
 * 客户端通过 @h-ai/ai/client 导入，使用 mock fetch 隔离网络依赖。
 */

import type { ChatCompletionChunk, ChatCompletionResponse } from '../src/index.js'
import { describe, expect, it, vi } from 'vitest'
import { collectStreamContent, createAIClient, parseSSE } from '../src/client/ai-client.js'

// =============================================================================
// 辅助函数
// =============================================================================

/** 构造完整聊天响应 */
function makeChatResponse(content: string): ChatCompletionResponse {
  return {
    id: 'resp-1',
    object: 'chat.completion',
    created: Date.now(),
    model: 'test-model',
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}

/** 构造流式 chunk */
function makeChunk(content: string, finishReason?: string): ChatCompletionChunk {
  return {
    id: 'chunk-1',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'test-model',
    choices: [{
      index: 0,
      delta: { content },
      finish_reason: (finishReason ?? null) as 'stop' | null,
    }],
  }
}

/** 将 SSE 行数组构造为 ReadableStream */
function makeSSEStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const text = `${lines.join('\n')}\n`
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

/** 创建返回指定 JSON 的 mock fetch */
function mockFetch(body: unknown, status = 200): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    body: null,
  }) as unknown as typeof globalThis.fetch
}

/** 创建返回 SSE 流的 mock fetch */
function mockStreamFetch(chunks: ChatCompletionChunk[]): typeof globalThis.fetch {
  const lines = chunks.map(c => `data: ${JSON.stringify(c)}`).concat(['data: [DONE]'])
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: makeSSEStream(lines),
  }) as unknown as typeof globalThis.fetch
}

/** 将 AsyncIterable 收集为数组 */
async function collectAsyncIterable<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = []
  for await (const item of iterable) {
    result.push(item)
  }
  return result
}

// =============================================================================
// createAIClient — 非流式 chat
// =============================================================================

describe('createAIClient — chat', () => {
  it('发送请求并获取响应', async () => {
    const response = makeChatResponse('你好！')
    const fetchFn = mockFetch(response)

    const client = createAIClient({
      baseUrl: 'http://localhost:3000/api',
      fetch: fetchFn,
    })

    const result = await client.chat({
      messages: [{ role: 'user', content: '你好' }],
    })

    expect(result.choices[0].message.content).toBe('你好！')
    expect(fetchFn).toHaveBeenCalledOnce()
    // 验证请求 URL 和参数
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('http://localhost:3000/api/chat')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.stream).toBe(false)
    expect(body.messages[0].content).toBe('你好')
  })

  it('请求失败时抛出错误', async () => {
    const fetchFn = mockFetch({ error: 'Unauthorized' }, 401)
    const client = createAIClient({ baseUrl: '/api', fetch: fetchFn })

    await expect(
      client.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow('AI API request failed')
  })

  it('自定义请求头', async () => {
    const fetchFn = mockFetch(makeChatResponse('ok'))
    const client = createAIClient({
      baseUrl: '/api',
      fetch: fetchFn,
      headers: { 'X-Custom': 'test-value' },
    })

    await client.chat({ messages: [{ role: 'user', content: 'hi' }] })

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(init.headers['X-Custom']).toBe('test-value')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('getAccessToken 注入 Authorization 头', async () => {
    const fetchFn = mockFetch(makeChatResponse('ok'))
    const client = createAIClient({
      baseUrl: '/api',
      fetch: fetchFn,
      getAccessToken: () => 'my-token-123',
    })

    await client.chat({ messages: [{ role: 'user', content: 'hi' }] })

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer my-token-123')
  })

  it('getAccessToken 支持异步', async () => {
    const fetchFn = mockFetch(makeChatResponse('ok'))
    const client = createAIClient({
      baseUrl: '/api',
      fetch: fetchFn,
      getAccessToken: async () => 'async-token',
    })

    await client.chat({ messages: [{ role: 'user', content: 'hi' }] })

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer async-token')
  })

  it('401 响应触发 onAuthError 回调', async () => {
    const onAuthError = vi.fn()
    const fetchFn = mockFetch({ error: 'Unauthorized' }, 401)
    const client = createAIClient({
      baseUrl: '/api',
      fetch: fetchFn,
      onAuthError,
    })

    await expect(
      client.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow()

    expect(onAuthError).toHaveBeenCalledOnce()
  })
})

// =============================================================================
// createAIClient — 流式 chatStream
// =============================================================================

describe('createAIClient — chatStream', () => {
  it('流式接收响应', async () => {
    const chunks = [makeChunk('Hello'), makeChunk(' World', 'stop')]
    const fetchFn = mockStreamFetch(chunks)

    const client = createAIClient({ baseUrl: '/api', fetch: fetchFn })
    const received = await collectAsyncIterable(
      client.chatStream({ messages: [{ role: 'user', content: 'hi' }] }),
    )

    expect(received).toHaveLength(2)
    expect(received[0].choices[0].delta.content).toBe('Hello')
    expect(received[1].choices[0].delta.content).toBe(' World')
  })

  it('onProgress 回调逐步汇报进度', async () => {
    const chunks = [makeChunk('A'), makeChunk('B'), makeChunk('C', 'stop')]
    const fetchFn = mockStreamFetch(chunks)
    const progresses: Array<{ content: string, done: boolean }> = []

    const client = createAIClient({ baseUrl: '/api', fetch: fetchFn })
    await collectAsyncIterable(
      client.chatStream(
        { messages: [{ role: 'user', content: 'hi' }] },
        { onProgress: p => progresses.push({ content: p.content, done: p.done }) },
      ),
    )

    // 最后一次 done=true
    expect(progresses.at(-1)?.done).toBe(true)
    expect(progresses.at(-1)?.content).toBe('ABC')
    // 前面 done=false，内容逐步累积
    expect(progresses[0].content).toBe('A')
    expect(progresses[0].done).toBe(false)
  })

  it('请求失败时抛出错误', async () => {
    const fetchFn = mockFetch({}, 500)
    const client = createAIClient({ baseUrl: '/api', fetch: fetchFn })

    await expect(async () => {
      for await (const _chunk of client.chatStream({ messages: [{ role: 'user', content: 'hi' }] })) {
        // 不应进入
      }
    }).rejects.toThrow('AI API request failed')
  })

  it('无 body 时抛出错误', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
    }) as unknown as typeof globalThis.fetch

    const client = createAIClient({ baseUrl: '/api', fetch: fetchFn })

    await expect(async () => {
      for await (const _chunk of client.chatStream({ messages: [{ role: 'user', content: 'hi' }] })) {
        // 不应进入
      }
    }).rejects.toThrow('Response body is not readable')
  })
})

// =============================================================================
// createAIClient — sendMessage
// =============================================================================

describe('createAIClient — sendMessage', () => {
  it('发送消息并获取响应文本', async () => {
    const fetchFn = mockFetch(makeChatResponse('Hi there!'))
    const client = createAIClient({ baseUrl: '/api', fetch: fetchFn })

    const reply = await client.sendMessage('你好')
    expect(reply).toBe('Hi there!')
  })

  it('带 systemPrompt 发送', async () => {
    const fetchFn = mockFetch(makeChatResponse('Expert answer'))
    const client = createAIClient({ baseUrl: '/api', fetch: fetchFn })

    await client.sendMessage('问题', '你是专家')

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0]).toEqual({ role: 'system', content: '你是专家' })
    expect(body.messages[1]).toEqual({ role: 'user', content: '问题' })
  })

  it('不传 systemPrompt 时只有 user 消息', async () => {
    const fetchFn = mockFetch(makeChatResponse('ok'))
    const client = createAIClient({ baseUrl: '/api', fetch: fetchFn })

    await client.sendMessage('hello')

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0].role).toBe('user')
  })

  it('响应无 content 时返回空串', async () => {
    const resp = makeChatResponse('')
    resp.choices[0].message.content = null as unknown as string
    const fetchFn = mockFetch(resp)
    const client = createAIClient({ baseUrl: '/api', fetch: fetchFn })

    const reply = await client.sendMessage('hi')
    expect(reply).toBe('')
  })
})

// =============================================================================
// createAIClient — sendMessageStream
// =============================================================================

describe('createAIClient — sendMessageStream', () => {
  it('流式发送并收集完整回复', async () => {
    const chunks = [makeChunk('Hello'), makeChunk(' World', 'stop')]
    const fetchFn = mockStreamFetch(chunks)
    const client = createAIClient({ baseUrl: '/api', fetch: fetchFn })

    const content = await client.sendMessageStream('你好')
    expect(content).toBe('Hello World')
  })

  it('带 systemPrompt 流式发送', async () => {
    const chunks = [makeChunk('Response', 'stop')]
    const fetchFn = mockStreamFetch(chunks)
    const client = createAIClient({ baseUrl: '/api', fetch: fetchFn })

    await client.sendMessageStream('问题', undefined, '你是助手')

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.messages[0].role).toBe('system')
  })
})

// =============================================================================
// parseSSE
// =============================================================================

describe('parseSSE', () => {
  it('解析 SSE data 行', async () => {
    const stream = makeSSEStream([
      'data: {"text":"one"}',
      '',
      'data: {"text":"two"}',
      '',
      'data: [DONE]',
    ])
    const response = { body: stream } as unknown as Response

    const items = await collectAsyncIterable(parseSSE(response))
    expect(items).toHaveLength(2)
    expect(items[0]).toBe('{"text":"one"}')
    expect(items[1]).toBe('{"text":"two"}')
  })

  it('[DONE] 标记不被产出', async () => {
    const stream = makeSSEStream(['data: hello', '', 'data: [DONE]'])
    const response = { body: stream } as unknown as Response

    const items = await collectAsyncIterable(parseSSE(response))
    expect(items).toEqual(['hello'])
  })

  it('无 body 时抛出错误', async () => {
    const response = { body: null } as unknown as Response

    await expect(async () => {
      for await (const _item of parseSSE(response)) {
        // 不应进入
      }
    }).rejects.toThrow('Response body is not readable')
  })

  it('忽略非 data: 开头的行', async () => {
    const stream = makeSSEStream([
      'event: message',
      'data: payload',
      '',
      ': comment line',
      '',
    ])
    const response = { body: stream } as unknown as Response

    const items = await collectAsyncIterable(parseSSE(response))
    expect(items).toEqual(['payload'])
  })
})

// =============================================================================
// collectStreamContent
// =============================================================================

describe('collectStreamContent', () => {
  async function* toAsyncIterable(chunks: ChatCompletionChunk[]): AsyncIterable<ChatCompletionChunk> {
    for (const chunk of chunks) {
      yield chunk
    }
  }

  it('收集流式响应完整文本', async () => {
    const chunks = [makeChunk('Hello'), makeChunk(' '), makeChunk('World')]
    const content = await collectStreamContent(toAsyncIterable(chunks))
    expect(content).toBe('Hello World')
  })

  it('空流返回空字符串', async () => {
    const content = await collectStreamContent(toAsyncIterable([]))
    expect(content).toBe('')
  })

  it('忽略无 content 的 delta', async () => {
    const noContentChunk: ChatCompletionChunk = {
      id: 'c1',
      object: 'chat.completion.chunk',
      created: Date.now(),
      model: 'test',
      choices: [{ index: 0, delta: {}, finish_reason: null }],
    }
    const content = await collectStreamContent(toAsyncIterable([noContentChunk, makeChunk('only')]))
    expect(content).toBe('only')
  })
})
