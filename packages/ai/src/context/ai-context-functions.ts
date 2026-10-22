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
import type { ContextGeneration, PersistedContextState } from './ai-context-state.js'

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
import { sessionStoreKey } from '../store/ai-store-key.js'
import { updateSessionInfo } from '../store/ai-store-session.js'
import { ContextStateError, createContextStateAccess } from './ai-context-state.js'

const logger = core.logger.child({ module: 'ai', scope: 'context' })

/** 失联生成等待 30 秒后可被其他节点中断；续租不能替代最终 CAS 期限。 */
const GENERATION_LEASE_MS = 30_000

/** 将存储/冲突错误转换为公开业务结果。 */
function contextFailure(error: unknown): HaiResult<never> {
  const code = error instanceof ContextStateError ? error.definition : HaiAIError.STORE_FAILED
  return err(code, aiM('ai_sessionFailed', { params: { error: String(error) } }), error)
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
 * @param contextStore - 必需的版本化共享状态存储；测试可显式使用 Memory Store
 * @param sessionStore - 会话信息存储（可选，用于目录管理）
 * @param deps - 可选子模块依赖（LLM / Memory / RAG / Reasoning）
 * @returns ContextOperations 实例
 * @example `const context = createContextOperations(config, token, compress, store, sessions, { llm })`
 */
export function createContextOperations(
  compressConfig: CompressConfig,
  tokenOps: TokenOperations,
  compressOps: CompressOperations,
  contextStore: AIRelStore<PersistedContextState>,
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
   * 创建 ContextManager 实例（共享逻辑）
   */
  function buildManager(
    options: ContextManagerOptions,
    initial?: PersistedContextState,
  ): ContextManager {
    const scope = structuredClone(options.scope)

    // 解析压缩参数
    const compress = options.compress
    const managerMaxTokens = resolveMaxTokens(compress?.maxTokens)
    const strategy = compress?.strategy ?? compressConfig.defaultStrategy
    const preserveSystem = compress?.preserveSystem ?? true
    const preserveLastN = compress?.preserveLastN ?? compressConfig.preserveLastN
    const autoCompress = compress?.auto ?? true
    const summaryModel = compress?.summaryModel

    const fresh: PersistedContextState = initial ?? {
      messages: options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : [],
      scope,
      summaries: [],
      turns: [],
      epoch: crypto.randomUUID(),
      updatedAt: 0,
    }
    let state = structuredClone(fresh)
    const access = createContextStateAccess(contextStore, scope, fresh, (snapshot) => {
      state = snapshot
    })

    /** 压缩候选快照；仅 CAS 成功后才对外发布。 */
    async function append(candidate: PersistedContextState, message: ChatMessage): Promise<void> {
      candidate.messages.push(structuredClone(message))
      if (!autoCompress || tokenOps.estimateMessages(candidate.messages) <= managerMaxTokens)
        return
      const result = await compressOps.tryCompress(candidate.messages, {
        strategy: strategy as 'summary' | 'sliding-window' | 'hybrid',
        maxTokens: managerMaxTokens,
        preserveSystem,
        preserveLastN,
        summaryModel,
      })
      if (!result.success) {
        throw new ContextStateError(result.error.code === HaiAIError.CONTEXT_BUDGET_EXCEEDED.code
          ? HaiAIError.CONTEXT_BUDGET_EXCEEDED
          : HaiAIError.CONTEXT_COMPRESS_FAILED, result.error.message)
      }
      if (result.data.summary) {
        candidate.summaries.push({ summary: result.data.summary, tokenCount: tokenOps.estimateText(result.data.summary), coveredMessages: result.data.removedCount })
      }
      candidate.messages = result.data.messages
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

    const turnCommit = options.turnCommit ?? 'auto'
    const concurrency = options.concurrency ?? 'reject'
    // 本地仅持有取消/定时器资源；共享 Store 才是轮次和所有权的唯一事实来源。
    const producers = new Map<string, { abort: AbortController, stop: () => void }>()
    const systemPromptText = options.systemPrompt
      ?? (fresh.messages[0]?.role === 'system' && typeof fresh.messages[0].content === 'string'
        ? fresh.messages[0].content
        : undefined)

    /** 校验共享 owner 和期限；最终 CAS 再以存储端时钟检查截止时间。 */
    function owned(candidate: PersistedContextState, generation: ContextGeneration, now: number): ContextGeneration {
      const active = candidate.active
      if (!active || candidate.epoch !== generation.epoch || active.id !== generation.id || active.owner !== generation.owner
        || active.phase !== 'generating' || active.expiresAt <= now) {
        throw new ContextStateError(HaiAIError.CONTEXT_TURN_INVALID_STATE, 'Generation ownership expired or changed')
      }
      return active
    }

    /** 回收失联生成，不重放任何未知 LLM/工具副作用；保留已持久化的生成文本供审计。 */
    function recoverExpired(candidate: PersistedContextState, now: number): void {
      if (candidate.active?.phase !== 'generating' || candidate.active.expiresAt > now)
        return
      const turn = candidate.turns.find(item => item.id === candidate.active?.id)
      if (turn) {
        turn.status = 'interrupted'
        turn.committed = ''
        turn.committedAt = now
      }
      delete candidate.active
    }

    /** 跨节点排队轮询可取消；等待不保留无界事件监听器或本地许可。 */
    async function waitForContext(signal?: AbortSignal): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(finish, 50)
        function finish(): void {
          clearTimeout(timer)
          signal?.removeEventListener('abort', abort)
          resolve()
        }
        function abort(): void {
          clearTimeout(timer)
          signal?.removeEventListener('abort', abort)
          reject(signal?.reason ?? new Error('Generation cancelled'))
        }
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted)
          abort()
      })
    }

    /** 原子写入用户消息和生成 owner，再调用上游；每次许可都使用全新 ID。 */
    async function acquireGeneration(message: string, caller: AbortSignal | undefined, keepPendingOnAbort: boolean): Promise<HaiResult<{
      generation: ContextGeneration
      signal: AbortSignal
      release: () => void
    }>> {
      try {
        for (;;) {
          if (caller?.aborted)
            throw caller.reason ?? new Error('Generation cancelled')
          const generation = await access.mutate(async (candidate, now) => {
            recoverExpired(candidate, now)
            if (candidate.active)
              return { value: undefined, write: false }
            const active: ContextGeneration = { epoch: candidate.epoch, id: crypto.randomUUID(), owner: crypto.randomUUID(), phase: 'generating', expiresAt: now + GENERATION_LEASE_MS, userMessage: message }
            candidate.active = active
            candidate.turns.push({ id: active.id, speaker: 'assistant', generated: '', committed: '', status: 'generating', createdAt: now })
            await append(candidate, { role: 'user', content: message })
            return { value: active, notAfter: active.expiresAt }
          })
          if (!generation) {
            if (concurrency === 'reject')
              return err(HaiAIError.CONTEXT_BUSY, aiM('ai_contextBusy'))
            await waitForContext(caller)
            continue
          }
          const abort = new AbortController()
          const signal = caller ? AbortSignal.any([caller, abort.signal]) : abort.signal
          const acquired = generation
          let renewing = false
          const timer = setInterval(() => {
            if (renewing)
              return
            renewing = true
            void access.mutate((candidate, now) => {
              const active = owned(candidate, generation, now)
              const deadline = active.expiresAt
              active.expiresAt = now + GENERATION_LEASE_MS
              return { value: undefined, notAfter: deadline }
            }).catch(() => abort.abort()).finally(() => { renewing = false })
          }, GENERATION_LEASE_MS / 3)
          timer.unref?.()
          const release = (): void => {
            clearInterval(timer)
            signal.removeEventListener('abort', onAbort)
            producers.delete(generation.id)
          }
          function onAbort(): void {
            release()
            // 消费者停在 yield 时也要停止续租并持久化 pending，不能等待下一次 next() 才释放。
            void settleGeneration(acquired, keepPendingOnAbort)
          }
          producers.set(generation.id, { abort, stop: release })
          signal.addEventListener('abort', onAbort, { once: true })
          if (signal.aborted)
            onAbort()
          return ok({ generation, signal, release })
        }
      }
      catch (error) { return contextFailure(error) }
    }

    /** 每个对外 delta 先写入共享记录；旧 producer 不能继续广播未持久化内容。 */
    async function checkpoint(generation: ContextGeneration, generated: string): Promise<void> {
      await access.mutate((candidate, now) => {
        const active = owned(candidate, generation, now)
        candidate.turns.find(item => item.id === active.id)!.generated = generated
        return { value: undefined, notAfter: active.expiresAt }
      })
    }

    /** 异常退出关闭 owner；取消流保留可跨节点提交的 pending，失败不自动重放。 */
    async function settleGeneration(generation: ContextGeneration, keepPending: boolean, requirePersistence = false): Promise<void> {
      try {
        await access.mutate((candidate, now) => {
          if (candidate.active?.id !== generation.id || candidate.active.owner !== generation.owner
            || candidate.active.phase === 'pending') {
            return { value: undefined, write: false }
          }
          const active = owned(candidate, generation, now)
          const deadline = active.expiresAt
          if (keepPending) {
            active.phase = 'pending'
          }
          else {
            const turn = candidate.turns.find(item => item.id === active.id)!
            turn.status = 'interrupted'
            turn.committedAt = now
            delete candidate.active
          }
          return { value: undefined, notAfter: deadline }
        })
      }
      catch (error) {
        if (requirePersistence)
          throw error
        logger.warn('Context producer settlement failed', { error })
      }
    }

    const manager: ContextManager = {
      get scope() { return structuredClone(scope) },

      async addMessage(message: ChatMessage): Promise<HaiResult<void>> {
        try {
          await access.mutate(async (candidate, now) => {
            recoverExpired(candidate, now)
            if (candidate.active)
              throw new ContextStateError(HaiAIError.CONTEXT_BUSY, aiM('ai_contextBusy'))
            await append(candidate, message)
            return { value: undefined }
          })
          return ok(undefined)
        }
        catch (error) { return contextFailure(error) }
      },
      async reload(): Promise<HaiResult<void>> {
        try {
          await access.read()
          return ok(undefined)
        }
        catch (error) { return contextFailure(error) }
      },

      getMessages(): HaiResult<ChatMessage[]> {
        return ok(structuredClone(state.messages))
      },

      getTokenUsage(): HaiResult<{ current: number, budget: number }> {
        return ok({
          current: tokenOps.estimateMessages(state.messages),
          budget: managerMaxTokens,
        })
      },

      getSummaries(): HaiResult<SummaryResult[]> {
        return ok(structuredClone(state.summaries))
      },

      async save(): Promise<HaiResult<void>> {
        await manager.flush()
        try {
          // 消息即时 CAS；save 仅同步共享快照和目录，绝不覆盖远端新版本。
          await access.mutate(() => ({ value: undefined }))
          await touchSession(scope)
          return ok(undefined)
        }
        catch (error) { return contextFailure(error) }
      },
      async reset(resetOpts?): Promise<HaiResult<void>> {
        if (resetOpts?.waitForMemoryTasks)
          await manager.flush()
        try {
          await access.mutate((candidate) => {
            candidate.epoch = crypto.randomUUID()
            candidate.messages = resetOpts?.preserveSystemPrompt !== false && systemPromptText
              ? [{ role: 'system', content: systemPromptText }]
              : []
            candidate.summaries = []
            candidate.turns = []
            delete candidate.active
            return { value: undefined }
          })
          if (resetOpts?.cancelActiveTurn !== false) {
            for (const producer of producers.values()) {
              producer.abort.abort()
              producer.stop()
            }
          }
          return ok(undefined)
        }
        catch (error) { return contextFailure(error) }
      },
      getTurns(): HaiResult<ConversationTurn[]> { return ok(structuredClone(state.turns)) },
      async markTurnSpeaking(turnId: string): Promise<HaiResult<void>> {
        try {
          await access.mutate((candidate, now) => {
            const turn = candidate.turns.find(item => item.id === turnId)
            if (!turn)
              throw new ContextStateError(HaiAIError.CONTEXT_TURN_NOT_FOUND, 'Turn not found')
            const active = candidate.active
            if (active?.id !== turnId)
              return { value: undefined, write: false }
            if (active.phase === 'generating' && active.expiresAt <= now)
              throw new ContextStateError(HaiAIError.CONTEXT_TURN_INVALID_STATE, 'Generation expired')
            turn.status = 'speaking'
            return { value: undefined, notAfter: active.phase === 'generating' ? active.expiresAt : undefined }
          })
          return ok(undefined)
        }
        catch (error) { return contextFailure(error) }
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
          await access.read()
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

        // 单活动生成：获取许可（reject 时直接返回 CONTEXT_BUSY）
        const acq = await acquireGeneration(message, chatOpts?.signal, false)
        if (!acq.success)
          return acq
        const { generation, signal, release } = acq.data
        let turnId: string

        try {
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
              signal,
            })
            if (ragResult.success) {
              // RAG query 已直接返回完整结果，将 answer 作为回复
              const reply = ragResult.data.answer
              turnId = await finalizeAssistantReply(generation, reply)

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
              signal,
            })
            if (reasonResult.success) {
              const reply = reasonResult.data.answer
              turnId = await finalizeAssistantReply(generation, reply)

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
              signal,
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
                const toolResult = await options.tools.execute(toolCall, { signal, objectId: scope?.objectId, sessionId: scope?.sessionId })
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
            turnId = await finalizeAssistantReply(generation, reply)

            return ok({ reply, model: lastModel, turnId, usage: lastUsage })
          }

          // 达到最大工具调用轮次，返回最后可用的回复
          const lastAssistantMsg = messages.filter(m => m.role === 'assistant').pop()
          const fallbackReply = lastAssistantMsg && 'content' in lastAssistantMsg && typeof lastAssistantMsg.content === 'string'
            ? lastAssistantMsg.content
            : ''
          turnId = await finalizeAssistantReply(generation, fallbackReply)
          return ok({ reply: fallbackReply, model: lastModel, turnId, usage: lastUsage })
        }
        catch (error) {
          logger.error('Context chat failed', { error })
          return contextFailure(error)
        }
        finally {
          // 结算并发屏障：auto 已终态立即释放；manual 待提交轮次的屏障移交 commit/interrupt
          release()
          await settleGeneration(generation, false)
        }
      },

      async* chatStream(message: string, chatOpts?: ContextChatOptions): AsyncIterable<ContextStreamEvent> {
        if (!deps?.llm) {
          throw new Error('LLM not initialized: deps.llm is required for chatStream')
        }

        // 单活动生成：获取许可（reject 时抛出 CONTEXT_BUSY，供调用方 for-await 捕获）
        const acq = await acquireGeneration(message, chatOpts?.signal, true)
        if (!acq.success)
          throw acq.error
        const { generation, signal, release } = acq.data
        let keepPending = true

        try {
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

          // 调用上游模型前先登记轮次（含配对用户输入）并广播 turn_started：
          // 中途取消（AbortSignal）时仍能保留 turnId 与已生成文本，供调用方用真实内容 commit/interrupt。
          const turn = structuredClone(state.turns.find(item => item.id === generation.id)!)
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
                signal,
              })) {
                if (event.type === 'delta') {
                  fullReply += event.text
                  await checkpoint(generation, fullReply)
                  turn.generated = fullReply
                  yield { type: 'delta', text: event.text }
                }
                else if (event.type === 'done') {
                  fullReply = event.answer
                  model = event.model
                  usage = event.usage
                }
              }

              // 轮次若已被 interruptTurn 打断进入终态，则不得再产出 `done`，避免业务层误判为正常完成。
              if (await completeStreamTurn(generation, fullReply))
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
                signal,
              })) {
                if (event.type === 'delta') {
                  fullReply += event.text
                  await checkpoint(generation, fullReply)
                  turn.generated = fullReply
                  yield { type: 'delta', text: event.text }
                }
              }

              // 轮次若已被 interruptTurn 打断进入终态，则不得再产出 `done`，避免业务层误判为正常完成。
              if (await completeStreamTurn(generation, fullReply))
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
                signal,
              })

              for await (const chunk of stream) {
                processor.process(chunk)

                if (!model && chunk.model)
                  model = chunk.model
                const delta = chunk.choices?.[0]?.delta?.content
                if (delta) {
                  fullReply += delta
                  await checkpoint(generation, fullReply)
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

                  const toolResult = await options.tools.execute(toolCall, { signal, objectId: scope?.objectId, sessionId: scope?.sessionId })
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
                await checkpoint(generation, '')
                turn.generated = ''
                continue
              }

              // 无工具调用：结束循环
              break
            }

            // 轮次若已被 interruptTurn 打断进入终态，则不得再产出 `done`，避免业务层误判为正常完成。
            if (await completeStreamTurn(generation, fullReply))
              yield { type: 'done', reply: fullReply, model, turnId: turn.id, usage }
          }
          catch (error) {
            // 上游取消后将已持久化的轮次转为 pending，供其他节点按实际表达内容提交；
            // 若已被 interrupt 进入终态则忽略。
            if (signal.aborted) {
              await settleGeneration(generation, true, true)
              keepPending = true
              yield { type: 'cancelled', turnId: turn.id, generated: turn.generated }
              return
            }
            keepPending = false
            throw error
          }
        }
        finally {
          // 结算并发屏障：auto 已终态立即释放；manual / 取消后待提交轮次的屏障移交 commit/interrupt
          release()
          await settleGeneration(generation, keepPending)
        }
      },
    }

    /** 将生成文本与 pending/自动提交一次性写入；失败后不得宣称完成。 */
    async function completeStreamTurn(generation: ContextGeneration, generated: string): Promise<boolean> {
      const applied = await access.mutate(async (candidate, now) => {
        const turn = candidate.turns.find(item => item.id === generation.id)
        if (turn && (turn.status === 'completed' || turn.status === 'interrupted'))
          return { value: false, write: false }
        const active = owned(candidate, generation, now)
        const deadline = active.expiresAt
        turn!.generated = generated
        if (turnCommit === 'manual') {
          active.phase = 'pending'
        }
        else {
          turn!.committed = generated
          turn!.status = 'completed'
          turn!.committedAt = now
          if (generated)
            await append(candidate, { role: 'assistant', content: generated })
          delete candidate.active
        }
        return { value: true, notAfter: deadline }
      })
      if (applied && turnCommit === 'auto')
        enqueueMemoryExtract(generation.userMessage, generated)
      return applied
    }

    /** 非流式共享相同轮次 ID；过期/reset/delete 后不得返回伪成功。 */
    async function finalizeAssistantReply(generation: ContextGeneration, generated: string): Promise<string> {
      if (!await completeStreamTurn(generation, generated))
        throw new ContextStateError(HaiAIError.CONTEXT_TURN_INVALID_STATE, 'Turn already settled')
      return generation.id
    }

    /** 同一 turnId、终态、文本重复提交幂等；并发节点最多追加一次真实回复。 */
    async function finalizeCommit(turnId: string, text: string | undefined, status: 'completed' | 'interrupted'): Promise<HaiResult<void>> {
      try {
        const extracted = await access.mutate(async (candidate, now) => {
          const turn = candidate.turns.find(item => item.id === turnId)
          if (!turn)
            throw new ContextStateError(HaiAIError.CONTEXT_TURN_NOT_FOUND, 'Turn not found')
          const committed = text ?? (status === 'completed' ? turn.generated : '')
          if (turn.status === 'completed' || turn.status === 'interrupted') {
            if (turn.status === status && turn.committed === committed)
              return { value: undefined, write: false }
            throw new ContextStateError(HaiAIError.CONTEXT_TURN_INVALID_STATE, 'Turn already settled differently')
          }
          const active = candidate.active
          if (!active || active.id !== turnId || (active.phase === 'generating' && active.expiresAt <= now))
            throw new ContextStateError(HaiAIError.CONTEXT_TURN_INVALID_STATE, 'Generation expired or changed')
          const deadline = active.phase === 'generating' ? active.expiresAt : undefined
          const pair = { user: active.userMessage, reply: committed }
          turn.committed = committed
          turn.status = status
          turn.committedAt = now
          if (committed)
            await append(candidate, { role: 'assistant', content: committed })
          delete candidate.active
          return { value: pair, notAfter: deadline }
        })
        producers.get(turnId)?.abort.abort()
        producers.get(turnId)?.stop()
        if (extracted?.reply)
          enqueueMemoryExtract(extracted.user, extracted.reply)
        return ok(undefined)
      }
      catch (error) { return contextFailure(error) }
    }

    return manager
  }

  /** CAS 同步目录，删除墓碑不可由迟到 save/LLM 重建。 */
  async function touchSession(scope: InteractionScope): Promise<void> {
    if (!sessionStore)
      return
    await updateSessionInfo(sessionStore, scope, (existing, now) => {
      if (existing?.deleted)
        return undefined
      return existing
        ? { ...existing, updatedAt: now }
        : { ...scope, createdAt: now, updatedAt: now }
    })
  }

  /** scope 是持久化隔离与并发协议的必需条件。 */
  function validScope(scope: InteractionScope | undefined): scope is InteractionScope {
    return !!scope && typeof scope.objectId === 'string' && !!scope.objectId.trim()
      && typeof scope.sessionId === 'string' && !!scope.sessionId.trim()
  }

  return {
    createManager(options: ContextManagerOptions): HaiResult<ContextManager> {
      if (!validScope(options?.scope))
        return err(HaiAIError.CONFIGURATION_ERROR, aiM('ai_contextScopeRequired'))
      return ok(buildManager(options))
    },
    async restoreManager(scope: InteractionScope, options?: Omit<ContextManagerOptions, 'scope'>): Promise<HaiResult<ContextManager>> {
      try {
        if (!validScope(scope))
          return err(HaiAIError.CONFIGURATION_ERROR, aiM('ai_contextScopeRequired'))
        const persisted = await contextStore.readVersioned(sessionStoreKey(scope))
        if (persisted?.data.deleted)
          throw new ContextStateError(HaiAIError.SESSION_FAILED, 'Context has been deleted')
        return ok(buildManager({ ...options, scope }, persisted?.data))
      }
      catch (error) { return contextFailure(error) }
    },
    async listSessions(objectId: string): Promise<HaiResult<SessionInfo[]>> {
      if (!sessionStore)
        return ok([])
      try {
        const sessions = await sessionStore.query({ objectId, orderBy: { field: 'updatedAt', direction: 'desc' } })
        const contexts = await contextStore.query({ objectId })
        // 一次批量读，避免目录同步失败后重新展示已删除正文；不做逐会话 N+1 查询。
        const deleted = new Set(contexts.filter(item => item.deleted).map(item => sessionStoreKey(item.scope)))
        return ok(sessions.filter(item => !item.deleted && !deleted.has(sessionStoreKey(item))))
      }
      catch (error) { return contextFailure(error) }
    },
    async renameSession(scope: InteractionScope, title: string): Promise<HaiResult<void>> {
      if (!sessionStore)
        return ok(undefined)
      try {
        const context = await contextStore.readVersioned(sessionStoreKey(scope))
        if (context?.data.deleted)
          throw new ContextStateError(HaiAIError.SESSION_FAILED, 'Context has been deleted')
        await updateSessionInfo(sessionStore, scope, (existing, now) => {
          if (!existing || existing.deleted)
            throw new ContextStateError(HaiAIError.SESSION_FAILED, 'Session not found')
          return { ...existing, title, updatedAt: now }
        })
        return ok(undefined)
      }
      catch (error) { return contextFailure(error) }
    },
    async removeSession(scope: InteractionScope): Promise<HaiResult<void>> {
      try {
        const initial: PersistedContextState = { scope, messages: [], summaries: [], turns: [], epoch: crypto.randomUUID(), updatedAt: 0 }
        const access = createContextStateAccess(contextStore, scope, initial, () => {})
        await access.mutate((candidate) => {
          candidate.deleted = true
          candidate.epoch = crypto.randomUUID()
          candidate.messages = []
          candidate.summaries = []
          candidate.turns = []
          delete candidate.active
          return { value: undefined }
        }, true)
        if (sessionStore) {
          await updateSessionInfo(sessionStore, scope, (existing, now) => ({ ...existing, ...scope, createdAt: existing?.createdAt ?? now, updatedAt: now, deleted: true }))
        }
        return ok(undefined)
      }
      catch (error) { return contextFailure(error) }
    },
  }
}
