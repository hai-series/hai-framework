import { randomUUID } from 'node:crypto'
import { ai } from '@h-ai/ai'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addResource, findTask, initWorkspace, insertTask, owner, reserveTurn, resource, withTask, writeTask, writeTurn } from '#lib/server/data.js'
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
    await writeTurn(user, { ...turn, status: 'succeeded' })
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
