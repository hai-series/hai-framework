/**
 * @h-ai/ai — 持久化存储实现（reldb + vecdb）
 *
 * 基于 @h-ai/reldb 和 @h-ai/vecdb 的持久化 AIStore / AIVectorStore 实现。
 * @module ai-store-db
 */

import type { AIStore, AIVectorStore, ReldbJsonOps, ReldbSql, StoreFilter, StorePage, VecdbClient, WhereClause, WhereOperator } from './ai-store-types.js'

// ─── Reldb AIStore 实现 ───

/**
 * 基于 reldb 的持久化 AIStore 实现
 *
 * 将记录以 JSON 格式存储在 reldb 表中。
 * 表结构：id TEXT PRIMARY KEY, data TEXT, created_at INTEGER
 */
export class ReldbAIStore<T> implements AIStore<T> {
  private readonly sql: ReldbSql
  private readonly table: string
  private readonly jsonOps: ReldbJsonOps
  private initialized = false

  constructor(sql: ReldbSql, table: string, jsonOps: ReldbJsonOps) {
    this.sql = sql
    this.table = table
    this.jsonOps = jsonOps
  }

  /**
   * 确保表已创建
   */
  private async ensureTable(): Promise<void> {
    if (this.initialized)
      return
    await this.sql.execute(
      `CREATE TABLE IF NOT EXISTS ${this.table} (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000))`,
    )
    this.initialized = true
  }

  async save(id: string, data: T): Promise<void> {
    await this.ensureTable()
    const json = JSON.stringify(data)
    await this.sql.execute(
      `INSERT INTO ${this.table} (id, data, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      [id, json, Date.now()],
    )
  }

  async saveMany(items: Array<{ id: string, data: T }>): Promise<void> {
    await this.ensureTable()
    for (const { id, data } of items) {
      await this.save(id, data)
    }
  }

  async get(id: string): Promise<T | undefined> {
    await this.ensureTable()
    const result = await this.sql.get<{ data: string }>(
      `SELECT data FROM ${this.table} WHERE id = ?`,
      [id],
    )
    if (!result.success || !result.data)
      return undefined
    return JSON.parse(result.data.data) as T
  }

  async query(filter: StoreFilter<T>): Promise<T[]> {
    await this.ensureTable()
    const { sql, params } = this.buildQuery(filter)
    const result = await this.sql.query<{ data: string }>(sql, params)
    if (!result.success)
      return []
    return result.data.map(row => JSON.parse(row.data) as T)
  }

  async queryPage(filter: StoreFilter<T>, page: { offset: number, limit: number }): Promise<StorePage<T>> {
    await this.ensureTable()

    // 总数（带 WHERE 条件）
    let countSql = `SELECT COUNT(*) as cnt FROM ${this.table}`
    const countParams: unknown[] = []
    if (filter.where) {
      const conditions = this.buildWhereConditions(filter.where, countParams)
      if (conditions.length > 0) {
        countSql += ` WHERE ${conditions.join(' AND ')}`
      }
    }
    const countResult = await this.sql.get<{ cnt: number }>(countSql, countParams)
    const total = countResult.success ? countResult.data.cnt : 0

    // 分页数据（buildQuery 已含 WHERE + ORDER，追加 LIMIT/OFFSET）
    const { sql, params } = this.buildQuery({ ...filter, limit: undefined })
    const pagedSql = `${sql} LIMIT ? OFFSET ?`
    const result = await this.sql.query<{ data: string }>(pagedSql, [...params, page.limit, page.offset])
    const items = result.success ? result.data.map(row => JSON.parse(row.data) as T) : []

    return { items, total }
  }

  async remove(id: string): Promise<boolean> {
    await this.ensureTable()
    await this.sql.execute(`DELETE FROM ${this.table} WHERE id = ?`, [id])
    return true
  }

  async removeBy(filter: StoreFilter<T>): Promise<number> {
    await this.ensureTable()
    if (!filter.where) {
      const countResult = await this.sql.get<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM ${this.table}`,
      )
      const count = countResult.success ? countResult.data.cnt : 0
      await this.sql.execute(`DELETE FROM ${this.table}`)
      return count
    }

    // 使用 json_extract WHERE 条件定位待删除行
    let deleteSql = `DELETE FROM ${this.table}`
    const params: unknown[] = []
    const conditions = this.buildWhereConditions(filter.where, params)
    if (conditions.length > 0) {
      deleteSql += ` WHERE ${conditions.join(' AND ')}`
    }

    // 先计数再删除（SQLite DELETE 不返回 affected rows）
    let countSql = `SELECT COUNT(*) as cnt FROM ${this.table}`
    const countParams: unknown[] = []
    const countConditions = this.buildWhereConditions(filter.where, countParams)
    if (countConditions.length > 0) {
      countSql += ` WHERE ${countConditions.join(' AND ')}`
    }
    const countResult = await this.sql.get<{ cnt: number }>(countSql, countParams)
    const count = countResult.success ? countResult.data.cnt : 0

    await this.sql.execute(deleteSql, params)
    return count
  }

  async count(filter?: StoreFilter<T>): Promise<number> {
    await this.ensureTable()
    if (!filter?.where) {
      const result = await this.sql.get<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM ${this.table}`,
      )
      return result.success ? result.data.cnt : 0
    }
    const items = await this.query(filter)
    return items.length
  }

  async clear(filter?: StoreFilter<T>): Promise<void> {
    await this.ensureTable()
    if (!filter?.where) {
      await this.sql.execute(`DELETE FROM ${this.table}`)
      return
    }
    await this.removeBy(filter)
  }

  private buildQuery(filter: StoreFilter<T>): { sql: string, params: unknown[] } {
    let sql = `SELECT data FROM ${this.table}`
    const params: unknown[] = []

    // 将 WhereClause 编译为 SQL WHERE 子句（基于 json_extract）
    if (filter.where) {
      const conditions = this.buildWhereConditions(filter.where, params)
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`
      }
    }

    if (filter.orderBy) {
      sql += ` ORDER BY created_at ${filter.orderBy.direction === 'asc' ? 'ASC' : 'DESC'}`
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
 */
export class VecdbAIVectorStore implements AIVectorStore {
  private readonly vecdb: VecdbClient
  private readonly collection: string

  constructor(vecdb: VecdbClient, collection: string) {
    this.vecdb = vecdb
    this.collection = collection
  }

  async upsert(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    await this.vecdb.upsert(this.collection, [{ id, vector, metadata }])
  }

  async search(vector: number[], options?: { topK?: number, filter?: Record<string, unknown> }): Promise<Array<{ id: string, score: number, metadata?: Record<string, unknown> }>> {
    const result = await this.vecdb.search(this.collection, vector, options)
    return result.success ? result.data : []
  }

  async remove(id: string): Promise<void> {
    await this.vecdb.remove(this.collection, [id])
  }

  async removeBy(filter: Record<string, unknown>): Promise<number> {
    const result = await this.vecdb.removeByFilter(this.collection, filter)
    return result.success ? result.data : 0
  }

  async clear(filter?: Record<string, unknown>): Promise<void> {
    if (filter) {
      await this.vecdb.removeByFilter(this.collection, filter)
    }
    else {
      await this.vecdb.clear(this.collection)
    }
  }
}
