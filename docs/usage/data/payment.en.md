# @h-ai/payment Data Structures

[简体中文](payment.md) · [日本語](payment.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/payment.en.md) · [API reference](../function/payment.en.md)

Payment providers store their orders and transaction states. The application stores its business orders, processed notification records, and fulfillment tasks.

<a id="provider-order-storage"></a>

## How each provider looks up orders

`payment.queryOrder(providerName, orderNo)` takes the order number stored by the application.

- **WeChat Pay**. The server passes `orderNo` to WeChat as the merchant order number `out_trade_no` when creating the order. Later queries go directly to WeChat Pay with the same order number and merchant ID. The module needs no stored order mapping for WeChat Pay. [WeChat JSAPI payment flow](../function/payment.en.md#wechat-jsapi-flow)
- **Alipay**. `payment.createOrder()` builds a signed WAP form on the server. Alipay can process the order after the browser submits the form to its gateway. The `alipay.trade.query` API takes the merchant order number `out_trade_no` directly, so the module needs no stored order mapping. [Alipay WAP payment flow](../function/payment.en.md#alipay-wap-flow)
- **Stripe**. Queries also go to the payment provider. The module first looks up the stored Checkout Session ID by Stripe account, test or live mode, and business order number `orderNo`. It then queries Stripe by that Session ID. It also stores request digests and results for order creation and refunds so different instances can safely retry using the same idempotency key.

## Database

When you enable the built-in Stripe provider, `payment.init()` creates the table below. WeChat Pay and Alipay setups need no module-owned payment table.

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

There are no Redis keys. Instances of the same Stripe deployment share one RelDB backend to read the same operation records.
