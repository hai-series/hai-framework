/**
 * @h-ai/ai — 前端 AI 客户端
 *
 * 基于 @h-ai/api-client 的 AI 领域客户端。
 * 通过 `createAIClient()` 工厂函数创建，消除自建 HTTP 层，
 * 复用 api-client 提供的 Token 管理、超时、拦截器等基础能力。
 * @module ai-client
 */

import type { Result } from '@h-ai/core'
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from '../llm/ai-llm-types.js'

// ─── API 适配器接口 ───

/**
 * AI 客户端所需的 API 调用能力
 *
 * 结构兼容 `@h-ai/api-client` 的 `ApiClient` 实例（鸭子类型）。
 * 传入 `createApiClient()` 返回值即可，无需额外适配。
 */
export interface AIApiAdapter {
  /** POST 请求（返回 Result） */
  post: <T>(path: string, body?: unknown) => Promise<Result<T, { message: string }>>
  /** 流式请求（返回 SSE data 行的 AsyncIterable） */
  stream: (path: string, body?: unknown) => AsyncIterable<string>
}

// ─── 客户端配置 ───

/**
 * AI 客户端配置
 *
 * @example
 * ```ts
 * import { createApiClient } from '@h-ai/api-client'
 * import { createAIClient } from '@h-ai/ai/client'
 *
 * const api = createApiClient({ baseUrl: '/api', auth: { ... } })
 * const aiClient = createAIClient({ api })
 * ```
 */
export interface AIClientConfig {
  /**
   * API 调用适配器
   *
   * 传入 `createApiClient()` 返回的实例。
   * baseUrl、Token 管理、超时等通过 api-client 配置。
   */
  api: AIApiAdapter
}

/** 流式响应进度（`onProgress` 回调参数） */
export interface StreamProgress {
  /** 当前累积的文本内容 */
  content: string
  /** 是否已完成 */
  done: boolean
  /** 完成原因（仅 `done=true` 时有值，如 `'stop'`） */
  finishReason?: string
}

/** 流式响应选项 */
export interface StreamOptions {
  /** 进度回调（每次收到 chunk 时触发） */
  onProgress?: (progress: StreamProgress) => void
}

// ─── 客户端接口 ───

/**
 * AI 客户端接口
 *
 * 提供浏览器端调用 AI API 的能力，HTTP 基础设施委托给 @h-ai/api-client。
 */
export interface AIClient {
  /** 发送对话请求（非流式） */
  chat: (request: ChatCompletionRequest) => Promise<ChatCompletionResponse>
  /** 发送流式对话请求，返回异步迭代器 */
  chatStream: (request: ChatCompletionRequest, options?: StreamOptions) => AsyncIterable<ChatCompletionChunk>
  /** 便捷方法：发送纯文本消息并返回回复文本 */
  sendMessage: (message: string, systemPrompt?: string) => Promise<string>
  /** 便捷方法：流式发送纯文本消息并返回完整回复 */
  sendMessageStream: (message: string, options?: StreamOptions, systemPrompt?: string) => Promise<string>
}

// ─── AI API 路径（与 ai-api-contract 保持一致） ───

const AI_PATH = {
  /** 非流式聊天 */
  chat: '/ai/chat',
  /** 流式聊天（SSE） */
  chatStream: '/ai/chat/stream',
} as const

// ─── 工厂函数 ───

/**
 * 创建 AI 客户端
 *
 * 通过 @h-ai/api-client 的 ApiClient 实例调用后端 AI API。
 * HTTP 层（Token、超时、拦截器）全部复用 api-client，本模块仅负责：
 * - 非流式 / 流式 ChatCompletion 协议适配
 * - SSE 解析与 ChatCompletionChunk 类型化
 * - onProgress 进度回调
 *
 * @param config - 客户端配置
 * @returns AI 客户端实例
 *
 * @example
 * ```ts
 * import { createApiClient } from '@h-ai/api-client'
 * import { createAIClient } from '@h-ai/ai/client'
 *
 * const api = createApiClient({ baseUrl: '/api' })
 * const client = createAIClient({ api })
 * const reply = await client.sendMessage('你好')
 * ```
 */
export function createAIClient(config: AIClientConfig): AIClient {
  const { api } = config

  return {
    async chat(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
      const result = await api.post<ChatCompletionResponse>(AI_PATH.chat, { ...req, stream: false })
      if (!result.success) {
        throw new Error(`AI chat request failed: ${result.error.message}`)
      }
      return result.data
    },

    async* chatStream(
      req: ChatCompletionRequest,
      options?: StreamOptions,
    ): AsyncIterable<ChatCompletionChunk> {
      let content = ''

      for await (const data of api.stream(AI_PATH.chatStream, { ...req, stream: true })) {
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
    },

    async sendMessage(message: string, systemPrompt?: string): Promise<string> {
      const messages: ChatMessage[] = []
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt })
      }
      messages.push({ role: 'user', content: message })
      const response = await this.chat({ messages })
      return response.choices[0]?.message?.content ?? ''
    },

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
    },
  }
}

// ─── SSE 解析工具 ───

/**
 * 从 fetch Response 中解析 SSE data 字段
 *
 * 自动处理分片缓冲和 `[DONE]` 结束标记。
 *
 * @param response - fetch 响应对象
 * @yields SSE data 字符串（不含 `[DONE]`）
 *
 * @example
 * ```ts
 * const resp = await fetch('/api/chat', { method: 'POST', body })
 * for await (const data of parseSSE(resp)) {
 *   const chunk = JSON.parse(data) // ChatCompletionChunk
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
      if (done)
        break

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
 * 收集流式响应的完整文本内容
 *
 * 完整消费流并拼接所有 `delta.content` 片段。
 *
 * @param stream - 聊天响应块流
 * @returns 完整文本
 *
 * @example
 * ```ts
 * const client = createAIClient({ api })
 * const stream = client.chatStream({ messages })
 * const fullText = await collectStreamContent(stream)
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
