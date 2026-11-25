/** 用真实 pgvector 核对集合发布、search_path 和空闲连接故障恢复。 */
import type { PgvectorContainerLease } from './helpers/pgvector-container.js'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { Pool } from 'pg'
import { build } from 'tsup'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { HaiVecdbError, vecdb } from '../src/index.js'
import { acquirePgvectorContainer } from './helpers/pgvector-container.js'

let lease: PgvectorContainerLease
let observer: Pool

beforeAll(async () => {
  lease = await acquirePgvectorContainer()
  observer = new Pool(lease)
}, 120_000)

afterEach(async () => {
  await vecdb.close()
})

afterAll(async () => {
  try {
    await observer?.end()
  }
  finally {
    await lease?.release()
  }
})

it('rolls back failed index creation and publishes each collection exactly once', async () => {
  expect(await vecdb.init({ ...lease, type: 'pgvector', tablePrefix: 'release_' })).toEqual({ success: true })
  expect(await vecdb.collection.create('docs', { dimension: 3072 })).toMatchObject({
    success: false,
    error: { code: HaiVecdbError.QUERY_FAILED.code },
  })
  expect(await vecdb.collection.exists('docs')).toEqual({ success: true, data: false })
  expect(await vecdb.collection.list()).toEqual({ success: true, data: [] })

  const results = await Promise.all(Array.from({ length: 4 }, () =>
    vecdb.collection.create('docs', { dimension: 3, metric: 'euclidean' })))
  expect(results.filter(result => result.success)).toHaveLength(1)
  expect(results.filter(result => !result.success).map(result => result.error.code))
    .toEqual(Array.from({ length: 3 }).fill(HaiVecdbError.COLLECTION_ALREADY_EXISTS.code))
  expect(await vecdb.collection.info('docs')).toEqual({
    success: true,
    data: {
      name: 'docs',
      count: 0,
      dimension: 3,
      metric: 'euclidean',
    },
  })
})

it('requires a valid persisted pgvector metric even when a distance index exists', async () => {
  expect(await vecdb.init({
    ...lease,
    type: 'pgvector',
    tablePrefix: 'metric_probe_',
    metric: 'dot',
  })).toEqual({ success: true })
  expect(await vecdb.collection.create('docs', { dimension: 2, metric: 'euclidean' })).toEqual({ success: true })
  expect(await vecdb.vector.insert('docs', [
    {
      id: 'first',
      vector: [1, 0],
    },
  ])).toEqual({ success: true })
  expect(await vecdb.collection.info('docs')).toMatchObject({
    success: true,
    data: { metric: 'euclidean' },
  })
  expect(await vecdb.vector.search('docs', [1, 0])).toMatchObject({
    success: true,
    data: [
      { id: 'first' },
    ],
  })

  const indexes = await observer.query<{ count: number }>(`
    SELECT count(*)::int AS count FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'metric_probe_docs' AND indexdef LIKE '%vector_l2_ops%'
  `)
  expect(indexes.rows[0].count).toBe(1)
  const invalid = {
    success: false,
    error: { code: HaiVecdbError.CONFIG_ERROR.code },
  }
  for (const statement of [
    'COMMENT ON COLUMN metric_probe_docs.vector IS NULL',
    'COMMENT ON COLUMN metric_probe_docs.vector IS \'an unrelated column comment\'',
    'COMMENT ON COLUMN metric_probe_docs.vector IS \'hai.vecdb.metric=invalid\'',
  ]) {
    await observer.query(statement)
    expect(await vecdb.collection.info('docs')).toMatchObject(invalid)
    expect(await vecdb.vector.search('docs', [1, 0])).toMatchObject(invalid)
  }
})

it('resolves physical tables along search_path and interprets the prefix literally', async () => {
  expect(await vecdb.init({ ...lease, type: 'pgvector' })).toEqual({ success: true })
  expect(await vecdb.collection.create('legacy', { dimension: 2 })).toEqual({ success: true })
  await vecdb.close()
  await observer.query(`
    CREATE SCHEMA vec_path;
    CREATE SCHEMA vec_hidden;
    CREATE TABLE vec_hidden.vec_hidden_only (id text);
    CREATE TABLE public.vecxunrelated (id text);
  `)
  const url = new URL('postgresql://localhost')
  url.hostname = lease.host
  url.port = String(lease.port)
  url.username = lease.user
  url.password = lease.password
  url.pathname = lease.database
  url.searchParams.set('options', '-c search_path=vec_path,public')
  expect(await vecdb.init({ type: 'pgvector', database: lease.database, url: url.href })).toEqual({ success: true })
  expect(await vecdb.collection.exists('hidden_only')).toEqual({ success: true, data: false })
  expect(await vecdb.collection.create('hidden_only', { dimension: 2 })).toEqual({ success: true })
  expect(await vecdb.collection.list()).toEqual({
    success: true,
    data: ['hidden_only', 'legacy'],
  })
  expect(await vecdb.collection.create('legacy', { dimension: 2 })).toMatchObject({
    success: false,
    error: { code: HaiVecdbError.COLLECTION_ALREADY_EXISTS.code },
  })
  expect(await vecdb.vector.upsert('legacy', [
    {
      id: 'existing',
      vector: [1, 0],
    },
  ])).toEqual({ success: true })
  expect(await vecdb.vector.scan('legacy')).toEqual({
    success: true,
    data: {
      items: [
        { id: 'existing' },
      ],
    },
  })
  expect((await observer.query<{ name: string }>(
    'SELECT pg_catalog.to_regclass(\'vec_path.vec_hidden_only\')::text AS name',
  )).rows[0]?.name).toBe('vec_path.vec_hidden_only')
})

it('rejects names exceeding the physical identifier byte limit before they can alias existing tables', async () => {
  expect(await vecdb.init({ ...lease, type: 'pgvector' })).toEqual({ success: true })
  const boundary = `${'界'.repeat(19)}qq`
  const overlong = `${boundary}x`
  expect(await vecdb.collection.create(boundary, { dimension: 2 })).toEqual({ success: true })
  const invalid = {
    success: false,
    error: { code: HaiVecdbError.CONFIG_ERROR.code },
  }
  expect(await vecdb.collection.create(overlong, { dimension: 2 })).toMatchObject(invalid)
  expect(await vecdb.collection.exists(overlong)).toMatchObject(invalid)
  expect(await vecdb.vector.count(overlong)).toMatchObject(invalid)
  expect(await vecdb.collection.drop(overlong)).toMatchObject(invalid)
  expect(await vecdb.collection.exists(boundary)).toEqual({ success: true, data: true })
})

it('accepts identifiers that fit the database encoding', async () => {
  await observer.query('CREATE DATABASE vecdb_latin1 WITH TEMPLATE template0 ENCODING \'LATIN1\' LOCALE \'C\'')
  expect(await vecdb.init({ ...lease, type: 'pgvector', database: 'vecdb_latin1' })).toEqual({ success: true })
  const boundary = 'é'.repeat(59)
  expect(await vecdb.collection.create(boundary, { dimension: 2 })).toEqual({ success: true })
  expect(await vecdb.collection.list()).toEqual({
    success: true,
    data: [boundary],
  })
  expect(await vecdb.collection.drop(`${boundary}é`)).toMatchObject({
    success: false,
    error: { code: HaiVecdbError.CONFIG_ERROR.code },
  })
  expect(await vecdb.collection.exists(boundary)).toEqual({ success: true, data: true })
})

it('keeps an application process alive when the server closes its idle connection', async () => {
  const temporaryRoot = path.resolve(import.meta.dirname, '../../../tmp')
  await mkdir(temporaryRoot, { recursive: true })
  const directory = await mkdtemp(path.join(temporaryRoot, 'vecdb-pg-idle-'))
  let child: ReturnType<typeof fork> | undefined
  let closed: Promise<number | null> | undefined
  try {
    await build({
      config: false,
      entry: {
        index: path.resolve(import.meta.dirname, '../src/index.ts'),
      },
      outDir: directory,
      format: ['esm'],
      platform: 'node',
      external: [
        '@h-ai/core',
        '@lancedb/lancedb',
        'chromadb',
        'pg',
        'zod',
      ],
      silent: true,
    })
    const worker = path.join(directory, 'worker.mjs')
    await writeFile(worker, `
import { core } from '@h-ai/core'

core.logger.configure({ format: 'json' })
const { vecdb } = await import(${JSON.stringify(pathToFileURL(path.join(directory, 'index.js')).href)})
const initialized = await vecdb.init(JSON.parse(process.argv[2]))
if (!initialized.success) throw new Error(initialized.error.message)
process.on('message', async () => {
  process.send(await vecdb.collection.list())
  const closed = await vecdb.close()
  if (!closed.success) throw new Error(closed.error.message)
  process.disconnect()
})
process.send('ready')
`)
    child = fork(worker, [
      JSON.stringify({ ...lease, type: 'pgvector', tablePrefix: 'idle_' }),
    ], {
      env: { ...process.env, PGAPPNAME: 'vecdb-idle-regression' },
      silent: true,
      timeout: 25_000,
    })
    closed = new Promise(resolve => child!.once('close', resolve))
    let output = ''
    child.stdout?.on('data', chunk => output += chunk.toString())
    child.stderr?.on('data', chunk => output += chunk.toString())
    function nextMessage() {
      return Promise.race([
        once(child!, 'message').then(([message]) => message as unknown),
        closed!.then((code) => { throw new Error(`pgvector subprocess exited before replying (${code}): ${output}`) }),
      ])
    }
    expect(await nextMessage()).toBe('ready')

    const idle = await observer.query<{ pid: number }>(
      'SELECT pid FROM pg_stat_activity WHERE application_name = $1 AND state = \'idle\'',
      ['vecdb-idle-regression'],
    )
    expect(idle.rows).toHaveLength(1)
    expect((await observer.query<{ terminated: boolean }>(
      'SELECT pg_terminate_backend($1) AS terminated',
      [idle.rows[0].pid],
    )).rows[0]?.terminated).toBe(true)

    await vi.waitFor(() => {
      expect(child?.exitCode, output).toBeNull()
      expect(output).toContain('PostgreSQL idle connection error')
    }, { timeout: 5_000 })
    const probed = nextMessage()
    child.send('probe')
    expect(await probed).toEqual({ success: true, data: [] })
    expect(await closed, output).toBe(0)
    expect(output).not.toContain(lease.password)
    expect(output).not.toContain('terminating connection due to administrator command')
  }
  finally {
    if (child?.exitCode === null)
      child.kill()
    await closed
    await rm(directory, { recursive: true, force: true })
  }
}, 60_000)
