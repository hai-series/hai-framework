import { cache } from '@h-ai/cache'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { crypto, HaiCryptoError } from '../../src/index.js'

beforeEach(async () => {
  expect((await crypto.init()).success).toBe(true)
  expect((await cache.init({ type: 'memory' })).success).toBe(true)
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await cache.close()
  await crypto.close()
})
it('生产拒绝 cache.memory 的本机传输状态', () => {
  const key = crypto.asymmetric.generateKeyPair()
  if (!key.success)
    throw new Error(key.error.message)
  const keyStore = crypto.transport.createKeyStore({ cache })
  expect(keyStore.stateScope).toBe('local')
  vi.stubEnv('HAI_CORE_ENV', 'production')
  vi.stubEnv('HAI_E2E', '0')
  vi.stubEnv('HAI_E2E_MOCK', '0')
  expect(crypto.transport.createServer({
    keyStore,
    serverKeyRing: {
      activeKeyId: 'v1',
      keys: { v1: key.data },
    },
  })).toMatchObject({
    success: false,
    error: { code: HaiCryptoError.INVALID_INPUT.code },
  })
})
