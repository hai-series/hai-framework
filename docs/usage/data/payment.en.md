# @h-ai/payment Data structures

[简体中文](payment.md) · [日本語](payment.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/payment.en.md) · [API reference](../function/payment.en.md)

On repeated submission of a Stripe operation, Payment looks up the stored operation digest and checks the request content. The application tracks fulfillment and callback processing separately.

## Database

The application owns orders, fulfillment and callback processing records. Only the built-in Stripe channel creates a relational operations table.

The built-in Stripe channel uses one table.

| Table | Purpose |
| --- | --- |
| [`hai_payment_stripe_operations`](#table-hai-payment-stripe-operations) | Check retry requests and keep confirmed Stripe results. |

<a id="table-hai-payment-stripe-operations"></a>

### `hai_payment_stripe_operations`

Each business operation uses one row. A retry of an unconfirmed result keeps the same key and request digest and must fall within the 23-hour window calculated by the database. After the window, reconcile the actual Stripe outcome.

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Operation digest and primary key reused for the same operation. | `<operation-digest>` |
| `request_hash` | `TEXT` | No | — | Request digest used to confirm that a retry uses the same parameters. | `<request-digest>` |
| `result_json` | `JSON` | Yes | — | Confirmed provider result. NULL means the result is still unknown. | `null` |
| `payment_intent` | `TEXT` | Yes | — | Stripe PaymentIntent ID recorded after the provider returns it. | `null` |
| `created_at` | `BIGINT` | No | — | Database time at registration in Unix seconds. Used to check the safe retry window. | `1794873600` |

<a id="example-data"></a>

<a id="whether-a-stripe-operation-has-a-confirmed-result"></a>

#### Example · Whether a Stripe operation has a confirmed result

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

There are no Redis keys. Share the RelDB backend between service instances that handle the same channel.
