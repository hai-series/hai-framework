import type { AgentExecutor } from '@a2a-js/sdk/server'
import type { DmlOperations, ReldbJsonOps } from '@h-ai/reldb'
import { describe, expect, it, vi } from 'vitest'
import { AIErrorCode } from '../ai-config.js'
import { createA2AOperations } from './ai-a2a-functions.js'

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
    get: vi.fn(async () => ({ success: true, data: { cnt: 0 } })),
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

function createMockExecutor(): AgentExecutor {
  return {
    execute: vi.fn(async () => {}),
    cancelTask: vi.fn(async () => {}),
  }
}

describe('A2A persistence bootstrap', () => {
  it('listMessages returns STORE_FAILED when table bootstrap fails', async () => {
    const { sql, mocks } = createMockSql()
    mocks.execute.mockResolvedValueOnce(failedResult('ddl failed'))
    const operations = createA2AOperations(
      {
        agentCard: { name: 'test-agent', url: 'https://example.com' },
        executor: createMockExecutor(),
      },
      {
        sql,
        jsonOps: createMockJsonOps(),
        dbType: 'sqlite',
      },
    )

    const result = await operations.listMessages({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.STORE_FAILED)
    }
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('bootstraps A2A tables once and reuses the same ready barrier', async () => {
    const { sql, mocks } = createMockSql()
    const operations = createA2AOperations(
      {
        agentCard: { name: 'test-agent', url: 'https://example.com' },
        executor: createMockExecutor(),
      },
      {
        sql,
        jsonOps: createMockJsonOps(),
        dbType: 'sqlite',
      },
    )

    const first = await operations.listMessages({ limit: 10 })
    const second = await operations.listMessages({ limit: 10 })

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(mocks.execute).toHaveBeenCalledTimes(10)
  })
})
