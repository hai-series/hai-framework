/**
 * @h-ai/ai — Mem0 数据格式记忆 Provider（Mem0 数据格式适配）
 *
 * 由框架负责类型提取和 Embedding，固定 REST 端点读写 Mem0 payload 格式；
 * 不运行上游完整引擎，不加载其历史数据库、遥测和陈旧 SDK 依赖。存储连接从 storeProvider 映射：
 * qdrant 复用同一后端；当前适配无法映射的后端默认 fail-fast。
 * 临时内存回退仅用于开发或明确的 E2E 环境，生产必须使用实际持久化 Qdrant 后端。
 * @module ai-memory-provider-mem0
 */

import type { HaiErrorDef, HaiResult } from '@h-ai/core'
import type { MemoryConfig } from '../../ai-config.js'
import type { EmbeddingOperations } from '../../embedding/ai-embedding-types.js'
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
import type { Mem0Item as Mem0MemoryItem, Mem0Store } from './ai-memory-mem0-store.js'
import process from 'node:process'

import { core, err, ok } from '@h-ai/core'
import { aiM } from '../../ai-i18n.js'

import { HaiAIError } from '../../ai-types.js'
import { extractMemories as extractTypedMemories } from '../ai-memory-extractor.js'
import { injectRelevantMemories, isMemoryAccessDenied } from '../ai-memory-injection.js'
import { createMem0Store } from './ai-memory-mem0-store.js'

const logger = core.logger.child({ module: 'ai', scope: 'memory-mem0' })
const DEFAULT_IMPORTANCE = 0.5
const DEFAULT_OBJECT_ID = 'hai-global'
const MEM0_LIST_CANDIDATE_LIMIT = 1000
const MEMORY_TYPES = new Set<MemoryType>([
  'fact',
  'preference',
  'event',
  'entity',
  'instruction',
])

/** 候选扫描有界；拒绝把截断的候选集当成完整结果或执行部分删除。 */
class Mem0ListIncompleteError extends Error {}

/** 写后读或回执失败不证明未写入；保留可核对的 ID，调用方不得盲目重做 add/extract。 */
function memoryWriteFailure(definition: HaiErrorDef, message: string, memoryIds: string[]): HaiResult<never> {
  const failure = err(definition, message)
  if (!failure.success) {
    failure.error.ext = {
      requiresEffectReconciliation: true,
      memoryIds: [...memoryIds],
    }
  }
  return failure
}

/**
 * 创建 Mem0 数据格式 Provider 的依赖
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function bind(config: MemoryConfig, embedding: EmbeddingOperations, llm: LLMOperations, backend: AIVectorBackend): Mem0Deps {
 *   return { config, embedding, llm, collectionName: 'hai_memories', embeddingDims: 1536, vectorBackend: backend }
 * }
 * // 只有受支持且已就绪的实际 Qdrant 连接可用于生产，不以 provider 字符串代替能力检查。
 * ```
 */
export interface Mem0Deps {
  /** 记忆配置（与 native 共用顶层字段） */
  config: MemoryConfig
  /** 复用框架的向量嵌入能力，不持有独立模型客户端。 */
  embedding: EmbeddingOperations
  /** hai LLM 操作接口（用于框架层记忆提取，保证 type/importance 分类与 native 一致） */
  llm: LLMOperations
  /** 向量库集合名 */
  collectionName: string
  /** 向量维度（可选，未提供时由 mem0 探测） */
  embeddingDims?: number
  /** hai vecdb 后端连接（qdrant 复用；其它持久化后端使用 native Provider） */
  vectorBackend?: AIVectorBackend
}

/**
 * 完成存储就绪检查后的内部能力与默认召回参数，不拥有调用方的向量连接。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function context(memory: Mem0Store, llm: LLMOperations): Mem0Context {
 *   return { memory, llm, defaultObjectId: 'hai-global', defaultTopK: 5, candidateMultiplier: 3 }
 * }
 * ```
 */
interface Mem0Context {
  memory: Mem0Store
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
  return typeof value === 'string' && MEMORY_TYPES.has(value as MemoryType)
    ? value as MemoryType
    : fallback
}

function normalizeImportance(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback
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
  const business: Record<string, unknown> = isRecord(metadata.hai_metadata)
    ? { ...metadata.hai_metadata }
    : {}
  if (business.category === undefined && typeof metadata.category === 'string' && metadata.category.trim().length > 0)
    business.category = metadata.category.trim()
  return Object.keys(business).length > 0
    ? business
    : undefined
}

/** 将 mem0 MemoryItem 映射为 hai MemoryEntry */
function toMemoryEntry(item: Mem0MemoryItem, fallbackObjectId: string): MemoryEntry {
  const metadata = isRecord(item.metadata)
    ? item.metadata
    : {}
  const now = Date.now()
  const createdAt = parseTimestamp(item.createdAt, now)
  const scope = isRecord(metadata.hai_scope)
    ? metadata.hai_scope
    : undefined
  // 优先使用写入时记录的归属主体，避免按 memoryId 直读时误判为默认主体
  const objectId = typeof metadata.hai_object_id === 'string'
    ? metadata.hai_object_id
    : typeof metadata.user_id === 'string'
      ? metadata.user_id
      : fallbackObjectId

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

/**
 * mem0 向量库解析结果：配置 + 实际生效 provider + 是否持久化
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const resolution: Mem0VectorStoreResolution = { provider: 'qdrant', persistent: true, backend: { url: 'http://127.0.0.1:6333' } }
 * const persistent = resolution.persistent && resolution.provider === 'qdrant'
 * ```
 */
interface Mem0VectorStoreResolution {
  backend?: { url: string, apiKey?: string }
  provider: 'qdrant' | 'memory'
  persistent: boolean
}

/**
 * 将 hai vecdb 后端映射为 mem0 vectorStore 配置
 *
 * 当前框架适配仅映射 qdrant，且连接字段必须足以指向实际服务。
 * 其它后端的显式内存回退仍须经过生产共享状态检查。
 */
function buildVectorStoreConfig(deps: Mem0Deps): HaiResult<Mem0VectorStoreResolution> {
  const backend = deps.vectorBackend

  if (backend?.type === 'qdrant') {
    let validConnection = false
    try {
      const url = new URL(backend.url ?? '')
      validConnection = url.protocol === 'https:' || url.protocol === 'http:'
    }
    catch {}
    if (!validConnection) {
      return err(HaiAIError.CONFIGURATION_ERROR, aiM('ai_memoryBackendConnectionRequired', {
        params: { backend: backend.type },
      }))
    }
    return ok({
      provider: 'qdrant',
      persistent: true,
      backend: { url: backend.url!, apiKey: backend.apiKey },
    })
  }

  // Mem0 数据格式适配仅实现 Qdrant；其它持久化后端使用 native Provider。
  if (backend?.type === 'pgvector')
    return err(HaiAIError.CONFIGURATION_ERROR, aiM('ai_memoryBackendUnsupported'))

  // 配置了持久化后端但 mem0 无法映射（lancedb / chroma / 未知）：默认 fail-fast，
  // 避免服务重启后记忆静默丢失；仅当 memory.allowEphemeralFallback=true 时退回内存存储。
  if (backend && !deps.config.allowEphemeralFallback) {
    return err(
      HaiAIError.CONFIGURATION_ERROR,
      aiM('ai_memoryEphemeralFallbackDenied', {
        params: { backend: backend.type },
      }),
    )
  }
  if (backend)
    logger.warn('Mem0 format falls back to in-memory vector store (allowEphemeralFallback=true); data will not survive restart', { backend: backend.type })
  return ok({
    provider: 'memory',
    persistent: false,

  })
}

async function extractMemories(context: Mem0Context, messages: ChatMessage[], options?: MemoryExtractOptions): Promise<HaiResult<MemoryEntry[]>> {
  const objectId = options?.objectId ?? context.defaultObjectId
  const memoryIds: string[] = []

  // 在框架层用统一提取器完成分类与打分（honor types / model / minImportance / systemPrompt / tempModel），
  // 再直接写入 Mem0 格式存储 并保留 hai_type / hai_importance，确保与 native 后端业务语义一致。
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
    const stored = await Promise.allSettled(extracted.data.map(async (entry) => {
      const id = await context.memory.add(entry.content, objectId, buildMetadata({
        type: entry.type,
        importance: entry.importance,
        scope: options?.scope,
        metadata: entry.metadata,
      }, objectId))
      memoryIds.push(id)
      // 写入成功后读取权威 metadata 与创建时间；读取失败报告已知写入 ID。
      const persisted = await context.memory.get(id)
      if (!persisted)
        throw new Error('Mem0 format stored memory could not be read back')
      return toMemoryEntry(persisted, objectId)
    }))
    // 等待全部在途写入结束后报告，避免失败返回后仍有写入导致遗漏已知 ID。
    const failed = stored.find(result => result.status === 'rejected')
    if (failed?.status === 'rejected')
      throw failed.reason
    return ok(stored.flatMap(result => result.status === 'fulfilled'
      ? [result.value]
      : []))
  }
  catch (error) {
    logger.error('Mem0 format extract failed', {
      error: core.sanitize.sanitizeSensitiveFields(error),
    })
    return memoryWriteFailure(HaiAIError.MEMORY_EXTRACT_FAILED, aiM('ai_memoryOperationFailed'), memoryIds)
  }
}

async function recallMemories(context: Mem0Context, query: string, options?: { topK?: number, candidateMultiplier?: number, objectId?: string, minImportance?: number, types?: MemoryType[], recencyWeight?: number, scope?: Record<string, unknown> }): Promise<HaiResult<MemoryEntry[]>> {
  const objectId = options?.objectId ?? context.defaultObjectId
  const topK = options?.topK ?? context.defaultTopK
  const candidateMultiplier = Math.max(1, options?.candidateMultiplier ?? context.candidateMultiplier)
  try {
    // mem0 无法下推 scope（存于 metadata），只能先取回更大的候选池再在内存过滤。
    // 若仅取 topK，scope 命中的记忆很可能已被同主体其它主题/角色的高相关条目挤出候选，导致漏召回。
    const response = await context.memory.search(query, objectId, topK * candidateMultiplier)
    let entries = response
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
    logger.error('Mem0 format recall failed', {
      error: core.sanitize.sanitizeSensitiveFields(error),
    })
    return err(HaiAIError.MEMORY_RECALL_FAILED, aiM('ai_memoryOperationFailed'))
  }
}

async function addMemory(context: Mem0Context, entry: MemoryEntryInput): Promise<HaiResult<MemoryEntry>> {
  const objectId = entry.objectId ?? context.defaultObjectId
  const memoryIds: string[] = []
  try {
    const id = await context.memory.add(entry.content, objectId, buildMetadata(entry, objectId))
    memoryIds.push(id)
    const persisted = await context.memory.get(id)
    if (!persisted)
      throw new Error('Mem0 format stored memory could not be read back')
    return ok(toMemoryEntry(persisted, objectId))
  }
  catch (error) {
    logger.error('Mem0 format add failed', {
      error: core.sanitize.sanitizeSensitiveFields(error),
    })
    return memoryWriteFailure(HaiAIError.MEMORY_STORE_FAILED, aiM('ai_memoryOperationFailed'), memoryIds)
  }
}

/** 更新文本与元数据时原地更新，保留 ID、创建时间和未修改的业务字段。 */
async function updateMemory(context: Mem0Context, memoryId: string, updates: MemoryUpdateInput, accessScope?: MemoryAccessScope): Promise<HaiResult<MemoryEntry>> {
  try {
    const item = await context.memory.get(memoryId)
    if (!item) {
      return err(HaiAIError.MEMORY_NOT_FOUND, aiM('ai_memoryNotFound', {
        params: { id: memoryId },
      }))
    }

    const existing = toMemoryEntry(item, context.defaultObjectId)
    if (isMemoryAccessDenied(existing, accessScope)) {
      return err(HaiAIError.MEMORY_NOT_FOUND, aiM('ai_memoryNotFound', {
        params: { id: memoryId },
      }))
    }
    const objectId = existing.objectId ?? context.defaultObjectId
    const merged: MemoryEntryInput = {
      content: updates.content ?? existing.content,
      type: updates.type ?? existing.type,
      importance: updates.importance ?? existing.importance,
      objectId,
      scope: existing.scope,
      metadata: updates.metadata ?? existing.metadata,
    }
    // 一次 upsert 保留原 ID 与创建时间；失败不先删除原记录。
    await context.memory.update(memoryId, updates.content, buildMetadata(merged, objectId), objectId)
    const refreshed = await context.memory.get(memoryId)
    if (!refreshed) {
      return err(HaiAIError.MEMORY_NOT_FOUND, aiM('ai_memoryNotFound', {
        params: { id: memoryId },
      }))
    }
    return ok(toMemoryEntry(refreshed, objectId))
  }
  catch (error) {
    logger.error('Mem0 format update failed', {
      id: memoryId,
      error: core.sanitize.sanitizeSensitiveFields(error),
    })
    return memoryWriteFailure(HaiAIError.MEMORY_STORE_FAILED, aiM('ai_memoryOperationFailed'), [memoryId])
  }
}

async function getMemory(context: Mem0Context, memoryId: string, accessScope?: MemoryAccessScope): Promise<HaiResult<MemoryEntry>> {
  try {
    const item = await context.memory.get(memoryId)
    if (!item) {
      return err(HaiAIError.MEMORY_NOT_FOUND, aiM('ai_memoryNotFound', {
        params: { id: memoryId },
      }))
    }
    const entry = toMemoryEntry(item, context.defaultObjectId)
    if (isMemoryAccessDenied(entry, accessScope)) {
      return err(HaiAIError.MEMORY_NOT_FOUND, aiM('ai_memoryNotFound', {
        params: { id: memoryId },
      }))
    }
    return ok(entry)
  }
  catch (error) {
    logger.error('Mem0 format read failed', {
      error: core.sanitize.sanitizeSensitiveFields(error),
    })
    return err(HaiAIError.MEMORY_RECALL_FAILED, aiM('ai_memoryOperationFailed'))
  }
}

async function removeMemory(context: Mem0Context, memoryId: string, accessScope?: MemoryAccessScope): Promise<HaiResult<void>> {
  try {
    if (accessScope) {
      const item = await context.memory.get(memoryId)
      if (!item || isMemoryAccessDenied(toMemoryEntry(item, context.defaultObjectId), accessScope)) {
        return err(HaiAIError.MEMORY_NOT_FOUND, aiM('ai_memoryNotFound', {
          params: { id: memoryId },
        }))
      }
    }
    await context.memory.remove(memoryId)
    return ok(undefined)
  }
  catch (error) {
    logger.error('Mem0 format delete failed', {
      error: core.sanitize.sanitizeSensitiveFields(error),
    })
    return err(HaiAIError.MEMORY_STORE_FAILED, aiM('ai_memoryOperationFailed'))
  }
}

/** 遵循 UTC 日期到期规则；无效日期不被当作已过期。 */
function isExpiredMemory(item: Mem0MemoryItem, today: string): boolean {
  const expiration = item.metadata?.expiration_date
  if (typeof expiration !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expiration))
    return false
  const parsed = new Date(`${expiration}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === expiration && expiration < today
}

/**
 * 列出指定主体的完整候选，再按过期、类型和业务作用域过滤。
 *
 * 候选扫描有界，最多支持 1000 条主体候选；多取一条探测截断，超限明确失败。
 * 扫描保留过期条目以核对完整性，再由框架过滤；不把短页误判为完整集合。
 */
async function listMemories(context: Mem0Context, options?: { objectId?: string, types?: MemoryType[], scope?: Record<string, unknown>, limit?: number }): Promise<MemoryEntry[]> {
  const objectId = options?.objectId ?? context.defaultObjectId
  const response = await context.memory.list(objectId, MEM0_LIST_CANDIDATE_LIMIT + 1)
  if (response.length > MEM0_LIST_CANDIDATE_LIMIT) {
    throw new Mem0ListIncompleteError(aiM('ai_memoryListIncomplete', {
      params: {
        limit: String(MEM0_LIST_CANDIDATE_LIMIT),
      },
    }))
  }
  const today = new Date().toISOString().slice(0, 10)
  let entries = response
    .filter(item => !isExpiredMemory(item, today))
    .map(item => toMemoryEntry(item, objectId))
    .filter(entry => entry.objectId === objectId)
  if (options?.types?.length)
    entries = entries.filter(entry => options.types!.includes(entry.type))
  if (options?.scope)
    entries = entries.filter(entry => matchScope(entry, options.scope!))
  return options?.limit !== undefined
    ? entries.slice(0, options.limit)
    : entries
}

/**
 * 创建 Mem0 数据格式 记忆操作接口
 *
 * @param deps - LLM / Embedder / 向量库来源
 * @returns MemoryOperations 实例
 * @throws 当后端配置、嵌入能力或真实存储就绪检查失败时抛出，由 `ai.init()` 转为 HaiResult
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function prepare(deps: Mem0Deps) {
 *   // 工厂显式抛错：上层 init 捕获并转为 HaiResult，不能发布半就绪实例。
 *   const memory = await createMem0MemoryOperations(deps)
 *   const result = await memory.list({ objectId: 'user-1' })
 *   if (!result.success) return result
 *   return result.data
 * }
 * ```
 */
export async function createMem0MemoryOperations(deps: Mem0Deps): Promise<MemoryCoreOperations> {
  const configResult = buildVectorStoreConfig(deps)
  if (!configResult.success)
    throw configResult.error
  if (core.module.requiresSharedState(process.env) && !configResult.data.persistent) {
    const failure = err(HaiAIError.CONFIGURATION_ERROR, aiM('ai_memorySharedBackendRequired'))
    if (!failure.success)
      throw failure.error
  }
  let memory: Mem0Store
  try {
    memory = await createMem0Store({
      embedding: deps.embedding,
      collectionName: deps.collectionName,
      dimension: deps.embeddingDims,
      backend: configResult.data.backend,
    })
  }
  catch (error) {
    logger.error('Mem0 data storage initialization failed', {
      error: core.sanitize.sanitizeSensitiveFields(error),
    })
    const failure = err(HaiAIError.CONFIGURATION_ERROR, aiM('ai_memoryOperationFailed'))
    if (!failure.success)
      throw failure.error
    throw new Error('Unreachable memory initialization state')
  }

  // 暴露实际生效的向量 provider 与持久化状态，便于运维确认记忆是否会在重启后保留
  logger.info('Mem0 format memory initialized', {
    vectorProvider: configResult.data.provider,
    persistent: configResult.data.persistent,
  })

  const context: Mem0Context = {
    memory,
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
        logger.error('Mem0 data list failed', {
          operation: 'list',
          ...core.context.get(),
          error: core.sanitize.sanitizeSensitiveFields(error),
        })
        if (error instanceof Mem0ListIncompleteError)
          return err(HaiAIError.MEMORY_LIST_INCOMPLETE, error.message)
        return err(HaiAIError.MEMORY_RECALL_FAILED, aiM('ai_memoryOperationFailed'))
      }
    },
    async listPage(options) {
      try {
        const offset = options?.offset ?? 0
        const limit = options?.limit ?? 20
        // 有界候选集核对完整性后再应用过滤和分页。
        const all = await listMemories(context, { objectId: options?.objectId, types: options?.types, scope: options?.scope })
        return ok({
          items: all.slice(offset, offset + limit),
          total: all.length,
        })
      }
      catch (error) {
        logger.error('Mem0 data page failed', {
          operation: 'page',
          ...core.context.get(),
          error: core.sanitize.sanitizeSensitiveFields(error),
        })
        if (error instanceof Mem0ListIncompleteError)
          return err(HaiAIError.MEMORY_LIST_INCOMPLETE, error.message)
        return err(HaiAIError.MEMORY_RECALL_FAILED, aiM('ai_memoryOperationFailed'))
      }
    },
    /**
     * 清除记忆
     *
     * - 无任何过滤条件：`clear()` 清空整个后端。
     * - 仅 objectId（无 types / scope）：`removeObject(objectId)` 删除该主体全部记忆。
     * - 含 types 或 scope：先列出同时匹配的条目，再逐条 `remove`，避免误删该主体其他类型/作用域的记忆。
     */
    async clear(options) {
      try {
        const hasTypeOrScope = Boolean(options?.types?.length) || Boolean(options?.scope)

        if (!options?.objectId && !hasTypeOrScope) {
          await context.memory.clear()
          return ok(undefined)
        }

        if (options?.objectId && !hasTypeOrScope) {
          await context.memory.removeObject(options.objectId)
          return ok(undefined)
        }

        // 存在 types / scope：精确匹配后逐条删除
        const matched = await listMemories(context, { objectId: options?.objectId, types: options?.types, scope: options?.scope })
        for (const entry of matched)
          await context.memory.remove(entry.id)
        logger.debug('Mem0 format memories cleared', {
          removed: matched.length,
          objectId: options?.objectId,
          types: options?.types,
          scoped: Boolean(options?.scope),
        })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Mem0 data clear failed', {
          operation: 'clear',
          ...core.context.get(),
          error: core.sanitize.sanitizeSensitiveFields(error),
        })
        if (error instanceof Mem0ListIncompleteError)
          return err(HaiAIError.MEMORY_LIST_INCOMPLETE, error.message)
        return err(HaiAIError.MEMORY_STORE_FAILED, aiM('ai_memoryOperationFailed'))
      }
    },
  }
}
