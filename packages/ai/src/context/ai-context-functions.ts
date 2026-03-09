/**
 * @h-ai/ai — Context 子功能实现
 *
 * 提供上下文压缩、摘要生成、Token 估算与有状态上下文管理。
 * 支持通过 AIStore 持久化会话状态。
 * @module ai-context-functions
 */

import type { Result } from '@h-ai/core'

import type { ContextConfig } from '../ai-config.js'
import type { AIError } from '../ai-types.js'
import type { ChatMessage, LLMOperations } from '../llm/ai-llm-types.js'
import type { AIStore, InteractionScope, SessionInfo, WhereClause } from '../store/ai-store-types.js'
import type {
  ContextCompressOptions,
  ContextCompressResult,
  ContextManager,
  ContextManagerOptions,
  ContextOperations,
  ContextSummarizeOptions,
  ContextSummary,
} from './ai-context-types.js'

import { core, err, ok } from '@h-ai/core'

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'
import { estimateMessagesTokens, estimateTextTokens } from './ai-context-token.js'

const logger = core.logger.child({ module: 'ai', scope: 'context' })

// ─── 持久化状态结构 ───

/**
 * 持久化的上下文管理器状态
 */
interface PersistedContextState {
  messages: ChatMessage[]
  summaries: ContextSummary[]
  updatedAt: number
}

// ─── 摘要提示词 ───

const SUMMARIZE_SYSTEM_PROMPT = `You are a conversation summarizer. Create a concise summary of the conversation that preserves:
1. Key facts and decisions made
2. Important context and background information
3. User preferences or instructions mentioned
4. Any unresolved questions or pending topics

Rules:
- Be concise but comprehensive — capture all important information
- Use third person ("The user asked...", "The assistant explained...")
- Preserve specific details like names, numbers, dates, and technical terms
- Structure the summary in logical paragraphs
- Keep the summary under 500 words`

const INCREMENTAL_SUMMARIZE_PROMPT = `You are a conversation summarizer. You have a previous summary and new messages to incorporate.

Previous Summary:
{previousSummary}

Merge the previous summary with the new conversation messages to create an updated, comprehensive summary. Follow the same rules as before: be concise, preserve key details, use third person.`

/**
 * 创建 Context 操作接口
 *
 * @param config - Context 配置
 * @param llm - LLM 操作接口（用于生成摘要）
 * @param defaultMaxTokens - 默认 maxTokens（从 LLM 配置获取）
 * @param contextStore - 上下文状态存储（可选，用于持久化）
 * @param sessionStore - 会话信息存储（可选，用于目录管理）
 * @returns ContextOperations 实例
 */
export function createContextOperations(
  config: ContextConfig,
  llm: LLMOperations,
  defaultMaxTokens: number,
  contextStore?: AIStore<PersistedContextState>,
  sessionStore?: AIStore<SessionInfo>,
): ContextOperations {
  const tokenRatio = config.tokenRatio

  /**
   * 计算有效的 maxTokens
   */
  function resolveMaxTokens(optionMaxTokens?: number): number {
    const fromOption = optionMaxTokens ?? config.defaultMaxTokens
    if (fromOption > 0)
      return fromOption
    return Math.floor(defaultMaxTokens * 0.8)
  }

  /**
   * 滑动窗口压缩
   */
  function slidingWindow(
    messages: ChatMessage[],
    maxTokens: number,
    preserveSystem: boolean,
    preserveLastN: number,
  ): { messages: ChatMessage[], removedCount: number } {
    const systemMessages: ChatMessage[] = []
    const nonSystemMessages: ChatMessage[] = []

    for (const msg of messages) {
      if (msg.role === 'system' && preserveSystem) {
        systemMessages.push(msg)
      }
      else {
        nonSystemMessages.push(msg)
      }
    }

    const preserved = nonSystemMessages.slice(-preserveLastN)
    const result = [...systemMessages, ...preserved]
    const currentTokens = estimateMessagesTokens(result, tokenRatio)

    if (currentTokens <= maxTokens) {
      return {
        messages: result,
        removedCount: nonSystemMessages.length - preserved.length,
      }
    }

    // 从最新的消息开始逆向添加
    let finalMessages = [...systemMessages]
    let tokens = estimateMessagesTokens(finalMessages, tokenRatio)
    const addable: ChatMessage[] = []

    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const msgTokens = estimateMessagesTokens([nonSystemMessages[i]], tokenRatio)
      if (tokens + msgTokens > maxTokens)
        break
      addable.unshift(nonSystemMessages[i])
      tokens += msgTokens
    }

    finalMessages = [...systemMessages, ...addable]

    return {
      messages: finalMessages,
      removedCount: nonSystemMessages.length - addable.length,
    }
  }

  /**
   * 生成摘要
   */
  async function generateSummary(
    messages: ChatMessage[],
    options?: { model?: string, temperature?: number, previousSummary?: string },
  ): Promise<Result<string, AIError>> {
    const conversationText = messages
      .filter(m => m.role !== 'system')
      .map((m) => {
        const content = m.role === 'assistant'
          ? (m.content ?? '[tool call]')
          : m.role === 'tool'
            ? `[tool result: ${m.content.slice(0, 200)}]`
            : (typeof m.content === 'string' ? m.content : '[multimodal]')
        return `${m.role}: ${content}`
      })
      .join('\n')

    let systemPrompt = config.systemPrompt ?? SUMMARIZE_SYSTEM_PROMPT
    if (options?.previousSummary) {
      systemPrompt = INCREMENTAL_SUMMARIZE_PROMPT
        .replace('{previousSummary}', options.previousSummary)
    }

    const chatResult = await llm.chat({
      model: options?.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: conversationText },
      ],
      temperature: options?.temperature ?? 0.3,
    })

    if (!chatResult.success) {
      return err({
        code: AIErrorCode.CONTEXT_SUMMARIZE_FAILED,
        message: aiM('ai_contextSummarizeFailed', { params: { error: String(chatResult.error.message) } }),
        cause: chatResult.error,
      })
    }

    return ok(chatResult.data.choices[0]?.message?.content ?? '')
  }

  /**
   * 压缩消息列表
   */
  async function compressMessages(messages: ChatMessage[], options?: ContextCompressOptions): Promise<Result<ContextCompressResult, AIError>> {
    const strategy = options?.strategy ?? config.defaultStrategy
    const maxTokens = resolveMaxTokens(options?.maxTokens)
    const preserveSystem = options?.preserveSystem ?? true
    const preserveLastN = options?.preserveLastN ?? config.preserveLastN

    logger.trace('Compressing context', { strategy, maxTokens, messageCount: messages.length })

    try {
      const originalTokens = estimateMessagesTokens(messages, tokenRatio)

      // 不需要压缩
      if (originalTokens <= maxTokens) {
        return ok({
          messages: [...messages],
          originalTokens,
          compressedTokens: originalTokens,
          removedCount: 0,
        })
      }

      if (strategy === 'sliding-window') {
        const { messages: compressed, removedCount } = slidingWindow(
          messages,
          maxTokens,
          preserveSystem,
          preserveLastN,
        )
        const compressedTokens = estimateMessagesTokens(compressed, tokenRatio)

        logger.trace('Sliding window compression completed', { originalTokens, compressedTokens, removedCount })
        return ok({
          messages: compressed,
          originalTokens,
          compressedTokens,
          removedCount,
        })
      }

      if (strategy === 'summary') {
        const systemMessages = preserveSystem ? messages.filter(m => m.role === 'system') : []
        const nonSystem = messages.filter(m => m.role !== 'system' || !preserveSystem)
        const preserved = nonSystem.slice(-preserveLastN)
        const toSummarize = nonSystem.slice(0, nonSystem.length - preserveLastN)

        if (toSummarize.length === 0) {
          return ok({
            messages: [...messages],
            originalTokens,
            compressedTokens: originalTokens,
            removedCount: 0,
          })
        }

        const summaryResult = await generateSummary(toSummarize, { model: options?.summaryModel })
        if (!summaryResult.success)
          return summaryResult as Result<never, AIError>

        const summaryText = summaryResult.data
        const summaryMessage: ChatMessage = {
          role: 'system',
          content: `[Conversation Summary]\n${summaryText}`,
        }

        const compressed = [...systemMessages, summaryMessage, ...preserved]
        const compressedTokens = estimateMessagesTokens(compressed, tokenRatio)

        logger.trace('Summary compression completed', { originalTokens, compressedTokens, removedCount: toSummarize.length })
        return ok({
          messages: compressed,
          originalTokens,
          compressedTokens,
          removedCount: toSummarize.length,
          summary: summaryText,
        })
      }

      // hybrid：先滑动窗口，如果仍超限则摘要
      const { messages: windowResult, removedCount: windowRemoved } = slidingWindow(
        messages,
        maxTokens,
        preserveSystem,
        preserveLastN,
      )
      const windowTokens = estimateMessagesTokens(windowResult, tokenRatio)

      if (windowTokens <= maxTokens) {
        return ok({
          messages: windowResult,
          originalTokens,
          compressedTokens: windowTokens,
          removedCount: windowRemoved,
        })
      }

      // 滑动窗口不够，对被移除的部分生成摘要
      const systemMessages = preserveSystem ? messages.filter(m => m.role === 'system') : []
      const nonSystem = messages.filter(m => m.role !== 'system' || !preserveSystem)
      const preservedMessages = nonSystem.slice(-preserveLastN)
      const toSummarize = nonSystem.slice(0, nonSystem.length - preserveLastN)

      if (toSummarize.length > 0) {
        const summaryResult = await generateSummary(toSummarize, { model: options?.summaryModel })
        if (!summaryResult.success)
          return summaryResult as Result<never, AIError>

        const summaryText = summaryResult.data
        const summaryMessage: ChatMessage = {
          role: 'system',
          content: `[Conversation Summary]\n${summaryText}`,
        }

        const compressed = [...systemMessages, summaryMessage, ...preservedMessages]
        const compressedTokens = estimateMessagesTokens(compressed, tokenRatio)

        logger.trace('Hybrid compression completed', { originalTokens, compressedTokens, removedCount: toSummarize.length })
        return ok({
          messages: compressed,
          originalTokens,
          compressedTokens,
          removedCount: toSummarize.length,
          summary: summaryText,
        })
      }

      return ok({
        messages: windowResult,
        originalTokens,
        compressedTokens: windowTokens,
        removedCount: windowRemoved,
      })
    }
    catch (error) {
      logger.error('Context compression failed', { error })
      return err({
        code: AIErrorCode.CONTEXT_COMPRESS_FAILED,
        message: aiM('ai_contextCompressFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 摘要消息列表
   */
  async function summarizeMessages(messages: ChatMessage[], options?: ContextSummarizeOptions): Promise<Result<ContextSummary, AIError>> {
    logger.trace('Summarizing messages', { messageCount: messages.length })

    try {
      const summaryResult = await generateSummary(messages, {
        model: options?.model,
        temperature: options?.temperature,
        previousSummary: options?.previousSummary,
      })

      if (!summaryResult.success)
        return summaryResult as Result<never, AIError>

      const summary = summaryResult.data
      return ok({
        summary,
        tokenCount: estimateTextTokens(summary, tokenRatio),
        coveredMessages: messages.filter(m => m.role !== 'system').length,
      })
    }
    catch (error) {
      logger.error('Context summarization failed', { error })
      return err({
        code: AIErrorCode.CONTEXT_SUMMARIZE_FAILED,
        message: aiM('ai_contextSummarizeFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
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
    scope: InteractionScope | undefined,
    managerMaxTokens: number,
    strategy: string,
    preserveSystem: boolean,
    preserveLastN: number,
    autoCompress: boolean,
    summaryModel: string | undefined,
    initialMessages: ChatMessage[],
    initialSummaries: ContextSummary[],
  ): ContextManager {
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

        const currentTokens = estimateMessagesTokens(state.messages, tokenRatio)
        if (currentTokens <= managerMaxTokens)
          return ok(undefined)

        logger.trace('Auto-compressing context', { currentTokens, budget: managerMaxTokens })

        const compressResult = await compressMessages(state.messages, {
          strategy: strategy as ContextCompressOptions['strategy'],
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
            tokenCount: estimateTextTokens(compressResult.data.summary, tokenRatio),
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
          current: estimateMessagesTokens(state.messages, tokenRatio),
          budget: managerMaxTokens,
        })
      },

      getSummaries(): Result<ContextSummary[], AIError> {
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
          })

          // 同步更新会话信息
          if (sessionStore) {
            const existing = await sessionStore.get(scope.sessionId)
            if (existing) {
              existing.updatedAt = Date.now()
              await sessionStore.save(scope.sessionId, existing)
            }
            else {
              await sessionStore.save(scope.sessionId, {
                sessionId: scope.sessionId,
                objectId: scope.objectId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              })
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
    }

    return manager
  }

  return {
    tryCompress: compressMessages,

    summarize: summarizeMessages,

    /**
     * 估算消息列表的 Token 数
     *
     * 使用配置的 tokenRatio 进行字符数比例基于居估算。
     *
     * @param messages - 待估算的消息列表
     * @returns `ok(number)` Token 数居估值；计算异常时返回 `CONTEXT_TOKEN_ESTIMATE_FAILED`
     */
    estimateTokens(messages: ChatMessage[]): Result<number, AIError> {
      try {
        return ok(estimateMessagesTokens(messages, tokenRatio))
      }
      catch (error) {
        return err({
          code: AIErrorCode.CONTEXT_TOKEN_ESTIMATE_FAILED,
          message: aiM('ai_contextTokenEstimateFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    /**
     * 创建无状态上下文管理器
     *
     * 每次创建时从空消息列表开始，不从存储读取。
     * 如需恢复历史会话，请使用 `restoreManager`。
     *
     * @param options - 可选（maxTokens、strategy、preserveSystem、preserveLastN、autoCompress 等）
     * @returns `ok(ContextManager)` 管理器实例
     */
    createManager(options?: ContextManagerOptions): Result<ContextManager, AIError> {
      const managerMaxTokens = resolveMaxTokens(options?.maxTokens)
      const strategy = options?.strategy ?? config.defaultStrategy
      const preserveSystem = options?.preserveSystem ?? true
      const preserveLastN = options?.preserveLastN ?? config.preserveLastN
      const autoCompress = options?.autoCompress ?? true
      const summaryModel = options?.summaryModel

      const manager = buildManager(
        options?.scope,
        managerMaxTokens,
        strategy,
        preserveSystem,
        preserveLastN,
        autoCompress,
        summaryModel,
        [],
        [],
      )

      return ok(manager)
    },

    /**
     * 从存储恢复管理器实例（就地持久化的会话继续上次周期）
     *
     * 按 scope（objectId + sessionId）从 `contextStore` 读取历史消息并初始化管理器。
     * 存储中无该 scope 时从空开始（装作 fetchOrCreate 语义）。
     *
     * @param scope - 会话范围（objectId + sessionId）
     * @param options - 可选配置（与 `createManager` 相同选项，无 scope）
     * @returns `ok(ContextManager)` 已恢复状态的管理器实例
     */
    async restoreManager(scope: InteractionScope, options?: Omit<ContextManagerOptions, 'scope'>): Promise<Result<ContextManager, AIError>> {
      const managerMaxTokens = resolveMaxTokens(options?.maxTokens)
      const strategy = options?.strategy ?? config.defaultStrategy
      const preserveSystem = options?.preserveSystem ?? true
      const preserveLastN = options?.preserveLastN ?? config.preserveLastN
      const autoCompress = options?.autoCompress ?? true
      const summaryModel = options?.summaryModel

      let initialMessages: ChatMessage[] = []
      let initialSummaries: ContextSummary[] = []

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
        scope,
        managerMaxTokens,
        strategy,
        preserveSystem,
        preserveLastN,
        autoCompress,
        summaryModel,
        initialMessages,
        initialSummaries,
      )

      return ok(manager)
    },

    /**
     * 列出指定对象的所有会话
     *
     * @param objectId - 对象标识（如用户 ID）
     * @returns `ok(SessionInfo[])` 按最近更新时间降序排列的会话列表；无 sessionStore 时返回空数组
     */
    async listSessions(objectId: string): Promise<Result<SessionInfo[], AIError>> {
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
          code: AIErrorCode.SESSION_FAILED,
          message: aiM('ai_sessionFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },
  }
}
