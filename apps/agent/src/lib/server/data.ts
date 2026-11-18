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
// 预留两次默认排队时限供会话启动。过期的准备记录须重新预留才能发送。
const prepareTurnTimeoutMs = 15 * 60_000

export interface StoredTurn extends AgentTurn {
  revision?: string
  submission?: { fingerprint: string, deadline: number, sessionId?: string }
}

export function publicTurn(turn: StoredTurn): AgentTurn {
  const { revision, submission, ...visible } = turn
  return visible
}

export async function workspaceTime(sql: DmlOperations = reldb.sql) {
  const expression = reldb.config?.type === 'postgresql'
    ? 'CAST(EXTRACT(EPOCH FROM clock_timestamp()) * 1000 AS BIGINT)'
    : 'CAST((julianday(\'now\') - 2440587.5) * 86400000 AS INTEGER)'
  const row = value(await sql.get<{ now: number | string }>(`SELECT ${expression} AS now`))
  const now = Number(row?.now)
  if (!Number.isSafeInteger(now))
    throw new WorkspaceError(503, 'operation-failed')
  return now
}

export class WorkspaceError extends Error {
  constructor(readonly status: number, readonly code: string, readonly currentVersion?: number) {
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
  const pending = value(await sql.get<{ data: StoredTurn | string }>(
    `SELECT data FROM ${turns} WHERE task_id = ? AND owner = ? AND status IN ('submitting', 'queued', 'running', 'cancelling') ORDER BY created_at DESC LIMIT 1`,
    [task, user],
  ))
  return pending
    ? stored<StoredTurn>(pending.data)
    : undefined
}

export async function reserveTurn(user: string, input: SendTurn) {
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([
      input.task,
      input.text,
      input.knowledge,
      input.files,
      input.skills,
      input.memory,
    ]))
    .digest('hex')
  return withTask(user, input.task, async (task, sql) => {
    if (task.archived)
      throw new WorkspaceError(409, 'archived')
    const previous = await one<StoredTurn>(turns, user, input.turn, sql)
    if (previous) {
      if (previous.task !== input.task || previous.text !== input.text
        || (previous.submission && previous.submission.fingerprint !== fingerprint)) {
        throw new WorkspaceError(409, 'busy')
      }
      return { task, turn: previous, created: false }
    }
    if (await activeTurn(user, task.id, sql))
      throw new WorkspaceError(409, 'busy')
    const startedAt = await workspaceTime(sql)
    const turn: StoredTurn = {
      id: input.turn,
      task: task.id,
      text: input.text,
      status: 'submitting',
      startedAt,
      revision: randomUUID(),
      submission: { fingerprint, deadline: startedAt + prepareTurnTimeoutMs },
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
    return { task, turn, created: true }
  })
}

export async function listTurns(user: string, task: string, offset = 0, limit = 40) {
  const found = value(await reldb.sql.query<{ data: StoredTurn | string }>(
    `SELECT data FROM ${turns} WHERE owner = ? AND task_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [user, task, limit, offset],
  ))
  return found.map(row => stored<StoredTurn>(row.data)).reverse()
}

export async function turnById(user: string, id: string, sql?: DmlOperations) {
  return (await one<StoredTurn>(turns, user, id, sql)) ?? missing()
}

export async function writeTurn(
  user: string,
  previous: StoredTurn,
  changes: Partial<Pick<StoredTurn, 'status' | 'receipt' | 'output' | 'eventSummary' | 'plan' | 'estimate' | 'compressed'>>,
  dispatch?: { sessionId: string, retentionMs: number },
) {
  return withTask(user, previous.task, async (task, sql) => {
    const current = await turnById(user, previous.id, sql)
    if (current.revision !== previous.revision)
      return { updated: false, turn: current }
    const next: StoredTurn = {
      ...current,
      ...changes,
      revision: randomUUID(),
    }
    if (dispatch) {
      const now = await workspaceTime(sql)
      if (!current.submission || current.submission.sessionId || current.status !== 'submitting' || current.submission.deadline <= now)
        return { updated: false, turn: current }
      next.submission = { ...current.submission, sessionId: dispatch.sessionId, deadline: now + dispatch.retentionMs }
      if (task.acpId !== dispatch.sessionId)
        await writeTask(user, { ...task, acpId: dispatch.sessionId, acpMode: next.plan?.resolvedMode }, sql)
    }
    value(await sql.execute(`UPDATE ${turns} SET data = ?, status = ? WHERE id = ? AND owner = ?`, [
      JSON.stringify(next),
      next.status,
      next.id,
      user,
    ]))
    return { updated: true, turn: next }
  })
}

export async function listResources(user: string, kind: AgentResource['kind']) {
  const found = value(await reldb.sql.query<{ data: AgentResource | string }>(`SELECT data FROM ${resources} WHERE owner = ? AND kind = ? ORDER BY created_at DESC, id DESC LIMIT 100`, [user, kind]))
  return found.map(row => stored<AgentResource>(row.data))
}

export async function resource(user: string, id: string, kind?: AgentResource['kind'], sql: DmlOperations = reldb.sql) {
  const entry = await one<AgentResource>(resources, user, id, sql)
  if (!entry || (kind && entry.kind !== kind))
    return missing()
  return entry
}

export async function withResource<T>(user: string, id: string, operation: (entry: AgentResource, sql: DmlOperations) => Promise<T>) {
  const transaction = value(await reldb.tx.begin())
  let committed = false
  try {
    value(await transaction.execute(`UPDATE ${resources} SET created_at = created_at WHERE owner = ? AND id = ?`, [user, id]))
    const output = await operation(await resource(user, id, undefined, transaction), transaction)
    value(await transaction.commit())
    committed = true
    return output
  }
  finally {
    if (!committed) {
      const rolledBack = await transaction.rollback()
      if (!rolledBack.success)
        core.logger.error('Agent resource rollback failed', { module: 'agent', errorCode: rolledBack.error.code })
    }
  }
}

export async function writeResource(user: string, entry: AgentResource, sql: DmlOperations = reldb.sql) {
  const changed = value(await sql.execute(`UPDATE ${resources} SET data = ? WHERE owner = ? AND id = ?`, [
    JSON.stringify(entry),
    user,
    entry.id,
  ]))
  if (changed.changes !== 1)
    missing()
}

export async function insertResource(user: string, entry: AgentResource, sql: DmlOperations) {
  return value(await sql.execute(`INSERT INTO ${resources} (id, owner, kind, created_at, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`, [
    entry.id,
    user,
    entry.kind,
    entry.createdAt ?? Date.now(),
    JSON.stringify(entry),
  ])).changes === 1
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
  if (error instanceof WorkspaceError) {
    return {
      status: error.status,
      code: error.code,
      ...(error.currentVersion !== undefined
        ? { currentVersion: error.currentVersion }
        : {}),
    }
  }
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
