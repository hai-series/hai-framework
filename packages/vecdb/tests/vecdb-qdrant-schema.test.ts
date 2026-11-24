/** 使用真实 Qdrant 验证向量字段和原生 point 的兼容边界。 */

import type { QdrantContainerLease } from './helpers/qdrant-container.js'

import { createHash } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { HaiVecdbError, vecdb } from '../src/index.js'
import { createQdrantProvider } from '../src/providers/vecdb-provider-qdrant.js'
import { VecdbConfigSchema } from '../src/vecdb-config.js'
import { acquireQdrantContainer } from './helpers/qdrant-container.js'

let lease: QdrantContainerLease | undefined
beforeAll(async () => {
  lease = await acquireQdrantContainer()
}, 120_000)
afterAll(async () => {
  await lease?.release()
}, 30_000)

it.each(['named', 'manhattan'] as const)('不将外部 %s 集合当作未命名 cosine 集合', async (kind) => {
  const url = lease!.url
  const name = `external-${kind}`
  const request = async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`${url}/collections/${encodeURIComponent(name)}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined
        ? undefined
        : JSON.stringify(body),
    })
    const result = await response.json() as { result: { count?: number } }
    if (!response.ok)
      throw new Error(`Fixture HTTP ${response.status}`)
    return result.result
  }
  const provider = createQdrantProvider()
  try {
    expect((await provider.connect(VecdbConfigSchema.parse({ type: 'qdrant', url }))).success).toBe(true)
    await request('', 'PUT', {
      vectors: kind === 'named'
        ? {
            document: { size: 3, distance: 'Cosine' },
          }
        : { size: 3, distance: 'Manhattan' },
    })
    const info = await provider.collection.info(name)
    expect(info.success).toBe(false)
    if (!info.success)
      expect(info.error.code).toBe(HaiVecdbError.CONFIG_ERROR.code)
    const write = await provider.vector.upsert(name, [
      {
        id: 'unused',
        vector: [1, 0, 0],
      },
    ])
    expect(write.success).toBe(false)
    if (!write.success)
      expect(write.error.code).toBe(HaiVecdbError.CONFIG_ERROR.code)
    expect((await request('/points/count', 'POST', { exact: true })).count).toBe(0)
    expect((await provider.collection.drop(name)).success).toBe(true)
  }
  finally {
    await provider.close()
    await fetch(`${url}/collections/${encodeURIComponent(name)}`, { method: 'DELETE' })
  }
}, 15_000)

it.each([false, true])('从混合集合搜索可管理的框架文档（strict mode = %s）', async (strict) => {
  const url = lease!.url
  const name = `mixed-points-${strict}`
  const endpoint = `${url}/collections/${name}`
  const writeFixture = async (path: string, body: unknown, method = 'PUT') => {
    const response = await fetch(endpoint + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(response.ok).toBe(true)
    await response.body?.cancel()
  }

  try {
    await writeFixture('', {
      vectors: { size: 2, distance: 'Cosine' },
      strict_mode_config: { enabled: strict, unindexed_filtering_retrieve: false, max_query_limit: 8 },
    })
    await writeFixture('/index?wait=true', { field_name: 'tenant', field_schema: 'keyword' })

    expect((await vecdb.init({ type: 'qdrant', url })).success).toBe(true)
    expect((await vecdb.vector.upsert(name, [
      {
        id: 'modern',
        vector: [0.6, 0.8],
        metadata: { tenant: 'alpha' },
      },
      {
        id: 'other-tenant',
        vector: [0.96, 0.28],
        metadata: { tenant: 'beta' },
      },
      {
        id: '',
        vector: [-1, 0],
        metadata: { tenant: 'alpha' },
      },
    ])).success).toBe(true)

    const trace = vi.spyOn(globalThis, 'fetch')
    try {
      await expect(vecdb.vector.search(name, [1, 0], { topK: 1 })).resolves.toMatchObject({
        success: true,
        data: [
          { id: 'other-tenant' },
        ],
      })
      await expect(vecdb.vector.search(name, [1, 0], { topK: 0 })).resolves.toMatchObject({
        success: false,
        error: { code: HaiVecdbError.QUERY_FAILED.code },
      })
      expect(trace.mock.calls.filter(([request]) => request instanceof URL && request.pathname.endsWith('/points/query'))).toHaveLength(1)
    }
    finally {
      trace.mockRestore()
    }

    // 模拟旧版本落盘的框架记录，不要求新增标记或迁移。
    const hash = createHash('sha256').update('legacy').digest('hex')
    const legacyId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
    await writeFixture('/points?wait=true', {
      points: [
        {
          id: legacyId,
          vector: [0.8, 0.6],
          payload: { _id: 'legacy', _content: 'Old text', tenant: 'alpha' },
        },
        {
          id: 42,
          vector: [1, 0],
          payload: { tenant: 'alpha' },
        },
        {
          id: 43,
          vector: [1, 0],
          payload: { _id: 'legacy', tenant: 'alpha' },
        },
        {
          id: '12345678-1234-1234-1234-123456789abc',
          vector: [1, 0],
          payload: { _id: 'legacy', tenant: 'alpha' },
        },
      ],
    })

    await expect(vecdb.vector.search(name, [1, 0], {
      topK: 2,
      minScore: 0.75,
      filter: { tenant: 'alpha' },
    })).resolves.toMatchObject({
      success: true,
      data: [
        {
          id: 'legacy',
          content: 'Old text',
          metadata: { tenant: 'alpha' },
        },
        {
          id: 'modern',
          metadata: { tenant: 'alpha' },
        },
      ],
    })
    await expect(vecdb.vector.search(name, [1, 0], {
      topK: 2,
      minScore: 0.85,
      filter: { tenant: 'alpha' },
    })).resolves.toMatchObject({
      success: true,
      data: [
        { id: 'legacy' },
      ],
    })
    const alpha = await vecdb.vector.search(name, [1, 0], {
      topK: 5,
      filter: { tenant: 'alpha' },
    })
    expect(alpha.success && alpha.data.map(point => point.id)).toEqual(['legacy', 'modern', ''])
    const all = await vecdb.vector.search(name, [1, 0], { topK: 8 })
    expect(all.success && all.data.map(point => point.id)).toEqual(['other-tenant', 'legacy', 'modern', ''])
    const scanned = await vecdb.vector.scan(name, { limit: 8 })
    expect(scanned.success && scanned.data.items.map(point => point.id).sort()).toEqual(['', 'legacy', 'modern', 'other-tenant'])
    await expect(vecdb.vector.count(name)).resolves.toEqual({ success: true, data: 7 })
    if (strict) {
      await writeFixture('', {
        strict_mode_config: { max_query_limit: 2 },
      }, 'PATCH')
      await expect(vecdb.vector.search(name, [1, 0], { topK: 2 })).resolves.toMatchObject({
        success: false,
        error: { code: HaiVecdbError.QUERY_FAILED.code },
      })
    }
  }
  finally {
    await vecdb.close()
    const removed = await fetch(endpoint, { method: 'DELETE' })
    await removed.body?.cancel()
  }
}, 15_000)
