import type { EncryptedPayload, EncryptedRequestPayload, TransportKeyPair, TransportMessageContext } from '../../src/index.js'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { authenticateTransportRequest, createInMemoryKeyStore, crypto, TRANSPORT_BODY_LIMITS, TRANSPORT_PROTOCOL } from '../../src/index.js'
import { sealTransportPayload } from '../../src/transport/crypto-transport-codec.js'

let serverKey: TransportKeyPair
let clientKey: TransportKeyPair

async function fixture() {
  const keyStore = createInMemoryKeyStore()
  const ring = { activeKeyId: 'v1', keys: { v1: serverKey } }
  const a = crypto.transport.createServer({ serverKeyRing: ring, keyStore })
  const b = crypto.transport.createServer({ serverKeyRing: ring, keyStore })
  if (!a.success || !b.success)
    throw new Error('Transport fixture initialization failed')
  const clientId = await a.data.registerClientKey(clientKey.publicKey)
  const digest = crypto.hash.hash('/orders?currency=CNY')
  if (!digest.success)
    throw new Error(digest.error.message)
  const context: TransportMessageContext = { version: 2, serverKeyId: 'v1', clientId, requestId: crypto.symmetric.generateKey(), issuedAt: Date.now(), method: 'POST', pathHash: digest.data }
  const sealed = sealTransportPayload(crypto, '{"amount":10000}', context, 'request', 0, serverKey.publicKey, clientKey.privateKey)
  if (!sealed.success)
    throw new Error(sealed.error.message)
  const payload: EncryptedRequestPayload = { ...sealed.data, direction: 'request', status: 0 }
  return { a: a.data, b: b.data, keyStore, payload, expected: { clientId, method: context.method, path: '/orders?currency=CNY' } }
}

/** 独立构造协议规定的签名输入，以测试已验签但 MAC 无效时仍拒绝 CBC。 */
function resign(payload: EncryptedRequestPayload): EncryptedRequestPayload {
  const c = payload.context
  const text = JSON.stringify(['hai-transport', c.version, payload.direction, c.serverKeyId, c.clientId, c.requestId, c.issuedAt, c.method, c.pathHash, payload.status, payload.encryptedKey, payload.ciphertext, payload.iv])
  const signed = crypto.asymmetric.sign(JSON.stringify([text, payload.tag]), clientKey.privateKey)
  if (!signed.success)
    throw new Error(signed.error.message)
  return { ...payload, signature: signed.data }
}

function requestFor(payload: EncryptedRequestPayload, url = 'https://example.test/orders?currency=CNY', method = 'POST'): Request {
  return new Request(url, { method, headers: { 'X-Client-Id': payload.context.clientId, 'X-Encrypted': 'true' }, body: JSON.stringify(payload) })
}

describe('authenticated transport protocol', () => {
  beforeAll(async () => {
    expect((await crypto.init()).success).toBe(true)
    const server = crypto.asymmetric.generateKeyPair()
    const client = crypto.asymmetric.generateKeyPair()
    if (!server.success || !client.success)
      throw new Error('Failed to prepare transport keys')
    serverKey = server.data
    clientKey = client.data
  })
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => crypto.close())

  it.each(['encryptedKey', 'ciphertext', 'iv', 'tag', 'signature'] as const)('篡改 %s 在 CBC 解密和 nonce 消费前拒绝', async (field) => {
    const f = await fixture()
    const value = f.payload[field]
    const payload = { ...f.payload, [field]: `${value[0] === 'a' ? 'b' : 'a'}${value.slice(1)}` }
    const decrypt = vi.spyOn(crypto.symmetric, 'decryptWithIV')
    const claim = vi.spyOn(f.keyStore, 'claimRequest')
    expect((await f.a.decryptRequest(payload, f.expected)).success).toBe(false)
    expect(decrypt).not.toHaveBeenCalled()
    expect(claim).not.toHaveBeenCalled()
    expect(await f.b.decryptRequest(f.payload, f.expected)).toMatchObject({ success: true, data: '{"amount":10000}' })
  })

  it.each(['version', 'serverKeyId', 'clientId', 'requestId', 'issuedAt', 'method', 'pathHash'] as const)('上下文 %s 不能被替换', async (field) => {
    const f = await fixture()
    const context = { ...f.payload.context, [field]: field === 'version' ? 1 : field === 'issuedAt' ? Date.now() + 1 : field === 'requestId' ? 'b'.repeat(32) : field === 'pathHash' ? 'b'.repeat(64) : 'changed' }
    const decrypt = vi.spyOn(crypto.symmetric, 'decryptWithIV')
    // 非法版本用于运行时边界回归，明确绕过静态字面量约束。
    const payload = { ...f.payload, context } as EncryptedRequestPayload
    expect((await f.a.decryptRequest(payload, f.expected)).success).toBe(false)
    expect(decrypt).not.toHaveBeenCalled()
  })

  it('已有合法发送方签名也必须先通过 MAC，IV 位翻转不能修改金额', async () => {
    const f = await fixture()
    const payload = resign({ ...f.payload, iv: `${f.payload.iv[0] === 'a' ? 'b' : 'a'}${f.payload.iv.slice(1)}` })
    const decrypt = vi.spyOn(crypto.symmetric, 'decryptWithIV')
    expect((await f.a.decryptRequest(payload, f.expected)).success).toBe(false)
    expect(decrypt).not.toHaveBeenCalled()
    expect((await f.a.decryptRequest(f.payload, f.expected)).success).toBe(true)
  })

  it.each([{ path: '/other?currency=CNY' }, { path: '/orders?currency=USD' }, { method: 'PUT' }, { clientId: 'another-client' }])('实际 HTTP 上下文与密文不一致时拒绝：%j', async (change) => {
    const f = await fixture()
    expect((await f.a.decryptRequest(f.payload, { ...f.expected, ...change })).success).toBe(false)
    expect((await f.a.decryptRequest(f.payload, f.expected)).success).toBe(true)
  })

  it.each([-TRANSPORT_PROTOCOL.REQUEST_WINDOW_MS, TRANSPORT_PROTOCOL.CLOCK_SKEW_MS + 1])('有合法签名但超出时间窗口的请求拒绝：%d', async (offset) => {
    const f = await fixture()
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const payload = resign({ ...f.payload, context: { ...f.payload.context, issuedAt: now + offset } })
    const claim = vi.spyOn(f.keyStore, 'claimRequest')
    expect((await f.a.decryptRequest(payload, f.expected)).success).toBe(false)
    expect(claim).not.toHaveBeenCalled()
  })

  it('同一共享 registry 下并发重放仅一个成功，存储失败也不返回明文', async () => {
    const f = await fixture()
    const results = await Promise.all(Array.from({ length: 16 }, (_, i) => (i % 2 ? f.a : f.b).decryptRequest(f.payload, f.expected)))
    expect(results.filter(r => r.success)).toHaveLength(1)
    const next = await fixture()
    vi.spyOn(next.keyStore, 'claimRequest').mockRejectedValue(new Error('database password=private'))
    const failed = await next.b.decryptRequest(next.payload, next.expected)
    expect(failed.success).toBe(false)
    expect(JSON.stringify(failed)).not.toContain('private')
    expect(JSON.stringify(failed)).not.toContain('10000')
  })

  it('旧未认证格式和响应反射到请求入口全部拒绝', async () => {
    const f = await fixture()
    // @ts-expect-error 验证非 TypeScript 客户端发送旧版缺少认证上下文的载荷。
    expect((await f.a.decryptRequest({ encryptedKey: f.payload.encryptedKey, ciphertext: f.payload.ciphertext, iv: f.payload.iv }, f.expected)).success).toBe(false)
    const response = await f.a.encryptResponse(f.payload.context, 'response', 200)
    if (!response.success)
      throw new Error(response.error.message)
    // @ts-expect-error 验证请求入口拒绝响应方向的合法密文。
    expect((await f.a.decryptRequest(response.data, f.expected)).success).toBe(false)
  })

  it('拒绝未认证的额外字段，且超出 8 KiB 的实际 URL 不消费 nonce', async () => {
    const f = await fixture()
    const claim = vi.spyOn(f.keyStore, 'claimRequest')
    const extraPayload = { ...f.payload, ignored: 'unsigned' }
    const extraContext = { ...f.payload, context: { ...f.payload.context, ignored: 'unsigned' } }
    expect((await f.a.decryptRequest(extraPayload, f.expected)).success).toBe(false)
    expect((await f.a.decryptRequest(extraContext, f.expected)).success).toBe(false)
    const oversized = new URL('https://example.test/orders?q=')
    oversized.search = `?q=${'\\'.repeat(8193 - oversized.pathname.length - 3)}`
    const actual = new URL(new Request(oversized).url)
    expect(new TextEncoder().encode(actual.pathname + actual.search).byteLength).toBe(8193)
    expect((await authenticateTransportRequest(f.a, requestFor(f.payload, oversized.href))).success).toBe(false)
    expect(claim).not.toHaveBeenCalled()
  })

  it('真实 Request 的跨路径复制和并发重放不进入业务回调', async () => {
    const f = await fixture()
    const handler = vi.fn()
    async function dispatch(request: Request, node = f.a) {
      const result = await authenticateTransportRequest(node, request)
      if (result.success)
        handler(result.data.plaintext)
      return result.success
    }
    expect(await dispatch(requestFor(f.payload, 'https://example.test/other'))).toBe(false)
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => dispatch(requestFor(f.payload), i % 2 ? f.a : f.b)))
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(handler).toHaveBeenCalledExactlyOnceWith('{"amount":10000}')
  })

  it.each(['iv', 'ciphertext', 'encryptedKey', 'tag', 'signature', 'status', 'context', 'marker'] as const)('客户端拒绝被替换的响应字段：%s', async (field) => {
    const f = await fixture()
    const client = crypto.transport.createClient({ keyExchangeUrl: 'https://example.test/exchange', fetch: async (input, init) => {
      const request = new Request(input, init)
      if (request.url.endsWith('/exchange')) {
        const body = await request.json() as { clientPublicKey: string }
        return Response.json({ serverKeyId: 'v1', serverPublicKey: serverKey.publicKey, clientId: await f.a.registerClientKey(body.clientPublicKey) })
      }
      const verified = await authenticateTransportRequest(f.b, request)
      if (!verified.success)
        throw new Error(verified.error.message)
      const encrypted = await f.b.encryptResponse(verified.data.context, '"private"', 200)
      if (!encrypted.success)
        throw new Error(encrypted.error.message)
      let payload: EncryptedPayload = encrypted.data
      if (field === 'context')
        payload = { ...payload, context: { ...payload.context, requestId: 'c'.repeat(32) } }
      else if (field !== 'status' && field !== 'marker')
        payload = { ...payload, [field]: `a${payload[field].slice(1)}` === payload[field] ? `b${payload[field].slice(1)}` : `a${payload[field].slice(1)}` }
      return Response.json(payload, { status: field === 'status' ? 201 : 200, headers: field === 'marker' ? {} : { 'X-Encrypted': 'true' } })
    } })
    await expect(client.encryptedFetch('https://example.test/orders?currency=CNY', { method: 'POST', body: '{"amount":10000}' })).rejects.toThrow()
  })

  it('真实 Request 的 8 KiB 反斜线查询与最大 UTF-8 正文经 JSON 转义后仍在预算内', async () => {
    const f = await fixture()
    const url = new URL('https://example.test/orders?q=')
    url.search = `?q=${'\\'.repeat(8192 - url.pathname.length - 3)}`
    const bytes = TRANSPORT_BODY_LIMITS.plaintextBytes
    const text = '你'.repeat(Math.floor(bytes / 3)) + 'a'.repeat(bytes % 3)
    expect(new TextEncoder().encode(text).byteLength).toBe(bytes)
    const actual = new Request(url, { method: 'POST', body: text })
    const actualUrl = new URL(actual.url)
    const actualPath = actualUrl.pathname + actualUrl.search
    expect(new TextEncoder().encode(actualPath).byteLength).toBe(8192)
    // 原生 URL 在查询中保留反斜线；JSON 中每个反斜线额外占一个字节。
    expect(JSON.stringify(actualPath).length).toBeGreaterThan(16_300)
    const sizes: number[] = []
    const client = crypto.transport.createClient({ keyExchangeUrl: 'https://example.test/exchange', fetch: async (input, init) => {
      const request = new Request(input, init)
      if (request.url.endsWith('/exchange')) {
        const body = await request.json() as { clientPublicKey: string }
        return Response.json({ serverKeyId: 'v1', serverPublicKey: serverKey.publicKey, clientId: await f.a.registerClientKey(body.clientPublicKey) })
      }
      const wire = await request.text()
      sizes.push(new TextEncoder().encode(wire).byteLength)
      const verified = await authenticateTransportRequest(f.b, new Request(request.url, { method: request.method, headers: request.headers, body: wire }))
      if (!verified.success)
        throw new Error(verified.error.message)
      const pathDigest = crypto.hash.hash(actualPath)
      if (!pathDigest.success)
        throw new Error(pathDigest.error.message)
      expect(verified.data.context.pathHash).toBe(pathDigest.data)
      expect(wire).not.toContain(actualPath)
      expect(verified.data.plaintext).toBe(text)
      const response = await f.b.encryptResponse(verified.data.context, verified.data.plaintext, 200)
      if (!response.success)
        throw new Error(response.error.message)
      const responseBody = JSON.stringify(response.data)
      sizes.push(new TextEncoder().encode(responseBody).byteLength)
      return new Response(responseBody, { headers: { 'X-Encrypted': 'true' } })
    } })
    expect(await (await client.encryptedFetch(actual)).text()).toBe(text)
    expect(sizes).toHaveLength(2)
    for (const size of sizes) {
      expect(size).toBeGreaterThan(2_097_152)
      expect(size).toBeLessThanOrEqual(TRANSPORT_BODY_LIMITS.encryptedPayloadBytes)
    }
    client.destroy()
  }, 30_000)

  it.each(['GET', 'HEAD'])('真实最长转义查询的 %s 请求与空响应使用紧凑路径摘要', async (method) => {
    const f = await fixture()
    const url = new URL('https://example.test/orders?q=')
    url.search = `?q=${'\\'.repeat(8192 - url.pathname.length - 3)}`
    const client = crypto.transport.createClient({ keyExchangeUrl: 'https://example.test/exchange', fetch: async (input, init) => {
      const request = new Request(input, init)
      if (request.url.endsWith('/exchange')) {
        const body = await request.json() as { clientPublicKey: string }
        return Response.json({ serverKeyId: 'v1', serverPublicKey: serverKey.publicKey, clientId: await f.a.registerClientKey(body.clientPublicKey) })
      }
      const envelope = request.headers.get(TRANSPORT_PROTOCOL.ENVELOPE_HEADER)!
      expect(new TextEncoder().encode(envelope).byteLength).toBeLessThan(2048)
      const verified = await authenticateTransportRequest(f.b, request)
      if (!verified.success)
        throw new Error(verified.error.message)
      const encrypted = await f.b.encryptResponse(verified.data.context, '', 204)
      if (!encrypted.success)
        throw new Error(encrypted.error.message)
      return new Response(null, { status: 204, headers: { 'X-Encrypted': 'true', [TRANSPORT_PROTOCOL.ENVELOPE_HEADER]: JSON.stringify(encrypted.data) } })
    } })
    expect((await client.encryptedFetch(new Request(url, { method }))).status).toBe(204)
    client.destroy()
  })
})
