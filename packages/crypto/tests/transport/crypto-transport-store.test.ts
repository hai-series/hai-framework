import { cache } from '@h-ai/cache'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createCacheTransportKeyStore, crypto } from '../../src/index.js'

let publicKey: string
beforeAll(async () => {
  expect((await crypto.init()).success).toBe(true)
  const generated = crypto.asymmetric.generateKeyPair()
  if (!generated.success)
    throw new Error(generated.error.message)
  publicKey = generated.data.publicKey
})
beforeEach(async () => {
  expect((await cache.init({ type: 'memory' })).success).toBe(true)
})
afterEach(() => cache.close())
afterAll(() => crypto.close())

describe('crypto transport cache store', () => {
  it('shares client keys across wrappers and deletes only the selected client', async () => {
    const first = createCacheTransportKeyStore({ cache })
    const second = createCacheTransportKeyStore({ cache })
    const firstId = await first.register(publicKey)
    const secondId = await second.register(publicKey)
    expect(firstId).not.toBe(secondId)
    expect(await second.get(firstId)).toBe(publicKey)
    await second.delete?.(firstId)
    expect(await first.get(firstId)).toBeUndefined()
    expect(await first.get(secondId)).toBe(publicKey)
    expect(first.clientKeyTtlSeconds).toBe(3600)
  })

  it('atomically consumes a nonce once across wrappers without removing it on client deletion', async () => {
    const first = createCacheTransportKeyStore({ cache })
    const second = createCacheTransportKeyStore({ cache })
    const clientId = await first.register(publicKey)
    const expiresAt = Date.now() + 660_000
    const requestId = 'a'.repeat(32)
    const results = await Promise.all(Array.from({ length: 16 }, (_, index) => (index % 2
      ? first
      : second).claimRequest(clientId, requestId, expiresAt)))
    expect(results.filter(Boolean)).toHaveLength(1)
    await second.delete?.(clientId)
    expect(await first.claimRequest(clientId, requestId, expiresAt)).toBe(false)
    expect(await first.claimRequest('another-client', requestId, expiresAt)).toBe(true)
    expect(await first.claimRequest(clientId, 'b'.repeat(32), Date.now() - 1)).toBe(false)
  })

  it('leaves the borrowed cache open when a manager closes', async () => {
    const generated = crypto.asymmetric.generateKeyPair()
    if (!generated.success)
      throw new Error(generated.error.message)
    const store = createCacheTransportKeyStore({ cache })
    const manager = crypto.transport.createServer({
      keyStore: store,
      serverKeyRing: {
        activeKeyId: 'v1',
        keys: { v1: generated.data },
      },
    })
    expect(manager.success).toBe(true)
    if (!manager.success)
      return
    const clientId = await manager.data.registerClientKey(publicKey)
    await manager.data.close()
    expect(cache.isInitialized).toBe(true)
    expect(await store.get(clientId)).toBe(publicKey)
  })
})
