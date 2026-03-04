/**
 * =============================================================================
 * @h-ai/vecdb - 集合管理 容器化测试
 *
 * 覆盖 vecdb.collection 的 create / drop / exists / info / list 操作。
 * 在 LanceDB（本地）、pgvector（容器）和 Qdrant（容器）上运行，确保各后端行为一致。
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { vecdb, VecdbErrorCode } from '../src/index.js'
import { defineVecdbSuite, lancedbEnv, pgvectorDockerOpts, pgvectorEnv, qdrantDockerOpts, qdrantEnv } from './helpers/vecdb-test-suite.js'

describe('vecdb.collection', () => {
  const defineCommon = () => {
    it('创建集合', async () => {
      const result = await vecdb.collection.create('test-coll', { dimension: 4 })
      expect(result.success).toBe(true)
    })

    it('重复创建集合返回 COLLECTION_ALREADY_EXISTS', async () => {
      await vecdb.collection.create('dup-coll', { dimension: 8 })
      const result = await vecdb.collection.create('dup-coll', { dimension: 8 })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(VecdbErrorCode.COLLECTION_ALREADY_EXISTS)
      }
    })

    it('检查集合存在性', async () => {
      await vecdb.collection.create('exists-coll', { dimension: 4 })

      const exists = await vecdb.collection.exists('exists-coll')
      expect(exists.success).toBe(true)
      if (exists.success) {
        expect(exists.data).toBe(true)
      }

      const notExists = await vecdb.collection.exists('nonexistent')
      expect(notExists.success).toBe(true)
      if (notExists.success) {
        expect(notExists.data).toBe(false)
      }
    })

    it('列出集合', async () => {
      await vecdb.collection.create('list-a', { dimension: 4 })
      await vecdb.collection.create('list-b', { dimension: 8 })

      const result = await vecdb.collection.list()
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toContain('list-a')
        expect(result.data).toContain('list-b')
      }
    })

    it('获取集合信息', async () => {
      await vecdb.collection.create('info-coll', { dimension: 4, metric: 'cosine' })

      const result = await vecdb.collection.info('info-coll')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('info-coll')
        expect(result.data.dimension).toBe(4)
        expect(result.data.count).toBe(0)
      }
    })

    it('获取不存在集合信息返回 COLLECTION_NOT_FOUND', async () => {
      const result = await vecdb.collection.info('ghost-coll')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(VecdbErrorCode.COLLECTION_NOT_FOUND)
      }
    })

    it('删除集合', async () => {
      await vecdb.collection.create('drop-coll', { dimension: 4 })
      const result = await vecdb.collection.drop('drop-coll')
      expect(result.success).toBe(true)

      const exists = await vecdb.collection.exists('drop-coll')
      if (exists.success) {
        expect(exists.data).toBe(false)
      }
    })

    it('删除不存在集合返回 COLLECTION_NOT_FOUND', async () => {
      const result = await vecdb.collection.drop('ghost-coll')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(VecdbErrorCode.COLLECTION_NOT_FOUND)
      }
    })
  }

  // ─── LanceDB（本地，无需容器） ───
  defineVecdbSuite('lancedb', () => lancedbEnv('./test-data/coll-test'), defineCommon)

  // ─── pgvector（容器） ───
  defineVecdbSuite('pgvector', pgvectorEnv, defineCommon, pgvectorDockerOpts)

  // ─── Qdrant（容器） ───
  defineVecdbSuite('qdrant', qdrantEnv, defineCommon, qdrantDockerOpts)
})
