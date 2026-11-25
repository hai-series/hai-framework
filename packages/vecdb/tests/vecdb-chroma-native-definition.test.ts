/** 通过真实 SDK 和服务核对原生 Chroma 集合的持久维度、距离空间与身份。 */
import type { StartedTestContainer } from 'testcontainers'
import { ChromaClient, Schema, VectorIndexConfig } from 'chromadb'
import { GenericContainer, Wait } from 'testcontainers'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { HaiVecdbError, vecdb } from '../src/index.js'

const tenant = 'default_tenant'
const database = 'default_database'
const token = 'fixture-native-definition-bearer'
let container: StartedTestContainer | undefined
let chroma: ChromaClient
let url: string

beforeAll(async () => {
  container = await new GenericContainer('docker.io/chromadb/chroma:1.5.5')
    .withExposedPorts(8000)
    .withWaitStrategy(Wait.forHttp('/api/v2/heartbeat', 8000).forStatusCode(200))
    .withStartupTimeout(120_000)
    .start()
  const endpoint = {
    host: container.getHost(),
    port: container.getMappedPort(8000),
    ssl: false,
  }
  url = `http://${endpoint.host}:${endpoint.port}`
  chroma = new ChromaClient({ ...endpoint, tenant, database })
}, 150_000)

beforeEach(async () => {
  expect(await vecdb.init({
    type: 'chroma',
    url,
    apiKey: token,
  })).toEqual({ success: true })
})

afterEach(async () => {
  try {
    await vecdb.close()
  }
  finally {
    vi.restoreAllMocks()
  }
})

afterAll(async () => {
  await container?.stop()
}, 30_000)

it('reads a native default L2 collection before write, after write and after deleting its final row', async () => {
  const name = 'native-default-l2'
  const collection = await chroma.createCollection({ name, embeddingFunction: null })
  const received: Array<string | null> = []
  const requestFromServer = globalThis.fetch.bind(globalThis)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init)
    if (request.method === 'GET' && new URL(request.url).pathname.endsWith(`/collections/${name}`)) {
      expect(new URL(request.url).pathname).toBe(`/api/v2/tenants/${tenant}/databases/${database}/collections/${name}`)
      received.push(request.headers.get('authorization'))
    }
    return requestFromServer(request)
  })

  expect(await vecdb.collection.info(name)).toEqual({
    success: true,
    data: {
      name,
      dimension: 0,
      metric: 'euclidean',
      count: 0,
    },
  })
  expect(received).toEqual([`Bearer ${token}`, `Bearer ${token}`])
  await collection.add({
    ids: ['one'],
    embeddings: [
      [1, 0, 0],
    ],
  })
  expect(await vecdb.collection.info(name)).toEqual({
    success: true,
    data: {
      name,
      dimension: 3,
      metric: 'euclidean',
      count: 1,
    },
  })
  expect(await vecdb.vector.search(name, [1, 2, 0], { minScore: 0.1 })).toMatchObject({
    success: true,
    data: [
      { id: 'one', score: 0.2 },
    ],
  })
  expect(await vecdb.vector.search(name, [1, 2])).toMatchObject({
    success: false,
    error: { code: HaiVecdbError.DIMENSION_MISMATCH.code },
  })
  await collection.delete({
    ids: ['one'],
  })
  expect(await vecdb.collection.info(name)).toEqual({
    success: true,
    data: {
      name,
      dimension: 3,
      metric: 'euclidean',
      count: 0,
    },
  })
})

it.each([
  ['cosine', 'cosine'],
  ['euclidean', 'l2'],
  ['dot', 'ip'],
] as const)('persists the %s metric in the native HNSW configuration', async (metric, space) => {
  const name = `native-configuration-${metric}`
  expect(await vecdb.collection.create(name, { dimension: 2, metric })).toEqual({ success: true })
  const collection = await chroma.getCollection({ name, embeddingFunction: null })
  expect(collection.configuration?.hnsw?.space).toBe(space)
  expect(collection.metadata ?? {}).not.toHaveProperty('hnsw:space')
  expect(await vecdb.collection.info(name)).toMatchObject({
    success: true,
    data: { dimension: 2, metric, count: 0 },
  })
})

it('keeps unmarked vectors visible and excludes them from metadata filters before selecting topK', async () => {
  const name = 'native-metadata-visibility'
  const collection = await chroma.createCollection({ name, embeddingFunction: null })
  await collection.add({
    ids: ['native'],
    embeddings: [
      [1, 0],
    ],
    metadatas: [
      { _content: 'existing body', status: 'native' },
    ],
  })
  expect(await vecdb.vector.insert(name, [
    {
      id: 'managed',
      vector: [0, 1],
      metadata: { status: 'managed' },
    },
  ])).toEqual({ success: true })

  expect(await vecdb.vector.search(name, [1, 0], { topK: 1, filter: {} })).toEqual({
    success: true,
    data: [
      {
        id: 'native',
        score: 1,
        content: 'existing body',
        metadata: undefined,
      },
    ],
  })
  expect(await vecdb.vector.search(name, [1, 0], {
    topK: 1,
    filter: { status: 'native' },
  })).toEqual({ success: true, data: [] })
  expect(await vecdb.vector.search(name, [1, 0], {
    topK: 1,
    filter: {
      status: { $ne: 'unmatched' },
    },
  })).toMatchObject({
    success: true,
    data: [
      {
        id: 'managed',
        metadata: { status: 'managed' },
      },
    ],
  })
  expect(await vecdb.vector.search(name, [1, 0], {
    filter: {
      $or: [
        {
          status: { $ne: 'native' },
        },
        {
          status: { $invalid: 'managed' },
        },
      ],
    },
  })).toMatchObject({
    success: false,
    error: { code: HaiVecdbError.QUERY_FAILED.code },
  })

  expect(await vecdb.vector.upsert(name, [
    {
      id: 'native',
      vector: [1, 0],
      content: 'existing body',
      metadata: { source: 'imported' },
    },
  ])).toEqual({ success: true })
  expect(await vecdb.vector.search(name, [1, 0], {
    topK: 1,
    filter: { source: 'imported' },
  })).toMatchObject({
    success: true,
    data: [
      {
        id: 'native',
        content: 'existing body',
        metadata: { source: 'imported' },
      },
    ],
  })
  const persisted = await collection.get({
    ids: ['native'],
    include: ['metadatas'],
  })
  expect(persisted.metadatas[0]).toMatchObject({ status: 'native' })
  expect(await vecdb.vector.search(name, [1, 0], {
    topK: 1,
    filter: { status: 'native' },
  })).toEqual({ success: true, data: [] })
})

it('uses a native schema inner product space when normalizing scores', async () => {
  const name = 'native-inner-product'
  const schema = new Schema().createIndex(new VectorIndexConfig({ space: 'ip' }))
  const collection = await chroma.createCollection({ name, schema, embeddingFunction: null })
  await collection.add({
    ids: ['one'],
    embeddings: [
      [3, 0],
    ],
  })
  expect(await vecdb.collection.info(name)).toMatchObject({
    success: true,
    data: { dimension: 2, metric: 'dot' },
  })
  expect(await vecdb.vector.search(name, [1, 0], { minScore: 0.9 })).toMatchObject({
    success: true,
    data: [
      { id: 'one', score: 1 / (1 + Math.exp(-3)) },
    ],
  })
})

it('discards a native definition from a replacement collection with the same name', async () => {
  const name = 'native-recreated'
  const old = await chroma.createCollection({ name, embeddingFunction: null })
  await old.add({
    ids: ['old'],
    embeddings: [
      [1, 0],
    ],
  })

  let reads = 0
  const requestFromServer = globalThis.fetch.bind(globalThis)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init)
    if (request.method === 'GET' && new URL(request.url).pathname.endsWith(`/collections/${name}`) && ++reads === 2) {
      await chroma.deleteCollection({ name })
      const replacement = await chroma.createCollection({ name, embeddingFunction: null })
      expect(replacement.id).not.toBe(old.id)
      await replacement.add({
        ids: ['replacement'],
        embeddings: [
          [1, 0, 0],
        ],
      })
    }
    return requestFromServer(request)
  })
  expect(await vecdb.collection.info(name)).toMatchObject({
    success: false,
    error: { code: HaiVecdbError.COLLECTION_NOT_FOUND.code },
  })
  expect(await vecdb.collection.info(name)).toMatchObject({
    success: true,
    data: { dimension: 3, count: 1 },
  })
})
