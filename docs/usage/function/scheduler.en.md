# @h-ai/scheduler API reference

<!-- translation: partial -->

[Chinese source](scheduler.md) · [Configuration](../configuration/scheduler.en.md) · [Data structures](../data/scheduler.en.md)

<a id="quick-start"></a>

Register tasks before starting the scheduler. Provide stable task IDs and make retriable handlers idempotent. Confirm uncertain external effects before replaying them.

<a id="api-reference"></a>

| API | Input and result | Example |
| --- | --- | --- |
| `scheduler.register`, `unregister`, `updateTask`, `refreshTasks` | Register or remove a task, update its definition, or reload stored schedules. | `await scheduler.register(task)` |
| `scheduler.start`, `stop`, `trigger` | Start processing, stop processing or trigger a registered task. | `await scheduler.trigger('daily')` |
| `scheduler.getLogs`, `setHooks`, `clearHooks` | Read execution history or manage lifecycle hooks. | `scheduler.clearHooks()` |
| `scheduler.execution.get`, `listUnknown`, `listLogFailures`, `repairLog`, `resolveUnknown` | Inspect persisted executions and record outcomes or repair their logs. | `await scheduler.execution.get(occurrenceId)` |

Additional options and workflow examples are available in the [Chinese reference](scheduler.md).
