# @h-ai/scheduler API reference

<!-- translation: partial -->

[Chinese source](scheduler.md) · [Configuration](../configuration/scheduler.en.md) · [Data structures](../data/scheduler.en.md)

<a id="quick-start"></a>

## Quick start

Register tasks before starting the scheduler. Provide stable task IDs and make retriable handlers idempotent. Confirm uncertain external effects before replaying them.

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

<a id="api-reference"></a>

## API list

| API | Input and result | Example |
| --- | --- | --- |
| `scheduler.register`, `unregister`, `updateTask`, `refreshTasks` | Register or remove a task, update its definition, or reload stored schedules. | `await scheduler.register(task)` |
| `scheduler.start`, `stop`, `trigger` | Start processing, stop processing or trigger a registered task. | `await scheduler.trigger('daily')` |
| `scheduler.getLogs`, `setHooks`, `clearHooks` | Read execution history or manage lifecycle hooks. | `scheduler.clearHooks()` |
| `scheduler.execution.get`, `listUnknown`, `listLogFailures`, `repairLog`, `resolveUnknown` | Inspect persisted executions and record outcomes or repair their logs. | `await scheduler.execution.get(occurrenceId)` |

Additional options and workflow examples are available in the [Chinese reference](scheduler.md).
