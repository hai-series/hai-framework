/**
 * =============================================================================
 * @hai/ai - 前端 AI 客户端
 * =============================================================================
 *
 * 提供前端直接调用 AI API 的功能，适用于浏览器环境。
 * 不依赖 Node.js 特定模块，可在纯浏览器中运行。
 *
 * @example
 * ```ts
 * import { createAIClient } from '@hai/ai/client'
 *
 * const client = createAIClient({
 *     baseUrl: '/api/ai',
 * })
 *
 * // 流式聊天
 * for await (const chunk of client.chatStream({
 *     messages: [{ role: 'user', content: '你好' }]
 * })) {
 *     // 处理 chunk
 * }
 * ```
 *
 * @module ai-client
 * =============================================================================
 */

import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from '../ai-types.js'

// =============================================================================
// 客户端配置
// =============================================================================

/**
 * AI 客户端配置
 *
 * 配置前端 AI 客户端的连接参数。
 */
export interface AIClientConfig {
  /** API 基础 URL，可为相对路径（如 `/api/ai`）或完整 URL */
  baseUrl: string
  /** 请求超时（毫秒），默认 `60000` */
  timeout?: number
  /** 自定义请求头（如 Authorization） */
  headers?: Record<string, string>
}

/**
 * 流式响应进度
 *
 * 通过 `StreamOptions.onProgress` 回调接收。
 */
export interface StreamProgress {
  /** 当前累积的文本内容（所有 chunk 的 delta.content 拼接） */
  content: string
  /** 是否已完成（收到 `[DONE]` 或 `finish_reason` 时为 `true`） */
  done: boolean
  /** 完成原因（仅在 `done: true` 时存在） */
  finishReason?: string
}

/**
 * 流式响应选项
 *
 * 控制流式请求的进度回调和取消行为。
 */
export interface StreamOptions {
  /** 进度回调，每收到一个 chunk 或完成时触发 */
  onProgress?: (progress: StreamProgress) => void
  /** 取消控制器，用于中断请求 */
  abortController?: AbortController
}

// =============================================================================
// AI 客户端类
// =============================================================================

/**
 * AI 客户端
 *
 * 用于前端（浏览器）直接与 AI API 交互。
 * 不依赖 Node.js 特有模块，可在纯浏览器环境中运行。
 * 通过 `createAIClient()` 工厂函数创建。
 *
 * @example
 * ```ts
 * const client = createAIClient({ baseUrl: '/api/ai' })
 *
 * // 普通请求
 * const response = await client.chat({
 *     messages: [{ role: 'user', content: '你好' }]
 * })
 *
 * // 流式请求
 * for await (const chunk of client.chatStream({
 *     messages: [{ role: 'user', content: '写一首诗' }]
 * })) {
 *     console.log(chunk.choices[0].delta.content)
 * }
 *
 * // 便捷方法
 * const reply = await client.sendMessage('你好', '你是一个助手')
 * ```
 */
export class AIClient {
  /** 合并后的完整配置（包含默认值） */
  private config: Required<AIClientConfig>

  /**
   * @param config - 客户端配置，`timeout` 默认 60000ms，`headers` 默认空对象
   */

  constructor(config: AIClientConfig) {
    this.config = {
      baseUrl: config.baseUrl,
      timeout: config.timeout ?? 60000,
      headers: config.headers ?? {},
    }
  }

  /**
   * 发送聊天请求（非流式）
   *
   * @param request - 聊天请求（强制 `stream: false`）
   * @returns 完整的聊天响应
   * @throws HTTP 错误时抛出包含状态码和错误文本的 Error
   */
  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await this.fetch('/chat', {
      method: 'POST',
      body: JSON.stringify({ ...request, stream: false }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`AI API request failed: ${response.status} ${error}`)
    }

    return response.json()
  }

  /**
   * 发送流式聊天请求
   *
   * 通过 SSE 协议接收流式响应，逐块 yield ChatCompletionChunk。
   * 收到 `[DONE]` 信号时终止。
   *
   * @param request - 聊天请求（强制 `stream: true`）
   * @param options - 流式选项（进度回调、取消控制）
   * @yields ChatCompletionChunk
   * @throws HTTP 错误或响应体不可读时抛出 Error
   *
   * @example
   * ```ts
   * let content = ''
   * for await (const chunk of client.chatStream({ messages })) {
   *     const delta = chunk.choices[0]?.delta?.content ?? ''
   *     content += delta
   * }
   * ```
   */
  async* chatStream(
    request: ChatCompletionRequest,
    options?: StreamOptions,
  ): AsyncIterable<ChatCompletionChunk> {
    const response = await this.fetch('/chat', {
      method: 'POST',
      body: JSON.stringify({ ...request, stream: true }),
      signal: options?.abortController?.signal,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`AI API request failed: ${response.status} ${error}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Response body is not readable')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })

        // 解析 SSE 事件
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)

            if (data === '[DONE]') {
              options?.onProgress?.({ content, done: true })
              return
            }

            try {
              const chunk: ChatCompletionChunk = JSON.parse(data)

              const delta = chunk.choices[0]?.delta?.content
              if (delta) {
                content += delta
              }

              const finishReason = chunk.choices[0]?.finish_reason
              if (finishReason) {
                options?.onProgress?.({ content, done: true, finishReason })
              }
              else {
                options?.onProgress?.({ content, done: false })
              }

              yield chunk
            }
            catch {
              // 忽略解析错误的行
            }
          }
        }
      }
    }
    finally {
      reader.releaseLock()
    }
  }

  /**
   * 便捷方法：发送简单消息并获取回复
   *
   * @param message - 用户消息文本
   * @param systemPrompt - 系统提示词（可选）
   * @returns 助手回复的文本内容，无有效回复时返回空字符串
   */
  async sendMessage(message: string, systemPrompt?: string): Promise<string> {
    const messages: ChatMessage[] = []

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    messages.push({ role: 'user', content: message })

    const response = await this.chat({ messages })
    return response.choices[0]?.message?.content ?? ''
  }

  /**
   * 便捷方法：流式发送消息并获取回复
   *
   * 内部消费完整流后返回累积的文本内容。
   *
   * @param message - 用户消息文本
   * @param options - 流式选项（进度回调、取消控制）
   * @param systemPrompt - 系统提示词（可选）
   * @returns 完整的助手回复文本
   */
  async sendMessageStream(
    message: string,
    options?: StreamOptions,
    systemPrompt?: string,
  ): Promise<string> {
    const messages: ChatMessage[] = []

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    messages.push({ role: 'user', content: message })

    let content = ''
    for await (const chunk of this.chatStream({ messages }, options)) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        content += delta
      }
    }

    return content
  }

  /**
   * 内部 fetch 方法
   *
   * 统一处理 URL 拼接、超时控制和请求头合并。
   * 超时通过 `AbortController` 实现，外部传入的 `signal` 优先级更高。
   */
  private async fetch(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.config.baseUrl}${path}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      return await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
          ...(init.headers as Record<string, string> | undefined),
        },
        signal: init.signal ?? controller.signal,
      })
    }
    finally {
      clearTimeout(timeoutId)
    }
  }
}

// =============================================================================
// 工厂函数
// =============================================================================

/**
 * 创建 AI 客户端
 *
 * @param config - 客户端配置
 * @returns AI 客户端实例
 *
 * @example
 * ```ts
 * const client = createAIClient({ baseUrl: '/api/ai' })
 *
 * const client = createAIClient({
 *     baseUrl: 'https://api.example.com/ai',
 *     timeout: 30000,
 *     headers: {
 *         'Authorization': 'Bearer xxx'
 *     }
 * })
 * ```
 */
export function createAIClient(config: AIClientConfig): AIClient {
  return new AIClient(config)
}

// =============================================================================
// SSE 解析工具
// =============================================================================

/**
 * 解析 SSE 响应
 *
 * 从 fetch Response 中逐行解析 SSE `data:` 字段，
 * 自动过滤 `[DONE]` 信号。
 *
 * @param response - fetch 响应对象（须为可读流）
 * @yields SSE 事件的 `data` 字段（不含 `data:` 前缀和 `[DONE]`）
 * @throws 响应体不可读时抛出 Error
 *
 * @example
 * ```ts
 * const response = await fetch('/api/stream')
 * for await (const data of parseSSE(response)) {
 *     const chunk = JSON.parse(data)
 * }
 * ```
 */
export async function* parseSSE(response: Response): AsyncIterable<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data !== '[DONE]') {
            yield data
          }
        }
      }
    }
  }
  finally {
    reader.releaseLock()
  }
}

/**
 * 收集流式响应的完整内容
 *
 * 完整消费 AsyncIterable 并累积所有 `delta.content`。
 *
 * @param stream - 聊天响应块流（通常来自 `client.chatStream()`）
 * @returns 完整的文本内容
 *
 * @example
 * ```ts
 * const stream = client.chatStream({ messages })
 * const content = await collectStreamContent(stream)
 * ```
 */
export async function collectStreamContent(
  stream: AsyncIterable<ChatCompletionChunk>,
): Promise<string> {
  let content = ''

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) {
      content += delta
    }
  }

  return content
}
