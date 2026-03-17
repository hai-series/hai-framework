/**
 * @h-ai/ai — 持久化存储实现（reldb + vecdb）
 *
 * 基于 @h-ai/reldb 和 @h-ai/vecdb 的持久化 AIStore / AIVectorStore 实现。
 * @module ai-store-db
 */

import type { DbType, DmlOperations, ReldbJsonOps } from '@h-ai/reldb'
import type { VecdbFunctions } from '@h-ai/vecdb'
import type { AIStore, AIVectorStore, StoreFilter, StorePage, StoreScope, WhereClause, WhereOperator } from './ai-store-types.js'

// ─── Reldb AIStore 实现 ───

/**
 * AIStore 配置选项
 */
export interface AIStoreOptions {
  /** 数据库类型（用于生成跨 DB 兼容 SQL），默认 sqlite */
  dbType?: DbType
  /** 是否创建 object_id 索引列 */
  hasObjectId?: boolean
  /** 是否创建 session_id 索引列 */
  hasSessionId?: boolean
  /** 是否创建 status 索引列 */
  hasStatus?: boolean
  /** 是否创建 ref_id 索引列 */
  hasRefId?: boolean
}

/**
 * 基于 reldb 的持久化 AIStore 实现
 *
 * 将记录以 JSON 格式存储在 reldb 表中，支持 SQLite / PostgreSQL / MySQL。
 * 表结构：id PK, object_id?, session_id?, data JSON, created_at, updated_at
 *
 * - object_id / session_id 为可选索引列，由 AIStoreOptions 控制是否创建
 * - save 时通过 StoreScope 参数写入索引列
 * - query / removeBy 时通过 StoreFilter.objectId / sessionId 使用索引加速
 */
export class ReldbAIStore<T> implements AIStore<T> {
  private readonly sql: DmlOperations
  private readonly table: string
  private readonly jsonOps: ReldbJsonOps
  private readonly dbType: DbType
  private readonly hasObjectId: boolean
  private readonly hasSessionId: boolean
  private readonly hasStatus: boolean
  private readonly hasRefId: boolean
  constructor(sql: DmlOperations, table: string, jsonOps: ReldbJsonOps, options?: AIStoreOptions) {
    this.sql = sql
    this.table = table
    this.jsonOps = jsonOps
    this.dbType = options?.dbType ?? 'sqlite'
    this.hasObjectId = options?.hasObjectId ?? false
    this.hasSessionId = options?.hasSessionId ?? false
    this.hasStatus = options?.hasStatus ?? false
    this.hasRefId = options?.hasRefId ?? false
  }

  /**
   * 创建表及索引（由 ai.init() 统一调用，幂等）
   */
  async createTable(): Promise<void> {
    const t = this.table
    const db = this.dbType
    const idType = db === 'mysql' ? 'VARCHAR(512)' : 'TEXT'
    const scopeType = db === 'mysql' ? 'VARCHAR(255)' : 'TEXT'
    const dataType = db === 'postgresql' ? 'JSONB' : db === 'mysql' ? 'JSON' : 'TEXT'

    const cols: string[] = [
      `id ${idType} PRIMARY KEY`,
    ]
    if (this.hasObjectId)
      cols.push(`object_id ${scopeType}`)
    if (this.hasSessionId)
      cols.push(`session_id ${scopeType}`)
    if (this.hasStatus)
      cols.push(`status ${scopeType}`)
    if (this.hasRefId)
      cols.push(`ref_id ${scopeType}`)
    cols.push(`data ${dataType} NOT NULL`)
    cols.push(`created_at BIGINT NOT NULL`)
    cols.push(`updated_at BIGINT NOT NULL`)

    await this.sql.execute(`CREATE TABLE IF NOT EXISTS ${t} (${cols.join(', ')})`)

    // 索引
    if (this.hasObjectId) {
      await this.sql.execute(`CREATE INDEX IF NOT EXISTS idx_${t}_object_id ON ${t}(object_id)`)
    }
    if (this.hasSessionId) {
      await this.sql.execute(`CREATE INDEX IF NOT EXISTS idx_${t}_session_id ON ${t}(session_id)`)
    }
    if (this.hasObjectId && this.hasSessionId) {
      await this.sql.execute(`CREATE INDEX IF NOT EXISTS idx_${t}_object_session ON ${t}(object_id, session_id)`)
    }
    if (this.hasStatus) {
      await this.sql.execute(`CREATE INDEX IF NOT EXISTS idx_${t}_status ON ${t}(status)`)
    }
    if (this.hasRefId) {
      await this.sql.execute(`CREATE INDEX IF NOT EXISTS idx_${t}_ref_id ON ${t}(ref_id)`)
    }
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
      // MySQL: ON DUPLICATE KEY UPDATE
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
      // SQLite / PostgreSQL: ON CONFLICT(id) DO UPDATE
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
    // 批量写入：使用 Promise.all 并行执行，避免 N+1 顺序写入
    await Promise.all(items.map(({ id, data, scope }) => this.save(id, data, scope)))
  }

  async get(id: string): Promise<T | undefined> {
    const result = await this.sql.get<{ data: string }>(
      `SELECT data FROM ${this.table} WHERE id = ?`,
      [id],
    )
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
    // 总数（带 WHERE 条件）
    const countParams: unknown[] = []
    const countConditions = this.buildAllConditions(filter, countParams)
    let countSql = `SELECT COUNT(*) as cnt FROM ${this.table}`
    if (countConditions.length > 0) {
      countSql += ` WHERE ${countConditions.join(' AND ')}`
    }
    const countResult = await this.sql.get<{ cnt: number }>(countSql, countParams)
    const total = countResult.success && countResult.data != null ? countResult.data.cnt : 0

    // 分页数据
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

    // 先计数
    let countSql = `SELECT COUNT(*) as cnt FROM ${this.table}`
    if (conditions.length > 0) {
      const whereClause = ` WHERE ${conditions.join(' AND ')}`
      countSql += whereClause
      const countResult = await this.sql.get<{ cnt: number }>(countSql, [...params])
      const count = countResult.success && countResult.data != null ? countResult.data.cnt : 0

      const deleteSql = `DELETE FROM ${this.table}${whereClause}`
      await this.sql.execute(deleteSql, params)
      return count
    }

    // 无条件全删
    const countResult = await this.sql.get<{ cnt: number }>(countSql)
    const count = countResult.success && countResult.data != null ? countResult.data.cnt : 0
    await this.sql.execute(`DELETE FROM ${this.table}`)
    return count
  }

  async count(filter?: StoreFilter<T>): Promise<number> {
    if (!filter?.where && !filter?.objectId && !filter?.sessionId && !filter?.status && !filter?.refId) {
      const result = await this.sql.get<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM ${this.table}`,
      )
      return result.success && result.data != null ? result.data.cnt : 0
    }
    const params: unknown[] = []
    const conditions = this.buildAllConditions(filter!, params)
    let sql = `SELECT COUNT(*) as cnt FROM ${this.table}`
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`
    }
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

  /**
   * 构建 SELECT 查询（含 WHERE / ORDER BY / LIMIT）
   */
  private buildQuery(filter: StoreFilter<T>): { sql: string, params: unknown[] } {
    let sql = `SELECT data FROM ${this.table}`
    const params: unknown[] = []

    const conditions = this.buildAllConditions(filter, params)
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`
    }

    if (filter.orderBy) {
      const dir = filter.orderBy.direction === 'asc' ? 'ASC' : 'DESC'
      const field = String(filter.orderBy.field)
      // created_at / updated_at 直接用表列，其他字段用 json_extract
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

  /**
   * 构建所有 WHERE 条件：索引列 + JSON where 子句
   */
  private buildAllConditions(filter: StoreFilter<T>, params: unknown[]): string[] {
    const conditions: string[] = []

    // 索引列过滤（优先于 json_extract）
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
        const placeholders = filter.status.map(() => '?').join(', ')
        conditions.push(`status IN (${placeholders})`)
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

    // JSON where 子句
    if (filter.where) {
      conditions.push(...this.buildWhereConditions(filter.where, params))
    }

    return conditions
  }

  /**
   * 将 WhereClause 编译为 SQL 条件片段列表，同时收集参数化绑定值
   *
   * 使用 reldb.json.extract 从 JSON 列中提取字段进行比较，兼容所有数据库后端
   */
  private buildWhereConditions(where: WhereClause<T>, params: unknown[]): string[] {
    const conditions: string[] = []

    for (const key of Object.keys(where)) {
      const value = (where as Record<string, unknown>)[key]
      const path = `$.${key}`

      if (this.isWhereOperator(value)) {
        const op = value as WhereOperator<unknown>
        if (op.$in !== undefined && Array.isArray(op.$in)) {
          const { sql: jsonSql, params: jsonParams } = this.jsonOps.extract('data', path)
          const placeholders = op.$in.map(() => '?').join(', ')
          params.push(...jsonParams)
          conditions.push(`${jsonSql} IN (${placeholders})`)
          params.push(...op.$in)
        }
        if (op.$gte !== undefined) {
          const { sql: jsonSql, params: jsonParams } = this.jsonOps.extract('data', path)
          params.push(...jsonParams)
          conditions.push(`${jsonSql} >= ?`)
          params.push(op.$gte)
        }
        if (op.$gt !== undefined) {
          const { sql: jsonSql, params: jsonParams } = this.jsonOps.extract('data', path)
          params.push(...jsonParams)
          conditions.push(`${jsonSql} > ?`)
          params.push(op.$gt)
        }
        if (op.$lte !== undefined) {
          const { sql: jsonSql, params: jsonParams } = this.jsonOps.extract('data', path)
          params.push(...jsonParams)
          conditions.push(`${jsonSql} <= ?`)
          params.push(op.$lte)
        }
        if (op.$lt !== undefined) {
          const { sql: jsonSql, params: jsonParams } = this.jsonOps.extract('data', path)
          params.push(...jsonParams)
          conditions.push(`${jsonSql} < ?`)
          params.push(op.$lt)
        }
      }
      else {
        // 等值匹配
        const { sql: jsonSql, params: jsonParams } = this.jsonOps.extract('data', path)
        params.push(...jsonParams)
        conditions.push(`${jsonSql} = ?`)
        params.push(value)
      }
    }

    return conditions
  }

  /**
   * 判断值是否为 WhereOperator 对象
   */
  private isWhereOperator<V>(value: unknown): value is WhereOperator<V> {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return false
    const keys = Object.keys(value)
    return keys.length > 0 && keys.every(k => ['$in', '$gte', '$gt', '$lte', '$lt'].includes(k))
  }
}

// ─── Vecdb AIVectorStore 实现 ───

/**
 * 基于 vecdb 的持久化向量存储实现
 *
 * 使用 vecdb.vector / vecdb.collection 子对象操作向量数据。
 * 集合在首次 upsert 时按需创建（lazy），clear 时 drop 集合。
 */
export class VecdbAIVectorStore implements AIVectorStore {
  private readonly vecdb: VecdbFunctions
  private readonly collection: string
  /** 已创建集合的维度（null 表示未创建或已清除） */
  private collectionDimension: number | null = null

  constructor(vecdb: VecdbFunctions, collection: string) {
    this.vecdb = vecdb
    this.collection = collection
  }

  /**
   * 确保集合存在（按需创建）
   */
  private async ensureCollection(dimension: number): Promise<void> {
    if (this.collectionDimension === dimension)
      return
    const exists = await this.vecdb.collection.exists(this.collection)
    if (exists.success && !exists.data) {
      await this.vecdb.collection.create(this.collection, { dimension })
    }
    this.collectionDimension = dimension
  }

  async upsert(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    await this.ensureCollection(vector.length)
    await this.vecdb.vector.upsert(this.collection, [{ id, vector, metadata }])
  }

  async search(vector: number[], options?: { topK?: number, filter?: Record<string, unknown> }): Promise<Array<{ id: string, score: number, metadata?: Record<string, unknown> }>> {
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
