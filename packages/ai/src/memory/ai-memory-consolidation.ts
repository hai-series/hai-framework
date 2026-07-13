/**
 * @h-ai/ai — Memory 合并（Mem0 式增量更新）
 *
 * 对一批抽取事实与相关既有记忆做单次 LLM 合并决策，产出 ADD/UPDATE/DELETE/NONE
 * 操作并应用，实现增量更新、跨条去重与矛盾删除。作为 native 记忆的默认写入策略。
 * @module ai-memory-consolidation
 */

import type { HaiResult } from '@h-ai/core'

import type { ChatMessage, LLMOperations } from '../llm/ai-llm-types.js'
import type {
  MemoryEntry,
  MemoryEntryInput,
  MemoryExtractOptions,
  MemoryOperations,
  MemoryType,
} from './ai-memory-types.js'

import { core, err, ok } from '@h-ai/core'

import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { extractMemories } from './ai-memory-extractor.js'

const logger = core.logger.child({ module: 'ai', scope: 'memory-consolidation' })
const DEFAULT_IMPORTANCE = 0.5
const MEMORY_TYPES = new Set<MemoryType>(['fact', 'preference', 'event', 'entity', 'instruction'])
const LEADING_CODE_FENCE_REGEX = /^```(?:json)?\n?/
const TRAILING_CODE_FENCE_REGEX = /\n?```$/

const MEMORY_CONSOLIDATION_SYSTEM_PROMPT = [
  'You maintain a long-term memory store using the Mem0 consolidation algorithm.',
  'You receive existing related memories (each with an id) and newly extracted facts.',
  'Decide the minimal set of operations that keeps the store consistent and non-redundant.',
  'Return exactly one JSON object: { "memory": [ { "id"?, "text", "type", "importance", "category"?, "event" } ] }.',
  'Allowed event values:',
  '- "ADD": the fact is new information; omit id.',
  '- "UPDATE": refine an existing memory; include its id and the merged text.',
  '- "DELETE": an existing memory is contradicted or obsolete; include its id.',
  '- "NONE": an existing memory already fully covers the fact; include its id and make no change.',
  'Rules:',
  '- "type" must be one of: fact, preference, event, entity, instruction.',
  '- "importance" is a float in [0, 1].',
  '- "category" is an optional short topical label (e.g. "work", "food", "travel").',
  '- Only reference ids that appear in the provided existing memories.',
  '- Be conservative: prefer UPDATE or NONE over duplicating information with ADD.',
  'Return JSON only, without markdown fences or explanation.',
].join('\n')

/** 单条合并操作 */
interface ConsolidationOp {
  event: 'ADD' | 'UPDATE' | 'DELETE' | 'NONE'
  id?: string
  text: string
  type: MemoryType
  importance: number
  category?: string
}

/** 合并依赖：默认记忆引擎通过公共操作接口注入 */
export interface ConsolidationDeps {
  llm: LLMOperations
  recall: MemoryOperations['recall']
  add: MemoryOperations['add']
  update: MemoryOperations['update']
  remove: MemoryOperations['remove']
  /** 检索相关既有记忆的数量 */
  relatedTopK: number
  /** 抽取阶段的自定义 systemPrompt */
  systemPrompt?: string
}

function stripCodeFences(content: string): string {
  const cleaned = content.trim()
  if (!cleaned.startsWith('```'))
    return cleaned
  return cleaned.replace(LEADING_CODE_FENCE_REGEX, '').replace(TRAILING_CODE_FENCE_REGEX, '').trim()
}

function normalizeText(content: string): string {
  return content.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
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

/** 收集候选事实的相关既有记忆，按 id 去重 */
async function collectRelated(
  deps: ConsolidationDeps,
  candidates: MemoryEntryInput[],
  options?: MemoryExtractOptions,
): Promise<HaiResult<MemoryEntry[]>> {
  const recallResults = await Promise.all(
    candidates.map(candidate => deps.recall(candidate.content, {
      topK: deps.relatedTopK,
      objectId: candidate.objectId ?? options?.objectId,
      scope: options?.scope,
      types: options?.types,
    })),
  )

  const related = new Map<string, MemoryEntry>()
  for (const result of recallResults) {
    if (!result.success)
      return result
    for (const entry of result.data)
      related.set(entry.id, entry)
  }
  return ok([...related.values()])
}

/**
 * 解析 LLM 返回的合并操作列表
 *
 * 缺失的 type / importance / category 会从匹配文本的候选事实回填；UPDATE/DELETE/NONE
 * 的 id 必须命中既有记忆，否则 UPDATE 降级为 ADD、DELETE/NONE 丢弃。
 */
function parseConsolidationOps(
  raw: string,
  candidates: MemoryEntryInput[],
  relatedIds: Set<string>,
): ConsolidationOp[] {
  const parsed = JSON.parse(stripCodeFences(raw)) as unknown
  const list = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { memory?: unknown }).memory)
      ? (parsed as { memory: unknown[] }).memory
      : []

  const candidateByText = new Map(candidates.map(candidate => [normalizeText(candidate.content), candidate]))
  const ops: ConsolidationOp[] = []

  for (const item of list) {
    if (typeof item !== 'object' || item === null)
      continue
    const record = item as Record<string, unknown>
    const text = typeof record.text === 'string' ? record.text.trim() : ''
    if (!text)
      continue

    const event = String(record.event ?? 'ADD').toUpperCase()
    const fallback = candidateByText.get(normalizeText(text))
    const type = normalizeType(record.type, fallback?.type ?? 'fact')
    const importance = normalizeImportance(record.importance, fallback?.importance ?? DEFAULT_IMPORTANCE)
    const category = typeof record.category === 'string' && record.category.trim().length > 0
      ? record.category.trim()
      : readCategory(fallback?.metadata)
    const id = typeof record.id === 'string' ? record.id : undefined

    if (event === 'UPDATE' && id && relatedIds.has(id)) {
      ops.push({ event: 'UPDATE', id, text, type, importance, category })
    }
    else if (event === 'DELETE' && id && relatedIds.has(id)) {
      ops.push({ event: 'DELETE', id, text, type, importance })
    }
    else if (event === 'NONE') {
      // 已被既有记忆覆盖，无需写入
      continue
    }
    else {
      ops.push({ event: 'ADD', text, type, importance, category })
    }
  }

  return ops
}

/** 从元数据中读取 category（若有） */
function readCategory(metadata: Record<string, unknown> | undefined): string | undefined {
  const value = metadata?.category
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

/** 合并 category 到元数据 */
function withCategory(metadata: Record<string, unknown> | undefined, category: string | undefined): Record<string, unknown> | undefined {
  if (!category)
    return metadata
  return { ...metadata, category }
}

/**
 * 应用合并操作
 *
 * 顺序执行以保证容量淘汰（maxEntriesPerObject / maxEntriesGlobal）状态一致；批量规模受单次抽取的事实数量约束
 * （通常远小于 20 条）。返回新增与更新后的记忆条目。
 */
async function applyConsolidationOps(
  deps: ConsolidationDeps,
  ops: ConsolidationOp[],
  options?: MemoryExtractOptions,
): Promise<HaiResult<MemoryEntry[]>> {
  const entries: MemoryEntry[] = []

  for (const op of ops) {
    if (op.event === 'DELETE' && op.id) {
      const removeResult = await deps.remove(op.id)
      if (!removeResult.success)
        logger.warn('Consolidation delete skipped', { id: op.id, error: removeResult.error.message })
      continue
    }

    if (op.event === 'UPDATE' && op.id) {
      const updateResult = await deps.update(op.id, {
        content: op.text,
        type: op.type,
        importance: op.importance,
        metadata: op.category ? { category: op.category } : undefined,
      })
      if (!updateResult.success)
        return updateResult
      entries.push(updateResult.data)
      continue
    }

    const addResult = await deps.add({
      content: op.text,
      type: op.type,
      importance: op.importance,
      objectId: options?.objectId,
      scope: options?.scope,
      metadata: withCategory(undefined, op.category),
    })
    if (!addResult.success)
      return addResult
    entries.push(addResult.data)
  }

  return ok(entries)
}

/**
 * 从对话消息中抽取事实并执行 Mem0 式合并
 *
 * 流程：抽取事实 → 检索相关记忆 → 单次 LLM 批量合并 → 应用 ADD/UPDATE/DELETE 操作。
 *
 * @param deps - 合并依赖（LLM + 记忆操作 + relatedTopK）
 * @param messages - 对话消息列表
 * @param options - 抽取选项（types / minImportance / objectId / scope / model 等）
 * @returns 新增与更新后的记忆条目
 */
export async function extractAndConsolidate(
  deps: ConsolidationDeps,
  messages: ChatMessage[],
  options?: MemoryExtractOptions,
): Promise<HaiResult<MemoryEntry[]>> {
  logger.trace('Consolidation extract', { messageCount: messages.length })

  const extractResult = await extractMemories(deps.llm, messages, {
    types: options?.types,
    model: options?.model,
    minImportance: options?.minImportance,
    objectId: options?.objectId,
    systemPrompt: options?.systemPrompt ?? deps.systemPrompt,
    tempModel: options?.tempModel,
  })
  if (!extractResult.success)
    return extractResult

  const candidates = extractResult.data
  if (candidates.length === 0)
    return ok([])

  const relatedResult = await collectRelated(deps, candidates, options)
  if (!relatedResult.success)
    return relatedResult
  const related = relatedResult.data

  const consolidationResult = await deps.llm.chat({
    model: options?.model,
    ...(options?.tempModel ? { tempModel: options.tempModel } : {}),
    messages: [
      { role: 'system', content: MEMORY_CONSOLIDATION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          existingMemories: related.map(entry => ({
            id: entry.id,
            content: entry.content,
            type: entry.type,
            importance: entry.importance,
            category: readCategory(entry.metadata),
          })),
          newFacts: candidates.map(candidate => ({
            text: candidate.content,
            type: candidate.type,
            importance: candidate.importance ?? DEFAULT_IMPORTANCE,
          })),
        }),
      },
    ],
    temperature: 0.1,
  })
  if (!consolidationResult.success) {
    return err(HaiAIError.MEMORY_EXTRACT_FAILED, aiM('ai_memoryExtractFailed', { params: { error: String(consolidationResult.error.message) } }), consolidationResult.error)
  }

  const rawContent = consolidationResult.data.choices[0]?.message?.content ?? ''
  const relatedIds = new Set(related.map(entry => entry.id))
  let ops: ConsolidationOp[]
  try {
    ops = parseConsolidationOps(rawContent, candidates, relatedIds)
  }
  catch {
    // 解析失败时退化为直接新增全部候选事实，保证抽取结果不丢失
    logger.warn('Consolidation returned invalid JSON, falling back to ADD-all', { content: rawContent.slice(0, 200) })
    ops = candidates.map(candidate => ({
      event: 'ADD' as const,
      text: candidate.content,
      type: candidate.type,
      importance: candidate.importance ?? DEFAULT_IMPORTANCE,
    }))
  }

  const applyResult = await applyConsolidationOps(deps, ops, options)
  if (!applyResult.success)
    return applyResult

  logger.trace('Consolidation completed', { candidates: candidates.length, related: related.length, ops: ops.length, written: applyResult.data.length })
  return ok(applyResult.data)
}
