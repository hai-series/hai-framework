/**
 * 默认 DB StoreProvider 测试
 *
 * 默认 Provider 不在公共入口暴露；这里聚焦批量 SQL 生成，避免 saveMany 退化为逐条写入。
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { DmlOperations, QueryRow, ReldbJsonOps } from '@h-ai/reldb'
import type { VecdbFunctions } from '@h-ai/vecdb'

import { describe, expect, it, vi } from 'vitest'

import { createDbStoreProvider } from '../src/store/providers/ai-store-provider-db.js'

interface ExecuteCall {
  sql: string
  params?: unknown[]
}

function ok<T>(data: T): HaiResult<T> {
  return { success: true, data }
}

function createMockSql(calls: ExecuteCall[]): DmlOperations {
  return {
    query: async <T = QueryRow>() => ok<T[]>([]),
    get: async <T = QueryRow>() => ok<T | null>(null),
    execute: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params })
      return ok({ changes: 1 })
    },
    batch: async () => ok(undefined),
    queryPage: async <T = QueryRow>() => ok<PaginatedResult<T>>({ items: [], total: 0, page: 1, pageSize: 20 }),
  }
}

const jsonOps: ReldbJsonOps = {
  extract: (column, path) => ({ sql: column, params: [path] }),
  set: (column, path, value) => ({ sql: column, params: [path, value] }),
  insert: (column, path, value) => ({ sql: column, params: [path, value] }),
  remove: (column, path) => ({ sql: column, params: [path] }),
  merge: (column, patch) => ({ sql: column, params: [patch] }),
}

function createMockVecdb(): VecdbFunctions {
  return {
    init: async () => ok(undefined),
    close: async () => ok(undefined),
    config: null,
    isInitialized: true,
    collection: {
      create: async () => ok(undefined),
      drop: async () => ok(undefined),
      exists: async () => ok(false),
      info: async name => ok({ name, dimension: 0, metric: 'cosine', count: 0 }),
      list: async () => ok([]),
    },
    vector: {
      insert: async () => ok(undefined),
      upsert: async () => ok(undefined),
      delete: async () => ok(undefined),
      search: async () => ok([]),
      count: async () => ok(0),
    },
  }
}

describe('db store provider saveMany', () => {
  it('mysql 索引创建使用合法语法并跳过已有索引', async () => {
    const calls: ExecuteCall[] = []
    const sql = createMockSql(calls)
    const get = vi.spyOn(sql, 'get')
    const provider = createDbStoreProvider({ sql, jsonOps, dbType: 'mysql', vecdb: createMockVecdb() })
    provider.createRelStore('hai_ai_indexed', { hasObjectId: true, hasSessionId: true, hasStatus: true, hasRefId: true })
    await provider.initialize()
    const indexes = calls.filter(call => call.sql.startsWith('CREATE INDEX'))
    expect(indexes).toHaveLength(5)
    expect(indexes.every(call => !call.sql.includes('IF NOT EXISTS'))).toBe(true)
    expect(get).toHaveBeenCalledWith(expect.stringContaining('TABLE_SCHEMA = DATABASE()'), ['hai_ai_indexed', 'idx_hai_ai_indexed_object_id'])

    calls.length = 0
    get.mockResolvedValue(ok({ INDEX_NAME: 'existing' }))
    await provider.initialize()
    expect(calls.filter(call => call.sql.startsWith('CREATE INDEX'))).toHaveLength(0)
  })

  it('sQL 写入或查询失败不能变成成功、空数组或缺失记录', async () => {
    const sql = createMockSql([])
    const failure = { success: false as const, error: { code: 'hai:reldb:002', message: 'database unavailable' } }
    sql.execute = async () => failure
    sql.query = async () => failure
    sql.get = async () => failure
    const provider = createDbStoreProvider({ sql, jsonOps, dbType: 'sqlite', vecdb: createMockVecdb() })
    const store = provider.createRelStore<{ title: string }>('hai_ai_failure')
    for (const operation of [
      () => provider.initialize(),
      () => store.save('id', { title: 'test' }),
      () => store.get('id'),
      () => store.query({}),
      () => store.queryPage({}, { limit: 10, offset: 0 }),
      () => store.remove('id'),
      () => store.count(),
      () => store.clear(),
    ]) {
      await expect(operation()).rejects.toThrow('database unavailable')
    }
  })

  it('使用业务数据的时间字段填充索引列', async () => {
    const calls: ExecuteCall[] = []
    const provider = createDbStoreProvider({ sql: createMockSql(calls), jsonOps, dbType: 'sqlite', vecdb: createMockVecdb() })
    const store = provider.createRelStore<{ createdAt: number, updatedAt: number }>('hai_ai_timestamped')

    await store.save('id-1', { createdAt: 100, updatedAt: 200 })

    expect(calls[0].params?.slice(-2)).toEqual([100, 200])
  })

  it('小批量数据使用单条参数化 upsert', async () => {
    const calls: ExecuteCall[] = []
    const provider = createDbStoreProvider({ sql: createMockSql(calls), jsonOps, dbType: 'sqlite', vecdb: createMockVecdb() })
    const store = provider.createRelStore<{ title: string }>('hai_ai_test', {
      hasObjectId: true,
      hasSessionId: true,
      hasStatus: true,
      hasRefId: true,
    })

    await store.saveMany([
      { id: 'id-1', data: { title: 'first' }, scope: { objectId: 'obj', sessionId: 'sess', status: 'ready', refId: 'ref-1' } },
      { id: 'id-2', data: { title: 'second' }, scope: { objectId: 'obj', sessionId: 'sess', status: 'ready', refId: 'ref-2' } },
    ])

    expect(calls).toHaveLength(1)
    const sql = calls[0].sql.replace(/\s+/g, ' ')
    const params = calls[0].params ?? []
    expect(sql).toContain('INSERT INTO hai_ai_test (id, object_id, session_id, status, ref_id, data, created_at, updated_at)')
    expect(sql).toContain('VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)')
    expect(sql).toContain('ON CONFLICT(id) DO UPDATE SET data = excluded.data')
    expect(params).toHaveLength(16)
    expect(params.slice(0, 6)).toEqual(['id-1', 'obj', 'sess', 'ready', 'ref-1', JSON.stringify({ title: 'first' })])
    expect(params.slice(8, 14)).toEqual(['id-2', 'obj', 'sess', 'ready', 'ref-2', JSON.stringify({ title: 'second' })])
    expect(typeof params[6]).toBe('number')
    expect(typeof params[14]).toBe('number')
  })

  it('超过参数预算时按批拆分', async () => {
    const calls: ExecuteCall[] = []
    const provider = createDbStoreProvider({ sql: createMockSql(calls), jsonOps, dbType: 'mysql', vecdb: createMockVecdb() })
    const store = provider.createRelStore<{ index: number }>('hai_ai_batch')
    const items = Array.from({ length: 226 }, (_, index) => ({ id: `id-${index}`, data: { index } }))

    await store.saveMany(items)

    expect(calls).toHaveLength(2)
    expect(calls[0].sql).toContain('ON DUPLICATE KEY UPDATE data = VALUES(data)')
    expect(calls[0].params).toHaveLength(900)
    expect(calls[1].params).toHaveLength(4)
  })
})

// =============================================================================
// 业务作用域索引（scope index）
// =============================================================================

function createMockSqlWithQuery(execCalls: ExecuteCall[], queryCalls: ExecuteCall[]): DmlOperations {
  return {
    query: async <T = QueryRow>(sql: string, params?: unknown[]) => {
      queryCalls.push({ sql, params })
      return ok<T[]>([])
    },
    get: async <T = QueryRow>() => ok<T | null>(null),
    execute: async (sql: string, params?: unknown[]) => {
      execCalls.push({ sql, params })
      return ok({ changes: 1 })
    },
    batch: async () => ok(undefined),
    queryPage: async <T = QueryRow>() => ok<PaginatedResult<T>>({ items: [], total: 0, page: 1, pageSize: 20 }),
  }
}

describe('db store provider scope index', () => {
  it('hasScopeIndex 在 PostgreSQL 上建 JSONB GIN 索引', async () => {
    const execCalls: ExecuteCall[] = []
    const provider = createDbStoreProvider({ sql: createMockSql(execCalls), jsonOps, dbType: 'postgresql', vecdb: createMockVecdb() })
    provider.createRelStore('hai_ai_memory', { hasObjectId: true, hasScopeIndex: true })
    await provider.initialize()

    const ginIndex = execCalls.find(c => c.sql.includes('USING GIN'))
    expect(ginIndex).toBeDefined()
    expect(ginIndex?.sql).toContain('idx_hai_ai_memory_data_gin')
    expect(ginIndex?.sql).toContain('data jsonb_path_ops')
  })

  it('sqlite 不建 GIN 索引（不支持）', async () => {
    const execCalls: ExecuteCall[] = []
    const provider = createDbStoreProvider({ sql: createMockSql(execCalls), jsonOps, dbType: 'sqlite', vecdb: createMockVecdb() })
    provider.createRelStore('hai_ai_memory', { hasObjectId: true, hasScopeIndex: true })
    await provider.initialize()

    expect(execCalls.some(c => c.sql.includes('USING GIN'))).toBe(false)
  })

  it('query scope 在 PostgreSQL 下推为 data @> ?::jsonb', async () => {
    const queryCalls: ExecuteCall[] = []
    const provider = createDbStoreProvider({ sql: createMockSqlWithQuery([], queryCalls), jsonOps, dbType: 'postgresql', vecdb: createMockVecdb() })
    const store = provider.createRelStore<{ content: string }>('hai_ai_memory', { hasObjectId: true, hasScopeIndex: true })

    await store.query({ objectId: 'u1', scope: { topicId: 'C', personaId: 'p1' } })

    expect(queryCalls).toHaveLength(1)
    const sql = queryCalls[0].sql.replace(/\s+/g, ' ')
    expect(sql).toContain('data @> ?::jsonb')
    // 包含参数为 { scope: {...} } 的 JSON 序列化
    expect(queryCalls[0].params).toContain(JSON.stringify({ scope: { topicId: 'C', personaId: 'p1' } }))
  })

  it('query scope 在 SQLite 上不下推（no-op，内存过滤）', async () => {
    const queryCalls: ExecuteCall[] = []
    const provider = createDbStoreProvider({ sql: createMockSqlWithQuery([], queryCalls), jsonOps, dbType: 'sqlite', vecdb: createMockVecdb() })
    const store = provider.createRelStore<{ content: string }>('hai_ai_memory', { hasObjectId: true, hasScopeIndex: true })

    await store.query({ objectId: 'u1', scope: { topicId: 'C' } })

    expect(queryCalls).toHaveLength(1)
    expect(queryCalls[0].sql).not.toContain('@>')
    expect(queryCalls[0].params).not.toContain(JSON.stringify({ scope: { topicId: 'C' } }))
  })
})
