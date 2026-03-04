/**
 * AI Retrieval 子模块单元测试
 *
 * 测试检索源管理：addSource / removeSource / listSources。
 * retrieve 需要 embedding + vecdb，此处仅测试源管理。
 */

import type { EmbeddingOperations } from '../src/embedding/ai-embedding-types.js'
import { describe, expect, it } from 'vitest'
import { AIErrorCode } from '../src/ai-config.js'
import { createRetrievalOperations } from '../src/retrieval/ai-retrieval-functions.js'

// ─── Mock Embedding ───

const mockEmbedding: EmbeddingOperations = {
  embed: async () => ({ success: true, data: { model: 'test', data: [{ index: 0, embedding: [0.1, 0.2] }], usage: { prompt_tokens: 1, total_tokens: 1 } } }) as any,
  embedText: async () => ({ success: true, data: [0.1, 0.2, 0.3] }) as any,
  embedBatch: async () => ({ success: true, data: [[0.1], [0.2]] }) as any,
}

// ─── 源管理 ───

describe('retrieval 源管理', () => {
  it('添加源', () => {
    const ops = createRetrievalOperations(mockEmbedding)
    const result = ops.addSource({ id: 'wiki', collection: 'wiki-docs', topK: 5 })
    expect(result.success).toBe(true)
  })

  it('添加重复源返回错误', () => {
    const ops = createRetrievalOperations(mockEmbedding)
    ops.addSource({ id: 'wiki', collection: 'wiki-docs' })
    const result = ops.addSource({ id: 'wiki', collection: 'other' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.RETRIEVAL_FAILED)
    }
  })

  it('列出源', () => {
    const ops = createRetrievalOperations(mockEmbedding)
    ops.addSource({ id: 'wiki', collection: 'wiki-docs' })
    ops.addSource({ id: 'kb', collection: 'knowledge-base' })
    const list = ops.listSources()
    expect(list.length).toBe(2)
    expect(list.map(s => s.id)).toContain('wiki')
    expect(list.map(s => s.id)).toContain('kb')
  })

  it('删除源', () => {
    const ops = createRetrievalOperations(mockEmbedding)
    ops.addSource({ id: 'wiki', collection: 'wiki-docs' })
    const result = ops.removeSource('wiki')
    expect(result.success).toBe(true)
    expect(ops.listSources().length).toBe(0)
  })

  it('删除不存在的源返回错误', () => {
    const ops = createRetrievalOperations(mockEmbedding)
    const result = ops.removeSource('nonexistent')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.RETRIEVAL_SOURCE_NOT_FOUND)
    }
  })

  it('无源时 retrieve 返回错误', async () => {
    const ops = createRetrievalOperations(mockEmbedding)
    const result = await ops.retrieve({ query: 'test' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.RETRIEVAL_SOURCE_NOT_FOUND)
    }
  })
})
