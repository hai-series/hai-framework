/**
 * @h-ai/ai — 默认 DB 存储 Provider（reldb + vecdb）
 *
 * 基于 @h-ai/reldb 和 @h-ai/vecdb 的 AIStoreProvider 默认实现。
 * AI 默认初始化路径直接使用该实现，因此 @h-ai/reldb 与 @h-ai/vecdb 是运行时依赖。
 * @module ai-store-provider-db
 */

import type { DbType, DmlOperations, ReldbJsonOps } from '@h-ai/reldb'
import type { VecdbFunctions } from '@h-ai/vecdb'
import type { AIRelStore, AIRelStoreOptions, AIStoreProvider, AIVectorBackend, AIVectorStore, KnowledgeStore, StoreFilter, StorePage, StoreScope, WhereClause, WhereOperator } from '../ai-store-types.js'

import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { vecdb } from '@h-ai/vecdb'

const logger = core.logger.child({ module: 'ai', scope: 'store-provider-db' })

/** 单条批量 SQL 的参数上限，保守低于 SQLite 默认 999 变量限制。 */
const MAX_BATCH_SQL_PARAMS = 900

// ─── ReldbAIRelStore 实现 ───

/**
 * 基于 reldb 的持久化 AIRelStore 实现
 *
 * 将记录以 JSON 格式存储在 reldb 表中，支持 SQLite / PostgreSQL / MySQL。
 * 表结构：id PK, object_id?, session_id?, status?, ref_id?, data JSON, created_at, updated_at
 */
class ReldbAIRelStore<T> implements AIRelStore<T> {
  private readonly sql: DmlOperations
  private readonly table: string
  private readonly jsonOps: ReldbJsonOps
  private readonly dbType: DbType
  private readonly hasObjectId: boolean
  private readonly hasSessionId: boolean
  private readonly hasStatus: boolean
  private readonly hasRefId: boolean
  private readonly hasScopeIndex: boolean

  constructor(sql: DmlOperations, table: string, jsonOps: ReldbJsonOps, dbType: DbType, options?: AIRelStoreOptions) {
    this.sql = sql
    this.table = table
    this.jsonOps = jsonOps
    this.dbType = dbType
    this.hasObjectId = options?.hasObjectId ?? false
    this.hasSessionId = options?.hasSessionId ?? false
    this.hasStatus = options?.hasStatus ?? false
    this.hasRefId = options?.hasRefId ?? false
    this.hasScopeIndex = options?.hasScopeIndex ?? false
  }

  /** 创建表及索引（幂等） */
  async createTable(): Promise<void> {
    const t = this.table
    const db = this.dbType
    const idType = db === 'mysql' ? 'VARCHAR(512)' : 'TEXT'
    const scopeType = db === 'mysql' ? 'VARCHAR(255)' : 'TEXT'
    const dataType = db === 'postgresql' ? 'JSONB' : db === 'mysql' ? 'JSON' : 'TEXT'

    const cols: string[] = [`id ${idType} PRIMARY KEY`]
    if (this.hasObjectId)
      cols.push(`object_id ${scopeType}`)
    if (this.hasSessionId)
      cols.push(`session_id ${scopeType}`)
    if (this.hasStatus)
      cols.push(`status ${scopeType}`)
    if (this.hasRefId)
      cols.push(`ref_id ${scopeType}`)
    cols.push(`data ${dataType} NOT NULL`, `created_at BIGINT NOT NULL`, `updated_at BIGINT NOT NULL`)

    await this.sql.execute(`CREATE TABLE IF NOT EXISTS ${t} (${cols.join(', ')})`)

    if (this.hasObjectId)
      await this.sql.execute(`CREATE INDEX IF NOT EXISTS idx_${t}_object_id ON ${t}(object_id)`)
    if (this.hasSessionId)
      await this.sql.execute(`CREATE INDEX IF NOT EXISTS idx_${t}_session_id ON ${t}(session_id)`)
    if (this.hasObjectId && this.hasSessionId)
      await this.sql.execute(`CREATE INDEX IF NOT EXISTS idx_${t}_object_session ON ${t}(object_id, session_id)`)
    if (this.hasStatus)
      await this.sql.execute(`CREATE INDEX IF NOT EXISTS idx_${t}_status ON ${t}(status)`)
    if (this.hasRefId)
      await this.sql.execute(`CREATE INDEX IF NOT EXISTS idx_${t}_ref_id ON ${t}(ref_id)`)
    // 业务作用域索引：仅 PostgreSQL 支持 JSONB GIN，用于加速 data @> '{"scope":...}' 包含查询。
    if (this.hasScopeIndex && db === 'postgresql')
      await this.sql.execute(`CREATE INDEX IF NOT EXISTS idx_${t}_data_gin ON ${t} USING GIN (data jsonb_path_ops)`)
  }

  async save(id: string, data: T, scope?: StoreScope): Promise<void> {
    const now = Date.now()
    const json = JSON.stringify(data)

    const colNames = ['id']
    const values: unknown[] = [id]
    const placeholders: string[] = ['?']

    if (this.hasObjectId) {
      colNames.push('object_id')
      values.push(scope?.objectId ?? null)
      placeholders.push('?')
    }
    if (this.hasSessionId) {
      colNames.push('session_id')
      values.push(scope?.sessionId ?? null)
      placeholders.push('?')
    }
    if (this.hasStatus) {
      colNames.push('status')
      values.push(scope?.status ?? null)
      placeholders.push('?')
    }
    if (this.hasRefId) {
      colNames.push('ref_id')
      values.push(scope?.refId ?? null)
      placeholders.push('?')
    }

    colNames.push('data', 'created_at', 'updated_at')
    values.push(json, now, now)
    placeholders.push('?', '?', '?')

    if (this.dbType === 'mysql') {
      const updateParts: string[] = ['data = VALUES(data)', 'updated_at = VALUES(updated_at)']
      if (this.hasObjectId)
        updateParts.push('object_id = VALUES(object_id)')
      if (this.hasSessionId)
        updateParts.push('session_id = VALUES(session_id)')
      if (this.hasStatus)
        updateParts.push('status = VALUES(status)')
      if (this.hasRefId)
        updateParts.push('ref_id = VALUES(ref_id)')
      await this.sql.execute(
        `INSERT INTO ${this.table} (${colNames.join(', ')}) VALUES (${placeholders.join(', ')}) ON DUPLICATE KEY UPDATE ${updateParts.join(', ')}`,
        values,
      )
    }
    else {
      const updateParts: string[] = ['data = excluded.data', 'updated_at = excluded.updated_at']
      if (this.hasObjectId)
        updateParts.push('object_id = excluded.object_id')
      if (this.hasSessionId)
        updateParts.push('session_id = excluded.session_id')
      if (this.hasStatus)
        updateParts.push('status = excluded.status')
      if (this.hasRefId)
        updateParts.push('ref_id = excluded.ref_id')
      await this.sql.execute(
        `INSERT INTO ${this.table} (${colNames.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT(id) DO UPDATE SET ${updateParts.join(', ')}`,
        values,
      )
    }
  }

  async saveMany(items: Array<{ id: string, data: T, scope?: StoreScope }>): Promise<void> {
    if (items.length === 0)
      return

    const colNames = this.buildSaveColumnNames()
    const rowsPerBatch = Math.max(1, Math.floor(MAX_BATCH_SQL_PARAMS / colNames.length))

    // 大批量入库时使用多行 INSERT，减少 SQL 往返；按参数数分批避免 SQLite / MySQL 参数上限。
    for (let start = 0; start < items.length; start += rowsPerBatch) {
      // 每批都是参数化批量 SQL；顺序执行避免同一连接上并发写入争抢。
      await this.saveManyBatch(items.slice(start, start + rowsPerBatch), colNames)
    }
  }

  async get(id: string): Promise<T | undefined> {
    const result = await this.sql.get<{ data: string }>(`SELECT data FROM ${this.table} WHERE id = ?`, [id])
    if (!result.success || !result.data)
      return undefined
    return JSON.parse(result.data.data) as T
  }

  async query(filter: StoreFilter<T>): Promise<T[]> {
    const { sql, params } = this.buildQuery(filter)
    const result = await this.sql.query<{ data: string }>(sql, params)
    if (!result.success)
      return []
    return result.data.map(row => JSON.parse(row.data) as T)
  }

  async queryPage(filter: StoreFilter<T>, page: { offset: number, limit: number }): Promise<StorePage<T>> {
    const countParams: unknown[] = []
    const countConditions = this.buildAllConditions(filter, countParams)
    let countSql = `SELECT COUNT(*) as cnt FROM ${this.table}`
    if (countConditions.length > 0)
      countSql += ` WHERE ${countConditions.join(' AND ')}`
    const countResult = await this.sql.get<{ cnt: number }>(countSql, countParams)
    const total = countResult.success && countResult.data != null ? countResult.data.cnt : 0

    const { sql, params } = this.buildQuery({ ...filter, limit: undefined })
    const pagedSql = `${sql} LIMIT ? OFFSET ?`
    const result = await this.sql.query<{ data: string }>(pagedSql, [...params, page.limit, page.offset])
    const items = result.success ? result.data.map(row => JSON.parse(row.data) as T) : []

    return { items, total }
  }

  async remove(id: string): Promise<boolean> {
    await this.sql.execute(`DELETE FROM ${this.table} WHERE id = ?`, [id])
    return true
  }

  async removeBy(filter: StoreFilter<T>): Promise<number> {
    const params: unknown[] = []
    const conditions = this.buildAllConditions(filter, params)

    let countSql = `SELECT COUNT(*) as cnt FROM ${this.table}`
    if (conditions.length > 0) {
      const whereClause = ` WHERE ${conditions.join(' AND ')}`
      countSql += whereClause
      const countResult = await this.sql.get<{ cnt: number }>(countSql, [...params])
      const count = countResult.success && countResult.data != null ? countResult.data.cnt : 0
      await this.sql.execute(`DELETE FROM ${this.table}${whereClause}`, params)
      return count
    }

    const countResult = await this.sql.get<{ cnt: number }>(countSql)
    const count = countResult.success && countResult.data != null ? countResult.data.cnt : 0
    await this.sql.execute(`DELETE FROM ${this.table}`)
    return count
  }

  async count(filter?: StoreFilter<T>): Promise<number> {
    if (!filter?.where && !filter?.objectId && !filter?.sessionId && !filter?.status && !filter?.refId) {
      const result = await this.sql.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM ${this.table}`)
      return result.success && result.data != null ? result.data.cnt : 0
    }
    const params: unknown[] = []
    const conditions = this.buildAllConditions(filter!, params)
    let sql = `SELECT COUNT(*) as cnt FROM ${this.table}`
    if (conditions.length > 0)
      sql += ` WHERE ${conditions.join(' AND ')}`
    const result = await this.sql.get<{ cnt: number }>(sql, params)
    return result.success && result.data != null ? result.data.cnt : 0
  }

  async clear(filter?: StoreFilter<T>): Promise<void> {
    if (!filter?.where && !filter?.objectId && !filter?.sessionId && !filter?.status && !filter?.refId) {
      await this.sql.execute(`DELETE FROM ${this.table}`)
      return
    }
    await this.removeBy(filter!)
  }

  /** 构造 save/saveMany 共用的列名，确保批量写入与单条写入索引列一致。 */
  private buildSaveColumnNames(): string[] {
    const colNames = ['id']
    if (this.hasObjectId)
      colNames.push('object_id')
    if (this.hasSessionId)
      colNames.push('session_id')
    if (this.hasStatus)
      colNames.push('status')
    if (this.hasRefId)
      colNames.push('ref_id')
    colNames.push('data', 'created_at', 'updated_at')
    return colNames
  }

  /** 构造单行 upsert 参数；动态值全部通过 params 传入，SQL 中不拼接用户输入。 */
  private buildSaveValues(id: string, data: T, scope: StoreScope | undefined, now: number): unknown[] {
    const values: unknown[] = [id]
    if (this.hasObjectId)
      values.push(scope?.objectId ?? null)
    if (this.hasSessionId)
      values.push(scope?.sessionId ?? null)
    if (this.hasStatus)
      values.push(scope?.status ?? null)
    if (this.hasRefId)
      values.push(scope?.refId ?? null)
    values.push(JSON.stringify(data), now, now)
    return values
  }

  /** 构造跨数据库 upsert 更新片段；列名来自内部白名单，不接受外部输入。 */
  private buildSaveUpdateParts(): string[] {
    const valueRef = (column: string) => this.dbType === 'mysql' ? `VALUES(${column})` : `excluded.${column}`
    const updateParts: string[] = [`data = ${valueRef('data')}`, `updated_at = ${valueRef('updated_at')}`]
    if (this.hasObjectId)
      updateParts.push(`object_id = ${valueRef('object_id')}`)
    if (this.hasSessionId)
      updateParts.push(`session_id = ${valueRef('session_id')}`)
    if (this.hasStatus)
      updateParts.push(`status = ${valueRef('status')}`)
    if (this.hasRefId)
      updateParts.push(`ref_id = ${valueRef('ref_id')}`)
    return updateParts
  }

  /** 执行一批参数化 upsert；调用方已按数据库参数上限切好 batch。 */
  private async saveManyBatch(items: Array<{ id: string, data: T, scope?: StoreScope }>, colNames: string[]): Promise<void> {
    const now = Date.now()
    const values: unknown[] = []
    const placeholders = items.map(({ id, data, scope }) => {
      const rowValues = this.buildSaveValues(id, data, scope, now)
      values.push(...rowValues)
      return `(${rowValues.map(() => '?').join(', ')})`
    })

    const updateParts = this.buildSaveUpdateParts()
    const conflictSql = this.dbType === 'mysql'
      ? `ON DUPLICATE KEY UPDATE ${updateParts.join(', ')}`
      : `ON CONFLICT(id) DO UPDATE SET ${updateParts.join(', ')}`

    await this.sql.execute(
      `INSERT INTO ${this.table} (${colNames.join(', ')}) VALUES ${placeholders.join(', ')} ${conflictSql}`,
      values,
    )
  }

  private buildQuery(filter: StoreFilter<T>): { sql: string, params: unknown[] } {
    let sql = `SELECT data FROM ${this.table}`
    const params: unknown[] = []
    const conditions = this.buildAllConditions(filter, params)
    if (conditions.length > 0)
      sql += ` WHERE ${conditions.join(' AND ')}`

    if (filter.orderBy) {
      const dir = filter.orderBy.direction === 'asc' ? 'ASC' : 'DESC'
      const field = String(filter.orderBy.field)
      if (field === 'createdAt') {
        sql += ` ORDER BY created_at ${dir}`
      }
      else if (field === 'updatedAt') {
        sql += ` ORDER BY updated_at ${dir}`
      }
      else {
        const { sql: jsonSql, params: jsonParams } = this.jsonOps.extract('data', `$.${field}`)
        params.push(...jsonParams)
        sql += ` ORDER BY ${jsonSql} ${dir}`
      }
    }
    else {
      sql += ` ORDER BY created_at DESC`
    }

    if (filter.limit) {
      sql += ` LIMIT ?`
      params.push(filter.limit)
    }
    return { sql, params }
  }

  private buildAllConditions(filter: StoreFilter<T>, params: unknown[]): string[] {
    const conditions: string[] = []
    if (filter.objectId && this.hasObjectId) {
      conditions.push('object_id = ?')
      params.push(filter.objectId)
    }
    if (filter.sessionId && this.hasSessionId) {
      conditions.push('session_id = ?')
      params.push(filter.sessionId)
    }
    if (filter.status && this.hasStatus) {
      if (Array.isArray(filter.status)) {
        conditions.push(`status IN (${filter.status.map(() => '?').join(', ')})`)
        params.push(...filter.status)
      }
      else {
        conditions.push('status = ?')
        params.push(filter.status)
      }
    }
    if (filter.refId && this.hasRefId) {
      conditions.push('ref_id = ?')
      params.push(filter.refId)
    }
    // 业务作用域下推：仅 PostgreSQL 用 JSONB 包含查询（可命中 GIN 索引）。
    // 其它后端为 no-op —— 结果不受影响，由调用方在内存中完成 scope 匹配。
    if (filter.scope && Object.keys(filter.scope).length > 0 && this.dbType === 'postgresql') {
      conditions.push('data @> ?::jsonb')
      params.push(JSON.stringify({ scope: filter.scope }))
    }
    if (filter.where)
      conditions.push(...this.buildWhereConditions(filter.where, params))
    return conditions
  }

  private buildWhereConditions(where: WhereClause<T>, params: unknown[]): string[] {
    const conditions: string[] = []
    for (const key of Object.keys(where)) {
      const value = (where as Record<string, unknown>)[key]
      const path = `$.${key}`
      if (this.isWhereOperator(value)) {
        const op = value as WhereOperator<unknown>
        if (op.$in !== undefined && Array.isArray(op.$in)) {
          const { sql: jsonSql, params: jsonParams } = this.jsonOps.extract('data', path)
          params.push(...jsonParams)
          conditions.push(`${jsonSql} IN (${op.$in.map(() => '?').join(', ')})`)
          params.push(...op.$in)
        }
        if (op.$gte !== undefined) {
          const { sql: j, params: p } = this.jsonOps.extract('data', path)
          params.push(...p)
          conditions.push(`${j} >= ?`)
          params.push(op.$gte)
        }
        if (op.$gt !== undefined) {
          const { sql: j, params: p } = this.jsonOps.extract('data', path)
          params.push(...p)
          conditions.push(`${j} > ?`)
          params.push(op.$gt)
        }
        if (op.$lte !== undefined) {
          const { sql: j, params: p } = this.jsonOps.extract('data', path)
          params.push(...p)
          conditions.push(`${j} <= ?`)
          params.push(op.$lte)
        }
        if (op.$lt !== undefined) {
          const { sql: j, params: p } = this.jsonOps.extract('data', path)
          params.push(...p)
          conditions.push(`${j} < ?`)
          params.push(op.$lt)
        }
      }
      else {
        const { sql: jsonSql, params: jsonParams } = this.jsonOps.extract('data', path)
        params.push(...jsonParams)
        conditions.push(`${jsonSql} = ?`)
        params.push(value)
      }
    }
    return conditions
  }

  private isWhereOperator<V>(value: unknown): value is WhereOperator<V> {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return false
    const keys = Object.keys(value)
    return keys.length > 0 && keys.every(k => ['$in', '$gte', '$gt', '$lte', '$lt'].includes(k))
  }
}

// ─── VecdbAIVectorStore 实现 ───

/**
 * 基于 vecdb 的持久化向量存储实现
 *
 * 使用 vecdb.vector / vecdb.collection 子对象操作向量数据。
 * 集合在首次 upsert 时按需创建（lazy），clear 时 drop 集合。
 */
class VecdbAIVectorStore implements AIVectorStore {
  private readonly vecdb: VecdbFunctions
  private readonly collection: string
  private collectionDimension: number | null = null

  constructor(vecdb: VecdbFunctions, collection: string) {
    this.vecdb = vecdb
    this.collection = collection
  }

  private async ensureCollection(dimension: number): Promise<void> {
    if (this.collectionDimension === dimension)
      return
    const exists = await this.vecdb.collection.exists(this.collection)
    if (exists.success && !exists.data)
      await this.vecdb.collection.create(this.collection, { dimension })
    this.collectionDimension = dimension
  }

  async upsert(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    await this.ensureCollection(vector.length)
    await this.vecdb.vector.upsert(this.collection, [{ id, vector, metadata }])
  }

  async search(vector: number[], options?: { topK?: number, minScore?: number, filter?: Record<string, unknown> }): Promise<Array<{ id: string, score: number, content?: string, metadata?: Record<string, unknown> }>> {
    const result = await this.vecdb.vector.search(this.collection, vector, options)
    return result.success ? result.data : []
  }

  async remove(id: string): Promise<void> {
    await this.vecdb.vector.delete(this.collection, [id])
  }

  async clear(_filter?: Record<string, unknown>): Promise<void> {
    const exists = await this.vecdb.collection.exists(this.collection)
    if (exists.success && exists.data) {
      await this.vecdb.collection.drop(this.collection)
      this.collectionDimension = null
    }
  }
}

// ─── DB KnowledgeStore 实现 ───

/** 根据数据库类型生成 DDL 语句 */
function buildKnowledgeSchemaStatements(dbType: DbType): string[] {
  const pk = dbType === 'mysql' ? 'VARCHAR(512)' : 'TEXT'
  const textCol = dbType === 'mysql' ? 'VARCHAR(255)' : 'TEXT'
  const longText = 'TEXT'

  return [
    `CREATE TABLE IF NOT EXISTS hai_ai_knowledge_entity (
  id          ${pk} PRIMARY KEY,
  name        ${textCol} NOT NULL,
  type        ${textCol} NOT NULL,
  collection  ${textCol} NOT NULL,
  aliases     ${longText},
  description ${longText},
  created_at  BIGINT DEFAULT 0,
  updated_at  BIGINT DEFAULT 0
)`,
    `CREATE INDEX IF NOT EXISTS idx_hai_ai_knowledge_entity_name ON hai_ai_knowledge_entity(name)`,
    `CREATE INDEX IF NOT EXISTS idx_hai_ai_knowledge_entity_type ON hai_ai_knowledge_entity(type)`,
    `CREATE INDEX IF NOT EXISTS idx_hai_ai_knowledge_entity_collection ON hai_ai_knowledge_entity(collection)`,
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
    `CREATE TABLE IF NOT EXISTS hai_ai_knowledge_document (
  document_id ${pk} NOT NULL,
  collection  ${textCol} NOT NULL,
  title       ${longText},
  url         ${longText},
  chunk_count INTEGER DEFAULT 0,
  created_at  BIGINT DEFAULT 0,
  PRIMARY KEY (document_id, collection)
)`,
    `CREATE TABLE IF NOT EXISTS hai_ai_knowledge_collections (
  collection  ${textCol} PRIMARY KEY,
  dimension   INTEGER NOT NULL,
  created_at  BIGINT NOT NULL
)`,
  ]
}

/**
 * 基于 reldb + vecdb 的 KnowledgeStore 实现
 *
 * reldb 用于实体/文档/关联的归一化存储，vecdb 用于向量存储。
 * 表结构由 buildKnowledgeSchemaStatements() 生成。
 */
class DbKnowledgeStore implements KnowledgeStore {
  private readonly sql: DmlOperations
  private readonly dbType: DbType
  private readonly vecdb: VecdbFunctions

  constructor(sql: DmlOperations, dbType: DbType, vecdb: VecdbFunctions) {
    this.sql = sql
    this.dbType = dbType
    this.vecdb = vecdb
  }

  async initialize(collection: string, dimension: number): Promise<void> {
    // 创建 vecdb 集合
    const exists = await this.vecdb.collection.exists(collection)
    if (exists.success && !exists.data)
      await this.vecdb.collection.create(collection, { dimension })

    // 创建 reldb 表
    const statements = buildKnowledgeSchemaStatements(this.dbType)
    for (const stmt of statements) {
      const result = await this.sql.execute(stmt)
      if (!result.success) {
        logger.error('Knowledge schema creation failed', { sql: stmt.trim().slice(0, 60), error: result.error })
        throw new Error(`Knowledge schema creation failed: ${String(result.error)}`)
      }
    }
  }

  async upsertEntity(entity: { id: string, name: string, type: string, collection: string, aliases?: string[], description?: string }): Promise<void> {
    const now = Date.now()
    const params = [entity.id, entity.name, entity.type, entity.collection, entity.aliases ? JSON.stringify(entity.aliases) : null, entity.description ?? null, now, now]
    const stmt = this.dbType === 'mysql'
      ? `INSERT INTO hai_ai_knowledge_entity (id, name, type, collection, aliases, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), type = VALUES(type), collection = VALUES(collection), aliases = VALUES(aliases), description = VALUES(description), updated_at = VALUES(updated_at)`
      : `INSERT INTO hai_ai_knowledge_entity (id, name, type, collection, aliases, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, collection = excluded.collection, aliases = excluded.aliases, description = excluded.description, updated_at = excluded.updated_at`
    const result = await this.sql.execute(stmt, params)
    if (!result.success)
      throw new Error(`upsertEntity failed: ${String(result.error)}`)
  }

  async findEntitiesByName(keyword: string, collection?: string): Promise<Array<{ id: string, name: string, type: string, aliases: string[] }>> {
    const pattern = `%${keyword}%`
    let stmt = `SELECT id, name, type, aliases FROM hai_ai_knowledge_entity WHERE (name LIKE ? OR aliases LIKE ?)`
    const params: unknown[] = [pattern, pattern]
    if (collection) {
      stmt += ' AND collection = ?'
      params.push(collection)
    }
    const result = await this.sql.query<Record<string, unknown>>(stmt, params)
    if (!result.success)
      return []
    return result.data.map(row => ({
      id: row.id as string,
      name: row.name as string,
      type: row.type as string,
      aliases: row.aliases ? JSON.parse(row.aliases as string) as string[] : [],
    }))
  }

  async listEntities(options?: { collection?: string, type?: string, keyword?: string, limit?: number }): Promise<Array<{ id: string, name: string, type: string, aliases: string[], description: string | null, createdAt: string | null, updatedAt: string | null }>> {
    let stmt = 'SELECT id, name, type, aliases, description, created_at, updated_at FROM hai_ai_knowledge_entity WHERE 1=1'
    const params: unknown[] = []
    if (options?.collection) {
      stmt += ' AND collection = ?'
      params.push(options.collection)
    }
    if (options?.type) {
      stmt += ' AND type = ?'
      params.push(options.type)
    }
    if (options?.keyword) {
      stmt += ' AND (name LIKE ? OR aliases LIKE ?)'
      const p = `%${options.keyword}%`
      params.push(p, p)
    }
    stmt += ' ORDER BY name'
    if (options?.limit) {
      stmt += ' LIMIT ?'
      params.push(options.limit)
    }
    const result = await this.sql.query<Record<string, unknown>>(stmt, params)
    if (!result.success)
      return []
    return result.data.map(row => ({
      id: row.id as string,
      name: row.name as string,
      type: row.type as string,
      aliases: row.aliases ? JSON.parse(row.aliases as string) as string[] : [],
      description: row.description as string | null,
      createdAt: row.created_at as string | null,
      updatedAt: row.updated_at as string | null,
    }))
  }

  async deleteEntities(entityIds: string[]): Promise<void> {
    if (entityIds.length === 0)
      return
    const placeholders = entityIds.map(() => '?').join(', ')
    await this.sql.execute(
      `DELETE FROM hai_ai_knowledge_entity WHERE id IN (${placeholders})`,
      entityIds,
    )
  }

  async insertEntityDocument(relation: { entityId: string, documentId: string, chunkId?: string, collection: string, relevance?: number, context?: string }): Promise<void> {
    const now = Date.now()
    const params = [relation.entityId, relation.documentId, relation.chunkId ?? '', relation.collection, relation.relevance ?? 1.0, relation.context ?? null, now]
    const stmt = this.dbType === 'mysql'
      ? `INSERT INTO hai_ai_knowledge_entity_document (entity_id, document_id, chunk_id, collection, relevance, context, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE relevance = VALUES(relevance), context = VALUES(context)`
      : `INSERT INTO hai_ai_knowledge_entity_document (entity_id, document_id, chunk_id, collection, relevance, context, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(entity_id, document_id, chunk_id) DO UPDATE SET relevance = excluded.relevance, context = excluded.context`
    const result = await this.sql.execute(stmt, params)
    if (!result.success)
      throw new Error(`insertEntityDocument failed: ${String(result.error)}`)
  }

  async findDocumentsByEntityIds(entityIds: string[], collection?: string): Promise<Array<{ entityId: string, documentId: string, chunkId: string, collection: string, relevance: number, context: string | null }>> {
    if (entityIds.length === 0)
      return []
    const placeholders = entityIds.map(() => '?').join(', ')
    let stmt = `SELECT entity_id, document_id, chunk_id, collection, relevance, context FROM hai_ai_knowledge_entity_document WHERE entity_id IN (${placeholders})`
    const params: unknown[] = [...entityIds]
    if (collection) {
      stmt += ' AND collection = ?'
      params.push(collection)
    }
    const result = await this.sql.query<Record<string, unknown>>(stmt, params)
    if (!result.success)
      return []
    return result.data.map(row => ({
      entityId: row.entity_id as string,
      documentId: row.document_id as string,
      chunkId: row.chunk_id as string,
      collection: row.collection as string,
      relevance: row.relevance as number,
      context: row.context as string | null,
    }))
  }

  async findByEntityName(entityName: string, options?: { collection?: string, type?: string }): Promise<Array<{ entity: { id: string, name: string, type: string, aliases: string[], description: string | null }, documents: Array<{ documentId: string, chunkId: string, collection: string, relevance: number, context: string | null }> }>> {
    const entities = await this.findEntitiesByName(entityName, options?.collection)
    let filtered = entities
    if (options?.type)
      filtered = filtered.filter(e => e.type === options.type)
    if (filtered.length === 0)
      return []

    const entityIds = filtered.map(e => e.id)
    const docs = await this.findDocumentsByEntityIds(entityIds, options?.collection)

    const docsByEntity = new Map<string, Array<{ documentId: string, chunkId: string, collection: string, relevance: number, context: string | null }>>()
    for (const doc of docs) {
      const list = docsByEntity.get(doc.entityId) ?? []
      const { entityId: _entityId, ...rest } = doc
      list.push(rest)
      docsByEntity.set(doc.entityId, list)
    }

    return filtered.map(entity => ({
      entity: { ...entity, description: null as string | null },
      documents: docsByEntity.get(entity.id) ?? [],
    }))
  }

  async deleteDocumentEntities(documentId: string, collection: string): Promise<void> {
    // 必须在 removeDocumentEntityRelations 之前调用，子查询依赖关联行尚未删除
    await this.sql.execute(
      'DELETE FROM hai_ai_knowledge_entity WHERE collection = ? AND id IN (SELECT DISTINCT entity_id FROM hai_ai_knowledge_entity_document WHERE document_id = ? AND collection = ?)',
      [collection, documentId, collection],
    )
  }

  async removeDocumentEntityRelations(documentId: string, collection: string): Promise<void> {
    await this.sql.execute(
      'DELETE FROM hai_ai_knowledge_entity_document WHERE document_id = ? AND collection = ?',
      [documentId, collection],
    )
  }

  async upsertDocument(doc: { documentId: string, collection: string, title?: string, url?: string, chunkCount: number, createdAt: number }): Promise<void> {
    const params = [doc.documentId, doc.collection, doc.title ?? null, doc.url ?? null, doc.chunkCount, doc.createdAt]
    const stmt = this.dbType === 'mysql'
      ? `INSERT INTO hai_ai_knowledge_document (document_id, collection, title, url, chunk_count, created_at) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title), url = VALUES(url), chunk_count = VALUES(chunk_count)`
      : `INSERT INTO hai_ai_knowledge_document (document_id, collection, title, url, chunk_count, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(document_id, collection) DO UPDATE SET title = excluded.title, url = excluded.url, chunk_count = excluded.chunk_count`
    await this.sql.execute(stmt, params)
  }

  async getDocument(documentId: string, collection: string): Promise<{ documentId: string, collection: string, title: string | null, url: string | null, chunkCount: number, createdAt: number } | undefined> {
    const result = await this.sql.query<Record<string, unknown>>(
      'SELECT document_id, collection, title, url, chunk_count, created_at FROM hai_ai_knowledge_document WHERE document_id = ? AND collection = ?',
      [documentId, collection],
    )
    if (!result.success || result.data.length === 0)
      return undefined
    const row = result.data[0]
    return {
      documentId: row.document_id as string,
      collection: row.collection as string,
      title: row.title as string | null,
      url: row.url as string | null,
      chunkCount: row.chunk_count as number,
      createdAt: row.created_at as number,
    }
  }

  async listDocuments(collection: string, options?: { offset?: number, limit?: number }): Promise<Array<{ documentId: string, collection: string, title: string | null, url: string | null, chunkCount: number, createdAt: number }>> {
    let stmt = 'SELECT document_id, collection, title, url, chunk_count, created_at FROM hai_ai_knowledge_document WHERE collection = ?'
    const params: unknown[] = [collection]
    stmt += ' ORDER BY created_at DESC'
    if (options?.limit) {
      stmt += ' LIMIT ?'
      params.push(options.limit)
    }
    if (options?.offset) {
      stmt += ' OFFSET ?'
      params.push(options.offset)
    }
    const result = await this.sql.query<Record<string, unknown>>(stmt, params)
    if (!result.success)
      return []
    return result.data.map(row => ({
      documentId: row.document_id as string,
      collection: row.collection as string,
      title: row.title as string | null,
      url: row.url as string | null,
      chunkCount: row.chunk_count as number,
      createdAt: row.created_at as number,
    }))
  }

  async listDocumentEntityCounts(documentIds: string[], collection: string): Promise<Map<string, number>> {
    if (documentIds.length === 0)
      return new Map()
    const placeholders = documentIds.map(() => '?').join(', ')
    const result = await this.sql.query<Record<string, unknown>>(
      `SELECT document_id, COUNT(DISTINCT entity_id) as cnt FROM hai_ai_knowledge_entity_document WHERE document_id IN (${placeholders}) AND collection = ? GROUP BY document_id`,
      [...documentIds, collection],
    )
    const map = new Map<string, number>()
    if (result.success) {
      for (const row of result.data) map.set(row.document_id as string, row.cnt as number)
    }
    return map
  }

  async removeDocument(documentId: string, collection: string): Promise<void> {
    await this.sql.execute('DELETE FROM hai_ai_knowledge_document WHERE document_id = ? AND collection = ?', [documentId, collection])
  }

  async upsertVectors(collection: string, vectors: Array<{ id: string, vector: number[], content?: string, metadata?: Record<string, unknown> }>): Promise<void> {
    // 确保集合存在
    if (vectors.length > 0) {
      const exists = await this.vecdb.collection.exists(collection)
      if (exists.success && !exists.data)
        await this.vecdb.collection.create(collection, { dimension: vectors[0].vector.length })
    }
    await this.vecdb.vector.upsert(collection, vectors)
  }

  async searchVectors(collection: string, vector: number[], options?: { topK?: number, minScore?: number, filter?: Record<string, unknown> }): Promise<Array<{ id: string, score: number, content?: string, metadata?: Record<string, unknown> }>> {
    const result = await this.vecdb.vector.search(collection, vector, options)
    return result.success ? result.data : []
  }

  async removeVectors(collection: string, ids: string[]): Promise<void> {
    await this.vecdb.vector.delete(collection, ids)
  }

  async ensureCollection(collection: string, dimension: number): Promise<void> {
    const exists = await this.vecdb.collection.exists(collection)
    if (exists.success && !exists.data)
      await this.vecdb.collection.create(collection, { dimension })
  }

  async registerCollection(collection: string, dimension: number): Promise<void> {
    const now = Date.now()
    const stmt = this.dbType === 'mysql'
      ? `INSERT INTO hai_ai_knowledge_collections (collection, dimension, created_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE dimension = VALUES(dimension)`
      : `INSERT INTO hai_ai_knowledge_collections (collection, dimension, created_at) VALUES (?, ?, ?) ON CONFLICT(collection) DO UPDATE SET dimension = excluded.dimension`
    const result = await this.sql.execute(stmt, [collection, dimension, now])
    if (!result.success)
      throw new Error(`registerCollection failed: ${String(result.error)}`)
  }

  async collectionExists(collection: string): Promise<boolean> {
    const result = await this.sql.get<{ cnt: number }>(
      `SELECT 1 as cnt FROM hai_ai_knowledge_collections WHERE collection = ?`,
      [collection],
    )
    return result.success && result.data != null
  }

  async deleteCollection(collection: string): Promise<void> {
    // ① 删除 vecdb 集合（向量数据）
    const exists = await this.vecdb.collection.exists(collection)
    if (exists.success && exists.data)
      await this.vecdb.collection.drop(collection)

    // ② 删除 reldb 中所有与该 collection 相关的数据（顺序：关联表先、主表后）
    await this.sql.execute('DELETE FROM hai_ai_knowledge_entity_document WHERE collection = ?', [collection])
    await this.sql.execute('DELETE FROM hai_ai_knowledge_document WHERE collection = ?', [collection])
    await this.sql.execute('DELETE FROM hai_ai_knowledge_entity WHERE collection = ?', [collection])
    await this.sql.execute('DELETE FROM hai_ai_knowledge_collections WHERE collection = ?', [collection])
  }
}

// ─── Provider 工厂 ───

/** DB Provider 依赖 */
export interface DbStoreProviderDeps {
  sql: DmlOperations
  jsonOps: ReldbJsonOps
  dbType?: DbType
  vecdb: VecdbFunctions
}

/**
 * 创建默认 DB 存储 Provider
 *
 * 基于 reldb + vecdb 的 AIStoreProvider 实现。
 * reldb 用于关系数据存储，vecdb 用于向量存储。
 */
export function createDbStoreProvider(deps: DbStoreProviderDeps): AIStoreProvider {
  const { sql, jsonOps, vecdb: vecdbDep } = deps
  const dbType = deps.dbType ?? 'sqlite'

  /** 已创建的 RelStore 实例（用于批量建表） */
  const relStores: ReldbAIRelStore<unknown>[] = []

  return {
    name: 'db',

    createRelStore<T>(name: string, options?: AIRelStoreOptions): AIRelStore<T> {
      const store = new ReldbAIRelStore<T>(sql, name, jsonOps, dbType, options)
      relStores.push(store as ReldbAIRelStore<unknown>)
      return store
    },

    createVectorStore(name: string): AIVectorStore {
      return new VecdbAIVectorStore(vecdbDep, name)
    },

    getVectorBackend(): AIVectorBackend | undefined {
      const connection = vecdbDep.rawConnection
      return connection ? { ...connection } : undefined
    },

    createKnowledgeStore(): KnowledgeStore {
      return new DbKnowledgeStore(sql, dbType, vecdbDep)
    },

    async initialize(): Promise<void> {
      if (relStores.length > 0) {
        await Promise.all(relStores.map(s => s.createTable()))
        logger.debug('DB store provider initialized', { tableCount: relStores.length })
      }
    },

    async close(): Promise<void> {
      relStores.length = 0
    },
  }
}

// ─── Singleton 便捷工厂 ───

/**
 * 检查 reldb + vecdb 是否已初始化
 *
 * 由 ai-main.ts 在创建默认 DB Provider 前调用。
 */
export function isDbStoreAvailable(): boolean {
  return reldb.isInitialized && vecdb.isInitialized
}

/**
 * 获取未初始化的依赖名称列表
 */
export function getUnavailableDbDeps(): string[] {
  const missing: string[] = []
  if (!reldb.isInitialized)
    missing.push('reldb')
  if (!vecdb.isInitialized)
    missing.push('vecdb')
  return missing
}

/**
 * 从已初始化的 reldb/vecdb 单例创建 DB Provider
 *
 * 用于默认 `store.type: 'db'` 场景。调用前应先用 `isDbStoreAvailable()` 检查。
 */
export function createDbStoreProviderFromModules(): AIStoreProvider {
  return createDbStoreProvider({
    sql: reldb.sql,
    jsonOps: reldb.json,
    dbType: reldb.config?.type,
    vecdb,
  })
}
