/**
 * @h-ai/ai — Knowledge 实体提取
 *
 * 使用 LLM 从文本中提取命名实体（人名、项目名、概念等）。
 * @module ai-knowledge-entity
 */

import type { Result } from '@h-ai/core'
import type { AIError } from '../ai-types.js'
import type { LLMOperations } from '../llm/ai-llm-types.js'

import { core, err, ok } from '@h-ai/core'

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'

const logger = core.logger.child({ module: 'ai', scope: 'knowledge-entity' })

// ─── 提取结果类型 ───

/**
 * LLM 实体提取结果（单条）
 */
export interface ExtractedEntity {
  /** 实体名称 */
  name: string
  /** 实体类型（内置类型或用户自定义类型） */
  type: string
  /** 别名列表 */
  aliases?: string[]
  /** 简短描述 */
  description?: string
}

// ─── Prompt ───

/** 默认实体类型列表 */
export const DEFAULT_ENTITY_TYPES = ['person', 'project', 'concept', 'organization', 'location', 'event', 'other']

/**
 * 根据实体类型列表生成实体提取系统提示词
 */
function buildEntityExtractionPrompt(entityTypes: string[]): string {
  const typeList = entityTypes.map(t => `"${t}"`).join(', ')
  return `You are a named entity extraction assistant. Extract named entities from the given text.

Return a JSON array of entities. Each entity has:
- "name": the primary name (string, required)
- "type": one of ${typeList} (required)
- "aliases": alternative names or abbreviations (string array, optional)
- "description": a one-sentence description (string, optional)

Rules:
- Only extract clearly mentioned entities. Do NOT infer or guess.
- Deduplicate: if the same entity appears with different names, merge into one entry with aliases.
- Be precise and concise.
- Return an empty array [] if no entities are found.
- Return ONLY the JSON array, no markdown fences, no explanation.`
}

/**
 * 从文本中提取实体
 *
 * 调用 LLM 分析文本，返回结构化的实体列表。
 *
 * @param llm - LLM 操作接口
 * @param text - 待提取的文本（通常是单个 chunk 的内容）
 * @param model - 模型名称覆盖（可选）
 * @param entityTypes - 实体类型列表（可选，默认使用内置类型）
 * @param systemPrompt - 系统提示词覆盖（可选，默认根据 entityTypes 自动生成）
 * @returns 提取到的实体列表
 */
export async function extractEntities(
  llm: LLMOperations,
  text: string,
  model?: string,
  entityTypes?: string[],
  systemPrompt?: string,
): Promise<Result<ExtractedEntity[], AIError>> {
  if (!text.trim()) {
    return ok([])
  }

  const resolvedTypes = entityTypes ?? DEFAULT_ENTITY_TYPES
  const resolvedPrompt = systemPrompt ?? buildEntityExtractionPrompt(resolvedTypes)

  try {
    const chatResult = await llm.chat({
      model,
      messages: [
        { role: 'system', content: resolvedPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
      persist: false,
    })

    if (!chatResult.success) {
      logger.warn('Entity extraction LLM call failed', { error: chatResult.error })
      return err({
        code: AIErrorCode.KNOWLEDGE_ENTITY_EXTRACT_FAILED,
        message: aiM('ai_knowledgeEntityExtractFailed', { params: { error: String(chatResult.error.message) } }),
        cause: chatResult.error,
      })
    }

    const content = chatResult.data.choices[0]?.message?.content ?? ''

    // 解析 JSON 响应
    const validTypes = new Set(resolvedTypes)
    const entities = parseEntityResponse(content, validTypes)
    logger.trace('Entity extraction completed', { textLength: text.length, entityCount: entities.length })

    return ok(entities)
  }
  catch (error) {
    logger.error('Entity extraction failed', { error })
    return err({
      code: AIErrorCode.KNOWLEDGE_ENTITY_EXTRACT_FAILED,
      message: aiM('ai_knowledgeEntityExtractFailed', { params: { error: String(error) } }),
      cause: error,
    })
  }
}

/**
 * 解析 LLM 返回的实体 JSON
 *
 * 容错处理：去除 markdown 代码围栏、尝试 JSON.parse。
 */
function parseEntityResponse(content: string, validTypes: Set<string>): ExtractedEntity[] {
  let cleaned = content.trim()

  // 去除 markdown 代码围栏
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }

  try {
    const parsed = JSON.parse(cleaned) as unknown

    // 可能是数组
    if (Array.isArray(parsed)) {
      return parsed
        .filter(isValidEntity)
        .map(e => normalizeEntity(e, validTypes))
    }

    // 可能是 { entities: [...] } 包装
    if (typeof parsed === 'object' && parsed !== null && 'entities' in parsed) {
      const entities = (parsed as { entities: unknown }).entities
      if (Array.isArray(entities)) {
        return entities.filter(isValidEntity).map(e => normalizeEntity(e, validTypes))
      }
    }

    logger.warn('Entity extraction returned unexpected format', { content: content.slice(0, 200) })
    return []
  }
  catch {
    logger.warn('Entity extraction returned invalid JSON', { content: content.slice(0, 200) })
    return []
  }
}

/**
 * 校验实体结构
 */
function isValidEntity(item: unknown): item is Record<string, unknown> {
  if (typeof item !== 'object' || item === null)
    return false
  const obj = item as Record<string, unknown>
  return typeof obj.name === 'string' && obj.name.length > 0
    && typeof obj.type === 'string'
}

/**
 * 标准化实体
 *
 * @param item - 原始实体对象
 * @param validTypes - 合法类型集合（不在集合内的归为 'other'）
 */
function normalizeEntity(item: Record<string, unknown>, validTypes: Set<string>): ExtractedEntity {
  const type = validTypes.has(item.type as string) ? item.type as string : 'other'

  return {
    name: (item.name as string).trim(),
    type,
    aliases: Array.isArray(item.aliases) ? (item.aliases as string[]).map(String) : undefined,
    description: typeof item.description === 'string' ? item.description.trim() : undefined,
  }
}

/**
/**
 * 批量提取实体并去重合并
 *
 * 对多个 chunk 并发提取，合并同名实体。
 *
 * @param llm - LLM 操作接口
 * @param chunks - 文本块列表
 * @param model - 模型名称覆盖（可选）
 * @param entityTypes - 实体类型列表（可选，默认使用内置类型）
 * @param systemPrompt - 系统提示词覆盖（可选）
 * @param concurrency - 并发数（默认 3）
 * @returns 去重合并后的实体列表
 */
export async function extractEntitiesBatch(
  llm: LLMOperations,
  chunks: Array<{ content: string, chunkId: string }>,
  model?: string,
  entityTypes?: string[],
  systemPrompt?: string,
  concurrency = 3,
): Promise<Result<Array<ExtractedEntity & { chunkIds: string[] }>, AIError>> {
  // 简单并发控制：按批次执行
  const allEntities: Array<{ entity: ExtractedEntity, chunkId: string }> = []

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency)
    const results = await Promise.all(
      batch.map(async (chunk) => {
        const result = await extractEntities(llm, chunk.content, model, entityTypes, systemPrompt)
        if (result.success) {
          return result.data.map(e => ({ entity: e, chunkId: chunk.chunkId }))
        }
        logger.warn('Entity extraction failed for chunk', { chunkId: chunk.chunkId })
        return []
      }),
    )

    for (const entities of results) {
      allEntities.push(...entities)
    }
  }

  // 去重合并：按名称（忽略大小写）分组
  const entityMap = new Map<string, ExtractedEntity & { chunkIds: string[] }>()

  for (const { entity, chunkId } of allEntities) {
    const key = entity.name.toLowerCase()
    const existing = entityMap.get(key)

    if (existing) {
      // 合并 chunkIds
      if (!existing.chunkIds.includes(chunkId)) {
        existing.chunkIds.push(chunkId)
      }
      // 合并别名
      if (entity.aliases) {
        const existingAliases = new Set(existing.aliases ?? [])
        for (const alias of entity.aliases) {
          existingAliases.add(alias)
        }
        existing.aliases = Array.from(existingAliases)
      }
      // 使用更详细的描述
      if (entity.description && (!existing.description || entity.description.length > existing.description.length)) {
        existing.description = entity.description
      }
    }
    else {
      entityMap.set(key, { ...entity, chunkIds: [chunkId] })
    }
  }

  return ok(Array.from(entityMap.values()))
}
