/**
 * @h-ai/ai — Knowledge 实体索引 DDL
 *
 * 定义 reldb 中实体表和文档-实体倒排索引表的创建逻辑。
 * @module ai-knowledge-schema
 */

import type { Result } from '@h-ai/core'
import type { DataOperations, DbType } from '@h-ai/reldb'
import type { AIError } from '../ai-types.js'

import { core, err, ok } from '@h-ai/core'

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'

const logger = core.logger.child({ module: 'ai', scope: 'knowledge-schema' })

// ─── DDL 生成（跨 DB 兼容） ───

/**
 * 根据数据库类型生成 DDL 语句
 */
function buildSchemaStatements(dbType: DbType): string[] {
  const pk = dbType === 'mysql' ? 'VARCHAR(512)' : 'TEXT'
  const textCol = dbType === 'mysql' ? 'VARCHAR(255)' : 'TEXT'
  const longText = 'TEXT'

  return [
    // 实体表
    `CREATE TABLE IF NOT EXISTS hai_ai_knowledge_entity (
  id          ${pk} PRIMARY KEY,
  name        ${textCol} NOT NULL,
  type        ${textCol} NOT NULL,
  aliases     ${longText},
  description ${longText},
  created_at  BIGINT DEFAULT 0,
  updated_at  BIGINT DEFAULT 0
)`,
    `CREATE INDEX IF NOT EXISTS idx_hai_ai_knowledge_entity_name ON hai_ai_knowledge_entity(name)`,
    `CREATE INDEX IF NOT EXISTS idx_hai_ai_knowledge_entity_type ON hai_ai_knowledge_entity(type)`,
    // 实体-文档关联表
    `CREATE TABLE IF NOT EXISTS hai_ai_knowledge_entity_document (
  entity_id   ${pk} NOT NULL,
  document_id ${pk} NOT NULL,
  chunk_id    ${pk} DEFAULT '',
  collection  ${textCol} NOT NULL,
  relevance   REAL DEFAULT 1.0,
  context     ${longText},
  created_at  BIGINT DEFAULT 0,
  PRIMARY KEY (entity_id, document_id, chunk_id)
)`,
    `CREATE INDEX IF NOT EXISTS idx_hai_ai_knowledge_ed_document ON hai_ai_knowledge_entity_document(document_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hai_ai_knowledge_ed_collection ON hai_ai_knowledge_entity_document(collection)`,
    // 文档元数据表
    `CREATE TABLE IF NOT EXISTS hai_ai_knowledge_document (
  document_id ${pk} NOT NULL,
  collection  ${textCol} NOT NULL,
  title       ${longText},
  url         ${longText},
  chunk_count INTEGER DEFAULT 0,
  created_at  BIGINT DEFAULT 0,
  PRIMARY KEY (document_id, collection)
)`,
  ]
}

/**
 * 创建知识库实体索引表
 *
 * 在 reldb 中创建 knowledge_entity 和 knowledge_entity_document 表及索引。
 *
 * @param dataOps - reldb 数据操作接口
 * @returns 成功返回 ok(undefined)
 */
export async function createKnowledgeSchema(dataOps: DataOperations, dbType: DbType = 'sqlite'): Promise<Result<void, AIError>> {
  const statements = buildSchemaStatements(dbType)

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
  dbType: DbType = 'sqlite',
): Promise<Result<void, AIError>> {
  const now = Date.now()
  const params = [
    entity.id,
    entity.name,
    entity.type,
    entity.aliases ? JSON.stringify(entity.aliases) : null,
    entity.description ?? null,
    now,
    now,
  ]

  let sql: string
  if (dbType === 'mysql') {
    sql = `INSERT INTO hai_ai_knowledge_entity (id, name, type, aliases, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE name = VALUES(name), type = VALUES(type), aliases = VALUES(aliases), description = VALUES(description), updated_at = VALUES(updated_at)`
  }
  else {
    sql = `INSERT INTO hai_ai_knowledge_entity (id, name, type, aliases, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, aliases = excluded.aliases, description = excluded.description, updated_at = excluded.updated_at`
  }

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
  dbType: DbType = 'sqlite',
): Promise<Result<void, AIError>> {
  const now = Date.now()
  const params = [
    relation.entityId,
    relation.documentId,
    relation.chunkId ?? '',
    relation.collection,
    relation.relevance ?? 1.0,
    relation.context ?? null,
    now,
  ]

  let sql: string
  if (dbType === 'mysql') {
    sql = `INSERT INTO hai_ai_knowledge_entity_document (entity_id, document_id, chunk_id, collection, relevance, context, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE relevance = VALUES(relevance), context = VALUES(context)`
  }
  else {
    sql = `INSERT INTO hai_ai_knowledge_entity_document (entity_id, document_id, chunk_id, collection, relevance, context, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entity_id, document_id, chunk_id) DO UPDATE SET relevance = excluded.relevance, context = excluded.context`
  }

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
    SELECT id, name, type, aliases FROM hai_ai_knowledge_entity
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
    FROM hai_ai_knowledge_entity_document
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
  let sql = 'SELECT id, name, type, aliases, description, created_at, updated_at FROM hai_ai_knowledge_entity WHERE 1=1'
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

// ─── 文档元数据 CRUD ───

/**
 * 保存文档元数据（跨 DB upsert）
 */
export async function upsertDocument(
  dataOps: DataOperations,
  doc: { documentId: string, collection: string, title?: string, url?: string, chunkCount: number, createdAt: number },
  dbType: DbType = 'sqlite',
): Promise<Result<void, AIError>> {
  const params = [doc.documentId, doc.collection, doc.title ?? null, doc.url ?? null, doc.chunkCount, doc.createdAt]

  let sql: string
  if (dbType === 'mysql') {
    sql = `INSERT INTO hai_ai_knowledge_document (document_id, collection, title, url, chunk_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE title = VALUES(title), url = VALUES(url), chunk_count = VALUES(chunk_count)`
  }
  else {
    sql = `INSERT INTO hai_ai_knowledge_document (document_id, collection, title, url, chunk_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id, collection) DO UPDATE SET title = excluded.title, url = excluded.url, chunk_count = excluded.chunk_count`
  }
  try {
    const result = await dataOps.execute(sql, params)
    if (!result.success) {
      return err({ code: AIErrorCode.KNOWLEDGE_INGEST_FAILED, message: aiM('ai_knowledgeIngestFailed', { params: { error: String(result.error) } }), cause: result.error })
    }
    return ok(undefined)
  }
  catch (error) {
    return err({ code: AIErrorCode.KNOWLEDGE_INGEST_FAILED, message: aiM('ai_knowledgeIngestFailed', { params: { error: String(error) } }), cause: error })
  }
}

/**
 * 按 documentId + collection 获取单个文档元数据
 */
export async function getDocumentFromDb(
  dataOps: DataOperations,
  documentId: string,
  collection: string,
): Promise<Result<{ documentId: string, collection: string, title: string | null, url: string | null, chunkCount: number, createdAt: number } | undefined, AIError>> {
  const sql = 'SELECT document_id, collection, title, url, chunk_count, created_at FROM hai_ai_knowledge_document WHERE document_id = ? AND collection = ?'
  try {
    const result = await dataOps.query<Record<string, unknown>>(sql, [documentId, collection])
    if (!result.success) {
      return err({ code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED, message: aiM('ai_knowledgeRetrieveFailed', { params: { error: String(result.error) } }), cause: result.error })
    }
    const row = result.data[0]
    if (!row)
      return ok(undefined)
    return ok({
      documentId: row.document_id as string,
      collection: row.collection as string,
      title: row.title as string | null,
      url: row.url as string | null,
      chunkCount: row.chunk_count as number,
      createdAt: row.created_at as number,
    })
  }
  catch (error) {
    return err({ code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED, message: aiM('ai_knowledgeRetrieveFailed', { params: { error: String(error) } }), cause: error })
  }
}

/**
 * 列出文档元数据
 */
export async function listDocumentsFromDb(
  dataOps: DataOperations,
  collection: string,
  options?: { offset?: number, limit?: number },
): Promise<Result<Array<{ documentId: string, collection: string, title: string | null, url: string | null, chunkCount: number, createdAt: number }>, AIError>> {
  let sql = 'SELECT document_id, collection, title, url, chunk_count, created_at FROM hai_ai_knowledge_document WHERE collection = ?'
  const params: unknown[] = [collection]

  sql += ' ORDER BY created_at DESC'
  if (options?.limit) {
    sql += ' LIMIT ?'
    params.push(options.limit)
  }
  if (options?.offset) {
    sql += ' OFFSET ?'
    params.push(options.offset)
  }

  try {
    const result = await dataOps.query<Record<string, unknown>>(sql, params)
    if (!result.success) {
      return err({ code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED, message: aiM('ai_knowledgeRetrieveFailed', { params: { error: String(result.error) } }), cause: result.error })
    }
    return ok(result.data.map(row => ({
      documentId: row.document_id as string,
      collection: row.collection as string,
      title: row.title as string | null,
      url: row.url as string | null,
      chunkCount: row.chunk_count as number,
      createdAt: row.created_at as number,
    })))
  }
  catch (error) {
    return err({ code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED, message: aiM('ai_knowledgeRetrieveFailed', { params: { error: String(error) } }), cause: error })
  }
}

/**
 * 查询每个文档的实体关联数
 */
export async function listDocumentEntityCounts(
  dataOps: DataOperations,
  documentIds: string[],
  collection: string,
): Promise<Result<Map<string, number>, AIError>> {
  if (documentIds.length === 0)
    return ok(new Map())
  const placeholders = documentIds.map(() => '?').join(', ')
  const sql = `SELECT document_id, COUNT(DISTINCT entity_id) as cnt FROM hai_ai_knowledge_entity_document WHERE document_id IN (${placeholders}) AND collection = ? GROUP BY document_id`
  const params = [...documentIds, collection]

  try {
    const result = await dataOps.query<Record<string, unknown>>(sql, params)
    if (!result.success) {
      return err({ code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED, message: aiM('ai_knowledgeRetrieveFailed', { params: { error: String(result.error) } }), cause: result.error })
    }
    const map = new Map<string, number>()
    for (const row of result.data) {
      map.set(row.document_id as string, row.cnt as number)
    }
    return ok(map)
  }
  catch (error) {
    return err({ code: AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED, message: aiM('ai_knowledgeRetrieveFailed', { params: { error: String(error) } }), cause: error })
  }
}

/**
 * 删除文档相关的实体关联
 */
export async function removeDocumentEntityRelations(
  dataOps: DataOperations,
  documentId: string,
  collection: string,
): Promise<Result<void, AIError>> {
  const sql = 'DELETE FROM hai_ai_knowledge_entity_document WHERE document_id = ? AND collection = ?'
  try {
    const result = await dataOps.execute(sql, [documentId, collection])
    if (!result.success) {
      return err({ code: AIErrorCode.KNOWLEDGE_INGEST_FAILED, message: aiM('ai_knowledgeIngestFailed', { params: { error: String(result.error) } }), cause: result.error })
    }
    return ok(undefined)
  }
  catch (error) {
    return err({ code: AIErrorCode.KNOWLEDGE_INGEST_FAILED, message: aiM('ai_knowledgeIngestFailed', { params: { error: String(error) } }), cause: error })
  }
}

/**
 * 删除文档元数据
 */
export async function removeDocumentFromDb(
  dataOps: DataOperations,
  documentId: string,
  collection: string,
): Promise<Result<void, AIError>> {
  const sql = 'DELETE FROM hai_ai_knowledge_document WHERE document_id = ? AND collection = ?'
  try {
    const result = await dataOps.execute(sql, [documentId, collection])
    if (!result.success) {
      return err({ code: AIErrorCode.KNOWLEDGE_INGEST_FAILED, message: aiM('ai_knowledgeIngestFailed', { params: { error: String(result.error) } }), cause: result.error })
    }
    return ok(undefined)
  }
  catch (error) {
    return err({ code: AIErrorCode.KNOWLEDGE_INGEST_FAILED, message: aiM('ai_knowledgeIngestFailed', { params: { error: String(error) } }), cause: error })
  }
}
