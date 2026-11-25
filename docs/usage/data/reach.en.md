# @h-ai/reach Data Structures

<a id="reach-data-structures"></a>

[简体中文](reach.md) · [日本語](reach.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/reach.en.md) · [API reference](../function/reach.en.md)

Reach keeps messages that need to survive a restart, along with reusable templates, in the database. Applications can use the original receipt to check a queued message after a restart. When caching is available, a short-lived lock saves multiple processes from checking the same queue at the same time.

## Database

Reach uses the application's `@h-ai/reldb` connection and owns **two tables**. Connect the database before initializing Reach if you use templates or deferred delivery.

| Table | What it stores | When to use it |
| --- | --- | --- |
| [`hai_reach_send_log`](#send-log) | Immediate send history and messages waiting to be sent | Check whether a message is waiting, a channel has accepted it, or its outcome needs manual review |
| [`hai_reach_template`](#template-table) | Reusable subjects, bodies, and default channels | Reuse the same order notification and fill in the actual order ID each time |

<a id="send-log"></a>

### Send records

**One queued message occupies one row.** The `queueId` returned by `reach.send()` matches `hai_reach_send_log.queue_id`. Reach updates that row as delivery progresses. The provider’s `messageId` on an immediate send is stored as `message_id` when the history row is written.

An [SMS verification code](#sms-code-record) and a [daytime API send](#direct-api-record) both attempt to write history after channel acceptance. A [queued nighttime API send](#example-data) saves its row first and updates it after dispatch.

`id` is the primary key. Each queued message has a unique `queue_id`. Immediate sends leave it null. `template` records the template used. The table has no foreign keys. `hai_reach_send_log_status_lock_idx` supports lookups by state and claim expiry, and `hai_reach_send_log_status_created_idx` supports state and creation order.

`created_at`, `updated_at`, `locked_until`, and `next_attempt_at` use Unix milliseconds. `retry_delay_ms` and `max_retry_delay_ms` are durations in milliseconds.

| Field | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | No | Auto-increment | Internal row number | `42` |
| `queue_id` | `TEXT` | Yes | `NULL` | The queued message lookup ID, unique when set. Returned as `queueId` | `00000000-0000-4000-8000-000000000042` |
| `provider` | `TEXT` | No | — | Channel `name` from `_reach.yml` | `warehouse-webhook` |
| `to_addr` | `TEXT` | No | — | Actual recipient | `warehouse` |
| `subject` | `TEXT` | Yes | `NULL` | Subject used for the send | `Order received` |
| `body` | `TEXT` | Yes | `NULL` | Message with its variables filled in. The queue keeps this copy for later delivery | `Order order-42 was received.` |
| `template` | `TEXT` | Yes | `NULL` | Template name used for the send | `order-received` |
| `vars_json` | `TEXT` | Yes | `NULL` | Template variables serialized as a JSON string | `{"orderId":"order-42"}` |
| `extra_json` | `TEXT` | Yes | `NULL` | Extra channel parameters serialized as a JSON string | `{"event":"order.received","orderId":"order-42"}` |
| `status` | `TEXT` | No | — | Current state. The meanings are listed below | `pending` |
| `message_id` | `TEXT` | Yes | `NULL` | Message ID supplied by the channel, such as the SMS acceptance ID | `provider-order-43` |
| `processing_owner` | `TEXT` | Yes | `NULL` | Internal ID of the worker that claimed a message. The database checks it before accepting a result | `reach:<node-id>:<scan-id>` |
| `locked_until` | `BIGINT` | Yes | `NULL` | Deadline for the worker’s claim on a queued message | `1795479000000` |
| `attempt_count` | `BIGINT` | No | `0` | Attempts used by a queued message. Claiming counts as one. Returning a claim before dispatch restores that attempt | `0` |
| `max_attempts` | `BIGINT` | No | `5` | Total attempts allowed for a queued message, including the first try | `5` |
| `retry_delay_ms` | `BIGINT` | No | `60000` | How long to wait after the first failure | `60000` (1 minute) |
| `max_retry_delay_ms` | `BIGINT` | No | `3600000` | Maximum wait between retries | `120000` (2 minutes) |
| `next_attempt_at` | `BIGINT` | No | `0` | Earliest next attempt. `0` means there is no extra retry delay. Quiet hours still apply | `1795478460000` |
| `last_failure` | `TEXT` | Yes | `NULL` | Most recent recorded queue failure | `provider_unavailable` |
| `retry_safe` | `BOOLEAN` | No | `false` | Whether the send can be retried after an uncertain outcome. This is used by API channels configured with `idempotent: true` whose receivers actually deduplicate requests | `false` |
| `created_at` | `BIGINT` | No | — | Time the send record was created | `1795446600000` |
| `updated_at` | `BIGINT` | No | — | Time of the last change. Requeuing a dead letter also uses it to confirm the caller has read the current state | `1795446600000` |

#### How to read send states

- `pending` means the message is waiting to be sent.
- `processing` means a worker has claimed it.
- `sending` means the worker is submitting it or waiting for the channel's response.
- `sent` means the channel accepted it or an operator confirmed and recorded the outcome. Check the channel's own records to see if the recipient got it.
- `dead` means automatic processing stopped, for example after the last attempt. The message can be requeued once the cause is fixed.
- `unknown` means the outcome needs review. After checking, an operator can mark it `sent` or `discarded`.
- `discarded` means an operator closed the entry after checking the outcome.

Use the [queue API](../function/reach.en.md#queue) to look up, reconcile, and recover messages.

<a id="sms-code-record"></a>

#### An accepted SMS verification code in send history

After a user requests a sign-in code, the application calls `reach.send()` as in the [SMS verification example](../function/reach.en.md#reach-sms-code). The `otp_sms` template fills `{code}` with the issued code, and `ignoreDnd: true` lets this send proceed during quiet hours. The application or [IAM](iam.en.md) issues and verifies the code.

If the SMS channel accepts the send with `BizId` of `aliyun-42`, the result has `data` of `{"success":true,"messageId":"aliyun-42"}`. With a database connected, Reach attempts to write one row asynchronously. These are selected fields after the write succeeds.

```json
{
  "id": 41,
  "queue_id": null,
  "provider": "sms",
  "to_addr": "13900000000",
  "body": "Your verification code is 123456.",
  "template": "otp_sms",
  "vars_json": "{\"code\":\"123456\"}",
  "status": "sent",
  "message_id": "aliyun-42"
}
```

Look up the row by SMS channel and `message_id` to see who received the request and what it contained. `body` holds the rendered text. `vars_json` holds the code passed to the template.

```sql
SELECT to_addr, body, vars_json
FROM hai_reach_send_log
WHERE provider = 'sms' AND template = 'otp_sms' AND message_id = 'aliyun-42';
```

<a id="direct-api-record"></a>

#### A direct daytime send to the warehouse API

At `09:00`, outside quiet hours, the application follows the [warehouse notification example](../function/reach.en.md#reach-api-notification) and uses `order-received` to report that `order-43` was created. The warehouse accepts it and returns `{"messageId":"provider-order-43"}`. Reach returns `result.data.messageId` and attempts to write a history row asynchronously.

These are selected fields after the write succeeds. `queue_id` is null and `message_id` holds the warehouse's ID. The row keeps the rendered body and order details.

```json
{
  "id": 43,
  "queue_id": null,
  "provider": "warehouse-webhook",
  "to_addr": "warehouse",
  "subject": "Order received",
  "body": "Order order-43 was received.",
  "template": "order-received",
  "vars_json": "{\"orderId\":\"order-43\"}",
  "extra_json": "{\"event\":\"order.received\",\"orderId\":\"order-43\"}",
  "status": "sent",
  "message_id": "provider-order-43",
  "created_at": 1795482000000
}
```

The result has `data` of `{"success":true,"messageId":"provider-order-43"}`. Use that ID to check with the warehouse. A queue lookup takes `queue_id`. An empty `204` also counts as acceptance and leaves `message_id` null. An accepted direct send stays successful even if its history write fails. A direct send configured without a database still returns the channel's result and writes zero rows.

<a id="example-data"></a>

#### An order notification queued at 23:10

Another order, `order-42`, also needs a warehouse notification. The [warehouse configuration](../configuration/reach.en.md#reach-example-warehouse) sets quiet hours from `22:00` to `08:00` the next morning with `delay`. When the application calls send at `2026-11-23 23:10:00` (UTC+08:00), Reach writes one `pending` row with the body and variables. The warehouse has yet to receive a request. `attempt_count` is `0` and `message_id` is null. This is the full row after it is queued.

```json
{
  "id": 42,
  "queue_id": "00000000-0000-4000-8000-000000000042",
  "provider": "warehouse-webhook",
  "to_addr": "warehouse",
  "subject": "Order received",
  "body": "Order order-42 was received.",
  "template": "order-received",
  "vars_json": "{\"orderId\":\"order-42\"}",
  "extra_json": "{\"event\":\"order.received\",\"orderId\":\"order-42\"}",
  "status": "pending",
  "message_id": null,
  "processing_owner": null,
  "locked_until": null,
  "attempt_count": 0,
  "max_attempts": 5,
  "retry_delay_ms": 60000,
  "max_retry_delay_ms": 120000,
  "next_attempt_at": 0,
  "last_failure": null,
  "retry_safe": false,
  "created_at": 1795446600000,
  "updated_at": 1795446600000
}
```

The successful result has `data` of `{"success":true,"deferred":true,"queueId":"00000000-0000-4000-8000-000000000042"}`. `reach.queue.get(queueId)` reads that row and returns the state and counts below.

```json
{
  "queueId": "00000000-0000-4000-8000-000000000042",
  "provider": "warehouse-webhook",
  "status": "pending",
  "updatedAt": 1795446600000,
  "attemptCount": 0,
  "maxAttempts": 5,
  "nextAttemptAt": 0
}
```

From `08:00` the next morning, a worker uses the row's `queue_id` as the `Idempotency-Key` when it calls the warehouse. Suppose the warehouse accepts the first attempt. The excerpt shows the original row after dispatch. `id` and `queue_id` still identify the same row. `status`, `message_id` and `attempt_count` show the outcome. A lookup with the original `queueId` now shows `sent`.

```json
{
  "id": 42,
  "queue_id": "00000000-0000-4000-8000-000000000042",
  "status": "sent",
  "message_id": "warehouse-42",
  "attempt_count": 1
}
```

During quiet hours, `strategy: discard` or a call with `deferPolicy: 'reject'` returns `DND_BLOCKED` for an ordinary API notification. This writes **zero rows** and sends no request to the warehouse.

Reach stores the body and variables used for the send. The application decides how long to keep the history. Pending messages remain available to resume after a restart.

<a id="template-table"></a>

### Notification templates

Store wording you send often in `hai_reach_template`. At startup, Reach saves the templates from `_reach.yml` by `name`. Applications can also manage stored templates with `reach.template`. Edits apply when Reach renders a later message. Messages already in the queue keep the body saved when they were queued. Delete a database template with `reach.template.remove()`. If it is still in `_reach.yml`, the next initialization saves it again. `id` is the primary key, `name` is unique, and there are no foreign keys. `provider` names a channel in the configuration.

| Field | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | No | Auto-increment | Internal row number | `1` |
| `name` | `TEXT` | No | — | Unique template name selected by the sending application | `order-received` |
| `provider` | `TEXT` | No | — | Default channel. An explicit `provider` from the application takes precedence | `warehouse-webhook` |
| `subject` | `TEXT` | Yes | `NULL` | Subject template, which can contain `{variable}` placeholders | `Order received` |
| `body` | `TEXT` | No | — | Body template. Reach replaces `{variable}` placeholders with business values when rendering | `Order {orderId} was received.` |
| `created_at` | `TIMESTAMP` | No | — | Time Reach first saved the template | `2026-11-23T14:00:00+08:00` |
| `updated_at` | `TIMESTAMP` | No | — | Time Reach last saved the template | `2026-11-23T14:00:00+08:00` |

#### The order notification template

The creation and update times match because the template has only been saved once. The queued notification above sets `orderId` to `order-42`, producing the stored message `Order order-42 was received.`

```json
{
  "id": 1,
  "name": "order-received",
  "provider": "warehouse-webhook",
  "subject": "Order received",
  "body": "Order {orderId} was received.",
  "created_at": "2026-11-23T14:00:00+08:00",
  "updated_at": "2026-11-23T14:00:00+08:00"
}
```

## Cache

Reach uses **one kind of cache key** through `@h-ai/cache`. The node that gets the scan lock first checks the queue. Other nodes that find the lock already held skip that round. Nodes share the lock when they use the same Redis instance and `keyPrefix`. In-memory locks apply within one process.

| Cache entry | Logical key | What it stores | When it is used |
| --- | --- | --- | --- |
| [Queue scan lock](#queue-scan-lock) | `hai:reach:flush-pending` | The lock token for one scan | When the deferred queue is enabled, sending is allowed, and Cache is initialized, it cuts down on duplicate queries |

### Queue scan lock

| Item | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| Logical key | String | Fixed `hai:reach:flush-pending` | Name Reach passes to `cache.lock` | `hai:reach:flush-pending` |
| Storage key | String | `__lock:hai:reach:flush-pending` | Cache adds `__lock:`. If Redis has a `keyPrefix`, it is prepended | `orders:__lock:hai:reach:flush-pending` |
| Value | String | UUID generated on acquisition | Token for the current scan. The scan can release the lock only with the matching value | `<lock-token:redacted>` |
| Lifetime | Seconds | Fixed `300` | Reach keeps the deadline set at acquisition. If the scan is interrupted, the lock expires after five minutes | `300` |

When a node acquires the lock with `keyPrefix: 'orders:'` configured in Redis, `orders:__lock:hai:reach:flush-pending` holds the value below. The placeholder hides the actual UUID. Redis tracks the remaining lifetime separately as key metadata.

```json
"<lock-token:redacted>"
```

Reach tries to release the lock when the scan finishes. If Cache is unavailable or lock acquisition fails, workers can still continue using the database. The database's worker ID and expiry determine who can send each message. See the [Cache configuration reference](../configuration/cache.en.md).
