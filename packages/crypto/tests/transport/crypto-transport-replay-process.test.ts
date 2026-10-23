import type { ChildProcess } from 'node:child_process'
import { fork } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { reldb } from '@h-ai/reldb'
import { expect, it } from 'vitest'
import { createReldbTransportKeyStore, crypto } from '../../src/index.js'
import { sealTransportPayload } from '../../src/transport/crypto-transport-codec.js'

interface WorkerReply {
  id?: number
  type?: string
  success?: boolean
  handled?: number
  error?: string
}

/** 所有子进程均由本测试创建；退出后才清理独立数据库目录。 */
async function stopWorker(worker: ChildProcess): Promise<void> {
  if (worker.exitCode !== null)
    return
  await new Promise<void>((resolveStop) => {
    const timeout = setTimeout(() => worker.kill(), 3000)
    worker.once('exit', () => {
      clearTimeout(timeout)
      resolveStop()
    })
    if (worker.connected)
      worker.send({ type: 'close' })
    else
      worker.kill()
  })
}

it('两个独立进程使用实际 SQL 唯一键防重放；并发仅一次业务执行且重启不复活已用 nonce', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hai-transport-replay-'))
  const target = resolve(directory)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hai-transport-replay-'))
    throw new Error('Unexpected replay test cleanup target')
  const workers: ChildProcess[] = []
  try {
    expect((await crypto.init()).success).toBe(true)
    const database = join(directory, 'registry.db')
    expect((await reldb.init({ type: 'sqlite', database })).success).toBe(true)
    const server = crypto.asymmetric.generateKeyPair()
    const client = crypto.asymmetric.generateKeyPair()
    if (!server.success || !client.success)
      throw new Error('Test key generation failed')
    const serverKeyRing = { activeKeyId: 'v1', keys: { v1: server.data } }
    const store = createReldbTransportKeyStore({ reldb })
    const clientId = await store.register(client.data.publicKey)
    const requestPath = '/orders?currency=CNY'
    const digest = crypto.hash.hash(requestPath)
    if (!digest.success)
      throw new Error(digest.error.message)
    const context = { version: 2 as const, serverKeyId: 'v1', clientId, requestId: crypto.symmetric.generateKey(), issuedAt: Date.now(), method: 'POST', pathHash: digest.data }
    const sealed = sealTransportPayload(crypto, '{"amount":10000}', context, 'request', 0, server.data.publicKey, client.data.privateKey)
    if (!sealed.success)
      throw new Error(sealed.error.message)
    const init = { method: 'POST', headers: { 'X-Client-Id': clientId, 'X-Encrypted': 'true' }, body: JSON.stringify(sealed.data) }
    let nextId = 0
    async function startWorker() {
      const worker = fork(new URL('./fixtures/crypto-transport-node.mjs', import.meta.url), { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
      workers.push(worker)
      await new Promise<void>((resolveReady, reject) => {
        const timeout = setTimeout(() => reject(new Error('Transport worker startup timed out')), 10_000)
        worker.on('message', (message: WorkerReply) => {
          if (message.type === 'ready' || message.error) {
            clearTimeout(timeout)
            if (message.error)
              reject(new Error(message.error))
            else
              resolveReady()
          }
        })
        worker.once('error', reject)
        worker.send({ type: 'init', database, clientId, serverKeyRing })
      })
      return worker
    }
    function send(worker: ChildProcess, path = requestPath): Promise<WorkerReply> {
      const id = ++nextId
      return new Promise((resolveReply, reject) => {
        const timeout = setTimeout(() => {
          worker.off('message', onMessage)
          reject(new Error('Transport worker request timed out'))
        }, 10_000)
        function onMessage(message: WorkerReply) {
          if (message.id === id) {
            clearTimeout(timeout)
            worker.off('message', onMessage)
            resolveReply(message)
          }
        }
        worker.on('message', onMessage)
        worker.send({ type: 'request', id, url: `https://example.test${path}`, init })
      })
    }
    const first = await startWorker()
    const second = await startWorker()
    expect(await send(second, '/another-path')).toMatchObject({ success: false, handled: 0 })
    const replies = await Promise.all(Array.from({ length: 8 }, (_, i) => send(i % 2 ? first : second)))
    expect(replies.filter(r => r.success)).toHaveLength(1)
    expect(Math.max(...replies.filter((_, i) => i % 2 === 0).map(r => r.handled ?? 0))
      + Math.max(...replies.filter((_, i) => i % 2 === 1).map(r => r.handled ?? 0))).toBe(1)
    await stopWorker(first)
    const restarted = await startWorker()
    expect(await send(restarted)).toMatchObject({ success: false, handled: 0 })
  }
  finally {
    await Promise.all(workers.map(stopWorker))
    await reldb.close()
    await crypto.close()
    await rm(target, { recursive: true, force: true })
  }
}, 30_000)
