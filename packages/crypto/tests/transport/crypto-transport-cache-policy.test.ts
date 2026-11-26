import { cache } from '@h-ai/cache'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { crypto, HaiCryptoError } from '../../src/index.js'

let publicKey: string

beforeAll(async () => {
  expect((await crypto.init()).success).toBe(true)
  const pair = crypto.asymmetric.generateKeyPair()
  if (!pair.success)
    throw new Error(pair.error.message)
  publicKey = pair.data.publicKey
})
beforeEach(async () => {
  expect((await cache.init({ type: 'memory' })).success).toBe(true)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await cache.close()
})
afterAll(() => crypto.close())

describe('bounded transport cache state', () => {
  it('defaults public keys to one hour and expires every cache entry', async () => {
    const store = crypto.transport.createKeyStore({ cache })
    expect(store.clientKeyTtlSeconds).toBe(3600)
    const clientId = await store.register(publicKey)
    expect(await store.claimRequest(clientId, 'a'.repeat(32), Date.now() + 660_000)).toBe(true)
    const keys = await cache.kv.keys('hai:crypto:transport:*')
    expect(keys.success).toBe(true)
    if (!keys.success)
      return
    expect(keys.data.length).toBeGreaterThan(0)
    expect(await cache.kv.get('hai:crypto:transport:cache:quota:register')).toMatchObject({
      success: true,
      data: { used: 1, limit: 10000 },
    })
    expect(await cache.kv.get('hai:crypto:transport:cache:quota:request')).toMatchObject({
      success: true,
      data: { used: 1, limit: 100000 },
    })
    for (const key of keys.data) {
      const ttl = await cache.kv.ttl(key)
      expect(ttl.success).toBe(true)
      if (ttl.success)
        expect(ttl.data).toBeGreaterThan(0)
    }
  })

  it.each([
    0,
    -1,
    1.5,
    Number.POSITIVE_INFINITY,
    86401,
    2147483647,
  ])('rejects an unbounded or invalid public-key lifetime: %s', (ttlSeconds) => {
    expect(() => crypto.transport.createKeyStore({ cache, ttlSeconds })).toThrow(TypeError)
  })

  it('shares registration quota between wrappers and recovers at the next minute', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
    const options = { cache, ttlSeconds: 3600, maxRegistrationsPerMinute: 2 }
    const first = crypto.transport.createKeyStore(options)
    const second = crypto.transport.createKeyStore(options)
    const ids = await Promise.all([
      first.register(publicKey),
      second.register(publicKey),
    ])
    await expect(first.register(publicKey)).rejects.toMatchObject({ code: HaiCryptoError.TRANSPORT_BUSY.code })
    expect(await second.get(ids[0])).toBe(publicKey)
    clock.mockReturnValue(1_800_000_060_000)
    expect(await second.register(publicKey)).toEqual(expect.any(String))
    expect(await first.get(ids[1])).toBe(publicKey)
  })

  it('does not extend the quota window when admitting another registration', async () => {
    const now = 1_800_000_000_000
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const store = crypto.transport.createKeyStore({ cache, maxRegistrationsPerMinute: 2 })
    await store.register(publicKey)
    clock.mockReturnValue(now + 30_000)
    await store.register(publicKey)
    expect(await cache.kv.ttl('hai:crypto:transport:cache:quota:register')).toMatchObject({ success: true, data: 30 })
    clock.mockReturnValue(now + 60_000)
    expect(await store.register(publicKey)).toEqual(expect.any(String))
  })

  it('rejects a different quota on another node without resetting the shared window', async () => {
    const first = crypto.transport.createKeyStore({ cache, maxRegistrationsPerMinute: 1 })
    const second = crypto.transport.createKeyStore({ cache, maxRegistrationsPerMinute: 2 })
    await first.register(publicKey)
    await expect(second.register(publicKey)).rejects.toThrow(TypeError)
    await expect(first.register(publicKey)).rejects.toMatchObject({ code: HaiCryptoError.TRANSPORT_BUSY.code })
  })

  it('bounds nonce writes without evicting or counting replays as new requests', async () => {
    const now = 1_800_000_000_000
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const options = { cache, maxRequestsPerMinute: 2 }
    const first = crypto.transport.createKeyStore(options)
    const second = crypto.transport.createKeyStore(options)
    const expiry = now + 660_000
    expect(await first.claimRequest('client', 'a'.repeat(32), expiry)).toBe(true)
    expect(await second.claimRequest('client', 'a'.repeat(32), expiry)).toBe(false)
    expect(await second.claimRequest('client', 'b'.repeat(32), expiry)).toBe(true)
    await expect(first.claimRequest('client', 'c'.repeat(32), expiry)).rejects.toMatchObject({ code: HaiCryptoError.TRANSPORT_BUSY.code })
    clock.mockReturnValue(now + 60_000)
    expect(await second.claimRequest('client', 'a'.repeat(32), expiry)).toBe(false)
    expect(await second.claimRequest('client', 'c'.repeat(32), expiry)).toBe(true)
  })

  it('never admits more than the shared quota during concurrent registrations', async () => {
    const options = { cache, maxRegistrationsPerMinute: 3 }
    const stores = [
      crypto.transport.createKeyStore(options),
      crypto.transport.createKeyStore(options),
    ]
    const results = await Promise.allSettled(Array.from({ length: 16 }, (_, index) => stores[index % 2].register(publicKey)))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(3)
    for (const result of results) {
      if (result.status === 'rejected')
        expect(result.reason).toMatchObject({ code: HaiCryptoError.TRANSPORT_BUSY.code })
    }
  })

  it('expires public keys without renewing them on reads', async () => {
    const now = 1_800_000_000_000
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const store = crypto.transport.createKeyStore({ cache, ttlSeconds: 1 })
    const clientId = await store.register(publicKey)
    clock.mockReturnValue(now + 500)
    expect(await store.get(clientId)).toBe(publicKey)
    clock.mockReturnValue(now + 1000)
    expect(await store.get(clientId)).toBeUndefined()
  })

  it('accepts 91 minutes of nonce retention and rejects any longer duration', async () => {
    const now = 1_800_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const store = crypto.transport.createKeyStore({ cache })
    const requestId = 'a'.repeat(32)
    expect(await store.claimRequest('client', requestId, now + 5_460_000)).toBe(true)
    expect(await cache.kv.ttl(`hai:crypto:transport:cache:request:client:${requestId}`)).toMatchObject({
      success: true,
      data: 5460,
    })
    await expect(store.claimRequest('client', 'b'.repeat(32), now + 5_460_001)).rejects.toThrow(TypeError)
  })

  it('rejects invalid quota settings', () => {
    for (const value of [0, -1, 1.5, Number.POSITIVE_INFINITY]) {
      const registration = { cache, maxRegistrationsPerMinute: value }
      const requests = { cache, maxRequestsPerMinute: value }
      expect(() => crypto.transport.createKeyStore(registration)).toThrow(TypeError)
      expect(() => crypto.transport.createKeyStore(requests)).toThrow(TypeError)
    }
  })
})
