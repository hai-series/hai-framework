/**
 * @h-ai/ai — Context 子功能实现
 *
 * 聚合 Token、Summary、Compress 三个子模块，并在此基础上
 * 提供有状态的 ContextManager（多轮对话自动压缩 + 对话编排 + 持久化）。
 * @module ai-context-functions
 */

import type { Result } from '@h-ai/core'

import type { CompressConfig } from '../ai-config.js'
import type { AIError } from '../ai-types.js'
import type { CompressOperations } from '../compress/ai-compress-types.js'
import type { ChatMessage } from '../llm/ai-llm-types.js'
import type { AIRelStore, InteractionScope, SessionInfo } from '../store/ai-store-types.js'
import type { SummaryResult } from '../summary/ai-summary-types.js'
import type { TokenOperations } from '../token/ai-token-types.js'
import type {
  ContextChatOptions,
  ContextChatResult,
  ContextDeps,
  ContextManager,
  ContextManagerOptions,
  ContextOperations,
  ContextStreamEvent,
} from './ai-context-types.js'

import { core, err, ok } from '@h-ai/core'

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'

const logger = core.logger.child({ module: 'ai', scope: 'context' })

// ─── 持久化状态结构 ───

/**
 * 持久化的上下文管理器状态
 */
interface PersistedContextState {
  messages: ChatMessage[]
  summaries: SummaryResult[]
  updatedAt: number
}

/**
 * 创建 Context 操作接口
 *
 * 聚合 Token、Summary、Compress 子模块，提供统一的上下文管理 API。
 * 若传入 deps（LLM / Memory / RAG / Reasoning），ContextManager 可提供
 * chat/chatStream 高层编排能力。
 *
 * @param compressConfig - Compress 配置（用于 ContextManager 的默认值）
 * @param tokenOps - Token 操作接口（由 token 子模块创建）
 * @param compressOps - Compress 操作接口（由 compress 子模块创建）
 * @param contextStore - 上下文状态存储（可选，用于持久化）
 * @param sessionStore - 会话信息存储（可选，用于目录管理）
 * @param deps - 可选子模块依赖（LLM / Memory / RAG / Reasoning）
 * @returns ContextOperations 实例
 */
export function createContextOperations(
  compressConfig: CompressConfig,
  tokenOps: TokenOperations,
  compressOps: CompressOperations,
  contextStore?: AIRelStore<PersistedContextState>,
  sessionStore?: AIRelStore<SessionInfo>,
  deps?: ContextDeps,
): ContextOperations {
  /**
   * 计算有效的 maxTokens（用于 ContextManager 初始化）
   */
  function resolveMaxTokens(optionMaxTokens?: number): number {
    const fromOption = optionMaxTokens ?? compressConfig.defaultMaxTokens
    if (fromOption > 0)
      return fromOption
    return compressConfig.defaultMaxTokens > 0 ? compressConfig.defaultMaxTokens : 4096
  }

  /**
   * 构造存储键
   */
  function storeKey(scope: InteractionScope): string {
    return `${scope.objectId}:${scope.sessionId}`
  }

  /**
   * 创建 ContextManager 实例（共享逻辑）
   */
  function buildManager(
    options: ContextManagerOptions,
    initialMessages: ChatMessage[],
    initialSummaries: SummaryResult[],
  ): ContextManager {
    const scope = options.scope

    // 解析压缩参数
    const compress = options.compress
    const managerMaxTokens = resolveMaxTokens(compress?.maxTokens)
    const strategy = compress?.strategy ?? compressConfig.defaultStrategy
    const preserveSystem = compress?.preserveSystem ?? true
    const preserveLastN = compress?.preserveLastN ?? compressConfig.preserveLastN
    const autoCompress = compress?.auto ?? true
    const summaryModel = compress?.summaryModel

    const state = {
      messages: initialMessages,
      summaries: initialSummaries,
    }

    const manager: ContextManager = {
      scope,

      async addMessage(message: ChatMessage): Promise<Result<void, AIError>> {
        state.messages.push(message)

        if (!autoCompress)
          return ok(undefined)

        const currentTokens = tokenOps.estimateMessages(state.messages)
        if (currentTokens <= managerMaxTokens)
          return ok(undefined)

        logger.trace('Auto-compressing context', { currentTokens, budget: managerMaxTokens })

        const compressResult = await compressOps.tryCompress(state.messages, {
          strategy: strategy as 'summary' | 'sliding-window' | 'hybrid',
          maxTokens: managerMaxTokens,
          preserveSystem,
          preserveLastN,
          summaryModel,
        })

        if (!compressResult.success) {
          logger.warn('Auto-compression failed, keeping original messages', { error: compressResult.error })
          return ok(undefined)
        }

        if (compressResult.data.summary) {
          state.summaries.push({
            summary: compressResult.data.summary,
            tokenCount: tokenOps.estimateText(compressResult.data.summary),
            coveredMessages: compressResult.data.removedCount,
          })
        }

        state.messages = compressResult.data.messages
        return ok(undefined)
      },

      getMessages(): Result<ChatMessage[], AIError> {
        return ok([...state.messages])
      },

      getTokenUsage(): Result<{ current: number, budget: number }, AIError> {
        return ok({
          current: tokenOps.estimateMessages(state.messages),
          budget: managerMaxTokens,
        })
      },

      getSummaries(): Result<SummaryResult[], AIError> {
        return ok([...state.summaries])
      },

      async save(): Promise<Result<void, AIError>> {
        if (!scope || !contextStore) {
          return ok(undefined)
        }
        try {
          const key = storeKey(scope)
          await contextStore.save(key, {
            messages: state.messages,
            summaries: state.summaries,
            updatedAt: Date.now(),
          }, { objectId: scope.objectId, sessionId: scope.sessionId })

          // 同步更新会话信息
          if (sessionStore) {
            const existing = await sessionStore.get(scope.sessionId)
            if (existing) {
              existing.updatedAt = Date.now()
              await sessionStore.save(scope.sessionId, existing, { objectId: existing.objectId })
            }
            else {
              await sessionStore.save(scope.sessionId, {
                sessionId: scope.sessionId,
                objectId: scope.objectId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              }, { objectId: scope.objectId })
            }
          }

          return ok(undefined)
        }
        catch (error) {
          return err({
            code: AIErrorCode.SESSION_FAILED,
            message: aiM('ai_sessionFailed', { params: { error: String(error) } }),
            cause: error,
          })
        }
      },

      reset(): void {
        state.messages = []
        state.summaries = []
      },

      // ─── chat/chatStream 编排 ───

      async chat(message: string, chatOpts?: ContextChatOptions): Promise<Result<ContextChatResult, AIError>> {
        if (!deps?.llm) {
          return err({
            code: AIErrorCode.NOT_INITIALIZED,
            message: aiM('ai_notInitialized'),
          })
        }

        try {
          // 追加用户消息（自动压缩）
          const addResult = await manager.addMessage({ role: 'user', content: message })
          if (!addResult.success)
            return addResult

          // 获取当前消息列表
          const messagesResult = manager.getMessages()
          if (!messagesResult.success)
            return messagesResult
          let messages = messagesResult.data

          // 可选：注入记忆
          if (options.memory?.enable && deps.memory) {
            const injected = await deps.memory.injectMemories(messages, {
              objectId: scope?.objectId,
              topK: options.memory.topK,
              maxTokens: options.memory.maxTokens,
              position: options.memory.position,
            })
            if (injected.success) {
              messages = injected.data
            }
          }

          // 可选：RAG 检索增强 — 将检索结果作为 system 消息注入
          if (options.rag?.enable && deps.rag) {
            const ragResult = await deps.rag.query(message, {
              sources: options.rag.sources,
              topK: options.rag.topK,
              minScore: options.rag.minScore,
              enableRerank: options.rag.enableRerank,
              rerankModel: options.rag.rerankModel,
              model: chatOpts?.model ?? options.model,
              messages,
              enablePersist: false,
            })
            if (ragResult.success) {
              // RAG query 已直接返回完整结果，将 answer 作为回复
              const reply = ragResult.data.answer
              await manager.addMessage({ role: 'assistant', content: reply })

              if (options.memory?.enableExtract && deps.memory) {
                const recentMessages: ChatMessage[] = [
                  { role: 'user', content: message },
                  { role: 'assistant', content: reply },
                ]
                deps.memory.extract(recentMessages, { objectId: scope?.objectId })
                  .catch(e => logger.warn('Memory extract failed', { error: e }))
              }

              return ok({
                reply,
                model: ragResult.data.model,
                usage: ragResult.data.usage,
              })
            }
          }

          // 可选：推理引擎
          if (options.reasoning?.enable && deps.reasoning) {
            const reasonResult = await deps.reasoning.run(message, {
              strategy: options.reasoning.strategy,
              maxRounds: options.reasoning.maxRounds,
              model: chatOpts?.model ?? options.model,
              temperature: chatOpts?.temperature ?? options.temperature,
              messages,
              tools: options.tools,
              objectId: scope?.objectId,
              sessionId: scope?.sessionId,
              enablePersist: false,
            })
            if (reasonResult.success) {
              const reply = reasonResult.data.answer
              await manager.addMessage({ role: 'assistant', content: reply })

              if (options.memory?.enableExtract && deps.memory) {
                const recentMessages: ChatMessage[] = [
                  { role: 'user', content: message },
                  { role: 'assistant', content: reply },
                ]
                deps.memory.extract(recentMessages, { objectId: scope?.objectId })
                  .catch(e => logger.warn('Memory extract failed', { error: e }))
              }

              return ok({ reply, model: chatOpts?.model ?? options.model ?? '', usage: undefined })
            }
          }

          // 普通 LLM 调用
          const chatResult = await deps.llm.chat({
            model: chatOpts?.model ?? options.model,
            messages,
            temperature: chatOpts?.temperature ?? options.temperature,
            objectId: scope?.objectId,
            sessionId: scope?.sessionId,
            tools: options.tools?.getDefinitions(),
            enablePersist: chatOpts?.enablePersist ?? false,
          })

          if (!chatResult.success)
            return chatResult

          const choice = chatResult.data.choices[0]
          const reply = choice?.message?.content ?? ''

          // 追加助手回复
          await manager.addMessage({ role: 'assistant', content: reply })

          // 可选：自动提取记忆
          if (options.memory?.enableExtract && deps.memory) {
            const recentMessages: ChatMessage[] = [
              { role: 'user', content: message },
              { role: 'assistant', content: reply },
            ]
            deps.memory.extract(recentMessages, { objectId: scope?.objectId })
              .catch(e => logger.warn('Memory extract failed', { error: e }))
          }

          return ok({
            reply,
            model: chatResult.data.model,
            usage: chatResult.data.usage
              ? {
                  prompt_tokens: chatResult.data.usage.prompt_tokens,
                  completion_tokens: chatResult.data.usage.completion_tokens,
                  total_tokens: chatResult.data.usage.total_tokens,
                }
              : undefined,
          })
        }
        catch (error) {
          logger.error('Context chat failed', { error })
          return err({
            code: AIErrorCode.INTERNAL_ERROR,
            message: aiM('ai_internalError', { params: { error: String(error) } }),
            cause: error,
          })
        }
      },

      async* chatStream(message: string, chatOpts?: ContextChatOptions): AsyncIterable<ContextStreamEvent> {
        if (!deps?.llm) {
          throw new Error('LLM not initialized: deps.llm is required for chatStream')
        }

        // 追加用户消息
        await manager.addMessage({ role: 'user', content: message })

        // 获取消息列表
        const messagesResult = manager.getMessages()
        if (!messagesResult.success) {
          throw new Error(`Failed to get messages: ${String(messagesResult.error)}`)
        }
        let messages = messagesResult.data

        // 可选：注入记忆
        if (options.memory?.enable && deps.memory) {
          const injected = await deps.memory.injectMemories(messages, {
            objectId: scope?.objectId,
            topK: options.memory.topK,
            maxTokens: options.memory.maxTokens,
            position: options.memory.position,
          })
          if (injected.success) {
            messages = injected.data
          }
        }

        // 提取记忆的通用逻辑
        const extractMemory = (reply: string) => {
          if (options.memory?.enableExtract && deps?.memory) {
            const recentMessages: ChatMessage[] = [
              { role: 'user', content: message },
              { role: 'assistant', content: reply },
            ]
            deps.memory.extract(recentMessages, { objectId: scope?.objectId })
              .catch(e => logger.warn('Memory extract failed', { error: e }))
          }
        }

        // 可选：RAG 流式检索增强
        if (options.rag?.enable && deps.rag) {
          let fullReply = ''
          let model = ''
          let usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number } | undefined

          for await (const event of deps.rag.queryStream(message, {
            sources: options.rag.sources,
            topK: options.rag.topK,
            minScore: options.rag.minScore,
            enableRerank: options.rag.enableRerank,
            rerankModel: options.rag.rerankModel,
            model: chatOpts?.model ?? options.model,
            messages,
            enablePersist: false,
          })) {
            if (event.type === 'delta') {
              fullReply += event.text
              yield { type: 'delta', text: event.text }
            }
            else if (event.type === 'done') {
              fullReply = event.answer
              model = event.model
              usage = event.usage
            }
          }

          await manager.addMessage({ role: 'assistant', content: fullReply })
          extractMemory(fullReply)
          yield { type: 'done', reply: fullReply, model, usage }
          return
        }

        // 可选：Reasoning 流式推理
        if (options.reasoning?.enable && deps.reasoning) {
          let fullReply = ''

          for await (const event of deps.reasoning.runStream(message, {
            strategy: options.reasoning.strategy,
            maxRounds: options.reasoning.maxRounds,
            model: chatOpts?.model ?? options.model,
            temperature: chatOpts?.temperature ?? options.temperature,
            messages,
            tools: options.tools,
            objectId: scope?.objectId,
            sessionId: scope?.sessionId,
            enablePersist: false,
          })) {
            if (event.type === 'delta') {
              fullReply += event.text
              yield { type: 'delta', text: event.text }
            }
          }

          await manager.addMessage({ role: 'assistant', content: fullReply })
          extractMemory(fullReply)
          yield { type: 'done', reply: fullReply, model: chatOpts?.model ?? options.model ?? '', usage: undefined }
          return
        }

        // 普通流式 LLM 调用
        const stream = deps.llm.chatStream({
          model: chatOpts?.model ?? options.model,
          messages,
          temperature: chatOpts?.temperature ?? options.temperature,
          objectId: scope?.objectId,
          sessionId: scope?.sessionId,
          tools: options.tools?.getDefinitions(),
          enablePersist: chatOpts?.enablePersist ?? false,
        })

        let fullReply = ''
        let model = ''
        let usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number } | undefined

        for await (const chunk of stream) {
          if (!model && chunk.model)
            model = chunk.model
          const delta = chunk.choices?.[0]?.delta?.content
          if (delta) {
            fullReply += delta
            yield { type: 'delta', text: delta }
          }
          if (chunk.usage) {
            usage = {
              prompt_tokens: chunk.usage.prompt_tokens,
              completion_tokens: chunk.usage.completion_tokens,
              total_tokens: chunk.usage.total_tokens,
            }
          }
        }

        // 追加助手回复
        await manager.addMessage({ role: 'assistant', content: fullReply })

        extractMemory(fullReply)

        yield { type: 'done', reply: fullReply, model, usage }
      },
    }

    return manager
  }

  return {
    /**
     * 创建有状态上下文管理器
     */
    createManager(options?: ContextManagerOptions): Result<ContextManager, AIError> {
      const opts = options ?? {}

      const manager = buildManager(
        opts,
        [],
        [],
      )

      // 如果有系统提示词，将其作为第一条 system 消息
      if (opts.systemPrompt) {
        void manager.addMessage({ role: 'system', content: opts.systemPrompt })
      }

      return ok(manager)
    },

    /**
     * 从存储恢复管理器实例
     */
    async restoreManager(scope: InteractionScope, options?: Omit<ContextManagerOptions, 'scope'>): Promise<Result<ContextManager, AIError>> {
      const opts = { ...options, scope } as ContextManagerOptions

      let initialMessages: ChatMessage[] = []
      let initialSummaries: SummaryResult[] = []

      // 从存储恢复
      if (contextStore) {
        const key = storeKey(scope)
        const persisted = await contextStore.get(key)
        if (persisted) {
          initialMessages = persisted.messages
          initialSummaries = persisted.summaries
          logger.trace('Context manager restored from store', { scope, messageCount: initialMessages.length })
        }
      }

      const manager = buildManager(
        // 恢复时不再追加 systemPrompt（历史中已有）
        { ...opts, systemPrompt: undefined },
        initialMessages,
        initialSummaries,
      )

      return ok(manager)
    },

    /**
     * 列出指定对象的所有会话
     */
    async listSessions(objectId: string): Promise<Result<SessionInfo[], AIError>> {
      if (!sessionStore) {
        return ok([])
      }

      try {
        const sessions = await sessionStore.query({
          objectId,
          orderBy: { field: 'updatedAt', direction: 'desc' },
        })
        return ok(sessions)
      }
      catch (error) {
        return err({
          code: AIErrorCode.SESSION_FAILED,
          message: aiM('ai_sessionFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async renameSession(sessionId: string, title: string): Promise<Result<void, AIError>> {
      if (!sessionStore) {
        return ok(undefined)
      }

      try {
        const existing = await sessionStore.get(sessionId)
        if (!existing) {
          return err({
            code: AIErrorCode.SESSION_FAILED,
            message: aiM('ai_sessionFailed', { params: { error: `Session not found: ${sessionId}` } }),
          })
        }
        existing.title = title
        existing.updatedAt = Date.now()
        await sessionStore.save(sessionId, existing, { objectId: existing.objectId })
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: AIErrorCode.SESSION_FAILED,
          message: aiM('ai_sessionFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async removeSession(sessionId: string): Promise<Result<void, AIError>> {
      if (!sessionStore) {
        return ok(undefined)
      }

      try {
        // 先获取会话信息，需要 objectId 来构建上下文存储 key
        const existing = await sessionStore.get(sessionId)
        if (existing && contextStore) {
          const key = `${existing.objectId}:${existing.sessionId}`
          await contextStore.remove(key)
        }
        await sessionStore.remove(sessionId)
        return ok(undefined)
      }
      catch (error) {
        return err({
          code: AIErrorCode.SESSION_FAILED,
          message: aiM('ai_sessionFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },
  }
}
