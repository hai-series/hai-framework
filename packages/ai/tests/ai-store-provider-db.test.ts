/**
 * 默认 DB StoreProvider 测试
 *
 * 默认 Provider 不在公共入口暴露；这里聚焦批量 SQL 生成，避免 saveMany 退化为逐条写入。
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { DmlOperations, QueryRow, ReldbJsonOps } from '@h-ai/reldb'
import type { VecdbFunctions } from '@h-ai/vecdb'

import { describe, expect, it } from 'vitest'

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
