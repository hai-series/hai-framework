/**
 * =============================================================================
 * @h-ai/vecdb - 向量 CRUD 容器化测试
 *
 * 覆盖 vecdb.vector 的 insert / upsert / delete / count 操作。
 * 在 LanceDB（本地）、pgvector（容器）和 Qdrant（容器）上运行。
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { vecdb } from '../src/index.js'
import { defineVecdbSuite, lancedbEnv, pgvectorDockerOpts, pgvectorEnv, qdrantDockerOpts, qdrantEnv } from './helpers/vecdb-test-suite.js'

/** 创建 N 维归一化随机向量（用于 cosine 测试） */
function randomVector(dim: number): number[] {
  const v = Array.from({ length: dim }, () => Math.random() - 0.5)
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return v.map(x => x / norm)
}

describe('vecdb.vector CRUD', () => {
  const DIM = 8
  const COLLECTION = 'crud-test'

  const defineCommon = () => {
    it('插入向量文档', async () => {
      await vecdb.collection.create(COLLECTION, { dimension: DIM })

      const result = await vecdb.vector.insert(COLLECTION, [
        { id: 'doc-1', vector: randomVector(DIM), content: 'First document', metadata: { source: 'test' } },
        { id: 'doc-2', vector: randomVector(DIM), content: 'Second document', metadata: { source: 'test' } },
      ])
      expect(result.success).toBe(true)

      const count = await vecdb.vector.count(COLLECTION)
      expect(count.success).toBe(true)
      if (count.success) {
        expect(count.data).toBe(2)
      }
    })

    it('upsert 新文档（插入）', async () => {
      await vecdb.collection.create(COLLECTION, { dimension: DIM })

      const result = await vecdb.vector.upsert(COLLECTION, [
        { id: 'upsert-1', vector: randomVector(DIM), content: 'Upserted doc' },
      ])
      expect(result.success).toBe(true)

      const count = await vecdb.vector.count(COLLECTION)
      if (count.success) {
        expect(count.data).toBe(1)
      }
    })

    it('upsert 已存在文档（更新）', async () => {
      await vecdb.collection.create(COLLECTION, { dimension: DIM })

      const vec = randomVector(DIM)
      await vecdb.vector.insert(COLLECTION, [
        { id: 'up-1', vector: vec, content: 'Original content' },
      ])

      const updatedVec = randomVector(DIM)
      const result = await vecdb.vector.upsert(COLLECTION, [
        { id: 'up-1', vector: updatedVec, content: 'Updated content' },
      ])
      expect(result.success).toBe(true)

      // 数量不变（仍为 1）
      const count = await vecdb.vector.count(COLLECTION)
      if (count.success) {
        expect(count.data).toBe(1)
      }
    })

    it('删除向量文档', async () => {
      await vecdb.collection.create(COLLECTION, { dimension: DIM })

      await vecdb.vector.insert(COLLECTION, [
        { id: 'del-1', vector: randomVector(DIM), content: 'To delete' },
        { id: 'del-2', vector: randomVector(DIM), content: 'To keep' },
      ])

      const result = await vecdb.vector.delete(COLLECTION, ['del-1'])
      expect(result.success).toBe(true)

      const count = await vecdb.vector.count(COLLECTION)
      if (count.success) {
        expect(count.data).toBe(1)
      }
    })

    it('批量插入多条文档', async () => {
      await vecdb.collection.create(COLLECTION, { dimension: DIM })

      const docs = Array.from({ length: 20 }, (_, i) => ({
        id: `batch-${i}`,
        vector: randomVector(DIM),
        content: `Batch document ${i}`,
        metadata: { batch: true, index: i },
      }))

      const result = await vecdb.vector.insert(COLLECTION, docs)
      expect(result.success).toBe(true)

      const count = await vecdb.vector.count(COLLECTION)
      if (count.success) {
        expect(count.data).toBe(20)
      }
    })
  }

  // ─── LanceDB（本地，无需容器） ───
  defineVecdbSuite('lancedb', () => lancedbEnv('./test-data/crud-test'), defineCommon)

  // ─── pgvector（容器） ───
  defineVecdbSuite('pgvector', pgvectorEnv, defineCommon, pgvectorDockerOpts)

  // ─── Qdrant（容器） ───
  defineVecdbSuite('qdrant', qdrantEnv, defineCommon, qdrantDockerOpts)
})
