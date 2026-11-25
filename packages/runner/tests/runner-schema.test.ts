import { fork } from 'node:child_process'
import { once } from 'node:events'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { reldb } from '@h-ai/reldb'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { HaiRunnerError, runner } from '../src/index.js'

let database: Awaited<ReturnType<typeof postgresEnv>>
const scope = { tenantId: 'runner-schema-test', userId: 'owner' }
const lock = 'hai:runner:schema'

beforeAll(async () => {
  database = await postgresEnv()
  expect((await reldb.init(database.config)).success).toBe(true)
}, 120_000)

afterEach(async () => {
  for (const name of [
    'hai_runner_events',
    'hai_runner_executions',
    'hai_runner_gate',
    'hai_runner_event_cursor_idx',
  ])
    expect((await reldb.ddl.dropTable(name)).success).toBe(true)
})

afterAll(async () => {
  try {
    await reldb.close()
  }
  finally {
    await database?.release?.()
  }
})

function startNode(nodeId: string) {
  const child = fork(fileURLToPath(new URL('./fixtures/runner-schema-node.mjs', import.meta.url)), [], {
    env: {
      ...process.env,
      HAI_TEST_RUNNER_SCHEMA: JSON.stringify({
        database: {
          ...database.config,
          pool: { max: 1 },
        },
        nodeId,
      }),
    },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  })
  const ready = once(child, 'message', {
    signal: AbortSignal.timeout(7000),
  })
  const exit = once(child, 'exit')
  return {
    async init() {
      expect((await ready)[0]).toEqual({ ready: true })
      const answer = once(child, 'message', {
        signal: AbortSignal.timeout(10_000),
      })
      child.send('init')
      return (await answer)[0]
    },
    async close() {
      if (child.connected)
        child.send('close')
      const timer = setTimeout(() => child.kill('SIGKILL'), 2000)
      try {
        await exit
      }
      finally {
        clearTimeout(timer)
      }
    },
  }
}

it('coordinates independent nodes on an empty PostgreSQL database', async () => {
  const transaction = await reldb.tx.begin()
  if (!transaction.success)
    throw new Error(transaction.error.message)
  const nodes = [
    startNode('first'),
    startNode('second'),
    startNode('third'),
  ]
  const held = transaction.data
  let pending: Promise<unknown[]> | undefined
  try {
    expect((await held.execute('SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(?, 0))', [lock])).success).toBe(true)
    pending = Promise.all(nodes.map(node => node.init()))
    void pending.catch(() => {})
    await vi.waitFor(async () => {
      const found = await reldb.sql.get<{ count: string }>(`SELECT count(*) AS count FROM pg_catalog.pg_locks WHERE locktype = 'advisory' AND NOT granted`)
      expect(found.success && Number(found.data?.count)).toBe(3)
    }, { timeout: 4000 })
    expect((await held.commit()).success).toBe(true)
    expect(await pending).toEqual([
      { success: true },
      { success: true },
      { success: true },
    ])
    const columns = await reldb.schemaColumns('hai_runner_executions')
    expect(columns.success && columns.data).toEqual(expect.arrayContaining(['event_bytes', 'owner_process_json']))
    expect((await reldb.sql.get('SELECT id FROM hai_runner_gate')).success).toBe(true)
  }
  finally {
    await held.rollback()
    await pending?.catch(() => {})
    await Promise.all(nodes.map(node => node.close()))
  }
}, 20_000)

it('rejects an execution table missing required columns without changing it', async () => {
  const node = runner.create()
  const required = ['event_bytes', 'owner_process_json']
  try {
    expect((await node.init({ nodeId: 'schema-mismatch', executor: false })).success).toBe(true)
    expect((await node.close()).success).toBe(true)
    for (const column of required)
      expect((await reldb.ddl.dropColumn('hai_runner_executions', column)).success).toBe(true)

    expect(await node.init({ nodeId: 'schema-mismatch', executor: false })).toMatchObject({
      success: false,
      error: { code: HaiRunnerError.UNAVAILABLE.code },
    })
    const columns = await reldb.schemaColumns('hai_runner_executions')
    expect(columns.success).toBe(true)
    if (columns.success)
      expect(columns.data.filter(column => required.includes(column))).toEqual([])
  }
  finally {
    await node.close()
  }
})

it('rolls back incomplete initialization and retries on the same instance', async () => {
  const node = runner.create()
  try {
    expect((await reldb.sql.execute('CREATE TABLE hai_runner_event_cursor_idx (unrelated TEXT)')).success).toBe(true)
    expect((await node.init({ nodeId: 'retry', executor: false })).success).toBe(false)
    const state = await reldb.sql.get<{ present: boolean }>(`SELECT to_regclass('hai_runner_executions') IS NOT NULL AS present`)
    expect(state.success && state.data?.present).toBe(false)
    expect((await reldb.ddl.dropTable('hai_runner_event_cursor_idx')).success).toBe(true)
    expect((await node.init({ nodeId: 'retry', executor: false })).success).toBe(true)
    expect((await node.submit({ scope, kind: 'test', input: null })).success).toBe(true)
  }
  finally {
    await node.close()
  }
}, 15_000)
