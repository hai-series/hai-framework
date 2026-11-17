import { cache } from '@h-ai/cache'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCacheTransportKeyStore, crypto, isValidSM2PublicKey } from '../../src/index.js'

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
  expect((await cache.close()).success).toBe(true)
})

describe('transport registry input boundaries', () => {
  it('accepts only bounded uncompressed SM2 points, with optional 04 prefix', () => {
    expect(isValidSM2PublicKey(publicKey)).toBe(true)
    expect(isValidSM2PublicKey(publicKey.slice(2))).toBe(true)
    expect(isValidSM2PublicKey(publicKey.toUpperCase())).toBe(true)
    expect(isValidSM2PublicKey(`${publicKey}\n`)).toBe(false)
    expect(isValidSM2PublicKey(`${publicKey.slice(2)}\n`)).toBe(false)
    for (const invalid of [
      null,
      undefined,
      10,
      '',
      'key',
      '00',
      '00'.repeat(65),
      `04${'0'.repeat(128)}`,
      `04${'f'.repeat(128)}`,
      `02${publicKey.slice(2, 66)}`,
      `${publicKey}00`,
      '你'.repeat(2000),
    ]) {
      expect(isValidSM2PublicKey(invalid)).toBe(false)
      if (typeof invalid === 'string')
        expect(crypto.asymmetric.isValidPublicKey(invalid)).toBe(false)
    }
  })

  it('rejects malformed points before accessing injected storage', async () => {
    const write = vi.spyOn(cache.kv, 'set')
    const stores = [
      createCacheTransportKeyStore({ cache }),
    ]
    for (const store of stores)
      await expect(store.register(`04${'0'.repeat(128)}`)).rejects.toBeInstanceOf(TypeError)
    expect(write).not.toHaveBeenCalled()
  })

  it('validates manager registration before calling a custom registry', async () => {
    const keyPair = crypto.asymmetric.generateKeyPair()
    if (!keyPair.success)
      throw new Error(keyPair.error.message)
    const store = createCacheTransportKeyStore({ cache })
    const register = vi.spyOn(store, 'register')
    const server = crypto.transport.createServer({
      serverKeyRing: {
        activeKeyId: 'v1',
        keys: { v1: keyPair.data },
      },
      keyStore: store,
    })
    expect(server.success).toBe(true)
    if (!server.success)
      return
    await expect(server.data.registerClientKey(`04${'0'.repeat(128)}`)).rejects.toBeInstanceOf(TypeError)
    expect(register).not.toHaveBeenCalled()
  })

  it.each([
    0,
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    2_147_483_648,
  ])('rejects invalid TTL %s rather than retaining the key forever', (ttlSeconds) => {
    expect(() => createCacheTransportKeyStore({ cache, ttlSeconds })).toThrow(TypeError)
  })

  it.each([
    0,
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid shared quota %s', (maxRegistrationsPerMinute) => {
    expect(() => createCacheTransportKeyStore({ cache, maxRegistrationsPerMinute })).toThrow(TypeError)
  })
})

// 每个用例借用独立的 cache.memory 状态，模拟进程内测试环境。
beforeEach(async () => {
  const cacheTransportReady = await cache.init({ type: 'memory' })
  expect(cacheTransportReady.success).toBe(true)
})
afterAll(() => crypto.close())
