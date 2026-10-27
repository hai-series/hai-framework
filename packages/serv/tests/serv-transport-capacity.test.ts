import type { TransportServerKeyRing } from '@h-ai/crypto'
import type { ServContext } from '../src/serv-context.js'
import { Buffer } from 'node:buffer'
import { apiContract } from '@h-ai/api-contract'
import { createInMemoryKeyStore, crypto, resolveTransportBodyLimits } from '@h-ai/crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ServConfigSchema } from '../src/serv-config.js'
import { serv } from '../src/serv-main.js'
import { createTransportWorkbook } from './helpers/serv-transport-workbook.js'

let serverKeyRing: TransportServerKeyRing
const origin = 'http://localhost'
function fixture(maxPlaintextBytes = 8 * 1024 * 1024) {
  const contract = apiContract.create({})
  const app = serv.createApp({ contract, procedures: serv.implement(contract).context<ServContext>().build(), transport: { crypto, serverKeyRing, keyStore: createInMemoryKeyStore(), maxPlaintextBytes } })
  const client = crypto.transport.createClient({ keyExchangeUrl: `${origin}/api/v1/_hai/key-exchange`, fetch: (input, init) => app.fetch(new Request(input, init)) })
  return { app, client }
}

describe('serv configurable transport capacity', () => {
  beforeAll(async () => {
    expect((await crypto.init()).success).toBe(true)
    const pair = crypto.asymmetric.generateKeyPair()
    if (!pair.success)
      throw new Error(pair.error.message)
    serverKeyRing = { activeKeyId: 'v1', keys: { v1: pair.data } }
  })
  afterAll(async () => crypto.close())

  it('反馈大包路由仍支持加密，普通接口在解密前保留较小预算', async () => {
    const contract = apiContract.create({})
    const app = serv.createApp({ contract, procedures: serv.implement(contract).context<ServContext>().build(), transport: { crypto, serverKeyRing, keyStore: createInMemoryKeyStore(), maxPlaintextBytes: 1024, routePlaintextBytes: { '/api/v1/material/*': 8192 } } })
    const client = crypto.transport.createClient({ keyExchangeUrl: `${origin}/api/v1/_hai/key-exchange`, fetch: (input, init) => app.fetch(new Request(input, init)) })
    const business = vi.fn()
    app.post('/api/v1/business', (c) => {
      business()
      return c.json({ ok: true })
    })
    app.post('/api/v1/material/file', async c => c.json(await c.req.json()))
    const payload = JSON.stringify({ text: 'a'.repeat(4096) })
    try {
      expect(await (await client.encryptedFetch(`${origin}/api/v1/material/file`, { method: 'POST', body: payload })).json()).toEqual(JSON.parse(payload))
      await expect(client.encryptedFetch(`${origin}/api/v1/business`, { method: 'POST', body: payload })).rejects.toMatchObject({ code: 'hai:crypto:070' })
      expect(business).not.toHaveBeenCalled()
    }
    finally { client.destroy() }
  })

  it('仅配置服务端即可完成 4 MiB XLSX base64 JSON 上传及大 JSON 响应', async () => {
    const { app, client } = fixture()
    const workbook = createTransportWorkbook(4 * 1024 * 1024)
    expect(workbook.byteLength).toBe(4 * 1024 * 1024)
    expect(workbook.readUInt32LE()).toBe(0x04034B50)
    const result = '合法数据'.repeat(100_000)
    app.post('/api/v1/import', async (c) => {
      const input = await c.req.json<{ name: string, file: string }>()
      expect(input.name).toBe('capacity.xlsx')
      expect(Buffer.from(input.file, 'base64').equals(workbook)).toBe(true)
      return c.json({ data: result })
    })
    try {
      const response = await client.encryptedFetch(`${origin}/api/v1/import`, { method: 'POST', body: JSON.stringify({ name: 'capacity.xlsx', file: workbook.toString('base64') }) })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ data: result })
    }
    finally { client.destroy() }
  }, 120_000)

  it('恰好达到明文预算正常返回，多一个字节在发送业务请求前拒绝', async () => {
    const { app, client } = fixture(1024)
    const handler = vi.fn()
    app.post('/api/v1/echo', async (c) => {
      handler()
      return c.json(await c.req.json())
    })
    try {
      const response = await client.encryptedFetch(`${origin}/api/v1/echo`, { method: 'POST', body: JSON.stringify('a'.repeat(1022)) })
      expect(await response.json()).toBe('a'.repeat(1022))
      await expect(client.encryptedFetch(`${origin}/api/v1/echo`, { method: 'POST', body: JSON.stringify('a'.repeat(1023)) })).rejects.toMatchObject({ code: 'hai:crypto:070', direction: 'request', limitBytes: 1024, actualBytes: 1025 })
      expect(handler).toHaveBeenCalledOnce()
    }
    finally { client.destroy() }
  })

  it('响应流超限取消原流，通过已认证错误返回方向与字节诊断', async () => {
    const { app, client } = fixture(1024)
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(' '.repeat(1025)))
    }, cancel })
    app.get('/api/v1/large', () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }))
    try {
      await expect(client.encryptedFetch(`${origin}/api/v1/large`)).rejects.toMatchObject({ code: 'hai:crypto:070', direction: 'response', stage: 'plaintext', limitBytes: 1024, actualBytes: 1025 })
      expect(cancel).toHaveBeenCalledOnce()
      expect(stream.locked).toBe(false)
    }
    finally { client.destroy() }
  })

  it('无 Content-Length 的超限密文在进入业务前被拒绝并取消读取', async () => {
    const { app, client } = fixture(1024)
    const handler = vi.fn(() => Response.json({ ok: true }))
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(resolveTransportBodyLimits(1024).encryptedPayloadBytes + 1))
    }, cancel })
    app.post('/api/v1/input', handler)
    try {
      const response = await app.fetch(new Request(`${origin}/api/v1/input`, { method: 'POST', body: stream, duplex: 'half', headers: { 'X-Client-Id': 'untrusted-client', 'X-Encrypted': 'true' } } as RequestInit))
      expect(response.status).toBe(413)
      expect(await response.json()).toMatchObject({ success: false, error: { code: 'hai:crypto:070', details: { direction: 'request', stage: 'encrypted' } } })
      expect(handler).not.toHaveBeenCalled()
      expect(cancel).toHaveBeenCalledOnce()
      expect(stream.locked).toBe(false)
    }
    finally { client.destroy() }
  })

  it('提升业务容量仍保留握手限制，非法配置拒绝启动', async () => {
    const { app, client } = fixture()
    try {
      const response = await app.request('/api/v1/_hai/key-exchange', { method: 'POST', body: ' '.repeat(16385) })
      expect(response.status).toBe(413)
      expect(() => fixture(0)).toThrow()
      expect(ServConfigSchema.safeParse({ transport: { maxPlaintextBytes: 0 } }).success).toBe(false)
      expect(ServConfigSchema.parse({ transport: { maxPlaintextBytes: 8388608 } }).transport).toMatchObject({ maxPlaintextBytes: 8388608 })
    }
    finally { client.destroy() }
  })

  it('绕过客户端容量检查也不能把超限明文送入业务', async () => {
    const { app, client: unused } = fixture(1024)
    unused.destroy()
    const handler = vi.fn(() => Response.json({ ok: true }))
    app.post('/api/v1/bypass', handler)
    let status = 0
    const client = crypto.transport.createClient({ keyExchangeUrl: `${origin}/api/v1/_hai/key-exchange`, fetch: async (input, init) => {
      const response = await app.fetch(new Request(input, init))
      if (String(input).endsWith('/_hai/key-exchange'))
        return Response.json({ ...await response.json(), maxPlaintextBytes: 2048 })
      status = response.status
      return response
    } })
    try {
      await expect(client.encryptedFetch(`${origin}/api/v1/bypass`, { method: 'POST', body: JSON.stringify('a'.repeat(1023)) })).rejects.toMatchObject({ code: 'hai:crypto:070', direction: 'request' })
      expect(status).toBe(413)
      expect(handler).not.toHaveBeenCalled()
    }
    finally { client.destroy() }
  })
})
