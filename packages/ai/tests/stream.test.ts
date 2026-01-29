/**
 * =============================================================================
 * @hai/ai - 流式响应测试
 * =============================================================================
 */

import type {
  SSEDecoder,
  StreamProcessor,
} from '../src/stream.js'
import type { ChatCompletionChunk } from '../src/types.js'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  collectStream,
  createSSEDecoder,
  createStreamProcessor,
  encodeSSE,
} from '../src/stream.js'

describe('streamProcessor', () => {
  let processor: StreamProcessor

  beforeEach(() => {
    processor = createStreamProcessor()
  })

  describe('process', () => {
    it('应该累积文本内容', () => {
      const chunks: ChatCompletionChunk[] = [
        createChunk({ content: 'Hello' }),
        createChunk({ content: ' ' }),
        createChunk({ content: 'World' }),
        createChunk({ content: '!' }, 'stop'),
      ]

      for (const chunk of chunks) {
        processor.process(chunk)
      }

      const result = processor.getResult()
      expect(result.content).toBe('Hello World!')
      expect(result.finishReason).toBe('stop')
    })

    it('应该累积工具调用', () => {
      const chunks: ChatCompletionChunk[] = [
        createChunk({
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'get_', arguments: '{"lo' },
            },
          ],
        }),
        createChunk({
          tool_calls: [
            {
              type: 'function',
              function: { name: 'weather', arguments: 'cation":"' },
            },
          ],
        }),
        createChunk({
          tool_calls: [
            {
              type: 'function',
              function: { arguments: 'Beijing"}' },
            },
          ],
        }),
        createChunk({}, 'tool_calls'),
      ]

      for (const chunk of chunks) {
        processor.process(chunk)
      }

      const result = processor.getResult()
      expect(result.toolCalls.length).toBe(1)
      expect(result.toolCalls[0].function.name).toBe('get_weather')
      expect(result.toolCalls[0].function.arguments).toBe('{"location":"Beijing"}')
      expect(result.finishReason).toBe('tool_calls')
    })

    it('应该返回当前 delta', () => {
      const chunk = createChunk({ content: 'Test' })

      const delta = processor.process(chunk)

      expect(delta).not.toBeNull()
      expect(delta?.content).toBe('Test')
    })
  })

  describe('toAssistantMessage', () => {
    it('应该转换为助手消息', () => {
      processor.process(createChunk({ content: 'Hello' }))
      processor.process(createChunk({ content: ' World' }, 'stop'))

      const message = processor.toAssistantMessage()

      expect(message.role).toBe('assistant')
      expect(message.content).toBe('Hello World')
    })

    it('应该处理工具调用', () => {
      processor.process(createChunk({
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'test', arguments: '{}' },
          },
        ],
      }, 'tool_calls'))

      const message = processor.toAssistantMessage()

      expect(message.role).toBe('assistant')
      expect(message.content).toBeNull()
      expect(message.tool_calls).toBeDefined()
      expect(message.tool_calls?.length).toBe(1)
    })
  })

  describe('reset', () => {
    it('应该重置处理器状态', () => {
      processor.process(createChunk({ content: 'Hello' }))
      processor.reset()
      processor.process(createChunk({ content: 'World' }, 'stop'))

      const result = processor.getResult()
      expect(result.content).toBe('World')
    })
  })
})

describe('sSEDecoder', () => {
  let decoder: SSEDecoder

  beforeEach(() => {
    decoder = createSSEDecoder()
  })

  describe('decode', () => {
    it('应该解码简单事件', () => {
      const text = 'data: {"test": true}\n\n'

      const events = Array.from(decoder.decode(text))

      expect(events.length).toBe(1)
      expect(events[0].data).toBe('{"test": true}')
    })

    it('应该解码带事件类型的事件', () => {
      const text = 'event: message\ndata: hello\n\n'

      const events = Array.from(decoder.decode(text))

      expect(events.length).toBe(1)
      expect(events[0].event).toBe('message')
      expect(events[0].data).toBe('hello')
    })

    it('应该处理多行数据', () => {
      const text = 'data: line1\ndata: line2\n\n'

      const events = Array.from(decoder.decode(text))

      expect(events.length).toBe(1)
      expect(events[0].data).toBe('line1\nline2')
    })

    it('应该处理分片数据', () => {
      const events1 = Array.from(decoder.decode('data: hel'))
      const events2 = Array.from(decoder.decode('lo\n\n'))

      expect(events1.length).toBe(0)
      expect(events2.length).toBe(1)
      expect(events2[0].data).toBe('hello')
    })

    it('应该解码多个事件', () => {
      const text = 'data: first\n\ndata: second\n\n'

      const events = Array.from(decoder.decode(text))

      expect(events.length).toBe(2)
      expect(events[0].data).toBe('first')
      expect(events[1].data).toBe('second')
    })

    it('应该解码 id 和 retry', () => {
      const text = 'id: 123\nretry: 5000\ndata: test\n\n'

      const events = Array.from(decoder.decode(text))

      expect(events[0].id).toBe('123')
      expect(events[0].retry).toBe(5000)
    })
  })

  describe('reset', () => {
    it('应该重置解码器状态', () => {
      decoder.decode('data: incomplete')
      decoder.reset()

      const events = Array.from(decoder.decode('data: fresh\n\n'))

      expect(events.length).toBe(1)
      expect(events[0].data).toBe('fresh')
    })
  })
})

describe('encodeSSE', () => {
  it('应该编码简单事件', () => {
    const encoded = encodeSSE({ data: 'hello' })

    expect(encoded).toBe('data: hello\n\n')
  })

  it('应该编码完整事件', () => {
    const encoded = encodeSSE({
      event: 'message',
      id: '123',
      retry: 5000,
      data: 'hello',
    })

    expect(encoded).toContain('event: message\n')
    expect(encoded).toContain('id: 123\n')
    expect(encoded).toContain('retry: 5000\n')
    expect(encoded).toContain('data: hello\n')
  })

  it('应该处理多行数据', () => {
    const encoded = encodeSSE({ data: 'line1\nline2' })

    expect(encoded).toBe('data: line1\ndata: line2\n\n')
  })
})

describe('collectStream', () => {
  it('应该收集完整的流式响应', async () => {
    async function* generateChunks(): AsyncGenerator<ChatCompletionChunk> {
      yield createChunk({ content: 'Hello' })
      yield createChunk({ content: ' World' }, 'stop')
    }

    const result = await collectStream(generateChunks())

    expect(result.content).toBe('Hello World')
    expect(result.finishReason).toBe('stop')
  })
})

// 辅助函数
function createChunk(
  delta: Partial<{
    role: string
    content: string
    tool_calls: Array<{
      id?: string
      type: 'function'
      function?: { name?: string, arguments?: string }
    }>
  }>,
  finishReason: string | null = null,
): ChatCompletionChunk {
  return {
    id: 'test-id',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'test-model',
    choices: [
      {
        index: 0,
        delta: delta as any,
        finish_reason: finishReason as any,
      },
    ],
  }
}
