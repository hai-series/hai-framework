import type { ReldbConfigInput } from '@h-ai/reldb'
import type { ChildProcess } from 'node:child_process'
import { fork } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { reldb } from '@h-ai/reldb'
import { GenericContainer, Wait } from 'testcontainers'
import { expect, it } from 'vitest'
import { createReldbTransportKeyStore, crypto } from '../../src/index.js'

interface Reply {
  id: number
  success: boolean
  clientId?: string
  publicKey?: string
  removed?: number
  claimed?: boolean
}

let nextId = 0

/** 每个请求都有有界超时；退出、超时和返回时移除监听器。 */
function send(worker: ChildProcess, message: Record<string, unknown>): Promise<Reply> {
  const id = ++nextId
  return new Promise((resolveReply, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Registry worker response timed out'))
    }, 15000)
    function cleanup() {
      clearTimeout(timeout)
      worker.off('message', onMessage)
      worker.off('exit', onExit)
    }
    function onExit() {
      cleanup()
      reject(new Error('Registry worker exited before replying'))
    }
    function onMessage(reply: Reply) {
      if (reply.id === id) {
        cleanup()
        resolveReply(reply)
      }
    }
    worker.on('message', onMessage)
    worker.once('exit', onExit)
    worker.send({ ...message, id })
  })
}

/** 只关闭本测试创建的进程；退出后才允许清理 SQLite 目录。 */
async function stopWorker(worker: ChildProcess): Promise<void> {
  if (worker.exitCode !== null || worker.signalCode !== null)
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

/** 限制递归清理为当前测试创建的直接临时子目录。 */
async function removeFixture(directory: string): Promise<void> {
  const target = resolve(directory)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hai-crypto-registry-'))
    throw new Error('Unexpected registry fixture cleanup target')
  await rm(target, { recursive: true, force: true })
}

for (const type of ['sqlite', 'postgresql', 'mysql'] as const) {
  it(`真实 ${type} 双 Node 容量注册、过期有界清理及重启恢复`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hai-crypto-registry-'))
    const workers: ChildProcess[] = []
    let container: Awaited<ReturnType<GenericContainer['start']>> | undefined
    try {
      let config: ReldbConfigInput = { type: 'sqlite', database: join(directory, 'shared.db') }
      if (type !== 'sqlite') {
        const postgres = type === 'postgresql'
        const port = postgres ? 5432 : 3306
        container = await new GenericContainer(postgres ? 'docker.io/library/postgres:16.15-alpine' : 'docker.io/library/mysql:8.4.11')
          .withExposedPorts(port)
          .withEnvironment(postgres ? { POSTGRES_DB: 'crypto_registry', POSTGRES_USER: 'registry_test', POSTGRES_PASSWORD: 'registry_test' } : { MYSQL_DATABASE: 'crypto_registry', MYSQL_ROOT_PASSWORD: 'registry_test' })
          .withWaitStrategy(postgres ? Wait.forLogMessage('database system is ready to accept connections', 2) : Wait.forLogMessage(/ready for connections\..*port: 3306/))
          .withStartupTimeout(120000)
          .start()
        config = { type, database: 'crypto_registry', host: container.getHost(), port: container.getMappedPort(port), user: postgres ? 'registry_test' : 'root', password: 'registry_test' }
      }
      expect((await reldb.init(config)).success).toBe(true)
      expect((await crypto.init()).success).toBe(true)
      const keyPair = crypto.asymmetric.generateKeyPair()
      if (!keyPair.success)
        throw new Error(keyPair.error.message)
      const publicKey = keyPair.data.publicKey
      const registry = createReldbTransportKeyStore({ reldb, ttlSeconds: 3600, maxClients: 3 })
      async function startWorker() {
        const worker = fork(new URL('./fixtures/crypto-transport-registry-node.mjs', import.meta.url), { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
        workers.push(worker)
        expect(await send(worker, { type: 'init', config, maxClients: 3 })).toMatchObject({ success: true })
        return worker
      }
      // 空库由两个独立 Node 首次同时初始化，不能依赖父进程预先建表。
      const [first, second] = await Promise.all([startWorker(), startWorker()])
      const persistentId = await registry.register(publicKey)
      const expiry = Date.now() + 360000
      expect(await registry.claimRequest(persistentId, 'consumed', expiry)).toBe(true)
      const replies = await Promise.all(Array.from({ length: 12 }, (_, index) => send(index % 2 ? first : second, { type: 'register', publicKey })))
      const accepted = replies.filter(reply => reply.success)
      expect(accepted).toHaveLength(2)
      const count = await reldb.sql.get<{ total: number | string }>('SELECT COUNT(*) AS total FROM hai_crypto_transport_client_keys')
      expect(count.success && Number(count.data?.total)).toBe(3)
      expect(await send(second, { type: 'get', clientId: persistentId })).toMatchObject({ success: true, publicKey })

      const expiredCount = 251
      expect((await reldb.sql.execute(
        `INSERT INTO hai_crypto_transport_client_keys (client_id, public_key, created_at_ms, expires_at_ms) VALUES ${Array.from({ length: expiredCount }).fill('(?, ?, ?, ?)').join(', ')}`,
        Array.from({ length: expiredCount }, (_, index) => [`expired-${index}`, publicKey, 0, 1]).flat(),
      )).success).toBe(true)
      expect((await reldb.sql.execute(
        `INSERT INTO hai_crypto_transport_requests (request_key, expires_at) VALUES ${Array.from({ length: expiredCount }).fill('(?, ?)').join(', ')}`,
        Array.from({ length: expiredCount }, (_, index) => [`expired-${index}`, 1]).flat(),
      )).success).toBe(true)
      let removed = 0
      for (let batch = 0; batch < 4; batch++) {
        const pruned = await Promise.all([send(first, { type: 'prune' }), send(second, { type: 'prune' })])
        for (const reply of pruned) {
          expect(reply.success).toBe(true)
          expect(reply.removed).toBeLessThanOrEqual(200)
          removed += reply.removed ?? 0
        }
      }
      expect(removed).toBe(expiredCount * 2)
      expect(await registry.get(persistentId)).toBe(publicKey)
      expect(await send(second, { type: 'claim', clientId: persistentId, requestId: 'consumed', expiresAt: expiry })).toMatchObject({ success: true, claimed: false })

      const expiredId = accepted[0]!.clientId!
      expect((await reldb.sql.execute('UPDATE hai_crypto_transport_client_keys SET expires_at_ms = ? WHERE client_id = ?', [1, expiredId])).success).toBe(true)
      expect(await send(first, { type: 'get', clientId: expiredId })).not.toHaveProperty('publicKey')
      expect(await send(second, { type: 'register', publicKey })).toMatchObject({ success: true })
      await stopWorker(first)
      const restarted = await startWorker()
      expect(await send(restarted, { type: 'get', clientId: persistentId })).toMatchObject({ success: true, publicKey })
      expect(await send(restarted, { type: 'register', publicKey })).toMatchObject({ success: false })
      expect(await send(restarted, { type: 'claim', clientId: persistentId, requestId: 'consumed', expiresAt: expiry })).toMatchObject({ success: true, claimed: false })
    }
    finally {
      await Promise.all(workers.map(stopWorker))
      await reldb.close()
      await crypto.close()
      await container?.stop({ timeout: 10000, remove: true, removeVolumes: true })
      await removeFixture(directory)
    }
  }, 180000)
}
