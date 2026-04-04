/**
 * @h-ai/ai — 前端 AI 客户端
 *
 * 基于 @h-ai/api-client 的 AI 领域客户端。
 * 通过 `createAIClient()` 工厂函数创建，消除自建 HTTP 层，
 * 复用 api-client 提供的 Token 管理、超时、拦截器等基础能力。
 * @module ai-client
 */

import type { HaiResult } from '@h-ai/core'
import type { KnowledgeAskResult, KnowledgeDocumentInfo, KnowledgeIngestResult, KnowledgeRetrieveResult } from '../knowledge/ai-knowledge-types.js'
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  ChatRecord,
} from '../llm/ai-llm-types.js'
import type { MemoryEntry, MemoryEntryInput, MemoryUpdateInput } from '../memory/ai-memory-types.js'
import type { RagResult } from '../rag/ai-rag-types.js'
import type { ReasoningResult } from '../reasoning/ai-reasoning-types.js'
import type { SessionInfo, StorePage } from '../store/ai-store-types.js'

// ─── API 适配器接口 ───

/**
 * AI 客户端所需的 API 调用能力
 *
 * 结构兼容 `@h-ai/api-client` 的 `api` 单例（鸭子类型）。
 * 传入 `api` 单例即可，无需额外适配。
 */
export interface AIApiAdapter {
  /** POST 请求（返回 HaiResult） */
  post: <T>(path: string, body?: unknown) => Promise<HaiResult<T>>
  /** 流式请求（返回 SSE data 行的 AsyncIterable） */
  stream: (path: string, body?: unknown) => AsyncIterable<string>
}

// ─── 客户端配置 ───

/**
 * AI 客户端配置
 *
 * @example
 * ```ts
 * import { api } from '@h-ai/api-client'
 * import { createAIClient } from '@h-ai/ai/client'
 *
 * await api.init({ baseUrl: '/api', auth: { ... } })
 * const aiClient = createAIClient({ api })
 * ```
 */
export interface AIClientConfig {
  /**
   * API 调用适配器
   *
   * 传入 `api` 单例（初始化后）。
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
  // ─── LLM ───
  /** 发送对话请求（非流式） */
  chat: (request: ChatCompletionRequest) => Promise<ChatCompletionResponse>
  /** 发送流式对话请求，返回异步迭代器 */
  chatStream: (request: ChatCompletionRequest, options?: StreamOptions) => AsyncIterable<ChatCompletionChunk>
  /** 便捷方法：发送纯文本消息并返回回复文本 */
  sendMessage: (message: string, systemPrompt?: string) => Promise<string>
  /** 便捷方法：流式发送纯文本消息并返回完整回复 */
  sendMessageStream: (message: string, options?: StreamOptions, systemPrompt?: string) => Promise<string>
  /** 简单问答（单轮，自动构造 messages） */
  ask: (question: string, options?: { systemPrompt?: string, model?: string }) => Promise<string>
  /** 流式简单问答，返回异步文本流 */
  askStream: (question: string, options?: { systemPrompt?: string, model?: string }) => AsyncIterable<string>

  // ─── Knowledge ───
  /** 知识检索（向量 + 实体增强） */
  knowledgeRetrieve: (query: string, options?: { topK?: number, collection?: string }) => Promise<KnowledgeRetrieveResult>
  /** 知识问答（RAG + 信源） */
  knowledgeAsk: (query: string, options?: { model?: string, collection?: string }) => Promise<KnowledgeAskResult>
  /** 导入文档 */
  knowledgeIngest: (input: { documentId: string, content: string, title?: string, collection?: string, metadata?: Record<string, unknown> }) => Promise<KnowledgeIngestResult>
  /** 列出已导入文档 */
  knowledgeListDocuments: (options?: { collection?: string, offset?: number, limit?: number }) => Promise<KnowledgeDocumentInfo[]>
  /** 删除已导入文档 */
  knowledgeRemoveDocument: (documentId: string, options?: { collection?: string }) => Promise<void>

  // ─── Memory ───
  /** 检索相关记忆 */
  recallMemories: (query: string, options?: { topK?: number, types?: string[], minImportance?: number, objectId?: string }) => Promise<MemoryEntry[]>
  /** 列出记忆（分页） */
  listMemories: (options?: { types?: string[], objectId?: string, offset?: number, limit?: number }) => Promise<StorePage<MemoryEntry>>
  /** 添加记忆 */
  addMemory: (entry: MemoryEntryInput) => Promise<MemoryEntry>
  /** 更新记忆 */
  updateMemory: (memoryId: string, updates: MemoryUpdateInput) => Promise<MemoryEntry>
  /** 删除记忆 */
  removeMemory: (memoryId: string) => Promise<void>

  // ─── Session ───
  /** 列出会话 */
  listSessions: (objectId: string) => Promise<SessionInfo[]>
  /** 重命名会话 */
  renameSession: (sessionId: string, title: string) => Promise<void>
  /** 删除会话 */
  removeSession: (sessionId: string) => Promise<void>
  /** 获取对话历史 */
  chatHistory: (objectId: string, sessionId: string, options?: { limit?: number, order?: 'asc' | 'desc' }) => Promise<ChatRecord[]>

  // ─── RAG ───
  /** RAG 查询（检索 + 生成） */
  ragQuery: (query: string, options?: { collection?: string, topK?: number, model?: string }) => Promise<RagResult>
  /** RAG 流式查询，返回 SSE 数据行 */
  ragQueryStream: (query: string, options?: { collection?: string, topK?: number, model?: string }) => AsyncIterable<string>

  // ─── Reasoning ───
  /** 推理（多步思考） */
  reasoningRun: (query: string, options?: { model?: string, maxSteps?: number }) => Promise<ReasoningResult>
  /** 推理流式，返回 SSE 数据行 */
  reasoningRunStream: (query: string, options?: { model?: string, maxSteps?: number }) => AsyncIterable<string>

  // ─── Token ───
  /** 估算文本的 Token 数 */
  estimateTokens: (text: string) => Promise<{ tokens: number }>
}

// ─── AI API 路径（与 ai-api-contract 保持一致） ───

const AI_PATH = {
  // LLM
  chat: '/ai/chat',
  chatStream: '/ai/chat/stream',
  chatHistory: '/ai/chat/history',
  ask: '/ai/ask',
  askStream: '/ai/ask/stream',
  // Knowledge
  knowledgeRetrieve: '/ai/knowledge/retrieve',
  knowledgeAsk: '/ai/knowledge/ask',
  knowledgeIngest: '/ai/knowledge/ingest',
  knowledgeDocuments: '/ai/knowledge/documents',
  knowledgeRemoveDocument: '/ai/knowledge/documents/remove',
  // Memory
  memoryRecall: '/ai/memory/recall',
  memoryList: '/ai/memory/list',
  memoryAdd: '/ai/memory/add',
  memoryUpdate: '/ai/memory/update',
  memoryRemove: '/ai/memory/remove',
  // Session
  sessions: '/ai/sessions',
  sessionRename: '/ai/sessions/rename',
  sessionRemove: '/ai/sessions/remove',
  // RAG
  ragQuery: '/ai/rag/query',
  ragQueryStream: '/ai/rag/query/stream',
  // Reasoning
  reasoningRun: '/ai/reasoning/run',
  reasoningRunStream: '/ai/reasoning/run/stream',
  // Token
  tokenEstimate: '/ai/token/estimate',
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
 * import { api } from '@h-ai/api-client'
 * import { createAIClient } from '@h-ai/ai/client'
 *
 * await api.init({ baseUrl: '/api' })
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

    async recallMemories(query: string, options?: { topK?: number, types?: string[], minImportance?: number, objectId?: string }): Promise<MemoryEntry[]> {
      const result = await api.post<{ items: MemoryEntry[] }>(AI_PATH.memoryRecall, { query, ...options })
      if (!result.success) {
        throw new Error(`Memory recall failed: ${result.error.message}`)
      }
      return result.data.items
    },

    async listMemories(options?: { types?: string[], objectId?: string, offset?: number, limit?: number }): Promise<StorePage<MemoryEntry>> {
      const result = await api.post<StorePage<MemoryEntry>>(AI_PATH.memoryList, options ?? {})
      if (!result.success) {
        throw new Error(`Memory list failed: ${result.error.message}`)
      }
      return result.data
    },

    async listSessions(objectId: string): Promise<SessionInfo[]> {
      const result = await api.post<{ items: SessionInfo[] }>(AI_PATH.sessions, { objectId })
      if (!result.success) {
        throw new Error(`Session list failed: ${result.error.message}`)
      }
      return result.data.items
    },

    async chatHistory(objectId: string, sessionId: string, options?: { limit?: number, order?: 'asc' | 'desc' }): Promise<ChatRecord[]> {
      const result = await api.post<{ items: ChatRecord[] }>(AI_PATH.chatHistory, { objectId, sessionId, ...options })
      if (!result.success) {
        throw new Error(`Chat history failed: ${result.error.message}`)
      }
      return result.data.items
    },

    // ─── LLM ask/askStream ───

    async ask(question: string, options?: { systemPrompt?: string, model?: string }): Promise<string> {
      const result = await api.post<{ text: string }>(AI_PATH.ask, { question, ...options })
      if (!result.success) {
        throw new Error(`AI ask failed: ${result.error.message}`)
      }
      return result.data.text
    },

    async* askStream(question: string, options?: { systemPrompt?: string, model?: string }): AsyncIterable<string> {
      for await (const data of api.stream(AI_PATH.askStream, { question, ...options })) {
        yield data
      }
    },

    // ─── Knowledge ───

    async knowledgeRetrieve(query: string, options?: { topK?: number, collection?: string }): Promise<KnowledgeRetrieveResult> {
      const result = await api.post<KnowledgeRetrieveResult>(AI_PATH.knowledgeRetrieve, { query, ...options })
      if (!result.success) {
        throw new Error(`Knowledge retrieve failed: ${result.error.message}`)
      }
      return result.data
    },

    async knowledgeAsk(query: string, options?: { model?: string, collection?: string }): Promise<KnowledgeAskResult> {
      const result = await api.post<KnowledgeAskResult>(AI_PATH.knowledgeAsk, { query, ...options })
      if (!result.success) {
        throw new Error(`Knowledge ask failed: ${result.error.message}`)
      }
      return result.data
    },

    async knowledgeIngest(input: { documentId: string, content: string, title?: string, collection?: string, metadata?: Record<string, unknown> }): Promise<KnowledgeIngestResult> {
      const result = await api.post<KnowledgeIngestResult>(AI_PATH.knowledgeIngest, input)
      if (!result.success) {
        throw new Error(`Knowledge ingest failed: ${result.error.message}`)
      }
      return result.data
    },

    async knowledgeListDocuments(options?: { collection?: string, offset?: number, limit?: number }): Promise<KnowledgeDocumentInfo[]> {
      const result = await api.post<{ items: KnowledgeDocumentInfo[] }>(AI_PATH.knowledgeDocuments, options ?? {})
      if (!result.success) {
        throw new Error(`Knowledge list documents failed: ${result.error.message}`)
      }
      return result.data.items
    },

    async knowledgeRemoveDocument(documentId: string, options?: { collection?: string }): Promise<void> {
      const result = await api.post<void>(AI_PATH.knowledgeRemoveDocument, { documentId, ...options })
      if (!result.success) {
        throw new Error(`Knowledge remove document failed: ${result.error.message}`)
      }
    },

    // ─── Memory (extended) ───

    async addMemory(entry: MemoryEntryInput): Promise<MemoryEntry> {
      const result = await api.post<MemoryEntry>(AI_PATH.memoryAdd, entry)
      if (!result.success) {
        throw new Error(`Memory add failed: ${result.error.message}`)
      }
      return result.data
    },

    async updateMemory(memoryId: string, updates: MemoryUpdateInput): Promise<MemoryEntry> {
      const result = await api.post<MemoryEntry>(AI_PATH.memoryUpdate, { memoryId, ...updates })
      if (!result.success) {
        throw new Error(`Memory update failed: ${result.error.message}`)
      }
      return result.data
    },

    async removeMemory(memoryId: string): Promise<void> {
      const result = await api.post<void>(AI_PATH.memoryRemove, { memoryId })
      if (!result.success) {
        throw new Error(`Memory remove failed: ${result.error.message}`)
      }
    },

    // ─── Session (extended) ───

    async renameSession(sessionId: string, title: string): Promise<void> {
      const result = await api.post<void>(AI_PATH.sessionRename, { sessionId, title })
      if (!result.success) {
        throw new Error(`Session rename failed: ${result.error.message}`)
      }
    },

    async removeSession(sessionId: string): Promise<void> {
      const result = await api.post<void>(AI_PATH.sessionRemove, { sessionId })
      if (!result.success) {
        throw new Error(`Session remove failed: ${result.error.message}`)
      }
    },

    // ─── RAG ───

    async ragQuery(query: string, options?: { collection?: string, topK?: number, model?: string }): Promise<RagResult> {
      const result = await api.post<RagResult>(AI_PATH.ragQuery, { query, ...options })
      if (!result.success) {
        throw new Error(`RAG query failed: ${result.error.message}`)
      }
      return result.data
    },

    async* ragQueryStream(query: string, options?: { collection?: string, topK?: number, model?: string }): AsyncIterable<string> {
      for await (const data of api.stream(AI_PATH.ragQueryStream, { query, ...options })) {
        yield data
      }
    },

    // ─── Reasoning ───

    async reasoningRun(query: string, options?: { model?: string, maxSteps?: number }): Promise<ReasoningResult> {
      const result = await api.post<ReasoningResult>(AI_PATH.reasoningRun, { query, ...options })
      if (!result.success) {
        throw new Error(`Reasoning run failed: ${result.error.message}`)
      }
      return result.data
    },

    async* reasoningRunStream(query: string, options?: { model?: string, maxSteps?: number }): AsyncIterable<string> {
      for await (const data of api.stream(AI_PATH.reasoningRunStream, { query, ...options })) {
        yield data
      }
    },

    // ─── Token ───

    async estimateTokens(text: string): Promise<{ tokens: number }> {
      const result = await api.post<{ tokens: number }>(AI_PATH.tokenEstimate, { text })
      if (!result.success) {
        throw new Error(`Token estimate failed: ${result.error.message}`)
      }
      return result.data
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
