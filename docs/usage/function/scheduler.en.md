# @h-ai/scheduler API reference

<!-- translation: partial -->

[Chinese source](scheduler.md) · [Configuration](../configuration/scheduler.en.md) · [Data structures](../data/scheduler.en.md)

<a id="quick-start"></a>

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

dataOrThrow(await reldb.init({ type: 'sqlite', database: ':memory:' }))

try {
  dataOrThrow(await scheduler.init({
    hooks: {
      onTaskExecute: ({ context }) => ({ taskId: context.taskId }),
    },
  }))
  try {
    dataOrThrow(await scheduler.register({ id: 'daily', name: 'Daily report', cron: '0 2 * * *' }))
    const run = dataOrThrow(await scheduler.trigger('daily', { source: 'docs' }))
    if (run.status !== 'success')
      throw new Error(run.error ?? 'Task did not succeed')

    const logs = dataOrThrow(await scheduler.getLogs({
      taskId: 'daily',
      triggerSource: 'docs',
      pagination: { page: 1, pageSize: 20 },
    }))
    if (logs.items.length !== 1)
      throw new Error('Expected one execution record')
  }
  finally {
    await scheduler.close()
  }
}
finally {
  dataOrThrow(await reldb.close())
}
```

<a id="api-reference"></a>

## API list

| API | Purpose | Input | Output | Example |
| --- | --- | --- | --- | --- |
| `scheduler.init` | Prepare database tables using an already connected RelDB | `config? = {}` | `Promise<HaiResult<void>>` | `await scheduler.init()` |
| `scheduler.close` | Stop this instance and wait for its cleanup; the app closes RelDB | None | `Promise<void>` | `await scheduler.close()` |
| `scheduler.register` | Store a definition under a stable ID. Set its cron expression and its handler or use a hook | `task: TaskDefinition` | `Promise<HaiResult<void>>` | `await scheduler.register(task)` |
| `scheduler.unregister` | Remove a definition. Already recorded executions are separate | `taskId` | `Promise<HaiResult<void>>` | `await scheduler.unregister('daily')` |
| `scheduler.updateTask` | Update part of a definition | `taskId, updates` | `Promise<HaiResult<void>>` | `await scheduler.updateTask('daily', { enabled: false })` |
| `scheduler.refreshTasks` | Reload the task definitions from the database | None | `Promise<HaiResult<void>>` | `await scheduler.refreshTasks()` |
| `scheduler.start` | Start polling for tasks due on their schedule | None | `HaiResult<void>` | `scheduler.start()` |
| `scheduler.stop` | Stop scheduling; effects already made by a handler are not rolled back | None | `HaiResult<void>` | `scheduler.stop()` |
| `scheduler.trigger` | Run a registered task immediately. Check data.status as well as success | `taskId, { source?, idempotencyKey? }?` | `Promise<HaiResult<TaskExecutionLog>>` | `await scheduler.trigger('daily', { source: 'admin-console' })` |
| `scheduler.getLogs` | Read paginated execution logs. Filter on values such as task ID or trigger source | `options?; pagination.page = 1, pageSize = 20` | `Promise<HaiResult<PaginatedResult<TaskExecutionLog>>>` | `await scheduler.getLogs({ pagination: { page: 1, pageSize: 20 } })` |
| `scheduler.setHooks` | Set the application's task callbacks for this process | `hooks: SchedulerTaskHooks` | `HaiResult<void>` | `scheduler.setHooks({ onTaskExecute })` |
| `scheduler.clearHooks` | Remove this process's callbacks | None | `HaiResult<void>` | `scheduler.clearHooks()` |
| `scheduler.execution.get` | Read a stored execution. The result is null if this ID does not exist | `occurrenceId` | `Promise<HaiResult<SchedulerExecutionEntry \| null>>` | `await scheduler.execution.get(occurrenceId)` |
| `scheduler.execution.listUnknown` | List records whose outcome must be confirmed before making another attempt | `{ limit?, offset? }` (defaults: 50, 0) | `Promise<HaiResult<SchedulerExecutionEntry[]>>` | `await scheduler.execution.listUnknown({ limit: 20 })` |
| `scheduler.execution.listLogFailures` | List records with logs that need to be written again | `{ limit?, offset? }` (defaults: 50, 0) | `Promise<HaiResult<SchedulerExecutionEntry[]>>` | `await scheduler.execution.listLogFailures({ limit: 20 })` |
| `scheduler.execution.repairLog` | Write a missing log from the persisted execution without rerunning the task | `occurrenceId` | `Promise<HaiResult<void>>` | `await scheduler.execution.repairLog(occurrenceId)` |
| `scheduler.execution.resolveUnknown` | After verifying the actual outcome, record success or discarded with the version you read | `occurrenceId, { status, expectedUpdatedAt }` | `Promise<HaiResult<void>>` | `await scheduler.execution.resolveUnknown(occurrenceId, { status: 'success', expectedUpdatedAt })` |
| `scheduler.hooks.onTaskStart` | Called by Scheduler when an attempt starts | `SchedulerTaskStartEvent` | `void \| Promise<void>` | `scheduler.setHooks({ onTaskStart })` |
| `scheduler.hooks.onTaskExecute` | Called when a task has no built-in handler; return its output and honor the abort signal | `SchedulerTaskExecuteEvent` | `unknown \| Promise<unknown>` | `scheduler.setHooks({ onTaskExecute })` |
| `scheduler.hooks.onTaskInterrupted` | Called when an execution is interrupted | `SchedulerTaskInterruptedEvent` | `void \| Promise<void>` | `scheduler.setHooks({ onTaskInterrupted })` |
| `scheduler.hooks.onTaskFinish` | Called when an execution finishes | `SchedulerTaskFinishEvent` | `void \| Promise<void>` | `scheduler.setHooks({ onTaskFinish })` |

The last four entries are optional callbacks. Register them with `scheduler.init({ hooks })` or `scheduler.setHooks(hooks)`; the application does not need to call them directly.

Still untranslated: the task, retry, execution repair and manual reconciliation examples. Read the [Chinese source section](scheduler.md#api-reference).
