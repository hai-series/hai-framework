/**
 * @h-ai/ai — Compress 子功能实现
 *
 * 提供上下文压缩能力，支持滑动窗口、摘要、混合三种策略。
 * 依赖 Token 子模块进行 Token 估算，依赖 Summary 子模块生成摘要。
 * @module ai-compress-functions
 */

import type { HaiResult } from '@h-ai/core'

import type { CompressConfig } from '../ai-config.js'

import type { ChatMessage } from '../llm/ai-llm-types.js'
import type { SummaryOperations } from '../summary/ai-summary-types.js'
import type { TokenOperations } from '../token/ai-token-types.js'
import type { CompressOperations, CompressOptions, CompressResult } from './ai-compress-types.js'

import { core, err, ok } from '@h-ai/core'

import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'

const logger = core.logger.child({ module: 'ai', scope: 'compress' })

/**
 * 创建 Compress 操作接口
 *
 * @param config - Compress 配置
 * @param token - Token 操作接口（用于估算 Token 数）
 * @param summary - Summary 操作接口（用于 summary/hybrid 策略生成摘要）
 * @param modelMaxTokens - 模型最大 Token 数（用于 defaultMaxTokens 为 0 时的回退计算）
 * @returns CompressOperations 实例
 */
export function createCompressOperations(
  config: CompressConfig,
  token: TokenOperations,
  summary: SummaryOperations,
  modelMaxTokens: number,
): CompressOperations {
  /**
   * 计算有效的 maxTokens
   */
  function resolveMaxTokens(optionMaxTokens?: number): number {
    const fromOption = optionMaxTokens ?? config.defaultMaxTokens
    if (fromOption > 0)
      return fromOption
    return Math.floor(modelMaxTokens * 0.8)
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
    const currentTokens = token.estimateMessages(result)

    if (currentTokens <= maxTokens) {
      return {
        messages: result,
        removedCount: nonSystemMessages.length - preserved.length,
      }
    }

    // 从最新的消息开始逆向添加
    let finalMessages = [...systemMessages]
    let tokens = token.estimateMessages(finalMessages)
    const addable: ChatMessage[] = []

    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const msgTokens = token.estimateMessages([nonSystemMessages[i]])
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
   * 压缩消息列表
   */
  async function tryCompress(messages: ChatMessage[], options?: CompressOptions): Promise<HaiResult<CompressResult>> {
    const strategy = options?.strategy ?? config.defaultStrategy
    const maxTokens = resolveMaxTokens(options?.maxTokens)
    const preserveSystem = options?.preserveSystem ?? true
    const preserveLastN = options?.preserveLastN ?? config.preserveLastN

    logger.trace('Compressing context', { strategy, maxTokens, messageCount: messages.length })

    try {
      const originalTokens = token.estimateMessages(messages)

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
        const compressedTokens = token.estimateMessages(compressed)

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

        const summaryResult = await summary.generate(toSummarize, { model: options?.summaryModel })
        if (!summaryResult.success)
          return summaryResult as HaiResult<never>

        const summaryText = summaryResult.data
        const summaryMessage: ChatMessage = {
          role: 'system',
          content: `[Conversation Summary]\n${summaryText}`,
        }

        const compressed = [...systemMessages, summaryMessage, ...preserved]
        const compressedTokens = token.estimateMessages(compressed)

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
      const windowTokens = token.estimateMessages(windowResult)

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
        const summaryResult = await summary.generate(toSummarize, { model: options?.summaryModel })
        if (!summaryResult.success)
          return summaryResult as HaiResult<never>

        const summaryText = summaryResult.data
        const summaryMessage: ChatMessage = {
          role: 'system',
          content: `[Conversation Summary]\n${summaryText}`,
        }

        const compressed = [...systemMessages, summaryMessage, ...preservedMessages]
        const compressedTokens = token.estimateMessages(compressed)

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
      return err(HaiAIError.CONTEXT_COMPRESS_FAILED, aiM('ai_contextCompressFailed', { params: { error: String(error) } }), error)
    }
  }

  return {
    tryCompress,
  }
}
