import type { TransportKeyStore, TransportServerKeyRing } from '@h-ai/crypto'
import type { AddressInfo } from 'node:net'
import type { ServContext } from '../src/serv-context.js'
import { apiContract } from '@h-ai/api-contract'
import { createInMemoryKeyStore, crypto, TRANSPORT_BODY_LIMITS, TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { serv } from '../src/serv-main.js'

let serverKeyRing: TransportServerKeyRing

function createApp(keyStore: TransportKeyStore = createInMemoryKeyStore()) {
  const contract = apiContract.create({})
  return serv.createApp({ contract, procedures: serv.implement(contract).context<ServContext>().build(), transport: { serverKeyRing, keyStore, crypto } })
}

describe('serv authenticated transport boundary', () => {
  beforeAll(async () => {
    expect((await crypto.init()).success).toBe(true)
    const key = crypto.asymmetric.generateKeyPair()
    if (!key.success)
      throw new Error(key.error.message)
    serverKeyRing = { activeKeyId: 'v1', keys: { v1: key.data } }
  })
  afterAll(async () => crypto.close())

  it.each(['iv', 'ciphertext', 'encryptedKey', 'tag', 'signature', 'context', 'client-header', 'method', 'path', 'query', 'marker'])('真实算法 %s 篡改被拦在 Hono handler 前', async (field) => {
    const app = createApp()
    const handler = vi.fn(() => Response.json({ amount: 10000 }))
    app.all('/api/v1/order', handler)
    app.all('/api/v1/other', handler)
    let status: number | undefined
    const client = crypto.transport.createClient({ keyExchangeUrl: 'http://test.local/api/v1/_hai/key-exchange', fetch: async (input, init) => {
      let request = new Request(input, init)
      if (!request.url.endsWith('/_hai/key-exchange')) {
        const payload = await request.json() as Record<string, unknown>
        const headers = new Headers(request.headers)
        const url = new URL(request.url)
        if (field === 'client-header') {
          headers.set(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER, 'another-client')
        }
        else if (field === 'marker') {
          headers.delete(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)
        }
        else if (field === 'path') {
          url.pathname = '/api/v1/other'
        }
        else if (field === 'query') {
          url.search = '?currency=USD'
        }
        else if (field === 'context') {
          payload.context = { ...(payload.context as Record<string, unknown>), requestId: 'f'.repeat(32) }
        }
        else if (field !== 'method') {
          const value = String(payload[field])
          payload[field] = `${value[0] === 'a' ? 'b' : 'a'}${value.slice(1)}`
        }
        request = new Request(url, { method: field === 'method' ? 'PUT' : 'POST', headers, body: JSON.stringify(payload) })
      }
      const response = await app.fetch(request)
      status = response.status
      return response
    } })
    await expect(client.encryptedFetch('http://test.local/api/v1/order?currency=CNY', { method: 'POST', body: '{"amount":10000}' })).rejects.toThrow()
    expect(status).toBe(400)
    expect(handler).not.toHaveBeenCalled()
  })

  it('两套 Hono 节点并发收到同一请求时仅一个 handler 执行且正常响应可关联', async () => {
    const store = createInMemoryKeyStore()
    const a = createApp(store)
    const b = createApp(store)
    const handler = vi.fn(() => Response.json({ amount: 10000 }))
    a.post('/api/v1/order', handler)
    b.post('/api/v1/order', handler)
    let statuses: number[] = []
    const client = crypto.transport.createClient({ keyExchangeUrl: 'http://test.local/api/v1/_hai/key-exchange', fetch: async (input, init) => {
      const request = new Request(input, init)
      if (request.url.endsWith('/_hai/key-exchange'))
        return a.fetch(request)
      const body = await request.text()
      const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? a : b).fetch(new Request(request.url, { method: request.method, headers: request.headers, body }))))
      statuses = responses.map(r => r.status)
      const response = responses.find(r => r.status === 200)
      if (!response)
        throw new Error('No authenticated response')
      return response
    } })
    expect(await (await client.encryptedFetch('http://test.local/api/v1/order', { method: 'POST', body: '{}' })).json()).toEqual({ amount: 10000 })
    expect(statuses.filter(s => s === 200)).toHaveLength(1)
    expect(statuses.filter(s => s === 400)).toHaveLength(7)
    expect(handler).toHaveBeenCalledOnce()
  })

  it.each(['GET', 'HEAD'])('无正文的 %s 也必须认证，空响应使用签名头封装', async (method) => {
    const app = createApp()
    app.get('/api/v1/empty', c => c.body(null, 204))
    const wire: Response[] = []
    const client = crypto.transport.createClient({ keyExchangeUrl: 'http://test.local/api/v1/_hai/key-exchange', fetch: async (input, init) => {
      const request = new Request(input, init)
      if (!request.url.endsWith('/_hai/key-exchange'))
        expect(request.headers.has(TRANSPORT_PROTOCOL.ENVELOPE_HEADER)).toBe(true)
      const response = await app.fetch(request)
      wire.push(response.clone())
      return response
    } })
    const response = await client.encryptedFetch('http://test.local/api/v1/empty', { method })
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(wire[1]?.headers.has(TRANSPORT_PROTOCOL.ENVELOPE_HEADER)).toBe(true)
    expect((await app.request('/api/v1/empty', { method, headers: { 'X-Client-Id': 'id' } })).status).toBe(400)
  })

  it('真实 Node HTTP 默认头限制下，最长转义 URL 的最大正文及 GET/HEAD 往返成功', async () => {
    const app = createApp()
    app.all('/api/v1/echo', async (c) => {
      if (c.req.method !== 'POST')
        return new Response(null, { status: 204 })
      return new Response(await c.req.text(), { headers: { 'Content-Type': 'application/json' } })
    })
    const node = serv.listen(app, { host: '127.0.0.1', port: 0 })
    await new Promise<void>((resolveReady, reject) => {
      if (node.server.listening)
        resolveReady()
      else
        node.server.once('listening', () => resolveReady())
      node.server.once('error', reject)
    })
    const port = (node.server.address() as AddressInfo).port
    const base = `http://127.0.0.1:${port}`
    const headerSizes: number[] = []
    const client = crypto.transport.createClient({ keyExchangeUrl: `${base}/api/v1/_hai/key-exchange`, fetch: async (input, init) => {
      const request = new Request(input, init)
      const requestEnvelope = request.headers.get(TRANSPORT_PROTOCOL.ENVELOPE_HEADER)
      if (requestEnvelope)
        headerSizes.push(new TextEncoder().encode(requestEnvelope).byteLength)
      // 真实全局 fetch 与 serv.listen 均使用原生 Node HTTP 默认头限制，无自定义 dispatcher。
      const response = await fetch(request)
      const responseEnvelope = response.headers.get(TRANSPORT_PROTOCOL.ENVELOPE_HEADER)
      if (responseEnvelope)
        headerSizes.push(new TextEncoder().encode(responseEnvelope).byteLength)
      return response
    } })
    try {
      const url = new URL(`${base}/api/v1/echo?q=`)
      url.search = `?q=${'\\'.repeat(8192 - url.pathname.length - 3)}`
      const actual = new URL(new Request(url).url)
      expect(new TextEncoder().encode(actual.pathname + actual.search).byteLength).toBe(8192)
      const bytes = TRANSPORT_BODY_LIMITS.plaintextBytes - 2
      const body = `"${'你'.repeat(Math.floor(bytes / 3))}${'a'.repeat(bytes % 3)}"`
      expect(new TextEncoder().encode(body).byteLength).toBe(TRANSPORT_BODY_LIMITS.plaintextBytes)
      expect(await (await client.encryptedFetch(new Request(url, { method: 'POST', body }))).text()).toBe(body)
      for (const method of ['GET', 'HEAD'])
        expect((await client.encryptedFetch(new Request(url, { method }))).status).toBe(204)
      expect(headerSizes).toHaveLength(4)
      expect(headerSizes.every(size => size < 2048)).toBe(true)
    }
    finally {
      client.destroy()
      await node.close()
    }
  }, 30_000)
})
