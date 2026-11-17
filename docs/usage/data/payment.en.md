# @h-ai/payment Data structures

[Chinese source](payment.md) · [Configuration](../configuration/payment.en.md) · [API reference](../function/payment.en.md)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

Database and file samples show relevant fields, not complete writable records. Omitted fields are not automatically optional. Examples can represent different moments in a process.

### Whether a Stripe operation has a confirmed result

Structure: `hai_payment_stripe_operations`.

Find the same operation across nodes or retries instead of treating it as a new payment.

```json
{
  "id": "<operation-digest>",
  "request_hash": "<request-digest>",
  "result_json": null,
  "payment_intent": null,
  "created_at": 1794873600
}
```

Null result_json and payment_intent mean no confirmed result, so do not fulfill an order. created_at uses Unix seconds; digests are placeholders.

## Field, storage and cleanup reference

The application owns orders, fulfillment and callback processing records. Only the built-in Stripe channel creates a relational operations table.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_payment_stripe_operations` | `id` is a PK derived from account, mode, operation and business ID. `request_hash` binds request content. Nullable `result_json` and `payment_intent` record confirmed results and Stripe ID. `created_at` is Unix seconds from the database and starts the 23-hour safe retry window. |

There are no Redis keys. Share the RelDB backend between service instances that handle the same channel.
