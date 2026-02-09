/**
 * =============================================================================
 * @hai/ai - 流式响应处理
 * =============================================================================
 *
 * 提供流式响应的处理工具，包括 SSE 编解码和流处理器。
 *
 * @example
 * ```ts
 * import { ai } from '@hai/ai'
 *
 * const processor = ai.stream.createProcessor()
 * for await (const chunk of ai.llm.chatStream({ messages })) {
 *     processor.process(chunk)
 * }
 * const result = processor.getResult()
 * ```
 *
 * @module stream/ai-stream-main
 * =============================================================================
 */

import type {
  AssistantMessage,
  ChatCompletionChunk,
  ChatCompletionDelta,
  ToolCall,
} from '../ai-types.js'

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 流处理结果
 *
 * 通过 `StreamProcessor.getResult()` 或 `ai.stream.collect()` 获取。
 */
export interface StreamResult {
  /** 累积的文本内容（所有 chunk 的 `delta.content` 拼接） */
  content: string
  /** 累积的工具调用（按 `index` 合并后转换为完整 `ToolCall`） */
  toolCalls: ToolCall[]
  /** 完成原因（如 `'stop'`、`'tool_calls'`），未完成时为 `null` */
  finishReason: string | null
}

/**
 * 流处理器接口
 *
 * 逐块累积流式响应中的文本内容和工具调用。
 * 通过 `ai.stream.createProcessor()` 创建。
 */
export interface StreamProcessor {
  /**
   * 处理一个流式块
   *
   * 累积 `delta.content`、`delta.tool_calls` 和 `finish_reason`。
   * 若 chunk 中无有效 choice，返回 `null`。
   */
  process: (chunk: ChatCompletionChunk) => ChatCompletionDelta | null
  /** 获取当前累积结果（可在流处理过程中随时调用） */
  getResult: () => StreamResult
  /**
   * 将累积结果转换为助手消息
   *
   * 当存在工具调用时，`content` 设为 `null`，`tool_calls` 包含所有工具调用。
   * 无工具调用时，`content` 为累积的文本内容。
   */
  toAssistantMessage: () => AssistantMessage
  /** 重置处理器状态（清空内容、工具调用和完成原因） */
  reset: () => void
}

/**
 * SSE 事件
 *
 * 符合 Server-Sent Events 规范的事件结构。
 * 所有字段均为可选，但至少应包含 `data`。
 */
export interface SSEEvent {
  /** 事件类型（对应 SSE 的 `event:` 字段） */
  event?: string
  /** 事件 ID（对应 SSE 的 `id:` 字段，用于断线重连） */
  id?: string
  /** 重连间隔（毫秒，对应 SSE 的 `retry:` 字段） */
  retry?: number
  /** 事件数据（对应 SSE 的 `data:` 字段，多行用 `\n` 连接） */
  data?: string
}

/**
 * SSE 解码器接口
 *
 * 内部维护缓冲区，支持跨多次 `decode()` 调用的分片拼接。
 * 以双换行符 `\n\n` 为事件分隔符。
 */
export interface SSEDecoder {
  /** 解码文本数据，产出零个或多个完整的 SSE 事件 */
  decode: (text: string) => Iterable<SSEEvent>
  /** 重置解码器，清空内部缓冲区 */
  reset: () => void
}

// =============================================================================
// 操作接口
// =============================================================================

/**
 * Stream 操作接口
 *
 * 通过 `ai.stream` 访问。
 * 所有方法为纯函数，不依赖 `ai.init()` 初始化状态。
 */
export interface StreamOperations {
  /** 创建流处理器，用于逐块累积流式响应 */
  createProcessor: () => StreamProcessor
  /** 完整消费流式响应并返回累积结果 */
  collect: (stream: AsyncIterable<ChatCompletionChunk>) => Promise<StreamResult>
  /** 创建 SSE 解码器（支持跨分片缓冲） */
  createSSEDecoder: () => SSEDecoder
  /** 将 SSE 事件编码为符合规范的文本格式 */
  encodeSSE: (event: SSEEvent) => string
}

// =============================================================================
// 流处理器
// =============================================================================

/**
 * 创建流处理器
 *
 * @returns 流处理器实例
 *
 * @example
 * ```ts
 * const processor = ai.stream.createProcessor()
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
  /** 累积的文本内容 */
  let content = ''
  /** 按 index 索引累积的工具调用（同一 index 的多个 chunk 会合并 name/arguments） */
  let toolCalls: Map<number, { id: string, name: string, arguments: string }> = new Map()
  /** 最后一个非 null 的 finish_reason */
  let finishReason: string | null = null

  return {
    process(chunk: ChatCompletionChunk): ChatCompletionDelta | null {
      const choice = chunk.choices[0]
      if (!choice)
        return null

      const delta = choice.delta

      // 累积内容片段
      if (delta.content) {
        content += delta.content
      }

      // 累积工具调用：同一 index 的多个 chunk 会被合并（name 和 arguments 逐步拼接）
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCalls.get(tc.index)
          if (existing) {
            if (tc.function?.name) {
              existing.name += tc.function.name
            }
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments
            }
          }
          else if (tc.id) {
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
      // 存在工具调用时，content 设为 null（符合 OpenAI 协议约定）
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
 * const result = await ai.stream.collect(ai.llm.chatStream({ messages }))
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
 * 创建 SSE 解码器
 *
 * @returns SSE 解码器实例
 *
 * @example
 * ```ts
 * const decoder = ai.stream.createSSEDecoder()
 *
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

      const parts = buffer.split('\n\n')
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
 * const encoded = ai.stream.encodeSSE({ data: '{"text": "hello"}' })
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
    const dataLines = event.data.split('\n')
    for (const line of dataLines) {
      lines.push(`data: ${line}`)
    }
  }

  return `${lines.join('\n')}\n\n`
}
