# @h-ai/reach API reference

<!-- translation: partial -->

[Chinese source](reach.md) · [Configuration](../configuration/reach.en.md) · [Data structures](../data/reach.en.md)

## Quick start

Initialize Reach and the configured backend. Send with a provider and a trusted recipient. For queued delivery inspect the recorded state before deciding to retry.

```bash
pnpm add @h-ai/reach
```

```ts
import { core } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'

// Create the host lifecycle with RelDB before its dependent Reach step. The returned runtime exposes start and close.
const runtime = core.module.createRuntime([
  {
    name: 'reldb',
    // Start in-memory SQLite for templates and delivery state. Success has no data; a database failure prevents Reach from starting.
    start: () => reldb.init({ type: 'sqlite', database: ':memory:' }),
    // Close the database with no arguments after Reach. Success has undefined data.
    close: () => reldb.close()
  },
  {
    name: 'reach',
    // Initialize the local console provider with the welcome template. Success enables sending; invalid config or template storage failure stops startup.
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
    // Close Reach with no arguments so subsequent sends are unavailable. The runtime reports any cleanup failure.
    close: () => reach.close()
  },
])
// Start the registered steps in dependency order. Success has undefined data; failure triggers cleanup of started steps and retains the error.
const initialized = await runtime.start()
if (!initialized.success)
  throw new Error(initialized.error.message)

let result: Awaited<ReturnType<typeof reach.send>>
try {
  // Render Hello Alice for user@example.com using welcome and dispatch to the local console provider. Immediate success has deferred false or omitted; render or send errors fail.
  result = await reach.send({
    to: 'user@example.com',
    template: 'welcome',
    vars: { userName: 'Alice' }
  })
}
catch (error) {
  // Close Reach and SQLite in reverse order. Success has no data; report cleanup errors separately.
  const closed = await runtime.close()
  throw new AggregateError(closed.success
    ? [error]
    : [error, closed.error], 'Reach operation failed')
}
// Close Reach and SQLite in reverse order. Success has no data; report cleanup errors separately.
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

<a id="api-list"></a>

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Import the module as in the quick start. Except for lifecycle examples, run scenarios after initialization and before closure. Each call checks HaiResult.success before reading data and returns the original failed result to its caller. Scenarios without a function declaration are fragments inside an async application function. Use isolated test data and explicit cleanup.

<a id="sending"></a>

### Start providers and send: `reach`

Prepare mail or SMS providers, then send using a template and recipient. Durable templates and queues require RelDB.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `reach.init(config, options?)` | Prepare providers and enabled queue dependencies | `config: ReachConfigInput`, `options?: ReachInitOptions` · [Initialization options](#reach-init-options) | `Promise<HaiResult<void>>` | `await reach.init(config)` |
| `reach.close()` | Stop the service and release its resources | None | `Promise<void>` | `await reach.close()` |
| `reach.send(message)` | Send a message or enqueue it durably | Required `message: ReachMessage` supplies recipient and content. See [message fields](#reach-message-fields). | `SendResult` | `await reach.send(message)` |

<a id="reach-message-fields"></a>

**ReachMessage**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `to` | `string` | Required | Channel recipient, such as an email address or phone number. |
| `template` | `string` | Optional | Name of a saved template to render. Omit for direct sending. |
| `provider` | `string` | Required for direct sending | Overrides the selected provider. Template sends use the template provider when omitted. |
| `vars` | `Record<string, string>` | Optional | Fill template variables by key. |
| `subject / body` | `string` | Optional | Direct-send subject and body. The subject is used by channels such as email. |
| `extra` | `Record<string, unknown>` | Optional | Provide provider-specific values, such as an SMS template code or signature. |
| `idempotencyKey` | `string` | Optional | Stable receiver key for direct API sends. Queued delivery uses its queueId. |
| `sensitive` | `boolean` | `false` | Set true for credentials. They are delivered in memory without deferred or retry queuing. |
| `expiresAt` | `number` | Required with sensitive=true | Business credential deadline in Unix milliseconds. |
| `deferPolicy` | `'queue' \| 'reject'` | `queue` | During quiet hours, queue follows the existing delay configuration. reject returns DND_BLOCKED so the host can defer it. |

#### Scenario: Start providers and send

reach.send may contact a provider or return a queue receipt for an ordinary notification. Sensitive credential messages use a separate receipt ledger without queuing their payload.

![Notifications: direct send, queue and unknown outcomes](../images/function-reach-delivery.en.svg)

Ordinary messages may be durably deferred unless the caller selects reject. Sensitive messages are not automatically retried after quiet hours, expiry or unknown outcomes. Provider acceptance is not final delivery or a read receipt; reconcile unknown results before recovery.

```ts
// Fragment inside an async application function; return failed results to its caller.
// Render Ada into the stored demo-welcome template for demo@example.com. A deferred receipt means queued; return the failed result on a template or provider error.
const sentResult = await reach.send({ template: 'demo-welcome', to: 'demo@example.com', vars: { name: 'Ada' } })
if (!sentResult.success)
  return sentResult
const sent = sentResult.data
// sent: SendResult for this provider attempt, not proof that a person read the message
```

Use a configured template and test provider. Sending contacts an external service. init has no business data and close returns Promise<void>; queue acceptance is not delivery.

Delivery, template and queue methods return HaiResult; the table shows successful data. close returns no data.

Queue acceptance does not prove receipt. Only reconcile an unknown delivery after obtaining the provider’s actual outcome.

[Detailed parameters and workflows](reach.md#sending)

<a id="reach-init-options"></a>

#### Initialization options

Pass the required `config: ReachConfigInput` from the [notification configuration](../configuration/reach.en.md). Omitting `options: ReachInitOptions` uses the gateway headers and body from the configuration.

`gatewayHooks` maps provider names to callbacks. Each name must identify an `aliyun-sms` provider with a configured `gateway`. The callback receives `method: POST`, the gateway `url`, the current request `body: string | undefined`, and the deadline signal `signal: AbortSignal`. It can return `{ headers?, body? }` directly or as a promise, setting only fields to override. Return `undefined` to use the static configuration. Run the callback on the server and keep signed URLs out of logs.

```ts

import { type ReachConfigInput, reach } from '@h-ai/reach'

function startReach(config: ReachConfigInput) {
  // Pass an existing configuration with an sms gateway. On successful initialization, the callback adds X-Client to the next gateway request.
  return reach.init(config, {
    gatewayHooks: {
      sms: ({ signal }) => {
        signal.throwIfAborted()
        return { headers: { 'X-Client': 'delivery' } }
      },
    },
  })
}
```

<a id="templates"></a>

### Maintain and preview templates: `reach.template`

Templates select a provider, body and subject. Render previews variable substitution without sending.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `reach.template.resolve(name)` | Resolve an effective template | `name: string` Unique name used to look up the template | `ReachTemplate` | `await reach.template.resolve(name)` |
| `reach.template.save(template)` | Save a template | `template: ReachTemplate` Requires name, provider, and body, with optional email subject. Use {var} in the body and subject | `void` | `await reach.template.save(template)` |
| `reach.template.saveBatch(templates)` | Save multiple templates | `templates: ReachTemplate[]` Templates to save in a batch, with the same fields as save | `void` | `await reach.template.saveBatch(templates)` |
| `reach.template.remove(name)` | Remove a custom template | `name: string` Unique name used to look up the template | `void` | `await reach.template.remove(name)` |
| `reach.template.list()` | List effective templates | None | `ReachTemplate[]` | `await reach.template.list()` |
| `reach.template.render(name, vars)` | Render template variables | `name: string` Unique name used to look up the template. `vars: Record<string, string>` Map placeholder names to replacement values | `RenderedTemplate` | `await reach.template.render(name, { code: '123456' })` |

#### Scenario: Maintain and preview templates

```ts
// Fragment inside an async application function; return failed results to its caller.
// Save demo-welcome with subject Welcome and body Hello {name} for the local provider. Success has no data; return the failed result on persistence failure.
const saveResult = await reach.template.save({ name: 'demo-welcome', provider: 'local', body: 'Hello {name}', subject: 'Welcome' })
if (!saveResult.success)
  return saveResult
// Upsert the local demo-goodbye template with body Bye {name}. Success has no data; a failure does not roll back other completed writes.
const saveBatchResult = await reach.template.saveBatch([{ name: 'demo-goodbye', provider: 'local', body: 'Bye {name}' }])
if (!saveBatchResult.success)
  return saveBatchResult
// Look up the saved demo-welcome template by name; return the failed result if it cannot be found.
const templateResult = await reach.template.resolve('demo-welcome')
if (!templateResult.success)
  return templateResult
const template = templateResult.data // saved template
// Preview demo-welcome with name Ada. The result contains body Hello Ada and the subject without sending; a missing template fails.
const previewResult = await reach.template.render('demo-welcome', { name: 'Ada' })
if (!previewResult.success)
  return previewResult
const preview = previewResult.data // body 'Hello Ada'
// List stored templates with no arguments, including both saved entries. Return the failed result on a lookup error.
const templatesResult = await reach.template.list()
if (!templatesResult.success)
  return templatesResult
const templates = templatesResult.data // includes both templates
// Delete demo-goodbye by name. Success has no data; return the failed result on a storage error.
const removeResult = await reach.template.remove('demo-goodbye')
if (!removeResult.success)
  return removeResult
```

Configure a test provider named mail first. The name variable produces Hello Ada. Removing a template does not recall sent messages.

[Detailed parameters and workflows](reach.md#templates)

<a id="queue"></a>

### Inspect queued and failed sends: `reach.queue`

Save queue IDs when sends are queued. Read their status or list dead letters for investigation.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `reach.queue.get(queueId)` | Read a delivery by ID | `queueId: string` UUID from the send receipt or queue record | `ReachQueueEntry or null` | `await reach.queue.get(queueId)` |
| `reach.queue.list(options)` | Filter and paginate deliveries | `options: ReachQueueListOptions` · [query arguments](#reach-queue-options) | `Promise<HaiResult<ReachQueueEntry[]>>` | `await reach.queue.list({ status: 'unknown' })` |

<a id="reach-queue-options"></a>

Required `ReachQueueListOptions`: `status` is required and accepts `dead` or `unknown`. `limit` is 1–100 (default 50). `offset` skips 0–1,000,000 records (default 0).

#### Scenario: Inspect queued and failed sends

```ts
// Fragment inside an async application function; return failed results to its caller.
// Read up to 20 dead queue entries. An empty match yields an empty array; return the failed result on a read error.
const entriesResult = await reach.queue.list({ status: 'dead', limit: 20 })
if (!entriesResult.success)
  return entriesResult
const entries = entriesResult.data
if (entries.length > 0) {
  // Read the current entry for the first summary's queueId. A removed entry gives null; a query error fails.
  const entryResult = await reach.queue.get(entries[0].queueId)
  if (!entryResult.success)
    return entryResult
  const entry = entryResult.data // current entry or null
}
```

Results depend on the queue. An empty array means no matching records; get returns null for a missing ID. Obtain IDs from send receipts or the list.

[Detailed parameters and workflows](reach.md#queue)

<a id="recovery"></a>

### Recover after checking outcomes: `reach.queue`

A provider may have sent a message even when its receipt was lost. Check provider records before retrying or recording completion.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `reach.queue.requeueDead(queueId, options)` | Requeue a reconciled dead letter | `queueId: string` comes from the queue entry. Required `options.expectedUpdatedAt: number` is the `updatedAt` from the most recent read. | `Promise<HaiResult<void>>` | `await reach.queue.requeueDead(queueId, retryDecision)` |
| `reach.queue.resolveUnknown(queueId, resolution)` | Reconcile an unknown delivery | `queueId: string` UUID from the send receipt or queue record. `resolution: ReachUnknownResolution` Required verified decision. See [resolution fields](#reach-resolution-fields) | `void` | `await reach.queue.resolveUnknown(queueId, verifiedOutcome)` |

<a id="reach-resolution-fields"></a>

**Recovery and resolution fields**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `options.expectedUpdatedAt` | `number` | Required | When requeuing a dead item, use its latest read updatedAt. Reread after a concurrent write. |
| `resolution.status` | `'sent' \| 'discarded'` | Required | Record sent or discarded after external reconciliation. |
| `resolution.messageId` | `string` | Optional | On confirmed delivery, record up to 255 characters of provider receipt ID. |

#### Scenario: Recover after checking outcomes

Input is an authorized operator’s externally verified decision. Isolate the old sender first. Success has no business data and only confirms the stored resolution.

```ts
import type { ReachUnknownResolution } from '@h-ai/reach'

async function recordVerifiedDelivery(queueId: string, decision: ReachUnknownResolution) {
  // Read the current entry using the supplied queue receipt. A missing entry is null; only unknown proceeds to manual resolution.
  const currentResult = await reach.queue.get(queueId)
  if (!currentResult.success)
    return currentResult
  const current = currentResult.data
  if (current?.status !== 'unknown')
    throw new Error('Expected an unknown delivery')
  // Record the verified decision for this unknown entry without resending. Success has no data; changed state or an invalid decision fails.
  const resolveUnknownResult = await reach.queue.resolveUnknown(queueId, decision)
  if (!resolveUnknownResult.success)
    return resolveUnknownResult
  // Read the same queueId after reconciliation to inspect sent or discarded. The read can independently fail.
  const getResult = await reach.queue.get(queueId)
  if (!getResult.success)
    return getResult
  return getResult.data // status is sent or discarded
}
```
