import { randomUUID } from 'node:crypto'
import { ai } from '@h-ai/ai'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addResource, findTask, initWorkspace, insertTask, listResources, listTasks, owner, reserveTurn, resource, withTask, writeTask, writeTurn } from '#lib/server/data.js'
import { allowedTool } from '#lib/server/resources.js'
import { contextSummary, view } from '#lib/server/workspace.js'
import { sendSchema, settingsSchema } from '#lib/workspace.js'

beforeEach(async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await initWorkspace()).success).toBe(true)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await reldb.close()
})

it('finds historical tasks and pages equal timestamps within the selected account and archive', async () => {
  const scope = { tenantId: 'workspace', userId: 'alice' }
  const user = owner(scope)
  const settings = settingsSchema.parse({})
  const keys = Array.from({ length: 105 }, () => randomUUID()).sort().reverse()
  const insert = async (ownerKey: string, key: string, stamp: number, title: string, archived = false) => {
    const data = {
      id: key,
      title,
      archived,
      settings,
      acpId: 'internal-session',
      generation: 0,
      carry: false,
      startedAt: stamp,
    }
    expect((await reldb.sql.execute('INSERT INTO hai_agent_tasks (id, owner, updated_at, data) VALUES (?, ?, ?, ?)', [
      key,
      ownerKey,
      stamp,
      JSON.stringify(data),
    ])).success).toBe(true)
  }
  for (const [index, key] of keys.entries()) {
    await insert(user, key, 1_700_000_000_000, index === 104
      ? 'Ältere Aufgabe 100%'
      : 'Recent task')
  }
  const archived = randomUUID()
  await insert(user, archived, 1_700_000_000_000, 'Ältere archived 100%', true)
  await insert(owner({ ...scope, userId: 'other' }), randomUUID(), 1_700_000_000_000, 'Ältere private 100%')
  await insert(owner({ ...scope, tenantId: 'other' }), randomUUID(), 1_700_000_000_000, 'Ältere other tenant 100%')

  const first = await listTasks(user)
  expect(first.items.map(item => item.id)).toEqual(keys.slice(0, 100))
  expect(first.nextCursor).toBeDefined()
  const older = await listTasks(user, { cursor: first.nextCursor })
  expect(older.items.map(item => item.id)).toEqual(keys.slice(100))
  expect(older.nextCursor).toBeUndefined()
  expect((await listTasks(user, { query: ' äLTeRE ' })).items.map(item => item.id)).toEqual(keys.slice(-1))
  expect((await listTasks(user, { query: '100%', archived: true })).items.map(item => item.id)).toEqual([archived])
  expect(first.items[0]).not.toHaveProperty('acpId')
  await expect(listTasks(user, { cursor: 'invalid' })).rejects.toMatchObject({ status: 400 })
})

it.each(['file', 'artifact'] as const)('pages owned %s resources without omissions on equal timestamps', async (kind) => {
  const keys = Array.from({ length: 101 }, () => randomUUID()).sort().reverse()
  for (const key of keys) {
    const entry = { id: key, title: key, kind }
    expect((await reldb.sql.execute('INSERT INTO hai_agent_resources (id, owner, kind, created_at, data) VALUES (?, ?, ?, ?, ?)', [
      key,
      'alice',
      kind,
      1_700_000_000_000,
      JSON.stringify(entry),
    ])).success).toBe(true)
  }
  const first = await listResources('alice', kind)
  expect(first.items.map(item => item.id)).toEqual(keys.slice(0, 100))
  expect(first.nextCursor).toBeDefined()
  expect((await listResources('alice', kind, first.nextCursor)).items.map(item => item.id)).toEqual(keys.slice(100))
  expect((await listResources('bob', kind, first.nextCursor)).items).toEqual([])
})

it('authorizes an MCP wrapper by the single task tool name and checks file ownership', async () => {
  const scope = { tenantId: 'agent', userId: 'alice' }
  const user = owner(scope)
  vi.spyOn(core.config, 'get').mockReturnValue({
    tools: [
      {
        id: 'search',
        serviceId: 'search-provider',
        tool: 'search',
        description: 'Search',
        inputSchema: {},
        fileArguments: ['fileId'],
      },
    ],
  })
  const task = await insertTask(user, randomUUID(), settingsSchema.parse({
    tools: ['mcp_search'],
  }))
  await writeTask(user, { ...task, acpId: 'session' })
  const file = await addResource(user, {
    id: randomUUID(),
    title: 'input.txt',
    kind: 'file',
  })
  expect(await allowedTool(scope, 'session', 'search-provider', 'search', { fileId: file.id })).toBe(true)
  const other = await addResource('someone-else', {
    id: randomUUID(),
    title: 'private.txt',
    kind: 'file',
  })
  expect(await allowedTool(scope, 'session', 'search-provider', 'search', { fileId: other.id })).toBe(false)
  expect(await allowedTool({ ...scope, userId: 'bob' }, 'session', 'search-provider', 'search', { fileId: file.id })).toBe(false)
})

it('reserves only one active round and deduplicates a retry from the owner', async () => {
  const task = await insertTask('alice', randomUUID(), settingsSchema.parse({ agentId: 'test-model' }))
  const round = sendSchema.parse({
    type: 'send',
    task: task.id,
    turn: randomUUID(),
    text: 'summarize',
  })
  expect((await reserveTurn('alice', round)).turn.status).toBe('submitting')
  expect((await reserveTurn('alice', round)).turn.id).toBe(round.turn)
  await expect(reserveTurn('alice', {
    ...round,
    turn: randomUUID(),
  })).rejects.toMatchObject({ status: 409 })
  await expect(reserveTurn('alice', { ...round, text: 'different payload' })).rejects.toMatchObject({ status: 409 })
  await expect(reserveTurn('bob', {
    ...round,
    turn: randomUUID(),
  })).rejects.toMatchObject({ status: 404 })
  expect((await findTask('alice', task.id)).title).toBe('summarize')
})

it('only returns owned resources and rolls back failed task transactions', async () => {
  const entry = await addResource('alice', {
    id: randomUUID(),
    kind: 'file',
    title: 'notes.txt',
  })
  expect(await resource('alice', entry.id)).toEqual(entry)
  await expect(resource('bob', entry.id)).rejects.toMatchObject({ status: 404 })
  const task = await insertTask('alice', randomUUID(), settingsSchema.parse({ agentId: 'test-model' }))
  const invalid = withTask('alice', task.id, async (record, sql) => {
    await writeTask('alice', { ...record, title: 'uncommitted' }, sql)
    throw new Error('test-only failure')
  })
  await expect(invalid).rejects.toThrow('test-only failure')
  expect((await findTask('alice', task.id)).title).toBe('')
})

it('streams the newest round without resending conversation history', async () => {
  const scope = { tenantId: 'workspace', userId: 'alice' }
  const user = owner(scope)
  const task = await insertTask(user, randomUUID(), settingsSchema.parse({ agentId: 'test-model' }))
  const finish = async (text: string) => {
    const { turn } = await reserveTurn(user, sendSchema.parse({
      type: 'send',
      task: task.id,
      turn: randomUUID(),
      text,
    }))
    await writeTurn(user, turn, { status: 'succeeded' })
  }
  await finish('earlier round')
  await finish('subsequent round')
  const history = (await view(scope, task.id)).turns
  expect(history).toHaveLength(2)
  expect((await view(scope, task.id, 0, 0, true)).turns).toEqual(history?.slice(-1))
  await expect(view({ ...scope, userId: 'bob' }, task.id, 0, 0, true)).rejects.toMatchObject({ status: 404 })
})

it('carries the protected recent messages from a long Chinese conversation within the token budget', async () => {
  expect((await ai.init({})).success).toBe(true)
  try {
    const long = '青竹项目交付检查资料'.repeat(1500)
    const summary = await contextSummary([
      { role: 'user', content: long },
      { role: 'assistant', content: '已记录本轮要点' },
    ])
    expect(summary).toContain('青竹项目交付检查资料')
    expect(summary).toContain('已记录本轮要点')
    expect(ai.token.estimateText(summary!)).toBeLessThanOrEqual(1600)
  }
  finally {
    await ai.close()
  }
})
