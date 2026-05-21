import type { ServContext } from '../src/serv-context.js'
import { createApiContract } from '@h-ai/api-contract'
import { crypto, TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { implement } from '@orpc/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serv } from '../src/serv-main.js'

const contract = createApiContract({})
const procedures = implement(contract).$context<ServContext>().router({})

describe('serv.createApp({ transport })', () => {
  beforeAll(async () => {
    await crypto.init()
  })
  afterAll(async () => {
    await crypto.close()
  })

  it('handles key-exchange and rejects unauthenticated business requests', async () => {
    const app = serv.createApp({
      contract,
      procedures,
      http: { apiPrefix: '/api/v1', openapi: false, docs: false, rpc: false },
      transport: { crypto },
    })

    // 健康检查路径不在 keyExchange 范围；但缺少 X-Client-Id 时被中间件拦截。
    // 健康路由由 createApp 自动挂载在 /health（apiPrefix 之外）。
    // 业务请求 (apiPrefix 下) 缺少 client-id 应被拒。
    const unauthed = await app.request('/api/v1/whatever', { method: 'POST' })
    expect(unauthed.status).toBe(400)

    // 密钥协商
    const kpResult = crypto.asymmetric.generateKeyPair()
    expect(kpResult.success).toBe(true)
    if (!kpResult.success)
      return

    const exchangeResp = await app.request('/api/v1/_hai/key-exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientPublicKey: kpResult.data.publicKey }),
    })
    expect(exchangeResp.status).toBe(200)
    const exchanged = await exchangeResp.json() as { serverPublicKey: string, clientId: string }
    expect(typeof exchanged.serverPublicKey).toBe('string')
    expect(typeof exchanged.clientId).toBe('string')
  })

  it('end-to-end roundtrip via crypto.transport.createClient', async () => {
    const app = serv.createApp({
      contract,
      procedures,
      http: { apiPrefix: '/api/v1', openapi: false, docs: false, rpc: false },
      transport: { crypto },
    })

    // 注册一个会回显请求体的纯 Hono 路由（绕开 oRPC）：直接读取明文 body 并返回 JSON。
    app.post('/api/v1/echo', async (c) => {
      const body = await c.req.json() as unknown
      return c.json({ echoed: body })
    })

    // 客户端通过 app.fetch 直接发请求，避免起 HTTP 服务。
    const client = crypto.transport.createClient({
      keyExchangeUrl: 'http://test.local/api/v1/_hai/key-exchange',
      fetch: async (input, init) => {
        const req = input instanceof Request ? input : new Request(typeof input === 'string' ? input : input.toString(), init)
        // app.request 接受 path（或 Request）；这里直接传 Request。
        return app.fetch(req)
      },
    })

    const resp = await client.encryptedFetch('http://test.local/api/v1/echo', {
      method: 'POST',
      body: JSON.stringify({ msg: 'hello' }),
    })
    expect(resp.status).toBe(200)
    // 响应应已被自动解密
    expect(resp.headers.get(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)).toBeNull()
    const data = await resp.json() as { echoed: { msg: string } }
    expect(data.echoed.msg).toBe('hello')
  })
})
