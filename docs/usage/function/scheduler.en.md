# @h-ai/scheduler API reference

<!-- translation: partial -->

[Chinese source](scheduler.md) · [Configuration](../configuration/scheduler.en.md) · [Data structures](../data/scheduler.en.md)

## Quick start

Register tasks before starting the scheduler. Provide stable task IDs and make retriable handlers idempotent. Confirm uncertain external effects before replaying them.

This example uses in-memory SQLite and triggers the task once. It does not wait for cron or send network requests. Check `run.status` after the trigger succeeds: the scheduler can return a record for a failed task. Here the status should be `success`, and `logs.items` should contain one record. For recurring schedules, register the tasks and call `scheduler.start()`. Run it in a development environment (for example, `NODE_ENV=development`). Production mode requires a database shared across nodes.

```ts
import type { HaiResult } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'

function dataOrThrow<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

// Start the development database in in-memory SQLite. Success has no data; a database failure stops scheduler startup.
dataOrThrow(await reldb.init({ type: 'sqlite', database: ':memory:' }))

try {
  // Prepare scheduler tables on RelDB and install the hook that returns the task ID. Initialization failure stops registration.
  dataOrThrow(await scheduler.init({
    hooks: {
      onTaskExecute: ({ context }) => ({ taskId: context.taskId }),
    },
  }))
  try {
    // Register daily for 02:00 each day. Success has no data; an existing ID or invalid schedule fails.
    dataOrThrow(await scheduler.register({ id: 'daily', name: 'Daily report', cron: '0 2 * * *' }))
    // Run daily manually with source docs. A returned execution log still requires checking status.
    const run = dataOrThrow(await scheduler.trigger('daily', { source: 'docs' }))
    if (run.status !== 'success')
      throw new Error(run.error ?? 'Task did not succeed')

    // Read the first 20 daily execution logs from source docs. This run should produce one item; query errors throw.
    const logs = dataOrThrow(await scheduler.getLogs({
      taskId: 'daily',
      triggerSource: 'docs',
      pagination: { page: 1, pageSize: 20 },
    }))
    if (logs.items.length !== 1)
      throw new Error('Expected one execution record')
  }
  finally {
    // Close the scheduler with no arguments, stopping new claims and awaiting shutdown. No business data is returned.
    await scheduler.close()
  }
}
finally {
  // Close the database after the scheduler. Success has no data; dataOrThrow throws on failure.
  dataOrThrow(await reldb.close())
}
```

<a id="api-list"></a>

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Import the module as in the quick start. Except for lifecycle examples, run scenarios after initialization and before closure. The value helper checks HaiResult.success and preserves the original error. Use isolated test data and explicit cleanup.

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="task-definitions"></a>

### Prepare and maintain tasks: `scheduler`

Register task definitions after connecting RelDB, and distinguish stored definitions from the local scheduler snapshot.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `scheduler.init` | Prepare database tables using an already connected RelDB | `config? = {}` | `Promise<HaiResult<void>>` | `await scheduler.init()` |
| `scheduler.close` | Stop this instance and wait for its cleanup; the app closes RelDB | None | `Promise<void>` | `await scheduler.close()` |
| `scheduler.register` | Register a task definition | `task: TaskDefinition` | `Promise<HaiResult<void>>` | `await scheduler.register(task)` |
| `scheduler.unregister` | Remove a task definition | `taskId` | `Promise<HaiResult<void>>` | `await scheduler.unregister('daily')` |
| `scheduler.updateTask` | Update a task definition | `taskId, updates` | `Promise<HaiResult<void>>` | `await scheduler.updateTask('daily', { enabled: false })` |
| `scheduler.refreshTasks` | Read the current process task snapshot | None | `Promise<HaiResult<void>>` | `await scheduler.refreshTasks()` |

#### Scenario: Prepare and maintain tasks

```ts
// Register demo-daily for 02:00 UTC each day. Success has no data; value throws on invalid input.
value(await scheduler.register({ id: 'demo-daily', name: 'Demo daily', cron: '0 2 * * *', timezone: 'UTC' }))
// Disable the registered demo-daily task without deleting it. value throws if the update fails.
value(await scheduler.updateTask('demo-daily', { enabled: false }))
// Reload this node's task definitions from storage without arguments. Success has no data; a read error fails.
value(await scheduler.refreshTasks())
// Remove the demo-daily definition by ID. Success has no data; value throws on a storage error.
value(await scheduler.unregister('demo-daily'))
// Each successful result has no business data; only the stored definition changes.
```

The input schedules 02:00 UTC daily. Registration alone does not start scheduling. The quick start handles init’s HaiResult and close’s Promise<void>.

The last four entries are optional callbacks. Register them with `scheduler.init({ hooks })` or `scheduler.setHooks(hooks)`; the application does not need to call them directly.

[Detailed parameters and workflows](scheduler.md#task-definitions)

<a id="execution"></a>

### Start scheduling and inspect logs: `scheduler`

start enables timed claims, trigger requests a specific execution, and stop prevents future scheduling without undoing external effects.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `scheduler.start` | Start scheduling | None | `HaiResult<void>` | `scheduler.start()` |
| `scheduler.stop` | Stop scheduling new work | None | `HaiResult<void>` | `scheduler.stop()` |
| `scheduler.trigger` | Trigger a task manually | `taskId, { source?, idempotencyKey? }?` | `Promise<HaiResult<TaskExecutionLog>>` | `await scheduler.trigger('daily', { source: 'admin-console' })` |
| `scheduler.getLogs` | Paginate execution logs | `options?; pagination.page = 1, pageSize = 20` | `Promise<HaiResult<PaginatedResult<TaskExecutionLog>>>` | `await scheduler.getLogs({ pagination: { page: 1, pageSize: 20 } })` |

#### Scenario: Start scheduling and inspect logs

Cron and manual triggers identify an occurrenceId. Nodes contend for database-owned execution; this focuses on expiry of a previous attempt.

![Shared scheduling: when takeover is allowed](../images/function-scheduler-timeout.en.svg)

Claim, renewal and final writes verify database time and the active execution token. Takeover with the same occurrenceId requires declared safe retries and remaining attempts. Otherwise unknown pauses later occurrences for reconciliation. Lease expiry does not undo an HTTP request or other external effect.

After initialization and task registration, start/stop return synchronous HaiResult<void> and control polling. Check the status inside a successful trigger result; logs are filtered by this source.

```ts
async function runAndRead(taskId: string) {
  // Start cron polling with no arguments. Success has no data; value throws if the scheduler is unavailable.
  value(scheduler.start())
  try {
    // Trigger the supplied task with source docs-console. The returned record's status describes the execution outcome.
    const run = value(await scheduler.trigger(taskId, { source: 'docs-console' }))
    // Query page 1 of the task's docs-console logs with up to 20 entries. items may be empty; value throws on lookup failure.
    const logs = value(await scheduler.getLogs({ taskId, triggerSource: 'docs-console', pagination: { page: 1, pageSize: 20 } }))
    return { status: run.status, logs: logs.items }
  }
  finally {
    // Stop future scheduled claims with no arguments. Success has no data; external effects already started remain.
    value(scheduler.stop())
  }
}
```

<a id="hooks"></a>

### Integrate execution hooks: `scheduler.setHooks`

Register business execution and lifecycle callbacks; each callback receives the scheduler’s current execution context.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `scheduler.setHooks` | Set executors and lifecycle hooks | `hooks: SchedulerTaskHooks` | `HaiResult<void>` | `scheduler.setHooks({ onTaskExecute })` |
| `scheduler.clearHooks` | Clear current hooks | None | `HaiResult<void>` | `scheduler.clearHooks()` |

#### Scenario: Integrate execution hooks

The onTask* fields are callbacks passed to setHooks and called by the scheduler. A handler-free task uses onTaskExecute; the output contains start/finish events and a successful run.

```ts
const events: Array<{ stage: string, taskId: string }> = []
// Install the callbacks below for start, interruption, and finish events. Success updates the host hooks; value throws if unavailable.
value(scheduler.setHooks({
  onTaskStart: event => { events.push({ stage: 'start', taskId: event.task.id }) },
  onTaskExecute: event => ({ taskId: event.context.taskId }),
  onTaskInterrupted: event => { events.push({ stage: 'interrupted', taskId: event.task.id }) },
  onTaskFinish: event => { events.push({ stage: 'finish', taskId: event.task.id }) },
}))
// Register demo-hook at 02:00 daily so hooks can be observed. Success has no data; a duplicate ID fails.
value(await scheduler.register({ id: 'demo-hook', name: 'Hook demo', cron: '0 2 * * *' }))
// Trigger demo-hook manually to produce hook events. Inspect status on the execution log.
const run = value(await scheduler.trigger('demo-hook'))
// run.status === 'success'; events contains start and finish for demo-hook.
// Remove the example demo-hook definition. Success has no data; value throws on failure.
value(await scheduler.unregister('demo-hook'))
// Clear the registered host hooks with no arguments. Success has no data.
value(scheduler.clearHooks()) // undefined; future tasks no longer use these callbacks
```

<a id="recovery"></a>

### Reconcile unknown outcomes and repair logs: `scheduler.execution`

Check external effects when execution is uncertain. Repair a missing log without rerunning the business operation.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `scheduler.execution.get` | Read an execution by ID | `occurrenceId` | `Promise<HaiResult<SchedulerExecutionEntry \| null>>` | `await scheduler.execution.get(occurrenceId)` |
| `scheduler.execution.listUnknown` | Paginate unknown executions | `{ limit?, offset? }` (defaults: 50, 0) | `Promise<HaiResult<SchedulerExecutionEntry[]>>` | `await scheduler.execution.listUnknown({ limit: 20 })` |
| `scheduler.execution.listLogFailures` | List execution log failures | `{ limit?, offset? }` (defaults: 50, 0) | `Promise<HaiResult<SchedulerExecutionEntry[]>>` | `await scheduler.execution.listLogFailures({ limit: 20 })` |
| `scheduler.execution.repairLog` | Repair a reconciled execution log | `occurrenceId` | `Promise<HaiResult<void>>` | `await scheduler.execution.repairLog(occurrenceId)` |
| `scheduler.execution.resolveUnknown` | Reconcile an execution outcome | `occurrenceId, { status, expectedUpdatedAt }` | `Promise<HaiResult<void>>` | `await scheduler.execution.resolveUnknown(occurrenceId, { status: 'success', expectedUpdatedAt })` |

#### Scenario: Reconcile unknown outcomes and repair logs

Log repair never executes business work. The separate resolution function accepts an externally verified decision and commits only against the latest updatedAt.

```ts
async function repairPendingLogs() {
  // Read up to 20 executions with log-write failures from offset 0. With none pending, the result is empty.
  const pending = value(await scheduler.execution.listLogFailures({ limit: 20, offset: 0 }))
  for (const entry of pending)
    // Repair the observation log for this occurrence ID. Success has no data and does not rerun the task.
    value(await scheduler.execution.repairLog(entry.occurrenceId))
  return pending.length // at most 20; the next scan starts at offset 0 again
}
async function recordVerifiedOutcome(occurrenceId: string, status: 'success' | 'discarded') {
  // Read up to 20 unknown executions awaiting reconciliation from offset 0. No match gives an empty array.
  const unknown = value(await scheduler.execution.listUnknown({ limit: 20, offset: 0 }))
  // Look up the reconciled occurrence and its update time. A missing occurrence returns null.
  const current = value(await scheduler.execution.get(occurrenceId))
  if (current?.status !== 'unknown')
    throw new Error('Expected an unknown execution')
  // Record the verified success or discarded outcome against the observed update time. Success has no data; changed state fails.
  value(await scheduler.execution.resolveUnknown(occurrenceId, { status, expectedUpdatedAt: current.updatedAt }))
  // Read the same occurrence after reconciliation. value still throws if the independent read fails.
  return { scanned: unknown.length, entry: value(await scheduler.execution.get(occurrenceId)) }
}
```
