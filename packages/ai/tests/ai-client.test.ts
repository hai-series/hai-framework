/**
 * createAIClient / parseSSE / collectStreamContent 测试
 *
 * 客户端通过 @h-ai/ai/client 导入，使用 mock api adapter 隔离 HTTP 依赖。
 */

import type { Result } from '@h-ai/core'
import type { AIApiAdapter } from '../src/client/ai-client.js'
import type { ChatCompletionChunk, ChatCompletionResponse } from '../src/index.js'
import { err, ok } from '@h-ai/core'
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

/** 创建返回指定结果的 mock api adapter */
function createMockApi(options: {
  postResult?: Result<unknown, { message: string }>
  streamChunks?: ChatCompletionChunk[]
} = {}): { api: AIApiAdapter, postSpy: ReturnType<typeof vi.fn>, streamSpy: ReturnType<typeof vi.fn> } {
  const postSpy = vi.fn().mockResolvedValue(
    options.postResult ?? ok(makeChatResponse('default')),
  )

  const chunks = options.streamChunks ?? []
  async function* mockStream(): AsyncIterable<string> {
    for (const chunk of chunks) {
      yield JSON.stringify(chunk)
    }
  }
  const streamSpy = vi.fn().mockReturnValue(mockStream())

  return {
    api: { post: postSpy, stream: streamSpy },
    postSpy,
    streamSpy,
  }
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
    const { api, postSpy } = createMockApi({ postResult: ok(response) })

    const client = createAIClient({ api })
    const result = await client.chat({
      messages: [{ role: 'user', content: '你好' }],
    })

    expect(result.choices[0].message.content).toBe('你好！')
    expect(postSpy).toHaveBeenCalledOnce()
    // 验证调用路径和参数
    expect(postSpy).toHaveBeenCalledWith('/ai/chat', expect.objectContaining({
      stream: false,
      messages: [{ role: 'user', content: '你好' }],
    }))
  })

  it('请求失败时抛出错误', async () => {
    const { api } = createMockApi({
      postResult: err({ message: 'Unauthorized' }),
    })
    const client = createAIClient({ api })

    await expect(
      client.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow('AI chat request failed: Unauthorized')
  })
})

// =============================================================================
// createAIClient — 流式 chatStream
// =============================================================================

describe('createAIClient — chatStream', () => {
  it('流式接收响应', async () => {
    const chunks = [makeChunk('Hello'), makeChunk(' World', 'stop')]
    const { api, streamSpy } = createMockApi({ streamChunks: chunks })

    const client = createAIClient({ api })
    const received = await collectAsyncIterable(
      client.chatStream({ messages: [{ role: 'user', content: 'hi' }] }),
    )

    expect(received).toHaveLength(2)
    expect(received[0].choices[0].delta.content).toBe('Hello')
    expect(received[1].choices[0].delta.content).toBe(' World')
    // 验证调用路径
    expect(streamSpy).toHaveBeenCalledWith('/ai/chat/stream', expect.objectContaining({
      stream: true,
    }))
  })

  it('onProgress 回调逐步汇报进度', async () => {
    const chunks = [makeChunk('A'), makeChunk('B'), makeChunk('C', 'stop')]
    const { api } = createMockApi({ streamChunks: chunks })
    const progresses: Array<{ content: string, done: boolean }> = []

    const client = createAIClient({ api })
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

  it('忽略解析错误的行', async () => {
    // 混入无效 JSON
    async function* mockStream(): AsyncIterable<string> {
      yield JSON.stringify(makeChunk('Hello'))
      yield 'invalid-json'
      yield JSON.stringify(makeChunk(' World', 'stop'))
    }
    const api: AIApiAdapter = {
      post: vi.fn(),
      stream: vi.fn().mockReturnValue(mockStream()),
    }

    const client = createAIClient({ api })
    const received = await collectAsyncIterable(
      client.chatStream({ messages: [{ role: 'user', content: 'hi' }] }),
    )

    expect(received).toHaveLength(2)
    expect(received[0].choices[0].delta.content).toBe('Hello')
    expect(received[1].choices[0].delta.content).toBe(' World')
  })
})

// =============================================================================
// createAIClient — sendMessage
// =============================================================================

describe('createAIClient — sendMessage', () => {
  it('发送消息并获取响应文本', async () => {
    const { api } = createMockApi({ postResult: ok(makeChatResponse('Hi there!')) })
    const client = createAIClient({ api })

    const reply = await client.sendMessage('你好')
    expect(reply).toBe('Hi there!')
  })

  it('带 systemPrompt 发送', async () => {
    const { api, postSpy } = createMockApi({ postResult: ok(makeChatResponse('Expert answer')) })
    const client = createAIClient({ api })

    await client.sendMessage('问题', '你是专家')

    const callArgs = postSpy.mock.calls[0][1]
    expect(callArgs.messages).toHaveLength(2)
    expect(callArgs.messages[0]).toEqual({ role: 'system', content: '你是专家' })
    expect(callArgs.messages[1]).toEqual({ role: 'user', content: '问题' })
  })

  it('不传 systemPrompt 时只有 user 消息', async () => {
    const { api, postSpy } = createMockApi({ postResult: ok(makeChatResponse('ok')) })
    const client = createAIClient({ api })

    await client.sendMessage('hello')

    const callArgs = postSpy.mock.calls[0][1]
    expect(callArgs.messages).toHaveLength(1)
    expect(callArgs.messages[0].role).toBe('user')
  })

  it('响应无 content 时返回空串', async () => {
    const resp = makeChatResponse('')
    resp.choices[0].message.content = null as unknown as string
    const { api } = createMockApi({ postResult: ok(resp) })
    const client = createAIClient({ api })

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
    const { api } = createMockApi({ streamChunks: chunks })
    const client = createAIClient({ api })

    const content = await client.sendMessageStream('你好')
    expect(content).toBe('Hello World')
  })

  it('带 systemPrompt 流式发送', async () => {
    const chunks = [makeChunk('Response', 'stop')]
    const { api, streamSpy } = createMockApi({ streamChunks: chunks })
    const client = createAIClient({ api })

    await client.sendMessageStream('问题', undefined, '你是助手')

    const callArgs = streamSpy.mock.calls[0][1]
    expect(callArgs.messages[0].role).toBe('system')
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
