/**
 * @h-ai/ai — 默认 DB 存储 Provider（reldb + vecdb）
 *
 * 基于 @h-ai/reldb 和 @h-ai/vecdb 的 AIStoreProvider 默认实现。
 * AI 默认初始化路径直接使用该实现，因此 @h-ai/reldb 与 @h-ai/vecdb 是运行时依赖。
 * @module ai-store-provider-db
 */

import type { HaiResult } from '@h-ai/core'
import type { DbType, DmlOperations, ReldbJsonOps } from '@h-ai/reldb'
import type { VecdbFunctions } from '@h-ai/vecdb'
import type { AIRelStore, AIRelStoreCompareAndSwap, AIRelStoreOptions, AIStoreProvider, AIVectorBackend, AIVectorStore, AIVersionedRecord, KnowledgeStore, StoreFilter, StorePage, StoreScope, WhereClause, WhereOperator } from '../ai-store-types.js'

import type { KnowledgeCollectionManifest, KnowledgeDocumentManifest } from './ai-store-knowledge-db.js'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { HaiVecdbError, vecdb } from '@h-ai/vecdb'
import { aiM } from '../../ai-i18n.js'
import { createDbKnowledgeStore } from './ai-store-knowledge-db.js'

const logger = core.logger.child({ module: 'ai', scope: 'store-provider-db' })

/** 内部 Store 以异常通知上层失败，不能把 SQL HaiResult 错误当空数据或写入成功。 */
function requireSqlSuccess<T>(result: HaiResult<T>): Extract<HaiResult<T>, { success: true }> {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result
}

/** 单条批量 SQL 的参数上限，保守低于 SQLite 默认 999 变量限制。 */
const MAX_BATCH_SQL_PARAMS = 900

/** 从业务数据读取可用于索引的 Unix 毫秒时间；没有时间字段时回退到写入时间。 */
function dataTimestamp<T>(data: T, field: 'createdAt' | 'updatedAt', fallback: number): number {
  if (typeof data !== 'object' || data === null)
    return fallback

  const value = (data as Record<string, unknown>)[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * MySQL 单个索引列的真实结构；完整列、顺序、可见性和非唯一 BTREE 都必须匹配。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const column: MysqlIndexColumn = { column_name: 'object_id', seq_in_index: 1, non_unique: 1, sub_part: null, index_type: 'BTREE', collation: 'A', is_visible: 'YES', expression: null }
 * const usable = column.index_type === 'BTREE' && column.sub_part === null && column.is_visible === 'YES'
 * ```
 */
interface MysqlIndexColumn {
  column_name: string | null
  seq_in_index: number | string
  non_unique: number | string
  sub_part: number | null
  index_type: string
  collation: string | null
  is_visible: string
  expression: string | null
}

/**
 * 只识别驱动明确的重复索引错误；沿 HaiResult/Error cause 查找，不根据错误文案猜测。
 */
function isMysqlDuplicateIndex(error: unknown): boolean {
  const seen = new Set<object>()
  let current = error
  while (current !== null && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const details = current as Record<string, unknown>
    if (details.code === 'ER_DUP_KEYNAME' && details.errno === 1061)
      return true
    current = details.cause
  }
  return false
}

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
    this.sql = {
      ...sql,
      execute: (query, params) => sql.execute(query, params).then(requireSqlSuccess),
      query: <R>(query: string, params?: unknown[]) => sql.query<R>(query, params).then(requireSqlSuccess),
      get: <R>(query: string, params?: unknown[]) => sql.get<R>(query, params).then(requireSqlSuccess),
    }
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
    cols.push('version VARCHAR(36) NOT NULL', `data ${dataType} NOT NULL`, `created_at BIGINT NOT NULL`, `updated_at BIGINT NOT NULL`)

    await this.sql.execute(`CREATE TABLE IF NOT EXISTS ${t} (${cols.join(', ')})`)

    if (this.hasObjectId)
      await this.createIndex(`idx_${t}_object_id`, 'object_id')
    if (this.hasSessionId)
      await this.createIndex(`idx_${t}_session_id`, 'session_id')
    if (this.hasObjectId && this.hasSessionId)
      await this.createIndex(`idx_${t}_object_session`, 'object_id, session_id')
    if (this.hasStatus)
      await this.createIndex(`idx_${t}_status`, 'status')
    if (this.hasRefId)
      await this.createIndex(`idx_${t}_ref_id`, 'ref_id')
    // 业务作用域索引：仅 PostgreSQL 支持 JSONB GIN，用于加速 data @> '{"scope":...}' 包含查询。
    if (this.hasScopeIndex && db === 'postgresql')
      await this.sql.execute(`CREATE INDEX IF NOT EXISTS idx_${t}_data_gin ON ${t} USING GIN (data jsonb_path_ops)`)
  }

  /**
   * MySQL 并发首次创建只接受明确的重复名称错误，并重读结构，权限/DDL/不匹配仍失败。
   */
  private async createIndex(name: string, columns: string): Promise<void> {
    if (this.dbType === 'mysql') {
      const read = async () => requireSqlSuccess(await this.sql.query<MysqlIndexColumn>(
        'SELECT COLUMN_NAME AS column_name, SEQ_IN_INDEX AS seq_in_index, NON_UNIQUE AS non_unique, SUB_PART AS sub_part, INDEX_TYPE AS index_type, COLLATION AS collation, IS_VISIBLE AS is_visible, EXPRESSION AS expression FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? ORDER BY SEQ_IN_INDEX',
        [this.table, name],
      )).data
      const expected = columns.split(',').map(column => column.trim())
      const matches = (definition: MysqlIndexColumn[]) => definition.length === expected.length
        && definition.every((column, index) => column.column_name === expected[index]
          && Number(column.seq_in_index) === index + 1 && Number(column.non_unique) === 1
          && column.sub_part === null && column.index_type === 'BTREE' && column.collation === 'A'
          && column.is_visible === 'YES' && column.expression === null)
      const existing = await read()
      if (existing.length > 0) {
        if (!matches(existing))
          throw new Error(aiM('ai_storeIndexMismatch'))
        return
      }
      try {
        await this.sql.execute(`CREATE INDEX ${name} ON ${this.table}(${columns})`)
      }
      catch (error) {
        if (!isMysqlDuplicateIndex(error))
          throw error
        // 两个节点都读到缺失时，败者只能在实际结构与预期一致后继续；不能吞掉其它失败。
        if (!matches(await read()))
          throw new Error(aiM('ai_storeIndexMismatch'), { cause: error })
      }
      return
    }
    await this.sql.execute(`CREATE INDEX IF NOT EXISTS ${name} ON ${this.table}(${columns})`)
  }

  /** 普通写入也更换版本，使并发条件写入识别所有较新修改。 */
  async save(id: string, data: T, scope?: StoreScope): Promise<void> {
    await this.saveManyBatch([{ id, data, scope }], this.buildSaveColumnNames())
  }

  /** SQLite TEXT 需要解码；PostgreSQL JSONB/MySQL JSON 已由驱动解码，包含标量字符串。 */
  private decodeData(value: unknown): T {
    if (this.dbType !== 'sqlite')
      return structuredClone(value) as T
    if (typeof value !== 'string')
      throw new TypeError('Invalid SQLite JSON record')
    return JSON.parse(value) as T
  }

  /** 数据和版本由同一次 SELECT 返回，禁止拆成两次不一致的读取。 */
  async readVersioned(id: string): Promise<AIVersionedRecord<T> | undefined> {
    const found = requireSqlSuccess(await this.sql.get<{ version: string, data: unknown }>(`SELECT version, data FROM ${this.table} WHERE id = ?`, [id]))
    if (!found.data)
      return undefined
    return { version: found.data.version, data: this.decodeData(found.data.data) }
  }

  /** 所有节点从持久化端读取租约时钟；不使用进程 Date.now() 判断共享 owner 是否过期。 */
  async currentTime(): Promise<number> {
    const found = requireSqlSuccess(await this.sql.get<{ now: number | string }>(`SELECT ${this.databaseClock()} AS now`))
    if (!found.data || !Number.isFinite(Number(found.data.now)))
      throw new Error('Store clock unavailable')
    return Math.floor(Number(found.data.now))
  }

  /** 仅由当前已验证的数据库类型选择时钟表达式。 */
  private databaseClock(): string {
    if (this.dbType === 'postgresql')
      return '(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)'
    if (this.dbType === 'mysql')
      // NOW/CURRENT_TIMESTAMP 固定在语句开始时；SYSDATE 在行锁等待结束后仍取实际时钟。
      return '(UNIX_TIMESTAMP(SYSDATE(3)) * 1000)'
    return 'CAST((julianday(\'now\') - 2440587.5) * 86400000 AS INTEGER)'
  }

  /** 原子检查版本和可选存储端期限；lease 续租或本地布尔值不能替代最终条件。 */
  async compareAndSwap(id: string, input: AIRelStoreCompareAndSwap<T>): Promise<string | undefined> {
    if (input.notAfter !== undefined && !Number.isSafeInteger(input.notAfter))
      throw new RangeError('Invalid Store write deadline')
    const version = crypto.randomUUID()
    const now = Date.now()
    const columns = this.buildSaveColumnNames()
    const values = this.buildSaveValues(id, input.data, input.scope, now)
    values[columns.indexOf('version')] = version
    const deadline = input.notAfter === undefined ? '1 = 1' : `${this.databaseClock()} < ?`
    const deadlineParams = input.notAfter === undefined ? [] : [input.notAfter]
    if (input.expectedVersion !== undefined) {
      const updated = columns.filter(column => column !== 'id' && column !== 'created_at'
        && (input.scope !== undefined || ['version', 'data', 'updated_at'].includes(column)))
      const result = requireSqlSuccess(await this.sql.execute(
        `UPDATE ${this.table} SET ${updated.map(column => `${column} = ?`).join(', ')} WHERE id = ? AND version = ? AND ${deadline}`,
        [...updated.map(column => values[columns.indexOf(column)]), id, input.expectedVersion, ...deadlineParams],
      ))
      return result.data.changes === 1 ? version : undefined
    }
    try {
      // MySQL 不用 INSERT IGNORE：除唯一主键冲突外，任何故障都必须向上抛出。
      const conflict = this.dbType === 'mysql' ? '' : ' ON CONFLICT(id) DO NOTHING'
      const result = requireSqlSuccess(await this.sql.execute(
        `INSERT INTO ${this.table} (${columns.join(', ')}) SELECT ${values.map(() => '?').join(', ')} WHERE ${deadline}${conflict}`,
        [...values, ...deadlineParams],
      ))
      return result.data.changes === 1 ? version : undefined
    }
    catch (error) {
      if (this.dbType === 'mysql') {
        let cause: unknown = error
        for (let depth = 0; depth < 8 && cause && typeof cause === 'object'; depth++) {
          if (('code' in cause && cause.code === 'ER_DUP_ENTRY') || ('errno' in cause && cause.errno === 1062))
            return undefined
          cause = 'cause' in cause ? cause.cause : undefined
        }
      }
      throw error
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
    const result = await this.sql.get<{ data: unknown }>(`SELECT data FROM ${this.table} WHERE id = ?`, [id])
    if (!result.success || !result.data)
      return undefined
    return this.decodeData(result.data.data)
  }

  async query(filter: StoreFilter<T>): Promise<T[]> {
    const { sql, params } = this.buildQuery(filter)
    const result = await this.sql.query<{ data: unknown }>(sql, params)
    if (!result.success)
      return []
    return result.data.map(row => this.decodeData(row.data))
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
    const result = await this.sql.query<{ data: unknown }>(pagedSql, [...params, page.limit, page.offset])
    const items = result.success ? result.data.map(row => this.decodeData(row.data)) : []

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
    colNames.push('version', 'data', 'created_at', 'updated_at')
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
    values.push(
      crypto.randomUUID(),
      JSON.stringify(data),
      dataTimestamp(data, 'createdAt', now),
      dataTimestamp(data, 'updatedAt', now),
    )
    return values
  }

  /** 构造跨数据库 upsert 更新片段；列名来自内部白名单，不接受外部输入。 */
  private buildSaveUpdateParts(): string[] {
    const valueRef = (column: string) => this.dbType === 'mysql' ? `VALUES(${column})` : `excluded.${column}`
    const updateParts: string[] = [`version = ${valueRef('version')}`, `data = ${valueRef('data')}`, `updated_at = ${valueRef('updated_at')}`]
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

/** 内部 Store 使用显式异常通知调用方，向量写入失败不能继续登记为成功。 */
function requireVecdbSuccess<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}

/** 以共享后端为准懒建集合；并发创建的 already-exists 可继续，其它错误必须传播。 */
async function ensureVecdbCollection(database: VecdbFunctions, name: string, dimension: number): Promise<void> {
  const exists = requireVecdbSuccess(await database.collection.exists(name))
  if (exists)
    return
  const created = await database.collection.create(name, { dimension })
  if (!created.success && created.error.code !== HaiVecdbError.COLLECTION_ALREADY_EXISTS.code)
    requireVecdbSuccess(created)
}

/**
 * 基于 vecdb 的持久化向量存储实现
 *
 * 使用 vecdb.vector / vecdb.collection 子对象操作向量数据。
 * 集合在首次 upsert 时按需创建（lazy），clear 时 drop 集合。
 */
class VecdbAIVectorStore implements AIVectorStore {
  private readonly vecdb: VecdbFunctions
  private readonly collection: string

  constructor(vecdb: VecdbFunctions, collection: string) {
    this.vecdb = vecdb
    this.collection = collection
  }

  async upsert(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    await ensureVecdbCollection(this.vecdb, this.collection, vector.length)
    requireVecdbSuccess(await this.vecdb.vector.upsert(this.collection, [{ id, vector, metadata }]))
  }

  async search(vector: number[], options?: { topK?: number, minScore?: number, filter?: Record<string, unknown> }): Promise<Array<{ id: string, score: number, content?: string, metadata?: Record<string, unknown> }>> {
    // 过滤校验/执行失败必须向上层传播，不能伪装成空的合法检索结果。
    return requireVecdbSuccess(await this.vecdb.vector.search(this.collection, vector, options))
  }

  async remove(id: string): Promise<void> {
    await this.vecdb.vector.delete(this.collection, [id])
  }

  async clear(_filter?: Record<string, unknown>): Promise<void> {
    const exists = await this.vecdb.collection.exists(this.collection)
    if (exists.success && exists.data) {
      await this.vecdb.collection.drop(this.collection)
    }
  }
}

// ─── Provider 工厂 ───

/**
 * DB Provider 依赖
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function bind(sql: DmlOperations, jsonOps: ReldbJsonOps, vector: VecdbFunctions): DbStoreProviderDeps {
 *   return { sql, jsonOps, dbType: 'postgresql', vecdb: vector }
 * }
 * ```
 */
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
 * MySQL 首次建索引只在明确的 1061 重复名称后重查并接受匹配结构；其它 DDL 失败向上传播。
 * initialize 等待全部已启动 DDL 结束，失败不回滚 MySQL 已创建结构，也不关闭调用方的依赖。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function prepare(deps: DbStoreProviderDeps) {
 *   const provider = createDbStoreProvider(deps)
 *   const store = provider.createRelStore<{ title: string }>('hai_ai_example', { hasObjectId: true })
 *   await provider.initialize()
 *   await store.save('doc-1', { title: '指南' }, { objectId: 'user-1' })
 *   await provider.close?.() // 只释放本 Provider 状态；借用的 reldb/vecdb 由调用方关闭。
 * }
 * ```
 */
export function createDbStoreProvider(deps: DbStoreProviderDeps): AIStoreProvider {
  const { sql, jsonOps, vecdb: vecdbDep } = deps
  const dbType = deps.dbType ?? 'sqlite'

  /** 按表归组，避免同表 Store 并发 DDL 竞争 PostgreSQL 系统目录。 */
  const relStores = new Map<string, ReldbAIRelStore<unknown>[]>()

  return {
    name: 'db',
    get stateScope(): 'local' | 'shared' {
      const vector = vecdbDep.config
      const sharedVector = vector?.type === 'qdrant' || vector?.type === 'pgvector' || (vector?.type === 'chroma' && (!vector.path || Boolean(vector.url)))
      return dbType !== 'sqlite' && sharedVector ? 'shared' : 'local'
    },

    createRelStore<T>(name: string, options?: AIRelStoreOptions): AIRelStore<T> {
      const store = new ReldbAIRelStore<T>(sql, name, jsonOps, dbType, options)
      const stores = relStores.get(name) ?? []
      stores.push(store as ReldbAIRelStore<unknown>)
      relStores.set(name, stores)
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
      const documents = new ReldbAIRelStore<KnowledgeDocumentManifest>(sql, 'hai_ai_knowledge_documents', jsonOps, dbType, { hasObjectId: true, hasSessionId: true })
      const collections = new ReldbAIRelStore<KnowledgeCollectionManifest>(sql, 'hai_ai_knowledge_collections', jsonOps, dbType)
      return createDbKnowledgeStore({
        documents,
        collections,
        vecdb: vecdbDep,
        prepare: async () => {
          await documents.createTable()
          await collections.createTable()
        },
      })
    },

    async initialize(): Promise<void> {
      if (relStores.size > 0) {
        // 同表串行、独立表并行；失败后仍等待所有在途 DDL，避免关闭连接时操作尚未结束。
        const results = await Promise.allSettled([...relStores.values()].map(async (stores) => {
          for (const store of stores)
            await store.createTable()
        }))
        for (const result of results) {
          if (result.status === 'rejected')
            throw result.reason
        }
        logger.debug('DB store provider initialized', { tableCount: relStores.size })
      }
    },

    async close(): Promise<void> {
      relStores.clear()
    },
  }
}

// ─── Singleton 便捷工厂 ───

/**
 * 检查 reldb + vecdb 是否已初始化
 *
 * 由 ai-main.ts 在创建默认 DB Provider 前调用。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * if (!isDbStoreAvailable()) {
 *   const missing = getUnavailableDbDeps()
 *   throw new Error('Missing AI dependencies: ' + missing.join(', '))
 * }
 * ```
 */
export function isDbStoreAvailable(): boolean {
  return reldb.isInitialized && vecdb.isInitialized
}

/**
 * 获取未初始化的依赖名称列表
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const missing = getUnavailableDbDeps()
 * if (missing.length > 0) throw new Error('Initialize first: ' + missing.join(', '))
 * ```
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
 * 从已初始化的 reldb/vecdb 单例创建默认 DB Provider。
 *
 * 调用方先检查依赖就绪；生产共享能力由实际数据库和向量后端决定，不由配置标签推断。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * if (!isDbStoreAvailable()) throw new Error('Initialize reldb and vecdb first')
 * const provider = createDbStoreProviderFromModules()
 * provider.createRelStore<{ content: string }>('hai_ai_notes')
 * await provider.initialize()
 * await provider.close?.()
 * ```
 */
export function createDbStoreProviderFromModules(): AIStoreProvider {
  return createDbStoreProvider({
    sql: reldb.sql,
    jsonOps: reldb.json,
    dbType: reldb.config?.type,
    vecdb,
  })
}
