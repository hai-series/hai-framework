/**
 * @h-ai/ai — LLM 流式响应处理
 *
 * 提供流处理器、SSE 编解码等纯函数工具。
 * @module ai-llm-stream
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
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const processor = createStreamProcessor()
 * processor.process({ id: 'chunk-1', object: 'chat.completion.chunk', created: 0, model: 'configured-model', choices: [{ index: 0, delta: { content: '你好' }, finish_reason: null }] })
 * const text = processor.getResult().content
 * ```
 */
export function createStreamProcessor(): StreamProcessor {
  /** 累积文本内容 */
  let content = ''
  /** 累积 reasoning 内容 */
  let reasoningContent = ''
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

      const reasoningDelta = 'reasoning_content' in delta && typeof delta.reasoning_content === 'string'
        ? delta.reasoning_content
        : ''
      if (reasoningDelta) {
        reasoningContent += reasoningDelta
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
        reasoningContent,
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
      if (result.reasoningContent) {
        message.reasoning_content = result.reasoningContent
      }
      if (result.toolCalls.length > 0) {
        message.tool_calls = result.toolCalls
      }
      return message
    },

    /** 重置所有状态，可复用处理器处理下一次流 */
    reset(): void {
      content = ''
      reasoningContent = ''
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
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function consume(stream: AsyncIterable<ChatCompletionChunk>) {
 *   const result = await collectStream(stream)
 *   return { text: result.content, toolCalls: result.toolCalls }
 * }
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
 * 接受 LF、CRLF、CR（含跨分片的 CRLF），仅移除冒号后的一个空格。
 * 多行 data 按 LF 合并；空 data 仍是事件，注释与无 data 块不派发。
 * id/retry 保留最近有效值；EOF 不补空行，未完成事件由 reset 丢弃。
 *
 * @returns SSE 解码器实例
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const decoder = createSSEDecoder()
 * const first = [...decoder.decode('data: 你')]
 * const completed = [...decoder.decode('好\n\n')]
 * const text = completed[0]?.data
 * decoder.reset()
 * ```
 */
export function createSSEDecoder(): SSEDecoder {
  let line = ''
  let data: string[] = []
  let eventType = ''
  let lastId: string | undefined
  let retry: number | undefined
  let skipLf = false
  let firstCharacter = true

  /** 完整行才处理字段；空行派发后仅清空当前 data/event，保留连接级 id/retry。 */
  function consumeLine(): SSEEvent | undefined {
    const current = line
    line = ''
    if (current === '') {
      const result: SSEEvent | undefined = data.length > 0
        ? { data: data.join('\n'), ...(eventType ? { event: eventType } : {}), ...(lastId === undefined ? {} : { id: lastId }), ...(retry === undefined ? {} : { retry }) }
        : undefined
      data = []
      eventType = ''
      return result
    }
    if (current.startsWith(':'))
      return undefined
    const colon = current.indexOf(':')
    const field = colon < 0 ? current : current.slice(0, colon)
    let value = colon < 0 ? '' : current.slice(colon + 1)
    if (value.startsWith(' '))
      value = value.slice(1)
    if (field === 'data')
      data.push(value)
    else if (field === 'event')
      eventType = value
    else if (field === 'id' && !value.includes('\0'))
      lastId = value
    else if (field === 'retry' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)))
      retry = Number(value)
    return undefined
  }

  return {
    * decode(text: string): Iterable<SSEEvent> {
      for (const character of text) {
        if (firstCharacter) {
          firstCharacter = false
          if (character === '\uFEFF')
            continue
        }
        if (skipLf) {
          skipLf = false
          if (character === '\n')
            continue
        }
        if (character !== '\r' && character !== '\n') {
          line += character
          continue
        }
        skipLf = character === '\r'
        const event = consumeLine()
        if (event)
          yield event
      }
    },

    reset(): void {
      line = ''
      data = []
      eventType = ''
      lastId = undefined
      retry = undefined
      skipLf = false
      firstCharacter = true
    },
  }
}

/**
 * 读取真实 SSE 响应，跨字节分片解码 UTF-8；退出、取消和失败均取消正文并释放 reader。
 *
 * EOF 只刷新字符解码器，不补协议空行；未终止的 SSE 事件不会伪造完成。
 * 此函数仅供实际 Provider 复用，不提供自动重连或业务副作用重放。
 *
 * @example
 * ```ts
 * // 模块内部上下文：消费方提前 return 仍取消底层 HTTP 正文。
 * async function first(response: Response, signal: AbortSignal) {
 *   for await (const event of readSSEStream(response, signal)) return event.data
 *   return undefined
 * }
 * ```
 */
export async function* readSSEStream(response: Response, signal?: AbortSignal): AsyncIterable<SSEEvent> {
  if (!response.body)
    return
  const reader = response.body.getReader()
  // BOM 由文本协议层只剥离一次；避免 TextDecoder 和协议解析器各剥离一次。
  const text = new TextDecoder('utf-8', { ignoreBOM: true })
  const decoder = createSSEDecoder()
  const abort = () => {
    void reader.cancel(signal?.reason).catch(() => {})
  }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    while (true) {
      signal?.throwIfAborted()
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      if (done)
        break
      yield* decoder.decode(text.decode(value, { stream: true }))
    }
    yield* decoder.decode(text.decode())
  }
  finally {
    signal?.removeEventListener('abort', abort)
    decoder.reset()
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/**
 * 将 SSE 事件编码为符合规范的文本格式
 *
 * 输出以双换行 `\n\n` 结尾，可直接写入 HTTP 响应流。
 * data 中的 CRLF/CR 规范化为 LF；拒绝 id/event 字段换行、id 的 NUL 和无效 retry。
 *
 * @param event - SSE 事件
 * @returns 编码后的文本（以 `\n\n` 结尾）
 * @throws 字段无法编码为合法的单个 SSE 事件时抛 TypeError / RangeError。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const encoded = encodeSSE({ event: 'message', id: 'event-1', data: '第一行\n第二行' })
 * const decoder = createSSEDecoder()
 * const events = [...decoder.decode(encoded)]
 * ```
 */
export function encodeSSE(event: SSEEvent): string {
  if ((event.event !== undefined && /[\r\n]/.test(event.event)) || (event.id !== undefined && /[\r\n\0]/.test(event.id)))
    throw new TypeError('SSE event/id must not contain line breaks; id must not contain NUL')
  if (event.retry !== undefined && (!Number.isSafeInteger(event.retry) || event.retry < 0))
    throw new RangeError('SSE retry must be a non-negative safe integer')
  const lines: string[] = []
  if (event.event) {
    lines.push(`event: ${event.event}`)
  }
  if (event.id !== undefined) {
    lines.push(`id: ${event.id}`)
  }
  if (event.retry !== undefined) {
    lines.push(`retry: ${event.retry}`)
  }
  if (event.data !== undefined) {
    const dataLines = event.data.split(/\r\n|\r|\n/)
    for (const line of dataLines) {
      lines.push(`data: ${line}`)
    }
  }
  return `${lines.join('\n')}\n\n`
}
