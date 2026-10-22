import type { CryptoFunctions, EncryptedPayload, EncryptedRequestPayload, TransportEncryptionManager, TransportServerKeyRing } from '@h-ai/crypto'
import type { Handle, RequestEvent } from '@sveltejs/kit'
import { err, ok } from '@h-ai/core'
import { createInMemoryKeyStore, crypto, TRANSPORT_BODY_LIMITS, TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { kit } from '../src/kit-main.js'

let serverKeyRing: TransportServerKeyRing

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

describe('kit.createHandle({ crypto: { transport } })', () => {
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

  it.each([
    { name: '无 Content-Type/Length 的字节正文', stream: false, headers: {} },
    { name: '无 Content-Type/Length 的流正文', stream: true, headers: {} },
    { name: 'chunked 流正文', stream: true, headers: { 'Transfer-Encoding': 'chunked' } },
    { name: '伪造 Content-Length=0 的非空流', stream: true, headers: { 'Content-Length': '0', 'Content-Type': 'application/json' } },
    { name: '自定义方法的非空流', stream: true, headers: { 'Content-Type': 'application/json' }, method: 'PROPFIND' },
  ])('实际非空请求必须加密：$name', async ({ stream, headers, method }) => {
    const transportCrypto = createCryptoWithTransportServer(() => ({ success: true, data: createFailingEncryptManager() }))
    const handle = kit.createHandle({ crypto: { crypto: transportCrypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
    const resolve = vi.fn(() => new Response(null, { status: 204 }))
    const bytes = new TextEncoder().encode('{"amount":90000}')
    const body = stream
      ? new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes)
            controller.close()
          },
        })
      : bytes
    const request = new Request('http://localhost/api/raw-body', {
      method: method ?? 'POST',
      headers: { [TRANSPORT_PROTOCOL.CLIENT_ID_HEADER]: 'client-id', ...headers },
      body,
      // @ts-expect-error Node fetch 的流式请求需要 duplex。
      duplex: 'half',
    })
    expect((await dispatch(handle, request, resolve)).status).toBe(400)
    expect(resolve).not.toHaveBeenCalled()
  })

  it('无认证的零字节请求流仍拒绝进入业务', async () => {
    const transportCrypto = createCryptoWithTransportServer(() => ({ success: true, data: createFailingEncryptManager() }))
    const handle = kit.createHandle({ crypto: { crypto: transportCrypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
    const resolve = vi.fn(async (event: RequestEvent) => {
      expect(await event.request.text()).toBe('')
      return new Response(null, { status: 204 })
    })
    const request = new Request('http://localhost/api/raw-body', {
      method: 'POST',
      headers: { [TRANSPORT_PROTOCOL.CLIENT_ID_HEADER]: 'client-id', 'Content-Type': 'application/json' },
      body: new ReadableStream<Uint8Array>({ start: controller => controller.close() }),
      // @ts-expect-error Node fetch 的流式请求需要 duplex。
      duplex: 'half',
    })
    expect((await dispatch(handle, request, resolve)).status).toBe(400)
    expect(resolve).not.toHaveBeenCalled()
  })

  it('响应伪造 Content-Length=0 也不能跳过加密', async () => {
    const transportCrypto = createCryptoWithTransportServer(() => ({ success: true, data: createFailingEncryptManager() }))
    const handle = kit.createHandle({ crypto: { crypto: transportCrypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
    const response = await dispatch(handle, new Request('http://localhost/api/data', {
      headers: authenticatedGetHeaders(),
    }), () => new Response('{"secret":"private"}', {
      headers: { 'Content-Type': 'application/json', 'Content-Length': '0' },
    }))
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('private')
  })

  it.each([
    { path: KEY_EXCHANGE_PATH, encrypted: false },
    { path: '/api/raw-body', encrypted: true },
  ])('对无长度头的超限输入流提前取消：$path', async ({ path, encrypted }) => {
    const manager = createFailingEncryptManager()
    const register = vi.spyOn(manager, 'registerClientKey')
    const decrypt = vi.spyOn(manager, 'decryptRequest')
    const handle = kit.createHandle({ crypto: { crypto: createCryptoWithTransportServer(() => ok(manager)), transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
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
    const resolve = vi.fn(() => new Response(null, { status: 204 }))
    expect((await dispatch(handle, request, resolve)).status).toBe(413)
    expect(cancel).toHaveBeenCalledOnce()
    expect(pulled).toBeLessThan(36)
    expect(body.locked).toBe(false)
    expect(register).not.toHaveBeenCalled()
    expect(decrypt).not.toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
  })

  it.each([null, { clientPublicKey: 'key' }, { clientPublicKey: `04${'0'.repeat(128)}` }, { clientPublicKey: `04${'f'.repeat(128)}` }, { clientPublicKey: '你'.repeat(1366) }])('拒绝握手内无效或公钥字段超限的输入：%j', async (body) => {
    const manager = createFailingEncryptManager()
    const register = vi.spyOn(manager, 'registerClientKey')
    const handle = kit.createHandle({ crypto: { crypto: createCryptoWithTransportServer(() => ok(manager)), transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
    const request = new Request(`http://localhost${KEY_EXCHANGE_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect((await dispatch(handle, request, () => new Response(null, { status: 204 }))).status).toBe(400)
    expect(register).not.toHaveBeenCalled()
  })

  it('读取请求期间取消会停止原流并释放 reader', async () => {
    const manager = createFailingEncryptManager()
    const handle = kit.createHandle({ crypto: { crypto: createCryptoWithTransportServer(() => ok(manager)), transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
    const controller = new AbortController()
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    const request = new Request('http://localhost/api/raw-body', {
      method: 'POST',
      body,
      signal: controller.signal,
      headers: { [TRANSPORT_PROTOCOL.CLIENT_ID_HEADER]: 'client-id', [TRANSPORT_PROTOCOL.ENCRYPTED_HEADER]: 'true' },
      // @ts-expect-error Node fetch 的流式请求需要 duplex。
      duplex: 'half',
    })
    const resolve = vi.fn(() => new Response(null, { status: 204 }))
    const response = dispatch(handle, request, resolve)
    await vi.waitFor(() => expect(body.locked).toBe(true))
    controller.abort()
    expect((await response).status).toBe(400)
    expect(resolve).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })

  it('服务端公钥超限时不注册客户端', async () => {
    const manager = createFailingEncryptManager()
    vi.spyOn(manager, 'getServerPublicKey').mockReturnValue('k'.repeat(TRANSPORT_BODY_LIMITS.publicKeyBytes + 1))
    const register = vi.spyOn(manager, 'registerClientKey')
    const handle = kit.createHandle({ crypto: { crypto: createCryptoWithTransportServer(() => ok(manager)), transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
    const request = new Request(`http://localhost${KEY_EXCHANGE_PATH}`, { method: 'POST', body: JSON.stringify({ clientPublicKey: serverKeyRing.keys[serverKeyRing.activeKeyId]!.publicKey }) })
    expect((await dispatch(handle, request, () => new Response(null, { status: 204 }))).status).toBe(500)
    expect(register).not.toHaveBeenCalled()
  })

  it('响应超过 UTF-8 字节上限时提前取消且不泄漏明文', async () => {
    const manager = createFailingEncryptManager()
    const encrypt = vi.spyOn(manager, 'encryptResponse')
    const handle = kit.createHandle({ crypto: { crypto: createCryptoWithTransportServer(() => ok(manager)), transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
    const cancel = vi.fn()
    const bytes = new TextEncoder().encode('你'.repeat(400_000))
    const body = new ReadableStream<Uint8Array>({ start: controller => controller.enqueue(bytes), cancel })
    const response = await dispatch(handle, new Request('http://localhost/api/data', { headers: authenticatedGetHeaders() }), () => new Response(body, { headers: { 'Content-Type': 'application/json', 'Content-Length': '1' } }))
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('你')
    expect(encrypt).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })

  it('允许精确 UTF-8 边界的响应并清除旧编码与长度头', async () => {
    const manager = createFailingEncryptManager()
    const encrypt = vi.spyOn(manager, 'encryptResponse').mockResolvedValue(ok(testResponse()))
    const handle = kit.createHandle({ crypto: { crypto: createCryptoWithTransportServer(() => ok(manager)), transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
    const payloadSize = TRANSPORT_BODY_LIMITS.plaintextBytes - 8
    const text = `{"x":"${'你'.repeat(Math.floor(payloadSize / 3))}${'a'.repeat(payloadSize % 3)}"}`
    const response = await dispatch(handle, new Request('http://localhost/api/data', { headers: authenticatedGetHeaders() }), () => new Response(text, { headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } }))
    expect(response.status).toBe(200)
    expect(encrypt).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'client-id' }), text, 200)
    expect(response.headers.get('Content-Length')).toBeNull()
    expect(response.headers.get('Content-Encoding')).toBeNull()
  })

  it('解密后明文超限时不进入业务，正常请求会重建可读取的 Request', async () => {
    const manager = createFailingEncryptManager()
    const decrypt = vi.spyOn(manager, 'decryptRequest').mockResolvedValue(ok('你'.repeat(400_000)))
    vi.spyOn(manager, 'encryptResponse').mockResolvedValue(ok(testResponse()))
    const handle = kit.createHandle({ crypto: { crypto: createCryptoWithTransportServer(() => ok(manager)), transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
    const resolve = vi.fn(async (event: RequestEvent) => {
      expect(await event.request.json()).toEqual({ ok: true })
      return new Response(null, { status: 204 })
    })
    const makeRequest = () => new Request('http://localhost/api/raw-body', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [TRANSPORT_PROTOCOL.CLIENT_ID_HEADER]: 'client-id', [TRANSPORT_PROTOCOL.ENCRYPTED_HEADER]: TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE },
      body: JSON.stringify(testPayload()),
    })
    expect((await dispatch(handle, makeRequest(), resolve)).status).toBe(413)
    expect(resolve).not.toHaveBeenCalled()
    decrypt.mockResolvedValue(ok('{"ok":true}'))
    expect((await dispatch(handle, makeRequest(), resolve)).status).toBe(204)
    expect(resolve).toHaveBeenCalledOnce()
  })

  it('暴露统一密钥协商端点', async () => {
    const handle = kit.createHandle({ crypto: { crypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
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
    const handle = kit.createHandle({ crypto: { crypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
    const request = new Request('http://localhost/api/data')
    const resolve = vi.fn(() => new Response('should not run'))

    const response = await dispatch(handle, request, resolve)

    expect(response.status).toBe(400)
    expect(resolve).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('X-Client-Id') })
  })

  it('transport 管理器不可用时受保护路由 fail-closed', async () => {
    const failingCrypto = createCryptoWithTransportServer(() => err(new Error('server unavailable')))
    const handle = kit.createHandle({ crypto: { crypto: failingCrypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
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
        transport: { serverKeyRing, keyStore },
      },
    })

    expect(createServer).toHaveBeenCalledOnce()
    expect(createServer).toHaveBeenCalledWith(expect.objectContaining({ keyStore }))
  })

  it('页面文档请求仍然透传，不会要求 X-Client-Id', async () => {
    const handle = kit.createHandle({ crypto: { crypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
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
    const handle = kit.createHandle({ crypto: { crypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
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
      crypto: { crypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } },
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
      crypto: { crypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } },
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
    const handle = kit.createHandle({ crypto: { crypto: failingCrypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })

    const response = await dispatch(
      handle,
      new Request('http://localhost/api/data', {
        headers: authenticatedGetHeaders(),
      }),
      () => new Response(JSON.stringify({ secret: 'plain' }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    expect(response.status).toBe(500)
    expect(response.headers.get(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)).toBeNull()
    await expect(response.json()).resolves.toMatchObject({ error: expect.not.stringContaining('plain') })
  })

  it('显式排除上传路径后才允许明文上传', async () => {
    const handle = kit.createHandle({ crypto: { crypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, excludePaths: ['/api/upload'] } } })
    const resolve = vi.fn(async (event: RequestEvent) => new Response(await event.request.text()))
    const response = await dispatch(handle, new Request('http://localhost/api/upload', { method: 'POST', body: 'upload' }), resolve)
    expect(await response.text()).toBe('upload')
    expect(resolve).toHaveBeenCalledOnce()
  })
  it('通过 crypto.transport.createClient 完成端到端加解密', async () => {
    const handle = kit.createHandle({ crypto: { crypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
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
    const handle = kit.createHandle({ crypto: { crypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
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
    const handle = kit.createHandle({ crypto: { crypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing } } })
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
      crypto: { crypto, transport: { keyStore: createInMemoryKeyStore(), serverKeyRing, keyExchangePath: '/custom/exchange' } },
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
