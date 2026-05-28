/**
 * =============================================================================
 * @h-ai/vecdb - 可选驱动与错误语义测试
 * =============================================================================
 *
 * 通过 vi.doMock 模拟可选依赖导出缺失与 Qdrant 网络错误，验证：
 * - 缺少 optional driver 时返回 DRIVER_NOT_FOUND
 * - Qdrant collection.exists 遇到网络错误时返回 QUERY_FAILED，而不是误判为 false
 * =============================================================================
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('pg')
  vi.doUnmock('@qdrant/js-client-rest')
  vi.resetModules()
})

describe.sequential('vecdb optional drivers and error semantics', () => {
  it('缺少 pg 驱动时应返回 DRIVER_NOT_FOUND', async () => {
    // Vitest 4 会将 factory throw 包装成 mock 错误；这里用缺失关键导出模拟驱动不可用。
    vi.doMock('pg', () => ({}))

    const { HaiVecdbError, vecdb } = await import('../src/index.js')
    const result = await vecdb.init({
      type: 'pgvector',
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'postgres',
      password: 'secret',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiVecdbError.DRIVER_NOT_FOUND.code)
    }

    await vecdb.close()
  })

  it('缺少 Qdrant 驱动时应返回 DRIVER_NOT_FOUND', async () => {
    // Vitest 4 会将 factory throw 包装成 mock 错误；这里用缺失关键导出模拟驱动不可用。
    vi.doMock('@qdrant/js-client-rest', () => ({}))

    const { HaiVecdbError, vecdb } = await import('../src/index.js')
    const result = await vecdb.init({
      type: 'qdrant',
      url: 'http://localhost:6333',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiVecdbError.DRIVER_NOT_FOUND.code)
    }

    await vecdb.close()
  })

  it('qdrant collection.exists 遇到网络错误时应返回 QUERY_FAILED', async () => {
    class MockQdrantGetCollectionError extends Error {
      getActualType(): { status: number } {
        return { status: 503 }
      }
    }

    const getCollection = Object.assign(
      async () => {
        throw new MockQdrantGetCollectionError('network down')
      },
      { Error: MockQdrantGetCollectionError },
    )

    vi.doMock('@qdrant/js-client-rest', () => ({
      QdrantClient: class {
        getCollections = async () => ({ collections: [] })
        getCollection = getCollection
        createCollection = async () => ({})
        deleteCollection = async () => ({})
        upsert = async () => ({})
        delete = async () => ({})
        search = async () => []
      },
    }))

    const { HaiVecdbError, vecdb } = await import('../src/index.js')
    const initResult = await vecdb.init({
      type: 'qdrant',
      url: 'http://localhost:6333',
    })
    expect(initResult.success).toBe(true)

    const existsResult = await vecdb.collection.exists('test-coll')
    expect(existsResult.success).toBe(false)
    if (!existsResult.success) {
      expect(existsResult.error.code).toBe(HaiVecdbError.QUERY_FAILED.code)
    }

    await vecdb.close()
  })
})
