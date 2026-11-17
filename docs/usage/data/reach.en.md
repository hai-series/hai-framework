# @h-ai/reach Data structures

[Chinese source](reach.md) · [Configuration](../configuration/reach.en.md) · [API reference](../function/reach.en.md)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

Database and file samples show relevant fields, not complete writable records. Omitted fields are not automatically optional. Examples can represent different moments in a process.

### A message waiting to be sent and its outcome

Structure: `hai_reach_send_log`.

This row is both a send work item and its outcome log. A worker claims, sends and records the result.

```json
{
  "id": 42,
  "queue_id": "queue-42",
  "provider": "email",
  "to_addr": "example@example.invalid",
  "subject": "Order received",
  "body": "Order order-42 was received.",
  "status": "pending",
  "attempt_count": 0,
  "max_attempts": 5,
  "retry_delay_ms": 60000,
  "next_attempt_at": 1794873600000,
  "retry_safe": false,
  "processing_owner": null,
  "locked_until": null
}
```

queue-42 is pending with zero attempts and no owner. next_attempt_at is Unix ms. Queued does not mean delivered.

### Reusable notification text

Structure: `hai_reach_template`.

Keep reusable subjects and bodies; business code supplies variables such as an order ID.

```json
{
  "id": 1,
  "name": "order-received",
  "provider": "email",
  "subject": "Order received",
  "body": "Order {{orderId}} was received."
}
```

orderId in order-received is replaced by the actual order number. Saving a template does not send a message.

### Reduce duplicate queue scanning

Structure: `__lock:hai:reach:flush-pending`.

A temporary lock reduces several nodes scanning the same batch.

```json
"<lock-token:redacted>"
```

The redacted owner token defaults to 300 seconds. Database claims, not this scanner lock, decide who may send a message.

## Field, storage and cleanup reference

RelDB owns the delivery queue and templates. A terminal unknown outcome requires confirmation before requeueing.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_reach_send_log` | Auto-increment `id` and nullable unique `queue_id`. Provider, recipient, subject/body, template, JSON variables and extras. Status, message ID, processing owner, lease end, last failure, retry safety and timestamps. Defaults: attempts 0, limit 5, base delay 60000 ms, maximum 3600000 ms, next attempt 0. |
| `hai_reach_template` | Auto-increment ID, unique name, provider scope, subject/body and timestamps. |
| `__lock:hai:reach:flush-pending` | Optional Cache lease, 300 seconds. It reduces duplicate polling; the RelDB row owns delivery permission. |
