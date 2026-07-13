/**
 * @h-ai/ai — 原生记忆 Provider（hai 自研引擎）
 *
 * 基于 AIRelStore + AIVectorStore 抽象，复用 vecdb / reldb / LLM / Embedding 组件，
 * 提供记忆的提取、存储、检索与注入。`extract` 采用共享的 mem0 式批量合并
 * （ADD/UPDATE/DELETE/NONE），跨条去重并增量更新。
 *
 * 与 mem0 OSS Provider（`ai-memory-provider-mem0-oss.ts`）并列，二者实现同一
 * `MemoryOperations` 接口，通过 `memory.provider` 配置切换。
 * @module ai-memory-provider-native
 */

import type { HaiResult } from '@h-ai/core'

import type { MemoryConfig } from '../../ai-config.js'

import type { EmbeddingOperations } from '../../embedding/ai-embedding-types.js'
import type { ChatMessage, LLMOperations } from '../../llm/ai-llm-types.js'
import type { AIRelStore, AIVectorStore, StorePage, WhereClause } from '../../store/ai-store-types.js'
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
} from '../ai-memory-types.js'

import { core, err, ok } from '@h-ai/core'

import { aiM } from '../../ai-i18n.js'
import { HaiAIError } from '../../ai-types.js'
import { extractAndConsolidate } from '../ai-memory-consolidation.js'
import { injectRelevantMemories } from '../ai-memory-injection.js'

const logger = core.logger.child({ module: 'ai', scope: 'memory-native' })

/** 记忆淘汰的时间窗口：超过 7 天的记忆 recency 分量衰减为 0。 */
const EVICTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 生成记忆条目唯一 ID
 *
 * 形如 `mem_<毫秒时间戳>_<随机后缀>`，保证同一毫秒内多次写入也不冲突。
 */
function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 计算两个等长向量的余弦相似度
 *
 * 长度不一致或任一向量为零向量时返回 0（视为不相关），作为向量检索的回退度量。
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
 * 判断记忆条目是否匹配指定的业务作用域
 *
 * scope 存放在 JSON 列中，未建立索引，因此匹配在内存中完成：
 * 要求 scope 的每个 key-value 都与条目的 scope 严格相等；条目无 scope 时不匹配
 * （指定 scope 的查询不应召回全局记忆）。
 *
 * @param entry - 记忆条目
 * @param scope - 期望匹配的作用域（key-value 全部满足才算命中）
 */
function matchScope(entry: MemoryEntry, scope: Record<string, unknown>): boolean {
  if (!entry.scope)
    return false
  return Object.entries(scope).every(([k, v]) => entry.scope![k] === v)
}

/**
 * 创建原生 Memory 操作接口
 *
 * 提供基于 LLM 的记忆提取并持久化、基于向量相似度的记忆检索，并支持将相关记忆
 * 注入消息用于 LLM 上下文。
 *
 * @param config - 记忆配置（maxEntriesPerObject / maxEntriesGlobal、recencyDecay、systemPrompt 等）
 * @param llm - LLM 操作接口（用于记忆提取）
 * @param embedding - Embedding 接口（可为 null，为 null 时使用关键词回退）
 * @param store - 记忆条目持久化存储
 * @param vectorStore - 向量库存储（用于语义检索）
 * @returns MemoryOperations 实例
 */
export function createNativeMemoryOperations(
  config: MemoryConfig,
  llm: LLMOperations,
  embedding: EmbeddingOperations | null,
  store: AIRelStore<MemoryEntry>,
  vectorStore: AIVectorStore,
): MemoryOperations {
  /**
   * 为文本计算 embedding 向量（embedding 不可用或关闭时返回 undefined）
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
   * 从给定候选集中淘汰优先级最低的一条（importance 0.7 + recency 0.3 加权最小者）
   *
   * @param candidates - 参与淘汰评估的候选条目（通常按 objectId 或全局筛出）
   */
  async function evictLowest(candidates: MemoryEntry[]): Promise<void> {
    if (candidates.length === 0)
      return

    const now = Date.now()
    let lowestScore = Infinity
    let lowestId: string | null = null

    for (const entry of candidates) {
      const age = now - entry.createdAt
      const recency = Math.max(0, 1 - age / EVICTION_MAX_AGE_MS)
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
   * 按需淘汰记忆条目，保障多用户配额隔离
   *
   * 分两级触发：
   * 1. 单主体配额（maxEntriesPerObject）：仅在传入 objectId 时生效，只统计并淘汰
   *    该主体自身的条目，避免用户 A 大量写入淘汰掉用户 B 的记忆。
   * 2. 全局配额（maxEntriesGlobal）：跨所有主体的总量保护，超限时淘汰全局最低优先级条目。
   *
   * @param objectId - 即将写入条目的所属主体（undefined 表示全局记忆，仅受全局配额约束）
   */
  async function evictIfNeeded(objectId?: string): Promise<void> {
    // 全局总量保护
    const globalTotal = await store.count()
    if (globalTotal >= config.maxEntriesGlobal) {
      const all = await store.query({ orderBy: { field: 'createdAt', direction: 'asc' }, limit: globalTotal })
      await evictLowest(all)
    }

    // 单主体配额：仅对具名主体生效（undefined 时 store 不会按 object_id 过滤，会误统计全局）
    if (objectId) {
      const objectTotal = await store.count({ objectId })
      if (objectTotal >= config.maxEntriesPerObject) {
        const objectEntries = await store.query({ objectId, orderBy: { field: 'createdAt', direction: 'asc' }, limit: objectTotal })
        await evictLowest(objectEntries)
      }
    }
  }

  /**
   * 持久化一条记忆条目（含向量 upsert），写入前按主体配额淘汰
   */
  async function saveEntry(input: MemoryEntryInput, vector?: number[]): Promise<MemoryEntry> {
    await evictIfNeeded(input.objectId)

    const now = Date.now()
    const entry: MemoryEntry = {
      id: generateId(),
      content: input.content,
      type: input.type,
      importance: input.importance ?? 0.5,
      objectId: input.objectId,
      scope: input.scope,
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

  /**
   * 更新一条记忆的任意字段（content / type / importance / metadata），
   * content 变更时重算向量并同步向量库。
   */
  async function updateEntry(memoryId: string, updates: MemoryUpdateInput): Promise<HaiResult<MemoryEntry>> {
    try {
      const existing = await store.get(memoryId)
      if (!existing) {
        return err(HaiAIError.MEMORY_NOT_FOUND, aiM('ai_memoryNotFound', { params: { id: memoryId } }))
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
      return err(HaiAIError.MEMORY_STORE_FAILED, aiM('ai_memoryStoreFailed', { params: { error: String(error) } }), error)
    }
  }

  /**
   * 检索最相关的记忆条目（内部实现，供 recall / extract / injectMemories 共用）
   *
   * 三阶段：候选筛选（objectId / type / minImportance / scope）→ 综合打分
   * （向量相似度 + 重要性 + 时间新鲜度）→ 排序截取 topK。
   *
   * @param query - 查询文本
   * @param options - 检索选项（objectId / type / minImportance / scope / topK 等）
   * @param updateAccessStats - 是否更新命中条目的访问统计（recall 为 true，提取阶段为 false）
   */
  async function recallEntries(
    query: string,
    options?: MemoryRecallOptions,
    updateAccessStats = true,
  ): Promise<HaiResult<MemoryEntry[]>> {
    const topK = options?.topK ?? config.defaultTopK
    const recencyWeight = options?.recencyWeight ?? (1 - config.recencyDecay)

    logger.trace('Recalling memories', { query: query.slice(0, 100), topK, updateAccessStats })

    try {
      const where: WhereClause<MemoryEntry> = {}

      const types = options?.types
      if (types && types.length === 1) {
        where.type = types[0]
      }
      else if (types && types.length > 1) {
        where.type = { $in: types }
      }

      if (options?.minImportance && options.minImportance > 0) {
        where.importance = { $gte: options.minImportance }
      }

      const allCandidates = await store.query({
        objectId: options?.objectId,
        where: Object.keys(where).length > 0 ? where : undefined,
      })

      // scope 过滤在内存中完成：指定 scope 时 key-value 严格匹配，不纳入全局记忆（scope 为 null/undefined）
      const candidates = options?.scope
        ? allCandidates.filter(e => matchScope(e, options.scope!))
        : allCandidates

      if (candidates.length === 0) {
        return ok([])
      }

      let queryVector: number[] | undefined
      if (config.embeddingEnabled && embedding) {
        const embedResult = await embedding.embedText(query)
        if (embedResult.success) {
          queryVector = embedResult.data
        }
      }

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

      const scored = candidates.map((entry) => {
        let similarity = vectorScores.get(entry.id) ?? 0
        if (!similarity && queryVector && entry.vector) {
          similarity = cosineSimilarity(queryVector, entry.vector)
        }
        else if (!similarity) {
          const queryLower = query.toLowerCase()
          const contentLower = entry.content.toLowerCase()
          similarity = contentLower.includes(queryLower) ? 0.8 : 0
        }

        const age = now - entry.createdAt
        const recency = Math.max(0, 1 - age / EVICTION_MAX_AGE_MS)
        const relevance = similarity * 0.8 + entry.importance * 0.2
        const score = relevance * (1 - recencyWeight) + recency * recencyWeight

        return { entry, score }
      })

      scored.sort((a, b) => b.score - a.score)
      const results: MemoryEntry[] = []
      for (const { entry } of scored.slice(0, topK)) {
        if (updateAccessStats) {
          entry.lastAccessedAt = now
          entry.accessCount++
          await store.save(entry.id, entry, { objectId: entry.objectId })
          results.push(entry)
          continue
        }

        results.push({ ...entry })
      }

      logger.trace('Memory recall completed', { query: query.slice(0, 50), resultCount: results.length, updateAccessStats })
      return ok(results)
    }
    catch (error) {
      logger.error('Memory recall failed', { error })
      return err(HaiAIError.MEMORY_RECALL_FAILED, aiM('ai_memoryRecallFailed', { params: { error: String(error) } }), error)
    }
  }

  const operations: MemoryOperations = {
    /**
     * 从对话消息中提取记忆并合并存储（Mem0 式增量更新）
     *
     * 抽取事实 → 检索相关记忆 → 单次 LLM 批量合并 → 应用 ADD/UPDATE/DELETE/NONE。
     * 相比逐条写回，能跨条去重、增量更新并删除被矛盾的旧记忆。
     *
     * @param messages - 待分析的对话消息列表
     * @param options - 可选（记忆类型过滤、最小重要性阈值、自定义 model / systemPrompt / scope 等）
     * @returns `ok(MemoryEntry[])` 新写入与更新后的记忆列表；LLM 调用失败时返回 `MEMORY_EXTRACT_FAILED`
     */
    async extract(messages: ChatMessage[], options?: MemoryExtractOptions): Promise<HaiResult<MemoryEntry[]>> {
      return extractAndConsolidate({
        llm,
        recall: (query, recallOptions) => recallEntries(query, recallOptions, false),
        add: entry => operations.add(entry),
        update: (memoryId, updates) => updateEntry(memoryId, updates),
        remove: memoryId => operations.remove(memoryId),
        relatedTopK: config.writebackRelatedTopK,
        systemPrompt: config.systemPrompt,
      }, messages, options)
    },

    /**
     * 根据查询文本检索最相关的记忆条目并更新访问统计
     */
    async recall(query: string, options?: MemoryRecallOptions): Promise<HaiResult<MemoryEntry[]>> {
      return recallEntries(query, options, true)
    },

    /**
     * 将检索到的相关记忆注入消息列表（system 追加或最后一条用户消息前插入）
     */
    async injectMemories(messages: ChatMessage[], options?: MemoryInjectionOptions): Promise<HaiResult<ChatMessage[]>> {
      return injectRelevantMemories(messages, options, recallEntries)
    },

    /**
     * 手动添加一条记忆（非 LLM 提取），超过主体配额时自动淘汰最低优先级条目
     *
     * @param entry - 记忆条目输入（content、type、importance、objectId、scope、metadata 等）
     * @returns `ok(MemoryEntry)` 含完整字段（id、时间戳等）；存储失败时返回 `MEMORY_STORE_FAILED`
     */
    async add(entry: MemoryEntryInput): Promise<HaiResult<MemoryEntry>> {
      try {
        const vector = await computeVector(entry.content)
        const stored = await saveEntry(entry, vector)
        logger.trace('Memory added', { id: stored.id, type: stored.type })
        return ok(stored)
      }
      catch (error) {
        logger.error('Memory add failed', { error })
        return err(HaiAIError.MEMORY_STORE_FAILED, aiM('ai_memoryStoreFailed', { params: { error: String(error) } }), error)
      }
    },

    /**
     * 更新一条已有记忆（仅更新传入字段，content 变更时重算向量）
     */
    async update(memoryId: string, updates: MemoryUpdateInput): Promise<HaiResult<MemoryEntry>> {
      return updateEntry(memoryId, updates)
    },

    /**
     * 根据 ID 获取一条记忆并更新访问统计
     *
     * @param memoryId - 记忆条目的唯一 ID
     * @returns `ok(MemoryEntry)` 操作成功；ID 不存在时返回 `MEMORY_NOT_FOUND`
     */
    async get(memoryId: string): Promise<HaiResult<MemoryEntry>> {
      const entry = await store.get(memoryId)
      if (!entry) {
        return err(HaiAIError.MEMORY_NOT_FOUND, aiM('ai_memoryNotFound', { params: { id: memoryId } }))
      }
      entry.lastAccessedAt = Date.now()
      entry.accessCount++
      await store.save(memoryId, entry, { objectId: entry.objectId })
      return ok(entry)
    },

    /**
     * 根据 ID 删除一条记忆（同时清理关系存储与向量库）
     *
     * @param memoryId - 记忆条目的唯一 ID
     * @returns `ok(undefined)` 删除成功；ID 不存在时返回 `MEMORY_NOT_FOUND`
     */
    async remove(memoryId: string): Promise<HaiResult<void>> {
      const removed = await store.remove(memoryId)
      if (!removed) {
        return err(HaiAIError.MEMORY_NOT_FOUND, aiM('ai_memoryNotFound', { params: { id: memoryId } }))
      }
      await vectorStore.remove(memoryId)
      logger.trace('Memory removed', { id: memoryId })
      return ok(undefined)
    },

    /**
     * 列出记忆条目（不分页）
     *
     * objectId / type 走存储层索引过滤，scope 在内存中 key-value 严格匹配。
     *
     * @param options - 可选（objectId、type、scope 过滤，limit 限制数量）
     * @returns `ok(MemoryEntry[])` 按创建时间降序排列的记忆列表
     */
    async list(options?: MemoryListOptions): Promise<HaiResult<MemoryEntry[]>> {
      const where: WhereClause<MemoryEntry> = {}
      if (options?.types && options.types.length === 1)
        where.type = options.types[0]
      else if (options?.types && options.types.length > 1)
        where.type = { $in: options.types }

      const results = await store.query({
        objectId: options?.objectId,
        where: Object.keys(where).length > 0 ? where : undefined,
        orderBy: { field: 'createdAt', direction: 'desc' },
        // scope 需要内存过滤，故不能在存储层直接 limit（否则可能截断掉待匹配条目）
        limit: options?.scope ? undefined : options?.limit,
      })

      if (!options?.scope)
        return ok(results)

      const filtered = results.filter(e => matchScope(e, options.scope!))
      return ok(options.limit ? filtered.slice(0, options.limit) : filtered)
    },

    /**
     * 分页列出记忆条目
     *
     * 无 scope 时走存储层原生分页；指定 scope 时因作用域存于 JSON 列无法下推，
     * 先按 objectId / type 取出候选，再内存过滤后切片（数据量大时应优先用 objectId 收窄）。
     *
     * @param options - 可选（objectId、type、scope 过滤，offset / limit 分页参数）
     * @returns `ok(StorePage<MemoryEntry>)` 含当前页数据与总数
     */
    async listPage(options?: MemoryListPageOptions): Promise<HaiResult<StorePage<MemoryEntry>>> {
      const where: WhereClause<MemoryEntry> = {}
      if (options?.types && options.types.length === 1)
        where.type = options.types[0]
      else if (options?.types && options.types.length > 1)
        where.type = { $in: options.types }

      const offset = options?.offset ?? 0
      const limit = options?.limit ?? 20

      if (!options?.scope) {
        const page = await store.queryPage(
          {
            objectId: options?.objectId,
            where: Object.keys(where).length > 0 ? where : undefined,
            orderBy: { field: 'createdAt', direction: 'desc' },
          },
          { offset, limit },
        )
        return ok(page)
      }

      const all = await store.query({
        objectId: options?.objectId,
        where: Object.keys(where).length > 0 ? where : undefined,
        orderBy: { field: 'createdAt', direction: 'desc' },
      })
      const filtered = all.filter(e => matchScope(e, options.scope!))
      return ok({ items: filtered.slice(offset, offset + limit), total: filtered.length })
    },

    /**
     * 清除记忆条目（安全语义）
     *
     * - 不传任何过滤条件：清空全部记忆（含向量库）。
     * - 传入 objectId / types / scope：仅删除同时满足全部条件的条目，避免误删。
     *
     * @param options - 可选范围过滤（objectId / types / scope 任意组合）
     * @returns `ok(undefined)` 操作成功
     */
    async clear(options?: MemoryClearOptions): Promise<HaiResult<void>> {
      if (!options?.types && !options?.objectId && !options?.scope) {
        await store.clear()
        await vectorStore.clear()
        logger.debug('All memories cleared')
        return ok(undefined)
      }

      const where: WhereClause<MemoryEntry> = {}
      if (options.types && options.types.length === 1)
        where.type = options.types[0]
      else if (options.types && options.types.length > 1)
        where.type = { $in: options.types }

      const candidates = await store.query({
        objectId: options.objectId,
        where: Object.keys(where).length > 0 ? where : undefined,
      })
      const toRemove = options.scope
        ? candidates.filter(e => matchScope(e, options.scope!))
        : candidates

      for (const entry of toRemove) {
        await store.remove(entry.id)
        await vectorStore.remove(entry.id)
      }
      logger.debug('Memories cleared', { removed: toRemove.length, objectId: options.objectId, types: options.types, scoped: Boolean(options.scope) })
      return ok(undefined)
    },
  }

  return operations
}
