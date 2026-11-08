/** 固定 Qdrant REST 传输：完整响应超时、容量上限、安全错误及路径编码。 */
import { once } from 'node:events'
import { createServer } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { QdrantRestClient } from '../src/providers/vecdb-qdrant-rest.js'

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
