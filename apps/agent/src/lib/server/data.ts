import type { DmlOperations } from '@h-ai/reldb'
import type { AgentPreferences, AgentResource, AgentSettings, AgentTask, AgentTurn, SendTurn } from '#lib/workspace.js'
import { createHash, randomUUID } from 'node:crypto'
import { core, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { prefsSchema } from '#lib/workspace.js'

const tasks = 'hai_agent_tasks'
const turns = 'hai_agent_turns'
const resources = 'hai_agent_resources'
const preferences = 'hai_agent_preferences'
const text = { type: 'TEXT', notNull: true } as const
const json = { type: 'JSON', notNull: true } as const
const integer = { type: 'BIGINT', notNull: true } as const
const pk = { ...text, primaryKey: true }

export class WorkspaceError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
  }
}

export function value<T>(result: import('@h-ai/core').HaiResult<T>) {
  if (!result.success)
    throw new WorkspaceError(result.error.httpStatus ?? 500, String(result.error.code))
  return result.data
}

export function owner(scope: { tenantId: string, userId: string }) {
  return createHash('sha256').update(JSON.stringify([scope.tenantId, scope.userId])).digest('hex')
}

export function stored<T>(value: T | string): T {
  return typeof value === 'string'
    ? JSON.parse(value)
    : value
}

export function initWorkspace() {
  return reldb.prepareSchema('hai:agent:schema', async ({ ddl }) => {
    for (const [table, def] of [
      [
        tasks,
        {
          id: pk,
          owner: text,
          updated_at: integer,
          acp_id: { type: 'TEXT' },
          data: json,
        },
      ],
      [
        turns,
        {
          id: pk,
          owner: text,
          task_id: text,
          created_at: integer,
          status: text,
          data: json,
        },
      ],
      [
        resources,
        {
          id: pk,
          owner: text,
          kind: text,
          created_at: integer,
          data: json,
        },
      ],
      [
        preferences,
        { owner: pk, data: json },
      ],
    ] as const) {
      const setup = await ddl.createTable(table, def)
      if (!setup.success)
        return setup
    }
    for (const [table, columns] of [
      [
        tasks,
        ['owner', 'updated_at'],
      ],
      [
        turns,
        ['task_id', 'created_at'],
      ],
      [
        resources,
        ['owner', 'kind', 'created_at'],
      ],
    ] as const) {
      const created = await ddl.createIndex(table, `${table}_owner_idx`, {
        columns: [...columns],
      })
      if (!created.success)
        return created
    }
    const sessionIndex = await ddl.createIndex(tasks, `${tasks}_session_idx`, {
      columns: ['owner', 'acp_id'],
    })
    return sessionIndex.success
      ? ok(undefined)
      : sessionIndex
  })
}

async function one<T>(table: string, user: string, id: string, sql: DmlOperations = reldb.sql) {
  const found = value(await sql.get<{ data: T | string }>(`SELECT data FROM ${table} WHERE owner = ? AND id = ?`, [user, id]))
  return found
    ? stored<T>(found.data)
    : undefined
}

export function missing(): never {
  throw new WorkspaceError(404, 'missing')
}

export async function findTask(user: string, id: string, sql?: DmlOperations) {
  return (await one<AgentTask>(tasks, user, id, sql)) ?? missing()
}

export async function taskBySession(user: string, id: string) {
  const found = value(await reldb.sql.get<{ data: AgentTask | string }>(`SELECT data FROM ${tasks} WHERE owner = ? AND acp_id = ?`, [user, id]))
  return found
    ? stored<AgentTask>(found.data)
    : undefined
}

export async function listTasks(user: string) {
  const result = value(await reldb.sql.query<{ data: AgentTask | string }>(`SELECT data FROM ${tasks} WHERE owner = ? ORDER BY updated_at DESC, id DESC LIMIT 100`, [user]))
  // 原生连接 ID 只在服务端读取。
  return result.map(({ data }) => {
    const { acpId, ...task } = stored<AgentTask>(data)
    return task
  })
}

export async function insertTask(user: string, id: string, settings: AgentSettings) {
  const task = {
    id,
    title: '',
    archived: false,
    settings,
    generation: 0,
    carry: false,
    startedAt: Date.now(),
  }
  value(await reldb.sql.execute(`INSERT INTO ${tasks} (id, owner, updated_at, data) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`, [
    id,
    user,
    task.startedAt,
    JSON.stringify(task),
  ]))
  return findTask(user, id)
}

export async function writeTask(user: string, task: AgentTask, sql: DmlOperations = reldb.sql) {
  value(await sql.execute(`UPDATE ${tasks} SET data = ?, acp_id = ?, updated_at = ? WHERE owner = ? AND id = ?`, [
    JSON.stringify(task),
    task.acpId ?? null,
    Date.now(),
    user,
    task.id,
  ]))
}

export async function withTask<T>(user: string, id: string, operation: (task: AgentTask, sql: DmlOperations) => Promise<T>): Promise<T> {
  const begin = value(await reldb.tx.begin())
  try {
    const lock = await begin.execute(`UPDATE ${tasks} SET updated_at = updated_at WHERE owner = ? AND id = ?`, [user, id])
    if (value(lock).changes !== 1)
      return missing()
    const result = await operation(await findTask(user, id, begin), begin)
    value(await begin.commit())
    return result
  }
  finally {
    await begin.rollback()
  }
}

export async function activeTurn(user: string, task: string, sql: DmlOperations = reldb.sql) {
  const pending = value(await sql.get<{ data: AgentTurn | string }>(
    `SELECT data FROM ${turns} WHERE task_id = ? AND owner = ? AND status IN ('submitting', 'queued', 'running', 'cancelling') ORDER BY created_at DESC LIMIT 1`,
    [task, user],
  ))
  return pending
    ? stored<AgentTurn>(pending.data)
    : undefined
}

export async function reserveTurn(user: string, input: SendTurn) {
  return withTask(user, input.task, async (task, sql) => {
    if (task.archived)
      throw new WorkspaceError(409, 'archived')
    const previous = await one<AgentTurn>(turns, user, input.turn, sql)
    if (previous) {
      if (previous.task !== input.task || previous.text !== input.text)
        throw new WorkspaceError(409, 'busy')
      return { task, turn: previous }
    }
    if (await activeTurn(user, task.id, sql))
      throw new WorkspaceError(409, 'busy')
    const turn: AgentTurn = {
      id: input.turn,
      task: task.id,
      text: input.text,
      status: 'submitting',
      startedAt: Date.now(),
    }
    value(await sql.execute(`INSERT INTO ${turns} (id, owner, task_id, status, created_at, data) VALUES (?, ?, ?, ?, ?, ?)`, [
      turn.id,
      user,
      task.id,
      turn.status,
      turn.startedAt,
      JSON.stringify(turn),
    ]))
    if (!task.title) {
      task.title = input.text.slice(0, 70)
      await writeTask(user, task, sql)
    }
    return { task, turn }
  })
}

export async function listTurns(user: string, task: string, offset = 0, limit = 40) {
  const found = value(await reldb.sql.query<{ data: AgentTurn | string }>(
    `SELECT data FROM ${turns} WHERE owner = ? AND task_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [user, task, limit, offset],
  ))
  return found.map(row => stored<AgentTurn>(row.data)).reverse()
}

export async function turnById(user: string, id: string) {
  return (await one<AgentTurn>(turns, user, id)) ?? missing()
}

export async function writeTurn(user: string, turn: AgentTurn) {
  value(await reldb.sql.execute(`UPDATE ${turns} SET data = ?, status = ? WHERE id = ? AND owner = ?`, [
    JSON.stringify(turn),
    turn.status,
    turn.id,
    user,
  ]))
}

export async function listResources(user: string, kind: AgentResource['kind']) {
  const found = value(await reldb.sql.query<{ data: AgentResource | string }>(`SELECT data FROM ${resources} WHERE owner = ? AND kind = ? ORDER BY created_at DESC, id DESC LIMIT 100`, [user, kind]))
  return found.map(row => stored<AgentResource>(row.data))
}

export async function resource(user: string, id: string, kind?: AgentResource['kind']) {
  const entry = await one<AgentResource>(resources, user, id)
  if (!entry || (kind && entry.kind !== kind))
    return missing()
  return entry
}

export async function addResource(user: string, entry: AgentResource) {
  value(await reldb.sql.execute(`INSERT INTO ${resources} (id, owner, kind, created_at, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`, [
    entry.id,
    user,
    entry.kind,
    Date.now(),
    JSON.stringify(entry),
  ]))
  return resource(user, entry.id, entry.kind)
}

export async function removeResource(user: string, id: string) {
  value(await reldb.sql.execute(`DELETE FROM ${resources} WHERE owner = ? AND id = ?`, [user, id]))
}

export async function getPrefs(user: string) {
  const found = value(await reldb.sql.get<{ data: AgentPreferences | string }>(`SELECT data FROM ${preferences} WHERE owner = ?`, [user]))
  return prefsSchema.parse(found
    ? stored<AgentPreferences>(found.data)
    : {})
}

export async function writePrefs(user: string, data: AgentPreferences) {
  value(await reldb.sql.execute(`INSERT INTO ${preferences} (owner, data) VALUES (?, ?) ON CONFLICT (owner) DO UPDATE SET data = EXCLUDED.data`, [
    user,
    JSON.stringify(data),
  ]))
}

export function handleWorkspaceError(error: unknown) {
  if (error instanceof WorkspaceError)
    return { status: error.status, code: error.code }
  const traceId = randomUUID()
  core.logger.error('Agent workspace operation failed', {
    module: 'agent',
    traceId,
    errorName: error instanceof Error
      ? error.name
      : 'Unknown',
  })
  return { status: 500, code: 'operation-failed', traceId }
}
