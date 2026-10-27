# @h-ai/scheduler

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md) · [@h-ai/reldb](../reldb/README.en.md)

## Introduction

A scheduled task module with a unified task model, cron scheduling, JS function strings / HTTP API execution, persistence, execution log queries, and global task lifecycle hooks.

## Core features

- Run tasks on a cron schedule or trigger them from application code.
- Execute HTTP requests, trusted JavaScript and application hooks, with retry and cancellation.
- Persist tasks, execution journals and renewable leases in a shared database, with unknown-outcome isolation.

## Getting started

### Dependencies

- `@h-ai/reldb`: initialize the shared database first; tasks, execution journals and leases are mandatory, and `enableDb` accepts only true.

### Quick start

```ts
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'

await reldb.init({ type: 'sqlite', database: './scheduler.db' })

await scheduler.init({
  enableDb: true,
  maxLogs: 1000,
  retentionDays: 30,
  hooks: {
    onTaskStart(event) {
      void event
    },
  },
})

await scheduler.register({
  id: 'health-check',
  name: '健康检查',
  description: '每 5 分钟执行一次系统健康检查',
  cron: '*/5 * * * *',
  params: { channel: 'ops' },
  handler: {
    kind: 'api',
    url: 'https://api.example.com/health',
    method: 'GET',
    timeout: 10000,
  },
})

await scheduler.register({
  id: 'cleanup',
  name: '清理过期数据',
  description: '每日凌晨执行过期数据清理',
  cron: '0 2 * * *',
  deleteAfterRun: true,
  params: { source: 'nightly' },
  handler: {
    kind: 'js',
    code: '(context) => ({ taskId: context.taskId, params: context.params })',
  },
})

scheduler.start()

const manualResult = await scheduler.trigger('cleanup', { source: 'admin-console' })
const logs = await scheduler.getLogs({
  triggerType: 'manual',
  triggerSource: 'admin-console',
  startedAfter: Date.now() - 24 * 60 * 60 * 1000,
})

scheduler.stop()
await scheduler.close()
```

### Unified task model

```ts
interface TaskDefinition {
  id: string
  name: string
  description?: string
  cron: string
  timezone?: string // IANA 时区，例如 Asia/Shanghai；省略时为 UTC，不读取节点 TZ
  enabled?: boolean
  deleteAfterRun?: boolean
  idempotent?: boolean
  retry?: {
    maxAttempts: number
    backoffMs?: number[]
  }
  params?: Record<string, unknown>
  handler?: ApiTaskConfig | JsTaskConfig
}

interface ApiTaskConfig {
  kind: 'api'
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body?: unknown
  maxResponseBytes?: number
  timeout?: number
}

interface JsTaskConfig {
  kind: 'js'
  code: string // JS 函数字符串
  timeout?: number
}
```

Notes:

- All tasks can be persisted, including `kind: 'js'` tasks.
- JS tasks are compiled at runtime and cached by source to avoid recompilation on every trigger.
- `handler` can be omitted; use global `hooks.onTaskExecute` for execution in that case.

> ⚠️ **Security warning**: `kind: 'js'` is only for trusted server-side code. Node.js `vm` provides convenient execution and **is not a security sandbox**. Never accept arbitrary JS strings from users, tenants, or admin inputs. Prefer `kind: 'api'` or `hooks.onTaskExecute` for configurable tasks.

### Task lifecycle hooks

Provide hooks at initialization or set them at runtime with `setHooks()`:

```ts
await scheduler.init({
  enableDb: true,
  hooks: {
    onTaskStart(event) {
      void event
    },
    async onTaskExecute(event) {
      return { via: 'hook', source: event.context.trigger.source }
    },
    onTaskInterrupted(event) {
      void event
    },
    onTaskFinish(event) {
      void event
    },
  },
})
```

### Execution logs

Filter logs by trigger source:

```ts
const logs = await scheduler.getLogs({
  taskId: 'cleanup',
  triggerType: 'manual',
  triggerSource: 'admin-console',
  startedAfter: Date.now() - 24 * 60 * 60 * 1000,
  startedBefore: Date.now(),
  pagination: { page: 1, pageSize: 20 },
})
```

Execution logs support automatic cleanup policies configured at initialization:

- `maxLogs`: retain at most N logs.
- `retentionDays`: retain at most the last N days.

### API overview

- `init(config?)`
- `register(task)`
- `unregister(taskId)`
- `updateTask(taskId, updates)`
- `refreshTasks()`
- `start()` / `stop()`
- `trigger(taskId, { source?, idempotencyKey? })`
- `getLogs(options?)`
- `execution.listLogFailures(options?)` / `execution.repairLog(occurrenceId)`
- `execution.get(occurrenceId)` / `execution.listUnknown(options?)` / `execution.resolveUnknown(occurrenceId, input)`
- `setHooks(hooks)` / `clearHooks()`
- `tasks` / `hooks` / `config` / `isInitialized` / `isRunning`
- `close()`

### Error handling

All public APIs except `close()` return `HaiResult<T>`.

Common error codes:

| Error code                                | code                | Description                   |
| ----------------------------------------- | ------------------- | ----------------------------- |
| `HaiSchedulerError.NOT_INITIALIZED`       | `hai:scheduler:010` | Not initialized               |
| `HaiSchedulerError.INIT_FAILED`           | `hai:scheduler:011` | Initialization failed         |
| `HaiSchedulerError.CONFIG_ERROR`          | `hai:scheduler:012` | Invalid configuration         |
| `HaiSchedulerError.TASK_NOT_FOUND`        | `hai:scheduler:020` | Task not found                |
| `HaiSchedulerError.TASK_ALREADY_EXISTS`   | `hai:scheduler:021` | Task already exists           |
| `HaiSchedulerError.INVALID_CRON`          | `hai:scheduler:022` | Invalid cron expression       |
| `HaiSchedulerError.EXECUTION_FAILED`      | `hai:scheduler:023` | Execution failed              |
| `HaiSchedulerError.JS_EXECUTION_FAILED`   | `hai:scheduler:024` | JS execution failed           |
| `HaiSchedulerError.API_EXECUTION_FAILED`  | `hai:scheduler:025` | API execution failed          |
| `HaiSchedulerError.DB_SAVE_FAILED`        | `hai:scheduler:026` | Database save failed          |
| `HaiSchedulerError.ALREADY_RUNNING`       | `hai:scheduler:027` | Already running               |
| `HaiSchedulerError.NOT_RUNNING`           | `hai:scheduler:028` | Not running                   |
| `HaiSchedulerError.JS_COMPILE_FAILED`     | `hai:scheduler:030` | JS compilation failed         |
| `HaiSchedulerError.HOOK_EXECUTION_FAILED` | `hai:scheduler:031` | Hook execution failed         |
| `HaiSchedulerError.LOG_PERSIST_FAILED`    | `hai:scheduler:032` | Log persistence not confirmed |

### Runtime behavior and limits

All nodes must initialize the same shared RelDB first (PostgreSQL/MySQL for production across hosts; SQLite only for local processes that correctly share the same file). Task definitions, execution journals, active task slots and leases are persisted; `enableDb` accepts only true. Cache is no longer required. `leaseMs` defaults to 300000 and accepts 1000–86400000 milliseconds, with renewal during execution. Cron, manual and later periods share one active task slot; an expired owner cannot revive or commit. Nodes refresh definitions every `tickInterval`; `tasks` is the last successful snapshot. Failed reads, deletion, disabling or rescheduling interrupt stale attempts, without rolling back external effects.

`context.occurrenceId` persists across retries and nodes for a cron minute. Manual triggers accept a 1–128 character `idempotencyKey` to reuse the same record, otherwise each is independent. `executionToken` changes per claim; `sequence` and `attempt` identify the execution generation. API jobs override `Idempotency-Key`, `X-Scheduler-Sequence`, `X-Scheduler-Attempt` and `X-Scheduler-Task` (percent-encoded task ID). Claimed lifecycle callbacks expose the same ID in `event.context`; any callback side effects also need deduplication.

`idempotent` defaults to false. Set true only when the receiver atomically persists its deduplication ledger with every side effect. Expired running executions can be recovered with the same occurrenceId only under this declaration; non-idempotent jobs or executions that exhaust the stored retry.maxAttempts budget (default 1, range 1–100 including initial attempts and recovery) become `unknown` and retain the active task slot. A lease cannot revoke an external request already sent by a paused process; headers alone do not implement deduplication. Retries also follow this declaration.

Use `scheduler.execution.get(occurrenceId)` for authoritative state and `listUnknown({ limit, offset })` with limit 1–100 and offset 0–1000000. Trusted operators must confirm external effects and terminate the old runner before releasing its slot through `resolveUnknown(id, { status: 'success' | 'discarded', expectedUpdatedAt })`, which uses CAS. Never requeue unknown executions directly. `log.occurrenceId` is the receipt; `getLogs` contains observational attempt logs. Log retention does not delete the journal or idempotency history.

Each attempt has a stable UUID log `id`. `persistence.status` is independent of business `status`: `persisted` confirms both log storage and its receipt, `pending` means a committed business outcome still needs log projection, and `unconfirmed` means no committed outcome can be assumed. Only an owner with a valid lease can publish the terminal outcome and all attempt logs before projection. A stale owner cannot project success. Log failure never turns business success into failure or reruns the task.

Repair shrinks the pending list. Drain batches repeatedly at offset=0 instead of advancing the offset while repairing.

Trusted server operators monitor `execution.listLogFailures({ limit, offset })` with the same bounds as listUnknown and call `execution.repairLog(occurrenceId)` to replay logs from the shared journal across nodes, restarts, or concurrent calls. Stable primary keys and complete payload comparison handle committed writes with lost acknowledgements. `LOG_PERSIST_FAILED` (032) retains pending state and emits a safe warning. If the entire database is unavailable before the terminal commit, reconcile unknown effects; do not assume a recoverable outcome exists. Repair and retention never call business hooks. Retention failure only warns. `onTaskFinish` reports local business completion with unconfirmed persistence; use the trigger result and execution.get.logPersistence for confirmation.

Pre-claim interrupted events are observational logs without a committed outcome to repair; unacknowledged writes remain unconfirmed. JSON payloads preserve full results and all retries beyond MySQL's 255-character text mapping. Supported old logs are archived and copied by module migrations; execution ledgers remain separate. Closing waits for in-flight repairs; close scheduler before the database.

```ts
const result = await scheduler.trigger('cleanup', { idempotencyKey: 'cleanup-2026-10-23' })
if (!result.success)
  return result
if (result.data.persistence.status === 'pending' && result.data.occurrenceId) {
  const repaired = await scheduler.execution.repairLog(result.data.occurrenceId)
  if (!repaired.success)
    return repaired
}
// 不用日志补写失败重新 trigger 业务；定期按页扫描 listLogFailures。
```

`await scheduler.close()` stops intake, cancels HTTP, JS workers, and retry waits, then awaits execution chain exit before clearing state. Reinitialization waits for closure. All lifecycle events expose `signal`; hooks must observe cancellation and stop external side effects. The framework cannot terminate business code on the same thread; do not block the event loop in hooks. Cancelled old executions no longer retry, delete tasks, or call new-instance hooks. Keep the database available until scheduler closure completes, then close dependencies.

Each JS string runs in its own worker; `timeout` defaults to 30000 ms including startup. On timeout, terminate the thread and await exit before logging failure or retrying. Synchronous infinite loops cannot block the main event loop. Context and results must support structured cloning. A worker's `vm` is still not a security sandbox; code must come from trusted server-side sources.

API task `timeout` (default 30000 ms) covers the request and full response body read. `ApiTaskConfig.maxResponseBytes` limits received body bytes (positive safe integer; default 1048576, or 1 MiB). `maxResponseBytes: 10 * 1024 * 1024` allows 10 MiB. Invalid values fail before the request. Timeouts, size limits, and non-success HTTP statuses become unknown by default; bounded retry applies only when idempotency is declared.

`init()` succeeds only after loading all tasks. Empty or duplicate IDs (including persisted duplicates), invalid cron, database read failures, and persisted-task parse failures return failure and clear initialization state. Correct configuration or data before retrying. Do not redeclare existing database tasks in `tasks`.

Cron is matched by minute; the same minute determines a persistent occurrenceId. Delayed ticks still check the current minute once per running scheduler.

Claim, begin, renewal, completion, expiration scans and isolation calculate/check lease deadlines inside the database statement using its clock: PostgreSQL clock_timestamp, MySQL SYSDATE(3), or SQLite now. Reading a time first cannot replace the final atomic deadline condition. Cron uses DB time for both the minute occurrence and expression matching. An omitted timezone means UTC; an explicit IANA timezone changes only wall-time interpretation, while node TZ does not change matching or identity. Node Date.now is diagnostic only; opposing node clocks cannot take over early or revive expired ownership. A write waiting on a row lock must still pass its deadline before publishing success. Keep the database service clock trustworthy; unknown external effects still require reconciliation rather than automatic replay.

### Optional integrations

When a scheduled task sends Reach notifications, a scheduler lock or task completion does not guarantee one external delivery. Follow [Reach queue semantics](../reach/README.en.md) with persistent queueId keys. HTTP receivers must atomically persist deduplication with their side effects. Review unknown in-flight SMTP/SMS outcomes manually; scheduler retries must not blindly send them again.

## Legacy database upgrades

Definition refresh, registration, update and deletion are coordinated in arrival order within each process, including a mutation's refresh and commit. Valid concurrent registrations no longer fail merely because snapshots interleave; actual database failures still return errors. close stops entry points and the runner, cancels read waits and operations that have not started writing, then drains active persistent writes. Late snapshots cannot publish or repopulate state afterward. Business callbacks do not hold this queue. Nodes still rely on the shared database, versions and leases; local coordination is not a distributed lock.

After RelDB init, `migrateScheduler({ dryRun: true })` previews changes; scheduler.init applies supported migrations before repositories. Existing tasks retain data with idempotent=false. Legacy logs are archived as hai_scheduler_logs_alpha65 and copied with stable legacy:<id> keys, preserving complete snapshots without re-executing tasks or duplicating history after interruption. SQLite/PostgreSQL roll back transactions; MySQL resumes from actual structure with old writers stopped. Back up first and restore matching database/binaries for rollback.

## Development and testing

```bash
pnpm --filter @h-ai/scheduler test
```

Declaration JSDoc examples import real public entries. Internal repositories, the runner, compiler and cron helpers are marked as internal module context and are not root exports. Examples distinguish HaiResult, explicit cancellation rejection, and close returning Promise<void>; business status and log persistence remain separate, and log repair never reruns business work. Maintainers can run `node scripts/check-module-jsdoc.mjs --package scheduler` to check declaration coverage and real types. Compiling examples does not replace shared-database and independent-process validation.

## License

Apache-2.0
