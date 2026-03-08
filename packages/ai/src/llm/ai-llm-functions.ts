/**
 * @h-ai/ai — LLM 子功能工厂
 *
 * 根据配置创建 OpenAI Provider，组装 LLM 操作接口。
 * 同时导出工具与流处理的纯函数包装器（不依赖配置，可独立使用）。
 * @module ai-llm-functions
 */

import type { Result } from '@h-ai/core'

import type { AIConfig } from '../ai-config.js'
import type { AIError } from '../ai-types.js'
import type { AIStore, InteractionScope, SessionInfo, WhereClause } from '../store/ai-store-types.js'
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatHistoryOptions,
  ChatMessage,
  ChatRecord,
  LLMOperations,
  StreamOperations,
  TokenUsage,
  ToolCall,
  ToolsOperations,
} from './ai-llm-types.js'

import { core, err, ok } from '@h-ai/core'

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'
import { collectStream, createSSEDecoder, createStreamProcessor, encodeSSE } from './ai-llm-stream.js'
import { createToolRegistry, defineTool } from './ai-llm-tool.js'
import { createOpenAIProvider } from './providers/ai-llm-provider-openai.js'

const logger = core.logger.child({ module: 'ai', scope: 'llm' })

// ─── LLM 子功能 ───

/** LLM 子功能存储依赖 */
export interface AILLMStores {
  /** 对话记录存储（可选；未传入时不记录） */
  recordStore?: AIStore<ChatRecord>
  /** 会话信息存储（可选；未传入时 listSessions 返回空） */
  sessionStore?: AIStore<SessionInfo>
}

/** LLM 子功能创建结果 */
export interface AILLMFunctions {
  /** LLM 操作接口（对话 / 流式对话 / 模型列表 / 历史 / 会话） */
  llm: LLMOperations
  /** 工具操作接口（定义工具 / 创建注册表） */
  tools: ToolsOperations
  /** 流处理操作接口（流处理器 / SSE 编解码） */
  stream: StreamOperations
}

/**
 * 创建 LLM 相关的全部子功能
 *
 * 根据配置创建 OpenAI Provider，组装 LLM、工具、流处理三个操作接口。
 * 若传入 `deps.recordStore`，chat 调用会自动保存 ChatRecord。
 *
 * @param config - 校验后的 AI 配置
 * @param deps - 可选依赖（记录存储、会话存储）
 * @returns `{ llm, tools, stream }` 三个操作接口
 */
export function createAILLMFunctions(config: AIConfig, deps?: AILLMStores): AILLMFunctions {
  const provider = createOpenAIProvider({ config })
  const recordStore = deps?.recordStore
  const sessionStore = deps?.sessionStore
  let recordSeq = 0

  /**
   * 从消息列表中提取会话标题（取最后一条用户消息，截断到 50 字符）
   */
  function extractTitle(messages: ChatMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'user') {
        const text = typeof msg.content === 'string'
          ? msg.content
          : msg.content.filter(c => c.type === 'text').map(c => c.text).join(' ')
        return text.length > 50 ? `${text.slice(0, 50)}...` : text
      }
    }
    return 'New Session'
  }

  /**
   * 保存 ChatRecord 并同步更新 SessionInfo
   */
  async function saveRecordAndSession(
    record: ChatRecord,
    messages: ChatMessage[],
  ): Promise<void> {
    await recordStore!.save(record.id, record)
    logger.debug('Chat record saved', { id: record.id, objectId: record.objectId, sessionId: record.sessionId })

    if (sessionStore) {
      const sid = record.sessionId
      const existing = await sessionStore.get(sid)
      const now = Date.now()
      if (existing) {
        await sessionStore.save(sid, { ...existing, updatedAt: now })
      }
      else {
        await sessionStore.save(sid, {
          sessionId: sid,
          objectId: record.objectId,
          title: extractTitle(messages),
          createdAt: now,
          updatedAt: now,
        })
      }
    }
  }

  /**
   * 包装 chat，在有 objectId 时自动保存 ChatRecord
   */
  async function chatWithRecord(request: ChatCompletionRequest): Promise<Result<ChatCompletionResponse, AIError>> {
    const start = Date.now()
    const result = await provider.chat(request)

    // 仅在调用成功且传入了 objectId + recordStore 时记录
    if (result.success && request.objectId && recordStore) {
      try {
        const response = result.data
        const choice = response.choices[0]
        const record: ChatRecord = {
          id: `${response.id}_${Date.now()}_${recordSeq++}`,
          objectId: request.objectId,
          sessionId: request.sessionId ?? 'default',
          request: {
            model: response.model,
            messages: request.messages,
          },
          response: {
            content: choice?.message?.content ?? '',
            toolCalls: choice?.message?.tool_calls,
            finishReason: choice?.finish_reason ?? 'stop',
            usage: response.usage,
          },
          createdAt: Date.now(),
          duration: Date.now() - start,
        }
        await saveRecordAndSession(record, request.messages)
      }
      catch (error) {
        // 记录失败不影响 chat 结果
        logger.debug('Failed to save chat record', { error })
      }
    }

    return result
  }

  /**
   * 包装 chatStream，在有 objectId 时自动保存 ChatRecord
   *
   * 流式输出不受影响，记录在流消费完成后异步保存。
   */
  async function* chatStreamWithRecord(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk> {
    const start = Date.now()
    const shouldRecord = !!(request.objectId && recordStore)

    // 累积流式响应的中间状态
    let content = ''
    let finishReason: string | null = null
    const toolCalls: ToolCall[] = []
    let streamId = ''
    let resolvedModel = request.model ?? ''

    for await (const chunk of provider.chatStream(request)) {
      yield chunk

      if (!shouldRecord)
        continue

      // 累积元数据
      if (!streamId && chunk.id)
        streamId = chunk.id
      if (!resolvedModel && chunk.model)
        resolvedModel = chunk.model

      for (const choice of chunk.choices) {
        if (choice.delta.content)
          content += choice.delta.content
        if (choice.finish_reason)
          finishReason = choice.finish_reason
        // 累积工具调用片段
        if (choice.delta.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            if (!toolCalls[tc.index]) {
              toolCalls[tc.index] = { id: tc.id ?? '', type: 'function', function: { name: tc.function?.name ?? '', arguments: '' } }
            }
            if (tc.function?.arguments)
              toolCalls[tc.index].function.arguments += tc.function.arguments
            if (tc.function?.name)
              toolCalls[tc.index].function.name = tc.function.name
            if (tc.id)
              toolCalls[tc.index].id = tc.id
          }
        }
      }
    }

    // 流消费完成后保存记录
    if (shouldRecord) {
      try {
        const usage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        const record: ChatRecord = {
          id: `${streamId || 'stream'}_${Date.now()}_${recordSeq++}`,
          objectId: request.objectId!,
          sessionId: request.sessionId ?? 'default',
          request: {
            model: resolvedModel,
            messages: request.messages,
          },
          response: {
            content,
            toolCalls: toolCalls.length > 0 ? toolCalls.filter(Boolean) : undefined,
            finishReason: finishReason ?? 'stop',
            usage,
          },
          createdAt: Date.now(),
          duration: Date.now() - start,
        }
        await saveRecordAndSession(record, request.messages)
      }
      catch (error) {
        logger.debug('Failed to save stream chat record', { error })
      }
    }
  }

  /**
   * 查询对话历史记录
   */
  async function getHistory(
    scope: InteractionScope,
    options?: ChatHistoryOptions,
  ): Promise<Result<ChatRecord[], AIError>> {
    if (!recordStore) {
      return ok([])
    }
    try {
      const records = await recordStore.query({
        where: { objectId: scope.objectId, sessionId: scope.sessionId } as WhereClause<ChatRecord>,
        orderBy: { field: 'createdAt', direction: options?.order ?? 'desc' },
        limit: options?.limit,
      })
      return ok(records)
    }
    catch (error) {
      return err({
        code: AIErrorCode.LLM_HISTORY_FAILED,
        message: aiM('ai_llmHistoryFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 列出指定 objectId 下的所有会话
   */
  async function listSessions(
    objectId: string,
  ): Promise<Result<SessionInfo[], AIError>> {
    if (!sessionStore) {
      return ok([])
    }
    try {
      const sessions = await sessionStore.query({
        where: { objectId } as WhereClause<SessionInfo>,
        orderBy: { field: 'updatedAt', direction: 'desc' },
      })
      return ok(sessions)
    }
    catch (error) {
      return err({
        code: AIErrorCode.LLM_HISTORY_FAILED,
        message: aiM('ai_llmHistoryFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
        cause: error,
      })
    }
  }

  const llm: LLMOperations = {
    chat: chatWithRecord,
    chatStream: chatStreamWithRecord,
    listModels: () => provider.listModels(),
    getHistory,
    listSessions,
  }

  const tools: ToolsOperations = {
    define: defineTool,
    createRegistry: createToolRegistry,
  }

  const stream: StreamOperations = {
    createProcessor: createStreamProcessor,
    collect: collectStream,
    createSSEDecoder,
    encodeSSE,
  }

  return { llm, tools, stream }
}
