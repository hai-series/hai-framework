/**
 * AI Retrieval 子模块单元测�?
 *
 * 测试检索源管理：addSource / removeSource / listSources�?
 * retrieve 需�?embedding + vecdb，此处仅测试源管理�?
 */

import type { EmbeddingOperations } from '../src/embedding/ai-embedding-types.js'
import type { RetrievalSource } from '../src/retrieval/ai-retrieval-types.js'
import type { AIRelStore, AIStoreProvider } from '../src/store/ai-store-types.js'
import { describe, expect, it } from 'vitest'
import { AIErrorCode } from '../src/ai-config.js'
import { createRetrievalOperations } from '../src/retrieval/ai-retrieval-functions.js'

// ─── Mock Embedding ───

const mockEmbedding: EmbeddingOperations = {
  embed: async () => ({ success: true, data: { model: 'test', data: [{ index: 0, embedding: [0.1, 0.2] }], usage: { prompt_tokens: 1, total_tokens: 1 } } }) as any,
  embedText: async () => ({ success: true, data: [0.1, 0.2, 0.3] }) as any,
  embedBatch: async () => ({ success: true, data: [[0.1], [0.2]] }) as any,
}

// ─── Mock AIStoreProvider ───

const mockStoreProvider: AIStoreProvider = {
  name: 'mock',
  createRelStore: () => ({ save: async () => {}, saveMany: async () => {}, get: async () => undefined, query: async () => [], queryPage: async () => ({ items: [], total: 0 }), remove: async () => false, removeBy: async () => 0, count: async () => 0, clear: async () => {} }) as any,
  createVectorStore: () => ({ upsert: async () => {}, search: async () => [], remove: async () => {}, clear: async () => {} }),
  initialize: async () => {},
}

// ─── Mock AIStore<RetrievalSource>（内存实现，测试隔离用）───

function createMockSourceStore(): AIRelStore<RetrievalSource> {
  const store = new Map<string, RetrievalSource>()
  return {
    async save(id, data) { store.set(id, data) },
    async saveMany(items) { for (const { id, data } of items) store.set(id, data) },
    async get(id) { return store.get(id) },
    async query() { return Array.from(store.values()) },
    async queryPage(_, page) {
      const items = Array.from(store.values())
      return { items: items.slice(page.offset, page.offset + page.limit), total: items.length }
    },
    async remove(id) { return store.delete(id) },
    async removeBy() { return 0 },
    async count() { return store.size },
    async clear() { store.clear() },
  }
}

// ─── 源管�?───

describe('retrieval 源管�?, () => {
  it('添加�?, async () => {
    const ops = createRetrievalOperations(mockEmbedding, mockStoreProvider, createMockSourceStore())
    const result = await ops.addSource({ id: 'wiki', collection: 'wiki-docs', topK: 5 })
    expect(result.success).toBe(true)
  })

  it('添加重复源返回错�?, async () => {
    const ops = createRetrievalOperations(mockEmbedding, mockStoreProvider, createMockSourceStore())
    await ops.addSource({ id: 'wiki', collection: 'wiki-docs' })
    const result = await ops.addSource({ id: 'wiki', collection: 'other' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.RETRIEVAL_FAILED)
    }
  })

  it('列出�?, async () => {
    const ops = createRetrievalOperations(mockEmbedding, mockStoreProvider, createMockSourceStore())
    await ops.addSource({ id: 'wiki', collection: 'wiki-docs' })
    await ops.addSource({ id: 'kb', collection: 'knowledge-base' })
    const list = await ops.listSources()
    expect(list.length).toBe(2)
    expect(list.map(s => s.id)).toContain('wiki')
    expect(list.map(s => s.id)).toContain('kb')
  })

  it('删除�?, async () => {
    const ops = createRetrievalOperations(mockEmbedding, mockStoreProvider, createMockSourceStore())
    await ops.addSource({ id: 'wiki', collection: 'wiki-docs' })
    const result = await ops.removeSource('wiki')
    expect(result.success).toBe(true)
    expect(await ops.listSources()).toHaveLength(0)
  })

  it('删除不存在的源返回错�?, async () => {
    const ops = createRetrievalOperations(mockEmbedding, mockStoreProvider, createMockSourceStore())
    const result = await ops.removeSource('nonexistent')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.RETRIEVAL_SOURCE_NOT_FOUND)
    }
  })

  it('无源�?retrieve 返回错误', async () => {
    const ops = createRetrievalOperations(mockEmbedding, mockStoreProvider, createMockSourceStore())
    const result = await ops.retrieve({ query: 'test' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.RETRIEVAL_SOURCE_NOT_FOUND)
    }
  })

  it('多实例：store 共享保证一致�?, async () => {
    // 模拟两个实例共用同一�?store（分布式场景�?
    const sharedStore = createMockSourceStore()
    const instance1 = createRetrievalOperations(mockEmbedding, mockStoreProvider, sharedStore)
    const instance2 = createRetrievalOperations(mockEmbedding, mockStoreProvider, sharedStore)

    await instance1.addSource({ id: 'wiki', collection: 'wiki-docs' })
    const list = await instance2.listSources()
    expect(list.length).toBe(1)
    expect(list[0].id).toBe('wiki')
  })
})
