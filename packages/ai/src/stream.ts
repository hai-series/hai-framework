/**
 * =============================================================================
 * @hai/ai - 流式响应处理
 * =============================================================================
 * 提供流式响应的处理工具
 * 
 * 特性:
 * - 异步迭代器支持
 * - 文本累积
 * - 工具调用收集
 * - SSE 编码/解码
 * =============================================================================
 */

import type {
    ChatCompletionChunk,
    ChatCompletionDelta,
    AssistantMessage,
    ToolCall,
    TokenUsage,
} from './types.js'

/**
 * 流式累积结果
 */
export interface StreamAccumulator {
    /** 累积的文本内容 */
    content: string
    /** 累积的工具调用 */
    toolCalls: ToolCall[]
    /** Token 使用量（如果可用） */
    usage?: TokenUsage
    /** 完成原因 */
    finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null
}

/**
 * 流处理器
 * 用于处理和累积流式响应
 */
export class StreamProcessor {
    private content: string = ''
    private toolCallsMap: Map<number, Partial<ToolCall>> = new Map()
    private usage?: TokenUsage
    private finishReason: StreamAccumulator['finishReason'] = null

    /**
     * 处理一个流式响应块
     * 
     * @param chunk - 响应块
     * @returns 当前块的 delta 内容
     */
    process(chunk: ChatCompletionChunk): ChatCompletionDelta | null {
        if (chunk.choices.length === 0) {
            return null
        }

        const choice = chunk.choices[0]
        const delta = choice.delta

        // 累积文本内容
        if (delta.content) {
            this.content += delta.content
        }

        // 累积工具调用
        if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
                const index = tc.id ? this.getToolCallIndex(tc.id) : this.toolCallsMap.size
                const existing = this.toolCallsMap.get(index) ?? {}

                this.toolCallsMap.set(index, {
                    ...existing,
                    id: tc.id ?? existing.id,
                    type: 'function',
                    function: {
                        name: (tc.function?.name ?? '') + (existing.function?.name ?? ''),
                        arguments: (existing.function?.arguments ?? '') + (tc.function?.arguments ?? ''),
                    },
                })
            }
        }

        // 记录完成原因
        if (choice.finish_reason) {
            this.finishReason = choice.finish_reason
        }

        // 记录 token 使用量
        if (chunk.usage) {
            this.usage = chunk.usage
        }

        return delta
    }

    /**
     * 获取工具调用索引
     */
    private getToolCallIndex(id: string): number {
        for (const [index, tc] of this.toolCallsMap) {
            if (tc.id === id) {
                return index
            }
        }
        return this.toolCallsMap.size
    }

    /**
     * 获取累积结果
     */
    getResult(): StreamAccumulator {
        const toolCalls: ToolCall[] = []

        for (const tc of this.toolCallsMap.values()) {
            if (tc.id && tc.function?.name) {
                toolCalls.push({
                    id: tc.id,
                    type: 'function',
                    function: {
                        name: tc.function.name,
                        arguments: tc.function.arguments ?? '{}',
                    },
                })
            }
        }

        return {
            content: this.content,
            toolCalls,
            usage: this.usage,
            finishReason: this.finishReason,
        }
    }

    /**
     * 转换为助手消息
     */
    toAssistantMessage(): AssistantMessage {
        const result = this.getResult()

        return {
            role: 'assistant',
            content: result.content || null,
            tool_calls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
        }
    }

    /**
     * 重置处理器
     */
    reset(): void {
        this.content = ''
        this.toolCallsMap.clear()
        this.usage = undefined
        this.finishReason = null
    }
}

/**
 * SSE 事件
 */
export interface SSEEvent {
    event?: string
    data: string
    id?: string
    retry?: number
}

/**
 * 编码 SSE 事件
 * 
 * @param event - SSE 事件
 * @returns 编码后的字符串
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

    // 处理多行数据
    const dataLines = event.data.split('\n')
    for (const line of dataLines) {
        lines.push(`data: ${line}`)
    }

    return lines.join('\n') + '\n\n'
}

/**
 * SSE 解码器
 */
export class SSEDecoder {
    private buffer: string = ''

    /**
     * 解码 SSE 数据
     * 
     * @param text - 原始文本
     * @returns SSE 事件数组
     */
    decode(text: string): SSEEvent[] {
        this.buffer += text
        const results: SSEEvent[] = []

        const events = this.buffer.split('\n\n')

        // 保留最后一个不完整的事件
        this.buffer = events.pop() ?? ''

        for (const eventText of events) {
            if (!eventText.trim()) {
                continue
            }

            const event = this.parseEvent(eventText)
            if (event) {
                results.push(event)
            }
        }

        return results
    }

    /**
     * 解析单个事件
     */
    private parseEvent(text: string): SSEEvent | null {
        const lines = text.split('\n')
        const event: Partial<SSEEvent> = {}
        const dataLines: string[] = []

        for (const line of lines) {
            if (line.startsWith('event:')) {
                event.event = line.slice(6).trim()
            }
            else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trim())
            }
            else if (line.startsWith('id:')) {
                event.id = line.slice(3).trim()
            }
            else if (line.startsWith('retry:')) {
                event.retry = parseInt(line.slice(6).trim(), 10)
            }
        }

        if (dataLines.length === 0) {
            return null
        }

        event.data = dataLines.join('\n')
        return event as SSEEvent
    }

    /**
     * 重置解码器
     */
    reset(): void {
        this.buffer = ''
    }
}

/**
 * 创建 SSE 可读流
 * 
 * @param chunks - 异步块迭代器
 * @param encoder - 文本编码器
 */
export function createSSEReadableStream(
    chunks: AsyncIterable<ChatCompletionChunk>,
    encoder: TextEncoder = new TextEncoder(),
): ReadableStream<Uint8Array> {
    return new ReadableStream({
        async start(controller) {
            try {
                for await (const chunk of chunks) {
                    const event: SSEEvent = {
                        data: JSON.stringify(chunk),
                    }
                    const encoded = encoder.encode(encodeSSE(event))
                    controller.enqueue(encoded)
                }

                // 发送完成标记
                const doneEvent: SSEEvent = {
                    data: '[DONE]',
                }
                controller.enqueue(encoder.encode(encodeSSE(doneEvent)))
                controller.close()
            }
            catch (error) {
                controller.error(error)
            }
        },
    })
}

/**
 * 从 SSE 流解析 ChatCompletionChunk
 * 
 * @param stream - SSE 数据流
 * @yields ChatCompletionChunk
 */
export async function* parseSSEStream(
    stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatCompletionChunk> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    const sseDecoder = new SSEDecoder()

    try {
        while (true) {
            const { done, value } = await reader.read()

            if (done) {
                break
            }

            const text = decoder.decode(value, { stream: true })

            for (const event of sseDecoder.decode(text)) {
                if (event.data === '[DONE]') {
                    return
                }

                try {
                    const chunk = JSON.parse(event.data) as ChatCompletionChunk
                    yield chunk
                }
                catch {
                    // 忽略解析错误
                }
            }
        }
    }
    finally {
        reader.releaseLock()
    }
}

/**
 * 创建流处理器
 */
export function createStreamProcessor(): StreamProcessor {
    return new StreamProcessor()
}

/**
 * 创建 SSE 解码器
 */
export function createSSEDecoder(): SSEDecoder {
    return new SSEDecoder()
}

/**
 * 收集完整的流式响应
 * 
 * @param chunks - 异步块迭代器
 * @returns 累积结果
 */
export async function collectStream(
    chunks: AsyncIterable<ChatCompletionChunk>,
): Promise<StreamAccumulator> {
    const processor = createStreamProcessor()

    for await (const chunk of chunks) {
        processor.process(chunk)
    }

    return processor.getResult()
}
