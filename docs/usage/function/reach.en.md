# @h-ai/reach API reference

<!-- translation: partial -->

[Chinese source](reach.md) · [Configuration](../configuration/reach.en.md) · [Data structures](../data/reach.en.md)

<a id="quick-start"></a>

## Quick start

Initialize Reach and the configured backend. Send with a provider and a trusted recipient. For queued delivery inspect the recorded state before deciding to retry.

```bash
pnpm add @h-ai/reach
```

```ts
import { core } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'

const runtime = core.module.createRuntime([
  {
    name: 'reldb',
    start: () => reldb.init({ type: 'sqlite', database: ':memory:' }),
    close: () => reldb.close()
  },
  {
    name: 'reach',
    start: () => reach.init({
      providers: [
        { name: 'local', type: 'console' }
      ],
      templates: [
        {
          name: 'welcome',
          provider: 'local',
          subject: 'Welcome',
          body: 'Hello {userName}'
        }
      ],
    }),
    close: () => reach.close()
  },
])
const initialized = await runtime.start()
if (!initialized.success)
  throw new Error(initialized.error.message)

let result: Awaited<ReturnType<typeof reach.send>>
try {
  result = await reach.send({
    to: 'user@example.com',
    template: 'welcome',
    vars: { userName: 'Alice' }
  })
}
catch (error) {
  const closed = await runtime.close()
  throw new AggregateError(closed.success
    ? [error]
    : [error, closed.error], 'Reach operation failed')
}
const closed = await runtime.close()
if (!closed.success) {
  throw new AggregateError(result.success
    ? [closed.error]
    : [result.error, closed.error], 'Reach cleanup failed')
}
if (!result.success)
  throw new Error(result.error.message)
```

```ts
const ready = reach.isInitialized // 无需参数，至少一个通知 Provider 已发布时为 true。
const activeConfig = reach.config // 无需参数，读取脱敏快照；关闭后为 null。
```

<a id="api-reference"></a>

## API list

Delivery, template and queue methods return HaiResult; the table shows successful data. close returns no data.

| API | Purpose | Inputs and defaults | Output | Example |
| --- | --- | --- | --- | --- |
| `reach.init` | Prepare providers and enabled queue dependencies | `config, options?` | `void` | `await reach.init(config)` |
| `reach.close` | Stop the service and release its resources | None | `Promise<void>` | `await reach.close()` |
| `reach.send` | Send now or queue for delivery | `message` | `SendResult` | `await reach.send(message)` |
| `reach.template.resolve` | Read the resolved template | `name` | `ReachTemplate` | `await reach.template.resolve(name)` |
| `reach.template.save` | Write one template | `template` | `void` | `await reach.template.save(template)` |
| `reach.template.saveBatch` | Save several templates | `templates` | `void` | `await reach.template.saveBatch(templates)` |
| `reach.template.remove` | Remove a stored template | `name` | `void` | `await reach.template.remove(name)` |
| `reach.template.list` | List resolved templates | None | `ReachTemplate[]` | `await reach.template.list()` |
| `reach.template.render` | Substitute variables without sending | `name, vars` | `RenderedTemplate` | `await reach.template.render(name, { code: '123456' })` |
| `reach.queue.get` | Read one delivery record | `queueId` | `ReachQueueEntry or null` | `await reach.queue.get(queueId)` |
| `reach.queue.list` | List deliveries matching the filter | `options` | `ReachQueueEntry[]` | `await reach.queue.list({ status: 'unknown' })` |
| `reach.queue.requeueDead` | Requeue an eligible terminal failure | `queueId, options` | `void` | `await reach.queue.requeueDead(queueId, retryDecision)` |
| `reach.queue.resolveUnknown` | Record a delivery outcome confirmed outside the queue | `queueId, resolution` | `void` | `await reach.queue.resolveUnknown(queueId, verifiedOutcome)` |

Queue acceptance does not prove receipt. Only reconcile an unknown delivery after obtaining the provider’s actual outcome.

Still untranslated: detailed delivery reconciliation, dead-letter recovery and production boundaries. Read the [Chinese source section](reach.md#detailed-workflow).
