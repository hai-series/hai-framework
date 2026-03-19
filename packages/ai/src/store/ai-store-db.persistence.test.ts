import type { DmlOperations, ReldbJsonOps } from '@h-ai/reldb'
import { describe, expect, it, vi } from 'vitest'
import { ReldbAIStore } from './ai-store-db.js'

interface SqlMocks {
  query: ReturnType<typeof vi.fn>
  get: ReturnType<typeof vi.fn>
  execute: ReturnType<typeof vi.fn>
  batch: ReturnType<typeof vi.fn>
  queryPage: ReturnType<typeof vi.fn>
}

function failedResult(message: string) {
  return {
    success: false as const,
    error: {
      code: 'QUERY_FAILED',
      message,
    },
  }
}

function createMockSql(): { sql: DmlOperations, mocks: SqlMocks } {
  const mocks: SqlMocks = {
    query: vi.fn(async () => ({ success: true, data: [] })),
    get: vi.fn(async () => ({ success: true, data: null })),
    execute: vi.fn(async () => ({ success: true, data: { changes: 1 } })),
    batch: vi.fn(async () => ({ success: true, data: undefined })),
    queryPage: vi.fn(async () => ({ success: true, data: {} })),
  }

  const sql: DmlOperations = {
    query: mocks.query as unknown as DmlOperations['query'],
    get: mocks.get as unknown as DmlOperations['get'],
    execute: mocks.execute as unknown as DmlOperations['execute'],
    batch: mocks.batch as unknown as DmlOperations['batch'],
    queryPage: mocks.queryPage as unknown as DmlOperations['queryPage'],
  }
  return { sql, mocks }
}

function createMockJsonOps(): ReldbJsonOps {
  return {
    extract: vi.fn((column: string, path: string) => ({ sql: `json_extract(${column}, ?)`, params: [path] })),
    set: vi.fn((column: string, path: string, value: unknown) => ({ sql: `json_set(${column}, ?, ?)`, params: [path, value] })),
    insert: vi.fn((column: string, path: string, value: unknown) => ({ sql: `json_insert(${column}, ?, ?)`, params: [path, value] })),
    remove: vi.fn((column: string, path: string) => ({ sql: `json_remove(${column}, ?)`, params: [path] })),
    merge: vi.fn((column: string, patch: Record<string, unknown>) => ({ sql: `json_patch(${column}, ?)`, params: [patch] })),
  }
}

describe('ReldbAIStore persistence error semantics', () => {
  it('createTable propagates execute failure', async () => {
    const { sql, mocks } = createMockSql()
    mocks.execute.mockResolvedValueOnce(failedResult('ddl failed'))
    const store = new ReldbAIStore<{ value: string }>(sql, 'hai_test_store', createMockJsonOps(), { dbType: 'sqlite' })

    await expect(store.createTable()).rejects.toThrow('create table failed')
  })

  it('save propagates write failure', async () => {
    const { sql, mocks } = createMockSql()
    mocks.execute.mockResolvedValueOnce(failedResult('write failed'))
    const store = new ReldbAIStore<{ value: string }>(sql, 'hai_test_store', createMockJsonOps(), { dbType: 'sqlite' })

    await expect(store.save('id-1', { value: 'x' })).rejects.toThrow('save upsert failed')
  })

  it('get propagates read failure instead of returning undefined', async () => {
    const { sql, mocks } = createMockSql()
    mocks.get.mockResolvedValueOnce(failedResult('read failed'))
    const store = new ReldbAIStore<{ value: string }>(sql, 'hai_test_store', createMockJsonOps(), { dbType: 'sqlite' })

    await expect(store.get('id-1')).rejects.toThrow('get by id failed')
  })

  it('query and removeBy propagate database failures', async () => {
    const { sql, mocks } = createMockSql()
    const store = new ReldbAIStore<{ value: string }>(sql, 'hai_test_store', createMockJsonOps(), { dbType: 'sqlite' })

    mocks.query.mockResolvedValueOnce(failedResult('query failed'))
    await expect(store.query({})).rejects.toThrow('query by filter failed')

    mocks.get.mockResolvedValueOnce({ success: true, data: { cnt: 1 } })
    mocks.execute.mockResolvedValueOnce(failedResult('delete failed'))
    await expect(store.removeBy({ where: { value: 'x' } })).rejects.toThrow('removeBy delete failed')
  })
})
