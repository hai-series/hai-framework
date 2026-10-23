# @h-ai/payment

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/audit](../audit/README.en.md) · [@h-ai/core](../core/README.en.md)

## Introduction

A unified payment module for WeChat Pay, Alipay, and Stripe, with provider-based server processing and payment initiation across clients.

## Core features

| Provider   | Payment scenarios                                          |
| ---------- | ---------------------------------------------------------- |
| WeChat Pay | `jsapi`: WeChat public-account browser                     |
| Alipay     | `h5`: signed WAP form POST                                 |
| Stripe     | h5: hosted Checkout page redirect (international payments) |

Built-in creation accepts only the combinations above. Public `TradeType` is `jsapi | h5`; App, Native, mini-program, and other combinations fail with `UNSUPPORTED_TRADE_TYPE` before contacting the channel. WeChat requires the current public account’s openid in `userId`; WeChat and Alipay accept CNY only. Missing WeChat `prepay_id` is a failure. Alipay `createOrder` creates signed page parameters, without claiming channel acceptance or payment. Its `{ gateway, fields }` payload is submitted as a complete POST form to the fixed production/sandbox gateway. The client never parses HTML or accepts arbitrary actions. Required `alipay.returnUrl` is a trusted HTTPS URL, configurable through `HAI_PAYMENT_ALIPAY_RETURNURL`; returning there is not payment proof. Check both `success` and `data.invoked`. Wait for the WeChat bridge before invoking; even a cancellation callback can follow a successful invocation.

Protocol references: [WeChat JSAPI creation](https://pay.wechatpay.cn/doc/v3/merchant/4012791897), [client invocation](https://pay.wechatpay.cn/doc/v3/merchant/4012791857), and the [official Alipay Node SDK pageExecute contract](https://github.com/alipay/alipay-sdk-nodejs-all#pageexecute-示例代码). Targeted checks cover protocol shapes, actual RSA verification, jsdom consumption, and a real Chrome POST intercepted by the test. Merchant credentials, channel sandbox accounts, and phone devices were unavailable; these checks do not establish real payment acceptance.

## Getting started

### Dependencies

- `@h-ai/audit`: optional audit logging; payment operations are recorded automatically when audit is initialized.
- `@h-ai/reldb`: required when Stripe is enabled. Initialize a shared database first for durable provider mappings and idempotent outcomes. WeChat/Alipay alone do not require it.

### Quick start

#### Node.js server

```typescript
import type { PaymentConfigInput } from '@h-ai/payment'
import { payment } from '@h-ai/payment'

async function paymentExample(trustedConfig: PaymentConfigInput, trustedOpenid: string) {
  // 常驻服务在启动/停机时分别 init/close；此函数演示完整生命周期。
  // 如启用 Stripe，宿主已先初始化共享 reldb 并检查 success。
  const initialized = await payment.init(trustedConfig)
  if (!initialized.success)
    throw new Error(initialized.error.message)
  try {
    const created = await payment.createOrder('wechat', {
      orderNo: 'ORD001',
      amount: 100,
      description: '测试商品',
      tradeType: 'jsapi',
      userId: trustedOpenid,
      notifyUrl: 'https://api.example.com/payment/notify/wechat',
    })
    if (!created.success)
      throw new Error(created.error.message)
    const query = await payment.queryOrder('wechat', 'ORD001')
    if (!query.success)
      throw new Error(query.error.message)
    return { order: created.data, status: query.data.status }
  }
  finally {
    await payment.close() // 宿主随后才关闭其 reldb。
  }
}
```

#### Browser client

```typescript
import { invokePayment } from '@h-ai/payment/client'

// 使用服务端返回的订单数据调起支付
const invoked = await invokePayment(orderData)
if (!invoked.success)
  throw new Error(invoked.error.message)
if (!invoked.data.invoked)
  throw new Error(invoked.data.message)
```

### HTTP API contracts

Payment HTTP APIs are defined by `apiContract.payment` in `@h-ai/api-contract`. After composing them into the application contract, call them through the typed client:

```typescript
const order = await api.payment.orders.create({
  provider: 'wechat',
  amount: 100,
  description: '商品',
  tradeType: 'jsapi',
  userId: 'trusted-public-account-openid',
})
```

### Configuration

```typescript
import type { PaymentConfigInput } from '@h-ai/payment'
import { PaymentConfigSchema } from '@h-ai/payment'

// 仅为配置字段示意；真实密钥、证书和商户身份由私有部署注入。
const input: PaymentConfigInput = {
  wechat: {
    mchId: '商户号',
    apiV3Key: 'API v3 密钥',
    serialNo: '证书序列号',
    privateKey: '私钥内容',
    appId: '应用 ID',
    platformKeys: { PUB_KEY_ID_123: '平台公钥 PEM', CERT_SERIAL: '平台证书 PEM' },
  },
  alipay: {
    appId: '应用 ID',
    sellerId: '卖家支付宝用户 ID',
    privateKey: '私钥',
    alipayPublicKey: '支付宝公钥',
    returnUrl: 'https://app.example/payment/return', // 必填 HTTPS
    signType: 'RSA2', // 可选，默认 RSA2
    sandbox: false, // 可选，默认 false
  },
  stripe: {
    secretKey: 'sk_test_xxx',
    webhookSecret: 'whsec_xxx',
    successUrl: 'https://app.example/payment/success?session_id={CHECKOUT_SESSION_ID}', // Required
    cancelUrl: 'https://app.example/payment/cancel', // Optional
    webhookToleranceSeconds: 300, // 可选，默认 300 秒
  },
}
const parsed = PaymentConfigSchema.safeParse(input)
if (!parsed.success)
  throw new Error('Payment configuration is invalid')
// 使用 parsed.data；启用 Stripe 前须先初始化共享 reldb。
```

Configure only the providers you need; unconfigured providers are not registered.

Amounts use minor currency units (cents) and must be positive integers. `amount` / `totalAmount` are validated before calling a provider, so invalid amounts never reach the payment platform.

All built-in provider HTTP requests have a default 15-second timeout to avoid long hangs on network failures.

### Notification identity, clocks, and business idempotency

WeChat requires `platformKeys`, mapping trusted certificate serials or public-key IDs to their PEM values. `Wechatpay-Serial` selects exactly one entry; unknown identifiers fail. Certificates are checked against their serial and validity period. Deploy both old and new entries on every node during rotation. No key is downloaded from notification data. Signed timestamps must be strict integers within 300 seconds of the synchronized node clock. Only `TRANSACTION.SUCCESS` transaction notifications are accepted, and decrypted `appid/mchid` must match configuration.

Alipay requires `sellerId`, verifies `app_id/seller_id` after signature verification, accepts only the configured RSA2/RSA algorithm, and rejects duplicate form parameters, unknown states, and invalid calendar dates. Requests explicitly use Asia/Shanghai time and send signed parameters in the POST form body, excluding order data from URLs. Notification/payment dates use Beijing time. Valid retries may arrive on later days; their original dates are not a five-minute signature window. Stripe validates strict signing timestamps, supports multiple v1 signatures during rotation, and checks test/live mode. Connect/organization-context events are unsupported; configure the current account's matching webhook secret.

All built-in and custom providers must return `eventId` and uppercase `currency`. IDs are WeChat id, Alipay notify_id, and Stripe event.id. Providers verify and parse; the application must verify its order/provider/amount/currency, persist deduplication within a merchant namespace, and prevent state regression. Never reuse deleted order numbers. The [runnable consumer example](examples/payment-notify-consumer.ts) commits an order CAS, unique event, and fulfillment outbox atomically. Only acknowledge after commit. External fulfillment needs an idempotent outbox consumer with a stable key; a database transaction cannot promise exactly-once external effects. Two real Node processes sharing SQLite verify one outbox entry across duplicates and restart; production nodes should share PostgreSQL/MySQL.

References: [WeChat certificate and timestamp rules](https://pay.wechatpay.cn/doc/v3/merchant/4013053420), [public-key rotation](https://pay.wechatpay.cn/doc/v3/merchant/4012154180), [Alipay notification validation and retries](https://developer.alibaba.com/docs/doc.htm?articleId=103296&docType=1&treeId=346).

### Alipay business responses and refund states

Queries, refunds, and closing validate the operation-specific response envelope, string `code=10000`, required fields, and returned order number. HTTP 200, a missing envelope, or a success code without business fields is insufficient. Missing trades, permission/balance errors, and other business failures return the matching `QUERY_ORDER_FAILED` / `REFUND_FAILED` / `CLOSE_ORDER_FAILED`. Error causes retain bounded provider error identifiers, excluding raw responses and `msg/sub_msg`. Queries reject unknown states and invalid amounts instead of inventing pending orders or zero amounts.

For refunds, check `data.status` even when `success` is true. Only `fund_change=Y` means `success`; `N` or an absent value returns `processing` and requires confirmation through Alipay refund queries (this module has no refund-query API yet). `refund_fee` is cumulative and must not be compared with this individual refund amount. Alipay `refundId` identifies the original trade; use `refundNo` for each refund and preserve its parameters when retrying. Update business orders only after checking `closeOrder` success and the refund status.

Reference: [Alipay refund success rules](https://aipay.alipay.com/docs/subscribe/api-list/other-basic-interfaces/alipay-trade-refund.html).

### Stripe hosted Checkout and closing orders

Only `mode=payment`, `ui_mode=hosted_page`, and `tradeType=h5` are implemented. Requests pin `Stripe-Version: 2026-09-30.endive`. Embedded/elements, JSAPI, App, Native, and mini-program modes are rejected by the provider, HTTP schema, and browser entry. Server-side `successUrl` is required; `cancelUrl` is optional. Both accept HTTP(S); the success URL may contain Stripe's literal `{CHECKOUT_SESSION_ID}` placeholder. Clients cannot override these values, and retries for the same order cannot change the creation parameters.

`closeOrder('stripe', orderNo)` retrieves the persisted Session: open/unpaid calls its expire endpoint, an already expired Session confirms idempotent success, and complete/paid fails. Concurrent closing or response loss triggers a fresh read; success requires confirmed expiration. Navigating to a success/cancel page proves neither payment nor closure.

References: [Create Checkout Session](https://docs.stripe.com/api/checkout/sessions/create), [Expire Session](https://docs.stripe.com/api/checkout/sessions/expire).

### Stripe webhook states

The Stripe provider handles payment-mode `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired` events. Subscribe the endpoint to these events only. Other resource events or incomplete Sessions return `NOTIFY_PARSE_FAILED` instead of producing a pending order.

A completed Session with `payment_status=unpaid` returns `pending`; only `paid` / `no_payment_required` returns `paid`. Asynchronous failure returns `failed`, and expiration returns `closed`. Only paid results contain `paidAt`, derived from the successful payment event's `created` timestamp so repeated delivery keeps the same value.

Results include `eventId` and uppercase `currency`; `transactionId` is the Checkout Session ID. The application must verify the order, amount, and currency in a shared database, persist deduplication, and prevent out-of-order events from reverting paid/refunded orders. Signature verification and parsing do not replace that business transaction. Check `status === 'paid'` before fulfillment, even when `success` is true.

References: [Stripe event types](https://docs.stripe.com/api/events/types), [Checkout Session fields](https://docs.stripe.com/api/checkout/sessions/object).

### Stripe persistence and idempotency

Before enabling Stripe, initialize reldb and check its success, then initialize payment. Close payment before reldb. Initialization waits for `hai_payment_stripe_operations` to be ready and does not publish a provider on failure. Multiple nodes must use the same PostgreSQL/MySQL database. SQLite is for development or explicitly shared files on one host, not separate local files across hosts.

The first operation needing an order mapping reads `/v1/account`. The stable account identity and test/live key mode isolate records and preserve mappings after key rotation. Keys must start with `sk_test_`, `sk_live_`, `rk_test_`, or `rk_live_`; restricted keys also need account read permission.

Order creation uses a stable `Idempotency-Key` derived from the account, mode, and orderNo. A unique database record binds the normalized request digest to its Session ID; callers cannot override metadata.orderNo. Queries/refunds retrieve that specific Session, verify order number, amount, and currency, and persist its PaymentIntent. Unknown orders fail. Refunds persist their result by refundNo and reject changed parameters. Free-text reason is preserved in refund metadata; the Stripe reason is requested_by_customer.

Response loss or persistence failure retains the reservation and cannot return success. Unknown outcomes can reuse the same key only within a 23-hour window measured by the database. Afterward, reconcile with Stripe and repair the record before retrying; do not delete it and blindly resend. Confirmed results are retained without a cache TTL. A refund result describes its acceptance; processing does not mean funds have arrived. See [Stripe idempotency retention](https://docs.stripe.com/api/idempotent_requests).

### Audit logging

Successful key payment operations automatically write audit logs through `@h-ai/audit`, without extra configuration. Audit failures produce warn logs and do not affect payment operations.

| Operation        | `action`         | Recorded data                           |
| ---------------- | ---------------- | --------------------------------------- |
| Create order     | `create_order`   | provider、amount、tradeType             |
| Payment callback | `payment_notify` | provider、transactionId、status、amount |
| Refund           | `refund`         | provider、refundNo、amount              |
| Close order      | `close_order`    | provider                                |

> Order queries (`queryOrder`) are read-only and do not write audit logs.

### Error handling

```typescript
const result = await payment.createOrder('wechat', orderInput)
if (!result.success) {
  switch (result.error.code) {
    case HaiPaymentError.INVALID_AMOUNT.code:
      // 金额不是正整数，或 refund.totalAmount < amount
      break
    case HaiPaymentError.PROVIDER_NOT_FOUND.code:
      // Provider 未注册
      break
    case HaiPaymentError.CREATE_ORDER_FAILED.code:
      // 创建订单失败
      break
  }
}
```

Common error codes:

| Error code                               | code              | Description                            |
| ---------------------------------------- | ----------------- | -------------------------------------- |
| `HaiPaymentError.CREATE_ORDER_FAILED`    | `hai:payment:001` | Order creation failed                  |
| `HaiPaymentError.NOT_INITIALIZED`        | `hai:payment:010` | Module not initialized                 |
| `HaiPaymentError.PROVIDER_NOT_FOUND`     | `hai:payment:030` | Provider not registered                |
| `HaiPaymentError.INVALID_AMOUNT`         | `hai:payment:040` | Invalid amount                         |
| `HaiPaymentError.UNSUPPORTED_TRADE_TYPE` | `hai:payment:041` | Payment scenario is not implemented    |
| `HaiPaymentError.NOTIFY_VERIFY_FAILED`   | `hai:payment:050` | Callback signature verification failed |
| `HaiPaymentError.NOTIFY_PARSE_FAILED`    | `hai:payment:051` | Callback parsing failed                |
| `HaiPaymentError.CONFIG_ERROR`           | `hai:payment:070` | Invalid configuration                  |

## Development and testing

```bash
pnpm --filter @h-ai/payment typecheck
pnpm --filter @h-ai/payment lint
pnpm --filter @h-ai/payment build
pnpm --filter @h-ai/payment test
node scripts/check-module-jsdoc.mjs --package payment
pnpm --filter @h-ai/payment exec vitest run tests/payment-provider-alipay.test.ts tests/payment-provider-wechat.test.ts tests/payment-provider-stripe.test.ts
```

Declaration examples use the actual `@h-ai/payment` / `@h-ai/payment/client` entries and distinguish configuration input from parsed output, and `HaiResult.success` from confirmed payment or refund status. Signing, protocol parsing, and durable operation helpers are marked as internal context and are not application deep-import APIs. Run `node scripts/check-module-jsdoc.mjs --package payment` to check coverage and example types. It does not execute real payments, network calls, device bridges, or fulfillment; verify those integrations separately. See the [module JSDoc guide](../../docs/module-jsdoc.md).

## License

Apache-2.0
