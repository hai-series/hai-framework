import { randomUUID } from 'node:crypto'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { addResource, findTask, initWorkspace, insertTask, owner, reserveTurn, resource, withTask, writeTask, writeTurn } from '#lib/server/data.js'
import { view } from '#lib/server/workspace.js'
import { sendSchema, settingsSchema } from '#lib/workspace.js'

beforeEach(async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await initWorkspace()).success).toBe(true)
})

afterEach(async () => {
  await reldb.close()
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
