/** 固定 Qdrant REST 传输：完整响应超时、容量上限、安全错误及路径编码。 */
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { createQdrantProvider } from '../src/providers/vecdb-provider-qdrant.js'
import { QdrantRestClient } from '../src/providers/vecdb-qdrant-rest.js'
import { VecdbConfigSchema } from '../src/vecdb-config.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('路径段与API Key传递准确，错误响应原文不进入异常', async () => {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => new Response('private-server-password', { status: 503 }))
  vi.stubGlobal('fetch', fetch)
  const client = new QdrantRestClient('https://qdrant.example/base', 'test-key')
  await expect(client.getCollection('scope/../secret?x=1')).rejects.toMatchObject({ status: 503, message: 'Qdrant HTTP request failed (503)' })
  const [url, options] = fetch.mock.calls[0]
  if (!(url instanceof URL))
    throw new TypeError('Expected URL request')
  expect(url.pathname).toBe('/base/collections/scope%2F..%2Fsecret%3Fx%3D1')
  expect(new Headers(options?.headers).get('api-key')).toBe('test-key')
})

it('服务端仅确认接收时拒绝冒充已完成写入', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    status: 'ok',
    result: { status: 'acknowledged' },
  })))
  await expect(new QdrantRestClient('https://qdrant.example').upsert('collection', { points: [], wait: true })).rejects.toThrow('Qdrant request failed')
})

it('只读取可删除的框架文档 ID，跳过原生记录后仍使用服务端游标', async () => {
  const hash = createHash('sha256').update('original-document').digest('hex')
  const pointId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
  const fetch = vi.fn<(url: URL, options: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(Response.json({
      status: 'ok',
      result: { collections: [] },
    }))
    .mockResolvedValueOnce(Response.json({
      status: 'ok',
      result: {
        points: [
          {
            id: 42,
            payload: { _id: 'original-document' },
          },
        ],
        next_page_offset: pointId,
      },
    }))
    .mockResolvedValueOnce(Response.json({
      status: 'ok',
      result: {
        points: [
          {
            id: pointId,
            payload: { _id: 'original-document', content: 'unrequested' },
          },
        ],
        next_page_offset: null,
      },
    }))
  vi.stubGlobal('fetch', fetch)
  const provider = createQdrantProvider()
  expect((await provider.connect(VecdbConfigSchema.parse({ type: 'qdrant', url: 'https://qdrant.example' }))).success).toBe(true)
  const first = await provider.vector.scan('docs', { limit: 1 })
  expect(first).toMatchObject({
    success: true,
    data: {
      items: [],
      nextCursor: expect.any(String),
    },
  })
  if (!first.success)
    throw new Error(first.error.message)
  const second = await provider.vector.scan('docs', { limit: 1, cursor: first.data.nextCursor })
  expect(second).toMatchObject({
    success: true,
    data: {
      items: [
        { id: 'original-document' },
      ],
    },
  })
  const [firstUrl, firstRequest] = fetch.mock.calls[1]
  expect(firstUrl.pathname).toBe('/collections/docs/points/scroll')
  expect(firstRequest.body).toBe(JSON.stringify({
    limit: 1,
    with_payload: ['_id'],
    with_vector: false,
  }))
  expect(fetch.mock.calls[2][1].body).toBe(JSON.stringify({
    limit: 1,
    offset: pointId,
    with_payload: ['_id'],
    with_vector: false,
  }))
  await provider.close()
})

it('扫描可跳过完整 uint64 范围的原生记录并无损传递游标', async () => {
  const fetch = vi.fn<(url: URL, options: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(Response.json({
      status: 'ok',
      result: { collections: [] },
    }))
    .mockResolvedValueOnce(new Response('{"status":"ok","result":{"points":[{"id":1}],"next_page_offset":18446744073709551615}}'))
    .mockResolvedValueOnce(new Response('{"status":"ok","result":{"points":[{"id":18446744073709551615}],"next_page_offset":null}}'))
  vi.stubGlobal('fetch', fetch)
  const provider = createQdrantProvider()
  expect((await provider.connect(VecdbConfigSchema.parse({ type: 'qdrant', url: 'https://qdrant.example' }))).success).toBe(true)
  const first = await provider.vector.scan('docs', { limit: 1 })
  expect(first).toMatchObject({
    success: true,
    data: {
      items: [],
      nextCursor: expect.any(String),
    },
  })
  if (!first.success)
    throw new Error(first.error.message)
  const second = await provider.vector.scan('docs', { limit: 1, cursor: first.data.nextCursor })
  expect(second).toMatchObject({
    success: true,
    data: { items: [] },
  })
  expect(second.success && second.data.nextCursor).toBeUndefined()
  expect(fetch.mock.calls[2][1].body).toContain('"offset":18446744073709551615')
  await provider.close()
})

it('响应超过16MiB明确失败，不返回截断结果', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(16 * 1024 * 1024 + 1))))
  await expect(new QdrantRestClient('https://qdrant.example').getCollections()).rejects.toThrow('Qdrant request failed')
})

it('jSON解析错误不包含服务端敏感原文', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{ private-server-password')))
  await expect(new QdrantRestClient('https://qdrant.example').getCollections()).rejects.toThrow('Qdrant request failed')
})

it('超时覆盖已返回headers但仍未完成的真实响应体', async () => {
  const timeout = AbortSignal.timeout.bind(AbortSignal)
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(100))
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.write('{"status":"ok","result":')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing fixture address')
  try {
    await expect(new QdrantRestClient(`http://127.0.0.1:${address.port}`).getCollections()).rejects.toThrow()
  }
  finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error
      ? reject(error)
      : resolve()))
  }
})
