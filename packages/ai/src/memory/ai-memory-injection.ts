/**
 * @h-ai/ai — Memory 注入共享实现
 *
 * 原生与 Mem0 后端共用同一套上下文注入行为，确保切换后端不改变消息结构。
 * @module ai-memory-injection
 */

import type { HaiResult } from '@h-ai/core'

import type { ChatMessage } from '../llm/ai-llm-types.js'
import type { MemoryAccessScope, MemoryEntry, MemoryInjectionOptions, MemoryRecallOptions } from './ai-memory-types.js'

import { core, err, ok } from '@h-ai/core'

import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'

const logger = core.logger.child({ module: 'ai', scope: 'memory' })

type RecallMemories = (query: string, options?: MemoryRecallOptions) => Promise<HaiResult<MemoryEntry[]>>

/**
 * 按 ID 访问单条记忆时的归属校验（native / Mem0 后端共用）。
 *
 * 返回 `true` 表示该记忆不属于调用主体 / 作用域，调用方应统一返回 `MEMORY_NOT_FOUND`；
 * `accessScope` 未传时不做校验（返回 `false`，向后兼容）。
 */
export function isMemoryAccessDenied(entry: MemoryEntry, accessScope?: MemoryAccessScope): boolean {
  if (!accessScope)
    return false
  if (entry.objectId !== accessScope.objectId)
    return true
  if (accessScope.scope) {
    if (!entry.scope)
      return true
    const entryScope = entry.scope as Record<string, unknown>
    return !Object.entries(accessScope.scope).every(([key, value]) => entryScope[key] === value)
  }
  return false
}

/** 从消息中提取最后一条用户文本 */
function extractQueryFromMessages(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role === 'user')
      return typeof message.content === 'string' ? message.content : ''
  }
  return ''
}

/** 将召回结果注入消息列表 */
export async function injectRelevantMemories(
  messages: ChatMessage[],
  options: MemoryInjectionOptions | undefined,
  recall: RecallMemories,
): Promise<HaiResult<ChatMessage[]>> {
  const topK = options?.topK ?? 5
  const position = options?.position ?? 'system'

  try {
    const query = extractQueryFromMessages(messages)
    if (!query)
      return ok([...messages])

    const recallResult = await recall(query, {
      topK,
      candidateMultiplier: options?.candidateMultiplier,
      objectId: options?.objectId,
      scope: options?.scope,
      types: options?.types,
      minImportance: options?.minImportance,
    })
    if (!recallResult.success) {
      return err(HaiAIError.MEMORY_ENRICH_FAILED, aiM('ai_memoryEnrichFailed', { params: { error: recallResult.error.message } }), recallResult.error)
    }

    if (recallResult.data.length === 0)
      return ok([...messages])

    let memoryText = recallResult.data
      .map((memory, index) => `[${index + 1}] (${memory.type}) ${memory.content}`)
      .join('\n')

    if (options?.maxTokens && options.maxTokens > 0) {
      const estimatedTokens = memoryText.length * 0.25
      if (estimatedTokens > options.maxTokens) {
        const maxChars = Math.floor(options.maxTokens / 0.25)
        memoryText = `${memoryText.slice(0, maxChars)}...`
      }
    }

    const memoryBlock = `\n\n--- Relevant Memories ---\n${memoryText}\n--- End Memories ---`
    const result = [...messages]

    if (position === 'system') {
      const systemIndex = result.findIndex(message => message.role === 'system')
      if (systemIndex >= 0) {
        const systemMessage = result[systemIndex]
        result[systemIndex] = {
          ...systemMessage,
          content: (systemMessage as { content: string }).content + memoryBlock,
        }
      }
      else {
        result.unshift({
          role: 'system',
          content: `You have the following relevant memories from previous interactions:${memoryBlock}`,
        })
      }
    }
    else {
      let lastUserIndex = -1
      for (let index = result.length - 1; index >= 0; index--) {
        if (result[index].role === 'user') {
          lastUserIndex = index
          break
        }
      }
      if (lastUserIndex > 0) {
        result.splice(lastUserIndex, 0, {
          role: 'system',
          content: `Relevant memories:${memoryBlock}`,
        })
      }
    }

    logger.trace('Memories enriched', { count: recallResult.data.length, position })
    return ok(result)
  }
  catch (error) {
    logger.error('Memory enrichment failed', { error })
    return err(HaiAIError.MEMORY_ENRICH_FAILED, aiM('ai_memoryEnrichFailed', { params: { error: String(error) } }), error)
  }
}
