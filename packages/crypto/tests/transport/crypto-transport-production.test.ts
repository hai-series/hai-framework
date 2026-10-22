/** 公钥registry的工厂名称不能替代真实共享后端能力。 */
import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createInMemoryKeyStore, createRedisTransportKeyStore, createReldbTransportKeyStore, crypto } from '../../src/index.js'

beforeEach(async () => {
  expect((await crypto.init()).success).toBe(true)
  expect((await cache.init({ type: 'memory' })).success).toBe(true)
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await reldb.close()
  await cache.close()
  await crypto.close()
})

it.each(['memory', 'redis-over-memory', 'reldb-over-sqlite'])('生产拒绝实际为local的%s registry', (kind) => {
  const key = crypto.asymmetric.generateKeyPair()
  if (!key.success)
    throw new Error('Key generation failed')
  const keyStore = kind === 'memory' ? createInMemoryKeyStore() : kind === 'redis-over-memory' ? createRedisTransportKeyStore({ cache }) : createReldbTransportKeyStore({ reldb })
  expect(keyStore.stateScope).toBe('local')
  vi.stubEnv('HAI_CORE_ENV', 'production')
  vi.stubEnv('HAI_E2E', '0')
  vi.stubEnv('HAI_E2E_MOCK', '0')
  const result = crypto.transport.createServer({ keyStore, serverKeyRing: { activeKeyId: 'current', keys: { current: key.data } } })
  expect(result.success).toBe(false)
})
