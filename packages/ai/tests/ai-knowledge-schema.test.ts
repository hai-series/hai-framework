/**
 * AI Knowledge Schema 单元测试
 *
 * 测试 DDL 创建、实体 CRUD、倒排索引查询。
 * 使用 mock DataOps 模拟 reldb 操作。
 */

import type { Result } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { AIErrorCode } from '../src/ai-config.js'
import {
  createKnowledgeSchema,
  findByEntityName,
  findDocumentsByEntityIds,
  findEntitiesByName,
  insertEntityDocument,
  listEntities,
  upsertEntity,
} from '../src/knowledge/ai-knowledge-schema.js'

// ─── Mock DataOps ───

function createMockDataOps() {
  const executeCalls: Array<{ sql: string, params?: unknown[] }> = []
  const queryCalls: Array<{ sql: string, params?: unknown[] }> = []

  /** 可通过设置此属性来模拟 execute 失败 */
  let executeShouldFail = false
  let queryShouldFail = false

  /** query 返回的行数据 */
  let queryRows: Array<Record<string, unknown>> = []

  const dataOps = {
    execute: vi.fn(async (sql: string, params?: unknown[]): Promise<Result<unknown, unknown>> => {
      executeCalls.push({ sql, params })
      if (executeShouldFail) {
        return { success: false, error: { message: 'DB execute failed' } } as any
      }
      return { success: true, data: { lastInsertRowid: 1, changes: 1 } } as any
    }),
    query: vi.fn(async <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Result<T[], unknown>> => {
      queryCalls.push({ sql, params })
      if (queryShouldFail) {
        return { success: false, error: { message: 'DB query failed' } } as any
      }
      return { success: true, data: queryRows as T[] } as any
    }),
  }

  return {
    dataOps,
    executeCalls,
    queryCalls,
    setExecuteFail: (v: boolean) => { executeShouldFail = v },
    setQueryFail: (v: boolean) => { queryShouldFail = v },
    setQueryRows: (rows: Array<Record<string, unknown>>) => { queryRows = rows },
  }
}

// ─── DDL 创建 ───

describe('knowledge schema DDL', () => {
  it('创建所有表和索引', async () => {
    const { dataOps, executeCalls } = createMockDataOps()

    const result = await createKnowledgeSchema(dataOps)
    expect(result.success).toBe(true)

    // 应执行 6 条 DDL：2 个表 + 4 个索引
    expect(executeCalls.length).toBe(6)
    expect(executeCalls[0].sql).toContain('knowledge_entity')
    expect(executeCalls[3].sql).toContain('knowledge_entity_document')
  })

  it('dDL 执行失败返回错误', async () => {
    const { dataOps, setExecuteFail } = createMockDataOps()
    setExecuteFail(true)

    const result = await createKnowledgeSchema(dataOps)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.KNOWLEDGE_SETUP_FAILED)
    }
  })
})

// ─── 实体 CRUD ───

describe('knowledge 实体 CRUD', () => {
  it('upsertEntity — 写入实体', async () => {
    const { dataOps, executeCalls } = createMockDataOps()

    const result = await upsertEntity(dataOps, {
      id: 'ent-abc',
      name: 'Alice',
      type: 'person',
      aliases: ['Alice W', 'Dr. Alice'],
      description: 'A researcher',
    })

    expect(result.success).toBe(true)
    expect(executeCalls.length).toBe(1)
    expect(executeCalls[0].sql).toContain('INSERT OR REPLACE')
    expect(executeCalls[0].params).toContain('ent-abc')
    expect(executeCalls[0].params).toContain('Alice')
    expect(executeCalls[0].params).toContain('person')
    // aliases 应序列化为 JSON
    expect(executeCalls[0].params![3]).toBe(JSON.stringify(['Alice W', 'Dr. Alice']))
  })

  it('upsertEntity — DB 失败返回错误', async () => {
    const { dataOps, setExecuteFail } = createMockDataOps()
    setExecuteFail(true)

    const result = await upsertEntity(dataOps, {
      id: 'ent-abc',
      name: 'Alice',
      type: 'person',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.KNOWLEDGE_INGEST_FAILED)
    }
  })

  it('insertEntityDocument — 写入文档-实体关联', async () => {
    const { dataOps, executeCalls } = createMockDataOps()

    const result = await insertEntityDocument(dataOps, {
      entityId: 'ent-abc',
      documentId: 'doc-1',
      chunkId: 'doc-1:chunk-0',
      collection: 'knowledge',
      relevance: 0.9,
      context: 'Some context text',
    })

    expect(result.success).toBe(true)
    expect(executeCalls.length).toBe(1)
    expect(executeCalls[0].sql).toContain('knowledge_entity_document')
    expect(executeCalls[0].params).toContain('ent-abc')
    expect(executeCalls[0].params).toContain('doc-1')
  })

  it('insertEntityDocument — 缺少 chunkId 使用空字符串', async () => {
    const { dataOps, executeCalls } = createMockDataOps()

    const result = await insertEntityDocument(dataOps, {
      entityId: 'ent-abc',
      documentId: 'doc-1',
      collection: 'knowledge',
    })

    expect(result.success).toBe(true)
    // chunkId 参数位置应为空字符串
    expect(executeCalls[0].params![2]).toBe('')
  })
})

// ─── 查询操作 ───

describe('knowledge 查询操作', () => {
  it('findEntitiesByName — 模糊搜索实体', async () => {
    const { dataOps, setQueryRows } = createMockDataOps()
    setQueryRows([
      { id: 'ent-1', name: 'Alice Wang', type: 'person', aliases: JSON.stringify(['Dr. Alice']) },
      { id: 'ent-2', name: 'Alice Zhang', type: 'person', aliases: null },
    ])

    const result = await findEntitiesByName(dataOps, 'Alice')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(2)
      expect(result.data[0].id).toBe('ent-1')
      expect(result.data[0].name).toBe('Alice Wang')
      expect(result.data[0].aliases).toEqual(['Dr. Alice'])
      expect(result.data[1].aliases).toEqual([])
    }
  })

  it('findEntitiesByName — DB 失败返回错误', async () => {
    const { dataOps, setQueryFail } = createMockDataOps()
    setQueryFail(true)

    const result = await findEntitiesByName(dataOps, 'Alice')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.KNOWLEDGE_RETRIEVE_FAILED)
    }
  })

  it('findDocumentsByEntityIds — 空 ID 列表返回空', async () => {
    const { dataOps } = createMockDataOps()

    const result = await findDocumentsByEntityIds(dataOps, [])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('findDocumentsByEntityIds — 返回倒排索引结果', async () => {
    const { dataOps, setQueryRows } = createMockDataOps()
    setQueryRows([
      { entity_id: 'ent-1', document_id: 'doc-1', chunk_id: 'doc-1:chunk-0', collection: 'knowledge', relevance: 1.0, context: 'Some text' },
      { entity_id: 'ent-1', document_id: 'doc-2', chunk_id: 'doc-2:chunk-1', collection: 'knowledge', relevance: 0.8, context: null },
    ])

    const result = await findDocumentsByEntityIds(dataOps, ['ent-1'])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(2)
      expect(result.data[0].entityId).toBe('ent-1')
      expect(result.data[0].documentId).toBe('doc-1')
      expect(result.data[0].collection).toBe('knowledge')
      expect(result.data[1].context).toBeNull()
    }
  })

  it('findDocumentsByEntityIds — 按 collection 过滤', async () => {
    const { dataOps, queryCalls, setQueryRows } = createMockDataOps()
    setQueryRows([])

    await findDocumentsByEntityIds(dataOps, ['ent-1', 'ent-2'], 'my-collection')
    expect(queryCalls.length).toBe(1)
    expect(queryCalls[0].sql).toContain('AND collection = ?')
    expect(queryCalls[0].params).toContain('my-collection')
  })

  it('listEntities — 列出实体（带过滤）', async () => {
    const { dataOps, queryCalls, setQueryRows } = createMockDataOps()
    setQueryRows([
      { id: 'ent-1', name: 'Alice', type: 'person', aliases: null, description: 'A researcher', created_at: '2024-01-01', updated_at: '2024-01-02' },
    ])

    const result = await listEntities(dataOps, { type: 'person', keyword: 'Alice', limit: 10 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(1)
      expect(result.data[0].name).toBe('Alice')
      expect(result.data[0].createdAt).toBe('2024-01-01')
    }

    // 验证 SQL 包含过滤条件
    expect(queryCalls[0].sql).toContain('AND type = ?')
    expect(queryCalls[0].sql).toContain('AND (name LIKE ?')
    expect(queryCalls[0].sql).toContain('LIMIT ?')
  })

  it('listEntities — 无过滤列出所有', async () => {
    const { dataOps, queryCalls, setQueryRows } = createMockDataOps()
    setQueryRows([])

    const result = await listEntities(dataOps)
    expect(result.success).toBe(true)
    // 不应有过滤条件
    expect(queryCalls[0].sql).not.toContain('AND type')
    expect(queryCalls[0].sql).not.toContain('LIMIT')
  })
})

// ─── findByEntityName（组合查询）───

describe('knowledge findByEntityName', () => {
  it('查询实体及其关联文档', async () => {
    const { dataOps, setQueryRows: _setQueryRows } = createMockDataOps()

    // 模拟两次 query 调用：第一次查实体，第二次查关联文档
    let queryCallIndex = 0
    dataOps.query.mockImplementation(async () => {
      queryCallIndex++
      if (queryCallIndex === 1) {
        return {
          success: true,
          data: [{ id: 'ent-1', name: 'Alice', type: 'person', aliases: null }],
        }
      }
      return {
        success: true,
        data: [
          { entity_id: 'ent-1', document_id: 'doc-1', chunk_id: 'c0', collection: 'knowledge', relevance: 1.0, context: 'context text' },
        ],
      }
    })

    const result = await findByEntityName(dataOps, 'Alice')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(1)
      expect(result.data[0].entity.name).toBe('Alice')
      expect(result.data[0].documents.length).toBe(1)
      expect(result.data[0].documents[0].documentId).toBe('doc-1')
      expect(result.data[0].documents[0].collection).toBe('knowledge')
    }
  })

  it('实体不存在返回空数组', async () => {
    const { dataOps } = createMockDataOps()
    dataOps.query.mockImplementation(async () => ({
      success: true,
      data: [],
    }))

    const result = await findByEntityName(dataOps, 'NonExistent')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('按 type 过滤', async () => {
    const { dataOps } = createMockDataOps()

    let queryCallIndex = 0
    dataOps.query.mockImplementation(async () => {
      queryCallIndex++
      if (queryCallIndex === 1) {
        return {
          success: true,
          data: [
            { id: 'ent-1', name: 'Alice', type: 'person', aliases: null },
            { id: 'ent-2', name: 'Alice Protocol', type: 'project', aliases: null },
          ],
        }
      }
      return { success: true, data: [] }
    })

    const result = await findByEntityName(dataOps, 'Alice', { type: 'person' })
    expect(result.success).toBe(true)
    if (result.success) {
      // 应只返回 type=person 的实体
      expect(result.data.length).toBe(1)
      expect(result.data[0].entity.name).toBe('Alice')
    }
  })
})
