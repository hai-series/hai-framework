import type { HaiResult } from '@h-ai/core'
import type { DmlOperations, ReldbTableDef } from '@h-ai/reldb'
import type { RunnerConfig, RunnerEnvironment, RunnerResources, submitSchema } from './runner-config.js'
import type { RunnerContainerIdentity } from './runner-container.js'
import type { RunnerProcessIdentity } from './runner-process.js'
import type { RunnerEvent, RunnerExecution, RunnerJson, RunnerOwner, RunnerReconciliation, RunnerScope, RunnerWarmPool } from './runner-types.js'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import process from 'node:process'
import { err, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { runnerM } from './runner-i18n.js'
import { HaiRunnerError } from './runner-types.js'

const EXECUTIONS = 'hai_runner_executions'
const EVENTS = 'hai_runner_events'
const GATE = 'hai_runner_gate'
const ACTIVE = '(state IN (\'running\', \'cancelling\') OR (state = \'unknown\' AND reconciled_at IS NULL))'
const RETENTION_STATES = [
  'succeeded',
  'failed',
  'cancelled',
  'unknown',
] as const
const RETENTION_BATCH = 128
const MAX_EVENT_BYTES = 16 * 1024 * 1024
const text = { type: 'TEXT', notNull: true } as const
const nullableText = { type: 'TEXT' } as const
const integer = { type: 'BIGINT', notNull: true } as const
const payload = { type: 'JSON' } as const

const executions: ReldbTableDef = {
  id: { ...text, primaryKey: true },
  scope_key: text,
  reuse_key: { ...nullableText, unique: true },
  request_key: text,
  kind: text,
  request_json: payload,
  environment_key: nullableText,
  state: text,
  reason: nullableText,
  owner_node: nullableText,
  owner_generation: nullableText,
  owner_process_json: payload,
  pinned_node: nullableText,
  pinned_generation: nullableText,
  parent_id: nullableText,
  leased_until: integer,
  queue_until: integer,
  run_until: integer,
  event_sequence: integer,
  event_bytes: { ...integer, defaultValue: 0 },
  cpu_milli: integer,
  memory_mib: integer,
  pids: integer,
  scratch_mib: integer,
  result_json: payload,
  created_at: integer,
  updated_at: integer,
  container_json: payload,
  reconciliation_json: payload,
  reconciled_at: { type: 'BIGINT' },
  capacity_class: text,
  concurrency_key: nullableText,
  concurrency_limit: integer,
  pool_fingerprint: nullableText,
  pool_limit: { type: 'BIGINT' },
  warm_state: nullableText,
}

/**
 * 持久执行仅保存受信提交的业务输入、环境快照和已检查限额。
 * @example 模块内部上下文
 * ```ts
 * function maxMillis(plan: StoredRequest) { return plan.runTimeoutMs }
 * ```
 */
interface StoredRequest {
  scope: RunnerScope
  input: RunnerJson
  environment?: RunnerEnvironment
  resources?: RunnerResources
  runTimeoutMs: number
}

/**
 * 事务使用的执行记录；时钟字段从 SQL 返回并在公开投影时转换。
 * @example 模块内部上下文
 * ```ts
 * function publicView(row: ExecutionRow) { return project(row) }
 * ```
 */
interface ExecutionRow {
  id: string
  scope_key: string
  request_key: string
  kind: string
  request_json: StoredRequest | string
  state: RunnerExecution['status']
  reason: RunnerExecution['failure'] | null
  owner_node: string | null
  owner_generation: string | null
  owner_process_json: RunnerProcessIdentity | string | null
  environment_key: string | null
  parent_id: string | null
  leased_until: string | number
  run_until: string | number
  result_json: { value: RunnerJson } | string | null
  created_at: string | number
  updated_at: string | number
  container_json: RunnerContainerIdentity | string | null
  reconciled_at: string | number | null
  pool_fingerprint: string | null
}

/**
 * 状态轮询所需列，避免为每次读取传输原始输入。
 * @example 模块内部上下文
 * ```ts
 * function status(row: ExecutionSummary) { return row.state }
 * ```
 */
type ExecutionSummary = Pick<ExecutionRow, 'id' | 'state' | 'reason' | 'owner_node' | 'owner_generation' | 'result_json' | 'created_at' | 'updated_at' | 'reconciled_at'>

/**
 * 当前领取只供本节点调用其注册的处理器。
 * @example 模块内部上下文
 * ```ts
 * function input(claimed: RunnerClaim) { return claimed.request.input }
 * ```
 */
export interface RunnerClaim {
  id: string
  kind: string
  parentId?: string
  warmId?: string
  request: StoredRequest
}

/**
 * 执行生命周期的存储操作，无进程级锁替代数据库原子提交。
 * @example 模块内部上下文
 * ```ts
 * async function read(store: RunnerStore) { return store.get({ tenantId: 'work', userId: 'alice' }, '123') }
 * ```
 */
export type RunnerStore = ReturnType<typeof makeStore>

function clock() {
  if (reldb.config?.type === 'postgresql')
    return 'CAST(FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000) AS BIGINT)'
  if (reldb.config?.type === 'mysql')
    return 'CAST(UNIX_TIMESTAMP(SYSDATE(3)) * 1000 AS UNSIGNED)'
  return 'CAST((julianday(\'now\') - 2440587.5) * 86400000 AS INTEGER)'
}

/** 对已校验 JSON 排序，重传对象的属性顺序不改变幂等身份。 */
function canonical(value: RunnerJson): string {
  if (Array.isArray(value))
    return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function hash(value: RunnerJson) {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

function databaseValue<T>(value: T | string): T {
  return typeof value === 'string'
    ? JSON.parse(value) as T
    : value
}

function project(row: ExecutionSummary, environmentId?: string): RunnerExecution {
  return {
    id: row.id,
    status: row.state,
    owner: row.owner_node && row.owner_generation
      ? { nodeId: row.owner_node, generation: row.owner_generation }
      : undefined,
    environmentId,
    output: row.result_json === null
      ? undefined
      : databaseValue<{ value: RunnerJson }>(row.result_json).value,
    failure: row.reason ?? undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    reconciledAt: row.reconciled_at === null
      ? undefined
      : Number(row.reconciled_at),
  }
}

function projectRequest(row: ExecutionRow) {
  return project(row, databaseValue<StoredRequest>(row.request_json).environment?.id)
}

function unavailable() {
  return err(HaiRunnerError.UNAVAILABLE, runnerM('runner_unavailable'))
}

function lost() {
  return err(HaiRunnerError.LEASE_LOST, runnerM('runner_leaseLost'))
}

function missing() {
  return err(HaiRunnerError.NOT_FOUND, runnerM('runner_notFound'))
}

function conflict() {
  return err(HaiRunnerError.CONFLICT, runnerM('runner_conflict'))
}

function overflow() {
  return err(HaiRunnerError.CAPACITY, runnerM('runner_capacity'))
}

/** 数据库失败抛给事务包装以触发回滚。 */
function data<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error('Runner database operation failed', { cause: result.error })
  return result.data
}

async function serialized<T>(action: (sql: DmlOperations) => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
  const response = await reldb.tx.wrap(async (tx) => {
    data(await tx.execute(`UPDATE ${GATE} SET revision = revision + 1 WHERE id = 1`))
    return action(tx)
  })
  return response.success
    ? response.data
    : unavailable()
}

async function find(sql: DmlOperations, id: string, scopeKey: string) {
  return data(await sql.get<ExecutionRow>(`SELECT * FROM ${EXECUTIONS} WHERE id = ? AND scope_key = ?`, [id, scopeKey]))
}

function columns(resources: RunnerResources | undefined): [number, number, number, number] {
  return resources
    ? [
        Math.ceil(resources.cpu * 1000),
        resources.memoryMiB,
        resources.pids,
        resources.scratchMiB,
      ]
    : [0, 0, 0, 0]
}

function within(actual: RunnerResources, ceiling: RunnerResources) {
  return actual.cpu <= ceiling.cpu && actual.memoryMiB <= ceiling.memoryMiB
    && actual.pids <= ceiling.pids && actual.scratchMiB <= ceiling.scratchMiB
}

/**
 * 初始化可重复执行；SQLite 用于单机，所有后端都使用同一套事务门闩。
 * @example 模块内部上下文
 * ```ts
 * async function buildTables() { return readyStore() }
 * ```
 */
export async function readyStore(): Promise<HaiResult<void>> {
  if (!reldb.isInitialized)
    return unavailable()
  const addedColumns = ['event_bytes', 'owner_process_json']
  for (const [name, def] of [
    [
      GATE,
      {
        id: { ...integer, primaryKey: true },
        revision: integer,
      },
    ],
    [EXECUTIONS, executions],
    [
      EVENTS,
      {
        id: { ...text, primaryKey: true },
        execution_id: text,
        sequence_number: integer,
        event_json: payload,
        created_at: integer,
      },
    ],
  ] satisfies [string, ReldbTableDef][]) {
    const result = await reldb.ddl.createTable(name, def)
    if (!result.success) {
      const existing = await reldb.schemaColumns(name)
      if (!existing.success || Object.keys(def).some(column => !existing.data.includes(column) && !(name === EXECUTIONS && addedColumns.includes(column))))
        return unavailable()
    }
  }
  const existing = await reldb.schemaColumns(EXECUTIONS)
  if (!existing.success)
    return unavailable()
  for (const column of addedColumns.filter(column => !existing.data.includes(column))) {
    const added = await reldb.ddl.addColumn(EXECUTIONS, column, executions[column])
    if (!added.success) {
      const refreshed = await reldb.schemaColumns(EXECUTIONS)
      if (!refreshed.success || !refreshed.data.includes(column))
        return unavailable()
    }
  }

  for (const [table, name, fields] of [
    [
      EXECUTIONS,
      'hai_runner_queue_idx',
      ['state', 'kind', 'created_at'],
    ],
    [
      EXECUTIONS,
      'hai_runner_owner_idx',
      ['owner_node', 'state', 'leased_until'],
    ],
    [
      EXECUTIONS,
      'hai_runner_scope_idx',
      ['scope_key', 'capacity_class', 'state'],
    ],
    [
      EXECUTIONS,
      'hai_runner_concurrency_idx',
      ['concurrency_key', 'state'],
    ],
    [
      EXECUTIONS,
      'hai_runner_parent_idx',
      ['parent_id'],
    ],
    [
      EXECUTIONS,
      'hai_runner_retention_idx',
      [
        'state',
        'reconciled_at',
        'updated_at',
        'id',
      ],
    ],
    [
      EXECUTIONS,
      'hai_runner_queue_due_idx',
      ['state', 'queue_until'],
    ],
    [
      EXECUTIONS,
      'hai_runner_lease_due_idx',
      ['state', 'leased_until'],
    ],
    [
      EXECUTIONS,
      'hai_runner_run_due_idx',
      ['state', 'run_until'],
    ],
    [
      EVENTS,
      'hai_runner_event_cursor_idx',
      ['execution_id', 'sequence_number'],
    ],
  ] satisfies [string, string, string[]][]) {
    const result = await reldb.ddl.createIndex(table, name, { columns: fields })
    if (!result.success) {
      // MySQL 缺少 CREATE INDEX IF NOT EXISTS；并发初始化后核对索引实际列。
      if (reldb.config?.type !== 'mysql')
        return unavailable()
      const existing = await reldb.sql.query<{ column_name: string }>(
        'SELECT COLUMN_NAME AS column_name FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? ORDER BY SEQ_IN_INDEX',
        [table, name],
      )
      if (!existing.success || JSON.stringify(existing.data.map(row => row.column_name)) !== JSON.stringify(fields))
        return unavailable()
    }
  }

  const syntax = reldb.config?.type === 'mysql'
    ? ' ON DUPLICATE KEY UPDATE id = id'
    : ' ON CONFLICT (id) DO NOTHING'
  const seed = await reldb.sql.execute(`INSERT INTO ${GATE} (id, revision) VALUES (1, 0)${syntax}`)
  return seed.success
    ? ok(undefined)
    : unavailable()
}

/**
 * 管理任务持久化、资源预留和条件提交。
 * @example 模块内部上下文
 * ```ts
 * function controller(config: RunnerConfig, owner: RunnerOwner) { return makeStore(config, owner) }
 * ```
 */
export function makeStore(config: RunnerConfig, owner: RunnerOwner, ownerProcess?: RunnerProcessIdentity) {
  const envById = new Map(config.environments.map(item => [item.id, item]))
  const envKeys = config.environments.filter(item => !item.architecture || item.architecture === process.arch).map(item => hash(item))
  const now = clock()
  const resultValue = reldb.config?.type === 'postgresql'
    ? 'CAST(? AS JSONB)'
    : reldb.config?.type === 'mysql'
      ? 'CAST(CONVERT(? USING utf8mb4) AS JSON)'
      : '?'
  // 清理比较用数据库语句时间，保持同一语句内的索引范围稳定；执行栅栏仍使用实时的 now。
  const statementTime = reldb.config?.type === 'postgresql'
    ? 'CAST(FLOOR(EXTRACT(EPOCH FROM statement_timestamp()) * 1000) AS BIGINT)'
    : reldb.config?.type === 'mysql'
      ? 'CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS SIGNED)'
      : now
  const processJson = ownerProcess
    ? JSON.stringify(ownerProcess)
    : null
  const environmentPath = reldb.json.extract('request_json', '$.environment.id')
  const environmentProjection = reldb.config?.type === 'mysql'
    ? `JSON_UNQUOTE(${environmentPath.sql})`
    : reldb.config?.type === 'postgresql'
      ? 'request_json #>> ?::text[]'
      : environmentPath.sql

  async function summary(id: string, scopeKey: string) {
    const row = data(await reldb.sql.get<ExecutionSummary & { environment_id: string | null }>(`
      SELECT id, state, reason, owner_node, owner_generation, result_json, created_at, updated_at, reconciled_at,
        ${environmentProjection} AS environment_id
      FROM ${EXECUTIONS} WHERE id = ? AND scope_key = ?`, [...environmentPath.params, id, scopeKey]))
    return row
      ? project(row, row.environment_id ?? undefined)
      : undefined
  }

  async function parentSettled(sql: DmlOperations, row: ExecutionRow) {
    if (!row.parent_id)
      return true
    const parent = data(await sql.get<{ state: string, reconciled_at: number | string | null }>(`
      SELECT state, reconciled_at FROM ${EXECUTIONS}
      WHERE id = ? AND owner_node = ? AND owner_generation = ? AND scope_key = ?`, [
      row.parent_id,
      row.owner_node,
      row.owner_generation,
      row.scope_key,
    ]))
    return !!parent && (parent.state === 'unknown'
      ? parent.reconciled_at !== null
      : ['succeeded', 'failed', 'cancelled'].includes(parent.state))
  }

  /** 排队超时和旧租约都由数据库时钟判断。未知副作用保留原资源预留。 */
  async function sweep(sql: DmlOperations) {
    data(await sql.execute(`UPDATE ${EXECUTIONS} SET state = 'failed', reason = 'queue-timeout', reuse_key = NULL, updated_at = ${now}
      WHERE state = 'queued' AND queue_until <= ${now}`))
    data(await sql.execute(`UPDATE ${EXECUTIONS} SET state = 'unknown', reason = 'owner-lost', updated_at = ${now}
      WHERE state IN ('running', 'cancelling') AND leased_until <= ${now}`))
    data(await sql.execute(`UPDATE ${EXECUTIONS} SET state = 'cancelling', reason = 'run-timeout', updated_at = ${now}
      WHERE state = 'running' AND run_until <= ${now} AND leased_until > ${now}`))
  }

  async function expired(sql: DmlOperations, limit: number) {
    const pages = await Promise.all(RETENTION_STATES.map((state) => {
      const endedAt = state === 'unknown'
        ? 'q.reconciled_at'
        : 'q.updated_at'
      return sql.query<{ id: string, ended_at: number | string }>(`
        SELECT q.id, ${endedAt} AS ended_at FROM ${EXECUTIONS} q
        WHERE q.state = ? AND q.reconciled_at ${state === 'unknown'
          ? 'IS NOT NULL'
          : 'IS NULL'}
          AND ${endedAt} <= ${statementTime} - ?
          AND NOT EXISTS (SELECT 1 FROM ${EXECUTIONS} child WHERE child.parent_id = q.id)
        ORDER BY ${endedAt}, q.updated_at, q.id LIMIT ?`, [state, config.retentionMs, limit])
    }))
    return pages.flatMap(page => data(page)).sort((left, right) => Number(left.ended_at) - Number(right.ended_at)).slice(0, limit)
  }

  return {
    async sweep(): Promise<HaiResult<void>> {
      const due = await reldb.sql.get<{ id: string }>(`
        SELECT id FROM ${EXECUTIONS} WHERE (state = 'queued' AND queue_until <= ${statementTime})
          OR (state IN ('running', 'cancelling') AND leased_until <= ${statementTime})
          OR (state = 'running' AND run_until <= ${statementTime}) LIMIT 1`)
      if (!due.success)
        return unavailable()
      if (!due.data)
        return ok(undefined)
      return serialized(async (sql) => {
        await sweep(sql)
        return ok(undefined)
      })
    },

    async prune(): Promise<HaiResult<number>> {
      try {
        if (!(await expired(reldb.sql, 1)).length)
          return ok(0)
      }
      catch {
        return unavailable()
      }
      return serialized(async (sql) => {
        const entries = await expired(sql, RETENTION_BATCH)
        if (!entries.length)
          return ok(0)
        const ids = entries.map(entry => entry.id)
        const keys = ids.map(() => '?').join(', ')
        data(await sql.execute(`DELETE FROM ${EVENTS} WHERE execution_id IN (${keys})`, ids))
        const removed = data(await sql.execute(`DELETE FROM ${EXECUTIONS} WHERE id IN (${keys})`, ids))
        return ok(removed.changes)
      })
    },

    async submit(request: ReturnType<typeof submitSchema.parse>, pool?: RunnerWarmPool): Promise<HaiResult<RunnerExecution>> {
      const scopeKey = hash([request.scope.tenantId, request.scope.userId])
      const id = hash([scopeKey, request.kind, request.idempotencyKey ?? randomUUID()])
      const reuse = request.reuseKey === undefined
        ? null
        : hash([scopeKey, request.kind, request.reuseKey])
      const requestKey = hash({
        kind: request.kind,
        input: request.input,
        environmentId: request.environmentId ?? null,
        resources: request.resources ?? null,
        parentId: request.parentId ?? null,
        nodeId: request.nodeId ?? null,
        queueTimeoutMs: request.queueTimeoutMs,
        capacityClass: request.capacityClass,
        concurrency: request.concurrency ?? null,
        warmPool: pool
          ? { ...pool }
          : null,
        runTimeoutMs: request.runTimeoutMs,
      })
      return serialized(async (sql) => {
        const existing = await find(sql, id, scopeKey)
          ?? (reuse
            ? data(await sql.get<ExecutionRow>(`SELECT * FROM ${EXECUTIONS} WHERE reuse_key = ?`, [reuse]))
            : null)
        if (existing) {
          return existing.request_key === requestKey
            ? ok(projectRequest(existing))
            : conflict()
        }

        const environment = request.environmentId
          ? envById.get(request.environmentId)
          : undefined
        if (request.warmPool && (!pool || !environment))
          return missing()
        if (request.environmentId && !environment)
          return missing()
        const resources = environment
          ? {
              ...environment.resources,
              ...request.resources,
            }
          : request.resources
            ? {
                cpu: 1,
                memoryMiB: 64,
                pids: 16,
                scratchMiB: 16,
                ...request.resources,
              }
            : undefined
        if (environment && resources && !within(resources, environment.resources))
          return overflow()

        const parent = request.parentId
          ? await find(sql, request.parentId, scopeKey)
          : null
        if (request.parentId && (!parent || parent.state !== 'running'))
          return conflict()
        const parentFilter = request.parentId ? 'IS NOT NULL' : 'IS NULL'
        const queued = data(await sql.get<{ total: number | string }>(`SELECT COUNT(*) AS total FROM ${EXECUTIONS} WHERE state = 'queued' AND parent_id ${parentFilter}`))
        if (Number(queued?.total) >= config.maxQueued)
          return overflow()

        const saved: StoredRequest = {
          scope: request.scope,
          input: request.input,
          environment,
          resources,
          runTimeoutMs: request.runTimeoutMs,
        }
        data(await sql.execute(`INSERT INTO ${EXECUTIONS}
          (id, scope_key, reuse_key, request_key, kind, request_json, environment_key, state, pinned_node, pinned_generation, parent_id,
            leased_until, queue_until, run_until, event_sequence, cpu_milli, memory_mib, pids, scratch_mib, created_at, updated_at, capacity_class, concurrency_key, concurrency_limit, pool_fingerprint, pool_limit)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, 0, ${now} + ?, 0, 0, ?, ?, ?, ?, ${now}, ${now}, ?, ?, ?, ?, ?)`, [
          id,
          scopeKey,
          reuse,
          requestKey,
          request.kind,
          JSON.stringify(saved),
          environment
            ? hash(environment)
            : null,
          parent?.owner_node ?? request.nodeId ?? null,
          parent?.owner_generation ?? null,
          request.parentId ?? null,
          request.queueTimeoutMs,
          ...columns(resources),
          request.capacityClass,
          request.concurrency
            ? hash([request.kind, request.concurrency.key])
            : null,
          request.concurrency?.limit ?? 0,
          pool && environment
            ? hash({
                pool: { ...pool },
                environment,
              })
            : null,
          pool?.maxTotal ?? null,
        ]))
        const row = await find(sql, id, scopeKey)
        if (!row)
          throw new Error('Newly inserted execution could not be read')
        return ok(projectRequest(row))
      })
    },

    async find(scope: RunnerScope, kind: string, key: string): Promise<HaiResult<RunnerExecution | undefined>> {
      try {
        const scopeKey = hash([scope.tenantId, scope.userId])
        return ok(await summary(hash([scopeKey, kind, key]), scopeKey))
      }
      catch {
        return unavailable()
      }
    },

    async get(scope: RunnerScope, id: string): Promise<HaiResult<RunnerExecution>> {
      try {
        const found = await summary(id, hash([scope.tenantId, scope.userId]))
        return found
          ? ok(found)
          : missing()
      }
      catch {
        return unavailable()
      }
    },

    async cancel(scope: RunnerScope, id: string): Promise<HaiResult<RunnerExecution>> {
      return serialized(async (sql) => {
        const row = await find(sql, id, hash([scope.tenantId, scope.userId]))
        if (!row)
          return missing()
        data(await sql.execute(`UPDATE ${EXECUTIONS} SET state = 'cancelled', reuse_key = NULL, updated_at = ${now} WHERE id = ? AND state = 'queued'`, [id]))
        data(await sql.execute(`UPDATE ${EXECUTIONS} SET state = 'cancelling', updated_at = ${now} WHERE id = ? AND state = 'running'`, [id]))
        data(await sql.execute(`UPDATE ${EXECUTIONS} SET state = 'cancelled', reason = 'parent-ended', updated_at = ${now} WHERE parent_id = ? AND state = 'queued'`, [id]))
        data(await sql.execute(`UPDATE ${EXECUTIONS} SET state = 'cancelling', reason = 'parent-ended', updated_at = ${now} WHERE parent_id = ? AND state = 'running'`, [id]))
        const changed = await find(sql, id, row.scope_key)
        return changed
          ? ok(projectRequest(changed))
          : missing()
      })
    },

    async reserveWarm(pool: RunnerWarmPool): Promise<HaiResult<RunnerClaim | null>> {
      const environment = envById.get(pool.environmentId)
      if (!environment || !pool.minReady || !envKeys.includes(hash(environment)))
        return ok(null)
      const fingerprint = hash({
        pool: { ...pool },
        environment,
      })
      const key = hash([pool.kind, pool.key])
      const usage = columns(environment.resources)
      async function canReserve(sql: DmlOperations) {
        const [totalsResult, reservedResult] = await Promise.all([
          sql.get<{ total: string | number, warm: string | number, ceiling: string | number }>(`
            SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN state = 'running' AND pool_fingerprint = ?
              AND warm_state IN ('starting','ready') THEN 1 ELSE 0 END),0) AS warm,
              COALESCE(MIN(pool_limit), ?) AS ceiling
            FROM ${EXECUTIONS} WHERE concurrency_key = ? AND ${ACTIVE}`, [fingerprint, pool.maxTotal, key]),
          sql.get<{ active: string | number, cpu: string | number, memory: string | number, pids: string | number, scratch: string | number }>(`
            SELECT COUNT(*) AS active, COALESCE(SUM(cpu_milli),0) AS cpu, COALESCE(SUM(memory_mib),0) AS memory,
              COALESCE(SUM(pids),0) AS pids, COALESCE(SUM(scratch_mib),0) AS scratch
            FROM ${EXECUTIONS} WHERE owner_node = ? AND capacity_class = 'tool' AND ${ACTIVE}`, [owner.nodeId]),
        ])
        const totals = data(totalsResult)
        const reserved = data(reservedResult)
        if (!totals || !reserved || Number(totals.warm) >= pool.minReady
          || Number(totals.total) >= Math.min(pool.maxTotal, Number(totals.ceiling))
          || Number(reserved.active) >= config.toolMaxRunning) {
          return false
        }
        const capacity = columns(config.toolCapacity)
        const occupied = [
          Number(reserved.cpu),
          Number(reserved.memory),
          Number(reserved.pids),
          Number(reserved.scratch),
        ]
        return !usage.some((amount, index) => amount + occupied[index] > capacity[index])
      }
      try {
        if (!await canReserve(reldb.sql))
          return ok(null)
      }
      catch {
        return unavailable()
      }
      return serialized(async (sql) => {
        if (!await canReserve(sql))
          return ok(null)
        const id = hash([
          owner.generation,
          randomUUID(),
        ])
        const request: StoredRequest = {
          scope: { tenantId: '@runner', userId: '@warm' },
          input: null,
          environment,
          resources: environment.resources,
          runTimeoutMs: 86_400_000,
        }
        data(await sql.execute(`INSERT INTO ${EXECUTIONS}
          (id, scope_key, request_key, kind, request_json, environment_key, state, owner_node, owner_generation,
           leased_until, queue_until, run_until, event_sequence, cpu_milli, memory_mib, pids, scratch_mib,
           created_at, updated_at, capacity_class, concurrency_key, concurrency_limit, pool_fingerprint, pool_limit, warm_state)
          VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ${now} + ?, 0, ${now} + ?, 0, ?, ?, ?, ?,
            ${now}, ${now}, 'tool', ?, ?, ?, ?, 'starting')`, [
          id,
          hash(['@runner', '@warm']),
          id,
          pool.kind,
          JSON.stringify(request),
          hash(environment),
          owner.nodeId,
          owner.generation,
          config.leaseMs,
          request.runTimeoutMs,
          ...usage,
          key,
          pool.maxRunning,
          fingerprint,
          pool.maxTotal,
        ]))
        return ok({ id, kind: pool.kind, request })
      })
    },

    async markWarmReady(id: string): Promise<HaiResult<void>> {
      const result = await reldb.sql.execute(`UPDATE ${EXECUTIONS} SET warm_state = 'ready', updated_at = ${now}
        WHERE id = ? AND owner_generation = ? AND state = 'running' AND warm_state = 'starting'
          AND leased_until > ${now} AND container_json IS NOT NULL`, [id, owner.generation])
      return result.success && result.data.changes === 1
        ? ok(undefined)
        : lost()
    },

    async claim(kinds: string[], category: 'control' | 'default' | 'tool', pools: RunnerWarmPool[] = [], warmIds: string[] = []): Promise<HaiResult<RunnerClaim | null>> {
      if (!kinds.length)
        return ok(null)
      const capacityClass = category === 'tool'
        ? 'tool'
        : 'default'
      const parentFilter = category === 'control'
        ? 'IS NOT NULL'
        : 'IS NULL'
      const queued = await reldb.sql.get<{ id: string }>(`
        SELECT id FROM ${EXECUTIONS} WHERE state = 'queued' AND capacity_class = ? AND parent_id ${parentFilter}
          AND queue_until > ${now} AND kind IN (${kinds.map(() => '?').join(',')})
          AND (pinned_node IS NULL OR pinned_node = ?) AND (pinned_generation IS NULL OR pinned_generation = ?) LIMIT 1`, [
        capacityClass,
        ...kinds,
        owner.nodeId,
        owner.generation,
      ])
      if (!queued.success)
        return unavailable()
      if (!queued.data)
        return ok(null)
      async function eligible(sql: DmlOperations, includeRequest: boolean) {
        const maxRunning = category === 'tool'
          ? config.toolMaxRunning
          : category === 'control'
            ? config.maxControlRunning
            : config.maxRunning
        const reserved = data(await sql.get<{ active: number | string, cpu: number | string, memory: number | string, pids: number | string, scratch: number | string }>(
          `SELECT COUNT(*) AS active, COALESCE(SUM(cpu_milli),0) AS cpu, COALESCE(SUM(memory_mib),0) AS memory,
             COALESCE(SUM(pids),0) AS pids, COALESCE(SUM(scratch_mib),0) AS scratch
           FROM ${EXECUTIONS} WHERE owner_node = ? AND capacity_class = ? AND ${ACTIVE} AND parent_id ${parentFilter}`,
          [owner.nodeId, capacityClass],
        ))
        if (!reserved)
          return null

        const fingerprints = category === 'tool'
          ? pools.flatMap((pool) => {
              const environment = envById.get(pool.environmentId)
              return environment
                ? [
                    hash({
                      pool: { ...pool },
                      environment,
                    }),
                  ]
                : []
            })
          : []
        const eligiblePool = fingerprints.length
          ? ` OR q.pool_fingerprint IN (${fingerprints.map(() => '?').join(',')})`
          : ''
        const ready = category === 'tool' && warmIds.length
          ? `EXISTS (SELECT 1 FROM ${EXECUTIONS} w WHERE w.id IN (${warmIds.map(() => '?').join(',')})
            AND w.pool_fingerprint = q.pool_fingerprint AND w.state = 'running' AND w.warm_state = 'ready' AND w.leased_until > ${now})`
          : '1 = 0'
        const canStartCold = Number(reserved.active) < maxRunning
        const eligibleEnvironment = envKeys.length
          ? ` OR q.environment_key IN (${envKeys.map(() => '?').join(',')})`
          : ''
        const [cpu, memory, pids, scratch] = columns(category === 'tool'
          ? config.toolCapacity
          : config.capacity)
        return data(await sql.get<ExecutionRow>(`
          SELECT q.id${includeRequest ? ', q.kind, q.request_json, q.parent_id, q.pool_fingerprint' : ''} FROM ${EXECUTIONS} q
          WHERE q.state = 'queued' AND q.capacity_class = ? AND q.queue_until > ${now} AND q.parent_id ${parentFilter}
          AND (q.pinned_node IS NULL OR q.pinned_node = ?) AND (q.pinned_generation IS NULL OR q.pinned_generation = ?)
          AND q.kind IN (${kinds.map(() => '?').join(',')}) AND (q.environment_key IS NULL${eligibleEnvironment})
          AND (q.pool_fingerprint IS NULL${eligiblePool})
          AND ((${ready}) OR (? = 1 AND q.cpu_milli <= ? AND q.memory_mib <= ? AND q.pids <= ? AND q.scratch_mib <= ?
            AND (q.pool_fingerprint IS NULL OR (
              NOT EXISTS (SELECT 1 FROM ${EXECUTIONS} w WHERE w.pool_fingerprint = q.pool_fingerprint
                AND w.state = 'running' AND w.warm_state IN ('starting','ready') AND w.leased_until > ${now}
                AND (q.pinned_node IS NULL OR q.pinned_node = w.owner_node))
              AND (SELECT COUNT(*) FROM ${EXECUTIONS} a WHERE a.concurrency_key = q.concurrency_key AND ${ACTIVE})
                < ${reldb.config?.type === 'sqlite'
                  ? 'MIN'
                  : 'LEAST'}(q.pool_limit, COALESCE((SELECT MIN(a.pool_limit) FROM ${EXECUTIONS} a
                  WHERE a.concurrency_key = q.concurrency_key AND ${ACTIVE}), q.pool_limit))))))
          AND (q.parent_id IS NULL OR EXISTS (SELECT 1 FROM ${EXECUTIONS} p
            WHERE p.id = q.parent_id AND p.state = 'running' AND p.leased_until > ${now} AND p.run_until > ${now}))
          AND (SELECT COUNT(*) FROM ${EXECUTIONS} a WHERE a.scope_key = q.scope_key AND a.warm_state IS NULL AND ${ACTIVE}
            AND a.capacity_class = q.capacity_class AND a.parent_id ${parentFilter}) < ?
          AND (q.concurrency_key IS NULL OR (
            (SELECT COUNT(*) FROM ${EXECUTIONS} a WHERE a.concurrency_key = q.concurrency_key AND a.warm_state IS NULL AND ${ACTIVE}) < q.concurrency_limit
            AND (SELECT COUNT(*) FROM ${EXECUTIONS} a WHERE a.concurrency_key = q.concurrency_key AND a.warm_state IS NULL AND ${ACTIVE})
              < COALESCE((SELECT MIN(a.concurrency_limit) FROM ${EXECUTIONS} a WHERE a.concurrency_key = q.concurrency_key AND ${ACTIVE}), q.concurrency_limit)))
          ORDER BY (SELECT COUNT(*) FROM ${EXECUTIONS} a WHERE a.scope_key = q.scope_key
            AND ${ACTIVE} AND a.capacity_class = q.capacity_class AND a.parent_id ${parentFilter}) ASC, q.created_at ASC, q.id ASC
          LIMIT 1
        `, [
          capacityClass,
          owner.nodeId,
          owner.generation,
          ...kinds,
          ...envKeys,
          ...fingerprints,
          ...(category === 'tool'
            ? warmIds
            : []),
          Number(canStartCold),
          cpu - Number(reserved.cpu),
          memory - Number(reserved.memory),
          pids - Number(reserved.pids),
          scratch - Number(reserved.scratch),
          config.maxRunningPerScope,
        ]))
      }
      try {
        if (!await eligible(reldb.sql, false))
          return ok(null)
      }
      catch {
        return unavailable()
      }
      return serialized(async (sql) => {
        const row = await eligible(sql, true)
        if (!row)
          return ok(null)
        const request = databaseValue<StoredRequest>(row.request_json)
        const standby = row.pool_fingerprint && warmIds.length
          ? data(await sql.get<ExecutionRow>(`
          SELECT * FROM ${EXECUTIONS} WHERE id IN (${warmIds.map(() => '?').join(',')}) AND pool_fingerprint = ?
            AND state = 'running' AND warm_state = 'ready' AND leased_until > ${now} ORDER BY created_at, id LIMIT 1`, [...warmIds, row.pool_fingerprint]))
          : null
        const changed = data(await sql.execute(`UPDATE ${EXECUTIONS} SET state = 'running', owner_node = ?, owner_generation = ?,
          container_json = ${resultValue}, owner_process_json = ${resultValue}, leased_until = ${now} + ?, run_until = ${now} + ?, updated_at = ${now}
          WHERE id = ? AND state = 'queued' AND queue_until > ${now}`, [
          owner.nodeId,
          owner.generation,
          standby?.container_json
            ? JSON.stringify(databaseValue<RunnerContainerIdentity>(standby.container_json))
            : null,
          request.environment ? null : processJson,
          config.leaseMs,
          request.runTimeoutMs,
          row.id,
        ]))
        if (changed.changes === 1 && standby) {
          const transferred = data(await sql.execute(`UPDATE ${EXECUTIONS} SET state = 'succeeded', warm_state = 'transferred', updated_at = ${now}
            WHERE id = ? AND owner_generation = ? AND state = 'running' AND warm_state = 'ready' AND leased_until > ${now}`, [standby.id, owner.generation]))
          if (transferred.changes !== 1)
            throw new Error('Warm container reservation expired')
        }
        return ok(changed.changes === 1
          ? {
              id: row.id,
              kind: row.kind,
              parentId: row.parent_id ?? undefined,
              warmId: standby?.id,
              request,
            }
          : null)
      })
    },

    async cancelOwned(id: string): Promise<HaiResult<void>> {
      const result = await reldb.sql.execute(`UPDATE ${EXECUTIONS} SET state = 'cancelling', updated_at = ${now}
        WHERE id = ? AND owner_generation = ? AND state = 'running' AND leased_until > ${now}`, [id, owner.generation])
      return result.success
        ? ok(undefined)
        : unavailable()
    },

    async recordContainer(id: string, container: RunnerContainerIdentity): Promise<HaiResult<void>> {
      const result = await reldb.sql.execute(`UPDATE ${EXECUTIONS} SET container_json = ${resultValue}
        WHERE id = ? AND owner_generation = ? AND state = 'running' AND container_json IS NULL
          AND leased_until > ${now} AND run_until > ${now}`, [
        JSON.stringify(container),
        id,
        owner.generation,
      ])
      return result.success && result.data.changes === 1
        ? ok(undefined)
        : lost()
    },

    async reconciliation(scope: RunnerScope, id: string) {
      try {
        const row = await find(reldb.sql, id, hash([scope.tenantId, scope.userId]))
        if (!row)
          return missing()
        if (row.state !== 'unknown' || row.owner_node !== owner.nodeId || row.reconciled_at !== null
          || !row.owner_generation) {
          return conflict()
        }
        if (row.container_json) {
          const container = databaseValue<RunnerContainerIdentity>(row.container_json)
          return container.engine === config.engine
            ? ok({ container, generation: row.owner_generation })
            : conflict()
        }
        if (row.environment_key !== null || !row.owner_process_json || !await parentSettled(reldb.sql, row))
          return conflict()
        return ok({
          container: undefined,
          process: databaseValue<RunnerProcessIdentity>(row.owner_process_json),
          generation: row.owner_generation,
        })
      }
      catch {
        return unavailable()
      }
    },

    async reconcile(scope: RunnerScope, id: string, generation: string, review: RunnerReconciliation): Promise<HaiResult<RunnerExecution>> {
      return serialized(async (sql) => {
        const scopeKey = hash([scope.tenantId, scope.userId])
        if (review.hostResourcesStopped) {
          const row = await find(sql, id, scopeKey)
          if (!row || !await parentSettled(sql, row))
            return conflict()
        }
        const proof = review.hostResourcesStopped
          ? 'container_json IS NULL AND environment_key IS NULL AND owner_process_json IS NOT NULL'
          : 'container_json IS NOT NULL'
        const result = data(await sql.execute(`UPDATE ${EXECUTIONS}
          SET reconciled_at = ${now}, reconciliation_json = ${resultValue}, reuse_key = NULL, updated_at = ${now}
          WHERE id = ? AND scope_key = ? AND owner_node = ? AND owner_generation = ? AND state = 'unknown'
            AND reconciled_at IS NULL AND ${proof}`, [
          JSON.stringify(review),
          id,
          scopeKey,
          owner.nodeId,
          generation,
        ]))
        if (result.changes !== 1)
          return conflict()
        const row = await find(sql, id, scopeKey)
        return row
          ? ok(projectRequest(row))
          : missing()
      })
    },

    async renew(id: string): Promise<HaiResult<'running' | 'cancelling'>> {
      const renewed = await reldb.sql.execute(`UPDATE ${EXECUTIONS} SET leased_until = ${now} + ?, updated_at = ${now}
        WHERE id = ? AND owner_generation = ? AND state IN ('running', 'cancelling') AND leased_until > ${now}`, [config.leaseMs, id, owner.generation])
      if (!renewed.success)
        return unavailable()
      if (renewed.data.changes !== 1)
        return lost()
      const row = await reldb.sql.get<{ state: 'running' | 'cancelling', parent_id: string | null }>(
        `SELECT state, parent_id FROM ${EXECUTIONS} WHERE id = ? AND owner_generation = ? AND leased_until > ${now}`,
        [id, owner.generation],
      )
      if (!row.success)
        return unavailable()
      if (!row.data)
        return lost()
      if (row.data.parent_id) {
        const parent = await reldb.sql.get<{ id: string }>(`SELECT id FROM ${EXECUTIONS} WHERE id = ?
          AND owner_generation = ? AND state = 'running' AND leased_until > ${now} AND run_until > ${now}`, [row.data.parent_id, owner.generation])
        if (!parent.success)
          return unavailable()
        if (!parent.data) {
          const cancelled = await this.cancelOwned(id)
          return cancelled.success
            ? ok('cancelling')
            : cancelled
        }
      }
      return ok(row.data.state)
    },

    async emit(id: string, value: RunnerJson): Promise<HaiResult<void>> {
      const encoded = JSON.stringify({ value })
      const bytes = Buffer.byteLength(encoded)
      const result = await reldb.tx.wrap(async (sql) => {
        const changed = data(await sql.execute(`UPDATE ${EXECUTIONS} SET event_sequence = event_sequence + 1, event_bytes = event_bytes + ?
          WHERE id = ? AND owner_generation = ? AND state = 'running' AND leased_until > ${now}
            AND run_until > ${now} AND event_sequence < ? AND event_bytes <= ?`, [
          bytes,
          id,
          owner.generation,
          config.maxEvents,
          MAX_EVENT_BYTES - bytes,
        ]))
        if (changed.changes !== 1)
          return lost()
        const row = data(await sql.get<{ event_sequence: number | string }>(`SELECT event_sequence FROM ${EXECUTIONS} WHERE id = ?`, [id]))
        const sequence = Number(row?.event_sequence)
        const published = data(await sql.execute(`INSERT INTO ${EVENTS} (id, execution_id, sequence_number, event_json, created_at)
          SELECT ?, ?, ?, ${resultValue}, ${now} FROM ${EXECUTIONS} q LEFT JOIN ${EXECUTIONS} p ON p.id = q.parent_id
          WHERE q.id = ? AND q.leased_until > ${now} AND q.run_until > ${now}
          AND (q.parent_id IS NULL OR (p.state = 'running' AND p.owner_generation = q.owner_generation
            AND p.leased_until > ${now} AND p.run_until > ${now}))`, [
          hash([id, sequence]),
          id,
          sequence,
          encoded,
          id,
        ]))
        if (published.changes !== 1)
          throw new Error('Event owner lost')
        return ok(undefined)
      })
      return result.success
        ? result.data
        : unavailable()
    },

    async events(scope: RunnerScope, id: string, after: number, limit: number): Promise<HaiResult<RunnerEvent[]>> {
      const owner = await reldb.sql.get<{ id: string }>(`SELECT id FROM ${EXECUTIONS} WHERE id = ? AND scope_key = ?`, [
        id,
        hash([scope.tenantId, scope.userId]),
      ])
      if (!owner.success)
        return unavailable()
      if (!owner.data)
        return missing()
      const page = await reldb.sql.query<{ sequence_number: number | string, event_json: { value: RunnerJson } | string, created_at: number | string }>(
        `SELECT sequence_number, event_json, created_at FROM ${EVENTS}
          WHERE execution_id = ? AND sequence_number > ? ORDER BY sequence_number ASC LIMIT ?`,
        [id, after, limit],
      )
      if (!page.success)
        return unavailable()
      try {
        return ok(page.data.map(row => ({
          sequence: Number(row.sequence_number),
          data: databaseValue<{ value: RunnerJson }>(row.event_json).value,
          createdAt: Number(row.created_at),
        })))
      }
      catch {
        return unavailable()
      }
    },

    async finish(id: string, output: RunnerJson | undefined, stopped: boolean): Promise<HaiResult<void>> {
      return serialized(async (sql) => {
        if (!stopped) {
          data(await sql.execute(`UPDATE ${EXECUTIONS} SET state = 'unknown', reason = 'cleanup-unconfirmed', updated_at = ${now}
            WHERE id = ? AND owner_generation = ? AND state IN ('running', 'cancelling') AND leased_until > ${now}`, [id, owner.generation]))
          return lost()
        }
        const child = data(await sql.get<{ parent_id: string | null }>(
          `SELECT parent_id FROM ${EXECUTIONS} WHERE id = ? AND owner_generation = ?`,
          [id, owner.generation],
        ))
        if (!child)
          return lost()
        const parentLock = reldb.config?.type === 'sqlite'
          ? ''
          : ' FOR UPDATE'
        const parent = child.parent_id
          ? data(await sql.get<ExecutionRow>(
              `SELECT * FROM ${EXECUTIONS} WHERE id = ?${parentLock}`,
              [child.parent_id],
            ))
          : null
        const parentUntil = child.parent_id
          ? parent?.state === 'running' && parent.owner_generation === owner.generation
            ? Math.min(Number(parent.leased_until), Number(parent.run_until))
            : 0
          : Number.MAX_SAFE_INTEGER
        const changed = data(await sql.execute(`UPDATE ${EXECUTIONS}
          SET result_json = CASE WHEN state = 'running' AND run_until > ${now} AND ? > ${now} THEN ${resultValue} ELSE NULL END,
            reason = CASE WHEN reason = 'run-timeout' OR run_until <= ${now} THEN 'run-timeout'
              WHEN ? <= ${now} THEN 'parent-ended' WHEN state = 'cancelling' THEN reason ELSE ? END,
            state = CASE WHEN reason = 'run-timeout' OR run_until <= ${now} THEN 'failed'
              WHEN state = 'cancelling' OR ? <= ${now} THEN 'cancelled' ELSE ? END,
            reuse_key = NULL, updated_at = ${now}
          WHERE id = ? AND owner_generation = ? AND state IN ('running', 'cancelling') AND leased_until > ${now}`, [
          parentUntil,
          output === undefined
            ? null
            : JSON.stringify({ value: output }),
          parentUntil,
          output === undefined
            ? 'handler-failed'
            : null,
          parentUntil,
          output === undefined
            ? 'failed'
            : 'succeeded',
          id,
          owner.generation,
        ]))
        if (changed.changes !== 1)
          return lost()
        data(await sql.execute(`UPDATE ${EXECUTIONS} SET state = 'cancelled', reason = 'parent-ended', updated_at = ${now} WHERE parent_id = ? AND state = 'queued'`, [id]))
        data(await sql.execute(`UPDATE ${EXECUTIONS} SET state = 'cancelling', reason = 'parent-ended', updated_at = ${now} WHERE parent_id = ? AND state = 'running'`, [id]))
        return ok(undefined)
      })
    },
  }
}
