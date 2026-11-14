/** 原生记忆向量命名空间回归，使用真实 Qdrant 和独立关系库。 */
import type { HaiResult } from '@h-ai/core'
import type { ReldbConfigInput } from '@h-ai/reldb'
import type { ChildProcess } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import type { MemoryEntry } from '../src/index.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reldb } from '@h-ai/reldb'
import { describe, expect, it } from 'vitest'
import { mysqlEnv, postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { acquireQdrantContainer } from '../../vecdb/tests/helpers/qdrant-container.js'
import { HaiAIError, MemoryConfigSchema } from '../src/index.js'
import { call, forkNode, startNode, stop } from './helpers/memory-test-node.js'

const legacyCollection = 'hai_ai_memory_vectors'
const poll = { interval: 50, timeout: 10_000 }

it('defaults the vector namespace and rejects names unsafe for shared backends', () => {
  expect(MemoryConfigSchema.safeParse({})).toMatchObject({
    success: true,
    data: { vectorNamespace: 'default' },
  })
  expect(MemoryConfigSchema.safeParse({ vectorNamespace: 'shop_north-1' })).toMatchObject({ success: true })
  for (const vectorNamespace of [
    '',
    'UPPER',
    '1first',
    'app/',
    '../other',
    'spaced app',
    'app_',
    'a'.repeat(21),
  ])
    expect(MemoryConfigSchema.safeParse({ vectorNamespace })).toMatchObject({ success: false })
})

interface Point {
  id: string
  vector: number[]
  payload: { objectId: string, _id: string }
}

interface VectorRequest {
  node: string
  collection?: string
  action?: string
  method?: string
  points?: Point[]
}

async function createGateway(upstream: string) {
  const requests: VectorRequest[] = []
  let beforeWrite: ((request: VectorRequest) => Promise<void> | undefined) | undefined
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://fixture.invalid')
      const chunks: Buffer[] = []
      for await (const chunk of request)
        chunks.push(Buffer.from(chunk))
      const raw = Buffer.concat(chunks).toString()
      if (url.pathname === '/model/embeddings' && request.method === 'POST') {
        const { input } = JSON.parse(raw) as { input: string[] }
        response.setHeader('content-type', 'application/json').end(JSON.stringify({
          object: 'list',
          model: 'fixture-embedding',
          data: input.map((_, index) => ({
            object: 'embedding',
            index,
            embedding: [1, 0],
          })),
          usage: { prompt_tokens: 1, total_tokens: 1 },
        }))
        return
      }
      const route = /^\/vector\/([^/]+)(\/collections(?:\/([^/]+)(?:\/(.*))?)?)$/.exec(url.pathname)
      if (!route) {
        response.writeHead(404).end()
        return
      }
      const [, node, path, collection, action] = route
      const observation: VectorRequest = {
        node,
        collection,
        action,
        method: request.method,
      }
      if (action === 'points' && request.method === 'PUT')
        observation.points = (JSON.parse(raw) as { points: Point[] }).points
      requests.push(observation)
      await beforeWrite?.(observation)
      if (response.destroyed)
        return
      const result = await fetch(`${upstream}${path}${url.search}`, {
        method: request.method,
        headers: { 'content-type': 'application/json' },
        body: raw || undefined,
        signal: AbortSignal.timeout(5_000),
      })
      response.writeHead(result.status, { 'content-type': 'application/json' })
      response.end(await result.text())
    }
    catch {
      response.writeHead(503).end()
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    setBeforeWrite(callback: typeof beforeWrite) { beforeWrite = callback },
    async close() {
      server.close()
      server.closeAllConnections()
      await once(server, 'close')
    },
  }
}

function value<T>(result: HaiResult<T>): T {
  expect(result.success).toBe(true)
  if (!result.success)
    throw new Error(result.error.code)
  return result.data
}

function point(id: string, objectId = 'same-user', vector = [1, 0]): Point {
  const key = createHash('sha256').update(id).digest('hex')
  return {
    id: `${key.slice(0, 8)}-${key.slice(8, 12)}-${key.slice(12, 16)}-${key.slice(16, 20)}-${key.slice(20, 32)}`,
    payload: { objectId, _id: id },
    vector,
  }
}

async function qdrant<T>(url: string, path: string, method = 'GET', data?: object): Promise<T> {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: data && JSON.stringify(data),
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok)
    throw new Error(`Qdrant fixture request failed: ${method} ${path} ${response.status}`)
  return (await response.json() as { result: T }).result
}

async function putPoints(url: string, collection: string, points: Point[]) {
  await qdrant(url, `/collections/${collection}`, 'PUT', {
    vectors: { size: 2, distance: 'Cosine' },
  })
  await qdrant(url, `/collections/${collection}/points?wait=true`, 'PUT', { points })
}

async function pointKeys(url: string, collection: string) {
  const result = await qdrant<{ points: Point[] }>(url, `/collections/${collection}/points/scroll`, 'POST', {
    limit: 1000,
    with_payload: ['_id'],
    with_vector: false,
  })
  return result.points.map(item => item.payload._id).sort()
}

async function ownedResources(run: (context: {
  url: string
  gateway: Awaited<ReturnType<typeof createGateway>>
  nodes: ChildProcess[]
}) => Promise<void>) {
  const qdrant = await acquireQdrantContainer()
  const nodes: ChildProcess[] = []
  let gateway: Awaited<ReturnType<typeof createGateway>> | undefined
  try {
    gateway = await createGateway(qdrant.url)
    await run({ url: qdrant.url, gateway, nodes })
  }
  finally {
    try {
      await gateway?.close()
      const results = await Promise.allSettled(nodes.map(node => stop(node)))
      expect(results.filter(result => result.status === 'rejected')).toEqual([])
    }
    finally {
      await qdrant.release()
    }
  }
}

describe('concurrent native memory initialization on PostgreSQL', () => {
  async function withDatabase(run: (database: ReldbConfigInput) => Promise<void>) {
    const { config, release } = await postgresEnv()
    if (config.type !== 'postgresql')
      throw new Error('Expected a PostgreSQL fixture')
    try {
      value(await reldb.init(config))
      // 子进程只有一个连接，确保拿锁以后不会再从池里借另一条连接来执行 DDL。
      await run({
        ...config,
        pool: { max: 1 },
      })
    }
    finally {
      try {
        value(await reldb.close())
      }
      finally {
        await release?.()
        value(await reldb.init({ type: 'sqlite', database: ':memory:' }))
      }
    }
  }

  async function schemas() {
    return value(await reldb.sql.get<{ namespace: string | null, outbox: string | null, vector_index: string | null }>(`
      SELECT to_regclass('public.hai_ai_memory_vector_namespace')::text AS namespace,
             to_regclass('public.hai_ai_memory_vector_outbox')::text AS outbox,
             to_regclass('public.idx_hai_ai_memory_vector_key')::text AS vector_index
    `))
  }

  it('lets three independent nodes open an empty database through the same schema lock', async () => {
    await withDatabase(async (database) => {
      await ownedResources(async ({ nodes, gateway }) => {
        const blocker = value(await reldb.tx.begin())
        let peers: Promise<PromiseSettledResult<ChildProcess>[]> | undefined
        try {
          value(await blocker.execute('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', ['hai:ai:store-schema']))
          const options = { vectorNamespace: 'pg-concurrent' }
          peers = Promise.allSettled([
            startNode(nodes, database, gateway.url, 'one', options),
            startNode(nodes, database, gateway.url, 'two', options),
            startNode(nodes, database, gateway.url, 'three', options),
          ])
          // 观察数据库中的实际锁排队。放行前三个进程都应已发起 ai.init，且没有部分表可见。
          await expect.poll(async () => {
            const row = value(await reldb.sql.get<{ waiting: string }>(`
              SELECT count(*) AS waiting FROM pg_locks
              WHERE locktype = 'advisory' AND NOT granted
                AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
            `))
            return Number(row?.waiting)
          }, poll).toBe(3)
          expect(await schemas()).toEqual({ namespace: null, outbox: null, vector_index: null })
          value(await blocker.commit())
          const ready = (await peers).map((result) => {
            if (result.status === 'rejected')
              throw result.reason
            return result.value
          })
          const added = value(await call<HaiResult<MemoryEntry>>(ready[0], 'add', { owner: 'common', content: 'Memory from a concurrent node' }))
          await expect.poll(() => call(ready[1], 'get', { owner: 'common', id: added.id }), poll).toMatchObject({
            success: true,
            data: { id: added.id },
          })
          const row = value(await reldb.sql.get<{ count: string }>('SELECT count(*) FROM hai_ai_memory_vector_namespace'))
          expect(Number(row?.count)).toBe(1)
          // 同一个锁也保护 Knowledge 在首次调用时创建的关系表。
          const knowledge = await Promise.all(ready.map((node, index) => call<HaiResult<unknown>>(node, 'prepareKnowledge', { collection: `knowledge-${index}` })))
          expect(knowledge.every(result => result.success)).toBe(true)
          expect(value(await reldb.sql.get('SELECT to_regclass(?)::text AS name', ['public.hai_ai_knowledge_documents']))).toEqual({ name: 'hai_ai_knowledge_documents' })
        }
        finally {
          await blocker.rollback()
          await peers
        }
      })
    })
  }, 120_000)

  it('starts against an initialized schema while a normal memory write holds its transaction open', async () => {
    await withDatabase(async (database) => {
      await ownedResources(async ({ nodes, gateway }) => {
        const options = { vectorNamespace: 'pg-running' }
        const first = await startNode(nodes, database, gateway.url, 'serving', options)
        const saved = value(await call<HaiResult<MemoryEntry>>(first, 'add', { owner: 'common', content: 'Memory while serving' }))
        const writer = value(await reldb.tx.begin())
        let peer: Promise<ChildProcess> | undefined
        try {
          value(await writer.execute('UPDATE hai_ai_memory SET updated_at = updated_at WHERE id = ?', [saved.id]))
          peer = startNode(nodes, database, gateway.url, 'replica', options)
          let initialized = false
          void peer.then(() => {
            initialized = true
          }, () => {})
          // 已有索引无需执行 CREATE INDEX。即使 IF NOT EXISTS，PostgreSQL 仍会取表级 SHARE 锁。
          await expect.poll(() => initialized, { timeout: 5000 }).toBe(true)
          const second = await peer
          expect(value(await call<HaiResult<MemoryEntry[]>>(second, 'list', { owner: 'common' }))).toMatchObject([
            { id: saved.id },
          ])
        }
        finally {
          value(await writer.rollback())
          await peer
        }
      })
    })
  }, 120_000)

  it('rolls back a failed upgrade, preserves existing memory, and retries in the same process', async () => {
    await withDatabase(async (database) => {
      await ownedResources(async ({ url, gateway, nodes }) => {
        const source = forkNode(nodes)
        await call(source, 'initDatabase', { database })
        const legacyMemory = {
          id: 'legacy-after-ddl-failure',
          objectId: 'common',
          content: 'Memory retained across rollback',
          vector: [1, 0],
        }
        value(await call<HaiResult<unknown>>(source, 'seedUpgradeMemories', {
          rows: [legacyMemory],
        }))
        value(await reldb.ddl.raw('CREATE TABLE idx_hai_ai_memory_vector_key (id TEXT)'))
        const input = {
          database,
          url: gateway.url,
          node: 'retriable',
          vectorNamespace: 'pg-upgrade',
        }
        const retrying = forkNode(nodes)
        await expect(call(retrying, 'init', input)).rejects.toThrow(HaiAIError.CONFIGURATION_ERROR.code)
        // 真正的名称冲突不能返回成功，也不能留下本次创建的表与索引。
        expect(await schemas()).toEqual({ namespace: null, outbox: null, vector_index: 'idx_hai_ai_memory_vector_key' })
        expect(value(await reldb.sql.get('SELECT to_regclass(?)::text AS name', ['public.idx_hai_ai_memory_object_id']))).toEqual({ name: null })
        expect(value(await reldb.sql.get('SELECT id FROM hai_ai_memory'))).toEqual({ id: legacyMemory.id })
        expect(gateway.requests.filter(request => request.collection)).toEqual([])
        value(await reldb.ddl.dropTable('idx_hai_ai_memory_vector_key'))
        const [, peer] = await Promise.all([
          call(retrying, 'init', input),
          startNode(nodes, database, gateway.url, 'ready-peer', { vectorNamespace: input.vectorNamespace }),
        ])
        await expect.poll(() => call<NamespaceState>(peer, 'getVectorNamespace'), poll).toMatchObject({ migrated: true })
        expect(value(await call<HaiResult<MemoryEntry>>(retrying, 'get', { owner: 'common', id: legacyMemory.id }))).toMatchObject({ content: legacyMemory.content })
        const target = gateway.requests.find(request => request.points?.some(point => point.payload._id === legacyMemory.id))?.collection
        expect(target).toMatch(/^hai_m_pg-upgrade_[0-9a-f]{32}$/)
        expect(await pointKeys(url, target!)).toEqual([legacyMemory.id])
        expect(value(await reldb.sql.get('SELECT indexname FROM pg_catalog.pg_indexes WHERE tablename = ? AND indexname = ?', ['hai_ai_memory', 'idx_hai_ai_memory_vector_key']))).toEqual({ indexname: 'idx_hai_ai_memory_vector_key' })
      })
    })
  }, 120_000)
})

it('isolates two SQL databases that share Qdrant and choose the same configured namespace', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'native-memory-namespace-'))
  try {
    await ownedResources(async ({ url, gateway, nodes }) => {
      await putPoints(url, legacyCollection, [
        point('legacy-belongs-to-another-app'),
      ])
      const databaseA = {
        type: 'sqlite' as const,
        database: join(directory, 'a.sqlite'),
      }
      const databaseB = {
        type: 'sqlite' as const,
        database: join(directory, 'b.sqlite'),
      }
      const options = { vectorNamespace: 'apps-shared', maxEntriesPerObject: 10 }
      const first = await startNode(nodes, databaseA, gateway.url, 'first', options)
      const second = await startNode(nodes, databaseB, gateway.url, 'second', options)
      const a = value(await call<HaiResult<MemoryEntry>>(first, 'add', { owner: 'same-user', content: 'App A only' }))
      const b = value(await call<HaiResult<MemoryEntry>>(second, 'add', { owner: 'same-user', content: 'App B only' }))
      const writesBy = (node: string) => gateway.requests.find(request => request.node === node && request.points?.length)
      await expect.poll(() => writesBy('first')?.collection, poll).toBeDefined()
      await expect.poll(() => writesBy('second')?.collection, poll).toBeDefined()
      const collectionA = writesBy('first')!.collection!
      const collectionB = writesBy('second')!.collection!
      expect(collectionA).not.toBe(collectionB)
      expect(collectionA).toContain('apps-shared')
      expect(collectionB).toContain('apps-shared')
      expect(collectionA).not.toBe(legacyCollection)
      expect(collectionB).not.toBe(legacyCollection)

      await expect.poll(() => pointKeys(url, collectionA), poll).toEqual([writesBy('first')!.points![0].payload._id])
      await expect.poll(() => pointKeys(url, collectionB), poll).toEqual([writesBy('second')!.points![0].payload._id])
      expect(value(await call<HaiResult<MemoryEntry[]>>(first, 'recall', { owner: 'same-user', content: 'match', topK: 3 }))
        .map(entry => entry.id)).toEqual([a.id])
      expect(value(await call<HaiResult<MemoryEntry[]>>(second, 'recall', { owner: 'same-user', content: 'match', topK: 3 }))
        .map(entry => entry.id)).toEqual([b.id])

      const deletedRevision = point('deleted-app-a-revision')
      await qdrant(url, `/collections/${collectionA}/points?wait=true`, 'PUT', {
        points: [deletedRevision],
      })
      expect(await pointKeys(url, collectionA)).toContain(deletedRevision.payload._id)
      await expect.poll(() => pointKeys(url, collectionA), poll).toEqual([writesBy('first')!.points![0].payload._id])
      expect(await pointKeys(url, collectionB)).toEqual([writesBy('second')!.points![0].payload._id])

      value(await call<HaiResult<void>>(first, 'clear', { owner: 'same-user' }))
      await expect.poll(() => pointKeys(url, collectionA), poll).toEqual([])
      expect(await pointKeys(url, collectionB)).toEqual([writesBy('second')!.points![0].payload._id])
      expect(await pointKeys(url, legacyCollection)).toEqual(['legacy-belongs-to-another-app'])
      expect(gateway.requests.filter(request => request.collection === legacyCollection)).toEqual([])
      expect(gateway.requests.filter(request => request.node === 'first' && request.collection === collectionB)).toEqual([])
      expect(gateway.requests.filter(request => request.node === 'second' && request.collection === collectionA)).toEqual([])

      await stop(second)
      const restarted = await startNode(nodes, databaseB, gateway.url, 'restarted', options)
      expect(value(await call<HaiResult<MemoryEntry>>(restarted, 'get', { owner: 'same-user', id: b.id })).content).toBe('App B only')
      expect(value(await call<HaiResult<MemoryEntry[]>>(restarted, 'recall', { owner: 'same-user', content: 'match', topK: 3 }))
        .map(entry => entry.id)).toEqual([b.id])
      expect(gateway.requests.filter(request => request.node === 'restarted' && request.collection).every(request => request.collection === collectionB)).toBe(true)
      await expect(startNode(nodes, databaseB, gateway.url, 'mismatched', { vectorNamespace: 'wrong-app' })).rejects.toThrow(HaiAIError.CONFIGURATION_ERROR.code)
      expect(gateway.requests.filter(request => request.node === 'mismatched' && request.collection)).toEqual([])
    })
  }
  finally {
    await rm(directory, { force: true, recursive: true })
  }
}, 120_000)

interface NamespaceState {
  namespace: string
  owner: string
  cursor?: string
  migrated?: boolean
}

describe.each([
  ['PostgreSQL', postgresEnv],
  ['MySQL', mysqlEnv],
] as const)('native memory namespace upgrade with %s', (_name, database) => {
  it('rebuilds old memories from SQL and resumes a killed migration on another node', async () => {
    const { config, release } = await database()
    const pause = Promise.withResolvers<void>()
    try {
      await ownedResources(async ({ url, gateway, nodes }) => {
        const rows = Array.from({ length: 135 }, (_, index) => {
          const suffix = String(index).padStart(4, '0')
          return {
            id: `legacy-memory-${suffix}`,
            objectId: 'same-user',
            content: `Canonical SQL memory ${suffix}`,
            vector: index === 4
              ? undefined
              : [0, 1],
            vectorId: index === 0
              ? undefined
              : `legacy-revision-${suffix}`,
          }
        })
        const source = forkNode(nodes)
        await call(source, 'initDatabase', { database: config })
        value(await call<HaiResult<unknown>>(source, 'seedUpgradeMemories', { rows }))

        // 旧集合缺少大部分有效点，且含其他应用的点。SQL 仍是完整数据源。
        const oldKeys = ['legacy-memory-0000', 'legacy-revision-0001', 'foreign-application-vector']
        await putPoints(url, legacyCollection, oldKeys.map(id => point(id)))
        const migrationWrites = (node: string) => gateway.requests.filter(request => request.node === node && request.points?.length)
        let firstWrite: VectorRequest | undefined
        let blocked: VectorRequest | undefined
        gateway.setBeforeWrite((request) => {
          if (!request.points?.length || blocked)
            return
          if (!firstWrite) {
            firstWrite = request
            return
          }
          blocked = request
          return pause.promise
        })
        const options = { vectorNamespace: 'upgrade-app', maxEntriesPerObject: 200 }
        const [nodeA, nodeB] = await Promise.all([
          startNode(nodes, config, gateway.url, 'migration-a', options),
          startNode(nodes, config, gateway.url, 'migration-b', options),
        ])
        await expect.poll(() => blocked?.collection, poll).toBeDefined()
        const owner = blocked!.node
        const standby = owner === 'migration-a'
          ? 'migration-b'
          : 'migration-a'
        const first = owner === 'migration-a'
          ? nodeA
          : nodeB
        const second = owner === 'migration-a'
          ? nodeB
          : nodeA
        const target = blocked!.collection!
        expect(target).toMatch(/^hai_m_upgrade-app_[0-9a-f]{32}$/)
        const firstBatch = firstWrite!.points!
        expect(firstBatch.length).toBeGreaterThan(1)
        expect(firstBatch.map(vector => vector.payload._id)).toContain('legacy-memory-0000')
        expect(firstBatch.map(vector => vector.payload._id)).toContain('legacy-revision-0001')
        expect(firstBatch.map(vector => vector.payload._id)).not.toContain('legacy-revision-0004')
        expect(firstBatch.find(vector => vector.payload._id === 'legacy-revision-0001')?.vector).toEqual([0, 1])
        const pending = await call<NamespaceState>(source, 'getVectorNamespace')
        expect(pending.namespace).toBe('upgrade-app')
        expect(pending.cursor).toBeDefined()
        expect(pending.migrated).not.toBe(true)

        const changed = rows.at(-1)!
        const updatesStart = migrationWrites(standby).length
        const updated = value(await call<HaiResult<MemoryEntry>>(second, 'update', {
          owner: changed.objectId,
          id: changed.id,
          content: 'Updated by another node during migration',
        }))
        const writesWhileBlocked = () => migrationWrites(standby).slice(updatesStart)
        const updatedWrite = () => writesWhileBlocked().find(request => request.points?.some(vector => !vector.payload._id.startsWith('legacy-')))
        await expect.poll(() => updatedWrite()?.collection, poll).toBe(target)
        expect(writesWhileBlocked().every(request => request.points!.every(vector => !vector.payload._id.startsWith('legacy-')))).toBe(true)

        await stop(first, true)
        pause.resolve()
        const takeoverStart = migrationWrites(standby).length
        value(await call<HaiResult<unknown>>(source, 'expireVectorMigration'))
        await expect.poll(async () => (await call<NamespaceState>(source, 'getVectorNamespace')).migrated, poll).toBe(true)
        const resumed = migrationWrites(standby).slice(takeoverStart).find(request => request.points?.some(vector => vector.payload._id.startsWith('legacy-')))
        expect(resumed?.collection).toBe(target)
        expect(resumed?.points?.map(vector => vector.payload._id)).toEqual(blocked!.points!.map(vector => vector.payload._id))

        const expected = rows.filter(row => row.vector && row.id !== changed.id).map(row => row.vectorId ?? row.id)
        expected.push(updatedWrite()!.points![0].payload._id)
        await expect.poll(() => pointKeys(url, target), poll).toEqual(expected.sort())
        expect(await pointKeys(url, legacyCollection)).toEqual(oldKeys.sort())
        expect(gateway.requests.filter(request => request.collection === legacyCollection)).toEqual([])
        await expect.poll(() => call(second, 'countVectorJobs'), poll).toMatchObject({ success: true, data: 0 })

        await stop(second)
        const restarted = await startNode(nodes, config, gateway.url, 'restarted', options)
        expect(value(await call<HaiResult<MemoryEntry>>(restarted, 'get', { owner: changed.objectId, id: updated.id })).content).toBe(updated.content)
        expect(value(await call<HaiResult<MemoryEntry>>(restarted, 'get', { owner: 'same-user', id: rows[0].id })).content).toBe(rows[0].content)
        const state = await call<NamespaceState>(source, 'getVectorNamespace')
        expect(state).toMatchObject({ namespace: pending.namespace, owner: pending.owner, migrated: true })
        expect(migrationWrites('restarted')).toEqual([])
      })
    }
    finally {
      pause.resolve()
      await release?.()
    }
  }, 120_000)
})
