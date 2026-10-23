import { cache } from '@h-ai/cache'
import { err, HaiCommonError } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createInMemoryKeyStore, createRedisTransportKeyStore, createReldbTransportKeyStore, crypto, isValidSM2PublicKey } from '../../src/index.js'

let publicKey: string

beforeAll(async () => {
  expect((await crypto.init()).success).toBe(true)
  const generated = crypto.asymmetric.generateKeyPair()
  if (!generated.success)
    throw new Error(generated.error.message)
  publicKey = generated.data.publicKey
})

afterEach(async () => {
  vi.restoreAllMocks()
  expect((await reldb.close()).success).toBe(true)
  expect((await cache.close()).success).toBe(true)
})

describe('transport registry input boundaries', () => {
  it('accepts only bounded uncompressed SM2 points, with optional 04 prefix', () => {
    expect(isValidSM2PublicKey(publicKey)).toBe(true)
    expect(isValidSM2PublicKey(publicKey.slice(2))).toBe(true)
    expect(isValidSM2PublicKey(publicKey.toUpperCase())).toBe(true)
    expect(isValidSM2PublicKey(`${publicKey}\n`)).toBe(false)
    expect(isValidSM2PublicKey(`${publicKey.slice(2)}\n`)).toBe(false)
    for (const invalid of [null, undefined, 10, '', 'key', '00', '00'.repeat(65), `04${'0'.repeat(128)}`, `04${'f'.repeat(128)}`, `02${publicKey.slice(2, 66)}`, `${publicKey}00`, '你'.repeat(2000)]) {
      expect(isValidSM2PublicKey(invalid)).toBe(false)
      if (typeof invalid === 'string')
        expect(crypto.asymmetric.isValidPublicKey(invalid)).toBe(false)
    }
  })

  it('rejects malformed points before accessing injected storage', async () => {
    expect((await cache.init({ type: 'memory' })).success).toBe(true)
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    const write = vi.spyOn(cache.kv, 'set')
    const ddl = vi.spyOn(reldb.ddl, 'createTable')
    const stores = [createInMemoryKeyStore(), createRedisTransportKeyStore({ cache }), createReldbTransportKeyStore({ reldb })]
    for (const store of stores)
      await expect(store.register(`04${'0'.repeat(128)}`)).rejects.toBeInstanceOf(TypeError)
    expect(write).not.toHaveBeenCalled()
    expect(ddl).not.toHaveBeenCalled()
  })

  it('validates manager registration before calling a custom registry', async () => {
    const keyPair = crypto.asymmetric.generateKeyPair()
    if (!keyPair.success)
      throw new Error(keyPair.error.message)
    const store = createInMemoryKeyStore()
    const register = vi.spyOn(store, 'register')
    const server = crypto.transport.createServer({ serverKeyRing: { activeKeyId: 'v1', keys: { v1: keyPair.data } }, keyStore: store })
    expect(server.success).toBe(true)
    if (!server.success)
      return
    await expect(server.data.registerClientKey(`04${'0'.repeat(128)}`)).rejects.toBeInstanceOf(TypeError)
    expect(register).not.toHaveBeenCalled()
  })

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])('rejects invalid TTL %s rather than retaining the key forever', (ttlSeconds) => {
    expect(() => createRedisTransportKeyStore({ cache, ttlSeconds })).toThrow(TypeError)
    expect(() => createReldbTransportKeyStore({ reldb, ttlSeconds })).toThrow(TypeError)
  })

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('rejects invalid shared capacity %s', (maxClients) => {
    expect(() => createReldbTransportKeyStore({ reldb, maxClients })).toThrow(TypeError)
  })
})

describe('real SQLite registry recovery and maintenance', () => {
  it('shares a failed initialization, removes its rejected promise, and retries after the database recovers', async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    const original = reldb.ddl.createTable
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const ddl = vi.spyOn(reldb.ddl, 'createTable').mockImplementationOnce(async () => {
      await blocked
      return err(HaiCommonError.INTERNAL_ERROR, 'private://database:password@localhost')
    })
    const store = createReldbTransportKeyStore({ reldb })
    const pending = Promise.allSettled(Array.from({ length: 8 }, () => store.register(publicKey)))
    expect(ddl).toHaveBeenCalledOnce()
    release()
    const failed = await pending
    expect(failed.every(result => result.status === 'rejected')).toBe(true)
    for (const result of failed) {
      if (result.status === 'rejected')
        expect(String(result.reason)).not.toContain('private://')
    }
    ddl.mockImplementation(original)
    const clientId = await store.register(publicKey)
    expect(await store.get(clientId)).toBe(publicKey)
  })

  it('retries after only the first table was created', async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    const original = reldb.ddl.createTable
    let fail = true
    vi.spyOn(reldb.ddl, 'createTable').mockImplementation(async (...args) => {
      if (args[0] === 'hai_crypto_transport_requests' && fail) {
        fail = false
        return err(HaiCommonError.INTERNAL_ERROR, 'unavailable')
      }
      return original(...args)
    })
    const store = createReldbTransportKeyStore({ reldb })
    await expect(store.register(publicKey)).rejects.toThrow()
    const clientId = await store.register(publicKey)
    expect(await store.get(clientId)).toBe(publicKey)
  })

  it('serializes independent wrappers at the shared capacity and rejects inconsistent settings without evicting clients', async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    const first = createReldbTransportKeyStore({ reldb, maxClients: 2 })
    const second = createReldbTransportKeyStore({ reldb, maxClients: 2 })
    await first.get('missing')
    await second.get('missing')
    const registrations = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => (index % 2 ? first : second).register(publicKey)))
    const accepted = registrations.filter(result => result.status === 'fulfilled')
    expect(accepted).toHaveLength(2)
    for (const result of accepted) {
      if (result.status === 'fulfilled')
        expect(await second.get(result.value)).toBe(publicKey)
    }
    const inconsistent = createReldbTransportKeyStore({ reldb, maxClients: 3 })
    await expect(inconsistent.register(publicKey)).rejects.toThrow()
    const count = await reldb.sql.get<{ total: number }>('SELECT COUNT(*) AS total FROM hai_crypto_transport_client_keys')
    expect(count.success && count.data?.total).toBe(2)
  })

  it('bounds every prune and eventually removes unused expired rows while preserving valid clients and consumed nonces', async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    const first = createReldbTransportKeyStore({ reldb, maxClients: 2 })
    const second = createReldbTransportKeyStore({ reldb, maxClients: 2 })
    const validId = await first.register(publicKey)
    expect(await first.claimRequest(validId, 'consumed', Date.now() + 360_000)).toBe(true)
    const expiredCount = 251
    const keys = await reldb.sql.execute(
      `INSERT INTO hai_crypto_transport_client_keys (client_id, public_key, created_at_ms, expires_at_ms) VALUES ${Array.from({ length: expiredCount }).fill('(?, ?, ?, ?)').join(', ')}`,
      Array.from({ length: expiredCount }, (_, index) => [`expired-${index}`, publicKey, 0, 1]).flat(),
    )
    expect(keys.success).toBe(true)
    const nonces = await reldb.sql.execute(
      `INSERT INTO hai_crypto_transport_requests (request_key, expires_at) VALUES ${Array.from({ length: expiredCount }).fill('(?, ?)').join(', ')}`,
      Array.from({ length: expiredCount }, (_, index) => [`expired-${index}`, 1]).flat(),
    )
    expect(nonces.success).toBe(true)
    expect(await second.get('expired-0')).toBeUndefined()
    const batches = await Promise.all([first.pruneExpired(), second.pruneExpired()])
    expect(batches.every(count => count <= 200)).toBe(true)
    let removed = batches.reduce((sum, count) => sum + count, 0)
    for (let batch = 0; batch < 4; batch++)
      removed += await first.pruneExpired()
    expect(removed).toBe(expiredCount * 2)
    expect(await second.pruneExpired()).toBe(0)
    expect(await second.get(validId)).toBe(publicKey)
    expect(await second.claimRequest(validId, 'consumed', Date.now() + 360_000)).toBe(false)
    expect(await first.register(publicKey)).toMatch(/^c_/)
  })

  it('uses the database clock for key expiry and can reuse expired capacity', async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    const store = createReldbTransportKeyStore({ reldb, ttlSeconds: 1, maxClients: 1 })
    const clientId = await store.register(publicKey)
    expect(await store.get(clientId)).toBe(publicKey)
    await expect(store.register(publicKey)).rejects.toThrow()
    await vi.waitFor(async () => expect(await store.get(clientId)).toBeUndefined(), { timeout: 3000, interval: 50 })
    expect(await store.pruneExpired()).toBe(1)
    expect(await store.register(publicKey)).toMatch(/^c_/)
  })

  it('does not derive key expiry from an application clock that is one day ahead', async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    const started = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(started + 86_400_000)
    const store = createReldbTransportKeyStore({ reldb, ttlSeconds: 60 })
    const clientId = await store.register(publicKey)
    expect(await store.get(clientId)).toBe(publicKey)
    const row = await reldb.sql.get<{ created_at_ms: number, expires_at_ms: number }>('SELECT created_at_ms, expires_at_ms FROM hai_crypto_transport_client_keys WHERE client_id = ?', [clientId])
    expect(row.success).toBe(true)
    if (!row.success || !row.data)
      return
    expect(row.data.created_at_ms).toBeGreaterThanOrEqual(started)
    expect(row.data.created_at_ms).toBeLessThan(started + 3000)
    expect(row.data.expires_at_ms - row.data.created_at_ms).toBe(60_000)
  })
})
