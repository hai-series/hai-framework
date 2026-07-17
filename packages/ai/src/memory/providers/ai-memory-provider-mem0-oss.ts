/**
 * @h-ai/ai — Mem0 OSS 记忆 Provider（真·嵌入式 mem0 引擎）
 *
 * 通过 `mem0ai/oss` 的 `Memory` 引擎实现记忆能力，LLM / Embedder 从 AIConfig 提取
 * （OpenAI 兼容，走 baseURL），向量库从 storeProvider 暴露的原始连接映射：
 * qdrant / pgvector 复用同一后端；lancedb / chroma 等 mem0 不支持的持久化后端默认
 * fail-fast，仅在显式允许时退回 in-memory 存储。历史记录禁用以避免额外 SQLite 依赖。
 * @module ai-memory-provider-mem0-oss
 */

import type { HaiResult } from '@h-ai/core'
import type { MemoryConfig as Mem0Config, Memory as Mem0Memory, MemoryItem as Mem0MemoryItem } from 'mem0ai/oss'

import type { AIConfig, MemoryConfig } from '../../ai-config.js'
import type { ChatMessage, LLMOperations } from '../../llm/ai-llm-types.js'
import type { AIVectorBackend } from '../../store/ai-store-types.js'
import type {
  MemoryAccessScope,
  MemoryCoreOperations,
  MemoryEntry,
  MemoryEntryInput,
  MemoryExtractOptions,
  MemoryType,
  MemoryUpdateInput,
} from '../ai-memory-types.js'

import { core, err, ok } from '@h-ai/core'

import { resolveModelEntry } from '../../ai-config.js'
import { aiM } from '../../ai-i18n.js'
import { HaiAIError } from '../../ai-types.js'
import { extractMemories as extractTypedMemories } from '../ai-memory-extractor.js'
import { injectRelevantMemories, isMemoryAccessDenied } from '../ai-memory-injection.js'

const logger = core.logger.child({ module: 'ai', scope: 'memory-mem0-oss' })
const DEFAULT_IMPORTANCE = 0.5
const DEFAULT_OBJECT_ID = 'hai-global'
const MEMORY_TYPES = new Set<MemoryType>(['fact', 'preference', 'event', 'entity', 'instruction'])

/** 创建 Mem0 OSS Provider 的依赖 */
export interface Mem0OssDeps {
  /** 记忆配置（与 native 共用顶层字段） */
  config: MemoryConfig
  /** 完整 AI 配置（用于解析 LLM / Embedder） */
  aiConfig: AIConfig
  /** hai LLM 操作接口（用于框架层记忆提取，保证 type/importance 分类与 native 一致） */
  llm: LLMOperations
  /** 向量库集合名 */
  collectionName: string
  /** 向量维度（可选，未提供时由 mem0 探测） */
  embeddingDims?: number
  /** hai vecdb 后端连接（qdrant / pgvector 复用；不支持的后端默认 fail-fast） */
  vectorBackend?: AIVectorBackend
}

interface Mem0OssContext {
  memory: Mem0Memory
  /** hai LLM 操作接口（框架层提取用） */
  llm: LLMOperations
  /** 提取默认 systemPrompt（模块配置，可被调用级 systemPrompt 覆盖） */
  systemPrompt?: string
  defaultObjectId: string
  /** 检索默认返回数量 */
  defaultTopK: number
  /** 候选池倍数（scope 过滤前的候选取回宽度 = topK × candidateMultiplier） */
  candidateMultiplier: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeType(value: unknown, fallback: MemoryType): MemoryType {
  return typeof value === 'string' && MEMORY_TYPES.has(value as MemoryType) ? value as MemoryType : fallback
}

function normalizeImportance(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback
}

function parseTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'string' || typeof value === 'number') {
    const timestamp = new Date(value).getTime()
    if (Number.isFinite(timestamp))
      return timestamp
  }
  return fallback
}

/**
 * 将 hai 业务字段编码为 mem0 metadata
 *
 * 完整保留业务 metadata，
 * 并记录归属主体 `hai_object_id`。
 * `category` 额外平铺到顶层，兼容 consolidation 逻辑与 mem0 过滤。
 *
 * @param entry - 记忆输入字段（type / importance / scope / metadata）
 * @param objectId - 归属主体 ID（写入 hai_object_id）
 */
function buildMetadata(
  entry: Pick<MemoryEntryInput, 'type' | 'importance' | 'scope' | 'metadata'>,
  objectId: string,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    hai_type: entry.type,
    hai_importance: entry.importance ?? DEFAULT_IMPORTANCE,
    hai_object_id: objectId,
  }
  if (entry.scope)
    metadata.hai_scope = entry.scope
  if (entry.metadata && Object.keys(entry.metadata).length > 0)
    metadata.hai_metadata = entry.metadata
  const category = entry.metadata?.category
  if (typeof category === 'string' && category.trim().length > 0)
    metadata.category = category.trim()
  return metadata
}

/**
 * 从 mem0 metadata 还原 hai 公共元数据（剥离内部保留键）
 *
 * 优先返回完整业务 metadata（`hai_metadata`）；对早期仅平铺 `category` 的数据做兼容。
 */
function toPublicMetadata(metadata: Record<string, unknown>): Record<string, unknown> | undefined {
  const business: Record<string, unknown> = isRecord(metadata.hai_metadata) ? { ...metadata.hai_metadata } : {}
  if (business.category === undefined && typeof metadata.category === 'string' && metadata.category.trim().length > 0)
    business.category = metadata.category.trim()
  return Object.keys(business).length > 0 ? business : undefined
}

/** 将 mem0 MemoryItem 映射为 hai MemoryEntry */
function toMemoryEntry(item: Mem0MemoryItem, fallbackObjectId: string): MemoryEntry {
  const metadata = isRecord(item.metadata) ? item.metadata : {}
  const now = Date.now()
  const createdAt = parseTimestamp(item.createdAt, now)
  const scope = isRecord(metadata.hai_scope) ? metadata.hai_scope : undefined
  // 优先使用写入时记录的归属主体，避免按 memoryId 直读时误判为默认主体
  const objectId = typeof metadata.hai_object_id === 'string' ? metadata.hai_object_id : fallbackObjectId

  return {
    id: item.id,
    content: item.memory ?? '',
    type: normalizeType(metadata.hai_type, 'fact'),
    importance: normalizeImportance(metadata.hai_importance, DEFAULT_IMPORTANCE),
    objectId,
    scope,
    metadata: toPublicMetadata(metadata),
    createdAt,
    lastAccessedAt: parseTimestamp(item.updatedAt, createdAt),
    accessCount: 0,
  }
}

/**
 * 判断记忆条目是否匹配指定业务作用域（key-value 全部相等；条目无 scope 时不匹配）
 */
function matchScope(entry: MemoryEntry, scope: Record<string, unknown>): boolean {
  if (!entry.scope)
    return false
  return Object.entries(scope).every(([k, v]) => (entry.scope as Record<string, unknown>)[k] === v)
}

/** mem0 向量库解析结果：配置 + 实际生效 provider + 是否持久化 */
interface Mem0VectorStoreResolution {
  vectorStore: Mem0Config['vectorStore']
  /** 实际生效的向量 provider（qdrant / pgvector / memory） */
  provider: string
  /** 是否为持久化后端（服务重启后数据是否保留） */
  persistent: boolean
}

/**
 * 将 hai vecdb 后端映射为 mem0 vectorStore 配置
 *
 * mem0 TS 仅支持 qdrant / pgvector。当底层后端为 lancedb / chroma / 未知时无法映射，
 * 默认 fail-fast（返回错误）以避免服务重启后记忆静默丢失；仅当显式允许时才退回内存存储。
 */
function buildVectorStoreConfig(deps: Mem0OssDeps): HaiResult<Mem0VectorStoreResolution> {
  const collectionName = deps.collectionName
  const dimension = deps.embeddingDims
  const backend = deps.vectorBackend

  if (backend?.type === 'qdrant') {
    return ok({
      provider: 'qdrant',
      persistent: true,
      vectorStore: {
        provider: 'qdrant',
        config: {
          url: backend.url,
          apiKey: backend.apiKey,
          collectionName,
          ...(dimension ? { dimension, embeddingModelDims: dimension } : {}),
        },
      },
    })
  }

  if (backend?.type === 'pgvector') {
    return ok({
      provider: 'pgvector',
      persistent: true,
      vectorStore: {
        provider: 'pgvector',
        config: {
          host: backend.host,
          port: backend.port,
          dbName: backend.database,
          user: backend.user,
          password: backend.password,
          connectionString: backend.connectionString,
          collectionName,
          ...(dimension ? { dimension, embeddingModelDims: dimension } : {}),
        },
      },
    })
  }

  // 配置了持久化后端但 mem0 无法映射（lancedb / chroma / 未知）：默认 fail-fast，
  // 避免服务重启后记忆静默丢失；仅当 memory.allowEphemeralFallback=true 时退回内存存储。
  if (backend && !deps.config.allowEphemeralFallback) {
    return err(
      HaiAIError.CONFIGURATION_ERROR,
      aiM('ai_memoryEphemeralFallbackDenied', { params: { backend: backend.type } }),
    )
  }
  if (backend)
    logger.warn('Mem0 OSS falls back to in-memory vector store (allowEphemeralFallback=true); data will not survive restart', { backend: backend.type })
  return ok({
    provider: 'memory',
    persistent: false,
    vectorStore: {
      provider: 'memory',
      config: {
        collectionName,
        ...(dimension ? { dimension } : {}),
      },
    },
  })
}

/** 解析 LLM / Embedder 配置并构建 mem0 Memory 配置（含实际生效向量 provider 与持久化状态） */
function buildMem0Config(deps: Mem0OssDeps): HaiResult<{ config: Mem0Config, vectorProvider: string, persistent: boolean }> {
  const llmResolved = resolveModelEntry(deps.aiConfig.llm, 'extraction', undefined, {
    missingApiKeyMessage: aiM('ai_configError', { params: { error: 'API Key is required for mem0 LLM' } }),
  })
  if (!llmResolved.success)
    return llmResolved

  const embedderResolved = resolveModelEntry(deps.aiConfig.llm, 'embedding', undefined, {
    missingApiKeyMessage: aiM('ai_configError', { params: { error: 'API Key is required for mem0 embedder' } }),
  })
  if (!embedderResolved.success)
    return embedderResolved

  const vectorResolved = buildVectorStoreConfig(deps)
  if (!vectorResolved.success)
    return vectorResolved

  return ok({
    vectorProvider: vectorResolved.data.provider,
    persistent: vectorResolved.data.persistent,
    config: {
      llm: {
        provider: 'openai',
        config: {
          apiKey: llmResolved.data.apiKey,
          model: llmResolved.data.model,
          baseURL: llmResolved.data.baseUrl,
          temperature: 0.1,
        },
      },
      embedder: {
        provider: 'openai',
        config: {
          apiKey: embedderResolved.data.apiKey,
          model: embedderResolved.data.model,
          baseURL: embedderResolved.data.baseUrl,
          ...(deps.embeddingDims ? { embeddingDims: deps.embeddingDims } : {}),
        },
      },
      vectorStore: vectorResolved.data.vectorStore,
      disableHistory: true,
      customInstructions: deps.config.systemPrompt,
    },
  })
}

async function extractMemories(context: Mem0OssContext, messages: ChatMessage[], options?: MemoryExtractOptions): Promise<HaiResult<MemoryEntry[]>> {
  const objectId = options?.objectId ?? context.defaultObjectId

  // 在框架层用统一提取器完成分类与打分（honor types / model / minImportance / systemPrompt / tempModel），
  // 再以 infer:false 写入 mem0 并保留 hai_type / hai_importance，确保与 native 后端业务语义一致。
  const extracted = await extractTypedMemories(context.llm, messages, {
    types: options?.types,
    model: options?.model,
    minImportance: options?.minImportance,
    systemPrompt: options?.systemPrompt ?? context.systemPrompt,
    objectId,
    tempModel: options?.tempModel,
    signal: options?.signal,
  })
  if (!extracted.success)
    return extracted
  if (extracted.data.length === 0)
    return ok([])

  try {
    // 批量并发写入，避免 await-in-loop（N+1）
    const stored = await Promise.all(extracted.data.map(async (entry) => {
      const response = await context.memory.add([{ role: 'user', content: entry.content }], {
        userId: objectId,
        metadata: buildMetadata({ type: entry.type, importance: entry.importance, scope: options?.scope, metadata: entry.metadata }, objectId),
        infer: false,
      })
      const item = response.results[0]
      return item ? toMemoryEntry(item, objectId) : undefined
    }))
    return ok(stored.filter((entry): entry is MemoryEntry => entry !== undefined))
  }
  catch (error) {
    logger.error('Mem0 OSS extract failed', { error })
    return err(HaiAIError.MEMORY_EXTRACT_FAILED, aiM('ai_memoryExtractFailed', { params: { error: String(error) } }), error)
  }
}

async function recallMemories(context: Mem0OssContext, query: string, options?: { topK?: number, candidateMultiplier?: number, objectId?: string, minImportance?: number, types?: MemoryType[], recencyWeight?: number, scope?: Record<string, unknown> }): Promise<HaiResult<MemoryEntry[]>> {
  const objectId = options?.objectId ?? context.defaultObjectId
  const topK = options?.topK ?? context.defaultTopK
  const candidateMultiplier = Math.max(1, options?.candidateMultiplier ?? context.candidateMultiplier)
  try {
    // mem0 无法下推 scope（存于 metadata），只能先取回更大的候选池再在内存过滤。
    // 若仅取 topK，scope 命中的记忆很可能已被同主体其它主题/角色的高相关条目挤出候选，导致漏召回。
    const response = await context.memory.search(query, {
      filters: { userId: objectId },
      topK: topK * candidateMultiplier,
    })
    let entries = response.results
      .map(item => toMemoryEntry(item, objectId))
      // 主体隔离兜底：即便底层向量库未按 user 过滤，也确保只召回归属该主体的记忆
      .filter(entry => entry.objectId === objectId)
      // 按业务作用域严格过滤，避免同一主体下不同主题/角色互相召回
      .filter(entry => !options?.scope || matchScope(entry, options.scope))
      // 按类型过滤
      .filter(entry => !options?.types?.length || options.types.includes(entry.type))
      .filter(entry => entry.importance >= (options?.minImportance ?? 0))

    // 时间衰减重排：mem0 已按相关度排序，以排名作为相关度代理与时间新近度线性加权
    const recencyWeight = options?.recencyWeight
    if (recencyWeight && recencyWeight > 0 && entries.length > 1) {
      const times = entries.map(entry => entry.createdAt)
      const minTime = Math.min(...times)
      const span = Math.max(1, Math.max(...times) - minTime)
      const count = entries.length
      entries = entries
        .map((entry, index) => {
          const relevance = 1 - index / (count - 1)
          const recency = (entry.createdAt - minTime) / span
          return { entry, score: relevance * (1 - recencyWeight) + recency * recencyWeight }
        })
        .sort((a, b) => b.score - a.score)
        .map(ranked => ranked.entry)
    }

    return ok(entries.slice(0, topK))
  }
  catch (error) {
    logger.error('Mem0 OSS recall failed', { error })
    return err(HaiAIError.MEMORY_RECALL_FAILED, aiM('ai_memoryRecallFailed', { params: { error: String(error) } }), error)
  }
}

async function addMemory(context: Mem0OssContext, entry: MemoryEntryInput): Promise<HaiResult<MemoryEntry>> {
  const objectId = entry.objectId ?? context.defaultObjectId
  try {
    const response = await context.memory.add([{ role: 'user', content: entry.content }], {
      userId: objectId,
      metadata: buildMetadata(entry, objectId),
      infer: false,
    })
    const stored = response.results[0]
    if (!stored)
      throw new Error('Mem0 OSS did not return the stored memory')
    return ok(toMemoryEntry(stored, objectId))
  }
  catch (error) {
    logger.error('Mem0 OSS add failed', { error })
    return err(HaiAIError.MEMORY_STORE_FAILED, aiM('ai_memoryStoreFailed', { params: { error: String(error) } }), error)
  }
}

/**
 * 更新一条记忆的任意字段（content / type / importance / metadata / scope）
 *
 * mem0 OSS 的 `update()` 仅能改写记忆文本，且未暴露 metadata 更新 API，其内部 vectorStore
 * 为私有字段，无法安全地原地改写 payload。为完整实现更新语义，此处采用
 * 「读取现有条目 → 合并字段 → 删除旧条目 → infer:false 重新写入」的方式。
 *
 * 代价：mem0 后端会为更新后的记忆分配新的 memoryId（与 native 后端保持稳定 id 的行为不同，
 * 已在 README 中作为后端差异说明）；通过 `timestamp` 保留原始创建时间。
 */
async function updateMemory(context: Mem0OssContext, memoryId: string, updates: MemoryUpdateInput, accessScope?: MemoryAccessScope): Promise<HaiResult<MemoryEntry>> {
  try {
    const item = await context.memory.get(memoryId)
    if (!item)
      return err(HaiAIError.MEMORY_NOT_FOUND, aiM('ai_memoryNotFound', { params: { id: memoryId } }))

    const existing = toMemoryEntry(item, context.defaultObjectId)
    if (isMemoryAccessDenied(existing, accessScope))
      return err(HaiAIError.MEMORY_NOT_FOUND, aiM('ai_memoryNotFound', { params: { id: memoryId } }))
    const objectId = existing.objectId ?? context.defaultObjectId

    // 仅改文本：mem0.update 可原地更新，保持 memoryId 稳定
    const onlyContentChanged = updates.content !== undefined
      && updates.type === undefined
      && updates.importance === undefined
      && updates.metadata === undefined
    if (onlyContentChanged) {
      await context.memory.update(memoryId, updates.content!)
      const refreshed = await context.memory.get(memoryId)
      return ok(refreshed ? toMemoryEntry(refreshed, objectId) : { ...existing, content: updates.content! })
    }

    // 涉及 type / importance / metadata：删除后按合并结果重建
    const merged: MemoryEntryInput = {
      content: updates.content ?? existing.content,
      type: updates.type ?? existing.type,
      importance: updates.importance ?? existing.importance,
      objectId,
      scope: existing.scope,
      metadata: updates.metadata ?? existing.metadata,
    }
    await context.memory.delete(memoryId)
    const response = await context.memory.add([{ role: 'user', content: merged.content }], {
      userId: objectId,
      metadata: buildMetadata(merged, objectId),
      infer: false,
      timestamp: existing.createdAt,
    })
    const stored = response.results[0]
    if (!stored)
      throw new Error('Mem0 OSS did not return the updated memory')
    return ok(toMemoryEntry(stored, objectId))
  }
  catch (error) {
    logger.error('Mem0 OSS update failed', { id: memoryId, error })
    return err(HaiAIError.MEMORY_STORE_FAILED, aiM('ai_memoryStoreFailed', { params: { error: String(error) } }), error)
  }
}

async function getMemory(context: Mem0OssContext, memoryId: string, accessScope?: MemoryAccessScope): Promise<HaiResult<MemoryEntry>> {
  try {
    const item = await context.memory.get(memoryId)
    if (!item)
      return err(HaiAIError.MEMORY_NOT_FOUND, aiM('ai_memoryNotFound', { params: { id: memoryId } }))
    const entry = toMemoryEntry(item, context.defaultObjectId)
    if (isMemoryAccessDenied(entry, accessScope))
      return err(HaiAIError.MEMORY_NOT_FOUND, aiM('ai_memoryNotFound', { params: { id: memoryId } }))
    return ok(entry)
  }
  catch (error) {
    return err(HaiAIError.MEMORY_RECALL_FAILED, aiM('ai_memoryRecallFailed', { params: { error: String(error) } }), error)
  }
}

async function removeMemory(context: Mem0OssContext, memoryId: string, accessScope?: MemoryAccessScope): Promise<HaiResult<void>> {
  try {
    if (accessScope) {
      const item = await context.memory.get(memoryId)
      if (!item || isMemoryAccessDenied(toMemoryEntry(item, context.defaultObjectId), accessScope))
        return err(HaiAIError.MEMORY_NOT_FOUND, aiM('ai_memoryNotFound', { params: { id: memoryId } }))
    }
    await context.memory.delete(memoryId)
    return ok(undefined)
  }
  catch (error) {
    return err(HaiAIError.MEMORY_STORE_FAILED, aiM('ai_memoryStoreFailed', { params: { error: String(error) } }), error)
  }
}

/**
 * 列出指定主体的记忆条目（供 list / listPage / clear 复用）
 *
 * objectId 走 mem0 过滤，types / scope 在内存中匹配（scope 存于 metadata.hai_scope，无法下推）。
 * `limit` 必须在 types / scope 过滤**之后**应用：若在 getAll 时截断，目标类型/作用域的记忆
 * 很可能不在前 N 条候选内，导致漏返回甚至返回空列表（与 native provider 语义保持一致）。
 */
async function listMemories(context: Mem0OssContext, options?: { objectId?: string, types?: MemoryType[], scope?: Record<string, unknown>, limit?: number }): Promise<MemoryEntry[]> {
  const objectId = options?.objectId ?? context.defaultObjectId
  // 完整取回该主体候选（不在此处传 topK），过滤后再截取 limit
  const response = await context.memory.getAll({ filters: { userId: objectId } })
  let entries = response.results
    .map(item => toMemoryEntry(item, objectId))
    .filter(entry => entry.objectId === objectId)
  if (options?.types?.length)
    entries = entries.filter(entry => options.types!.includes(entry.type))
  if (options?.scope)
    entries = entries.filter(entry => matchScope(entry, options.scope!))
  return options?.limit !== undefined ? entries.slice(0, options.limit) : entries
}

/**
 * 创建 Mem0 OSS 记忆操作接口
 *
 * @param deps - LLM / Embedder / 向量库来源
 * @returns MemoryOperations 实例
 * @throws 当 `mem0ai` 未安装或配置缺失时抛出，由 `ai.init()` 转为 HaiResult
 */
export async function createMem0OssMemoryOperations(deps: Mem0OssDeps): Promise<MemoryCoreOperations> {
  const configResult = buildMem0Config(deps)
  if (!configResult.success)
    throw configResult.error

  let mod: typeof import('mem0ai/oss')
  try {
    mod = await import('mem0ai/oss')
  }
  catch (error) {
    logger.error('Failed to load mem0ai/oss', { error })
    throw new Error('mem0ai is required for memory.provider="mem0"; install it with `pnpm add mem0ai`')
  }

  // 暴露实际生效的向量 provider 与持久化状态，便于运维确认记忆是否会在重启后保留
  logger.info('Mem0 OSS memory initialized', {
    vectorProvider: configResult.data.vectorProvider,
    persistent: configResult.data.persistent,
  })

  const context: Mem0OssContext = {
    memory: new mod.Memory(configResult.data.config),
    llm: deps.llm,
    systemPrompt: deps.config.systemPrompt,
    defaultObjectId: DEFAULT_OBJECT_ID,
    defaultTopK: deps.config.defaultTopK,
    candidateMultiplier: deps.config.candidateMultiplier,
  }

  const recall: MemoryCoreOperations['recall'] = (query, options) => recallMemories(context, query, {
    topK: options?.topK ?? deps.config.defaultTopK,
    candidateMultiplier: options?.candidateMultiplier,
    objectId: options?.objectId,
    minImportance: options?.minImportance,
    types: options?.types,
    recencyWeight: options?.recencyWeight,
    scope: options?.scope,
  })

  return {
    extract: (messages, options) => extractMemories(context, messages, options),
    recall,
    injectMemories: (messages, options) => injectRelevantMemories(messages, options, recall),
    add: entry => addMemory(context, entry),
    update: (memoryId, updates, accessScope) => updateMemory(context, memoryId, updates, accessScope),
    get: (memoryId, accessScope) => getMemory(context, memoryId, accessScope),
    remove: (memoryId, accessScope) => removeMemory(context, memoryId, accessScope),
    async list(options) {
      try {
        return ok(await listMemories(context, options))
      }
      catch (error) {
        return err(HaiAIError.MEMORY_RECALL_FAILED, aiM('ai_memoryRecallFailed', { params: { error: String(error) } }), error)
      }
    },
    async listPage(options) {
      try {
        const offset = options?.offset ?? 0
        const limit = options?.limit ?? 20
        // mem0 getAll 不支持 offset 分页，只能取回匹配集合后在内存切片（后端能力限制，已在 README 说明）
        const all = await listMemories(context, { objectId: options?.objectId, types: options?.types, scope: options?.scope })
        return ok({ items: all.slice(offset, offset + limit), total: all.length })
      }
      catch (error) {
        return err(HaiAIError.MEMORY_RECALL_FAILED, aiM('ai_memoryRecallFailed', { params: { error: String(error) } }), error)
      }
    },
    /**
     * 清除记忆
     *
     * - 无任何过滤条件：`reset()` 清空整个后端。
     * - 仅 objectId（无 types / scope）：`deleteAll({ userId })` 删除该主体全部记忆。
     * - 含 types 或 scope：先列出同时匹配的条目，再逐条 `delete`，避免误删该主体其他类型/作用域的记忆。
     */
    async clear(options) {
      try {
        const hasTypeOrScope = Boolean(options?.types?.length) || Boolean(options?.scope)

        if (!options?.objectId && !hasTypeOrScope) {
          await context.memory.reset()
          return ok(undefined)
        }

        if (options?.objectId && !hasTypeOrScope) {
          await context.memory.deleteAll({ userId: options.objectId })
          return ok(undefined)
        }

        // 存在 types / scope：精确匹配后逐条删除
        const matched = await listMemories(context, { objectId: options?.objectId, types: options?.types, scope: options?.scope })
        for (const entry of matched)
          await context.memory.delete(entry.id)
        logger.debug('Mem0 OSS memories cleared', { removed: matched.length, objectId: options?.objectId, types: options?.types, scoped: Boolean(options?.scope) })
        return ok(undefined)
      }
      catch (error) {
        return err(HaiAIError.MEMORY_STORE_FAILED, aiM('ai_memoryStoreFailed', { params: { error: String(error) } }), error)
      }
    },
  }
}
