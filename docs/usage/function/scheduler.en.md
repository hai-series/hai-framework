# @h-ai/scheduler API reference

<!-- translation: partial -->

[Chinese source](scheduler.md) · [Configuration](../configuration/scheduler.en.md) · [Data structures](../data/scheduler.en.md)

## Quick start

Register tasks before starting the scheduler. Provide stable task IDs and make retriable handlers idempotent. Confirm uncertain external effects before replaying them.

This example uses in-memory SQLite and triggers the task once. It does not wait for cron or send network requests. Check `run.status` after the trigger succeeds: the scheduler can return a record for a failed task. Here the status should be `success`, and `logs.items` should contain one record. For recurring schedules, register the tasks and call `scheduler.start()`. Run it in a development environment (for example, `NODE_ENV=development`). Production mode requires a database shared across nodes.

```ts
// Standalone startup/shutdown script: throw the original error at this boundary; HaiResult business functions should return failed results.
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'

// Start the development database in in-memory SQLite. Success has no data; a database failure stops scheduler startup.
const initResult = await reldb.init({ type: 'sqlite', database: ':memory:' })
if (!initResult.success)
  throw new Error(initResult.error.message, { cause: initResult.error })

try {
  // Prepare scheduler tables on RelDB and install the hook that returns the task ID. Initialization failure stops registration.
  const initResult2 = await scheduler.init({
    hooks: {
      onTaskExecute: ({ context }) => ({ taskId: context.taskId }),
    },
  })
  if (!initResult2.success)
    throw new Error(initResult2.error.message, { cause: initResult2.error })
  try {
    // Register daily for 02:00 each day. Success has no data; an existing ID or invalid schedule fails.
    const registerResult = await scheduler.register({ id: 'daily', name: 'Daily report', cron: '0 2 * * *' })
    if (!registerResult.success)
      throw new Error(registerResult.error.message, { cause: registerResult.error })
    // Run daily manually with source docs. A returned execution log still requires checking status.
    const triggerResult = await scheduler.trigger('daily', { source: 'docs' })
    if (!triggerResult.success)
      throw new Error(triggerResult.error.message, { cause: triggerResult.error })
    const run = triggerResult.data
    if (run.status !== 'success')
      throw new Error(run.error ?? 'Task did not succeed')

    // Read the first 20 daily execution logs from source docs. This run should produce one item; throw the original query error at this script boundary on failure.
    const getLogsResult = await scheduler.getLogs({
      taskId: 'daily',
      triggerSource: 'docs',
      pagination: { page: 1, pageSize: 20 },
    })
    if (!getLogsResult.success)
      throw new Error(getLogsResult.error.message, { cause: getLogsResult.error })
    const logs = getLogsResult.data
    if (logs.items.length !== 1)
      throw new Error('Expected one execution record')
  }
  finally {
    // Close the scheduler with no arguments, stopping new claims and awaiting shutdown. No business data is returned.
    await scheduler.close()
  }
}
finally {
  // Close the database after the scheduler. Success has no data; throw the original cleanup error at this script boundary on failure.
  const closeResult = await reldb.close()
  if (!closeResult.success)
    throw new Error(closeResult.error.message, { cause: closeResult.error })
}
```

<a id="api-list"></a>

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Import the module as in the quick start. Except for lifecycle examples, run scenarios after initialization and before closure. Each call checks HaiResult.success before reading data and returns the original failed result to its caller. Scenarios without a function declaration are fragments inside an async application function. Use isolated test data and explicit cleanup.

<a id="task-definitions"></a>

### Prepare and maintain tasks: `scheduler`

Register task definitions after connecting RelDB, and distinguish stored definitions from the local scheduler snapshot.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `scheduler.init(config?)` | Prepare database tables using an already connected RelDB | `config? = {}` | `Promise<HaiResult<void>>` | `await scheduler.init()` |
| `scheduler.close()` | Stop this instance and wait for its cleanup; the app closes RelDB | None | `Promise<void>` | `await scheduler.close()` |
| `scheduler.register(task)` | Register a task definition | `task: TaskDefinition` Required definition. See [registration fields](#scheduler-task-fields) | `Promise<HaiResult<void>>` | `await scheduler.register(task)` |
| `scheduler.unregister(taskId)` | Remove a task definition | `taskId: string` Registered ID of the target task | `Promise<HaiResult<void>>` | `await scheduler.unregister('daily')` |
| `scheduler.updateTask(taskId, updates)` | Update a task definition | `taskId: string` Registered ID of the target task. `updates: TaskUpdateInput` Required changes. Omitted fields keep their current values. See [update fields](#scheduler-task-fields) | `Promise<HaiResult<void>>` | `await scheduler.updateTask('daily', { enabled: false })` |
| `scheduler.refreshTasks()` | Read the current process task snapshot | None | `Promise<HaiResult<void>>` | `await scheduler.refreshTasks()` |

<a id="scheduler-task-fields"></a>

**Task definition and update fields**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `id` | `string` | Required | Unique task ID when registering. Updates take taskId separately. |
| `name / cron` | `string` | Required when registering | Display name and five-field cron (minute, hour, day, month, weekday). Omitted update fields keep their current value. |
| `description` | `string` | Optional | Describe what the task does. |
| `timezone` | `string` | `UTC` | IANA timezone for interpreting the cron. Updating to null restores UTC. |
| `enabled / deleteAfterRun / idempotent` | `boolean` | `true / false / false` | Controls scheduling, removal after execution, and whether all side effects are durably deduplicated. |
| `retry` | `TaskRetryPolicy` | Optional | Set a failure retry policy. Update to null to clear it. Unknown outcomes follow reconciliation. |
| `params` | `TaskParams` | Optional | Business arguments supplied to the task handler. |
| `handler` | `TaskHandlerConfig` | Optional | See the execution scenario for API and JS shapes. Update to null to clear the built-in handler and allow the global hook to run it. |

Updating an existing `daily` task with `{ timezone: null, enabled: false }` stops scheduling it. It keeps its cron and will interpret it in UTC when enabled again.

#### Scenario: Prepare and maintain tasks

```ts
// Fragment inside an async application function; return failed results to its caller.
// Register demo-daily for 02:00 UTC each day. Success has no data; return the failed result on invalid input.
const registerResult = await scheduler.register({ id: 'demo-daily', name: 'Demo daily', cron: '0 2 * * *', timezone: 'UTC' })
if (!registerResult.success)
  return registerResult
// Disable the registered demo-daily task without deleting it. Return the failed result if the update fails.
const updateTaskResult = await scheduler.updateTask('demo-daily', { enabled: false })
if (!updateTaskResult.success)
  return updateTaskResult
// Reload this node's task definitions from storage without arguments. Success has no data; a read error fails.
const refreshTasksResult = await scheduler.refreshTasks()
if (!refreshTasksResult.success)
  return refreshTasksResult
// Remove the demo-daily definition by ID. Success has no data; return the failed result on a storage error.
const unregisterResult = await scheduler.unregister('demo-daily')
if (!unregisterResult.success)
  return unregisterResult
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
| `scheduler.start()` | Start scheduling | None | `HaiResult<void>` | `scheduler.start()` |
| `scheduler.stop()` | Stop scheduling new work | None | `HaiResult<void>` | `scheduler.stop()` |
| `scheduler.trigger(taskId, options?)` | Trigger a task manually | Required `taskId: string` selects the task. See [fields](#scheduler-trigger-query-fields) for optional `options: TriggerTaskInput`. | `Promise<HaiResult<TaskExecutionLog>>` | `await scheduler.trigger('daily', { source: 'admin-console' })` |
| `scheduler.getLogs(options?)` | Paginate execution logs | Optional `options: LogQueryOptions` filters and pages the logs. See [fields](#scheduler-trigger-query-fields). | `Promise<HaiResult<PaginatedResult<TaskExecutionLog>>>` | `await scheduler.getLogs({ pagination: { page: 1, pageSize: 20 } })` |

<a id="scheduler-trigger-query-fields"></a>

**Manual trigger and log filters**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `TriggerTaskInput.source` | `string` | No source label | Label the caller in the log, such as admin-console. |
| `TriggerTaskInput.idempotencyKey` | `string` | Optional | 1–128 characters. The same task and key identify one durable execution. Repeated requests do not rerun it. |
| `LogQueryOptions.taskId / triggerSource` | `string` | Optional | Filter by task and manual trigger source. |
| `LogQueryOptions.status` | `'success' \| 'failed' \| 'interrupted' \| 'unknown'` | Optional | Filter by the recorded outcome. |
| `LogQueryOptions.triggerType` | `'scheduled' \| 'manual'` | Optional | Select scheduled or manual executions. |
| `LogQueryOptions.startedAfter / startedBefore` | `number` | Optional | Inclusive Unix-millisecond bounds on start time. |
| `LogQueryOptions.pagination` | `PaginationOptionsInput` | Page 1, 20 rows | Set page and pageSize. |

Querying with `{ taskId: "daily", triggerType: "manual", pagination: { page: 1, pageSize: 5 } }` returns only that task’s manual runs, with up to five on the first page.

#### Scenario: Start scheduling and inspect logs

Cron and manual triggers identify an occurrenceId. Nodes contend for database-owned execution; this focuses on expiry of a previous attempt.

![Shared scheduling: when takeover is allowed](../images/function-scheduler-timeout.en.svg)

Claim, renewal and final writes verify database time and the active execution token. Takeover with the same occurrenceId requires declared safe retries and remaining attempts. Otherwise unknown pauses later occurrences for reconciliation. Lease expiry does not undo an HTTP request or other external effect.

After initialization and task registration, start/stop return synchronous HaiResult<void> and control polling. Check the status inside a successful trigger result; logs are filtered by this source.

```ts
async function runAndRead(taskId: string) {
  // Start cron polling with no arguments. Success has no data; return the failed result if the scheduler is unavailable.
  const startResult = scheduler.start()
  if (!startResult.success)
    return startResult
  try {
    // Trigger the supplied task with source docs-console. The returned record's status describes the execution outcome.
    const runResult = await scheduler.trigger(taskId, { source: 'docs-console' })
    if (!runResult.success)
      return runResult
    const run = runResult.data
    // Query page 1 of the task's docs-console logs with up to 20 entries. items may be empty; return the failed result on lookup failure.
    const logsResult = await scheduler.getLogs({ taskId, triggerSource: 'docs-console', pagination: { page: 1, pageSize: 20 } })
    if (!logsResult.success)
      return logsResult
    const logs = logsResult.data
    return { status: run.status, logs: logs.items }
  }
  finally {
    // Stop future scheduled claims with no arguments. Success has no data; external effects already started remain.
    const stopResult = scheduler.stop()
    if (!stopResult.success)
      return stopResult
  }
}
```

<a id="hooks"></a>

### Integrate execution hooks: `scheduler.setHooks`

Register business execution and lifecycle callbacks; each callback receives the scheduler’s current execution context.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `scheduler.setHooks(hooks)` | Set executors and lifecycle hooks | `hooks: SchedulerTaskHooks` Sets start, execute, interruption, and finish hooks. See the lifecycle guidance below | `HaiResult<void>` | `scheduler.setHooks({ onTaskExecute })` |
| `scheduler.clearHooks()` | Clear current hooks | None | `HaiResult<void>` | `scheduler.clearHooks()` |

#### Scenario: Integrate execution hooks

The onTask* fields are callbacks passed to setHooks and called by the scheduler. A handler-free task uses onTaskExecute; the output contains start/finish events and a successful run.

```ts
// Fragment inside an async application function; return failed results to its caller.
const events: Array<{ stage: string, taskId: string }> = []
// Install the callbacks below for start, interruption, and finish events. Success updates the host hooks; return the failed result if unavailable.
const setHooksResult = scheduler.setHooks({
  onTaskStart: event => { events.push({ stage: 'start', taskId: event.task.id }) },
  onTaskExecute: event => ({ taskId: event.context.taskId }),
  onTaskInterrupted: event => { events.push({ stage: 'interrupted', taskId: event.task.id }) },
  onTaskFinish: event => { events.push({ stage: 'finish', taskId: event.task.id }) },
})
if (!setHooksResult.success)
  return setHooksResult
// Register demo-hook at 02:00 daily so hooks can be observed. Success has no data; a duplicate ID fails.
const registerResult = await scheduler.register({ id: 'demo-hook', name: 'Hook demo', cron: '0 2 * * *' })
if (!registerResult.success)
  return registerResult
// Trigger demo-hook manually to produce hook events. Inspect status on the execution log.
const runResult = await scheduler.trigger('demo-hook')
if (!runResult.success)
  return runResult
const run = runResult.data
// run.status === 'success'; events contains start and finish for demo-hook.
// Remove the example demo-hook definition. Success has no data; return the failed result on failure.
const unregisterResult = await scheduler.unregister('demo-hook')
if (!unregisterResult.success)
  return unregisterResult
// Clear the registered host hooks with no arguments. Success has no data.
const clearHooksResult = scheduler.clearHooks()
if (!clearHooksResult.success)
  return clearHooksResult
// future tasks no longer use these callbacks
```

<a id="recovery"></a>

### Reconcile unknown outcomes and repair logs: `scheduler.execution`

Check external effects when execution is uncertain. Repair a missing log without rerunning the business operation.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `scheduler.execution.get(occurrenceId)` | Read an execution by ID | `occurrenceId: string` Stable ID from the execution receipt | `Promise<HaiResult<SchedulerExecutionEntry \| null>>` | `await scheduler.execution.get(occurrenceId)` |
| `scheduler.execution.listUnknown(options?)` | Paginate unknown executions | `options?: { limit?: number, offset?: number }` See [execution paging](#scheduler-execution-options) | `Promise<HaiResult<SchedulerExecutionEntry[]>>` | `await scheduler.execution.listUnknown({ limit: 20 })` |
| `scheduler.execution.listLogFailures(options?)` | List execution log failures | `options?: { limit?: number, offset?: number }` See [execution paging](#scheduler-execution-options) | `Promise<HaiResult<SchedulerExecutionEntry[]>>` | `await scheduler.execution.listLogFailures({ limit: 20 })` |
| `scheduler.execution.repairLog(occurrenceId)` | Repair a reconciled execution log | `occurrenceId: string` Stable ID from the execution receipt | `Promise<HaiResult<void>>` | `await scheduler.execution.repairLog(occurrenceId)` |
| `scheduler.execution.resolveUnknown(occurrenceId, resolution)` | Reconcile an execution outcome | `occurrenceId: string` Stable ID from the execution receipt. `resolution` Required verified decision. See [resolution fields](#scheduler-execution-options) | `Promise<HaiResult<void>>` | `await scheduler.execution.resolveUnknown(occurrenceId, { status: 'success', expectedUpdatedAt })` |

<a id="scheduler-execution-options"></a>

##### Execution paging and reconciliation

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `options.limit` | `number` | `50` | For both lists. 1–100 records per page. |
| `options.offset` | `number` | `0` | For both lists. Skip 0–1000000 records. |
| `resolution.status` | `'success' \| 'discarded'` | Required | Record confirmed success or end follow-up after verification. This publishes the resolution. |
| `resolution.expectedUpdatedAt` | `number` | Required | Pass the exact `updatedAt` from `scheduler.execution.get(occurrenceId)`. Scheduler records the outcome while the entry is still `unknown` and the timestamp matches. |

#### Scenario: Reconcile unknown outcomes and repair logs

Stop the old worker and check the external result. For example, mark the daily report run `success` once you verify the report was uploaded. Submit the `updatedAt` you read. If another operator has already recorded the result, the old timestamp fails the update check. Look up the run to see its current status. Use `repairLog()` when the completed run only needs its log repaired.

```ts
async function repairPendingLogs() {
  // Read up to 20 executions with log-write failures from offset 0. With none pending, the result is empty.
  const pendingResult = await scheduler.execution.listLogFailures({ limit: 20, offset: 0 })
  if (!pendingResult.success)
    return pendingResult
  const pending = pendingResult.data
  for (const entry of pending) {
    // Repair the observation log for this occurrence ID. Success has no data and does not rerun the task.
    const repairLogResult = await scheduler.execution.repairLog(entry.occurrenceId)
    if (!repairLogResult.success)
      return repairLogResult
  }
  return pending.length // at most 20; the next scan starts at offset 0 again
}
async function recordVerifiedOutcome(occurrenceId: string, status: 'success' | 'discarded') {
  // Read up to 20 unknown executions awaiting reconciliation from offset 0. No match gives an empty array.
  const unknownResult = await scheduler.execution.listUnknown({ limit: 20, offset: 0 })
  if (!unknownResult.success)
    return unknownResult
  const unknown = unknownResult.data
  // Look up the reconciled occurrence and its update time. A missing occurrence returns null.
  const currentResult = await scheduler.execution.get(occurrenceId)
  if (!currentResult.success)
    return currentResult
  const current = currentResult.data
  if (current?.status !== 'unknown')
    throw new Error('Expected an unknown execution')
  // Record the verified success or discarded outcome against the observed update time. Success has no data; changed state fails.
  const resolveUnknownResult = await scheduler.execution.resolveUnknown(occurrenceId, { status, expectedUpdatedAt: current.updatedAt })
  if (!resolveUnknownResult.success)
    return resolveUnknownResult
  // Read the same occurrence after reconciliation; return this read's original failed result if it fails.
  const getResult = await scheduler.execution.get(occurrenceId)
  if (!getResult.success)
    return getResult
  return { scanned: unknown.length, entry: getResult.data }
}
```
