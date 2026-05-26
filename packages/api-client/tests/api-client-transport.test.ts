import { apiContract } from '@h-ai/api-contract'
import { crypto, TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { apiClient } from '../src/index.js'

const OutputSchema = apiContract.haiResultSchema(z.object({ echoed: z.unknown() }))
const ProtectedOutputSchema = apiContract.haiResultSchema(z.object({ ok: z.boolean() }))

const testContract = {
  echo: apiContract.route({ method: 'POST', path: '/echo' }).input(z.object({ msg: z.string() })).output(OutputSchema),
}

const protectedContract = {
  protected: apiContract.route({ method: 'GET', path: '/protected' }).output(ProtectedOutputSchema),
}

/**
 * 模拟一个对端 serv：处理 key-exchange + 解密 echo 请求 + 加密响应。
 * 直接用 crypto.transport.createServer 复用真实加解密路径。
 */
function makeServerFetch(): typeof fetch {
  const mgrResult = crypto.transport.createServer()
  if (!mgrResult.success)
    throw new Error('createServer failed')
  const mgr = mgrResult.data

  return (async (input, init) => {
    const req = input instanceof Request ? input : new Request(typeof input === 'string' ? input : input.toString(), init)
    const url = new URL(req.url)

    if (url.pathname === '/api/v1/_hai/key-exchange') {
      const body = await req.json() as { clientPublicKey: string }
      const clientId = await mgr.registerClientKey(body.clientPublicKey)
      return new Response(JSON.stringify({ serverPublicKey: mgr.getServerPublicKey(), clientId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 解密 → 业务回显 → 加密
    const clientId = req.headers.get('X-Client-Id')
    expect(clientId).toBeTruthy()
    const payload = await req.json() as { encryptedKey: string, ciphertext: string, iv: string }
    const dec = mgr.decryptRequest(payload)
    if (!dec.success)
      throw new Error(dec.error.message)
    const input2 = JSON.parse(dec.data) as { msg: string }
    const respPlain = JSON.stringify({ success: true, data: { echoed: input2 } })
    const enc = await mgr.encryptResponse(clientId!, respPlain)
    if (!enc.success)
      throw new Error(enc.error.message)
    return new Response(JSON.stringify(enc.data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Encrypted': 'true' },
    })
  }) as typeof fetch
}

function makeRefreshServerFetch(): { fetch: typeof fetch, calls: string[] } {
  const mgrResult = crypto.transport.createServer()
  if (!mgrResult.success)
    throw new Error('createServer failed')
  const mgr = mgrResult.data
  const calls: string[] = []

  async function encryptedJson(clientId: string, body: unknown): Promise<Response> {
    const enc = await mgr.encryptResponse(clientId, JSON.stringify(body))
    if (!enc.success)
      throw new Error(enc.error.message)
    return new Response(JSON.stringify(enc.data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        [TRANSPORT_PROTOCOL.ENCRYPTED_HEADER]: TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE,
      },
    })
  }

  const fetchImpl = (async (input, init) => {
    const req = input instanceof Request ? input : new Request(typeof input === 'string' ? input : input.toString(), init)
    const url = new URL(req.url)
    calls.push(`${req.method} ${url.pathname} auth=${req.headers.get('authorization') ?? ''} client=${req.headers.get(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER) ?? ''} credentials=${req.credentials}`)

    if (url.pathname === '/api/v1/_hai/key-exchange') {
      const body = await req.json() as { clientPublicKey: string }
      const clientId = await mgr.registerClientKey(body.clientPublicKey)
      return new Response(JSON.stringify({ serverPublicKey: mgr.getServerPublicKey(), clientId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const clientId = req.headers.get(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER)
    if (!clientId)
      return new Response(JSON.stringify({ error: 'missing transport client' }), { status: 400 })

    if (url.pathname === '/api/v1/auth/refresh') {
      expect(req.body).toBeNull()
      expect(req.credentials).toBe('include')
      return encryptedJson(clientId, {
        success: true,
        data: {
          tokens: {
            accessToken: 'new-access',
            expiresIn: 3600,
            tokenType: 'Bearer',
          },
        },
      })
    }

    if (url.pathname === '/api/v1/protected') {
      const authorization = req.headers.get('authorization')
      if (authorization === 'Bearer old-access') {
        return new Response(JSON.stringify({ success: false, error: { message: 'expired' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      expect(authorization).toBe('Bearer new-access')
      return encryptedJson(clientId, { success: true, data: { ok: true } })
    }

    return new Response(null, { status: 404 })
  }) as typeof fetch
  return { fetch: fetchImpl, calls }
}

describe('api-client transport', () => {
  beforeAll(async () => {
    await crypto.init()
  })
  afterAll(async () => {
    await crypto.close()
  })

  it('encrypts request and decrypts response transparently via crypto.transport', async () => {
    const client = apiClient.create(testContract)
    const init = await client.init({
      baseUrl: 'http://api.test/api/v1',
      fetch: makeServerFetch(),
      transport: { crypto },
    })
    expect(init.success).toBe(true)

    const result = await client.echo({ msg: 'hi' })
    expect(result.success).toBe(true)
    if (result.success)
      expect((result.data.echoed as { msg: string }).msg).toBe('hi')

    await client.close()
  })

  it('refresh request also uses transport when auth and transport are both enabled', async () => {
    const client = apiClient.create(protectedContract)
    const server = makeRefreshServerFetch()
    let refreshed = false
    let refreshFailed = false
    const init = await client.init({
      baseUrl: 'http://api.test/api/v1',
      fetch: server.fetch,
      auth: {
        onTokenRefreshed: () => { refreshed = true },
        onRefreshFailed: () => { refreshFailed = true },
      },
      transport: { crypto },
    })
    expect(init.success).toBe(true)

    await client.auth.setTokens({
      accessToken: 'old-access',
      refreshToken: 'server-managed-by-cookie',
      expiresIn: 1,
      tokenType: 'Bearer',
    })

    const result = await client.protected()

    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.ok).toBe(true)
    expect(refreshed).toBe(true)
    expect(refreshFailed).toBe(false)
    expect(server.calls.some(call => call.includes('POST /api/v1/auth/refresh') && call.includes('client=c_') && call.includes('credentials=include'))).toBe(true)
    expect(server.calls.some(call => call.includes('GET /api/v1/protected auth=Bearer new-access'))).toBe(true)

    await client.close()
  })
})
