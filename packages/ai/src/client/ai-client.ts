/**
 * @h-ai/ai — 前端 AI 客户端
 *
 * 浏览器端 HTTP 客户端，零 Node.js 依赖。
 * 通过 `createAIClient()` 工厂函数创建。
 * @module ai-client
 */

import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from '../llm/ai-llm-types.js'

// ─── 客户端配置 ───

/** AI 客户端配置 */
export interface AIClientConfig {
  /** API 基础 URL（不含尾部斜杠，如 `'https://api.example.com'`） */
  baseUrl: string
  /** 请求超时（毫秒，默认 `60000`） */
  timeout?: number
  /** 自定义请求头（每次请求合并） */
  headers?: Record<string, string>
  /** 获取 access token 的回调（每次请求前调用，自动设置 Bearer 头） */
  getAccessToken?: () => string | Promise<string>
  /** 认证失败回调（HTTP 401 时触发，可用于跳转登录页） */
  onAuthError?: () => void
  /** 自定义 fetch 实现（默认 `globalThis.fetch`） */
  fetch?: typeof globalThis.fetch
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
  /** 中止控制器（用于取消流式请求） */
  abortController?: AbortController
}

// ─── 客户端接口 ───

/**
 * AI 客户端接口
 *
 * 提供浏览器端 HTTP 调用 AI API 的能力，零 Node.js 依赖。
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

// ─── 工厂函数 ───

/**
 * 创建 AI 客户端
 *
 * 浏览器端使用，通过 HTTP 调用后端 AI API。
 * 支持非流式、流式、便捷文本调用。
 *
 * @param config - 客户端配置
 * @returns AI 客户端实例
 *
 * @example
 * ```ts
 * const client = createAIClient({ baseUrl: '/api/ai' })
 * const reply = await client.sendMessage('你好')
 * ```
 */
export function createAIClient(config: AIClientConfig): AIClient {
  const {
    baseUrl,
    timeout = 60000,
    headers: configHeaders = {},
    getAccessToken,
    onAuthError,
    fetch: customFetch,
  } = config
  const fetchFn = customFetch ?? globalThis.fetch

  /** 内部 fetch 封装：统一处理 URL 拼接、超时、请求头、认证 */
  async function request(path: string, init: RequestInit): Promise<Response> {
    const url = `${baseUrl}${path}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...configHeaders,
      ...(init.headers as Record<string, string> | undefined),
    }

    if (getAccessToken) {
      const token = await getAccessToken()
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
    }

    try {
      const response = await fetchFn(url, {
        ...init,
        headers,
        signal: init.signal ?? controller.signal,
      })
      if (response.status === 401) {
        onAuthError?.()
      }
      return response
    }
    finally {
      clearTimeout(timeoutId)
    }
  }

  return {
    async chat(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
      const response = await request('/chat', {
        method: 'POST',
        body: JSON.stringify({ ...req, stream: false }),
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`AI API request failed: ${response.status} ${errorText}`)
      }
      return response.json()
    },

    async* chatStream(
      req: ChatCompletionRequest,
      options?: StreamOptions,
    ): AsyncIterable<ChatCompletionChunk> {
      const response = await request('/chat', {
        method: 'POST',
        body: JSON.stringify({ ...req, stream: true }),
        signal: options?.abortController?.signal,
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`AI API request failed: ${response.status} ${errorText}`)
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
          if (done)
            break

          buffer += decoder.decode(value, { stream: true })
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
 * const client = createAIClient({ baseUrl: '/api/ai' })
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
