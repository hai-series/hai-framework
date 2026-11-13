/** 真实关系库、多进程和可注入故障的 Qdrant 协议夹具。 */
import type { HaiResult } from '@h-ai/core'
import type { ReldbConfigInput } from '@h-ai/reldb'
import type { ChildProcess } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import type { MemoryEntry } from '../src/index.js'
import { Buffer } from 'node:buffer'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mysqlEnv, postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { HaiAIError } from '../src/index.js'

interface Point {
  id: string
  vector: number[]
  payload: { objectId: string, _id: string }
}

interface VectorWrite {
  node: string
  operation: 'upsert' | 'delete'
  ids: string[]
  applied: boolean
}

async function createMemoryGateway() {
  const points = new Map<string, Point>()
  const writes: VectorWrite[] = []
  const vectors = { size: 2, distance: 'Cosine' }
  let rejectWrites = false
  let rejectQueries = false
  let loseDeleteAcknowledgement = false
  let pauseUpsert = false
  let applyPausedUpsert: (() => void) | undefined

  const server = createServer(async (request, response) => {
    const respond = (result: unknown) => response.setHeader('content-type', 'application/json').end(JSON.stringify({ status: 'ok', result }))
    try {
      const path = new URL(request.url!, 'http://fixture.invalid').pathname
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const raw = Buffer.concat(chunks).toString()
      if (path === '/model/embeddings' && request.method === 'POST') {
        const { input } = JSON.parse(raw) as { input: string[] }
        response.setHeader('content-type', 'application/json').end(JSON.stringify({
          object: 'list',
          model: 'fixture-embedding',
          data: input.map((content, index) => {
            let embedding = [1, 0]
            if (content === 'current value')
              embedding = [0, 1]
            if (content === 'related value')
              embedding = [0.8, 0.6]
            return { object: 'embedding', index, embedding }
          }),
          usage: { prompt_tokens: 1, total_tokens: 1 },
        }))
        return
      }
      const parts = /^\/vector\/([^/]+)\/collections(?:\/(hai_ai_memory_vectors)(?:\/(points(?:\/(?:delete|query))?))?)?$/.exec(path)
      if (!parts) {
        response.writeHead(404).end()
        return
      }
      const [, node, collection, action] = parts
      if (!collection && request.method === 'GET') {
        respond({
          collections: [
            { name: 'hai_ai_memory_vectors' },
          ],
        })
        return
      }
      if (!action && request.method === 'GET') {
        respond({
          config: {
            params: { vectors },
          },
          points_count: points.size,
        })
        return
      }
      if (action === 'points' && request.method === 'PUT') {
        const input = JSON.parse(raw) as { points: Point[] }
        const write: VectorWrite = {
          node,
          operation: 'upsert',
          ids: input.points.map(point => point.id),
          applied: false,
        }
        writes.push(write)
        if (rejectWrites) {
          response.writeHead(503).end()
          return
        }
        const apply = () => {
          for (const point of input.points) points.set(point.id, point)
          write.applied = true
          if (!response.destroyed)
            respond({ status: 'completed' })
        }
        if (pauseUpsert) {
          pauseUpsert = false
          applyPausedUpsert = apply
        }
        else {
          apply()
        }
        return
      }
      if (action === 'points/delete' && request.method === 'POST') {
        const input = JSON.parse(raw) as { points: string[] }
        writes.push({
          node,
          operation: 'delete',
          ids: input.points,
          applied: !rejectWrites,
        })
        if (rejectWrites) {
          response.writeHead(503).end()
          return
        }
        for (const id of input.points) points.delete(id)
        // 模拟后端已删除，发起节点在收到成功确认前退出。
        if (loseDeleteAcknowledgement)
          return
        respond({ status: 'completed' })
        return
      }
      if (action === 'points/query' && request.method === 'POST') {
        if (rejectQueries) {
          response.writeHead(503).end()
          return
        }
        const { query, limit, filter } = JSON.parse(raw) as {
          query: number[]
          limit: number
          filter?: { must: Array<{ key: string, match: { value: unknown } }> }
        }
        const matched = [
          ...points.values(),
        ].filter(point => filter?.must.every(({ key, match }) => Reflect.get(point.payload, key) === match.value) ?? true)
        respond({
          points: matched.map(point => ({
            ...point,
            score: point.vector.reduce((score, component, index) => score + component * query[index], 0),
          }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit),
        })
        return
      }
      response.writeHead(405).end()
    }
    catch {
      response.writeHead(500).end()
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    points,
    writes,
    setUnavailable(value: boolean) { rejectWrites = value },
    setQueryUnavailable(value: boolean) { rejectQueries = value },
    holdDeleteAcknowledgement(value: boolean) { loseDeleteAcknowledgement = value },
    holdNextUpsert() { pauseUpsert = true },
    hasPendingUpsert() { return applyPausedUpsert !== undefined },
    finishPendingUpsert() {
      const apply = applyPausedUpsert
      applyPausedUpsert = undefined
      apply?.()
    },
    async close() {
      server.close()
      server.closeAllConnections()
      await once(server, 'close')
    },
  }
}

let nextRequestId = 0
const fixture = fileURLToPath(new URL('./fixtures/memory-recovery-node.mjs', import.meta.url))

interface Reply<T> {
  id: number
  output?: T
  error?: string
}

function call<T = unknown>(child: ChildProcess, method: string, input?: unknown): Promise<T> {
  const id = ++nextRequestId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error(`Memory fixture timed out: ${method}`)), 20_000)
    const exited = () => fail(new Error(`Memory fixture stopped: ${method}`))
    function release() {
      clearTimeout(timer)
      child.off('message', receive)
      child.off('exit', exited)
    }
    function fail(error: Error) {
      release()
      reject(error)
    }
    function receive(message: Reply<T>) {
      if (message.id !== id)
        return
      if (message.error) {
        fail(new Error(message.error))
        return
      }
      release()
      resolve(message.output as T)
    }
    child.on('message', receive)
    child.once('exit', exited)
    child.send({ id, method, input }, (error) => {
      if (error)
        fail(error)
    })
  })
}

async function startNode(children: ChildProcess[], database: ReldbConfigInput, url: string, node: string, maxEntriesPerObject = 1) {
  const child = fork(fixture, [], {
    execArgv: [],
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  })
  children.push(child)
  await call(child, 'init', {
    database,
    url,
    node,
    maxEntriesPerObject,
  })
  return child
}

async function stop(child: ChildProcess, abrupt = false) {
  if (child.exitCode !== null || child.signalCode !== null)
    return
  const exited = once(child, 'exit')
  try {
    if (abrupt) {
      expect(child.kill('SIGKILL')).toBe(true)
    }
    else if (child.connected) {
      await call(child, 'close')
      child.disconnect()
    }
  }
  finally {
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000)
    try {
      await exited
    }
    finally {
      clearTimeout(timer)
    }
  }
}

async function cleanup(children: ChildProcess[], gateway: Awaited<ReturnType<typeof createMemoryGateway>>, release?: () => Promise<void>) {
  // 即使测试在模拟确认丢失时失败，也先释放网络连接，再收尾子进程。
  try {
    await gateway.close()
  }
  finally {
    try {
      const results = await Promise.allSettled(children.map(child => stop(child)))
      expect(results.filter(result => result.status === 'rejected')).toEqual([])
    }
    finally {
      await release?.()
    }
  }
}

function value<T>(result: HaiResult<T>): T {
  expect(result.success).toBe(true)
  if (!result.success)
    throw new Error(result.error.code)
  return result.data
}

const unavailableOwner = {
  success: false,
  error: { code: HaiAIError.MEMORY_NOT_FOUND.code },
}
const poll = { interval: 50, timeout: 10_000 }

function ownerPoints(gateway: Awaited<ReturnType<typeof createMemoryGateway>>, owner: string) {
  return Array.from(gateway.points.values()).filter(point => point.payload.objectId === owner)
}

async function verifyRolledBackEviction(child: ChildProcess, backend: 'PostgreSQL' | 'MySQL', gateway: Awaited<ReturnType<typeof createMemoryGateway>>) {
  const table = 'hai_ai_memory_vector_outbox'
  const execute = async (sql: string) => value(await call<HaiResult<unknown>>(child, 'executeDdl', { sql }))
  const trigger = 'test_native_memory_fault'
  const postgres = backend === 'PostgreSQL'
  // 在真实数据库中让事务中的待办写入失败，确认先前的条目与向量都不受影响。
  if (postgres)
    await execute(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'memory fixture outbox failure'; END; $$`)
  await execute(postgres
    ? `CREATE TRIGGER ${trigger} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${trigger}()`
    : `CREATE TRIGGER ${trigger} BEFORE INSERT ON ${table} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'memory fixture outbox failure'`)
  try {
    const writes = gateway.writes.length
    expect(await call(child, 'add', { owner: 'bob', content: 'Would evict Bob’s original memory' })).toMatchObject({
      success: false,
      error: { code: HaiAIError.MEMORY_STORE_FAILED.code },
    })
    const entries = value(await call<HaiResult<MemoryEntry[]>>(child, 'list', { owner: 'bob' }))
    expect(entries.map(entry => entry.content)).toEqual(['Keep Bob’s memory'])
    expect(gateway.writes).toHaveLength(writes)
    expect(ownerPoints(gateway, 'bob')).toHaveLength(1)
  }
  finally {
    await execute(postgres
      ? `DROP TRIGGER ${trigger} ON ${table}`
      : `DROP TRIGGER ${trigger}`)
    if (postgres)
      await execute(`DROP FUNCTION ${trigger}()`)
  }
}

describe.each([
  ['PostgreSQL', postgresEnv],
  ['MySQL', mysqlEnv],
] as const)('native memory recovery with %s', (backend, database) => {
  it('retries committed writes on another node and replays a delete after the original worker dies before acknowledgement', async () => {
    const children: ChildProcess[] = []
    const gateway = await createMemoryGateway()
    let releaseDatabase: (() => Promise<void>) | undefined
    try {
      const { config, release } = await database()
      releaseDatabase = release
      const first = await startNode(children, config, gateway.url, 'first')
      const second = await startNode(children, config, gateway.url, 'second')
      const bob = value(await call<HaiResult<MemoryEntry>>(second, 'add', { owner: 'bob', content: 'Keep Bob’s memory' }))
      await expect.poll(() => ownerPoints(gateway, 'bob').length, poll).toBe(1)

      gateway.setUnavailable(true)
      const alice = value(await call<HaiResult<MemoryEntry>>(first, 'add', { owner: 'alice', content: 'obsolete value' }))
      await expect.poll(() => gateway.writes.some(write => write.operation === 'upsert' && !write.applied), poll).toBe(true)
      expect(value(await call<HaiResult<MemoryEntry>>(second, 'get', { owner: 'alice', id: alice.id })).content).toBe('obsolete value')
      for (const method of ['get', 'update', 'remove']) {
        expect(await call(second, method, { owner: 'bob', id: alice.id, content: 'wrong owner' })).toMatchObject(unavailableOwner)
      }
      const updated = value(await call<HaiResult<MemoryEntry>>(second, 'update', { owner: 'alice', id: alice.id, content: 'current value' }))
      expect(updated.content).toBe('current value')
      await stop(first, true)

      const replacement = await startNode(children, config, gateway.url, 'replacement')
      const recoveryStart = gateway.writes.length
      gateway.setUnavailable(false)
      await expect.poll(() => ownerPoints(gateway, 'alice').map(point => point.vector), poll).toEqual([
        [0, 1],
      ])
      expect(gateway.writes.slice(recoveryStart)).toContainEqual(expect.objectContaining({ operation: 'upsert', applied: true }))
      expect(value(await call<HaiResult<MemoryEntry>>(replacement, 'get', { owner: 'alice', id: alice.id })).content).toBe('current value')

      const [alicePoint] = ownerPoints(gateway, 'alice')
      await stop(second)
      gateway.holdDeleteAcknowledgement(true)
      value(await call<HaiResult<void>>(replacement, 'remove', { owner: 'alice', id: alice.id }))
      await expect.poll(() => gateway.writes.some(write => write.node === 'replacement' && write.operation === 'delete' && write.applied && write.ids.includes(alicePoint.id)), poll).toBe(true)
      expect(gateway.points.has(alicePoint.id)).toBe(false)
      await stop(replacement, true)
      gateway.holdDeleteAcknowledgement(false)

      const restarted = await startNode(children, config, gateway.url, 'restarted')
      value(await call<HaiResult<unknown>>(restarted, 'expireVectorClaim', { memoryId: alice.id }))
      await expect.poll(() => gateway.writes.some(write => write.node === 'restarted' && write.operation === 'delete' && write.applied && write.ids.includes(alicePoint.id)), poll).toBe(true)
      expect(await call(restarted, 'get', { owner: 'alice', id: alice.id })).toMatchObject(unavailableOwner)
      expect(value(await call<HaiResult<MemoryEntry>>(restarted, 'get', { owner: 'bob', id: bob.id })).content).toBe('Keep Bob’s memory')
      expect(Array.from(gateway.points.values(), point => point.payload.objectId)).toEqual(['bob'])
      await verifyRolledBackEviction(restarted, backend, gateway)
    }
    finally {
      await cleanup(children, gateway, releaseDatabase)
    }
  }, 120_000)

  it('ignores an older upsert arriving after a crash and recovers quota evictions and scoped clears', async () => {
    const children: ChildProcess[] = []
    const gateway = await createMemoryGateway()
    let releaseDatabase: (() => Promise<void>) | undefined
    try {
      const { config, release } = await database()
      releaseDatabase = release
      const original = await startNode(children, config, gateway.url, 'original', 2)
      gateway.holdNextUpsert()
      let added: HaiResult<MemoryEntry> | undefined
      void call<HaiResult<MemoryEntry>>(original, 'add', { owner: 'alice', content: 'obsolete value' })
        .then((result) => { added = result }, () => {})
      await expect.poll(gateway.hasPendingUpsert, poll).toBe(true)
      await expect.poll(() => added?.success, poll).toBe(true)
      const alice = value(added!)
      const oldVectorId = gateway.writes[0].ids[0]
      await stop(original, true)

      const replacement = await startNode(children, config, gateway.url, 'replacement', 2)
      expect(value(await call<HaiResult<MemoryEntry>>(replacement, 'get', { owner: 'alice', id: alice.id })).content).toBe('obsolete value')
      const updated = value(await call<HaiResult<MemoryEntry>>(replacement, 'update', { owner: 'alice', id: alice.id, content: 'current value' }))
      expect(updated.id).toBe(alice.id)
      const related = value(await call<HaiResult<MemoryEntry>>(replacement, 'add', { owner: 'alice', content: 'related value' }))
      const bob = value(await call<HaiResult<MemoryEntry>>(replacement, 'add', { owner: 'bob', content: 'Keep Bob’s memory' }))
      await expect.poll(() => ownerPoints(gateway, 'alice').map(point => point.vector), poll).toEqual(expect.arrayContaining([
        [0, 1],
        [0.8, 0.6],
      ]))
      const deletesOfOldVector = () => gateway.writes.filter(write => write.operation === 'delete' && write.applied && write.ids.includes(oldVectorId)).length
      await expect.poll(deletesOfOldVector, poll).toBeGreaterThanOrEqual(1)
      const previousDeletes = deletesOfOldVector()
      gateway.finishPendingUpsert()
      expect(gateway.points.get(oldVectorId)?.vector).toEqual([1, 0])
      const hits = value(await call<HaiResult<MemoryEntry[]>>(replacement, 'recall', { owner: 'alice', content: 'match', topK: 1 }))
      expect(hits.map(entry => entry.id)).toEqual([related.id])
      gateway.setQueryUnavailable(true)
      const fallback = value(await call<HaiResult<MemoryEntry[]>>(replacement, 'recall', { owner: 'alice', content: 'match', topK: 2 }))
      expect(fallback.map(entry => entry.id)).toEqual([related.id, alice.id])
      gateway.setQueryUnavailable(false)
      await expect.poll(() => gateway.points.has(oldVectorId), poll).toBe(false)
      expect(deletesOfOldVector()).toBeGreaterThan(previousDeletes)

      gateway.setUnavailable(true)
      const fresh = value(await call<HaiResult<MemoryEntry>>(replacement, 'add', { owner: 'alice', content: 'fresh value' }))
      const retained = value(await call<HaiResult<MemoryEntry[]>>(replacement, 'list', { owner: 'alice' }))
      expect(retained).toHaveLength(2)
      expect(retained.map(entry => entry.id)).toContain(fresh.id)
      await expect.poll(() => gateway.writes.some(write => write.operation === 'delete' && !write.applied), poll).toBe(true)
      value(await call<HaiResult<void>>(replacement, 'clear', { owner: 'alice' }))
      expect(value(await call<HaiResult<MemoryEntry[]>>(replacement, 'list', { owner: 'alice' }))).toEqual([])
      await stop(replacement)
      gateway.setUnavailable(false)

      const restarted = await startNode(children, config, gateway.url, 'restarted', 2)
      await expect.poll(() => Array.from(gateway.points.values(), point => point.payload.objectId), { ...poll, timeout: 15_000 }).toEqual(['bob'])
      expect(value(await call<HaiResult<MemoryEntry>>(restarted, 'get', { owner: 'bob', id: bob.id })).content).toBe('Keep Bob’s memory')
      expect(value(await call<HaiResult<MemoryEntry[]>>(restarted, 'list', { owner: 'alice' }))).toEqual([])
    }
    finally {
      await cleanup(children, gateway, releaseDatabase)
    }
  }, 120_000)
})
