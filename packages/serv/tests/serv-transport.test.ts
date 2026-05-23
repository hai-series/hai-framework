import type { CryptoFunctions, TransportEncryptionManager } from '@h-ai/crypto'
import type { ServContext } from '../src/serv-context.js'
import { createApiContract } from '@h-ai/api-contract'
import { err } from '@h-ai/core'
import { crypto, TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { implement } from '@orpc/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serv } from '../src/serv-main.js'

const contract = createApiContract({})
const procedures = implement(contract).$context<ServContext>().router({})

function createCryptoWithTransportServer(
  createServer: CryptoFunctions['transport']['createServer'],
): CryptoFunctions {
  return {
    ...crypto,
    transport: {
      ...crypto.transport,
      createServer,
    },
  }
}

function createFailingEncryptManager(): TransportEncryptionManager {
  return {
    getServerPublicKey: () => 'server-public-key',
    registerClientKey: async () => 'client-id',
    getClientPublicKey: async () => 'client-public-key',
    encryptResponse: async () => err(new Error('encrypt failed')),
    decryptRequest: () => err(new Error('decrypt not used')),
    close: async () => {},
  }
}

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

    // GET / __data 类无请求体场景也必须先带 clientId，不能因为无需解密 body 而放行。
    const unauthedGet = await app.request('/api/v1/whatever', { method: 'GET' })
    expect(unauthedGet.status).toBe(400)

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

  it('响应无法加密时不会明文透传', async () => {
    const failingCrypto = createCryptoWithTransportServer(() => ({
      success: true,
      data: createFailingEncryptManager(),
    }))
    const app = serv.createApp({
      contract,
      procedures,
      http: { apiPrefix: '/api/v1', openapi: false, docs: false, rpc: false },
      transport: { crypto: failingCrypto },
    })

    app.get('/api/v1/secret', c => c.json({ secret: 'plain' }))

    const resp = await app.request('/api/v1/secret', {
      headers: { [TRANSPORT_PROTOCOL.CLIENT_ID_HEADER]: 'client-id' },
    })

    expect(resp.status).toBe(500)
    expect(resp.headers.get(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)).toBeNull()
    await expect(resp.json()).resolves.toMatchObject({ error: expect.not.stringContaining('plain') })
  })

  it('chunked 响应体超过 1 MiB 上限时 fail-closed', async () => {
    const app = serv.createApp({
      contract,
      procedures,
      http: { apiPrefix: '/api/v1', openapi: false, docs: false, rpc: false },
      transport: { crypto },
    })

    // 注册一个返回 >1 MiB JSON 且不显式设置 Content-Length 的路由
    app.post('/api/v1/huge', async (c) => {
      const big = 'a'.repeat(1_048_577)
      return c.json({ payload: big })
    })

    // 先完成密钥协商以拿到合法 clientId
    const kpResult = crypto.asymmetric.generateKeyPair()
    expect(kpResult.success).toBe(true)
    if (!kpResult.success)
      return
    const exchangeResp = await app.request('/api/v1/_hai/key-exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientPublicKey: kpResult.data.publicKey }),
    })
    const exchanged = await exchangeResp.json() as { serverPublicKey: string, clientId: string }

    // 通过 crypto 客户端发起加密请求
    const client = crypto.transport.createClient({
      keyExchangeUrl: 'http://test.local/api/v1/_hai/key-exchange',
      fetch: async (input, init) => app.fetch(input instanceof Request ? input : new Request(typeof input === 'string' ? input : input.toString(), init)),
    })
    // 复用已注册的 clientId / serverPublicKey 以模拟会话
    void exchanged

    const resp = await client.encryptedFetch('http://test.local/api/v1/huge', {
      method: 'POST',
      body: JSON.stringify({ x: 1 }),
    })
    expect(resp.status).toBe(500)
    expect(resp.headers.get(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)).toBeNull()
    await expect(resp.json()).resolves.toMatchObject({ error: expect.any(String) })
  })
})
