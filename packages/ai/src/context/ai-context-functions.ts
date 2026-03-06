/**
 * @h-ai/ai — Context 子功能实现
 *
 * 提供上下文压缩、摘要生成、Token 估算与有状态上下文管理。
 * @module ai-context-functions
 */

import type { Result } from '@h-ai/core'

import type { ContextConfig } from '../ai-config.js'
import type { AIError } from '../ai-types.js'
import type { ChatMessage, LLMOperations } from '../llm/ai-llm-types.js'
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
 * @returns ContextOperations 实例
 */
export function createContextOperations(
  config: ContextConfig,
  llm: LLMOperations,
  defaultMaxTokens: number,
): ContextOperations {
  const tokenRatio = config.tokenRatio

  /**
   * 计算有效的 maxTokens
   */
  function resolveMaxTokens(optionMaxTokens?: number): number {
    const fromOption = optionMaxTokens ?? config.defaultMaxTokens
    if (fromOption > 0)
      return fromOption
    // 取 LLM maxTokens 的 80%
    return Math.floor(defaultMaxTokens * 0.8)
  }

  /**
   * 滑动窗口压缩：保留 system + 最近 N 条消息
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

    // 保留最近 N 条
    const preserved = nonSystemMessages.slice(-preserveLastN)
    const result = [...systemMessages, ...preserved]
    const currentTokens = estimateMessagesTokens(result, tokenRatio)

    if (currentTokens <= maxTokens) {
      return {
        messages: result,
        removedCount: nonSystemMessages.length - preserved.length,
      }
    }

    // 如果仍然超限，从保留的消息中继续截断
    let finalMessages = [...systemMessages]
    let tokens = estimateMessagesTokens(finalMessages, tokenRatio)

    // 从最新的消息开始逆向添加
    for (let i = preserved.length - 1; i >= 0; i--) {
      const msgTokens = estimateMessagesTokens([preserved[i]], tokenRatio)
      if (tokens + msgTokens > maxTokens)
        break
      finalMessages = [...systemMessages, preserved[i], ...finalMessages.slice(systemMessages.length)]
      tokens += msgTokens
    }

    // 重新构建：保留 system + 尽可能多的最新消息
    finalMessages = [...systemMessages]
    tokens = estimateMessagesTokens(finalMessages, tokenRatio)
    const addable: ChatMessage[] = []

    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const msgTokens = estimateMessagesTokens([nonSystemMessages[i]], tokenRatio)
      if (tokens + msgTokens > maxTokens)
        break
      addable.unshift(nonSystemMessages[i])
      tokens += msgTokens
    }

    return {
      messages: [...systemMessages, ...addable],
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
    // 格式化消息为文本
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

    let systemPrompt = SUMMARIZE_SYSTEM_PROMPT
    if (options?.previousSummary) {
      systemPrompt = INCREMENTAL_SUMMARIZE_PROMPT
        .replace('{previousSummary}', options.previousSummary)
    }

    const chatResult = await llm.chat({
      model: options?.model ?? config.summaryModel,
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

    logger.info('Compressing context', { strategy, maxTokens, messageCount: messages.length })

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

        logger.info('Sliding window compression completed', { originalTokens, compressedTokens, removedCount })
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

        logger.info('Summary compression completed', { originalTokens, compressedTokens, removedCount: toSummarize.length })
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

        logger.info('Hybrid compression completed', { originalTokens, compressedTokens, removedCount: toSummarize.length })
        return ok({
          messages: compressed,
          originalTokens,
          compressedTokens,
          removedCount: toSummarize.length,
          summary: summaryText,
        })
      }

      // 回退到滑动窗口结果
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
    logger.info('Summarizing messages', { messageCount: messages.length })

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

  return {
    compress: compressMessages,

    summarize: summarizeMessages,

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

    createManager(options?: ContextManagerOptions): Result<ContextManager, AIError> {
      const managerMaxTokens = resolveMaxTokens(options?.maxTokens)
      const strategy = options?.strategy ?? config.defaultStrategy
      const preserveSystem = options?.preserveSystem ?? true
      const preserveLastN = options?.preserveLastN ?? config.preserveLastN
      const autoCompress = options?.autoCompress ?? true
      const summaryModel = options?.summaryModel ?? config.summaryModel

      const state = {
        messages: [] as ChatMessage[],
        summaries: [] as ContextSummary[],
      }

      const manager: ContextManager = {
        async append(message: ChatMessage): Promise<Result<void, AIError>> {
          state.messages.push(message)

          if (!autoCompress)
            return ok(undefined)

          const currentTokens = estimateMessagesTokens(state.messages, tokenRatio)
          if (currentTokens <= managerMaxTokens)
            return ok(undefined)

          // 自动压缩
          logger.debug('Auto-compressing context', { currentTokens, budget: managerMaxTokens })

          const compressResult = await compressMessages(state.messages, {
            strategy,
            maxTokens: managerMaxTokens,
            preserveSystem,
            preserveLastN,
            summaryModel,
          })

          if (!compressResult.success) {
            logger.warn('Auto-compression failed, keeping original messages', { error: compressResult.error })
            return ok(undefined)
          }

          // 记录摘要
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

        reset(): void {
          state.messages = []
          state.summaries = []
        },
      }

      return ok(manager)
    },
  }
}
