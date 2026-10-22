import type { CryptoFunctions, EncryptedPayload, EncryptedRequestPayload, TransportEncryptionManager, TransportServerKeyRing } from '@h-ai/crypto'
import type { ServContext } from '../src/serv-context.js'
import { apiContract } from '@h-ai/api-contract'
import { err, ok } from '@h-ai/core'
import { createInMemoryKeyStore, crypto, TRANSPORT_BODY_LIMITS, TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { serv } from '../src/serv-main.js'

let serverKeyRing: TransportServerKeyRing

const contract = apiContract.create({})
const procedures = serv.implement(contract).context<ServContext>().build()

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

// 仅隔离 HTTP 适配器的字节预算；真实算法与重放另有端到端回归。
function testPayload(): EncryptedRequestPayload {
  return { context: { version: 2, serverKeyId: 'test-v1', clientId: 'client-id', requestId: 'a'.repeat(32), issuedAt: Date.now(), method: 'POST', pathHash: 'a'.repeat(64) }, direction: 'request', status: 0, encryptedKey: 'a'.repeat(256), ciphertext: 'a'.repeat(32), iv: 'a'.repeat(32), tag: 'a'.repeat(64), signature: 'a'.repeat(128) }
}
function testResponse(): EncryptedPayload {
  return { ...testPayload(), direction: 'response', status: 200 }
}
function authenticatedGetHeaders() {
  return { [TRANSPORT_PROTOCOL.CLIENT_ID_HEADER]: 'client-id', [TRANSPORT_PROTOCOL.ENCRYPTED_HEADER]: 'true', [TRANSPORT_PROTOCOL.ENVELOPE_HEADER]: JSON.stringify({ ...testPayload(), context: { ...testPayload().context, method: 'GET' } }) }
}

function createFailingEncryptManager(): TransportEncryptionManager {
  return {
    getServerKeyId: () => 'test-v1',
    getServerPublicKey: () => 'server-public-key',
    registerClientKey: async () => 'client-id',
    getClientPublicKey: async () => 'client-public-key',
    encryptResponse: async () => err(new Error('encrypt failed')),
    decryptRequest: async () => ok(''),
    close: async () => {},
  }
}

describe('serv.createApp({ transport })', () => {
  beforeAll(async () => {
    await crypto.init()
    const key = crypto.asymmetric.generateKeyPair()
    if (!key.success)
      throw new Error(key.error.message)
    serverKeyRing = { activeKeyId: 'test-v1', keys: { 'test-v1': key.data } }
  })
  afterAll(async () => {
    await crypto.close()
  })

  it('handles key-exchange and rejects unauthenticated business requests', async () => {
    const app = serv.createApp({
      contract,
      procedures,
      http: { apiPrefix: '/api/v1', openapi: false, docs: false, rpc: false },
      transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, crypto },
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

  it('透传 transport.keyStore 到 crypto.transport.createServer', () => {
    const keyStore = createInMemoryKeyStore(12)
    const createServer = vi.fn<CryptoFunctions['transport']['createServer']>(options => crypto.transport.createServer(options))
    const forwardingCrypto = createCryptoWithTransportServer(createServer)

    serv.createApp({
      contract,
      procedures,
      http: { apiPrefix: '/api/v1', openapi: false, docs: false, rpc: false },
      transport: { serverKeyRing, crypto: forwardingCrypto, keyStore },
    })

    expect(createServer).toHaveBeenCalledOnce()
    expect(createServer).toHaveBeenCalledWith(expect.objectContaining({ keyStore }))
  })

  it('runs custom preflight middleware before transport', async () => {
    const origin = 'http://localhost:5176'
    const app = serv.createApp({
      contract,
      procedures,
      http: { apiPrefix: '/api/v1', openapi: false, docs: false, rpc: false },
      middlewares: [
        {
          middleware: (c, next) => {
            if (c.req.method !== 'OPTIONS')
              return next()

            return new Response(null, {
              status: 204,
              headers: {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'POST',
                'Access-Control-Allow-Headers': 'content-type, x-client-id, x-encrypted',
              },
            })
          },
        },
      ],
      transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, crypto },
    })

    const response = await app.request('/api/v1/_hai/key-exchange', {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type, x-client-id, x-encrypted',
      },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    expect(response.headers.get('access-control-allow-headers')).toContain('x-client-id')
  })

  it('end-to-end roundtrip via crypto.transport.createClient', async () => {
    const app = serv.createApp({
      contract,
      procedures,
      http: { apiPrefix: '/api/v1', openapi: false, docs: false, rpc: false },
      transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, crypto },
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

  it('空 POST 仍使用认证封装，普通空请求拒绝', async () => {
    const app = serv.createApp({ contract, procedures, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, crypto } })
    const handler = vi.fn(() => new Response(null, { status: 204 }))
    app.post('/api/v1/empty', handler)
    expect((await app.request('/api/v1/empty', { method: 'POST' })).status).toBe(400)
    expect(handler).not.toHaveBeenCalled()
    const client = crypto.transport.createClient({ keyExchangeUrl: 'http://test.local/api/v1/_hai/key-exchange', fetch: (input, init) => app.fetch(new Request(input, init)) })
    expect((await client.encryptedFetch('http://test.local/api/v1/empty', { method: 'POST' })).status).toBe(204)
    expect(handler).toHaveBeenCalledOnce()
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
      transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, crypto: failingCrypto },
    })

    app.get('/api/v1/secret', c => c.json({ secret: 'plain' }))

    const resp = await app.request('/api/v1/secret', {
      headers: authenticatedGetHeaders(),
    })

    expect(resp.status).toBe(500)
    expect(resp.headers.get(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)).toBeNull()
    await expect(resp.json()).resolves.toMatchObject({ error: expect.not.stringContaining('plain') })
  })

  it.each([
    { name: '无 Content-Type/Length 的字节正文', stream: false, headers: {} },
    { name: '无 Content-Type/Length 的流正文', stream: true, headers: {} },
    { name: 'chunked 流正文', stream: true, headers: { 'Transfer-Encoding': 'chunked' } },
    { name: '伪造 Content-Length=0 的非空流', stream: true, headers: { 'Content-Length': '0', 'Content-Type': 'application/json' } },
    { name: '自定义方法的非空流', stream: true, headers: { 'Content-Type': 'application/json' }, method: 'PROPFIND' },
  ])('实际非空请求必须加密：$name', async ({ stream, headers, method }) => {
    const transportCrypto = createCryptoWithTransportServer(() => ({ success: true, data: createFailingEncryptManager() }))
    const app = serv.createApp({ contract, procedures, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, crypto: transportCrypto } })
    const handler = vi.fn(() => new Response(null, { status: 204 }))
    app.all('/api/v1/raw-body', handler)
    const bytes = new TextEncoder().encode('{"amount":90000}')
    const body = stream
      ? new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes)
            controller.close()
          },
        })
      : bytes
    const request = new Request('http://localhost/api/v1/raw-body', {
      method: method ?? 'POST',
      headers: { [TRANSPORT_PROTOCOL.CLIENT_ID_HEADER]: 'client-id', ...headers },
      body,
      // @ts-expect-error Node fetch 的流式请求需要 duplex。
      duplex: 'half',
    })
    expect((await app.fetch(request)).status).toBe(400)
    expect(handler).not.toHaveBeenCalled()
  })

  it('无认证的零字节请求流仍拒绝进入业务', async () => {
    const transportCrypto = createCryptoWithTransportServer(() => ({ success: true, data: createFailingEncryptManager() }))
    const app = serv.createApp({ contract, procedures, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, crypto: transportCrypto } })
    const handler = vi.fn(async (request: Request) => {
      expect(await request.text()).toBe('')
      return new Response(null, { status: 204 })
    })
    app.post('/api/v1/raw-body', c => handler(c.req.raw))
    const request = new Request('http://localhost/api/v1/raw-body', {
      method: 'POST',
      headers: { [TRANSPORT_PROTOCOL.CLIENT_ID_HEADER]: 'client-id', 'Content-Type': 'application/json' },
      body: new ReadableStream<Uint8Array>({ start: controller => controller.close() }),
      // @ts-expect-error Node fetch 的流式请求需要 duplex。
      duplex: 'half',
    })
    expect((await app.fetch(request)).status).toBe(400)
    expect(handler).not.toHaveBeenCalled()
  })

  it('响应伪造 Content-Length=0 也不能跳过加密', async () => {
    const transportCrypto = createCryptoWithTransportServer(() => ({ success: true, data: createFailingEncryptManager() }))
    const app = serv.createApp({ contract, procedures, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, crypto: transportCrypto } })
    app.get('/api/v1/secret', () => new Response('{"secret":"private"}', {
      headers: { 'Content-Type': 'application/json', 'Content-Length': '0' },
    }))
    const response = await app.request('/api/v1/secret', {
      headers: authenticatedGetHeaders(),
    })
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('private')
  })

  it.each([
    { path: '/api/v1/_hai/key-exchange', encrypted: false },
    { path: '/api/v1/raw-body', encrypted: true },
  ])('对无长度头的超限输入流提前取消：$path', async ({ path, encrypted }) => {
    const manager = createFailingEncryptManager()
    const register = vi.spyOn(manager, 'registerClientKey')
    const decrypt = vi.spyOn(manager, 'decryptRequest')
    const transportCrypto = createCryptoWithTransportServer(() => ok(manager))
    const app = serv.createApp({ contract, procedures, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, crypto: transportCrypto } })
    const cancel = vi.fn()
    let pulled = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        controller.enqueue(new Uint8Array(65_536).fill(0x61))
      },
      cancel,
    })
    const request = new Request(`http://localhost${path}`, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        [TRANSPORT_PROTOCOL.CLIENT_ID_HEADER]: 'client-id',
        ...(encrypted ? { [TRANSPORT_PROTOCOL.ENCRYPTED_HEADER]: TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE } : {}),
      },
      // @ts-expect-error Node fetch 的流式请求需要 duplex。
      duplex: 'half',
    })
    expect((await app.fetch(request)).status).toBe(413)
    expect(cancel).toHaveBeenCalledOnce()
    expect(pulled).toBeLessThan(36)
    expect(body.locked).toBe(false)
    expect(register).not.toHaveBeenCalled()
    expect(decrypt).not.toHaveBeenCalled()
  })

  it.each([null, { clientPublicKey: 'key' }, { clientPublicKey: `04${'0'.repeat(128)}` }, { clientPublicKey: `04${'f'.repeat(128)}` }, { clientPublicKey: '你'.repeat(1366) }])('拒绝握手内无效或公钥字段超限的输入：%j', async (body) => {
    const manager = createFailingEncryptManager()
    const register = vi.spyOn(manager, 'registerClientKey')
    const app = serv.createApp({ contract, procedures, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, crypto: createCryptoWithTransportServer(() => ok(manager)) } })
    const response = await app.request('/api/v1/_hai/key-exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(response.status).toBe(400)
    expect(register).not.toHaveBeenCalled()
  })

  it('读取请求期间取消会停止原流并释放 reader', async () => {
    const manager = createFailingEncryptManager()
    const app = serv.createApp({ contract, procedures, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, crypto: createCryptoWithTransportServer(() => ok(manager)) } })
    const controller = new AbortController()
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    const request = new Request('http://localhost/api/v1/raw-body', {
      method: 'POST',
      body,
      signal: controller.signal,
      headers: { [TRANSPORT_PROTOCOL.CLIENT_ID_HEADER]: 'client-id', [TRANSPORT_PROTOCOL.ENCRYPTED_HEADER]: 'true' },
      // @ts-expect-error Node fetch 的流式请求需要 duplex。
      duplex: 'half',
    })
    const response = app.fetch(request)
    await vi.waitFor(() => expect(body.locked).toBe(true))
    controller.abort()
    expect((await response).status).toBe(400)
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })

  it('服务端公钥超限时不注册客户端', async () => {
    const manager = createFailingEncryptManager()
    vi.spyOn(manager, 'getServerPublicKey').mockReturnValue('k'.repeat(TRANSPORT_BODY_LIMITS.publicKeyBytes + 1))
    const register = vi.spyOn(manager, 'registerClientKey')
    const app = serv.createApp({ contract, procedures, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, crypto: createCryptoWithTransportServer(() => ok(manager)) } })
    const response = await app.request('/api/v1/_hai/key-exchange', { method: 'POST', body: JSON.stringify({ clientPublicKey: serverKeyRing.keys[serverKeyRing.activeKeyId]!.publicKey }) })
    expect(response.status).toBe(500)
    expect(register).not.toHaveBeenCalled()
  })

  it('响应超过 UTF-8 字节上限时提前取消且不泄漏明文', async () => {
    const manager = createFailingEncryptManager()
    const encrypt = vi.spyOn(manager, 'encryptResponse')
    const app = serv.createApp({ contract, procedures, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, crypto: createCryptoWithTransportServer(() => ok(manager)) } })
    const cancel = vi.fn()
    const bytes = new TextEncoder().encode('你'.repeat(400_000))
    const body = new ReadableStream<Uint8Array>({ start: controller => controller.enqueue(bytes), cancel })
    app.get('/api/v1/raw-response', () => new Response(body, { headers: { 'Content-Type': 'application/json', 'Content-Length': '1' } }))
    const response = await app.request('/api/v1/raw-response', { headers: authenticatedGetHeaders() })
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('你')
    expect(encrypt).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })

  it('允许精确 UTF-8 边界的响应并清除旧编码与长度头', async () => {
    const manager = createFailingEncryptManager()
    const encrypt = vi.spyOn(manager, 'encryptResponse').mockResolvedValue(ok(testResponse()))
    const app = serv.createApp({ contract, procedures, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, crypto: createCryptoWithTransportServer(() => ok(manager)) } })
    const payloadSize = TRANSPORT_BODY_LIMITS.plaintextBytes - 8
    const text = `{"x":"${'你'.repeat(Math.floor(payloadSize / 3))}${'a'.repeat(payloadSize % 3)}"}`
    app.get('/api/v1/raw-response', () => new Response(text, { headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } }))
    const response = await app.request('/api/v1/raw-response', { headers: authenticatedGetHeaders() })
    expect(response.status).toBe(200)
    expect(encrypt).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'client-id' }), text, 200)
    expect(response.headers.get('Content-Length')).toBeNull()
    expect(response.headers.get('Content-Encoding')).toBeNull()
  })

  it('解密后明文超限时不进入 handler，正常请求会重建 Hono 正文缓存', async () => {
    const manager = createFailingEncryptManager()
    const decrypt = vi.spyOn(manager, 'decryptRequest').mockResolvedValue(ok('你'.repeat(400_000)))
    vi.spyOn(manager, 'encryptResponse').mockResolvedValue(ok(testResponse()))
    const app = serv.createApp({
      contract,
      procedures,
      transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, crypto: createCryptoWithTransportServer(() => ok(manager)) },
      middlewares: [{ middleware: (c, next) => {
        c.req.bodyCache = { text: 'stale encrypted cache' }
        return next()
      } }],
    })
    const handler = vi.fn()
    app.post('/api/v1/raw-body', async (c) => {
      handler()
      expect(c.req.bodyCache).toEqual({})
      expect(await c.req.json()).toEqual({ ok: true })
      return c.json({ ok: true })
    })
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [TRANSPORT_PROTOCOL.CLIENT_ID_HEADER]: 'client-id', [TRANSPORT_PROTOCOL.ENCRYPTED_HEADER]: TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE },
      body: JSON.stringify(testPayload()),
    }
    expect((await app.request('/api/v1/raw-body', init)).status).toBe(413)
    expect(handler).not.toHaveBeenCalled()
    decrypt.mockResolvedValue(ok('{"ok":true}'))
    expect((await app.request('/api/v1/raw-body', init)).status).toBe(200)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('chunked 响应体超过 1 MiB 上限时 fail-closed', async () => {
    const app = serv.createApp({
      contract,
      procedures,
      http: { apiPrefix: '/api/v1', openapi: false, docs: false, rpc: false },
      transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, crypto },
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

    await expect(client.encryptedFetch('http://test.local/api/v1/huge', {
      method: 'POST',
      body: JSON.stringify({ x: 1 }),
    })).rejects.toThrow()
  })
})
