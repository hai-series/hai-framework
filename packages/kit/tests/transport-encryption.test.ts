import type { CryptoFunctions, TransportEncryptionManager } from '@h-ai/crypto'
import type { Handle, RequestEvent } from '@sveltejs/kit'
import { err } from '@h-ai/core'
import { createInMemoryKeyStore, crypto, TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { kit } from '../src/kit-main.js'

const KEY_EXCHANGE_PATH = `/api${TRANSPORT_PROTOCOL.DEFAULT_KEY_EXCHANGE_PATH}`

function createEvent(request: Request): RequestEvent {
  return {
    url: new URL(request.url),
    request,
    locals: {},
    params: {},
    route: { id: null },
    getClientAddress: () => '127.0.0.1',
    cookies: {} as unknown,
    fetch: fetch as typeof globalThis.fetch,
    platform: undefined,
    setHeaders: () => {},
    depends: () => {},
    isDataRequest: false,
    isSubRequest: false,
  } as unknown as RequestEvent
}

function createEventWithUrl(request: Request, eventUrl: string, isDataRequest = false): RequestEvent {
  const event = createEvent(request)
  Object.defineProperty(event, 'url', {
    value: new URL(eventUrl),
    writable: true,
    configurable: true,
  })
  Object.defineProperty(event, 'isDataRequest', {
    value: isDataRequest,
    writable: true,
    configurable: true,
  })
  return event
}

async function dispatch(
  handle: Handle,
  request: Request,
  resolve: (event: RequestEvent) => Response | Promise<Response>,
  options?: { eventUrl?: string, isDataRequest?: boolean },
): Promise<Response> {
  const event = options?.eventUrl
    ? createEventWithUrl(request, options.eventUrl, options.isDataRequest ?? false)
    : createEvent(request)
  return handle({ event, resolve })
}

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

describe('kit.createHandle({ crypto: { transport } })', () => {
  beforeAll(async () => {
    await crypto.init()
  })

  afterAll(async () => {
    await crypto.close()
  })

  it('暴露统一密钥协商端点', async () => {
    const handle = kit.createHandle({ crypto: { crypto, transport: true } })
    const keyPair = crypto.asymmetric.generateKeyPair()
    expect(keyPair.success).toBe(true)
    if (!keyPair.success)
      return

    const request = new Request(`http://localhost${KEY_EXCHANGE_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientPublicKey: keyPair.data.publicKey }),
    })
    const resolve = vi.fn(() => new Response('should not run'))

    const response = await dispatch(handle, request, resolve)

    expect(response.status).toBe(200)
    expect(resolve).not.toHaveBeenCalled()
    const body = await response.json() as { serverPublicKey: string, clientId: string }
    expect(body.serverPublicKey).toBeTruthy()
    expect(body.clientId).toBeTruthy()
  })

  it('强制加密时拒绝缺少 clientId 的业务请求', async () => {
    const handle = kit.createHandle({ crypto: { crypto, transport: true } })
    const request = new Request('http://localhost/api/data')
    const resolve = vi.fn(() => new Response('should not run'))

    const response = await dispatch(handle, request, resolve)

    expect(response.status).toBe(400)
    expect(resolve).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('X-Client-Id') })
  })

  it('transport 管理器不可用时受保护路由 fail-closed', async () => {
    const failingCrypto = createCryptoWithTransportServer(() => err(new Error('server unavailable')))
    const handle = kit.createHandle({ crypto: { crypto: failingCrypto, transport: true } })
    const resolve = vi.fn(() => new Response('should not run'))

    const response = await dispatch(handle, new Request('http://localhost/api/data'), resolve)

    expect(response.status).toBe(500)
    expect(resolve).not.toHaveBeenCalled()
  })

  it('透传 transport.keyStore 到 crypto.transport.createServer', () => {
    const keyStore = createInMemoryKeyStore(8)
    const createServer = vi.fn<CryptoFunctions['transport']['createServer']>(options => crypto.transport.createServer(options))
    const forwardingCrypto = createCryptoWithTransportServer(createServer)

    kit.createHandle({
      crypto: {
        crypto: forwardingCrypto,
        transport: { keyStore, maxClients: 8 },
      },
    })

    expect(createServer).toHaveBeenCalledOnce()
    expect(createServer).toHaveBeenCalledWith(expect.objectContaining({ keyStore, maxClients: 8 }))
  })

  it('页面文档请求仍然透传，不会要求 X-Client-Id', async () => {
    const handle = kit.createHandle({ crypto: { crypto, transport: true } })
    const resolve = vi.fn(() => new Response('<html>ok</html>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }))

    const response = await dispatch(handle, new Request('http://localhost/'), resolve)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<html>ok</html>')
    expect(resolve).toHaveBeenCalledOnce()
  })

  it('默认响应包含基础安全头', async () => {
    const handle = kit.createHandle()
    const response = await dispatch(
      handle,
      new Request('http://localhost/api/public'),
      () => new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
  })

  it('默认也保护 SvelteKit __data.json 请求', async () => {
    const handle = kit.createHandle({ crypto: { crypto, transport: true } })
    const resolve = vi.fn(() => new Response('should not run'))

    const response = await dispatch(
      handle,
      new Request('http://localhost/admin/iam/roles/__data.json?x-sveltekit-invalidated=011'),
      resolve,
    )

    expect(response.status).toBe(400)
    expect(resolve).not.toHaveBeenCalled()
  })

  it('受保护的 __data.json 即使会命中 auth guard，也必须先经过 transport 拦截', async () => {
    const verifyToken = vi.fn().mockResolvedValue(null)
    const handle = kit.createHandle({
      auth: {
        verifyToken,
        loginUrl: '/auth/login',
        protectedPaths: ['/admin/*'],
      },
      crypto: { crypto, transport: true },
    })
    const resolve = vi.fn(() => new Response('should not run'))

    const response = await dispatch(
      handle,
      new Request('http://localhost/admin/iam/roles/__data.json?x-sveltekit-invalidated=001'),
      resolve,
    )

    expect(response.status).toBe(400)
    expect(verifyToken).not.toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('X-Client-Id') })
  })

  it('当 SvelteKit 将 event.url 标准化为页面路径时，仍必须按原始 __data.json 请求做 transport 判断', async () => {
    const verifyToken = vi.fn().mockResolvedValue(null)
    const handle = kit.createHandle({
      auth: {
        verifyToken,
        loginUrl: '/auth/login',
        protectedPaths: ['/admin/*'],
      },
      crypto: { crypto, transport: true },
    })
    const resolve = vi.fn(() => new Response('should not run'))
    const request = new Request('http://localhost/admin/iam/roles/__data.json?x-sveltekit-invalidated=001')

    const response = await dispatch(
      handle,
      request,
      resolve,
      {
        eventUrl: 'http://localhost/admin/iam/roles?x-sveltekit-invalidated=001',
        isDataRequest: true,
      },
    )

    expect(response.status).toBe(400)
    expect(verifyToken).not.toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('X-Client-Id') })
  })

  it('受保护路由响应无法加密时不会明文透传', async () => {
    const failingCrypto = createCryptoWithTransportServer(() => ({
      success: true,
      data: createFailingEncryptManager(),
    }))
    const handle = kit.createHandle({ crypto: { crypto: failingCrypto, transport: true } })

    const response = await dispatch(
      handle,
      new Request('http://localhost/api/data', {
        headers: { [TRANSPORT_PROTOCOL.CLIENT_ID_HEADER]: 'client-id' },
      }),
      () => new Response(JSON.stringify({ secret: 'plain' }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    expect(response.status).toBe(500)
    expect(response.headers.get(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)).toBeNull()
    await expect(response.json()).resolves.toMatchObject({ error: expect.not.stringContaining('plain') })
  })

  it('requireEncryption=false 时允许明文上传请求透传', async () => {
    const handle = kit.createHandle({
      crypto: { crypto, transport: { requireEncryption: false, encryptResponse: false } },
    })
    const body = '--boundary\r\nContent-Disposition: form-data; name="file"\r\n\r\navatar\r\n--boundary--'
    const request = new Request('http://localhost/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=boundary' },
      body,
    })

    const response = await dispatch(handle, request, async (event) => {
      expect(await event.request.text()).toBe(body)
      return new Response('uploaded')
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('uploaded')
  })

  it('通过 crypto.transport.createClient 完成端到端加解密', async () => {
    const handle = kit.createHandle({ crypto: { crypto, transport: true } })
    const serverFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = input instanceof Request
        ? input
        : new Request(new URL(input.toString(), 'http://localhost'), init)

      return dispatch(handle, request, async (event) => {
        const body = await event.request.json() as { msg: string }
        return new Response(JSON.stringify({ echoed: body }), {
          headers: { 'Content-Type': 'application/json' },
        })
      })
    }
    const client = crypto.transport.createClient({
      keyExchangeUrl: `http://localhost${KEY_EXCHANGE_PATH}`,
      fetch: serverFetch,
    })

    const response = await client.encryptedFetch('http://localhost/api/data', {
      method: 'POST',
      body: JSON.stringify({ msg: 'hello' }),
    })

    expect(response.headers.get(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)).toBeNull()
    const body = await response.json() as { echoed: { msg: string } }
    expect(body.echoed.msg).toBe('hello')
  })

  it('已协商客户端的空 POST 不要求 X-Encrypted 请求体', async () => {
    const handle = kit.createHandle({ crypto: { crypto, transport: true } })
    const serverFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = input instanceof Request
        ? input
        : new Request(new URL(input.toString(), 'http://localhost'), init)

      return dispatch(handle, request, async (event) => {
        expect(await event.request.text()).toBe('')
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        })
      })
    }
    const client = crypto.transport.createClient({
      keyExchangeUrl: `http://localhost${KEY_EXCHANGE_PATH}`,
      fetch: serverFetch,
    })

    const response = await client.encryptedFetch('http://localhost/api/auth/logout', { method: 'POST' })

    expect(response.status).toBe(200)
    expect(response.headers.get(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)).toBeNull()
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('svelteKit __data.json 响应使用 text/sveltekit-data 时也会被加密', async () => {
    const handle = kit.createHandle({ crypto: { crypto, transport: true } })
    const rawDataResponses: Response[] = []
    const serverFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = input instanceof Request
        ? input
        : new Request(new URL(input.toString(), 'http://localhost'), init)

      return dispatch(handle, request, async () => {
        const response = new Response('{"type":"data","nodes":[]}', {
          headers: { 'Content-Type': 'text/sveltekit-data' },
        })

        rawDataResponses.push(response.clone())
        return response
      })
    }
    const client = crypto.transport.createClient({
      keyExchangeUrl: `http://localhost${KEY_EXCHANGE_PATH}`,
      fetch: serverFetch,
    })

    const response = await client.encryptedFetch('http://localhost/admin/iam/roles/__data.json?x-sveltekit-invalidated=011')

    expect(rawDataResponses).toHaveLength(1)
    const rawDataResponse = rawDataResponses[0]
    expect(rawDataResponse).toBeDefined()
    if (!rawDataResponse)
      return

    expect(rawDataResponse.headers.get('Content-Type')).toContain('text/sveltekit-data')
    expect(response.headers.get(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)).toBeNull()
    expect(response.headers.get('Content-Type')).toContain('text/sveltekit-data')
    expect(await response.text()).toBe('{"type":"data","nodes":[]}')
  })

  it('支持自定义 keyExchangePath', async () => {
    const handle = kit.createHandle({
      crypto: { crypto, transport: { keyExchangePath: '/custom/exchange' } },
    })
    const keyPair = crypto.asymmetric.generateKeyPair()
    expect(keyPair.success).toBe(true)
    if (!keyPair.success)
      return

    const request = new Request('http://localhost/custom/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientPublicKey: keyPair.data.publicKey }),
    })

    const response = await dispatch(handle, request, () => new Response('should not run'))

    expect(response.status).toBe(200)
  })
})
