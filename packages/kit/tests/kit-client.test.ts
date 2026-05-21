import type { TransportEncryptionManager } from '@h-ai/crypto'
import { crypto, TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createKitClient } from '../src/client/kit-client.js'

const KEY_EXCHANGE_URL = `/api${TRANSPORT_PROTOCOL.DEFAULT_KEY_EXCHANGE_PATH}`

let fetchSpy: ReturnType<typeof vi.fn>

beforeAll(async () => {
  await crypto.init()
})

beforeEach(() => {
  fetchSpy = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }))
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  clearDocumentCookie()
})

afterAll(async () => {
  await crypto.close()
})

function setDocumentCookie(cookie: string) {
  Object.defineProperty(globalThis, 'document', {
    value: { cookie },
    writable: true,
    configurable: true,
  })
}

function clearDocumentCookie() {
  // @ts-expect-error 清理测试用 document mock
  delete globalThis.document
}

function expectManager(result: ReturnType<typeof crypto.transport.createServer>): TransportEncryptionManager {
  expect(result.success).toBe(true)
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

function toRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  if (input instanceof Request)
    return input
  return new Request(new URL(input.toString(), 'http://localhost'), init)
}

function createTransportFetch(options: { encryptedResponseBody?: string } = {}) {
  const manager = expectManager(crypto.transport.createServer())
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = toRequest(input, init)
    const url = new URL(request.url)

    if (url.pathname === KEY_EXCHANGE_URL || url.pathname === '/my/exchange') {
      const body = await request.json() as { clientPublicKey: string }
      const clientId = await manager.registerClientKey(body.clientPublicKey)
      return new Response(JSON.stringify({ serverPublicKey: manager.getServerPublicKey(), clientId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (options.encryptedResponseBody) {
      const clientId = request.headers.get(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER)
      expect(clientId).toBeTruthy()
      const enc = await manager.encryptResponse(clientId!, options.encryptedResponseBody)
      expect(enc.success).toBe(true)
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

    return new Response('OK', { status: 200 })
  })
}

describe('createKitClient - 仅 CSRF', () => {
  it('get 请求不附加 CSRF Token', async () => {
    const { apiFetch } = createKitClient()

    await apiFetch('/api/users')

    const [, init] = fetchSpy.mock.calls[0]!
    const headers = new Headers(init.headers)
    expect(headers.has('X-CSRF-Token')).toBe(false)
  })

  it('post 请求自动附加 CSRF Token', async () => {
    setDocumentCookie('hai_csrf=abc123')

    const { apiFetch } = createKitClient()

    await apiFetch('/api/users', { method: 'POST', body: '{}' })

    const [, init] = fetchSpy.mock.calls[0]!
    const headers = new Headers(init.headers)
    expect(headers.get('X-CSRF-Token')).toBe('abc123')
  })

  it('delete 请求自动附加 CSRF Token', async () => {
    setDocumentCookie('hai_csrf=token456')

    const { apiFetch } = createKitClient()

    await apiFetch('/api/users/1', { method: 'DELETE' })

    const [, init] = fetchSpy.mock.calls[0]!
    const headers = new Headers(init.headers)
    expect(headers.get('X-CSRF-Token')).toBe('token456')
  })

  it('无 CSRF Cookie 时不设置 Header', async () => {
    const { apiFetch } = createKitClient()

    await apiFetch('/api/users', { method: 'POST', body: '{}' })

    const [, init] = fetchSpy.mock.calls[0]!
    const headers = new Headers(init.headers)
    expect(headers.has('X-CSRF-Token')).toBe(false)
  })

  it('自定义 CSRF Cookie/Header 名称', async () => {
    setDocumentCookie('my_csrf=custom_token')

    const { apiFetch } = createKitClient({
      csrfCookieName: 'my_csrf',
      csrfHeaderName: 'X-My-CSRF',
    })

    await apiFetch('/api/data', { method: 'PUT', body: '{}' })

    const [, init] = fetchSpy.mock.calls[0]!
    const headers = new Headers(init.headers)
    expect(headers.get('X-My-CSRF')).toBe('custom_token')
  })

  it('ready 在无 transport 时始终为 true', () => {
    const client = createKitClient()
    expect(client.ready).toBe(true)
  })
})

describe('createKitClient - 传输加密', () => {
  it('init 触发统一密钥交换', async () => {
    fetchSpy = createTransportFetch()
    vi.stubGlobal('fetch', fetchSpy)
    const client = createKitClient({ transport: { crypto } })

    expect(client.ready).toBe(false)

    await client.init()

    expect(client.ready).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith(KEY_EXCHANGE_URL, expect.objectContaining({ method: 'POST' }))
  })

  it('自定义密钥交换端点', async () => {
    fetchSpy = createTransportFetch()
    vi.stubGlobal('fetch', fetchSpy)
    const client = createKitClient({ transport: { crypto, keyExchangeUrl: '/my/exchange' } })

    await client.init()

    expect(fetchSpy).toHaveBeenCalledWith('/my/exchange', expect.anything())
  })

  it('写请求自动加密 body 并附加协议头', async () => {
    fetchSpy = createTransportFetch()
    vi.stubGlobal('fetch', fetchSpy)
    const client = createKitClient({ transport: { crypto } })

    await client.apiFetch('/api/data', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice' }),
    })

    const [url, init] = fetchSpy.mock.calls[1]!
    expect(url).toBe('/api/data')
    const headers = new Headers(init.headers)
    expect(headers.get(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER)).toBeTruthy()
    expect(headers.get(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)).toBe(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE)

    const payload = JSON.parse(init.body as string) as Record<string, unknown>
    expect(payload.encryptedKey).toBeTruthy()
    expect(payload.ciphertext).toBeTruthy()
    expect(payload.iv).toBeTruthy()
  })

  it('formData 写请求跳过传输加密并保留原始请求体', async () => {
    const formData = new FormData()
    formData.append('file', new Blob(['avatar'], { type: 'image/png' }), 'avatar.png')

    const client = createKitClient({ transport: { crypto } })

    await client.apiFetch('/api/upload', {
      method: 'POST',
      body: formData,
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe('/api/upload')
    expect(init.body).toBe(formData)

    const headers = new Headers(init.headers)
    expect(headers.has(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER)).toBe(false)
    expect(headers.has('Content-Type')).toBe(false)
  })

  it('加密响应自动解密', async () => {
    const originalData = JSON.stringify({ users: ['Alice', 'Bob'] })
    fetchSpy = createTransportFetch({ encryptedResponseBody: originalData })
    vi.stubGlobal('fetch', fetchSpy)
    const client = createKitClient({ transport: { crypto } })

    const response = await client.apiFetch('/api/users')

    expect(response.headers.get(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)).toBeNull()
    expect(await response.text()).toBe(originalData)
  })

  it('destroy 重置所有状态', async () => {
    fetchSpy = createTransportFetch()
    vi.stubGlobal('fetch', fetchSpy)
    const client = createKitClient({ transport: { crypto } })

    await client.init()
    expect(client.ready).toBe(true)

    client.destroy()
    expect(client.ready).toBe(false)
  })

  it('lazy init：首次写请求自动触发密钥交换', async () => {
    fetchSpy = createTransportFetch()
    vi.stubGlobal('fetch', fetchSpy)
    const client = createKitClient({ transport: { crypto } })

    await client.apiFetch('/api/users', { method: 'POST', body: '{"name":"test"}' })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(fetchSpy.mock.calls[0]![0]).toBe(KEY_EXCHANGE_URL)
    expect(fetchSpy.mock.calls[1]![0]).toBe('/api/users')
  })

  it('并发请求共用同一次密钥交换', async () => {
    fetchSpy = createTransportFetch()
    vi.stubGlobal('fetch', fetchSpy)
    const client = createKitClient({ transport: { crypto } })

    await Promise.all([
      client.apiFetch('/api/a', { method: 'POST', body: '{}' }),
      client.apiFetch('/api/b', { method: 'POST', body: '{}' }),
    ])

    const keyExchangeCount = fetchSpy.mock.calls.filter(
      (c: unknown[]) => c[0] === KEY_EXCHANGE_URL,
    ).length
    expect(keyExchangeCount).toBe(1)
  })
})

describe('createKitClient - auth', () => {
  it('auth: true 时自动注入 Authorization 头', async () => {
    const store: Record<string, string> = { hai_access_token: 'my_token_123' }
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, val: string) => { store[key] = val },
        removeItem: (key: string) => { delete store[key] },
      },
    })

    const { apiFetch } = createKitClient({ auth: true })
    await apiFetch('/api/users')

    const [, init] = fetchSpy.mock.calls[0]!
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer my_token_123')
  })

  it('auth: true 但无 token 时不注入', async () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    })

    const { apiFetch } = createKitClient({ auth: true })
    await apiFetch('/api/users')

    const [, init] = fetchSpy.mock.calls[0]!
    const headers = new Headers(init.headers)
    expect(headers.has('Authorization')).toBe(false)
  })

  it('auth: false / 未配置时不注入', async () => {
    const { apiFetch } = createKitClient()
    await apiFetch('/api/users')

    const [, init] = fetchSpy.mock.calls[0]!
    const headers = new Headers(init.headers)
    expect(headers.has('Authorization')).toBe(false)
  })

  it('自定义 BrowserTokenStore', async () => {
    const customStore = {
      get: () => 'custom_token',
      set: vi.fn(),
      clear: vi.fn(),
    }

    const { apiFetch } = createKitClient({ auth: customStore })
    await apiFetch('/api/users')

    const [, init] = fetchSpy.mock.calls[0]!
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer custom_token')
  })
})
