/**
 * @h-ai/ai — Context 子功能实现
 *
 * 聚合 Token、Summary、Compress 三个子模块，并在此基础上
 * 提供有状态的 ContextManager（多轮对话自动压缩 + 对话编排 + 持久化）。
 * @module ai-context-functions
 */

import type { HaiResult } from '@h-ai/core'

import type { CompressConfig } from '../ai-config.js'

import type { CompressOperations } from '../compress/ai-compress-types.js'
import type { ChatMessage } from '../llm/ai-llm-types.js'
import type { AIRelStore, InteractionScope, SessionInfo } from '../store/ai-store-types.js'
import type { SummaryResult } from '../summary/ai-summary-types.js'
import type { TokenOperations } from '../token/ai-token-types.js'
import type {
  CommitTurnInput,
  ConsolidateOptions,
  ConsolidateResult,
  ContextChatOptions,
  ContextChatResult,
  ContextDeps,
  ContextManager,
  ContextManagerOptions,
  ContextOperations,
  ContextStreamEvent,
  ConversationTurn,
} from './ai-context-types.js'

import { core, err, ok } from '@h-ai/core'

import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { createStreamProcessor } from '../llm/ai-llm-stream.js'

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
   *
   * 用 JSON 数组序列化 [objectId, sessionId]，避免朴素拼接 `${objectId}:${sessionId}`
   * 在 id 本身含分隔符时产生碰撞（如 `a` + `b:c` 与 `a:b` + `c` 会得到同一键）。
   */
  function storeKey(scope: InteractionScope): string {
    return JSON.stringify([scope.objectId, scope.sessionId])
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

    // 后台记忆提取任务集合：chat/chatStream 的自动提取是即发即忘，flush() 统一等待，
    // 避免「AI 回答结束→下一轮召回/生成总结→上一轮记忆仍未写完」的时序问题。
    const pendingMemoryTasks = new Set<Promise<unknown>>()

    // 记忆注入选项：将 scope / types / minImportance / 位置等完整透传给 Memory
    function memoryInjectionOptions() {
      return {
        objectId: scope?.objectId,
        scope: options.memory?.scope,
        types: options.memory?.types,
        minImportance: options.memory?.minImportance,
        topK: options.memory?.topK,
        maxTokens: options.memory?.maxTokens,
        position: options.memory?.position,
      }
    }

    // 触发一次后台记忆提取并纳入 pending 集合（scope / types / 模型 / systemPrompt 完整透传）
    function enqueueMemoryExtract(userMessage: string, reply: string): void {
      if (!options.memory?.enableExtract || !deps?.memory)
        return
      const recentMessages: ChatMessage[] = [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: reply },
      ]
      const task = deps.memory
        .extract(recentMessages, {
          objectId: scope?.objectId,
          scope: options.memory.scope,
          types: options.memory.types,
          model: options.memory.extractionModel,
          systemPrompt: options.memory.extractionSystemPrompt,
        })
        .catch((e: unknown) => logger.warn('Memory extract failed', { error: e }))
        .finally(() => {
          pendingMemoryTasks.delete(task)
        })
      pendingMemoryTasks.add(task)
    }

    // ─── Conversation Commit Layer 状态 ───
    // turnCommit=auto（默认）：生成即提交完整文本；manual：生成后登记待提交轮次，由 commit/interrupt 决定真实文本。
    const turnCommit = options.turnCommit ?? 'auto'
    const turns: ConversationTurn[] = []
    // 待提交轮次（manual 模式）：turnId → 触发该轮的用户输入（用于提交时的记忆提取配对）
    const pendingCommits = new Map<string, string>()

    function generateTurnId(): string {
      return `turn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    }

    const manager: ContextManager = {
      scope,

      async addMessage(message: ChatMessage): Promise<HaiResult<void>> {
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

      getMessages(): HaiResult<ChatMessage[]> {
        return ok([...state.messages])
      },

      getTokenUsage(): HaiResult<{ current: number, budget: number }> {
        return ok({
          current: tokenOps.estimateMessages(state.messages),
          budget: managerMaxTokens,
        })
      },

      getSummaries(): HaiResult<SummaryResult[]> {
        return ok([...state.summaries])
      },

      async save(): Promise<HaiResult<void>> {
        // 持久化前先等待后台记忆提取完成，确保记忆已落库（issue #14）
        await manager.flush()

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

          // 同步更新会话信息（与上下文正文共用同一复合键，避免不同主体相同 sessionId 互相覆盖）
          if (sessionStore) {
            const sessionKey = storeKey(scope)
            const existing = await sessionStore.get(sessionKey)
            if (existing) {
              existing.updatedAt = Date.now()
              await sessionStore.save(sessionKey, existing, { objectId: existing.objectId })
            }
            else {
              await sessionStore.save(sessionKey, {
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
          return err(HaiAIError.SESSION_FAILED, aiM('ai_sessionFailed', { params: { error: String(error) } }), error)
        }
      },

      reset(): void {
        state.messages = []
        state.summaries = []
      },

      getTurns(): HaiResult<ConversationTurn[]> {
        return ok(turns.map(t => ({ ...t })))
      },

      markTurnSpeaking(turnId: string): HaiResult<void> {
        const turn = turns.find(t => t.id === turnId)
        if (!turn)
          return err(HaiAIError.CONTEXT_TURN_NOT_FOUND, aiM('ai_turnNotFound', { params: { turnId } }))
        if (turn.status === 'generating')
          turn.status = 'speaking'
        return ok(undefined)
      },

      commitTurn(turnId: string, input?: CommitTurnInput): Promise<HaiResult<void>> {
        return finalizeCommit(turnId, input?.text, 'completed')
      },

      interruptTurn(turnId: string, input?: CommitTurnInput): Promise<HaiResult<void>> {
        return finalizeCommit(turnId, input?.text, 'interrupted')
      },

      async consolidate(consolidateOpts?: ConsolidateOptions): Promise<HaiResult<ConsolidateResult>> {
        if (!deps?.summary || !deps?.memory) {
          return err(HaiAIError.MEMORY_PROMOTE_FAILED, aiM('ai_memoryPromoteFailed', { params: { error: 'summary/memory deps unavailable' } }))
        }

        // 先等待后台记忆提取完成，避免固化时短期记忆尚未落库
        await manager.flush()

        try {
          // 1) 整合会话摘要：以历史摘要为前序上下文，对当前消息做增量摘要
          const previousSummary = state.summaries.map(s => s.summary).join('\n\n') || undefined
          const summaryResult = await deps.summary.generate(state.messages, {
            model: consolidateOpts?.model,
            previousSummary,
          })
          if (!summaryResult.success)
            return summaryResult
          const summaryText = summaryResult.data

          if (!summaryText.trim()) {
            return ok({ summary: summaryText, memories: [] })
          }

          // 2) 从摘要中提取长期记忆，写入持久作用域（默认取管理器 memory.scope，通常不含 sessionId）
          const durableScope = consolidateOpts?.scope ?? options.memory?.scope
          const extracted = await deps.memory.extract(
            [{ role: 'user', content: summaryText }],
            {
              objectId: scope?.objectId,
              scope: durableScope,
              types: consolidateOpts?.types ?? options.memory?.types,
              model: consolidateOpts?.model ?? options.memory?.extractionModel,
              systemPrompt: consolidateOpts?.extractionSystemPrompt ?? options.memory?.extractionSystemPrompt,
            },
          )
          if (!extracted.success)
            return extracted

          return ok({ summary: summaryText, memories: extracted.data })
        }
        catch (error) {
          logger.error('Context consolidate failed', { error })
          return err(HaiAIError.MEMORY_PROMOTE_FAILED, aiM('ai_memoryPromoteFailed', { params: { error: String(error) } }), error)
        }
      },

      get pendingMemoryTasks(): number {
        return pendingMemoryTasks.size
      },

      async flush(): Promise<HaiResult<void>> {
        // 快照当前任务集合后等待；提取任务失败已在 enqueue 处降级为 warn，不影响 flush 成功
        while (pendingMemoryTasks.size > 0) {
          await Promise.allSettled([...pendingMemoryTasks])
        }
        return ok(undefined)
      },

      // ─── chat/chatStream 编排 ───

      async chat(message: string, chatOpts?: ContextChatOptions): Promise<HaiResult<ContextChatResult>> {
        if (!deps?.llm) {
          return err(HaiAIError.NOT_INITIALIZED, aiM('ai_notInitialized'))
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

          // 可选：注入记忆（scope / types / minImportance 完整透传）
          if (options.memory?.enable && deps.memory) {
            const injected = await deps.memory.injectMemories(messages, memoryInjectionOptions())
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
              signal: chatOpts?.signal,
            })
            if (ragResult.success) {
              // RAG query 已直接返回完整结果，将 answer 作为回复
              const reply = ragResult.data.answer
              const turnId = await finalizeAssistantReply(message, reply)

              return ok({
                reply,
                model: ragResult.data.model,
                turnId,
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
              signal: chatOpts?.signal,
            })
            if (reasonResult.success) {
              const reply = reasonResult.data.answer
              const turnId = await finalizeAssistantReply(message, reply)

              return ok({ reply, model: chatOpts?.model ?? options.model ?? '', turnId, usage: undefined })
            }
          }

          // 普通 LLM 调用（含工具调用循环）
          const toolDefs = options.tools?.getDefinitions()
          const maxToolRounds = options.maxToolRounds ?? 10
          let lastModel = ''
          let lastUsage: { prompt_tokens: number, completion_tokens: number, total_tokens: number } | undefined

          for (let round = 0; round <= maxToolRounds; round++) {
            const chatResult = await deps.llm.chat({
              model: chatOpts?.model ?? options.model,
              messages,
              temperature: chatOpts?.temperature ?? options.temperature,
              objectId: scope?.objectId,
              sessionId: scope?.sessionId,
              tools: toolDefs,
              tool_choice: toolDefs ? 'auto' : undefined,
              enablePersist: chatOpts?.enablePersist ?? false,
              signal: chatOpts?.signal,
            })

            if (!chatResult.success)
              return chatResult

            const choice = chatResult.data.choices[0]
            lastModel = chatResult.data.model
            if (chatResult.data.usage) {
              lastUsage = {
                prompt_tokens: chatResult.data.usage.prompt_tokens,
                completion_tokens: chatResult.data.usage.completion_tokens,
                total_tokens: chatResult.data.usage.total_tokens,
              }
            }

            if (!choice)
              break

            const assistantMessage = choice.message

            // 有工具调用且注册表可用：执行工具并将结果回传 LLM
            if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0 && options.tools) {
              messages.push(assistantMessage)

              for (const toolCall of assistantMessage.tool_calls) {
                if (toolCall.type !== 'function')
                  continue
                const toolResult = await options.tools.execute(toolCall)
                const rawContent = toolResult.success
                  ? toolResult.data.content
                  : `Tool error: ${toolResult.error.message}`
                const toolContent = typeof rawContent === 'string'
                  ? rawContent
                  : (rawContent as Array<{ text?: string }>).map(p => p.text ?? '').join(' ')

                messages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: toolContent,
                })
              }
              continue
            }

            // 无工具调用：提取文本回复
            const reply = typeof assistantMessage.content === 'string' ? assistantMessage.content : ''

            // 完成本轮生成：auto 直接提交完整文本，manual 登记待提交轮次
            const turnId = await finalizeAssistantReply(message, reply)

            return ok({ reply, model: lastModel, turnId, usage: lastUsage })
          }

          // 达到最大工具调用轮次，返回最后可用的回复
          const lastAssistantMsg = messages.filter(m => m.role === 'assistant').pop()
          const fallbackReply = lastAssistantMsg && 'content' in lastAssistantMsg && typeof lastAssistantMsg.content === 'string'
            ? lastAssistantMsg.content
            : ''
          const fallbackTurnId = await finalizeAssistantReply(message, fallbackReply)
          return ok({ reply: fallbackReply, model: lastModel, turnId: fallbackTurnId, usage: lastUsage })
        }
        catch (error) {
          logger.error('Context chat failed', { error })
          return err(HaiAIError.INTERNAL_ERROR, aiM('ai_internalError', { params: { error: String(error) } }), error)
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

        // 可选：注入记忆（scope / types / minImportance 完整透传）
        if (options.memory?.enable && deps.memory) {
          const injected = await deps.memory.injectMemories(messages, memoryInjectionOptions())
          if (injected.success) {
            messages = injected.data
          }
        }

        // 调用上游模型前先登记轮次并广播 turn_started：
        // 中途取消（AbortSignal）时仍能保留 turnId 与已生成文本，供调用方用真实内容 commit/interrupt。
        const turn = beginStreamTurn()
        yield { type: 'turn_started', turnId: turn.id }

        try {
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
              signal: chatOpts?.signal,
            })) {
              if (event.type === 'delta') {
                fullReply += event.text
                turn.generated = fullReply
                yield { type: 'delta', text: event.text }
              }
              else if (event.type === 'done') {
                fullReply = event.answer
                model = event.model
                usage = event.usage
              }
            }

            await completeStreamTurn(turn, message, fullReply)
            yield { type: 'done', reply: fullReply, model, turnId: turn.id, usage }
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
              signal: chatOpts?.signal,
            })) {
              if (event.type === 'delta') {
                fullReply += event.text
                turn.generated = fullReply
                yield { type: 'delta', text: event.text }
              }
            }

            await completeStreamTurn(turn, message, fullReply)
            yield { type: 'done', reply: fullReply, model: chatOpts?.model ?? options.model ?? '', turnId: turn.id, usage: undefined }
            return
          }

          // 普通流式 LLM 调用（含工具调用循环）
          const toolDefs = options.tools?.getDefinitions()
          const maxToolRounds = options.maxToolRounds ?? 10

          let fullReply = ''
          let model = ''
          let usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number } | undefined

          for (let round = 0; round <= maxToolRounds; round++) {
            const processor = createStreamProcessor()

            const stream = deps.llm.chatStream({
              model: chatOpts?.model ?? options.model,
              messages,
              temperature: chatOpts?.temperature ?? options.temperature,
              objectId: scope?.objectId,
              sessionId: scope?.sessionId,
              tools: toolDefs,
              tool_choice: toolDefs ? 'auto' : undefined,
              enablePersist: chatOpts?.enablePersist ?? false,
              signal: chatOpts?.signal,
            })

            for await (const chunk of stream) {
              processor.process(chunk)

              if (!model && chunk.model)
                model = chunk.model
              const delta = chunk.choices?.[0]?.delta?.content
              if (delta) {
                fullReply += delta
                turn.generated = fullReply
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

            const streamResult = processor.getResult()

            // 有工具调用：执行工具并继续下一轮
            if (streamResult.toolCalls.length > 0 && options.tools) {
              messages.push(processor.toAssistantMessage())

              for (const toolCall of streamResult.toolCalls) {
                if (toolCall.type !== 'function')
                  continue
                yield { type: 'tool_call', name: toolCall.function.name, arguments: toolCall.function.arguments }

                const toolResult = await options.tools.execute(toolCall)
                const rawContent = toolResult.success
                  ? toolResult.data.content
                  : `Tool error: ${toolResult.error.message}`
                const toolContent = typeof rawContent === 'string'
                  ? rawContent
                  : (rawContent as Array<{ text?: string }>).map(p => p.text ?? '').join(' ')

                yield { type: 'tool_result', name: toolCall.function.name, content: toolContent, success: toolResult.success }

                messages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: toolContent,
                })
              }

              // 重置本轮生成文本，下一轮 LLM 会产出最终文本
              fullReply = ''
              turn.generated = ''
              continue
            }

            // 无工具调用：结束循环
            break
          }

          await completeStreamTurn(turn, message, fullReply)
          yield { type: 'done', reply: fullReply, model, turnId: turn.id, usage }
        }
        catch (error) {
          // 上游生成被取消（AbortSignal）：保留 generating 轮次与已生成文本，登记配对用户输入，
          // 由调用方在确定真实内容后通过 commitTurn / interruptTurn 提交。
          if (chatOpts?.signal?.aborted) {
            cancelStreamTurn(turn, message)
            yield { type: 'cancelled', turnId: turn.id, generated: turn.generated }
            return
          }
          throw error
        }
      },
    }

    /**
     * 登记一个流式生成的待完成轮次（`generating`）。
     *
     * chatStream 在调用上游模型前调用，使中途取消（AbortSignal）时仍能保留已生成文本，
     * 由调用方用真实内容通过 commitTurn / interruptTurn 提交。
     */
    function beginStreamTurn(): ConversationTurn {
      const turn: ConversationTurn = {
        id: generateTurnId(),
        speaker: 'assistant',
        generated: '',
        committed: '',
        status: 'generating',
        createdAt: Date.now(),
      }
      turns.push(turn)
      return turn
    }

    /**
     * 完成一次流式生成：写入最终文本。
     *
     * auto 模式：把生成文本写入上下文并触发记忆提取，轮次置为 `completed`。
     * manual 模式：保持 `generating` 并记录配对用户输入，等待 commit/interrupt。
     */
    async function completeStreamTurn(turn: ConversationTurn, userMessage: string, finalText: string): Promise<void> {
      turn.generated = finalText
      if (turnCommit === 'auto') {
        turn.committed = finalText
        turn.status = 'completed'
        turn.committedAt = Date.now()
        if (finalText)
          await manager.addMessage({ role: 'assistant', content: finalText })
        enqueueMemoryExtract(userMessage, finalText)
      }
      else {
        pendingCommits.set(turn.id, userMessage)
      }
    }

    /**
     * 流式生成被取消：保留 `generating` 轮次与已生成文本，登记配对用户输入，
     * 由调用方在确定真实内容后通过 commitTurn / interruptTurn 提交。
     */
    function cancelStreamTurn(turn: ConversationTurn, userMessage: string): void {
      if (!pendingCommits.has(turn.id))
        pendingCommits.set(turn.id, userMessage)
    }

    /**
     * 完成一次 assistant 生成。
     *
     * auto 模式：把完整生成文本写入上下文并触发记忆提取，轮次直接 `completed`。
     * manual 模式：仅登记 `generating` 轮次并记录配对用户输入，等待 commit/interrupt。
     *
     * @returns 该轮 turnId（供 manual 模式后续提交）
     */
    async function finalizeAssistantReply(userMessage: string, generated: string): Promise<string> {
      const turnId = generateTurnId()
      const now = Date.now()
      const turn: ConversationTurn = {
        id: turnId,
        speaker: 'assistant',
        generated,
        committed: turnCommit === 'auto' ? generated : '',
        status: turnCommit === 'auto' ? 'completed' : 'generating',
        createdAt: now,
        committedAt: turnCommit === 'auto' ? now : undefined,
      }
      turns.push(turn)

      if (turnCommit === 'auto') {
        if (generated)
          await manager.addMessage({ role: 'assistant', content: generated })
        enqueueMemoryExtract(userMessage, generated)
      }
      else {
        pendingCommits.set(turnId, userMessage)
      }
      return turnId
    }

    /**
     * 提交 / 打断一个待提交轮次：把真实文本写入上下文并触发记忆提取。
     */
    async function finalizeCommit(
      turnId: string,
      text: string | undefined,
      status: 'completed' | 'interrupted',
    ): Promise<HaiResult<void>> {
      const turn = turns.find(t => t.id === turnId)
      if (!turn)
        return err(HaiAIError.CONTEXT_TURN_NOT_FOUND, aiM('ai_turnNotFound', { params: { turnId } }))
      if (turn.status === 'completed' || turn.status === 'interrupted')
        return err(HaiAIError.CONTEXT_TURN_INVALID_STATE, aiM('ai_turnInvalidState', { params: { turnId } }))

      const committed = text ?? (status === 'completed' ? turn.generated : '')
      turn.committed = committed
      turn.status = status
      turn.committedAt = Date.now()

      const userMessage = pendingCommits.get(turnId)
      pendingCommits.delete(turnId)

      // 只有真实表达出去的内容才进入对话状态与记忆
      if (committed) {
        await manager.addMessage({ role: 'assistant', content: committed })
        if (userMessage !== undefined)
          enqueueMemoryExtract(userMessage, committed)
      }
      return ok(undefined)
    }

    return manager
  }

  return {
    /**
     * 创建有状态上下文管理器
     */
    createManager(options?: ContextManagerOptions): HaiResult<ContextManager> {
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
    async restoreManager(scope: InteractionScope, options?: Omit<ContextManagerOptions, 'scope'>): Promise<HaiResult<ContextManager>> {
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
    async listSessions(objectId: string): Promise<HaiResult<SessionInfo[]>> {
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
        return err(HaiAIError.SESSION_FAILED, aiM('ai_sessionFailed', { params: { error: String(error) } }), error)
      }
    },

    async renameSession(scope: InteractionScope, title: string): Promise<HaiResult<void>> {
      if (!sessionStore) {
        return ok(undefined)
      }

      try {
        const sessionKey = storeKey(scope)
        const existing = await sessionStore.get(sessionKey)
        if (!existing) {
          return err(HaiAIError.SESSION_FAILED, aiM('ai_sessionFailed', { params: { error: `Session not found: ${scope.sessionId}` } }))
        }
        existing.title = title
        existing.updatedAt = Date.now()
        await sessionStore.save(sessionKey, existing, { objectId: existing.objectId })
        return ok(undefined)
      }
      catch (error) {
        return err(HaiAIError.SESSION_FAILED, aiM('ai_sessionFailed', { params: { error: String(error) } }), error)
      }
    },

    async removeSession(scope: InteractionScope): Promise<HaiResult<void>> {
      if (!sessionStore) {
        return ok(undefined)
      }

      try {
        // 上下文正文与会话元数据共用同一复合键，确保删除时正文不残留
        const sessionKey = storeKey(scope)
        if (contextStore)
          await contextStore.remove(sessionKey)
        await sessionStore.remove(sessionKey)
        return ok(undefined)
      }
      catch (error) {
        return err(HaiAIError.SESSION_FAILED, aiM('ai_sessionFailed', { params: { error: String(error) } }), error)
      }
    },
  }
}
