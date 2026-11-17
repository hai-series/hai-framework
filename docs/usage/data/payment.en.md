# @h-ai/payment Data structures

[Chinese source](payment.md) · [Configuration](../configuration/payment.en.md) · [API reference](../function/payment.en.md)

The application owns orders, fulfillment and callback processing records. Only the built-in Stripe channel creates a relational operations table.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_payment_stripe_operations` | `id` is a PK derived from account, mode, operation and business ID. `request_hash` binds request content. Nullable `result_json` and `payment_intent` record confirmed results and Stripe ID. `created_at` is Unix seconds from the database and starts the 23-hour safe retry window. |

There are no Redis keys. Share the RelDB backend between service instances that handle the same channel.
