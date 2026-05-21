import { haiResultSchema } from '@h-ai/api-contract'
import { crypto } from '@h-ai/crypto'
import { oc } from '@orpc/contract'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createApiClient } from '../src/api-client-main.js'

const OutputSchema = haiResultSchema(z.object({ echoed: z.unknown() }))

const testContract = {
  echo: oc.route({ method: 'POST', path: '/echo' }).input(z.object({ msg: z.string() })).output(OutputSchema),
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

describe('api-client transport', () => {
  beforeAll(async () => {
    await crypto.init()
  })
  afterAll(async () => {
    await crypto.close()
  })

  it('encrypts request and decrypts response transparently via crypto.transport', async () => {
    const client = createApiClient(testContract)
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
})
