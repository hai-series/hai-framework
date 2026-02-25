/**
 * @h-ai/ai — LLM 流式响应处理
 *
 * 提供流处理器、SSE 编解码等纯函数工具。
 */

import type {
  AssistantMessage,
  ChatCompletionChunk,
  ChatCompletionDelta,
  SSEDecoder,
  SSEEvent,
  StreamProcessor,
  StreamResult,
} from './ai-llm-types.js'

// ─── 流处理器 ───

/**
 * 创建流处理器，逐块累积流式响应的文本内容和工具调用
 *
 * @returns 流处理器实例
 *
 * @example
 * ```ts
 * const processor = createStreamProcessor()
 * for await (const chunk of stream) {
 *   processor.process(chunk)
 * }
 * const result = processor.getResult() // { content, toolCalls, finishReason }
 * ```
 */
export function createStreamProcessor(): StreamProcessor {
  /** 累积文本内容 */
  let content = ''
  /** 按索引累积工具调用片段（流式中可能跨多个 chunk） */
  let toolCalls: Map<number, { id: string, name: string, arguments: string }> = new Map()
  /** 完成原因（`'stop'` | `'tool_calls'` 等） */
  let finishReason: string | null = null

  return {
    /** 处理单个 chunk，累积内容/工具调用/完成原因 */
    process(chunk: ChatCompletionChunk): ChatCompletionDelta | null {
      const choice = chunk.choices[0]
      if (!choice)
        return null

      const delta = choice.delta

      if (delta.content) {
        content += delta.content
      }

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

      if (choice.finish_reason) {
        finishReason = choice.finish_reason
      }

      return delta
    },

    /** 获取当前累积结果快照 */
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

    /** 将累积结果转为 AssistantMessage（含工具调用时 content 为 `null`） */
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

    /** 重置所有状态，可复用处理器处理下一次流 */
    reset(): void {
      content = ''
      toolCalls = new Map()
      finishReason = null
    },
  }
}

// ─── 收集完整流 ───

/**
 * 完整消费流式响应并返回累积结果
 *
 * @param stream - 流式响应迭代器
 * @returns 完整的流处理结果
 *
 * @example
 * ```ts
 * const result = await collectStream(ai.llm.chatStream({ messages }))
 * console.log(result.content, result.finishReason)
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

// ─── SSE 编解码 ───

/**
 * 创建 SSE 解码器，内部维护缓冲区，支持跨分片拼接
 *
 * 按 SSE 规范解析 `event:`、`data:`、`id:`、`retry:` 字段，
 * 多行 `data:` 自动用换行符拼接。
 *
 * @returns SSE 解码器实例
 *
 * @example
 * ```ts
 * const decoder = createSSEDecoder()
 * for (const event of decoder.decode(rawText)) {
 *   console.log(event.data) // SSE data 内容
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
 * 将 SSE 事件编码为符合规范的文本格式
 *
 * 输出以双换行 `\n\n` 结尾，可直接写入 HTTP 响应流。
 *
 * @param event - SSE 事件
 * @returns 编码后的文本（以 `\n\n` 结尾）
 *
 * @example
 * ```ts
 * const text = encodeSSE({ event: 'message', data: '{"content":"hi"}' })
 * // => 'event: message\ndata: {"content":"hi"}\n\n'
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
