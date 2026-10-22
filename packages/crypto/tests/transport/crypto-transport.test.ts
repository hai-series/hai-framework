import type { TransportServerKeyRing } from '../../src/index.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryKeyStore, crypto, TRANSPORT_BODY_LIMITS } from '../../src/index.js'

let serverKeyRing: TransportServerKeyRing

const KEY_EXCHANGE_URL = 'https://api.test/_hai/key-exchange'

/**
 * 测试用：把客户端 `encryptedFetch` 直接对接服务端 `manager`，
 * 跳过真实 HTTP，仅校验端到端密文/明文路径。
 */
function makeRoundTripFetch(
  manager: ReturnType<typeof crypto.transport.createServer> extends infer R
    ? R extends { success: true, data: infer M } ? M : never
    : never,
  echoHandler: (plaintext: string) => string,
): typeof fetch {
  return (async (input, init) => {
    const req = input instanceof Request ? input : new Request(typeof input === 'string' ? input : input.toString(), init)
    const url = req.url

    if (url === KEY_EXCHANGE_URL) {
      const body = await req.json() as { clientPublicKey: string }
      const clientId = await manager.registerClientKey(body.clientPublicKey)
      return new Response(JSON.stringify({
        serverPublicKey: manager.getServerPublicKey(),
        serverKeyId: manager.getServerKeyId(),
        clientId,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // echo endpoint：解密 → 回显 → 加密
    const payload = await req.clone().json() as { serverKeyId: string, encryptedKey: string, ciphertext: string, iv: string }
    const dec = manager.decryptRequest(payload)
    if (!dec.success)
      throw new Error(dec.error.message)
    const clientId = req.headers.get('X-Client-Id')!
    const echo = echoHandler(dec.data)
    const enc = await manager.encryptResponse(clientId, echo)
    if (!enc.success)
      throw new Error(enc.error.message)
    return new Response(JSON.stringify(enc.data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Encrypted': 'true',
      },
    })
  }) as typeof fetch
}

describe('crypto.transport', () => {
  beforeEach(async () => {
    await crypto.init()
    const key = crypto.asymmetric.generateKeyPair()
    if (!key.success)
      throw new Error(key.error.message)
    serverKeyRing = { activeKeyId: 'test-v1', keys: { 'test-v1': key.data } }
  })
  afterEach(async () => {
    vi.useRealTimers()
    await crypto.close()
  })

  it('exposes protocol constants', () => {
    expect(crypto.transport.protocol.CLIENT_ID_HEADER).toBe('X-Client-Id')
    expect(crypto.transport.protocol.ENCRYPTED_HEADER).toBe('X-Encrypted')
  })

  it('createServer fails when crypto not initialized', async () => {
    await crypto.close()
    const result = crypto.transport.createServer({ serverKeyRing, keyStore: createInMemoryKeyStore() })
    expect(result.success).toBe(false)
  })

  it('round-trips request/response through encrypted fetch', async () => {
    const serverResult = crypto.transport.createServer({ serverKeyRing, keyStore: createInMemoryKeyStore() })
    expect(serverResult.success).toBe(true)
    if (!serverResult.success)
      return

    const baseFetch = makeRoundTripFetch(
      serverResult.data,
      plaintext => JSON.stringify({ echo: JSON.parse(plaintext) }),
    )

    const client = crypto.transport.createClient({
      keyExchangeUrl: KEY_EXCHANGE_URL,
      fetch: baseFetch,
    })

    const response = await client.encryptedFetch('https://api.test/echo', {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { echo: { hello: string } }
    expect(body.echo.hello).toBe('world')

    // 密钥协商已完成
    expect(client.ready()).toBe(true)

    // 第二次复用同一 client，跳过密钥协商
    const r2 = await client.encryptedFetch('https://api.test/echo', {
      method: 'POST',
      body: JSON.stringify({ n: 42 }),
    })
    const b2 = await r2.json() as { echo: { n: number } }
    expect(b2.echo.n).toBe(42)
  })

  it('round-trips through an injected keyStore', async () => {
    const serverResult = crypto.transport.createServer({
      serverKeyRing,
      keyStore: createInMemoryKeyStore(32),
    })
    expect(serverResult.success).toBe(true)
    if (!serverResult.success)
      return

    const client = crypto.transport.createClient({
      keyExchangeUrl: KEY_EXCHANGE_URL,
      fetch: makeRoundTripFetch(serverResult.data, plaintext => plaintext),
    })

    const response = await client.encryptedFetch('https://api.test/echo', {
      method: 'POST',
      body: JSON.stringify({ message: 'shared-store-ready' }),
    })

    expect(response.status).toBe(200)
    const body = await response.json() as { message: string }
    expect(body.message).toBe('shared-store-ready')
  })

  it('encryptedFetch rejects when key exchange fails', async () => {
    const failingFetch = (async () => new Response('unavailable', { status: 503 })) as typeof fetch
    const client = crypto.transport.createClient({ keyExchangeUrl: KEY_EXCHANGE_URL, fetch: failingFetch })

    await expect(client.encryptedFetch('https://api.test/echo')).rejects.toThrow()
    expect(client.ready()).toBe(false)
  })

  it('reads body from Request when init.body is absent (oRPC compat)', async () => {
    const serverResult = crypto.transport.createServer({ serverKeyRing, keyStore: createInMemoryKeyStore() })
    if (!serverResult.success)
      throw new Error('createServer failed')

    const baseFetch = makeRoundTripFetch(serverResult.data, plaintext => plaintext)
    const client = crypto.transport.createClient({ keyExchangeUrl: KEY_EXCHANGE_URL, fetch: baseFetch })

    const req = new Request('https://api.test/echo', {
      method: 'POST',
      body: JSON.stringify({ source: 'request' }),
    })
    const response = await client.encryptedFetch(req)
    const body = await response.json() as { source: string }
    expect(body.source).toBe('request')
  })

  it('destroy() clears session state', async () => {
    const serverResult = crypto.transport.createServer({ serverKeyRing, keyStore: createInMemoryKeyStore() })
    if (!serverResult.success)
      throw new Error('createServer failed')
    const client = crypto.transport.createClient({
      keyExchangeUrl: KEY_EXCHANGE_URL,
      fetch: makeRoundTripFetch(serverResult.data, p => p),
    })
    await client.encryptedFetch('https://api.test/echo', { method: 'POST', body: '"x"' })
    expect(client.ready()).toBe(true)
    client.destroy()
    expect(client.ready()).toBe(false)
  })

  it('拒绝超限握手流并取消原流，失败后允许重新协商', async () => {
    const cancel = vi.fn()
    let pulls = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        controller.enqueue(new Uint8Array(8192))
      },
      cancel,
    })
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(stream))
      .mockResolvedValueOnce(Response.json({ serverKeyId: 'test-v1', serverPublicKey: 'server-key', clientId: 'client-id' }))
    const client = crypto.transport.createClient({ keyExchangeUrl: KEY_EXCHANGE_URL, fetch })
    expect((await client.init()).success).toBe(false)
    expect(cancel).toHaveBeenCalledOnce()
    expect(pulls).toBeLessThan(5)
    expect(stream.locked).toBe(false)
    expect((await client.init()).success).toBe(true)
  })

  it.each([null, { serverKeyId: 'test-v1', serverPublicKey: '你'.repeat(1366), clientId: 'id' }])('拒绝无效或超限服务端公钥：%j', async (body) => {
    const client = crypto.transport.createClient({
      keyExchangeUrl: KEY_EXCHANGE_URL,
      fetch: async () => Response.json(body),
    })
    expect((await client.init()).success).toBe(false)
    expect(client.ready()).toBe(false)
  })

  it('握手读取超时会取消挂起流并清除计时器', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    const stream = new ReadableStream<Uint8Array>({ cancel })
    const client = crypto.transport.createClient({
      keyExchangeUrl: KEY_EXCHANGE_URL,
      fetch: async () => new Response(stream),
    })
    const initializing = client.init()
    await vi.advanceTimersByTimeAsync(30_000)
    expect((await initializing).success).toBe(false)
    expect(cancel).toHaveBeenCalledOnce()
    expect(stream.locked).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('客户端超限明文在发送业务请求前停止读取并释放 reader', async () => {
    const cancel = vi.fn()
    let pulls = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        controller.enqueue(new Uint8Array(65536))
      },
      cancel,
    })
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ serverKeyId: 'test-v1', serverPublicKey: 'key', clientId: 'id' }))
    const client = crypto.transport.createClient({ keyExchangeUrl: KEY_EXCHANGE_URL, fetch })
    await expect(client.encryptedFetch('https://api.test/echo', { method: 'POST', body: stream })).rejects.toBeInstanceOf(RangeError)
    expect(fetch).toHaveBeenCalledOnce()
    expect(pulls).toBeLessThan(20)
    expect(cancel).toHaveBeenCalledOnce()
    expect(stream.locked).toBe(false)
  })

  it('客户端密文响应超限后取消并拒绝，不返回密文或剩余 tee 分支', async () => {
    const cancel = vi.fn()
    let pulls = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        controller.enqueue(new Uint8Array(65536))
      },
      cancel,
    })
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ serverKeyId: 'test-v1', serverPublicKey: 'key', clientId: 'id' }))
      .mockResolvedValueOnce(new Response(stream, { headers: { 'X-Encrypted': 'true' } }))
    const client = crypto.transport.createClient({ keyExchangeUrl: KEY_EXCHANGE_URL, fetch })
    await expect(client.encryptedFetch('https://api.test/echo')).rejects.toThrow()
    expect(pulls).toBeLessThan(Math.ceil(TRANSPORT_BODY_LIMITS.encryptedPayloadBytes / 65536) + 3)
    expect(cancel).toHaveBeenCalledOnce()
    expect(stream.locked).toBe(false)
  })

  it.each(['invalid json', '{}'])('异常加密响应不回退到原密文：%s', async (body) => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ serverKeyId: 'test-v1', serverPublicKey: 'key', clientId: 'id' }))
      .mockResolvedValueOnce(new Response(body, { headers: { 'X-Encrypted': 'true' } }))
    const client = crypto.transport.createClient({ keyExchangeUrl: KEY_EXCHANGE_URL, fetch })
    await expect(client.encryptedFetch('https://api.test/echo')).rejects.toThrow()
  })

  it('发送 ArrayBufferView 只读取有效切片并清除原正文的长度与编码头', async () => {
    const server = crypto.transport.createServer({ serverKeyRing, keyStore: createInMemoryKeyStore() })
    if (!server.success)
      throw new Error('createServer failed')
    const roundTrip = makeRoundTripFetch(server.data, text => text)
    const fetch = vi.fn<typeof globalThis.fetch>(roundTrip)
    const client = crypto.transport.createClient({ keyExchangeUrl: KEY_EXCHANGE_URL, fetch })
    const bytes = new TextEncoder().encode('before"你"after')
    const response = await client.encryptedFetch('https://api.test/echo', {
      method: 'POST',
      body: bytes.subarray(6, bytes.length - 5),
      headers: { 'Content-Length': '1', 'Content-Encoding': 'gzip' },
    })
    expect(await response.text()).toBe('"你"')
    const sentHeaders = new Headers(fetch.mock.calls[1]?.[1]?.headers)
    expect(sentHeaders.has('Content-Length')).toBe(false)
    expect(sentHeaders.has('Content-Encoding')).toBe(false)
  })

  it('取消一个等待握手的请求不影响同一客户端的其它调用', async () => {
    let finishHandshake: ((response: Response) => void) | undefined
    const handshake = new Promise<Response>((resolve) => {
      finishHandshake = resolve
    })
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(handshake)
      .mockResolvedValueOnce(new Response('ok'))
    const client = crypto.transport.createClient({ keyExchangeUrl: KEY_EXCHANGE_URL, fetch })
    const controller = new AbortController()
    const first = client.encryptedFetch('https://api.test/echo', { signal: controller.signal })
    const second = client.encryptedFetch('https://api.test/echo')
    controller.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    finishHandshake?.(Response.json({ serverKeyId: 'test-v1', serverPublicKey: 'key', clientId: 'id' }))
    expect(await (await second).text()).toBe('ok')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(false)
  })

  it('保留调用方 signal，读取待返回密文时取消会释放原流', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ cancel })
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ serverKeyId: 'test-v1', serverPublicKey: 'key', clientId: 'id' }))
      .mockResolvedValueOnce(new Response(stream, { headers: { 'X-Encrypted': 'true' } }))
    const client = crypto.transport.createClient({ keyExchangeUrl: KEY_EXCHANGE_URL, fetch })
    expect((await client.init()).success).toBe(true)
    const controller = new AbortController()
    const response = client.encryptedFetch('https://api.test/echo', { signal: controller.signal })
    await vi.waitFor(() => expect(stream.locked).toBe(true))
    controller.abort()
    await expect(response).rejects.toMatchObject({ cause: { name: 'AbortError' } })
    expect(fetch.mock.calls[1]?.[1]?.signal).toBe(controller.signal)
    expect(cancel).toHaveBeenCalledOnce()
    expect(stream.locked).toBe(false)
  })
})
