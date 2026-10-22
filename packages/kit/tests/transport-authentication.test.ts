import type { TransportServerKeyRing } from '@h-ai/crypto'
import type { Handle, RequestEvent } from '@sveltejs/kit'
import { createInMemoryKeyStore, crypto, TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { kit } from '../src/kit-main.js'

let serverKeyRing: TransportServerKeyRing

/** 仅运行 transport，不访问 cookies/platform；使用真实原生 Request，其余为最小事件夹具。 */
function dispatch(handle: Handle, request: Request, resolve: (event: RequestEvent) => Promise<Response> | Response) {
  const event = { request, url: new URL(request.url), locals: {}, params: {}, route: { id: null } } as RequestEvent
  return handle({ event, resolve })
}

describe('kit authenticated transport boundary', () => {
  beforeAll(async () => {
    expect((await crypto.init()).success).toBe(true)
    const key = crypto.asymmetric.generateKeyPair()
    if (!key.success)
      throw new Error(key.error.message)
    serverKeyRing = { activeKeyId: 'v1', keys: { v1: key.data } }
  })
  afterAll(async () => crypto.close())

  it.each(['iv', 'ciphertext', 'encryptedKey', 'tag', 'signature', 'client-header', 'method', 'path', 'query', 'marker'])('真实 %s 篡改不进入 SvelteKit resolve', async (field) => {
    const handle = kit.createHandle({ crypto: { crypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
    const resolve = vi.fn(() => Response.json({ amount: 10000 }))
    let status: number | undefined
    const client = crypto.transport.createClient({ keyExchangeUrl: 'http://localhost/api/_hai/key-exchange', fetch: async (input, init) => {
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
          url.pathname = '/api/other'
        }
        else if (field === 'query') {
          url.search = '?currency=USD'
        }
        else if (field !== 'method') {
          const value = String(payload[field])
          payload[field] = `${value[0] === 'a' ? 'b' : 'a'}${value.slice(1)}`
        }
        request = new Request(url, { method: field === 'method' ? 'PUT' : 'POST', headers, body: JSON.stringify(payload) })
      }
      const response = await dispatch(handle, request, resolve)
      status = response.status
      return response
    } })
    await expect(client.encryptedFetch('http://localhost/api/order?currency=CNY', { method: 'POST', body: '{"amount":10000}' })).rejects.toThrow()
    expect(status).toBe(400)
    expect(resolve).not.toHaveBeenCalled()
  })

  it('两个 kit 节点共用 registry，并发重放仅一次 resolve', async () => {
    const keyStore = createInMemoryKeyStore()
    const nodes = [0, 1].map(() => kit.createHandle({ crypto: { crypto, transport: { keyStore, serverKeyRing } } }))
    const resolve = vi.fn(() => Response.json({ ok: true }))
    let statuses: number[] = []
    const client = crypto.transport.createClient({ keyExchangeUrl: 'http://localhost/api/_hai/key-exchange', fetch: async (input, init) => {
      const request = new Request(input, init)
      if (request.url.endsWith('/_hai/key-exchange'))
        return dispatch(nodes[0]!, request, resolve)
      const body = await request.text()
      const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => dispatch(nodes[i % 2]!, new Request(request.url, { method: request.method, headers: request.headers, body }), resolve)))
      statuses = responses.map(r => r.status)
      const response = responses.find(r => r.status === 200)
      if (!response)
        throw new Error('No authenticated response')
      return response
    } })
    expect(await (await client.encryptedFetch('http://localhost/api/order', { method: 'POST', body: '{}' })).json()).toEqual({ ok: true })
    expect(statuses.filter(s => s === 200)).toHaveLength(1)
    expect(resolve).toHaveBeenCalledOnce()
  })

  it.each(['GET', 'HEAD'])('空 %s 请求与 204 响应均认证', async (method) => {
    const handle = kit.createHandle({ crypto: { crypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
    const resolve = vi.fn(() => new Response(null, { status: 204 }))
    const client = crypto.transport.createClient({ keyExchangeUrl: 'http://localhost/api/_hai/key-exchange', fetch: (input, init) => dispatch(handle, new Request(input, init), resolve) })
    const response = await client.encryptedFetch('http://localhost/api/empty', { method })
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(resolve).toHaveBeenCalledOnce()
  })
})
