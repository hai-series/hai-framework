import type { ChildProcess } from 'node:child_process'
import { fork } from 'node:child_process'
import { cache } from '@h-ai/cache'
import { expect, it } from 'vitest'
import { createCacheTransportKeyStore, crypto, HaiCryptoError } from '../../src/index.js'
import { sendWorker, startTransportRedis, stopWorker } from './crypto-transport-process-helper.js'

it('真实 Redis 的双 Node 共享配额、有限 TTL 与重启恢复', async () => {
  const fixture = await startTransportRedis()
  const workers: ChildProcess[] = []
  try {
    expect((await crypto.init()).success).toBe(true)
    expect((await cache.init(fixture.config)).success).toBe(true)
    const key = crypto.asymmetric.generateKeyPair()
    if (!key.success)
      throw new Error(key.error.message)
    const options = { cache, maxRegistrationsPerMinute: 3, maxRequestsPerMinute: 2 }
    const store = createCacheTransportKeyStore(options)
    expect(store.stateScope).toBe('shared')
    async function startWorker(clockOffsetMs = 0) {
      const worker = fork(new URL('./fixtures/crypto-transport-registry-node.mjs', import.meta.url), {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      })
      workers.push(worker)
      expect(await sendWorker(worker, {
        type: 'init',
        config: fixture.config,
        maxRegistrationsPerMinute: 3,
        maxRequestsPerMinute: 2,
        clockOffsetMs,
      })).toMatchObject({ success: true })
      return worker
    }
    const first = await startWorker(30_000)
    const second = await startWorker(-30_000)
    const registered = await Promise.all(Array.from({ length: 16 }, (_, index) => sendWorker(index % 2
      ? first
      : second, { type: 'register', publicKey: key.data.publicKey })))
    const accepted = registered.filter(reply => reply.success)
    expect(accepted).toHaveLength(3)
    for (const reply of registered.filter(reply => !reply.success)) expect(reply.code).toBe(HaiCryptoError.TRANSPORT_BUSY.code)
    const clientId = accepted[0].clientId!
    expect(await store.get(clientId)).toBe(key.data.publicKey)
    const expiry = Date.now() + 660_000
    const requestId = 'a'.repeat(32)
    const claims = await Promise.all(Array.from({ length: 8 }, (_, index) => sendWorker(index % 2
      ? first
      : second, {
      type: 'claim',
      clientId,
      requestId,
      expiresAt: expiry,
    })))
    expect(claims.filter(reply => reply.success && reply.claimed)).toHaveLength(1)
    // 并发重复可能占用保守预留额度，但绝不绕过唯一 nonce 或放大记录数。
    await stopWorker(first)
    const restarted = await startWorker()
    expect(await sendWorker(restarted, { type: 'get', clientId })).toMatchObject({ success: true, publicKey: key.data.publicKey })
    expect(await sendWorker(restarted, {
      type: 'claim',
      clientId,
      requestId,
      expiresAt: expiry,
    })).toMatchObject({ success: true, claimed: false })
    const keys = await cache.kv.keys('hai:crypto:transport:cache:*')
    if (!keys.success)
      throw new Error(keys.error.message)
    expect(keys.data.length).toBeLessThanOrEqual(6)
    for (const key of keys.data) {
      const ttl = await cache.kv.ttl(key)
      expect(ttl.success && ttl.data > 0).toBe(true)
    }
  }
  finally {
    await Promise.all(workers.map(stopWorker))
    await cache.close()
    await crypto.close()
    await fixture.container.stop()
  }
}, 120_000)
