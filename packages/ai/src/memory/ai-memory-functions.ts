/**
 * @h-ai/ai — Memory 子功能实现
 *
 * 编排记忆的提取、存储、检索与注入。基于 AIStore + AIVectorStore 抽象，
 * 根据配置自动选择内存或持久化存储后端。
 * @module ai-memory-functions
 */

import type { Result } from '@h-ai/core'

import type { MemoryConfig } from '../ai-config.js'
import type { AIError } from '../ai-types.js'
import type { EmbeddingOperations } from '../embedding/ai-embedding-types.js'
import type { ChatMessage, LLMOperations } from '../llm/ai-llm-types.js'
import type { AIStore, AIVectorStore, StorePage, WhereClause } from '../store/ai-store-types.js'
import type {
  MemoryClearOptions,
  MemoryEntry,
  MemoryEntryInput,
  MemoryExtractOptions,
  MemoryInjectionOptions,
  MemoryListOptions,
  MemoryListPageOptions,
  MemoryOperations,
  MemoryRecallOptions,
  MemoryUpdateInput,
} from './ai-memory-types.js'

import { core, err, ok } from '@h-ai/core'

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'
import { extractMemories } from './ai-memory-extractor.js'

const logger = core.logger.child({ module: 'ai', scope: 'memory' })

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

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
 * @param store - 记忆条目存储
 * @param vectorStore - 向量存储（用于相似度检索）
 * @returns MemoryOperations 实例
 */
/**
 * 创建 Memory 操作接口
 *
 * 提供基于 LLM 的记忆提取并持久化、基于向量相似度的记忆检索，并支持将相关记忆注入消息得到于 LLM 上下文。
 *
 * @param config - 记忆配置（maxEntries、recencyDecay、systemPrompt 等）
 * @param llm - LLM 操作接口（用于记忆提取）
 * @param embedding - Embedding 接口（可为 null，为 null 时働用关键词回退）
 * @param store - 记忆条目持久化存储
 * @param vectorStore - 向量库存储（用于语义检索）
 * @returns MemoryOperations 实例
 */
export function createMemoryOperations(
  config: MemoryConfig,
  llm: LLMOperations,
  embedding: EmbeddingOperations | null,
  store: AIStore<MemoryEntry>,
  vectorStore: AIVectorStore,
): MemoryOperations {
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

  /**
   * 淘汰低优先级条目（当超过 maxEntries 时）
   */
  async function evictIfNeeded(): Promise<void> {
    const total = await store.count()
    if (total < config.maxEntries)
      return

    const all = await store.query({ orderBy: { field: 'createdAt', direction: 'asc' }, limit: total })
    if (all.length === 0)
      return

    const now = Date.now()
    const maxAge = 7 * 24 * 60 * 60 * 1000

    let lowestScore = Infinity
    let lowestId: string | null = null

    for (const entry of all) {
      const age = now - entry.createdAt
      const recency = Math.max(0, 1 - age / maxAge)
      const score = entry.importance * 0.7 + recency * 0.3
      if (score < lowestScore) {
        lowestScore = score
        lowestId = entry.id
      }
    }

    if (lowestId) {
      await store.remove(lowestId)
      await vectorStore.remove(lowestId)
    }
  }

  /**
   * 持久化一条记忆条目
   */
  async function saveEntry(input: MemoryEntryInput, vector?: number[]): Promise<MemoryEntry> {
    await evictIfNeeded()

    const now = Date.now()
    const entry: MemoryEntry = {
      id: generateId(),
      content: input.content,
      type: input.type,
      importance: input.importance ?? 0.5,
      objectId: input.objectId,
      metadata: input.metadata,
      vector,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    }

    await store.save(entry.id, entry, { objectId: entry.objectId })

    if (vector) {
      await vectorStore.upsert(entry.id, vector, {
        objectId: entry.objectId,
        type: entry.type,
      })
    }

    return entry
  }

  return {
    /**
     * 从对话消息中提取记忆并存储
     *
     * 调用 LLM 分析对话内容，提取具有持久化价值的记忆条目并写入存储。
     * 每条记忆提取后会同步计算向量（如已启用 embedding）。
     *
     * @param messages - 待分析的对话消息列表
     * @param options - 可选（记忆类型过滤、最小重要性阈值、自定义 model 等）
     * @returns `ok(MemoryEntry[])` 新写入的记忆列表；LLM 调用失败时返回 `MEMORY_EXTRACT_FAILED`
     */
    async extract(messages: ChatMessage[], options?: MemoryExtractOptions): Promise<Result<MemoryEntry[], AIError>> {
      logger.trace('Extracting memories from conversation', { messageCount: messages.length })

      try {
        const extractResult = await extractMemories(llm, messages, {
          types: options?.types,
          model: options?.model,
          minImportance: options?.minImportance,
          objectId: options?.objectId,
          systemPrompt: config.systemPrompt,
        })

        if (!extractResult.success)
          return extractResult

        const entries: MemoryEntry[] = []
        for (const input of extractResult.data) {
          const vector = await computeVector(input.content)
          const entryInput: MemoryEntryInput = { ...input, objectId: input.objectId ?? options?.objectId }
          const entry = await saveEntry(entryInput, vector)
          entries.push(entry)
        }

        logger.trace('Memories extracted and stored', { count: entries.length })
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

    /**
     * 手动添加一条记忆
     *
     * 适用于外部直接写入记忆（非 LLM 提取）的场景。
     * 超过 maxEntries 时会自动淡汰优先级最低的条目。
     *
     * @param entry - 记忆条目输入（content、type、importance 等）
     * @returns `ok(MemoryEntry)` 含完整字段（id、时间戳等）；存储失败时返回 `MEMORY_STORE_FAILED`
     */
    async add(entry: MemoryEntryInput): Promise<Result<MemoryEntry, AIError>> {
      try {
        const vector = await computeVector(entry.content)
        const stored = await saveEntry(entry, vector)
        logger.trace('Memory added', { id: stored.id, type: stored.type })
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

    /**
     * 更新一条已有记忆
     */
    async update(memoryId: string, updates: MemoryUpdateInput): Promise<Result<MemoryEntry, AIError>> {
      try {
        const existing = await store.get(memoryId)
        if (!existing) {
          return err({
            code: AIErrorCode.MEMORY_NOT_FOUND,
            message: aiM('ai_memoryNotFound', { params: { id: memoryId } }),
          })
        }

        if (updates.content !== undefined)
          existing.content = updates.content
        if (updates.type !== undefined)
          existing.type = updates.type
        if (updates.importance !== undefined)
          existing.importance = updates.importance
        if (updates.metadata !== undefined)
          existing.metadata = updates.metadata

        // 内容变更时重新计算向量
        if (updates.content !== undefined) {
          const vector = await computeVector(updates.content)
          existing.vector = vector
          if (vector) {
            await vectorStore.upsert(memoryId, vector, {
              objectId: existing.objectId,
              type: existing.type,
            })
          }
        }

        await store.save(memoryId, existing, { objectId: existing.objectId })
        logger.trace('Memory updated', { id: memoryId })
        return ok(existing)
      }
      catch (error) {
        logger.error('Memory update failed', { id: memoryId, error })
        return err({
          code: AIErrorCode.MEMORY_STORE_FAILED,
          message: aiM('ai_memoryStoreFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    /**
     * 根据 ID 获取一条记忆并更新访问统计
     *
     * 访问成功后自动更新 `lastAccessedAt` 和 `accessCount`。
     *
     * @param memoryId - 记忆条目的唯一 ID
     * @returns `ok(MemoryEntry)` 操作成功；ID 不存在时返回 `MEMORY_NOT_FOUND`
     */
    async get(memoryId: string): Promise<Result<MemoryEntry, AIError>> {
      const entry = await store.get(memoryId)
      if (!entry) {
        return err({
          code: AIErrorCode.MEMORY_NOT_FOUND,
          message: aiM('ai_memoryNotFound', { params: { id: memoryId } }),
        })
      }
      entry.lastAccessedAt = Date.now()
      entry.accessCount++
      await store.save(memoryId, entry, { objectId: entry.objectId })
      return ok(entry)
    },

    /**
     * 根据查询文本检索最相关的记忆条目
     *
     * 分三阶段执行：
     * 1. 筛选候选集 — 从 store 中检索并按 objectId / type / minImportance 过滤
     * 2. 计算综合得分 — 融合向量相似度、重要性、时间新鲜度三个维度
     * 3. 排序截取 — 按得分降序，返回前 topK 条并更新访问统计
     */
    async recall(query: string, options?: MemoryRecallOptions): Promise<Result<MemoryEntry[], AIError>> {
      const topK = options?.topK ?? config.defaultTopK
      const recencyWeight = options?.recencyWeight ?? (1 - config.recencyDecay)

      logger.trace('Recalling memories', { query: query.slice(0, 100), topK })

      try {
        // ── 第一阶段：筛选候选集 ──
        const where: WhereClause<MemoryEntry> = {}

        // type 过滤：单值用等值匹配，多值用 $in 操作符
        const types = options?.types
        if (types && types.length === 1) {
          where.type = types[0]
        }
        else if (types && types.length > 1) {
          where.type = { $in: types }
        }

        // minImportance 用 $gte 操作符下推
        if (options?.minImportance && options.minImportance > 0) {
          where.importance = { $gte: options.minImportance }
        }

        const candidates = await store.query({
          objectId: options?.objectId,
          where: Object.keys(where).length > 0 ? where : undefined,
        })

        if (candidates.length === 0) {
          return ok([])
        }

        // ── 第二阶段：计算每条记忆的综合得分 ──

        // 2a. 将查询文本转为向量（如启用 embedding）
        let queryVector: number[] | undefined
        if (config.embeddingEnabled && embedding) {
          const embedResult = await embedding.embedText(query)
          if (embedResult.success) {
            queryVector = embedResult.data
          }
        }

        // 2b. 从向量库批量获取预计算的相似度得分
        const vectorScores = new Map<string, number>()
        if (queryVector) {
          const vectorResults = await vectorStore.search(queryVector, {
            topK: topK * 3,
            filter: options?.objectId ? { objectId: options.objectId } : undefined,
          })
          for (const r of vectorResults) {
            vectorScores.set(r.id, r.score)
          }
        }

        const now = Date.now()
        /** 7 天为时间衰减的基准周期 */
        const maxAge = 7 * 24 * 60 * 60 * 1000

        // 2c. 为每条候选计算综合得分
        const scored = candidates.map((entry) => {
          // 向量相似度：优先用向量库预计算得分 → 实时计算余弦相似度 → 关键词匹配回退
          let similarity = vectorScores.get(entry.id) ?? 0
          if (!similarity && queryVector && entry.vector) {
            similarity = cosineSimilarity(queryVector, entry.vector)
          }
          else if (!similarity) {
            // 无向量时通过关键词包含关系进行粗略匹配
            const queryLower = query.toLowerCase()
            const contentLower = entry.content.toLowerCase()
            similarity = contentLower.includes(queryLower) ? 0.8 : 0
          }

          // 时间新鲜度：创建时间越近越接近 1，超过 maxAge 后为 0
          const age = now - entry.createdAt
          const recency = Math.max(0, 1 - age / maxAge)

          // 语义相关度 = 向量相似度 (80%) + 重要性 (20%)
          const relevance = similarity * 0.8 + entry.importance * 0.2

          // 综合得分 = 相关度 × (1 - 时间权重) + 新鲜度 × 时间权重
          // recencyWeight = 0 → 纯相关度排序；recencyWeight = 1 → 纯时间排序
          const score = relevance * (1 - recencyWeight) + recency * recencyWeight

          return { entry, score }
        })

        // ── 第三阶段：排序截取 + 更新访问统计 ──
        scored.sort((a, b) => b.score - a.score)
        const results: MemoryEntry[] = []
        for (const { entry } of scored.slice(0, topK)) {
          entry.lastAccessedAt = now
          entry.accessCount++
          await store.save(entry.id, entry, { objectId: entry.objectId })
          results.push(entry)
        }

        logger.trace('Memory recall completed', { query: query.slice(0, 50), resultCount: results.length })
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

    /**
     * 将检索到的相关记忆注入消息列表
     *
     * 工作流程：
     * 1. 从最后一条用户消息提取查询文本
     * 2. 调用 recall 检索 topK 条相关记忆
     * 3. 将记忆格式化为编号列表（如 [1] (preference) ...）
     * 4. 按 position 注入：
     *    - 'system'：追加到现有 system 消息末尾（无则插入新 system 消息）
     *    - 'before-last'：在最后一条用户消息之前插入 system 消息
     */
    async injectMemories(messages: ChatMessage[], options?: MemoryInjectionOptions): Promise<Result<ChatMessage[], AIError>> {
      const topK = options?.topK ?? 5
      const position = options?.position ?? 'system'

      try {
        const query = extractQueryFromMessages(messages)
        if (!query) {
          return ok([...messages])
        }

        const recallResult = await this.recall(query, { topK, objectId: options?.objectId })
        if (!recallResult.success) {
          return err({
            code: AIErrorCode.MEMORY_ENRICH_FAILED,
            message: aiM('ai_memoryEnrichFailed', { params: { error: recallResult.error.message } }),
            cause: recallResult.error,
          })
        }

        const memories = recallResult.data
        if (memories.length === 0) {
          return ok([...messages])
        }

        let memoryText = memories
          .map((m, i) => `[${i + 1}] (${m.type}) ${m.content}`)
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

        logger.trace('Memories enriched', { count: memories.length, position })
        return ok(result)
      }
      catch (error) {
        logger.error('Memory enrichment failed', { error })
        return err({
          code: AIErrorCode.MEMORY_ENRICH_FAILED,
          message: aiM('ai_memoryEnrichFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    /**
     * 根据 ID 删除一条记忆
     *
     * 同时从关系型存储和向量库中删除。
     *
     * @param memoryId - 记忆条目的唯一 ID
     * @returns `ok(undefined)` 删除成功；ID 不存在时返回 `MEMORY_NOT_FOUND`
     */
    async remove(memoryId: string): Promise<Result<void, AIError>> {
      const removed = await store.remove(memoryId)
      if (!removed) {
        return err({
          code: AIErrorCode.MEMORY_NOT_FOUND,
          message: aiM('ai_memoryNotFound', { params: { id: memoryId } }),
        })
      }
      await vectorStore.remove(memoryId)
      logger.trace('Memory removed', { id: memoryId })
      return ok(undefined)
    },

    /**
     * 列出记忆条目（不分页）
     *
     * @param options - 可选（objectId、type 过滤、limit 限制数量）
     * @returns `ok(MemoryEntry[])` 按创建时间降序排列的记忆列表
     */
    async list(options?: MemoryListOptions): Promise<Result<MemoryEntry[], AIError>> {
      const where: WhereClause<MemoryEntry> = {}
      if (options?.types && options.types.length === 1)
        where.type = options.types[0]
      else if (options?.types && options.types.length > 1)
        where.type = { $in: options.types }

      const results = await store.query({
        objectId: options?.objectId,
        where: Object.keys(where).length > 0 ? where : undefined,
        orderBy: { field: 'createdAt', direction: 'desc' },
        limit: options?.limit,
      })

      return ok(results)
    },

    /**
     * 分页列出记忆条目
     *
     * @param options - 可选（objectId、type 过滤、offset / limit 分页参数）
     * @returns `ok(StorePage<MemoryEntry>)` 含当前页数据与总数
     */
    async listPage(options?: MemoryListPageOptions): Promise<Result<StorePage<MemoryEntry>, AIError>> {
      const where: WhereClause<MemoryEntry> = {}
      if (options?.types && options.types.length === 1)
        where.type = options.types[0]
      else if (options?.types && options.types.length > 1)
        where.type = { $in: options.types }

      const page = await store.queryPage(
        {
          objectId: options?.objectId,
          where: Object.keys(where).length > 0 ? where : undefined,
          orderBy: { field: 'createdAt', direction: 'desc' },
        },
        {
          offset: options?.offset ?? 0,
          limit: options?.limit ?? 20,
        },
      )

      return ok(page)
    },

    /**
     * 清除记忆条目
     *
     * - 不传任何 options 时清除全部记忆（包括向量库）。
     * - 传入 objectId 或 types 时仅删除匹配的条目。
     *
     * @param options - 可选范围过滤（objectId 或 types 任意组合）
     * @returns `ok(undefined)` 操作成功
     */
    async clear(options?: MemoryClearOptions): Promise<Result<void, AIError>> {
      if (!options?.types && !options?.objectId) {
        await store.clear()
        await vectorStore.clear()
      }
      else {
        const where: WhereClause<MemoryEntry> = {}
        if (options.types && options.types.length === 1)
          where.type = options.types[0]
        else if (options.types && options.types.length > 1)
          where.type = { $in: options.types }

        const toRemove = await store.query({
          objectId: options.objectId,
          where: Object.keys(where).length > 0 ? where : undefined,
        })

        for (const entry of toRemove) {
          await store.remove(entry.id)
          await vectorStore.remove(entry.id)
        }
      }
      logger.debug('Memories cleared', { options })
      return ok(undefined)
    },
  }
}
