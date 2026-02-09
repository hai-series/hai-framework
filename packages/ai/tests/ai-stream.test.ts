/**
 * ai.stream — 流处理器、SSE 编解码 测试
 */

import type { ChatCompletionChunk, SSEEvent } from '../src/index.js'
import { describe, expect, it } from 'vitest'
import { ai } from '../src/index.js'

// =============================================================================
// 辅助函数
// =============================================================================

type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter'

/** 构造一个带文本内容的 chunk */
function textChunk(content: string, finishReason?: FinishReason): ChatCompletionChunk {
  return {
    id: 'chunk-1',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'test-model',
    choices: [{
      index: 0,
      delta: { content },
      finish_reason: finishReason ?? null,
    }],
  }
}

/** 构造一个工具调用 chunk */
function toolCallChunk(
  index: number,
  id: string | undefined,
  name: string | undefined,
  args: string | undefined,
  finishReason?: FinishReason,
): ChatCompletionChunk {
  return {
    id: 'chunk-tc',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'test-model',
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          index,
          ...(id ? { id } : {}),
          function: {
            ...(name !== undefined ? { name } : {}),
            ...(args !== undefined ? { arguments: args } : {}),
          },
        }],
      },
      finish_reason: finishReason ?? null,
    }],
  }
}

/** 将数组转换为 AsyncIterable */
async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item
  }
}

// =============================================================================
// ai.stream.createProcessor
// =============================================================================

describe('ai.stream.createProcessor', () => {
  it('累积文本内容', () => {
    const processor = ai.stream.createProcessor()

    processor.process(textChunk('Hello'))
    processor.process(textChunk(' '))
    processor.process(textChunk('World'))

    const result = processor.getResult()
    expect(result.content).toBe('Hello World')
    expect(result.toolCalls).toHaveLength(0)
    expect(result.finishReason).toBeNull()
  })

  it('处理完成原因', () => {
    const processor = ai.stream.createProcessor()

    processor.process(textChunk('Done', 'stop'))

    const result = processor.getResult()
    expect(result.content).toBe('Done')
    expect(result.finishReason).toBe('stop')
  })

  it('累积工具调用', () => {
    const processor = ai.stream.createProcessor()

    // 第一个 chunk：工具调用开始
    processor.process(toolCallChunk(0, 'call-1', 'search', '{"q'))
    // 第二个 chunk：参数续传
    processor.process(toolCallChunk(0, undefined, undefined, 'uery":"te'))
    // 第三个 chunk：参数完成
    processor.process(toolCallChunk(0, undefined, undefined, 'st"}', 'tool_calls'))

    const result = processor.getResult()
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].id).toBe('call-1')
    expect(result.toolCalls[0].function.name).toBe('search')
    expect(result.toolCalls[0].function.arguments).toBe('{"query":"test"}')
    expect(result.finishReason).toBe('tool_calls')
  })

  it('处理多个并行工具调用', () => {
    const processor = ai.stream.createProcessor()

    processor.process(toolCallChunk(0, 'c1', 'add', '{"a":1,"b":2}'))
    processor.process(toolCallChunk(1, 'c2', 'mul', '{"a":3,"b":4}'))

    const result = processor.getResult()
    expect(result.toolCalls).toHaveLength(2)
    expect(result.toolCalls[0].function.name).toBe('add')
    expect(result.toolCalls[1].function.name).toBe('mul')
  })

  it('process 返回 delta', () => {
    const processor = ai.stream.createProcessor()

    const delta = processor.process(textChunk('Hello'))
    expect(delta).toBeDefined()
    expect(delta?.content).toBe('Hello')
  })

  it('空 choices 返回 null', () => {
    const processor = ai.stream.createProcessor()

    const chunk: ChatCompletionChunk = {
      id: 'empty',
      object: 'chat.completion.chunk',
      created: Date.now(),
      model: 'test',
      choices: [],
    }

    const result = processor.process(chunk)
    expect(result).toBeNull()
  })

  it('toAssistantMessage 纯文本', () => {
    const processor = ai.stream.createProcessor()

    processor.process(textChunk('Hello'))

    const msg = processor.toAssistantMessage()
    expect(msg.role).toBe('assistant')
    expect(msg.content).toBe('Hello')
    expect(msg.tool_calls).toBeUndefined()
  })

  it('toAssistantMessage 工具调用（content 为 null）', () => {
    const processor = ai.stream.createProcessor()

    processor.process(toolCallChunk(0, 'c1', 'fn', '{}'))

    const msg = processor.toAssistantMessage()
    expect(msg.role).toBe('assistant')
    expect(msg.content).toBeNull()
    expect(msg.tool_calls).toHaveLength(1)
  })

  it('reset 清空状态', () => {
    const processor = ai.stream.createProcessor()

    processor.process(textChunk('old content', 'stop'))
    processor.reset()

    const result = processor.getResult()
    expect(result.content).toBe('')
    expect(result.toolCalls).toHaveLength(0)
    expect(result.finishReason).toBeNull()
  })
})

// =============================================================================
// ai.stream.collect
// =============================================================================

describe('ai.stream.collect', () => {
  it('收集完整的流', async () => {
    const chunks = [
      textChunk('Hello'),
      textChunk(' World'),
      textChunk('!', 'stop'),
    ]

    const result = await ai.stream.collect(toAsyncIterable(chunks))
    expect(result.content).toBe('Hello World!')
    expect(result.finishReason).toBe('stop')
  })

  it('空流返回空结果', async () => {
    const result = await ai.stream.collect(toAsyncIterable([]))
    expect(result.content).toBe('')
    expect(result.toolCalls).toHaveLength(0)
    expect(result.finishReason).toBeNull()
  })
})

// =============================================================================
// ai.stream.encodeSSE + ai.stream.createSSEDecoder
// =============================================================================

describe('ai.stream.encodeSSE', () => {
  it('编码 data 字段', () => {
    const encoded = ai.stream.encodeSSE({ data: 'hello' })
    expect(encoded).toBe('data: hello\n\n')
  })

  it('编码全部字段', () => {
    const encoded = ai.stream.encodeSSE({
      event: 'message',
      id: '123',
      retry: 3000,
      data: 'payload',
    })
    expect(encoded).toContain('event: message')
    expect(encoded).toContain('id: 123')
    expect(encoded).toContain('retry: 3000')
    expect(encoded).toContain('data: payload')
    expect(encoded.endsWith('\n\n')).toBe(true)
  })

  it('多行 data 拆分为多行 data:', () => {
    const encoded = ai.stream.encodeSSE({ data: 'line1\nline2' })
    expect(encoded).toContain('data: line1\n')
    expect(encoded).toContain('data: line2\n')
  })
})

describe('ai.stream.createSSEDecoder', () => {
  it('解码单个事件', () => {
    const decoder = ai.stream.createSSEDecoder()
    const events = [...decoder.decode('data: hello\n\n')]
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('hello')
  })

  it('解码带 event 和 id 的完整事件', () => {
    const decoder = ai.stream.createSSEDecoder()
    const text = 'event: update\nid: 42\nretry: 5000\ndata: payload\n\n'
    const events = [...decoder.decode(text)]

    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('update')
    expect(events[0].id).toBe('42')
    expect(events[0].retry).toBe(5000)
    expect(events[0].data).toBe('payload')
  })

  it('跨多次调用缓冲解码', () => {
    const decoder = ai.stream.createSSEDecoder()

    // 第一次只传了一部分
    const events1 = [...decoder.decode('data: hel')]
    expect(events1).toHaveLength(0)

    // 第二次传完
    const events2 = [...decoder.decode('lo\n\n')]
    expect(events2).toHaveLength(1)
    expect(events2[0].data).toBe('hello')
  })

  it('多个事件一起解码', () => {
    const decoder = ai.stream.createSSEDecoder()
    const text = 'data: one\n\ndata: two\n\ndata: three\n\n'
    const events = [...decoder.decode(text)]
    expect(events).toHaveLength(3)
    expect(events.map(e => e.data)).toEqual(['one', 'two', 'three'])
  })

  it('编码/解码往返', () => {
    const original: SSEEvent = { event: 'done', id: 'x1', data: '{"status":"ok"}' }
    const encoded = ai.stream.encodeSSE(original)

    const decoder = ai.stream.createSSEDecoder()
    const events = [...decoder.decode(encoded)]

    expect(events).toHaveLength(1)
    expect(events[0].event).toBe(original.event)
    expect(events[0].id).toBe(original.id)
    expect(events[0].data).toBe(original.data)
  })

  it('reset 清空缓冲', () => {
    const decoder = ai.stream.createSSEDecoder()

    // 传入不完整的数据
    const events1 = [...decoder.decode('data: partial')]
    expect(events1).toHaveLength(0)

    // 重置后，之前的缓冲丢失
    decoder.reset()

    const events2 = [...decoder.decode('data: fresh\n\n')]
    expect(events2).toHaveLength(1)
    expect(events2[0].data).toBe('fresh')
  })
})
