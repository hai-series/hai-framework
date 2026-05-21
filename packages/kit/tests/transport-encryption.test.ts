import type { Handle, RequestEvent } from '@sveltejs/kit'
import { crypto, TRANSPORT_PROTOCOL } from '@h-ai/crypto'
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

async function dispatch(
  handle: Handle,
  request: Request,
  resolve: (event: RequestEvent) => Response | Promise<Response>,
): Promise<Response> {
  const event = createEvent(request)
  return handle({ event, resolve })
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

    const response = await dispatch(handle, request, () => new Response('should not run'))

    expect(response.status).toBe(400)
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
