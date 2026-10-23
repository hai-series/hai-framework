/** 真实 Chroma 置于严格 Bearer 网关之后，验证实际 SDK 认证与向量读写。 */

import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { StartedTestContainer } from 'testcontainers'
import { once } from 'node:events'
import { createServer, request as httpRequest } from 'node:http'
import { GenericContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createChromaProvider } from '../src/providers/vecdb-provider-chroma.js'
import { VecdbConfigSchema } from '../src/vecdb-config.js'

describe.sequential('chroma actual SDK behind a Bearer gateway', () => {
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
    const upstream = { hostname: container.getHost(), port: container.getMappedPort(8000) }
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
      const proxy = httpRequest({ ...upstream, path: request.url, method: request.method, headers: request.headers }, (received) => {
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
    if (gateway)
      await new Promise<void>((resolve, reject) => gateway!.close(error => error ? reject(error) : resolve()))
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

  it('认证后真实集合/向量 CRUD、过滤搜索和独立连接读取；撤销凭据后不执行写入', async () => {
    const first = createChromaProvider()
    const second = createChromaProvider()
    const config = VecdbConfigSchema.parse({ type: 'chroma', url, apiKey: token })
    const name = 'authenticated-documents'
    try {
      expect((await first.connect(config)).success).toBe(true)
      expect((await first.collection.create(name, { dimension: 3 })).success).toBe(true)
      expect((await first.vector.insert(name, [
        { id: 'a', vector: [1, 0, 0], content: 'original', metadata: { tenant: 'alpha', version: 1 } },
        { id: 'b', vector: [0, 1, 0], content: 'other', metadata: { tenant: 'beta', version: 1 } },
      ])).success).toBe(true)
      expect((await first.vector.upsert(name, [{ id: 'a', vector: [1, 0, 0], content: 'updated', metadata: { tenant: 'alpha', version: 2 } }])).success).toBe(true)
      expect((await second.connect(config)).success).toBe(true)
      const read = await second.vector.search(name, [1, 0, 0], { topK: 1, filter: { tenant: 'alpha' } })
      expect(read.success && read.data.map(record => ({ id: record.id, content: record.content, metadata: record.metadata })))
        .toEqual([{ id: 'a', content: 'updated', metadata: { tenant: 'alpha', version: 2 } }])
      const info = await second.collection.info(name)
      expect(info.success && info.data).toMatchObject({ name, dimension: 3, count: 2, metric: 'cosine' })

      authorized = false
      expect((await first.vector.insert(name, [{ id: 'forbidden', vector: [1, 0, 0] }])).success).toBe(false)
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
      expect((await provider.vector.insert(name, [{ id: 'without-content', vector: [1, 0, 0], metadata: { tenant: 'alpha', active: true } }])).success).toBe(true)
      const result = await provider.vector.search(name, [1, 0, 0], { filter: { tenant: 'alpha', active: true } })
      expect(result.success && result.data).toMatchObject([{ id: 'without-content', content: undefined, metadata: { tenant: 'alpha', active: true } }])
      const before = vectorWrites
      expect((await provider.vector.insert(name, [{ id: 'invalid-metadata', vector: [1, 0, 0], metadata: { nested: { unsupported: true } } }])).success).toBe(false)
      expect(vectorWrites).toBe(before)
      const count = await provider.vector.count(name)
      expect(count.success && count.data).toBe(1)
      expect((await provider.vector.search(name, [1, 0, 0], { filter: { tenant: { $invalid: 'operator' } } })).success).toBe(false)
      expect((await provider.collection.drop(name)).success).toBe(true)
    }
    finally {
      await provider.close()
    }
  }, 30_000)
})
