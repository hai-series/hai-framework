import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryKeyStore, crypto } from '../../src/index.js'

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
        clientId,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // echo endpoint：解密 → 回显 → 加密
    const payload = await req.clone().json() as { encryptedKey: string, ciphertext: string, iv: string }
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
  })
  afterEach(async () => {
    await crypto.close()
  })

  it('exposes protocol constants', () => {
    expect(crypto.transport.protocol.CLIENT_ID_HEADER).toBe('X-Client-Id')
    expect(crypto.transport.protocol.ENCRYPTED_HEADER).toBe('X-Encrypted')
  })

  it('createServer fails when crypto not initialized', async () => {
    await crypto.close()
    const result = crypto.transport.createServer()
    expect(result.success).toBe(false)
  })

  it('round-trips request/response through encrypted fetch', async () => {
    const serverResult = crypto.transport.createServer()
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
    const serverResult = crypto.transport.createServer()
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
    const serverResult = crypto.transport.createServer()
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
})
