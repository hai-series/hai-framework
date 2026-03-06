/**
 * @h-ai/ai — Memory 记忆提取
 *
 * 使用 LLM 从对话消息中提取值得记住的事实、偏好、事件等。
 * @module ai-memory-extractor
 */

import type { Result } from '@h-ai/core'

import type { AIError } from '../ai-types.js'
import type { ChatMessage, LLMOperations } from '../llm/ai-llm-types.js'
import type { MemoryEntryInput, MemoryType } from './ai-memory-types.js'

import { core, err, ok } from '@h-ai/core'

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'

const logger = core.logger.child({ module: 'ai', scope: 'memory-extractor' })

// ─── 提取提示词 ───

const MEMORY_EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction assistant. Analyze the conversation and extract important information worth remembering for future interactions.

Extract items in the following categories:
- "fact": Factual information mentioned in the conversation
- "preference": User preferences, likes, dislikes, or habits
- "event": Important events, deadlines, or time-specific information
- "entity": Key people, organizations, projects, or concepts mentioned
- "instruction": Explicit user instructions or rules for future behavior

Return a JSON array of extracted memories. Each memory has:
- "content": a concise description of the memory (string, required)
- "type": one of "fact", "preference", "event", "entity", "instruction" (required)
- "importance": a float from 0.0 to 1.0 indicating how important this is to remember (required)

Rules:
- Only extract clearly stated information. Do NOT infer or guess.
- Be concise — each memory should be a single clear statement.
- Deduplicate: do not extract the same information twice.
- Rate importance based on likely future usefulness (0.3 = minor detail, 0.7 = moderately useful, 1.0 = critical).
- Return an empty array [] if no memories worth extracting are found.
- Return ONLY the JSON array, no markdown fences, no explanation.`

/**
 * 将对话消息格式化为文本
 */
function formatMessages(messages: ChatMessage[]): string {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const content = typeof m.content === 'string' ? m.content : '[multimodal content]'
      return `${m.role}: ${content}`
    })
    .join('\n')
}

/**
 * 从对话中提取记忆
 *
 * @param llm - LLM 操作接口
 * @param messages - 对话消息列表
 * @param options - 提取选项
 * @param options.types - 只提取指定类型
 * @param options.model - 指定提取用的模型
 * @param options.minImportance - 过滤低重要性条目
 * @param options.objectId - 所属主体 ID
 * @param options.systemPrompt - 自定义提取用的系统提示词
 * @returns 提取到的记忆输入列表
 */
export async function extractMemories(
  llm: LLMOperations,
  messages: ChatMessage[],
  options?: {
    types?: MemoryType[]
    model?: string
    minImportance?: number
    objectId?: string
    systemPrompt?: string
  },
): Promise<Result<MemoryEntryInput[], AIError>> {
  const conversationText = formatMessages(messages)
  if (!conversationText.trim()) {
    return ok([])
  }

  try {
    let userPrompt = conversationText
    if (options?.types && options.types.length > 0) {
      userPrompt += `\n\nOnly extract memories of these types: ${options.types.join(', ')}`
    }

    const chatResult = await llm.chat({
      model: options?.model,
      messages: [
        { role: 'system', content: options?.systemPrompt ?? MEMORY_EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
    })

    if (!chatResult.success) {
      logger.warn('Memory extraction LLM call failed', { error: chatResult.error })
      return err({
        code: AIErrorCode.MEMORY_EXTRACT_FAILED,
        message: aiM('ai_memoryExtractFailed', { params: { error: String(chatResult.error.message) } }),
        cause: chatResult.error,
      })
    }

    const content = chatResult.data.choices[0]?.message?.content ?? ''
    let entries = parseMemoryResponse(content)

    // 按 minImportance 过滤
    if (options?.minImportance && options.minImportance > 0) {
      entries = entries.filter(e => (e.importance ?? 0) >= options.minImportance!)
    }

    // 按类型过滤
    if (options?.types && options.types.length > 0) {
      const typeSet = new Set<MemoryType>(options.types)
      entries = entries.filter(e => typeSet.has(e.type))
    }

    // 附加 objectId
    if (options?.objectId) {
      entries = entries.map(e => ({ ...e, objectId: options.objectId }))
    }

    logger.debug('Memory extraction completed', { messageCount: messages.length, extractedCount: entries.length })
    return ok(entries)
  }
  catch (error) {
    logger.error('Memory extraction failed', { error })
    return err({
      code: AIErrorCode.MEMORY_EXTRACT_FAILED,
      message: aiM('ai_memoryExtractFailed', { params: { error: String(error) } }),
      cause: error,
    })
  }
}

// ─── 响应解析 ───

const VALID_MEMORY_TYPES = new Set<string>(['fact', 'preference', 'event', 'entity', 'instruction'])

/**
 * 解析 LLM 返回的记忆 JSON
 */
function parseMemoryResponse(content: string): MemoryEntryInput[] {
  let cleaned = content.trim()

  // 去除 markdown 代码围栏
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }

  try {
    const parsed = JSON.parse(cleaned) as unknown

    if (Array.isArray(parsed)) {
      return parsed.filter(isValidMemoryItem).map(normalizeMemoryItem)
    }

    if (typeof parsed === 'object' && parsed !== null && 'memories' in parsed) {
      const memories = (parsed as { memories: unknown }).memories
      if (Array.isArray(memories)) {
        return memories.filter(isValidMemoryItem).map(normalizeMemoryItem)
      }
    }

    logger.warn('Memory extraction returned unexpected format', { content: content.slice(0, 200) })
    return []
  }
  catch {
    logger.warn('Memory extraction returned invalid JSON', { content: content.slice(0, 200) })
    return []
  }
}

/**
 * 校验记忆结构
 */
function isValidMemoryItem(item: unknown): item is Record<string, unknown> {
  if (typeof item !== 'object' || item === null)
    return false
  const obj = item as Record<string, unknown>
  return typeof obj.content === 'string' && obj.content.length > 0
    && typeof obj.type === 'string'
}

/**
 * 标准化记忆条目
 */
function normalizeMemoryItem(item: Record<string, unknown>): MemoryEntryInput {
  const type = VALID_MEMORY_TYPES.has(item.type as string)
    ? item.type as MemoryType
    : 'fact'

  const importance = typeof item.importance === 'number'
    ? Math.max(0, Math.min(1, item.importance))
    : 0.5

  return {
    content: (item.content as string).trim(),
    type,
    importance,
  }
}
