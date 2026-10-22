# @h-ai/scheduler

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/cache](../cache/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/reldb](../reldb/README.en.md)

## Introduction

A scheduled task module with a unified task model, cron scheduling, JS function strings / HTTP API execution, persistence, execution log queries, and global task lifecycle hooks.

## Core features

- Run tasks on a cron schedule or trigger them from application code.
- Execute HTTP requests, trusted JavaScript and application hooks, with retry and cancellation.
- Optionally persist tasks and logs; use shared cache for scheduling locks across nodes.

## Getting started

### Dependencies

- `@h-ai/reldb`: task and execution log persistence; initialize first when `enableDb: true`.
- `@h-ai/cache`: optional distributed locks; automatically participates in scheduled lock acquisition when initialized.

### Quick start

```ts
import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'

await reldb.init({ type: 'sqlite', database: './scheduler.db' })
await cache.init({ type: 'memory' }) // 可选

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
  retry: { maxAttempts: 3, backoffMs: [1000, 5000] },
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
  timezone?: string // IANA 时区，例如 Asia/Shanghai；按该时区解释 cron 墙上时间
  enabled?: boolean
  deleteAfterRun?: boolean
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
  enableDb: false,
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
- `trigger(taskId, { source? })`
- `getLogs(options?)`
- `setHooks(hooks)` / `clearHooks()`
- `tasks` / `hooks` / `config` / `isInitialized` / `isRunning`
- `close()`

### Error handling

All public APIs except `close()` return `HaiResult<T>`.

Common error codes:

| Error code                                | code                | Description             |
| ----------------------------------------- | ------------------- | ----------------------- |
| `HaiSchedulerError.NOT_INITIALIZED`       | `hai:scheduler:010` | Not initialized         |
| `HaiSchedulerError.INIT_FAILED`           | `hai:scheduler:011` | Initialization failed   |
| `HaiSchedulerError.CONFIG_ERROR`          | `hai:scheduler:012` | Invalid configuration   |
| `HaiSchedulerError.TASK_NOT_FOUND`        | `hai:scheduler:020` | Task not found          |
| `HaiSchedulerError.TASK_ALREADY_EXISTS`   | `hai:scheduler:021` | Task already exists     |
| `HaiSchedulerError.INVALID_CRON`          | `hai:scheduler:022` | Invalid cron expression |
| `HaiSchedulerError.EXECUTION_FAILED`      | `hai:scheduler:023` | Execution failed        |
| `HaiSchedulerError.JS_EXECUTION_FAILED`   | `hai:scheduler:024` | JS execution failed     |
| `HaiSchedulerError.API_EXECUTION_FAILED`  | `hai:scheduler:025` | API execution failed    |
| `HaiSchedulerError.DB_SAVE_FAILED`        | `hai:scheduler:026` | Database save failed    |
| `HaiSchedulerError.ALREADY_RUNNING`       | `hai:scheduler:027` | Already running         |
| `HaiSchedulerError.NOT_RUNNING`           | `hai:scheduler:028` | Not running             |
| `HaiSchedulerError.LOCK_ACQUIRE_FAILED`   | `hai:scheduler:029` | Lock acquisition failed |
| `HaiSchedulerError.JS_COMPILE_FAILED`     | `hai:scheduler:030` | JS compilation failed   |
| `HaiSchedulerError.HOOK_EXECUTION_FAILED` | `hai:scheduler:031` | Hook execution failed   |

### Runtime behavior and limits

With the database enabled, nodes refresh persisted definitions every `tickInterval` (default 1000 ms); `tasks` is the latest successful snapshot. Registration, updates, deletion, manual triggers, and each attempt after acquiring a scheduling lock reread definitions. Deleted, disabled, or rescheduled old tasks stop executing; read failures abort the attempt. Already-started business side effects are not rolled back by remote changes. `init({ tasks })` remains node-local; use persisted `register()` for dynamic tasks across nodes. Cross-node deduplication requires shared Redis; memory cache is single-process only.

Call `await scheduler.refreshTasks()` to refresh without execution; concurrent refreshes of the same snapshot share one read. Registration, updates, and deletion change memory only after successful persistence. Invalid full updates leave cron unchanged. Pass `retry: null` or `handler: null` to clear retries or built-in handlers.

Hook business errors are recorded as `failed` and apply `retry`; missing handlers, cancellation, or host-thrown `SchedulerTaskSkippedError` are `interrupted`. `event.context.occurrenceId` identifies an occurrence: the same scheduled minute shares it across nodes, each manual trigger is independent, and retries reuse the original. Hosts can persist idempotency receipts with this ID; long tasks spanning periods still need a host-maintained lease for mutual exclusion. `deleteAfterRun` deletes only after success. Definitions are checked before retry and successful cleanup; one database DELETE atomically matches the executed definition, preserving concurrent updates.

Multi-node regression tests build current source and start two real Node processes sharing SQLite and Testcontainers Redis, validating definition convergence and same-minute lock contention. A working Docker/Podman service is required before `pnpm --filter @h-ai/scheduler test`.

`await scheduler.close()` stops task intake, cancels HTTP, JS workers, and retry waits, then awaits execution chain exit before clearing state. Reinitialization waits for closure. All lifecycle events expose `signal`; hooks must observe cancellation and stop external side effects. The framework cannot terminate business code on the same thread; do not block the event loop in hooks. Cancelled old executions no longer retry, delete tasks, or call new-instance hooks. Keep the database and cache available until scheduler closure completes, then close dependencies.

Each JS string runs in its own worker; `timeout` defaults to 30000 ms including startup. On timeout, terminate the thread and await exit before logging failure or retrying. Synchronous infinite loops cannot block the main event loop. Context and results must support structured cloning. A worker's `vm` is still not a security sandbox; code must come from trusted server-side sources.

API task `timeout` (default 30000 ms) covers the request and full response body read. `ApiTaskConfig.maxResponseBytes` limits received body bytes (positive safe integer; default 1048576, or 1 MiB). `maxResponseBytes: 10 * 1024 * 1024` allows 10 MiB. Invalid values fail before the request. Timeouts, size limits, and non-success HTTP statuses are logged as failures and apply task retries.

`init()` succeeds only after loading all tasks. Empty or duplicate IDs (including persisted duplicates), invalid cron, database read failures, and persisted-task parse failures return failure and clear initialization state. Correct configuration or data before retrying. Do not redeclare existing database tasks in `tasks`.

### Optional integrations

Cron is matched by minute, and distributed lock keys use that same minute. Startup or ticks delayed beyond second zero still check the current minute; a running scheduler does not reschedule it on every tick.

## Development and testing

```bash
pnpm --filter @h-ai/scheduler test
```

## License

Apache-2.0
