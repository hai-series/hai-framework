/**
 * =============================================================================
 * @hai/ai - 前端 AI 客户端
 * =============================================================================
 *
 * 提供前端直接调用 AI API 的功能，适用于浏览器环境。
 *
 * 与服务端 `ai` 对象的区别：
 * - client 是轻量级的，不依赖 Node.js 特定模块
 * - client 主要用于流式响应处理和简单的 API 调用
 * - 复杂的 MCP 服务和技能管理应在服务端进行
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
} from './ai-types.js'
import { getAiMessage } from './index.js'

// =============================================================================
// 客户端配置
// =============================================================================

/**
 * AI 客户端配置
 */
export interface AIClientConfig {
  /** API 基础 URL（如 /api/ai 或完整 URL） */
  baseUrl: string
  /** 请求超时（毫秒） */
  timeout?: number
  /** 自定义请求头 */
  headers?: Record<string, string>
}

/**
 * 流式响应进度
 */
export interface StreamProgress {
  /** 当前累积的文本内容 */
  content: string
  /** 是否完成 */
  done: boolean
  /** 完成原因 */
  finishReason?: string
}

/**
 * 流式响应选项
 */
export interface StreamOptions {
  /** 进度回调 */
  onProgress?: (progress: StreamProgress) => void
  /** 取消控制器 */
  abortController?: AbortController
}

// =============================================================================
// AI 客户端类
// =============================================================================

/**
 * AI 客户端
 *
 * 用于前端直接与 AI API 交互。
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
 * ```
 */
export class AIClient {
  private config: Required<AIClientConfig>

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
   * @param request - 聊天请求
   * @returns 聊天响应
   */
  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await this.fetch('/chat', {
      method: 'POST',
      body: JSON.stringify({ ...request, stream: false }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(getAiMessage('ai_apiRequestFailed', { params: { status: response.status, error } }))
    }

    return response.json()
  }

  /**
   * 发送流式聊天请求
   *
   * @param request - 聊天请求
   * @param options - 流式选项
   * @yields 聊天响应块
   *
   * @example
   * ```ts
   * let content = ''
   * for await (const chunk of client.chatStream({ messages })) {
   *     const delta = chunk.choices[0]?.delta?.content ?? ''
   *     content += delta
   *     // 在此更新 UI
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
      throw new Error(getAiMessage('ai_apiRequestFailed', { params: { status: response.status, error } }))
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error(getAiMessage('ai_responseNotReadable'))
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

              // 累积内容
              const delta = chunk.choices[0]?.delta?.content
              if (delta) {
                content += delta
              }

              // 检查完成状态
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
   * @param message - 用户消息
   * @param systemPrompt - 系统提示词（可选）
   * @returns 助手回复内容
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
   * @param message - 用户消息
   * @param options - 流式选项
   * @param systemPrompt - 系统提示词（可选）
   * @returns 完整的助手回复内容
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
 * // 基本用法
 * const client = createAIClient({ baseUrl: '/api/ai' })
 *
 * // 完整配置
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
 * @param response - fetch 响应对象
 * @yields SSE 事件数据
 *
 * @example
 * ```ts
 * const response = await fetch('/api/stream')
 * for await (const data of parseSSE(response)) {
 *     // 处理 data
 * }
 * ```
 */
export async function* parseSSE(response: Response): AsyncIterable<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error(getAiMessage('ai_responseNotReadable'))
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
 * @param stream - 聊天响应块流
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
