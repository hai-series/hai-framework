/**
 * @h-ai/ai — Summary 子功能实现
 *
 * 使用 LLM 对对话消息生成摘要，支持增量摘要（传入前序摘要合并）。
 * @module ai-summary-functions
 */

import type { HaiResult } from '@h-ai/core'

import type { LLMConfig, SummaryConfig } from '../ai-config.js'

import type { ChatMessage, LLMOperations } from '../llm/ai-llm-types.js'
import type { TokenOperations } from '../token/ai-token-types.js'
import type { SummaryOperations, SummaryOptions, SummaryResult } from './ai-summary-types.js'

import { core, err, ok } from '@h-ai/core'

import { resolveModelEntry } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'

const logger = core.logger.child({ module: 'ai', scope: 'summary' })

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
 * 创建 Summary 操作接口
 *
 * @param llmConfig - LLM 配置（用于通过 resolveModelEntry 解析场景模型）
 * @param llm - LLM 操作接口（用于生成摘要）
 * @param token - Token 操作接口（用于估算摘要 Token 数）
 * @param config - Summary 配置
 * @returns SummaryOperations 实例
 */
export function createSummaryOperations(
  llmConfig: LLMConfig,
  llm: LLMOperations,
  token: TokenOperations,
  config: SummaryConfig,
): SummaryOperations {
  const { systemPrompt } = config

  /**
   * 提取场景对应的模型名称（API Key 校验由 provider 层负责）
   */
  function scenarioModel(explicit?: string): string | undefined {
    const result = resolveModelEntry(llmConfig, 'summary', explicit)
    return result.success ? result.data.model : explicit
  }

  /**
   * 生成摘要文本
   */
  async function generate(
    messages: ChatMessage[],
    options?: SummaryOptions,
  ): Promise<HaiResult<string>> {
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

    let prompt = systemPrompt ?? SUMMARIZE_SYSTEM_PROMPT
    if (options?.previousSummary) {
      prompt = INCREMENTAL_SUMMARIZE_PROMPT
        .replace('{previousSummary}', options.previousSummary)
    }

    const chatResult = await llm.chat({
      model: scenarioModel(options?.model),
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: conversationText },
      ],
      temperature: options?.temperature ?? 0.3,
      enablePersist: false,
    })

    if (!chatResult.success) {
      return err(HaiAIError.CONTEXT_SUMMARIZE_FAILED, aiM('ai_contextSummarizeFailed', { params: { error: String(chatResult.error.message) } }), chatResult.error)
    }

    return ok(chatResult.data.choices[0]?.message?.content ?? '')
  }

  /**
   * 生成摘要（含元数据）
   */
  async function summarize(
    messages: ChatMessage[],
    options?: SummaryOptions,
  ): Promise<HaiResult<SummaryResult>> {
    logger.trace('Summarizing messages', { messageCount: messages.length })

    try {
      const result = await generate(messages, options)
      if (!result.success)
        return result as HaiResult<never>

      const summary = result.data
      return ok({
        summary,
        tokenCount: token.estimateText(summary),
        coveredMessages: messages.filter(m => m.role !== 'system').length,
      })
    }
    catch (error) {
      logger.error('Context summarization failed', { error })
      return err(HaiAIError.CONTEXT_SUMMARIZE_FAILED, aiM('ai_contextSummarizeFailed', { params: { error: String(error) } }), error)
    }
  }

  return {
    generate,
    summarize,
  }
}
