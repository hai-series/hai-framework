/**
 * @h-ai/ai — Memory 子功能实现
 *
 * 编排记忆的提取、存储、检索与注入。
 * @module ai-memory-functions
 */

import type { Result } from '@h-ai/core'

import type { MemoryConfig } from '../ai-config.js'
import type { AIError } from '../ai-types.js'
import type { EmbeddingOperations } from '../embedding/ai-embedding-types.js'
import type { ChatMessage, LLMOperations } from '../llm/ai-llm-types.js'
import type {
  MemoryClearOptions,
  MemoryEntry,
  MemoryEntryInput,
  MemoryExtractOptions,
  MemoryInjectOptions,
  MemoryListOptions,
  MemoryOperations,
  MemoryRecallOptions,
} from './ai-memory-types.js'

import { core, err, ok } from '@h-ai/core'

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'
import { extractMemories } from './ai-memory-extractor.js'
import { InMemoryStore } from './ai-memory-store.js'

const logger = core.logger.child({ module: 'ai', scope: 'memory' })

/**
 * 余弦相似度
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length)
    return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/**
 * 从消息中提取查询文本（取最后一条用户消息）
 */
function extractQueryFromMessages(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'user') {
      return typeof msg.content === 'string' ? msg.content : ''
    }
  }
  return ''
}

/**
 * 创建 Memory 操作接口
 *
 * @param config - Memory 配置
 * @param llm - LLM 操作接口（用于提取记忆）
 * @param embedding - Embedding 操作接口（用于向量化 + 相似度检索）
 * @returns MemoryOperations 实例
 */
export function createMemoryOperations(
  config: MemoryConfig,
  llm: LLMOperations,
  embedding: EmbeddingOperations | null,
): MemoryOperations {
  const store = new InMemoryStore(config.maxEntries)

  /**
   * 为文本计算 embedding 向量（如果 embedding 可用）
   */
  async function computeVector(text: string): Promise<number[] | undefined> {
    if (!config.embeddingEnabled || !embedding)
      return undefined

    const result = await embedding.embedText(text)
    if (result.success)
      return result.data

    logger.warn('Failed to compute embedding for memory', { error: result.error })
    return undefined
  }

  return {
    async extract(messages: ChatMessage[], options?: MemoryExtractOptions): Promise<Result<MemoryEntry[], AIError>> {
      logger.info('Extracting memories from conversation', { messageCount: messages.length })

      try {
        const extractResult = await extractMemories(llm, messages, {
          types: options?.types,
          model: options?.model ?? config.extractModel,
          minImportance: options?.minImportance,
          source: options?.source,
        })

        if (!extractResult.success)
          return extractResult

        // 为每条记忆计算 embedding 并存储
        const entries: MemoryEntry[] = []
        for (const input of extractResult.data) {
          const vector = await computeVector(input.content)
          const entry = store.add(input, vector)
          entries.push(entry)
        }

        logger.info('Memories extracted and stored', { count: entries.length })
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
    },

    async add(entry: MemoryEntryInput): Promise<Result<MemoryEntry, AIError>> {
      try {
        const vector = await computeVector(entry.content)
        const stored = store.add(entry, vector)
        logger.debug('Memory added', { id: stored.id, type: stored.type })
        return ok(stored)
      }
      catch (error) {
        logger.error('Memory add failed', { error })
        return err({
          code: AIErrorCode.MEMORY_STORE_FAILED,
          message: aiM('ai_memoryStoreFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async recall(query: string, options?: MemoryRecallOptions): Promise<Result<MemoryEntry[], AIError>> {
      const topK = options?.topK ?? config.defaultTopK
      const recencyWeight = options?.recencyWeight ?? (1 - config.recencyDecay)

      logger.debug('Recalling memories', { query: query.slice(0, 100), topK })

      try {
        // 获取候选记忆
        let candidates = store.list({
          types: options?.types,
        })

        // 按 minImportance 过滤
        if (options?.minImportance && options.minImportance > 0) {
          candidates = candidates.filter(e => e.importance >= options.minImportance!)
        }

        if (candidates.length === 0) {
          return ok([])
        }

        // 计算综合分数
        let queryVector: number[] | undefined
        if (config.embeddingEnabled && embedding) {
          const embedResult = await embedding.embedText(query)
          if (embedResult.success) {
            queryVector = embedResult.data
          }
        }

        const now = Date.now()
        const maxAge = 7 * 24 * 60 * 60 * 1000

        const scored = candidates.map((entry) => {
          // 向量相似度
          let similarity = 0
          if (queryVector && entry.vector) {
            similarity = cosineSimilarity(queryVector, entry.vector)
          }
          else {
            // 无向量时使用关键词匹配
            const queryLower = query.toLowerCase()
            const contentLower = entry.content.toLowerCase()
            similarity = contentLower.includes(queryLower) ? 0.8 : 0
          }

          // 时间衰减
          const age = now - entry.createdAt
          const recency = Math.max(0, 1 - age / maxAge)

          // 综合分数 = 相似度 * (1 - recencyWeight) + 重要性 * 0.2 + 时间 * recencyWeight
          const score = similarity * (1 - recencyWeight) * 0.8
            + entry.importance * 0.2
            + recency * recencyWeight

          return { entry, score }
        })

        // 排序并截取
        scored.sort((a, b) => b.score - a.score)
        const results = scored.slice(0, topK).map(({ entry }) => {
          // 更新访问统计
          entry.lastAccessedAt = now
          entry.accessCount++
          return entry
        })

        logger.debug('Memory recall completed', { query: query.slice(0, 50), resultCount: results.length })
        return ok(results)
      }
      catch (error) {
        logger.error('Memory recall failed', { error })
        return err({
          code: AIErrorCode.MEMORY_RECALL_FAILED,
          message: aiM('ai_memoryRecallFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async inject(messages: ChatMessage[], options?: MemoryInjectOptions): Promise<Result<ChatMessage[], AIError>> {
      const topK = options?.topK ?? 5
      const position = options?.position ?? 'system'

      try {
        // 提取查询文本
        const query = extractQueryFromMessages(messages)
        if (!query) {
          return ok([...messages])
        }

        // 检索相关记忆
        const recallResult = await this.recall(query, { topK })
        if (!recallResult.success) {
          return err({
            code: AIErrorCode.MEMORY_INJECT_FAILED,
            message: aiM('ai_memoryInjectFailed', { params: { error: recallResult.error.message } }),
            cause: recallResult.error,
          })
        }

        const memories = recallResult.data
        if (memories.length === 0) {
          return ok([...messages])
        }

        // 格式化记忆文本
        let memoryText = memories
          .map((m, i) => `[${i + 1}] (${m.type}) ${m.content}`)
          .join('\n')

        // 按 maxTokens 截断
        if (options?.maxTokens && options.maxTokens > 0) {
          const estimatedTokens = memoryText.length * 0.25
          if (estimatedTokens > options.maxTokens) {
            const maxChars = Math.floor(options.maxTokens / 0.25)
            memoryText = `${memoryText.slice(0, maxChars)}...`
          }
        }

        const memoryBlock = `\n\n--- Relevant Memories ---\n${memoryText}\n--- End Memories ---`

        // 注入到消息列表
        const result = [...messages]

        if (position === 'system') {
          // 追加到 system 消息末尾，如果没有 system 消息则创建一个
          const systemIdx = result.findIndex(m => m.role === 'system')
          if (systemIdx >= 0) {
            const systemMsg = result[systemIdx]
            result[systemIdx] = {
              ...systemMsg,
              content: (systemMsg as { content: string }).content + memoryBlock,
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
          // 插入在最后一条用户消息之前
          let lastUserIdx = -1
          for (let i = result.length - 1; i >= 0; i--) {
            if (result[i].role === 'user') {
              lastUserIdx = i
              break
            }
          }
          if (lastUserIdx > 0) {
            result.splice(lastUserIdx, 0, {
              role: 'system',
              content: `Relevant memories:${memoryBlock}`,
            })
          }
        }

        logger.debug('Memories injected', { count: memories.length, position })
        return ok(result)
      }
      catch (error) {
        logger.error('Memory injection failed', { error })
        return err({
          code: AIErrorCode.MEMORY_INJECT_FAILED,
          message: aiM('ai_memoryInjectFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async remove(memoryId: string): Promise<Result<void, AIError>> {
      const removed = store.remove(memoryId)
      if (!removed) {
        return err({
          code: AIErrorCode.MEMORY_NOT_FOUND,
          message: aiM('ai_memoryNotFound', { params: { id: memoryId } }),
        })
      }
      logger.debug('Memory removed', { id: memoryId })
      return ok(undefined)
    },

    async list(options?: MemoryListOptions): Promise<Result<MemoryEntry[], AIError>> {
      return ok(store.list(options))
    },

    async clear(options?: MemoryClearOptions): Promise<Result<void, AIError>> {
      store.clear(options)
      logger.info('Memories cleared', { options })
      return ok(undefined)
    },
  }
}
