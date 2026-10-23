import type { TransportMessageContext } from '@h-ai/crypto'
import { apiContract } from '@h-ai/api-contract'
import { authenticateTransportRequest, createInMemoryKeyStore, crypto, TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { apiClient } from '../src/index.js'

const testContract = {
  echo: apiContract
    .route({ method: 'POST', path: '/echo' })
    .input(z.object({ msg: z.string() }))
    .output(apiContract.haiResultSchema(z.object({ echoed: z.unknown() }))),
}

const protectedContract = {
  protected: apiContract
    .route({ method: 'GET', path: '/protected' })
    .output(apiContract.haiResultSchema(z.object({ ok: z.boolean() }))),
}

/**
 * 模拟一个对端 serv：处理 key-exchange + 解密 echo 请求 + 加密响应。
 * 直接用 crypto.transport.createServer 复用真实加解密路径。
 */
function makeServerFetch(): typeof fetch {
  const key = crypto.asymmetric.generateKeyPair()
  if (!key.success)
    throw new Error(key.error.message)
  const mgrResult = crypto.transport.createServer({ keyStore: createInMemoryKeyStore(), serverKeyRing: { activeKeyId: 'test-v1', keys: { 'test-v1': key.data } } })
  if (!mgrResult.success)
    throw new Error('createServer failed')
  const mgr = mgrResult.data

  return (async (input, init) => {
    const req = input instanceof Request ? input : new Request(typeof input === 'string' ? input : input.toString(), init)
    const url = new URL(req.url)

    if (url.pathname === '/api/v1/_hai/key-exchange') {
      const body = await req.json() as { clientPublicKey: string }
      const clientId = await mgr.registerClientKey(body.clientPublicKey)
      return new Response(JSON.stringify({ serverPublicKey: mgr.getServerPublicKey(), serverKeyId: mgr.getServerKeyId(), clientId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 解密 → 业务回显 → 加密
    const clientId = req.headers.get('X-Client-Id')
    expect(clientId).toBeTruthy()
    const verified = await authenticateTransportRequest(mgr, req)
    if (!verified.success)
      throw new Error(verified.error.message)
    const input2 = JSON.parse(verified.data.plaintext) as { msg: string }
    const respPlain = JSON.stringify({ success: true, data: { echoed: input2 } })
    const enc = await mgr.encryptResponse(verified.data.context, respPlain, 200)
    if (!enc.success)
      throw new Error(enc.error.message)
    return new Response(JSON.stringify(enc.data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Encrypted': 'true' },
    })
  }) as typeof fetch
}

function makeRefreshServerFetch(domainUnauthorized = false): { fetch: typeof fetch, calls: string[] } {
  const key = crypto.asymmetric.generateKeyPair()
  if (!key.success)
    throw new Error(key.error.message)
  const mgrResult = crypto.transport.createServer({ keyStore: createInMemoryKeyStore(), serverKeyRing: { activeKeyId: 'test-v1', keys: { 'test-v1': key.data } } })
  if (!mgrResult.success)
    throw new Error('createServer failed')
  const mgr = mgrResult.data
  const calls: string[] = []

  async function encryptedJson(context: TransportMessageContext, body: unknown, status = 200): Promise<Response> {
    const enc = await mgr.encryptResponse(context, JSON.stringify(body), status)
    if (!enc.success)
      throw new Error(enc.error.message)
    return new Response(JSON.stringify(enc.data), {
      status,
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
      return new Response(JSON.stringify({ serverPublicKey: mgr.getServerPublicKey(), serverKeyId: mgr.getServerKeyId(), clientId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const clientId = req.headers.get(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER)
    if (!clientId)
      return new Response(JSON.stringify({ error: 'missing transport client' }), { status: 400 })

    const verified = await authenticateTransportRequest(mgr, req)
    if (!verified.success)
      throw new Error(verified.error.message)
    if (url.pathname === '/api/v1/auth/refresh') {
      expect(verified.data.plaintext).toBe('')
      expect(req.credentials).toBe('include')
      return encryptedJson(verified.data.context, {
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
        if (domainUnauthorized)
          return encryptedJson(verified.data.context, { success: false, error: { code: 'hai:serv:401', message: 'Expired', httpStatus: 401 } })
        return encryptedJson(verified.data.context, { success: false, error: { message: 'expired' } }, 401)
      }
      expect(authorization).toBe('Bearer new-access')
      return encryptedJson(verified.data.context, { success: true, data: { ok: true } })
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

  it.each([false, true])('hTTP/domain unauthorized=%s refresh keeps encrypted transport', async (domainUnauthorized) => {
    const client = apiClient.create(protectedContract)
    const server = makeRefreshServerFetch(domainUnauthorized)
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
