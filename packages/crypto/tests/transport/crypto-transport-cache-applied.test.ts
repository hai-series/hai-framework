import { cache } from '@h-ai/cache'
import { ok } from '@h-ai/core'
import { afterEach, expect, it, vi } from 'vitest'
import { createRedisTransportKeyStore, crypto } from '../../src/index.js'

afterEach(async () => {
  vi.restoreAllMocks()
  await crypto.close()
  await cache.close()
})

it('不为未实际保存的公钥签发 clientId', async () => {
  expect((await cache.init({ type: 'memory' })).success).toBe(true)
  expect((await crypto.init()).success).toBe(true)
  const keyPair = crypto.asymmetric.generateKeyPair()
  if (!keyPair.success)
    throw new Error('Test key generation failed')
  const write = vi.spyOn(cache.kv, 'set').mockResolvedValueOnce(ok(false))
  const store = createRedisTransportKeyStore({ cache })
  await expect(store.register(keyPair.data.publicKey)).rejects.toThrow()
  expect(write).toHaveBeenCalledWith(expect.any(String), keyPair.data.publicKey, undefined)
  expect(await cache.kv.keys('*')).toMatchObject({ success: true, data: [] })
})
