/**
 * @h-ai/ai — Knowledge 实体索引 DDL
 *
 * 定义 reldb 中实体表和文档-实体倒排索引表的创建逻辑。
 * @module ai-knowledge-schema
 */

import type { Result } from '@h-ai/core'
import type { DataOperations } from '@h-ai/reldb'
import type { AIError } from '../ai-types.js'

import { core, err, ok } from '@h-ai/core'

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'

const logger = core.logger.child({ module: 'ai', scope: 'knowledge-schema' })

// ─── DDL 语句 ───

const CREATE_ENTITY_TABLE = `
CREATE TABLE IF NOT EXISTS knowledge_entity (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  aliases     TEXT,
  description TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
)
`

const CREATE_ENTITY_NAME_INDEX = `
CREATE INDEX IF NOT EXISTS idx_knowledge_entity_name ON knowledge_entity(name)
`

const CREATE_ENTITY_TYPE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_knowledge_entity_type ON knowledge_entity(type)
`

const CREATE_ENTITY_DOCUMENT_TABLE = `
CREATE TABLE IF NOT EXISTS knowledge_entity_document (
  entity_id   TEXT NOT NULL,
  document_id TEXT NOT NULL,
  chunk_id    TEXT DEFAULT '',
  collection  TEXT NOT NULL,
  relevance   REAL DEFAULT 1.0,
  context     TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (entity_id, document_id, chunk_id)
)
`

const CREATE_ED_DOCUMENT_INDEX = `
CREATE INDEX IF NOT EXISTS idx_knowledge_ed_document ON knowledge_entity_document(document_id)
`

const CREATE_ED_COLLECTION_INDEX = `
CREATE INDEX IF NOT EXISTS idx_knowledge_ed_collection ON knowledge_entity_document(collection)
`

/**
 * 创建知识库实体索引表
 *
 * 在 reldb 中创建 knowledge_entity 和 knowledge_entity_document 表及索引。
 *
 * @param dataOps - reldb 数据操作接口
 * @returns 成功返回 ok(undefined)
 */
export async function createKnowledgeSchema(dataOps: DataOperations): Promise<Result<void, AIError>> {
  const statements = [
    CREATE_ENTITY_TABLE,
    CREATE_ENTITY_NAME_INDEX,
    CREATE_ENTITY_TYPE_INDEX,
    CREATE_ENTITY_DOCUMENT_TABLE,
    CREATE_ED_DOCUMENT_INDEX,
    CREATE_ED_COLLECTION_INDEX,
  ]

  try {
    for (const sql of statements) {
      const result = await dataOps.execute(sql)
      if (!result.success) {
        logger.error('Knowledge schema creation failed', { sql: sql.trim().slice(0, 60), error: result.error })
        return err({
          code: AIErrorCode.KNOWLEDGE_SETUP_FAILED,
          message: aiM('ai_knowledgeSetupFailed', { params: { error: String(result.error) } }),
          cause: result.error,
        })
      }
    }

    logger.debug('Knowledge schema created successfully')
    return ok(undefined)
  }
  catch (error) {
    logger.error('Knowledge schema creation failed with exception', { error })
    return err({
      code: AIErrorCode.KNOWLEDGE_SETUP_FAILED,
      message: aiM('ai_knowledgeSetupFailed', { params: { error: String(error) } }),
      cause: error,
    })
  }
}

// ─── 实体 CRUD ───

/**
 * 插入或更新实体
 *
 * 使用 INSERT OR REPLACE 语义（按 id 匹配）。
 */
export async function upsertEntity(
  dataOps: DataOperations,
  entity: { id: string, name: string, type: string, aliases?: string[], description?: string },
): Promise<Result<void, AIError>> {
  const sql = `
    INSERT OR REPLACE INTO knowledge_entity (id, name, type, aliases, description, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `
  const params = [
    entity.id,
    entity.name,
    entity.type,
    entity.aliases ? JSON.stringify(entity.aliases) : null,
    entity.description ?? null,
  ]

  try {
    const result = await dataOps.execute(sql, params)
    if (!result.success) {
      return err({
        code: AIErrorCode.KNOWLEDGE_INGEST_FAILED,
        message: aiM('ai_knowledgeIngestFailed', { params: { error: String(result.error) } }),
        cause: result.error,
      })
    }
    return ok(undefined)
  }
  catch (error) {
    return err({
      code: AIErrorCode.KNOWLEDGE_INGEST_FAILED,
      message: aiM('ai_knowledgeIngestFailed', { params: { error: String(error) } }),
      cause: error,
    })
  }
}

/**
 * 插入文档-实体关联
 */
export async function insertEntityDocument(
  dataOps: DataOperations,
  relation: {
    entityId: string
    documentId: string
    chunkId?: string
    collection: string
    relevance?: number
    context?: string
  },
): Promise<Result<void, AIError>> {
  const sql = `
    INSERT OR REPLACE INTO knowledge_entity_document (entity_id, document_id, chunk_id, collection, relevance, context)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  const params = [
    relation.entityId,
    relation.documentId,
    relation.chunkId ?? '',
    relation.collection,
    relation.relevance ?? 1.0,
    relation.context ?? null,
  ]

  try {
    const result = await dataOps.execute(sql, params)
    if (!result.success) {
      return err({
        code: AIErrorCode.KNOWLEDGE_INGEST_FAILED,
        message: aiM('ai_knowledgeIngestFailed', { params: { error: String(result.error) } }),
        cause: result.error,
      })
    }
    return ok(undefined)
  }
  catch (error) {
    return err({
      code: AIErrorCode.KNOWLEDGE_INGEST_FAILED,
      message: aiM('ai_knowledgeIngestFailed', { params: { error: String(error) } }),
      cause: error,
    })
  }
}

/**
 * 按实体名称搜索（模糊匹配名称和别名）
 *
 * @returns 匹配的实体 ID 列表
 */
export async function findEntitiesByName(
  dataOps: DataOperations,
  keyword: string,
): Promise<Result<Array<{ id: string, name: string, type: string, aliases: string[] }>, AIError>> {
  const sql = `
    SELECT id, name, type, aliases FROM knowledge_entity
    WHERE name LIKE ? OR aliases LIKE ?
  `
  const pattern = `%${keyword}%`

  try {
    const result = await dataOps.query<Record<string, unknown>>(sql, [pattern, pattern])
    if (!result.success) {
      return err({
        code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED,
        message: aiM('ai_knowledgeRetrieveFailed', { params: { error: String(result.error) } }),
        cause: result.error,
      })
    }

    const entities = result.data.map(row => ({
      id: row.id as string,
      name: row.name as string,
      type: row.type as string,
      aliases: row.aliases ? JSON.parse(row.aliases as string) as string[] : [],
    }))

    return ok(entities)
  }
  catch (error) {
    return err({
      code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED,
      message: aiM('ai_knowledgeRetrieveFailed', { params: { error: String(error) } }),
      cause: error,
    })
  }
}

/**
 * 按实体 ID 列表查询关联的文档 ID（倒排索引查询）
 */
export async function findDocumentsByEntityIds(
  dataOps: DataOperations,
  entityIds: string[],
  collection?: string,
): Promise<Result<Array<{ entityId: string, documentId: string, chunkId: string, collection: string, relevance: number, context: string | null }>, AIError>> {
  if (entityIds.length === 0)
    return ok([])

  const placeholders = entityIds.map(() => '?').join(', ')
  let sql = `
    SELECT entity_id, document_id, chunk_id, collection, relevance, context
    FROM knowledge_entity_document
    WHERE entity_id IN (${placeholders})
  `
  const params: unknown[] = [...entityIds]

  if (collection) {
    sql += ' AND collection = ?'
    params.push(collection)
  }

  try {
    const result = await dataOps.query<Record<string, unknown>>(sql, params)
    if (!result.success) {
      return err({
        code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED,
        message: aiM('ai_knowledgeRetrieveFailed', { params: { error: String(result.error) } }),
        cause: result.error,
      })
    }

    const relations = result.data.map(row => ({
      entityId: row.entity_id as string,
      documentId: row.document_id as string,
      chunkId: row.chunk_id as string,
      collection: row.collection as string,
      relevance: row.relevance as number,
      context: row.context as string | null,
    }))

    return ok(relations)
  }
  catch (error) {
    return err({
      code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED,
      message: aiM('ai_knowledgeRetrieveFailed', { params: { error: String(error) } }),
      cause: error,
    })
  }
}

/**
 * 列出所有实体（支持类型过滤和关键词搜索）
 */
export async function listEntities(
  dataOps: DataOperations,
  options?: { type?: string, keyword?: string, limit?: number },
): Promise<Result<Array<{ id: string, name: string, type: string, aliases: string[], description: string | null, createdAt: string | null, updatedAt: string | null }>, AIError>> {
  let sql = 'SELECT id, name, type, aliases, description, created_at, updated_at FROM knowledge_entity WHERE 1=1'
  const params: unknown[] = []

  if (options?.type) {
    sql += ' AND type = ?'
    params.push(options.type)
  }
  if (options?.keyword) {
    sql += ' AND (name LIKE ? OR aliases LIKE ?)'
    const pattern = `%${options.keyword}%`
    params.push(pattern, pattern)
  }

  sql += ' ORDER BY name'

  if (options?.limit) {
    sql += ' LIMIT ?'
    params.push(options.limit)
  }

  try {
    const result = await dataOps.query<Record<string, unknown>>(sql, params)
    if (!result.success) {
      return err({
        code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED,
        message: aiM('ai_knowledgeRetrieveFailed', { params: { error: String(result.error) } }),
        cause: result.error,
      })
    }

    const entities = result.data.map(row => ({
      id: row.id as string,
      name: row.name as string,
      type: row.type as string,
      aliases: row.aliases ? JSON.parse(row.aliases as string) as string[] : [],
      description: row.description as string | null,
      createdAt: row.created_at as string | null,
      updatedAt: row.updated_at as string | null,
    }))

    return ok(entities)
  }
  catch (error) {
    return err({
      code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED,
      message: aiM('ai_knowledgeRetrieveFailed', { params: { error: String(error) } }),
      cause: error,
    })
  }
}

/**
 * 按实体名称查询实体及其关联文档
 */
export async function findByEntityName(
  dataOps: DataOperations,
  entityName: string,
  options?: { collection?: string, type?: string },
): Promise<Result<Array<{
  entity: { id: string, name: string, type: string, aliases: string[], description: string | null }
  documents: Array<{ documentId: string, chunkId: string, collection: string, relevance: number, context: string | null }>
}>, AIError>> {
  // 先查找匹配的实体
  const entityResult = await findEntitiesByName(dataOps, entityName)
  if (!entityResult.success)
    return entityResult as Result<never, AIError>

  let entities = entityResult.data
  if (options?.type) {
    entities = entities.filter(e => e.type === options.type)
  }
  if (entities.length === 0)
    return ok([])

  // 查找关联文档
  const entityIds = entities.map(e => e.id)
  const docResult = await findDocumentsByEntityIds(dataOps, entityIds, options?.collection)
  if (!docResult.success)
    return docResult as Result<never, AIError>

  // 按实体分组
  const docsByEntity = new Map<string, Array<{ documentId: string, chunkId: string, collection: string, relevance: number, context: string | null }>>()
  for (const doc of docResult.data) {
    const list = docsByEntity.get(doc.entityId) ?? []
    const { entityId: _entityId, ...docWithoutEntityId } = doc
    list.push(docWithoutEntityId)
    docsByEntity.set(doc.entityId, list)
  }

  const results = entities.map(entity => ({
    entity: { ...entity, description: null as string | null },
    documents: docsByEntity.get(entity.id) ?? [],
  }))

  return ok(results)
}
