/** 真实 Chroma 置于严格 Bearer 网关之后，验证实际 SDK 认证与向量读写。 */

import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { StartedTestContainer } from 'testcontainers'
import { once } from 'node:events'
import { createServer, request as httpRequest } from 'node:http'
import { GenericContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { vecdb } from '../src/index.js'
import { createChromaProvider } from '../src/providers/vecdb-provider-chroma.js'
import { VecdbConfigSchema } from '../src/vecdb-config.js'
import { HaiVecdbError } from '../src/vecdb-types.js'

describe('chroma actual SDK behind a Bearer gateway', { concurrent: false }, () => {
  let container: StartedTestContainer | undefined
  let gateway: Server | undefined
  let url = ''
  let authorized = true
  let rejectedRequests = 0
  let authenticatedRequests = 0
  let vectorWrites = 0
  const token = 'fixture-chroma-gateway-token'

  beforeAll(async () => {
    container = await new GenericContainer('docker.io/chromadb/chroma:1.5.5')
      .withExposedPorts(8000)
      .withWaitStrategy(Wait.forHttp('/api/v2/heartbeat', 8000).forStatusCode(200))
      .withStartupTimeout(120_000)
      .start()
    const upstream = {
      hostname: container.getHost(),
      port: container.getMappedPort(8000),
    }
    gateway = createServer((request, response) => {
      const heartbeat = request.url?.endsWith('/heartbeat')
      if (!heartbeat && (!authorized || request.headers.authorization !== `Bearer ${token}`)) {
        rejectedRequests += 1
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'Unauthorized', message: 'Authentication required' }))
        return
      }
      if (!heartbeat)
        authenticatedRequests += 1
      if (request.method === 'POST' && /\/(?:add|upsert)$/.test(request.url ?? ''))
        vectorWrites += 1
      const proxy = httpRequest({
        ...upstream,
        path: request.url,
        method: request.method,
        headers: request.headers,
      }, (received) => {
        response.writeHead(received.statusCode ?? 502, received.headers)
        received.pipe(response)
      })
      proxy.on('error', () => {
        response.writeHead(502)
        response.end()
      })
      request.pipe(proxy)
    })
    gateway.listen(0, '127.0.0.1')
    await once(gateway, 'listening')
    url = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`
  }, 150_000)

  afterAll(async () => {
    if (gateway) {
      await new Promise<void>((resolve, reject) => gateway!.close(error => error
        ? reject(error)
        : resolve()))
    }
    await container?.stop()
  }, 30_000)

  it.each([undefined, 'wrong-token'])('拒绝缺失/错误凭据并保持未连接：%s', async (apiKey) => {
    const provider = createChromaProvider()
    const before = rejectedRequests
    try {
      const result = await provider.connect(VecdbConfigSchema.parse({ type: 'chroma', url, apiKey }))
      expect(result.success).toBe(false)
      expect(provider.isConnected()).toBe(false)
      expect(rejectedRequests).toBe(before + 1)
    }
    finally {
      await provider.close()
    }
  })

  it('并发创建同名集合只有获胜方成功，且服务保存其配置', async () => {
    const name = 'concurrent-collection-creation'
    const definitions = [
      { dimension: 2, metric: 'cosine' },
      { dimension: 3, metric: 'dot' },
    ] as const
    try {
      expect((await vecdb.init({ type: 'chroma', url, apiKey: token })).success).toBe(true)
      const results = await Promise.all(definitions.map(options => vecdb.collection.create(name, options)))
      expect(results.map(result => result.success ? 'created' : result.error.code)).toEqual(expect.arrayContaining([
        'created',
        HaiVecdbError.COLLECTION_ALREADY_EXISTS.code,
      ]))
      await expect(vecdb.collection.info(name)).resolves.toMatchObject({
        success: true,
        data: definitions[results.findIndex(result => result.success)],
      })
    }
    finally {
      await vecdb.close()
    }
  })

  it('认证后真实集合/向量 CRUD、过滤搜索和独立连接读取；撤销凭据后不执行写入', async () => {
    const first = createChromaProvider()
    const second = createChromaProvider()
    const config = VecdbConfigSchema.parse({ type: 'chroma', url, apiKey: token })
    const name = 'authenticated-documents'
    try {
      expect((await first.connect(config)).success).toBe(true)
      await expect(first.vector.scan(name)).resolves.toMatchObject({
        success: false,
        error: { code: HaiVecdbError.COLLECTION_NOT_FOUND.code },
      })
      expect((await first.collection.create(name, { dimension: 3 })).success).toBe(true)
      expect((await first.vector.insert(name, [
        {
          id: 'a',
          vector: [1, 0, 0],
          content: 'original',
          metadata: { tenant: 'alpha', version: 1 },
        },
        {
          id: 'b',
          vector: [0, 1, 0],
          content: 'other',
          metadata: { tenant: 'beta', version: 1 },
        },
      ])).success).toBe(true)
      expect((await first.vector.upsert(name, [
        {
          id: 'a',
          vector: [1, 0, 0],
          content: 'updated',
          metadata: { tenant: 'alpha', version: 2 },
        },
      ])).success).toBe(true)
      expect((await second.connect(config)).success).toBe(true)
      const firstPage = await first.vector.scan(name, { limit: 1 })
      expect(firstPage).toMatchObject({
        success: true,
        data: {
          items: [
            expect.anything(),
          ],
          nextCursor: expect.any(String),
        },
      })
      if (!firstPage.success)
        throw new Error(firstPage.error.message)
      const secondPage = await second.vector.scan(name, { cursor: firstPage.data.nextCursor, limit: 1 })
      expect(secondPage).toMatchObject({
        success: true,
        data: {
          items: [
            expect.anything(),
          ],
        },
      })
      if (!secondPage.success)
        throw new Error(secondPage.error.message)
      expect(secondPage.data.nextCursor).toBeUndefined()
      expect([
        ...firstPage.data.items,
        ...secondPage.data.items,
      ]).toEqual(expect.arrayContaining([
        { id: 'a' },
        { id: 'b' },
      ]))
      const read = await second.vector.search(name, [1, 0, 0], {
        topK: 1,
        filter: { tenant: 'alpha' },
      })
      expect(read.success && read.data.map(record => ({ id: record.id, content: record.content, metadata: record.metadata })))
        .toEqual([
          {
            id: 'a',
            content: 'updated',
            metadata: { tenant: 'alpha', version: 2 },
          },
        ])
      const info = await second.collection.info(name)
      expect(info.success && info.data).toMatchObject({
        name,
        dimension: 3,
        count: 2,
        metric: 'cosine',
      })

      authorized = false
      expect((await first.vector.insert(name, [
        {
          id: 'forbidden',
          vector: [1, 0, 0],
        },
      ])).success).toBe(false)
      expect((await first.collection.list()).success).toBe(false)
      authorized = true
      const count = await second.vector.count(name)
      expect(count.success && count.data).toBe(2)
      expect((await first.vector.delete(name, ['a'])).success).toBe(true)
      const remaining = await second.vector.count(name)
      expect(remaining.success && remaining.data).toBe(1)
      expect((await second.collection.drop(name)).success).toBe(true)
      expect(authenticatedRequests).toBeGreaterThan(10)
    }
    finally {
      authorized = true
      await first.close()
      await second.close()
    }
  }, 30_000)

  it('可省略 content，宽 metadata/filter 仍由真实 SDK 校验后才发送向量请求', async () => {
    const provider = createChromaProvider()
    const name = 'native-sdk-boundary'
    try {
      expect((await provider.connect(VecdbConfigSchema.parse({ type: 'chroma', url, apiKey: token }))).success).toBe(true)
      expect((await provider.collection.create(name, { dimension: 3 })).success).toBe(true)
      expect((await provider.vector.insert(name, [
        {
          id: 'without-content',
          vector: [1, 0, 0],
          metadata: { tenant: 'alpha', active: true },
        },
      ])).success).toBe(true)
      const result = await provider.vector.search(name, [1, 0, 0], {
        filter: { tenant: 'alpha', active: true },
      })
      expect(result.success && result.data).toMatchObject([
        {
          id: 'without-content',
          content: undefined,
          metadata: { tenant: 'alpha', active: true },
        },
      ])
      const before = vectorWrites
      expect((await provider.vector.insert(name, [
        {
          id: 'invalid-metadata',
          vector: [1, 0, 0],
          metadata: {
            nested: { unsupported: true },
          },
        },
      ])).success).toBe(false)
      expect(vectorWrites).toBe(before)
      const count = await provider.vector.count(name)
      expect(count.success && count.data).toBe(1)
      expect((await provider.vector.search(name, [1, 0, 0], {
        filter: {
          tenant: { $invalid: 'operator' },
        },
      })).success).toBe(false)
      expect((await provider.collection.drop(name)).success).toBe(true)
    }
    finally {
      await provider.close()
    }
  }, 30_000)

  it('upsert 替换元数据，已移除字段在 topK 前失效且未更新的记录仍可筛选', async () => {
    const name = 'metadata-replacement'
    const query = [1, 0]
    try {
      expect((await vecdb.init({ type: 'chroma', url, apiKey: token })).success).toBe(true)
      expect((await vecdb.collection.create(name, { dimension: 2 })).success).toBe(true)
      expect((await vecdb.vector.insert(name, [
        {
          id: 'updated',
          vector: query,
          content: 'old',
          metadata: {
            status: 'retired',
            topics: ['guide'],
            revision: 1,
          },
        },
        {
          id: 'unchanged',
          vector: [0, 1],
          metadata: {
            status: 'retired',
            topics: ['guide'],
            revision: 1,
          },
        },
      ])).success).toBe(true)
      expect((await vecdb.vector.upsert(name, [
        {
          id: 'updated',
          vector: query,
          content: 'current',
          metadata: { revision: 2 },
        },
      ])).success).toBe(true)

      const search = async (filter?: Record<string, unknown>) => {
        const result = await vecdb.vector.search(name, query, { topK: 1, filter })
        expect(result.success).toBe(true)
        if (!result.success)
          throw new Error(result.error.message)
        return result.data[0]
      }
      expect(await search()).toMatchObject({ id: 'updated', content: 'current' })
      expect((await search())?.metadata).toEqual({ revision: 2 })
      expect((await search({ status: 'retired' }))?.id).toBe('unchanged')
      expect((await search({
        topics: { $contains: 'guide' },
      }))?.id).toBe('unchanged')
      expect((await search({
        $or: [
          {
            status: { $ne: 'retired' },
          },
          {
            topics: { $not_contains: 'guide' },
          },
        ],
        revision: { $gte: 2 },
      }))?.id).toBe('updated')

      expect((await vecdb.vector.upsert(name, [
        { id: 'updated', vector: query },
      ])).success).toBe(true)
      expect((await search())?.metadata).toBeUndefined()
      expect((await search())?.content).toBeUndefined()
      expect(await search({ revision: 2 })).toBeUndefined()

      const before = vectorWrites
      await expect(vecdb.vector.upsert(name, [
        {
          id: 'updated',
          vector: query,
          metadata: { _hai_vecdb_metadata_keys: 'application-value' },
        },
      ])).resolves.toMatchObject({
        success: false,
        error: { code: HaiVecdbError.UPDATE_FAILED.code },
      })
      expect(vectorWrites).toBe(before)
    }
    finally {
      await vecdb.close()
    }
  }, 30_000)

  it('独立连接并发 upsert 后只读取一次完整替换的元数据', async () => {
    const name = 'concurrent-metadata-replacement'
    vi.resetModules()
    const { vecdb: second } = await import('../src/index.js')
    const config = { type: 'chroma', url, apiKey: token } as const
    const vector = [1, 0]
    try {
      expect((await vecdb.init(config)).success).toBe(true)
      expect((await second.init(config)).success).toBe(true)
      expect((await vecdb.collection.create(name, { dimension: 2 })).success).toBe(true)
      const writes = await Promise.all([
        vecdb.vector.upsert(name, [
          {
            id: 'doc',
            vector,
            content: 'first',
            metadata: { first: true },
          },
        ]),
        second.vector.upsert(name, [
          {
            id: 'doc',
            vector,
            content: 'second',
            metadata: { second: true },
          },
        ]),
      ])
      expect(writes.map(result => result.success)).toEqual([true, true])
      const read = await second.vector.search(name, vector)
      expect(read.success).toBe(true)
      if (!read.success)
        throw new Error(read.error.message)
      expect(read.data).toHaveLength(1)
      const [document] = read.data
      expect(['first', 'second']).toContain(document.content)
      expect(document.metadata).toEqual({ [document.content!]: true })
    }
    finally {
      await Promise.all([
        vecdb.close(),
        second.close(),
      ])
    }
  }, 30_000)
})
