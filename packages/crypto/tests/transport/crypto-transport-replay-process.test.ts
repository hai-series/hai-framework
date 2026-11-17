import type { ChildProcess } from 'node:child_process'
import { fork } from 'node:child_process'
import { cache } from '@h-ai/cache'
import { expect, it } from 'vitest'
import { crypto } from '../../src/index.js'
import { sealTransportPayload } from '../../src/transport/crypto-transport-codec.js'
import { sendWorker, startTransportRedis, stopWorker } from './crypto-transport-process-helper.js'

it('两个独立进程通过 Redis 原子消费防重放，并发仅一次业务执行且重启不复活 nonce', async () => {
  const fixture = await startTransportRedis()
  const workers: ChildProcess[] = []
  try {
    expect((await crypto.init()).success).toBe(true)
    expect((await cache.init(fixture.config)).success).toBe(true)
    const server = crypto.asymmetric.generateKeyPair()
    const client = crypto.asymmetric.generateKeyPair()
    if (!server.success || !client.success)
      throw new Error('Test key generation failed')
    const serverKeyRing = {
      activeKeyId: 'v1',
      keys: { v1: server.data },
    }
    const store = crypto.transport.createKeyStore({ cache })
    const clientId = await store.register(client.data.publicKey)
    const requestPath = '/orders?currency=CNY'
    const digest = crypto.hash.hash(requestPath)
    if (!digest.success)
      throw new Error(digest.error.message)
    const sealed = sealTransportPayload(crypto, '{"amount":10000}', {
      version: 2,
      serverKeyId: 'v1',
      clientId,
      requestId: crypto.symmetric.generateKey(),
      issuedAt: Date.now(),
      method: 'POST',
      pathHash: digest.data,
    }, 'request', 0, server.data.publicKey, client.data.privateKey)
    if (!sealed.success)
      throw new Error(sealed.error.message)
    const init = {
      method: 'POST',
      headers: { 'X-Client-Id': clientId, 'X-Encrypted': 'true' },
      body: JSON.stringify(sealed.data),
    }
    async function startWorker() {
      const worker = fork(new URL('./fixtures/crypto-transport-node.mjs', import.meta.url), {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      })
      workers.push(worker)
      expect(await sendWorker(worker, { type: 'init', config: fixture.config, serverKeyRing })).toMatchObject({ success: true })
      return worker
    }
    const first = await startWorker()
    const second = await startWorker()
    const request = (worker: ChildProcess, path = requestPath) => sendWorker(worker, { type: 'request', url: `https://example.test${path}`, init })
    expect(await request(second, '/another-path')).toMatchObject({ success: false, handled: 0 })
    const replies = await Promise.all(Array.from({ length: 8 }, (_, index) => request(index % 2
      ? first
      : second)))
    expect(replies.filter(reply => reply.success)).toHaveLength(1)
    expect(Math.max(...replies.filter((_, index) => index % 2 === 0).map(reply => reply.handled ?? 0)) + Math.max(...replies.filter((_, index) => index % 2 === 1).map(reply => reply.handled ?? 0))).toBe(1)
    await stopWorker(first)
    expect(await request(await startWorker())).toMatchObject({ success: false, handled: 0 })
  }
  finally {
    await Promise.all(workers.map(stopWorker))
    await cache.close()
    await crypto.close()
    await fixture.container.stop()
  }
}, 120_000)
