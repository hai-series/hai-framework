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

#### Example · Confirmed Stripe Session

This is the `result_json` column of a confirmed order operation, with the URL and channel identifiers replaced. The module checks queries and notifications against `orderNo`, `currency`, `stripeAmount`, and `session.id`. The application commits fulfillment separately.

```json
{
  "orderNo": "ORDER-ISK-01",
  "amount": 10000,
  "stripeAmount": 1000000,
  "currency": "ISK",
  "session": {
    "id": "cs_test_example",
    "url": "https://checkout.stripe.com/c/pay/example",
    "payment_intent": null
  }
}
```

`amount` uses the business currency’s smallest unit and `stripeAmount` uses Stripe’s API encoding. A newly created Checkout Session can have no PaymentIntent. A later confirmed read fills the table’s `payment_intent` column. The persisted mapping prevents retries from creating another session. The module checks the current session state and URL before returning a replayed Checkout result. Expired sessions keep their operation rows.

<a id="stripe-legacy-amounts"></a>

#### Reconcile legacy ISK and UGX records

An ISK or UGX mapping created before the currency fix has no `stripeAmount`. The old code used the business integer directly as the Stripe API amount, so first reconcile the actual funds. Before deployment, stop the previous version from accepting new requests in those currencies, and upgrade all order and notification handlers. After upgrading, create replays, queries, notifications, and refunds for legacy mappings fail. A known unpaid session can still be closed after checking its original channel amount. Unconfirmed legacy creates or refunds keep the original reservation, whose old request digest prevents a retry with the new amount encoding.

Check the actual amount and state in the Stripe dashboard using the saved Session ID or business order number. Reconcile the order, close the session, or arrange any refund or balance adjustment through the business process. If the customer needs to pay after confirmed closure, create a new traceable payment identifier. Keep the original operation and event records for reconciliation.

## Runtime and business records

An unpaid WeChat query can return just `orderNo` and `status: 'pending'`. Read the expected amount from the application order. Alipay and Stripe queries can return the provider-confirmed amount. WeChat `refund_started` records that the order entered the refund flow. Use the provider’s individual refund record for its amount and outcome.

This Stripe notification excerpt shows the fields an application uses before fulfillment. The module has matched the transaction and amount to the persisted session. The application deduplicates by provider, merchant scope, and `eventId`, then commits the order update and unique fulfillment task in one transaction. The task ID can serve as the downstream idempotency key. A previously processed Alipay event still receives the plain text `success` acknowledgement.

```json
{
  "orderNo": "ORDER-ISK-01",
  "transactionId": "cs_test_example",
  "eventId": "evt_example",
  "currency": "ISK",
  "amount": 10000,
  "status": "paid"
}
```

There are no Redis keys. Share the RelDB backend between service instances that handle the same channel.
