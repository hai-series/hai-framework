# @h-ai/reach API reference

<!-- translation: partial -->

Use Reach on the server to send a sign-in code or tell the warehouse about a new order. A sign-in code typically needs an immediate attempt, while an order notice can wait until morning. The examples show how to send and check both.

[Chinese source](reach.md) · [Configuration](../configuration/reach.en.md) · [Data structures](../data/reach.en.md)

<a id="quick-start"></a>

## Quick start

Install Reach first. Install `nodemailer` as well if you send mail through SMTP.

```bash
pnpm add @h-ai/reach
```

### Try one send locally

```ts
import { reach } from '@h-ai/reach'

// Register a test provider named local. Handle initialization errors before calling send.
const started = await reach.init({
  providers: [{ name: 'local', type: 'console' }],
})
if (!started.success)
  throw new Error(started.error.message)

try {
  // Send a test message. A success returns a message ID starting with console-. On failure, read error.
  const result = await reach.send({
    provider: 'local',
    to: 'demo@example.invalid',
    body: 'Hello',
  })
  if (!result.success)
    throw new Error(result.error.message)
}
finally {
  // Close the test provider. This returns Promise<void>.
  await reach.close()
}
```

`local` records the send in development and tests. A `messageId` starting with `console-` confirms the local call worked. Use `reach.isInitialized` to check whether the process has any providers and `reach.config` to read the active settings with credentials and header values masked. See the [local configuration example](../configuration/reach.en.md#reach-example-local) for the file version.

<a id="api-list"></a>

<a id="api-reference"></a>

## Features

Run the remaining examples on the server. Pass the [Reach configuration](../configuration/reach.en.md#configuration-fields) to `reach.init()` and check the result. Start [RelDB](../configuration/reldb.en.md) first when you need send history, templates or the delayed queue.

<a id="sending"></a>

### Send verification codes and business notifications (`reach`)

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `reach.init(config, options?)` | Prepare providers and enabled queue dependencies | `config: ReachConfigInput`, `options?: ReachInitOptions` · [Initialization options](#reach-init-options) | `Promise<HaiResult<void>>` | `await reach.init(config)` |
| `reach.close()` | Stop claiming new messages, wait for active queue deliveries to record their outcomes, and release the providers | None | `Promise<void>` | `await reach.close()` |
| `reach.isInitialized` | Check whether providers are available on this node | None | `boolean` | `reach.isInitialized` |
| `reach.config` | Read the current redacted configuration | None | `ReachConfig \| null` | `reach.config` |
| `reach.send(message)` | Send a message or enqueue it durably | Required `message: ReachMessage` supplies recipient and content. See [message fields](#reach-message-fields). | `Promise<HaiResult<SendResult>>` · [Returned IDs](#reach-send-result) | `await reach.send(message)` |

<a id="reach-message-fields"></a>

##### Message fields (`ReachMessage`)

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `to` | `string` | Required | Channel recipient, such as an email address or phone number. |
| `template` | `string` | Optional | Name of a saved template to render. Omit for direct sending. |
| `provider` | `string` | Required for direct sending | Overrides the selected provider. Template sends use the template provider when omitted. |
| `vars` | `Record<string, string>` | Optional | Fill template variables by key. |
| `subject / body` | `string` | Optional | Direct-send subject and body. The subject is used by channels such as email. |
| `extra` | `Record<string, unknown>` | Optional | Provide provider-specific values, such as an SMS template code or signature. |
| `ignoreDnd` | `boolean` | `false` | Set to `true` to try sending this message immediately during quiet hours. |
| `deferPolicy` | `'queue' \| 'reject'` | `queue` | Chooses who handles an ordinary notification during quiet hours. `queue` lets Reach follow `dnd.strategy`. `reject` returns `DND_BLOCKED` so the application can reschedule its own job. |

<a id="reach-idempotency-key"></a>

##### HTTP request IDs

Reach generates a new request ID for each direct HTTP send. If a message is queued, the first delivery and its retries use the entry's `queueId`. Reach places the ID in the `Idempotency-Key` header and the JSON `idempotencyKey` field.

An immediate send makes one attempt and returns any failure or timeout to the application. A queue entry saves the message, request ID and attempt count so a worker can continue under the configured retry policy. `idempotent: true` allows retries of queued requests with an uncertain outcome.

Choose the field according to which duplicate the receiver needs to detect.

| What was repeated | Field the receiver reads | What the warehouse does |
| --- | --- | --- |
| Reach retries the same queue entry | HTTP `Idempotency-Key` header or its matching JSON `idempotencyKey` field | Return the saved result if that request ID was already processed. |
| The application submits the same order event twice | JSON `extra.event` and `extra.orderId` | Reuse the picking job if both events carry `order.received` and `order-42`. The two submissions have separate request IDs. |

<a id="reach-send-result"></a>

##### IDs returned by `send` (`SendResult`)

Check `result.success` before reading the result in `result.data`.

| ID | When it is returned | How to use it |
| --- | --- | --- |
| `messageId` | Returned when a channel accepts an immediate send and supplies an ID, such as Alibaba Cloud `BizId`, SMTP `messageId`, or `messageId` in an HTTP response. The test channel returns a `console-` ID. | Use it to check with the channel. An empty HTTP `204` also means acceptance. |
| `queueId` | Returned with `deferred: true` after Reach saves a queued message. | Use `reach.queue.get(queueId)` to look up that entry's send status. |

<a id="reach-providers"></a>

##### Built-in providers

Reach has four ways to send a notification. In `providers[]`, `type` selects how to send it and `name` identifies that provider in your application. Pass that `name` as `provider` when calling `reach.send()`.

| `type` | Example `name` | What it does |
| --- | --- | --- |
| `console` | `local` | Records the send in development or tests so you can check the call. |
| `smtp` | `email` | Sends email, such as sign-in codes, through an SMTP server. Configure the server, sender and credentials. |
| `aliyun-sms` | `sms` | Sends texts using an Alibaba Cloud SMS signature and template. Connect directly or forward through your gateway. |
| `api` | `warehouse-webhook` | Sends JSON to a configured URL. In this example, `warehouse-webhook` names the provider that sends new orders to the warehouse. |

<a id="reach-init-options"></a>

##### Initialization options

Pass the required `config: ReachConfigInput` from the [notification configuration](../configuration/reach.en.md). Omitting `options: ReachInitOptions` uses the gateway headers and body from the configuration.

`gatewayHooks` maps provider names to callbacks. Each name must identify an `aliyun-sms` provider with a configured `gateway`. The callback receives `method: POST`, the gateway `url`, the current request `body: string | undefined`, and the deadline signal `signal: AbortSignal`. It can return `{ headers?, body? }` directly or as a promise, setting only fields to override. Return `undefined` to use the static configuration. Run the callback on the server and keep signed URLs out of logs.

<a id="reach-sms-code"></a>

#### Scenario: Text a verification code

When the user requests a code, the application or IAM issues it and saves its verification deadline. Load the [SMS verification configuration](../configuration/reach.en.md#reach-example-sms-code) and send with `otp_sms`. The template routes to `sms`. The channel selects the Alibaba Cloud template from `templateCodes.otp_sms` and passes `vars.code` for substitution.

```ts
import { reach } from '@h-ai/reach'

function sendSmsCode(phone: string, code: string) {
  // Send the issued code. Check success before reading the optional messageId.
  return reach.send({
    to: phone,
    template: 'otp_sms',
    vars: { code },
    ignoreDnd: true,
  })
}
```

If Alibaba Cloud accepts the message with `BizId` of `aliyun-42`, the call returns the result below. With a database connected, Reach attempts to save the phone number, rendered body and variables in the send history. [Example SMS send record](../data/reach.en.md#sms-code-record)

```json
{
  "success": true,
  "data": {
    "success": true,
    "messageId": "aliyun-42"
  }
}
```

<a id="reach-email-code"></a>

#### Scenario: Email a verification code

When the user chooses email, load the [email verification configuration](../configuration/reach.en.md#reach-example-email-code) and use `otp_email`. Reach selects the `email` channel and replaces `{code}` in the HTML with `vars.code`.

```ts
function sendEmailCode(email: string, code: string) {
  // Try a direct SMTP send. Read messageId on success or error on failure.
  return reach.send({
    to: email,
    template: 'otp_email',
    vars: { code },
    ignoreDnd: true,
  })
}
```

If the application issues a code at 14:00 and saves 14:05 as its deadline, it checks submissions against that saved time. A code submitted at 14:06 has expired. The user can ask for a fresh code under the application’s resend rules.

<a id="reach-api-notification"></a>

#### Scenario: Notify a warehouse over HTTP

After creating `order-42`, use the `order-received` template in the [warehouse settings](../configuration/reach.en.md#reach-example-warehouse). Reach replaces `{orderId}` with `vars.orderId`. `extra` passes the event type and order ID to the warehouse.

The second argument, `deferPolicy`, applies during quiet hours. The default `queue` leaves the decision to Reach. If the order service already manages its own job, call `sendOrderNotice('order-42', 'reject')`. On `DND_BLOCKED`, keep that job and process it after quiet hours.

```ts
function sendOrderNotice(orderId: string, deferPolicy: 'queue' | 'reject' = 'queue') {
  // Notify the warehouse about a new order. Read messageId on immediate acceptance, queueId when queued, or error on failure.
  return reach.send({
    to: 'warehouse',
    template: 'order-received',
    vars: { orderId },
    extra: { event: 'order.received', orderId },
    deferPolicy,
  })
}
```

For a direct daytime send, Reach generates a request ID for the warehouse and puts it in `Idempotency-Key` and the JSON `idempotencyKey`. After a timeout, the order service can check with the warehouse using the order ID. See the [nighttime warehouse configuration](../configuration/reach.en.md#reach-example-warehouse) for the ID used by queue retries.

After acceptance, the warehouse can respond with `200` and `{"messageId":"warehouse-42"}`. The application reads that number from `result.data.messageId`. An empty `204` also signals acceptance and leaves the ID unset. A response body must be a JSON object no larger than 64 KiB. If included, `messageId` is a string up to 255 characters.

For verification codes or reset links sent over an HTTP API, set `requireHttps: true` on that channel to use HTTPS and reject redirects. See the [API provider configuration](../configuration/reach.en.md#http-api).

<a id="reach-quiet-hours"></a>

#### Scenario: Handle quiet hours

Quiet hours (DND) are when Reach holds or skips ordinary notifications, using the server process’s local time. Suppose they run from `22:00` to `08:00` and a send comes in at `23:10`.

| Message at 23:10 | What Reach does | What the application does next |
| --- | --- | --- |
| A code, reset link or setup invitation needed now (`ignoreDnd: true`) | Tries to send immediately. Returns a `messageId` if the channel supplies one. | Ask the user to verify or set their password before the application deadline. |
| Order notice that can wait (`strategy: delay`, `deferPolicy: queue`) | Returns `deferred: true` and `queueId` after saving the message. | Save the number. From 08:00, Reach checks the queue and tries to send it. |
| Reminder that can be skipped (`strategy: discard`) | Returns `DND_BLOCKED` and skips this send. | End this reminder according to the application's rules. |
| Application owns the background job (`deferPolicy: reject`) | Returns `DND_BLOCKED` and leaves job scheduling to the application. | Keep the job and process it after quiet hours. |

IAM passes `ignoreDnd: true` when it sends built-in verification codes, password reset notifications or initial password setup invitations through Reach. With a custom callback, the application chooses when to send.

Use the [queued order notification settings](../configuration/reach.en.md#reach-example-warehouse) and call the previous function at 23:10.

```ts
// Submit an order notice during quiet hours. queueId is returned only after the message is stored.
const result = await sendOrderNotice('order-42')
if (!result.success)
  throw new Error(result.error.message)

if (result.data.deferred) {
  // Look up the returned queue ID. A new entry is usually pending. A missing record returns null.
  const lookup = await reach.queue.get(result.data.queueId)
  if (!lookup.success)
    throw new Error(lookup.error.message)
  const status = lookup.data?.status
}
```

A queued notice is saved and the warehouse request is still pending. For this delivery and its retries, Reach uses the entry’s `queueId` as the request ID. Another submission may create a new entry. Save the first queue ID in the order service, or use the event type and order ID to keep one picking job per order at the warehouse.

![Delivery flow for ordinary notices, verification codes and queued requests](../images/function-reach-delivery.en.svg)

`order-42` follows the queue path. Reach returns a `queueId` at 23:10 and tries to contact the warehouse from 08:00 onward. Passing `deferPolicy: 'reject'` returns `DND_BLOCKED` immediately.

#### Scenario: Add a header to SMS gateway requests

When the gateway needs `X-Client` to identify the calling service, register a function at startup that adds the header to each SMS request. [SMS gateway configuration](../configuration/reach.en.md#reach-example-sms-gateway)

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
| `reach.template.resolve(name)` | Resolve an effective template | `name: string` Unique name used to look up the template | `Promise<HaiResult<ReachTemplate>>` | `await reach.template.resolve(name)` |
| `reach.template.save(template)` | Save a template | `template: ReachTemplate` Requires name, provider, and body, with optional email subject. Use {var} in the body and subject | `Promise<HaiResult<void>>` | `await reach.template.save(template)` |
| `reach.template.saveBatch(templates)` | Save multiple templates | `templates: ReachTemplate[]` Templates to save in a batch, with the same fields as save | `Promise<HaiResult<void>>` | `await reach.template.saveBatch(templates)` |
| `reach.template.remove(name)` | Remove a custom template | `name: string` Unique name used to look up the template | `Promise<HaiResult<void>>` | `await reach.template.remove(name)` |
| `reach.template.list()` | List effective templates | None | `Promise<HaiResult<ReachTemplate[]>>` | `await reach.template.list()` |
| `reach.template.render(name, vars)` | Render template variables | `name: string` Unique name used to look up the template. `vars: Record<string, string>` Map placeholder names to replacement values | `Promise<HaiResult<RenderedTemplate>>` | `await reach.template.render('demo-welcome', { name: 'Alice' })` |

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

Use the `local` provider from Quick start. The sample renders Hello Ada with `name: 'Ada'`. `render()` performs text substitution, and SMTP sends the body as HTML. Escape values from forms or other untrusted sources for their HTML context.

[Detailed parameters and workflows](reach.md#templates)

<a id="queue"></a>

### Inspect queued and failed sends: `reach.queue`

Save queue IDs when sends are queued. Read their status or list dead letters for investigation.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `reach.queue.get(queueId)` | Read a delivery by ID | `queueId: string` returned when the message was queued | `Promise<HaiResult<ReachQueueEntry \| null>>` | `await reach.queue.get(queueId)` |
| `reach.queue.list(options)` | Filter and paginate deliveries | `options: ReachQueueListOptions` · [query arguments](#reach-queue-options) | `Promise<HaiResult<ReachQueueEntry[]>>` | `await reach.queue.list({ status: 'unknown' })` |

<a id="reach-queue-options"></a>

##### Query options

Required `ReachQueueListOptions`: `status` is required and accepts `dead` or `unknown`. `limit` is 1–100 (default 50). `offset` skips 0–1,000,000 records (default 0).

##### Look up a send by its reference number

Use `reach.queue.get(queueId)` to read the queued entry. For immediate sends, use the provider’s `messageId` to check with the channel. See an [API send history record](../data/reach.en.md#direct-api-record).

| Status | What happened |
| --- | --- |
| `pending` | The notice is stored and waiting for quiet hours to end or another attempt. |
| `processing` / `sending` | The worker has claimed the job or started contacting the provider. |
| `sent` | The provider accepted it, or an operator recorded confirmed delivery. |
| `dead` | Processing stopped, for example after a definite failure or the last allowed attempt. Find the cause before [deciding whether to requeue](#recovery). |
| `unknown` | The provider may have received the request. Check its records before [recording the outcome](#recovery). |
| `discarded` | An operator closed the entry after checking the outcome. |

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
| `reach.queue.requeueDead(queueId, options)` | Requeue a message whose retries stopped | `queueId: string` comes from the queue entry. Required `options.expectedUpdatedAt: number` is the `updatedAt` returned by the lookup. | `Promise<HaiResult<void>>` · `SEND_FAILED` if the entry has changed | `await reach.queue.requeueDead(queueId, retryDecision)` |
| `reach.queue.resolveUnknown(queueId, resolution)` | Reconcile an unknown delivery | `queueId: string` UUID from the send receipt or queue record. `resolution: ReachUnknownResolution` Required verified decision. See [resolution fields](#reach-resolution-fields) | `Promise<HaiResult<void>>` | `await reach.queue.resolveUnknown(queueId, verifiedOutcome)` |

<a id="reach-resolution-fields"></a>

##### Recovery and resolution fields

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `options.expectedUpdatedAt` | `number` | Required | Pass the exact `updatedAt` returned by `reach.queue.get(queueId)`. Reach requeues the entry when it is still `dead` and has that timestamp. See [two operators handling one notice](#detailed-workflow). |
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

<a id="detailed-workflow"></a>

#### Scenario: Requeue a warehouse notice after fixing the cause

The warehouse notice has used all of its attempts and is now `dead`. After fixing the warehouse URL, two operators open the same record. `reach.queue.get(queueId)` returns `status: 'dead'` and `updatedAt: 1795478460000`. Both operators pass the value they saw, `1795478460000`, as `expectedUpdatedAt`.

The first request succeeds, changes the entry to `pending` and updates its timestamp. The second request still uses the old value and gets `SEND_FAILED`. Refresh the view to show the current status. If another attempt fails and the entry returns to `dead`, it has a new timestamp. Check the new failure before deciding to requeue it.

Copy the `updatedAt` in Unix milliseconds from the lookup. `Date.now()` gives a fresh timestamp that can fail the update check.

```ts
async function restoreDead(queueId: string) {
  // Look up the status and updatedAt from the notice's queue ID. A missing record has null data.
  const state = await reach.queue.get(queueId)
  if (!state.success)
    throw new Error(state.error.message)
  if (state.data?.status === 'dead' && state.data.updatedAt !== undefined) {
    // Pass back the timestamp from the lookup. Success moves the entry to pending. A changed entry returns an error.
    const restored = await reach.queue.requeueDead(queueId, { expectedUpdatedAt: state.data.updatedAt })
    if (!restored.success)
      throw new Error(restored.error.message)
  }
}
```

Requeuing resets the attempt count and preserves the `queueId` and the retry schedule. If an earlier HTTP request may still arrive, first confirm that the receiver can deduplicate using the original ID. Use the manual reconciliation flow for `unknown` entries.
