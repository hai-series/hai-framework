/**
 * vecdb 单元测试
 *
 * 覆盖：配置校验、未初始化行为、关闭安全性。
 * LanceDB 集成测试需要原生驱动，仅在可用时运行。
 */

import { afterAll, describe, expect, it } from 'vitest'
import { vecdb } from '../src/index.js'
import { VecdbErrorCode } from '../src/vecdb-config.js'

// ─── 未初始化行为 ───

describe('vecdb 未初始化', () => {
  it('isInitialized 为 false', () => {
    expect(vecdb.isInitialized).toBe(false)
  })

  it('config 为 null', () => {
    expect(vecdb.config).toBeNull()
  })

  it('collection.list 返回 NOT_INITIALIZED', async () => {
    const result = await vecdb.collection.list()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(VecdbErrorCode.NOT_INITIALIZED)
    }
  })

  it('collection.create 返回 NOT_INITIALIZED', async () => {
    const result = await vecdb.collection.create('test', { dimension: 128 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(VecdbErrorCode.NOT_INITIALIZED)
    }
  })

  it('vector.search 返回 NOT_INITIALIZED', async () => {
    const result = await vecdb.vector.search('test', [0.1, 0.2])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(VecdbErrorCode.NOT_INITIALIZED)
    }
  })

  it('vector.insert 返回 NOT_INITIALIZED', async () => {
    const result = await vecdb.vector.insert('test', [{ id: '1', vector: [0.1] }])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(VecdbErrorCode.NOT_INITIALIZED)
    }
  })

  it('vector.delete 返回 NOT_INITIALIZED', async () => {
    const result = await vecdb.vector.delete('test', ['1'])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(VecdbErrorCode.NOT_INITIALIZED)
    }
  })

  it('close 未初始化时安全返回 ok', async () => {
    const result = await vecdb.close()
    expect(result.success).toBe(true)
  })
})

// ─── 配置校验 ───

describe('vecdb 配置校验', () => {
  it('无效的 type 返回 CONFIG_ERROR', async () => {
    const result = await vecdb.init({ type: 'invalid' as any })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(VecdbErrorCode.CONFIG_ERROR)
    }
  })

  it('lancedb 缺少 path 返回 CONFIG_ERROR', async () => {
    // lancedb path 为必填字段，缺少时应校验失败
    const result = await vecdb.init({ type: 'lancedb' } as any)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(VecdbErrorCode.CONFIG_ERROR)
    }
    await vecdb.close()
  })

  it('pgvector 缺少 database 返回 CONFIG_ERROR', async () => {
    const result = await vecdb.init({ type: 'pgvector' } as any)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(VecdbErrorCode.CONFIG_ERROR)
    }
    await vecdb.close()
  })

  it('qdrant 缺少 url 使用默认值', async () => {
    const result = await vecdb.init({ type: 'qdrant' })
    // 没有 qdrant 服务，预期失败
    expect(result.success).toBe(false)
    if (!result.success) {
      expect([VecdbErrorCode.DRIVER_NOT_FOUND, VecdbErrorCode.CONNECTION_FAILED]).toContain(result.error.code)
    }
    await vecdb.close()
  })
})

// ─── LanceDB 集成测试（需要原生驱动） ───

/**
 * 检测 @lancedb/lancedb 是否可用
 */
async function isLancedbAvailable(): Promise<boolean> {
  try {
    await import('@lancedb/lancedb')
    return true
  }
  catch {
    return false
  }
}

describe('vecdb LanceDB 集成测试', async () => {
  const available = await isLancedbAvailable()

  // 如果 LanceDB 不可用，跳过所有测试
  it.skipIf(!available)('初始化 LanceDB', async () => {
    const result = await vecdb.init({
      type: 'lancedb',
      path: './test-data/vecdb-test',
    })
    expect(result.success).toBe(true)
    expect(vecdb.isInitialized).toBe(true)
    expect(vecdb.config?.type).toBe('lancedb')
  })

  it.skipIf(!available)('创建集合', async () => {
    const result = await vecdb.collection.create('test-collection', {
      dimension: 4,
      metric: 'cosine',
    })
    expect(result.success).toBe(true)
  })

  it.skipIf(!available)('重复创建集合返回 COLLECTION_ALREADY_EXISTS', async () => {
    const result = await vecdb.collection.create('test-collection', { dimension: 4 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(VecdbErrorCode.COLLECTION_ALREADY_EXISTS)
    }
  })

  it.skipIf(!available)('集合存在性检查', async () => {
    const exists = await vecdb.collection.exists('test-collection')
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

  it.skipIf(!available)('列出集合', async () => {
    const result = await vecdb.collection.list()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toContain('test-collection')
    }
  })

  it.skipIf(!available)('插入向量', async () => {
    const result = await vecdb.vector.insert('test-collection', [
      { id: 'doc-1', vector: [0.1, 0.2, 0.3, 0.4], content: 'First document', metadata: { source: 'test' } },
      { id: 'doc-2', vector: [0.5, 0.6, 0.7, 0.8], content: 'Second document', metadata: { source: 'test' } },
      { id: 'doc-3', vector: [0.9, 0.1, 0.2, 0.3], content: 'Third document', metadata: { source: 'other' } },
    ])
    expect(result.success).toBe(true)
  })

  it.skipIf(!available)('向量搜索', async () => {
    const result = await vecdb.vector.search('test-collection', [0.1, 0.2, 0.3, 0.4], { topK: 2 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBeLessThanOrEqual(2)
      expect(result.data[0].score).toBeGreaterThan(0)
      expect(result.data[0].id).toBeDefined()
    }
  })

  it.skipIf(!available)('向量搜索带 minScore', async () => {
    const result = await vecdb.vector.search('test-collection', [0.1, 0.2, 0.3, 0.4], {
      topK: 10,
      minScore: 0.99,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      for (const item of result.data) {
        expect(item.score).toBeGreaterThanOrEqual(0.99)
      }
    }
  })

  it.skipIf(!available)('upsert 向量', async () => {
    const result = await vecdb.vector.upsert('test-collection', [
      { id: 'doc-1', vector: [0.9, 0.8, 0.7, 0.6], content: 'Updated first document' },
    ])
    expect(result.success).toBe(true)
  })

  it.skipIf(!available)('文档计数', async () => {
    const result = await vecdb.vector.count('test-collection')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBeGreaterThanOrEqual(1)
    }
  })

  it.skipIf(!available)('删除向量', async () => {
    const result = await vecdb.vector.delete('test-collection', ['doc-3'])
    expect(result.success).toBe(true)
  })

  it.skipIf(!available)('集合信息', async () => {
    const result = await vecdb.collection.info('test-collection')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('test-collection')
      expect(result.data.dimension).toBe(4)
    }
  })

  it.skipIf(!available)('不存在的集合返回 COLLECTION_NOT_FOUND', async () => {
    const result = await vecdb.collection.drop('nonexistent-collection')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(VecdbErrorCode.COLLECTION_NOT_FOUND)
    }
  })

  it.skipIf(!available)('删除集合', async () => {
    const result = await vecdb.collection.drop('test-collection')
    expect(result.success).toBe(true)
  })

  it.skipIf(!available)('关闭连接', async () => {
    const result = await vecdb.close()
    expect(result.success).toBe(true)
    expect(vecdb.isInitialized).toBe(false)
    expect(vecdb.config).toBeNull()
  })

  // 清理测试数据
  afterAll(async () => {
    await vecdb.close()
    // 清理测试数据目录
    try {
      const { rm } = await import('node:fs/promises')
      await rm('./test-data/vecdb-test', { recursive: true, force: true })
    }
    catch {
      // 忽略清理错误
    }
  })
})
