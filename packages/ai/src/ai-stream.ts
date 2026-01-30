/**
 * =============================================================================
 * @hai/ai - 流式响应处理
 * =============================================================================
 *
 * 提供流式响应的处理工具，包括 SSE 编解码和流处理器。
 *
 * @example
 * ```ts
 * import { createStreamProcessor, collectStream } from '@hai/ai'
 *
 * // 使用流处理器
 * const processor = createStreamProcessor()
 * for await (const chunk of ai.llm.chatStream({ messages })) {
 *     processor.process(chunk)
 * }
 * const result = processor.getResult()
 *
 * // 或者直接收集
 * const result = await collectStream(ai.llm.chatStream({ messages }))
 * ```
 *
 * @module ai-stream
 * =============================================================================
 */

import type {
  AssistantMessage,
  ChatCompletionChunk,
  ChatCompletionDelta,
  ToolCall,
} from './ai-types.js'

// =============================================================================
// 流处理器
// =============================================================================

/**
 * 流处理结果
 */
export interface StreamResult {
  /** 累积的文本内容 */
  content: string
  /** 累积的工具调用 */
  toolCalls: ToolCall[]
  /** 完成原因 */
  finishReason: string | null
}

/**
 * 流处理器接口
 */
export interface StreamProcessor {
  /** 处理一个流式块 */
  process: (chunk: ChatCompletionChunk) => ChatCompletionDelta | null
  /** 获取当前结果 */
  getResult: () => StreamResult
  /** 转换为助手消息 */
  toAssistantMessage: () => AssistantMessage
  /** 重置处理器 */
  reset: () => void
}

/**
 * 创建流处理器
 *
 * @returns 流处理器实例
 *
 * @example
 * ```ts
 * const processor = createStreamProcessor()
 *
 * for await (const chunk of stream) {
 *     const delta = processor.process(chunk)
 *     if (delta?.content) {
 *         // 逐步显示内容
 *     }
 * }
 *
 * const result = processor.getResult()
 * ```
 */
export function createStreamProcessor(): StreamProcessor {
  let content = ''
  let toolCalls: Map<number, { id: string, name: string, arguments: string }> = new Map()
  let finishReason: string | null = null

  return {
    process(chunk: ChatCompletionChunk): ChatCompletionDelta | null {
      const choice = chunk.choices[0]
      if (!choice)
        return null

      const delta = choice.delta

      // 累积内容
      if (delta.content) {
        content += delta.content
      }

      // 累积工具调用
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCalls.get(tc.index)
          if (existing) {
            // 追加到现有工具调用
            if (tc.function?.name) {
              existing.name += tc.function.name
            }
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments
            }
          }
          else if (tc.id) {
            // 新的工具调用
            toolCalls.set(tc.index, {
              id: tc.id,
              name: tc.function?.name || '',
              arguments: tc.function?.arguments || '',
            })
          }
        }
      }

      // 记录完成原因
      if (choice.finish_reason) {
        finishReason = choice.finish_reason
      }

      return delta
    },

    getResult(): StreamResult {
      return {
        content,
        toolCalls: Array.from(toolCalls.values()).map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        })),
        finishReason,
      }
    },

    toAssistantMessage(): AssistantMessage {
      const result = this.getResult()
      const message: AssistantMessage = {
        role: 'assistant',
        content: result.toolCalls.length > 0 ? null : result.content,
      }

      if (result.toolCalls.length > 0) {
        message.tool_calls = result.toolCalls
      }

      return message
    },

    reset(): void {
      content = ''
      toolCalls = new Map()
      finishReason = null
    },
  }
}

/**
 * 收集完整的流式响应
 *
 * @param stream - 流式响应迭代器
 * @returns 完整的结果
 *
 * @example
 * ```ts
 * const result = await collectStream(ai.llm.chatStream({ messages }))
 * console.log(result.content)
 * ```
 */
export async function collectStream(
  stream: AsyncIterable<ChatCompletionChunk>,
): Promise<StreamResult> {
  const processor = createStreamProcessor()

  for await (const chunk of stream) {
    processor.process(chunk)
  }

  return processor.getResult()
}

// =============================================================================
// SSE 编解码
// =============================================================================

/**
 * SSE 事件
 */
export interface SSEEvent {
  event?: string
  id?: string
  retry?: number
  data?: string
}

/**
 * SSE 解码器接口
 */
export interface SSEDecoder {
  /** 解码文本数据 */
  decode: (text: string) => Iterable<SSEEvent>
  /** 重置解码器 */
  reset: () => void
}

/**
 * 创建 SSE 解码器
 *
 * @returns SSE 解码器实例
 *
 * @example
 * ```ts
 * const decoder = createSSEDecoder()
 *
 * // 处理流式数据
 * for (const text of dataChunks) {
 *     for (const event of decoder.decode(text)) {
 *         console.log(event.data)
 *     }
 * }
 * ```
 */
export function createSSEDecoder(): SSEDecoder {
  let buffer = ''

  return {
    * decode(text: string): Iterable<SSEEvent> {
      buffer += text

      // 按事件分割（双换行）
      const parts = buffer.split('\n\n')
      // 最后一部分可能不完整，保留在 buffer 中
      buffer = parts.pop() || ''

      for (const part of parts) {
        if (!part.trim())
          continue

        const event: SSEEvent = {}
        const lines = part.split('\n')
        const dataLines: string[] = []

        for (const line of lines) {
          if (line.startsWith('event:')) {
            event.event = line.slice(6).trim()
          }
          else if (line.startsWith('id:')) {
            event.id = line.slice(3).trim()
          }
          else if (line.startsWith('retry:')) {
            event.retry = Number.parseInt(line.slice(6).trim(), 10)
          }
          else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim())
          }
          else if (line.startsWith('data ')) {
            dataLines.push(line.slice(5))
          }
        }

        if (dataLines.length > 0) {
          event.data = dataLines.join('\n')
        }

        yield event
      }
    },

    reset(): void {
      buffer = ''
    },
  }
}

/**
 * 编码 SSE 事件
 *
 * @param event - SSE 事件
 * @returns 编码后的文本
 *
 * @example
 * ```ts
 * const encoded = encodeSSE({ data: '{"text": "hello"}' })
 * // => 'data: {"text": "hello"}\n\n'
 * ```
 */
export function encodeSSE(event: SSEEvent): string {
  const lines: string[] = []

  if (event.event) {
    lines.push(`event: ${event.event}`)
  }
  if (event.id) {
    lines.push(`id: ${event.id}`)
  }
  if (event.retry !== undefined) {
    lines.push(`retry: ${event.retry}`)
  }
  if (event.data !== undefined) {
    // 多行数据需要分成多个 data: 行
    const dataLines = event.data.split('\n')
    for (const line of dataLines) {
      lines.push(`data: ${line}`)
    }
  }

  return `${lines.join('\n')}\n\n`
}
