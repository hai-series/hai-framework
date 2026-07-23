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
const CONVERSATION_SUMMARY_PREFIX = '[Conversation Summary]'
/** 框架摘要的保留参与者名；不得改用 content 前缀识别，避免与调用方指令冲突。 */
const CONVERSATION_SUMMARY_NAME = 'hai_internal_conversation_summary_v1'

type MessageProtocolUnit = ChatMessage[]

/** 确保压缩操作只在结果确实满足调用方预算时返回成功。 */
function completeCompression(result: CompressResult, maxTokens: number): HaiResult<CompressResult> {
  if (result.compressedTokens > maxTokens) {
    return err(
      HaiAIError.CONTEXT_BUDGET_EXCEEDED,
      aiM('ai_contextBudgetExceeded', {
        params: {
          tokens: result.compressedTokens,
          budget: maxTokens,
        },
      }),
    )
  }

  return ok(result)
}

/** 识别框架生成的可替换摘要，避免后续压缩把它当成永久 system 指令累积。 */
function isGeneratedConversationSummary(message: ChatMessage): boolean {
  return message.role === 'system'
    && message.name === CONVERSATION_SUMMARY_NAME
}

/** 将永久 system 指令与可再次摘要的对话载荷分开。 */
function partitionSummaryMessages(messages: ChatMessage[], preserveSystem: boolean): {
  systemMessages: ChatMessage[]
  conversationMessages: ChatMessage[]
} {
  const isPreservedSystem = (message: ChatMessage): boolean => {
    return preserveSystem && message.role === 'system' && !isGeneratedConversationSummary(message)
  }
  return {
    systemMessages: messages.filter(isPreservedSystem),
    conversationMessages: messages.filter(message => !isPreservedSystem(message)),
  }
}

/**
 * 将非系统消息切分为不可拆分的协议单元
 *
 * 普通消息各自形成一个单元；包含 tool_calls 的 assistant 消息与其后连续、匹配的
 * tool 结果共同形成一个单元，避免压缩时产生孤立的工具调用或工具结果。
 *
 * @param messages - 待切分的非系统消息列表
 * @returns 保持原始顺序的消息协议单元列表
 */
function unitizeNonSystemMessages(messages: ChatMessage[]): MessageProtocolUnit[] {
  const units: MessageProtocolUnit[] = []

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (message?.role !== 'assistant' || !message.tool_calls?.length) {
      if (message) {
        units.push([message])
      }
      continue
    }

    const toolCallIds = new Set(message.tool_calls.map(toolCall => toolCall.id))
    const unit: ChatMessage[] = [message]
    let nextIndex = index + 1
    while (nextIndex < messages.length) {
      const nextMessage = messages[nextIndex]
      if (nextMessage?.role !== 'tool' || !toolCallIds.has(nextMessage.tool_call_id)) {
        break
      }
      unit.push(nextMessage)
      nextIndex += 1
    }
    units.push(unit)
    index = nextIndex - 1
  }

  return units
}

/**
 * 将消息协议单元还原为连续消息列表
 *
 * @param units - 保持原始顺序的消息协议单元列表
 * @returns 按单元与单元内顺序展开的消息列表
 */
function flattenUnits(units: MessageProtocolUnit[]): ChatMessage[] {
  return units.flatMap(unit => unit)
}

/**
 * 划分可移除前缀与受保护尾部
 *
 * preserveLastN 表示至少保留的消息数量；包含最新 user 的协议尾部始终受保护。
 * 若数量边界落在工具协议单元内部，则保留整个单元。
 *
 * @param messages - 待划分的非系统消息列表
 * @param preserveLastN - 至少保留的尾部消息数量
 * @returns 可移除协议单元与受保护协议单元
 */
function splitProtectedSuffix(messages: ChatMessage[], preserveLastN: number): {
  removableUnits: MessageProtocolUnit[]
  protectedUnits: MessageProtocolUnit[]
} {
  const units = unitizeNonSystemMessages(messages)
  let protectedStart = units.length
  let protectedMessageCount = 0
  const requiredMessageCount = Math.max(0, preserveLastN)

  while (protectedStart > 0 && protectedMessageCount < requiredMessageCount) {
    protectedStart -= 1
    protectedMessageCount += units[protectedStart]?.length ?? 0
  }

  let latestUserUnitIndex = -1
  for (let index = units.length - 1; index >= 0; index -= 1) {
    if (units[index]?.some(message => message.role === 'user')) {
      latestUserUnitIndex = index
      break
    }
  }
  if (latestUserUnitIndex >= 0) {
    protectedStart = Math.min(protectedStart, latestUserUnitIndex)
  }

  return {
    removableUnits: units.slice(0, protectedStart),
    protectedUnits: units.slice(protectedStart),
  }
}

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
   *
   * @param optionMaxTokens - 单次压缩显式指定的 Token 上限
   * @returns 本次压缩使用的 Token 上限
   */
  function resolveMaxTokens(optionMaxTokens?: number): number {
    const fromOption = optionMaxTokens ?? config.defaultMaxTokens
    if (fromOption > 0)
      return fromOption
    return Math.floor(modelMaxTokens * 0.8)
  }

  /**
   * 滑动窗口压缩
   *
   * 从受保护尾部开始，按完整协议单元向前扩展窗口。受保护消息自身超过预算时仍原样保留，
   * 最终由 tryCompress 返回显式预算错误，禁止静默丢弃当前用户输入或谎报成功。
   *
   * @param messages - 待压缩的完整消息列表
   * @param maxTokens - 压缩后的 Token 预算
   * @param preserveSystem - 是否无条件保留 system 消息
   * @param preserveLastN - 至少保留的尾部非系统消息数量
   * @returns 压缩后的消息列表与移除消息数量
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

    const { removableUnits, protectedUnits } = splitProtectedSuffix(nonSystemMessages, preserveLastN)
    const emptyMessageTokens = token.estimateMessages([])
    const estimateUnitTokens = (unit: MessageProtocolUnit): number => {
      return Math.max(0, token.estimateMessages(unit) - emptyMessageTokens)
    }
    let retainedTokens = token.estimateMessages(systemMessages)
      + protectedUnits.reduce((total, unit) => total + estimateUnitTokens(unit), 0)
    let retainedStart = removableUnits.length
    let retainedUnits = [...protectedUnits]
    let finalMessages = [...systemMessages, ...flattenUnits(retainedUnits)]

    // 受保护尾部即使自身超过预算也不能静默丢弃；调用方可据 compressedTokens 作显式处理。
    if (retainedTokens > maxTokens) {
      return {
        messages: finalMessages,
        removedCount: flattenUnits(removableUnits).length,
      }
    }

    // 按完整协议单元从后向前扩展连续窗口。
    for (let index = removableUnits.length - 1; index >= 0; index -= 1) {
      const unit = removableUnits[index]
      if (!unit) {
        continue
      }
      const unitTokens = estimateUnitTokens(unit)
      if (retainedTokens + unitTokens > maxTokens) {
        break
      }
      retainedTokens += unitTokens
      retainedStart = index
    }

    retainedUnits = [...removableUnits.slice(retainedStart), ...protectedUnits]
    finalMessages = [...systemMessages, ...flattenUnits(retainedUnits)]

    return {
      messages: finalMessages,
      removedCount: nonSystemMessages.length - flattenUnits(retainedUnits).length,
    }
  }

  /**
   * 压缩消息列表
   *
   * @param messages - 待压缩的完整消息列表
   * @param options - 本次压缩策略与预算选项
   * @returns 包含压缩消息、Token 统计与移除数量的 HaiResult
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
        return completeCompression({
          messages: compressed,
          originalTokens,
          compressedTokens,
          removedCount,
        }, maxTokens)
      }

      if (strategy === 'summary') {
        const { systemMessages, conversationMessages } = partitionSummaryMessages(messages, preserveSystem)
        const { removableUnits, protectedUnits } = splitProtectedSuffix(conversationMessages, preserveLastN)
        const preserved = flattenUnits(protectedUnits)
        const toSummarize = flattenUnits(removableUnits)

        if (toSummarize.length === 0) {
          return completeCompression({
            messages: [...messages],
            originalTokens,
            compressedTokens: originalTokens,
            removedCount: 0,
          }, maxTokens)
        }

        const summaryResult = await summary.generate(toSummarize, { model: options?.summaryModel })
        if (!summaryResult.success)
          return summaryResult as HaiResult<never>

        const summaryText = summaryResult.data
        const summaryMessage: ChatMessage = {
          role: 'system',
          name: CONVERSATION_SUMMARY_NAME,
          content: `${CONVERSATION_SUMMARY_PREFIX}\n${summaryText}`,
        }

        const compressed = [...systemMessages, summaryMessage, ...preserved]
        const compressedTokens = token.estimateMessages(compressed)

        logger.trace('Summary compression completed', { originalTokens, compressedTokens, removedCount: toSummarize.length })
        return completeCompression({
          messages: compressed,
          originalTokens,
          compressedTokens,
          removedCount: toSummarize.length,
          summary: summaryText,
        }, maxTokens)
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
        return completeCompression({
          messages: windowResult,
          originalTokens,
          compressedTokens: windowTokens,
          removedCount: windowRemoved,
        }, maxTokens)
      }

      // 滑动窗口不够，对被移除的部分生成摘要
      const { systemMessages, conversationMessages } = partitionSummaryMessages(messages, preserveSystem)
      const { removableUnits, protectedUnits } = splitProtectedSuffix(conversationMessages, preserveLastN)
      const preservedMessages = flattenUnits(protectedUnits)
      const toSummarize = flattenUnits(removableUnits)

      if (toSummarize.length > 0) {
        const summaryResult = await summary.generate(toSummarize, { model: options?.summaryModel })
        if (!summaryResult.success)
          return summaryResult as HaiResult<never>

        const summaryText = summaryResult.data
        const summaryMessage: ChatMessage = {
          role: 'system',
          name: CONVERSATION_SUMMARY_NAME,
          content: `${CONVERSATION_SUMMARY_PREFIX}\n${summaryText}`,
        }

        const compressed = [...systemMessages, summaryMessage, ...preservedMessages]
        const compressedTokens = token.estimateMessages(compressed)

        logger.trace('Hybrid compression completed', { originalTokens, compressedTokens, removedCount: toSummarize.length })
        return completeCompression({
          messages: compressed,
          originalTokens,
          compressedTokens,
          removedCount: toSummarize.length,
          summary: summaryText,
        }, maxTokens)
      }

      return completeCompression({
        messages: windowResult,
        originalTokens,
        compressedTokens: windowTokens,
        removedCount: windowRemoved,
      }, maxTokens)
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
