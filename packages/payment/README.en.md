# @h-ai/payment

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/audit](../audit/README.en.md) · [@h-ai/core](../core/README.en.md)

A unified payment module for WeChat Pay, Alipay, and Stripe, with provider-based server processing and payment initiation across clients.

## Quick Start

### Dependencies

- `@h-ai/audit`: optional audit logging; payment operations are recorded automatically when audit is initialized.
- `@h-ai/reldb`: required when Stripe is enabled. Initialize a shared database first for durable provider mappings and idempotent outcomes. WeChat/Alipay alone do not require it.

Concurrent `close()` invalidates an unfinished `init()`, so late initialization cannot reopen the module. Wait for that initialization to settle before initializing again.

#### Node.js server

```typescript
import type { PaymentConfigInput } from '@h-ai/payment'
import { payment } from '@h-ai/payment'

export async function paymentExample(trustedConfig: PaymentConfigInput, trustedOpenid: string) {
  // Initialize at startup and close at shutdown in a long-running service.
  // If Stripe is enabled, initialize shared reldb and check its result first.
  const initialized = await payment.init(trustedConfig)
  if (!initialized.success)
    throw new Error(initialized.error.message)
  try {
    const created = await payment.createOrder('wechat', {
      orderNo: 'ORD001',
      amount: 100,
      description: 'Example item',
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
    await payment.close() // The application calls reldb.close() afterward.
  }
}
```

#### Browser client

Pass the successful result data from the backend's `payment.createOrder` to `startPayment`. In WeChat, wait for `WeixinJSBridgeReady` before calling it.

```typescript
import type { PaymentOrder } from '@h-ai/payment'
import { invokePayment } from '@h-ai/payment/client'

export async function startPayment(orderData: PaymentOrder) {
  // Start payment using the order and provider parameters, then check the result.
  const invoked = await invokePayment(orderData)
  if (!invoked.success)
    throw new Error(invoked.error.message)
  if (!invoked.data.invoked)
    throw new Error(invoked.data.message)
  // Return the launch result. The server confirms payment via a query or asynchronous notification.
  return invoked.data
}
```

## Configuration Reference

Generated projects define the accounts and server-side credentials for each payment channel in `config/_payment.yml`. At startup, the application reads the file and passes the settings object to `payment.init(config)`.

See the [configuration reference](../../docs/usage/configuration/payment.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/payment.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `payment.init` / `payment.close` / `payment.config` / `payment.isInitialized` / `payment.registerProvider` / `payment.getProvider` — Initialize, close, or inspect payment channels, and register custom implementations when needed
- `payment.createOrder` / `payment.queryOrder` / `payment.refund` / `payment.closeOrder` / `payment.handleNotify` — Create, inspect, refund and close orders and verify notifications
- `invokePayment` — Import separately from `@h-ai/payment/client` to launch a payment in the browser using an order returned by the server

## Data Structures

See the [data reference](../../docs/usage/data/payment.md) in Chinese for provider state, merchant order mappings and notification idempotency.

## Development and Testing

```bash
pnpm --filter @h-ai/payment typecheck
pnpm --filter @h-ai/payment lint
pnpm --filter @h-ai/payment build
pnpm --filter @h-ai/payment test
node scripts/check-module-jsdoc.mjs --package payment
pnpm --filter @h-ai/payment exec vitest run tests/payment-provider-alipay.test.ts tests/payment-provider-wechat.test.ts tests/payment-provider-stripe.test.ts
```

Declaration examples use the actual `@h-ai/payment` / `@h-ai/payment/client` entries and distinguish configuration input from parsed output, and `HaiResult.success` from confirmed payment or refund status. Signing, protocol parsing, and durable operation helpers are marked as internal context and are not application deep-import APIs. Run `node scripts/check-module-jsdoc.mjs --package payment` to check coverage and example types. It does not execute real payments, network calls, device bridges, or fulfillment; verify those integrations separately. See the [module JSDoc guide](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## License

Apache-2.0
