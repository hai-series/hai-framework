import type { TransportServerKeyRing } from '@h-ai/crypto'
import type { RequestEvent } from '@sveltejs/kit'
import { createInMemoryKeyStore, crypto } from '@h-ai/crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { KitConfigSchema } from '../src/kit-config.js'
import { kit } from '../src/kit-main.js'

let serverKeyRing: TransportServerKeyRing
beforeAll(async () => {
  expect((await crypto.init()).success).toBe(true)
  const pair = crypto.asymmetric.generateKeyPair()
  if (!pair.success)
    throw new Error(pair.error.message)
  serverKeyRing = { activeKeyId: 'v1', keys: { v1: pair.data } }
})
afterAll(async () => crypto.close())

function fixture(maxPlaintextBytes: number, resolve: (event: RequestEvent) => Promise<Response> | Response) {
  const handle = kit.createHandle({ csrf: false, crypto: { crypto, transport: { serverKeyRing, keyStore: createInMemoryKeyStore(), maxPlaintextBytes } } })
  return crypto.transport.createClient({ keyExchangeUrl: 'http://localhost/api/_hai/key-exchange', fetch: (input, init) => {
    const request = new Request(input, init)
    const event = { request, url: new URL(request.url), locals: {}, params: {}, route: { id: null } } as RequestEvent
    return handle({ event, resolve })
  } })
}

it('kit 公开服务配置与客户端握手贯通，支持大于原默认值的双向 JSON', async () => {
  const text = '合法内容'.repeat(90_000)
  const client = fixture(2 * 1024 * 1024, async event => Response.json(await event.request.json()))
  try {
    const response = await client.encryptedFetch('http://localhost/api/echo', { method: 'POST', body: JSON.stringify({ text }) })
    expect(await response.json()).toEqual({ text })
  }
  finally { client.destroy() }
}, 60_000)

it('kit 响应超限有可识别诊断并取消、释放底层流', async () => {
  const cancel = vi.fn()
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new Uint8Array(1025))
  }, cancel })
  const client = fixture(1024, () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }))
  try {
    await expect(client.encryptedFetch('http://localhost/api/large')).rejects.toMatchObject({ code: 'hai:crypto:070', direction: 'response', limitBytes: 1024, actualBytes: 1025 })
    expect(cancel).toHaveBeenCalledOnce()
    expect(stream.locked).toBe(false)
  }
  finally { client.destroy() }
})

it('kit 配置保留容量字段并拒绝无效范围', () => {
  expect(KitConfigSchema.parse({ transport: { maxPlaintextBytes: 8388608 } }).transport).toMatchObject({ maxPlaintextBytes: 8388608 })
  expect(KitConfigSchema.safeParse({ transport: { maxPlaintextBytes: 0 } }).success).toBe(false)
})
