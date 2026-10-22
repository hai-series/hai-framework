import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createInMemoryKeyStore,
  createRedisTransportKeyStore,
  createReldbTransportKeyStore,
} from '../../src/index.js'

describe('crypto transport key stores', () => {
  afterEach(async () => {
    await cache.close()
    await reldb.close()
  })

  it('evicts the oldest client in the default in-memory store', async () => {
    const store = createInMemoryKeyStore(1)

    const firstClientId = await store.register('pk-1')
    const secondClientId = await store.register('pk-2')

    expect(await store.get(firstClientId)).toBeUndefined()
    expect(await store.get(secondClientId)).toBe('pk-2')
  })

  it('stores client keys through the cache module', async () => {
    const initResult = await cache.init({ type: 'memory' })
    expect(initResult.success).toBe(true)
    if (!initResult.success)
      return

    const store = createRedisTransportKeyStore({ cache, ttlSeconds: 60 })
    const clientId = await store.register('pk-cache')

    expect(await store.get(clientId)).toBe('pk-cache')

    await store.delete?.(clientId)
    expect(await store.get(clientId)).toBeUndefined()
  })

  it('auto-creates the reldb table and persists client keys', async () => {
    const initResult = await reldb.init({ type: 'sqlite', database: ':memory:' })
    expect(initResult.success).toBe(true)
    if (!initResult.success)
      return

    const store = createReldbTransportKeyStore({ reldb, ttlSeconds: 60 })
    const clientId = await store.register('pk-reldb')

    expect(await store.get(clientId)).toBe('pk-reldb')

    const rowResult = await reldb.sql.get<{ public_key: string }>(
      'SELECT public_key FROM hai_crypto_transport_client_keys WHERE client_id = ?',
      [clientId],
    )
    expect(rowResult.success).toBe(true)
    expect(rowResult.success ? rowResult.data?.public_key : undefined).toBe('pk-reldb')

    await store.delete?.(clientId)
    expect(await store.get(clientId)).toBeUndefined()
  })

  it.each(['memory', 'redis', 'reldb'] as const)('有效 nonce 原子消费且拒绝过期写入：%s', async (backend) => {
    let first
    let second
    if (backend === 'redis') {
      expect((await cache.init({ type: 'memory' })).success).toBe(true)
      first = createRedisTransportKeyStore({ cache })
      second = createRedisTransportKeyStore({ cache })
    }
    else if (backend === 'reldb') {
      expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
      first = createReldbTransportKeyStore({ reldb })
      second = createReldbTransportKeyStore({ reldb })
      // 同时创建的两个 wrapper 必须先完成无业务含义的建表操作。
      await first.get('client')
      await second.get('client')
    }
    else {
      first = createInMemoryKeyStore(1)
      second = first
    }
    const expiry = Date.now() + 60_000
    const results = await Promise.all(Array.from({ length: 16 }, (_, i) => (i % 2 ? first : second).claimRequest('client', 'nonce', expiry)))
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await second.claimRequest('client', 'nonce', expiry)).toBe(false)
    expect(await second.claimRequest('other-client', 'nonce', expiry)).toBe(true)
    expect(await second.claimRequest('client', 'already-expired', Date.now() - 1)).toBe(false)
  })
})
