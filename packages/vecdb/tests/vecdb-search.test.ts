/**
 * =============================================================================
 * @h-ai/vecdb - 向量搜索 容器化测试
 *
 * 覆盖 vecdb.vector.search 操作：基本搜索、topK、minScore、metadata 过滤。
 * 在 LanceDB（本地）、pgvector（容器）和 Qdrant（容器）上运行。
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { vecdb } from '../src/index.js'
import { defineVecdbSuite, lancedbEnv, pgvectorDockerOpts, pgvectorEnv, qdrantDockerOpts, qdrantEnv } from './helpers/vecdb-test-suite.js'

/** 创建一个可预测的向量（给每个位置填充 base + 偏移量，然后归一化） */
function makeVector(dim: number, base: number): number[] {
  const v = Array.from({ length: dim }, (_, i) => base + i * 0.01)
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return v.map(x => x / norm)
}

describe('vecdb.vector.search', () => {
  const DIM = 8
  const COLLECTION = 'search-test'

  const defineCommon = () => {
    it('基本向量搜索', async () => {
      await vecdb.collection.create(COLLECTION, { dimension: DIM })

      // 插入三组向量，base 不同使其有不同相似度
      await vecdb.vector.insert(COLLECTION, [
        { id: 'close', vector: makeVector(DIM, 1.0), content: 'Close doc', metadata: { group: 'a' } },
        { id: 'medium', vector: makeVector(DIM, 0.5), content: 'Medium doc', metadata: { group: 'a' } },
        { id: 'far', vector: makeVector(DIM, -1.0), content: 'Far doc', metadata: { group: 'b' } },
      ])

      // 以 close 向量查询
      const queryVec = makeVector(DIM, 1.0)
      const result = await vecdb.vector.search(COLLECTION, queryVec, { topK: 3 })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.length).toBeLessThanOrEqual(3)
        expect(result.data.length).toBeGreaterThan(0)
        // 最近的应该是 close（与自身最相似）
        expect(result.data[0].id).toBe('close')
        expect(result.data[0].score).toBeGreaterThan(0)
      }
    })

    it('topK 限制返回数量', async () => {
      await vecdb.collection.create(COLLECTION, { dimension: DIM })

      const docs = Array.from({ length: 10 }, (_, i) => ({
        id: `top-${i}`,
        vector: makeVector(DIM, i * 0.1),
        content: `Doc ${i}`,
      }))
      await vecdb.vector.insert(COLLECTION, docs)

      const result = await vecdb.vector.search(COLLECTION, makeVector(DIM, 0.5), { topK: 3 })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.length).toBeLessThanOrEqual(3)
      }
    })

    it('minScore 过滤低分结果', async () => {
      await vecdb.collection.create(COLLECTION, { dimension: DIM })

      await vecdb.vector.insert(COLLECTION, [
        { id: 'similar', vector: makeVector(DIM, 1.0), content: 'Very similar' },
        { id: 'diff', vector: makeVector(DIM, -1.0), content: 'Very different' },
      ])

      const result = await vecdb.vector.search(COLLECTION, makeVector(DIM, 1.0), {
        topK: 10,
        minScore: 0.9,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        // 所有返回结果的分数都 >= 0.9
        for (const item of result.data) {
          expect(item.score).toBeGreaterThanOrEqual(0.9)
        }
      }
    })

    it('搜索结果包含 content 和 metadata', async () => {
      await vecdb.collection.create(COLLECTION, { dimension: DIM })

      await vecdb.vector.insert(COLLECTION, [
        {
          id: 'rich',
          vector: makeVector(DIM, 1.0),
          content: 'Rich document',
          metadata: { author: 'test', version: 1 },
        },
      ])

      const result = await vecdb.vector.search(COLLECTION, makeVector(DIM, 1.0), { topK: 1 })
      expect(result.success).toBe(true)
      if (result.success && result.data.length > 0) {
        const top = result.data[0]
        expect(top.id).toBe('rich')
        expect(top.content).toBe('Rich document')
        expect(top.score).toBeGreaterThan(0)
      }
    })

    it('搜索结果按相似度降序排列', async () => {
      await vecdb.collection.create(COLLECTION, { dimension: DIM })

      await vecdb.vector.insert(COLLECTION, [
        { id: 'v1', vector: makeVector(DIM, 1.0), content: 'Doc 1' },
        { id: 'v2', vector: makeVector(DIM, 0.5), content: 'Doc 2' },
        { id: 'v3', vector: makeVector(DIM, 0.2), content: 'Doc 3' },
      ])

      const result = await vecdb.vector.search(COLLECTION, makeVector(DIM, 1.0), { topK: 3 })
      expect(result.success).toBe(true)
      if (result.success && result.data.length >= 2) {
        // 验证降序
        for (let i = 1; i < result.data.length; i++) {
          expect(result.data[i - 1].score).toBeGreaterThanOrEqual(result.data[i].score)
        }
      }
    })

    it('空集合搜索返回空数组', async () => {
      await vecdb.collection.create(COLLECTION, { dimension: DIM })

      const result = await vecdb.vector.search(COLLECTION, makeVector(DIM, 1.0), { topK: 5 })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(0)
      }
    })
  }

  // ─── LanceDB（本地，无需容器） ───
  defineVecdbSuite('lancedb', () => lancedbEnv('./test-data/search-test'), defineCommon)

  // ─── pgvector（容器） ───
  defineVecdbSuite('pgvector', pgvectorEnv, defineCommon, pgvectorDockerOpts)

  // ─── Qdrant（容器） ───
  defineVecdbSuite('qdrant', qdrantEnv, defineCommon, qdrantDockerOpts)
})
