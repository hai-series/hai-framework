import type { Cookies, RequestEvent } from '@sveltejs/kit'
import { beforeAll, describe, expect, it } from 'vitest'
import { createCsrfManager, createEncryptedCookie, signRequest, verifyWebhookSignature } from '../../kit/src/modules/crypto/kit-crypto-helpers.js'
import { crypto } from '../src/index.js'

function createMockCookies(initial: Record<string, string> = {}): Cookies {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    get: (name: string) => store.get(name),
    set: (name: string, value: string) => { store.set(name, value) },
    delete: (name: string) => { store.delete(name) },
    getAll: () => Array.from(store.entries()).map(([name, value]) => ({ name, value })),
    serialize: () => '',
  } as unknown as Cookies
}

function createEvent(body: string, headers: Record<string, string> = {}): RequestEvent {
  const url = new URL('http://localhost/api/webhook')
  return {
    request: new Request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body,
    }),
    url,
    cookies: createMockCookies(),
    locals: {},
    params: {},
    route: { id: '/api/webhook' },
    getClientAddress: () => '127.0.0.1',
  } as unknown as RequestEvent
}

describe('kit crypto helper compatibility with @h-ai/crypto', () => {
  beforeAll(async () => {
    await crypto.init()
  })

  it('signRequest + verifyWebhookSignature should work with @h-ai/crypto contract', async () => {
    const body = '{"event":"compat"}'
    const secret = 'compat-secret'
    const signature = await signRequest(crypto, body, secret, 'sha256')

    const event = createEvent(body, { 'X-Signature': signature })
    const isValid = await verifyWebhookSignature({
      crypto,
      event,
      secretKey: secret,
      algorithm: 'sha256',
    })

    expect(isValid).toBe(true)

    // verifyWebhookSignature 必须读取 clone，不能消费原 request body
    const remainingBody = await event.request.text()
    expect(remainingBody).toBe(body)
  })

  it('createCsrfManager should fallback to platform randomness and constant-time compare', async () => {
    const csrf = createCsrfManager({ crypto })
    const cookies = createMockCookies()
    const token = await csrf.generate(cookies)
    expect(token.length).toBeGreaterThan(0)

    const event = createEvent('', { 'X-CSRF-Token': token })
    event.cookies = cookies
    const verified = await csrf.verify(event)
    expect(verified).toBe(true)
  })

  it('createEncryptedCookie should use symmetric fallback with iv payload', async () => {
    const cookies = createMockCookies()
    const manager = createEncryptedCookie({
      crypto,
      encryptionKey: '0123456789abcdeffedcba9876543210',
    })

    await manager.set(cookies, 'profile', { id: 'u1', role: 'admin' })
    const raw = cookies.get('profile')
    expect(raw).toBeDefined()
    expect(raw).toMatch(/^encv1:/)

    const value = await manager.get<{ id: string, role: string }>(cookies, 'profile')
    expect(value).toEqual({ id: 'u1', role: 'admin' })
  })
})
