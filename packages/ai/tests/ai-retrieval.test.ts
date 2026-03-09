/**
 * AI Retrieval 子模块单元测试
 *
 * 测试检索源管理：addSource / removeSource / listSources。
 * retrieve 需要 embedding + vecdb，此处仅测试源管理。
 */

import type { EmbeddingOperations } from '../src/embedding/ai-embedding-types.js'
import type { RetrievalSource } from '../src/retrieval/ai-retrieval-types.js'
import type { AIStore, VecdbClient } from '../src/store/ai-store-types.js'
import { describe, expect, it } from 'vitest'
import { AIErrorCode } from '../src/ai-config.js'
import { createRetrievalOperations } from '../src/retrieval/ai-retrieval-functions.js'

// ─── Mock Embedding ───

const mockEmbedding: EmbeddingOperations = {
  embed: async () => ({ success: true, data: { model: 'test', data: [{ index: 0, embedding: [0.1, 0.2] }], usage: { prompt_tokens: 1, total_tokens: 1 } } }) as any,
  embedText: async () => ({ success: true, data: [0.1, 0.2, 0.3] }) as any,
  embedBatch: async () => ({ success: true, data: [[0.1], [0.2]] }) as any,
}

// ─── Mock VecdbClient ───

const mockVecdb: VecdbClient = {
  isInitialized: true,
  vector: {
    upsert: async () => ({ success: true }),
    search: async () => ({ success: true, data: [] }),
    delete: async () => ({ success: true }),
  },
  collection: {
    create: async () => ({ success: true }),
    drop: async () => ({ success: true }),
    exists: async () => ({ success: true, data: true }),
  },
}

// ─── Mock AIStore<RetrievalSource>（内存实现，测试隔离用）───

function createMockSourceStore(): AIStore<RetrievalSource> {
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

// ─── 源管理 ───

describe('retrieval 源管理', () => {
  it('添加源', async () => {
    const ops = createRetrievalOperations(mockEmbedding, mockVecdb, createMockSourceStore())
    const result = await ops.addSource({ id: 'wiki', collection: 'wiki-docs', topK: 5 })
    expect(result.success).toBe(true)
  })

  it('添加重复源返回错误', async () => {
    const ops = createRetrievalOperations(mockEmbedding, mockVecdb, createMockSourceStore())
    await ops.addSource({ id: 'wiki', collection: 'wiki-docs' })
    const result = await ops.addSource({ id: 'wiki', collection: 'other' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.RETRIEVAL_FAILED)
    }
  })

  it('列出源', async () => {
    const ops = createRetrievalOperations(mockEmbedding, mockVecdb, createMockSourceStore())
    await ops.addSource({ id: 'wiki', collection: 'wiki-docs' })
    await ops.addSource({ id: 'kb', collection: 'knowledge-base' })
    const list = await ops.listSources()
    expect(list.length).toBe(2)
    expect(list.map(s => s.id)).toContain('wiki')
    expect(list.map(s => s.id)).toContain('kb')
  })

  it('删除源', async () => {
    const ops = createRetrievalOperations(mockEmbedding, mockVecdb, createMockSourceStore())
    await ops.addSource({ id: 'wiki', collection: 'wiki-docs' })
    const result = await ops.removeSource('wiki')
    expect(result.success).toBe(true)
    expect(await ops.listSources()).toHaveLength(0)
  })

  it('删除不存在的源返回错误', async () => {
    const ops = createRetrievalOperations(mockEmbedding, mockVecdb, createMockSourceStore())
    const result = await ops.removeSource('nonexistent')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.RETRIEVAL_SOURCE_NOT_FOUND)
    }
  })

  it('无源时 retrieve 返回错误', async () => {
    const ops = createRetrievalOperations(mockEmbedding, mockVecdb, createMockSourceStore())
    const result = await ops.retrieve({ query: 'test' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.RETRIEVAL_SOURCE_NOT_FOUND)
    }
  })

  it('多实例：store 共享保证一致性', async () => {
    // 模拟两个实例共用同一个 store（分布式场景）
    const sharedStore = createMockSourceStore()
    const instance1 = createRetrievalOperations(mockEmbedding, mockVecdb, sharedStore)
    const instance2 = createRetrievalOperations(mockEmbedding, mockVecdb, sharedStore)

    await instance1.addSource({ id: 'wiki', collection: 'wiki-docs' })
    const list = await instance2.listSources()
    expect(list.length).toBe(1)
    expect(list[0].id).toBe('wiki')
  })
})
