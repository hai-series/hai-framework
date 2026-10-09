# @h-ai/payment

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/audit](../audit/README.en.md) · [@h-ai/core](../core/README.en.md)

A unified payment module for WeChat Pay, Alipay, and Stripe, with provider-based server processing and payment initiation across clients.

## Supported providers

| Provider   | Payment scenarios                         |
| ---------- | ----------------------------------------- |
| WeChat Pay | JSAPI / H5 / App / Native (QR code)       |
| Alipay     | JSAPI / H5 / App / Native                 |
| Stripe     | Checkout Session (international payments) |

## Dependencies

- `@h-ai/audit`: optional audit logging; payment operations are recorded automatically when audit is initialized.

## Quick start

### Node.js server

```typescript
import { payment } from '@h-ai/payment'

// 初始化（会自动注册可用的 Provider）
await payment.init({
  wechat: { mchId: '...', apiV3Key: '...', serialNo: '...', privateKey: '...', appId: '...' },
  alipay: { appId: '...', privateKey: '...', alipayPublicKey: '...' },
})

// 创建订单
const result = await payment.createOrder('wechat', {
  orderNo: 'ORD001',
  amount: 100,
  description: '测试商品',
  tradeType: 'jsapi',
  userId: 'openid-xxx',
  notifyUrl: 'https://api.example.com/payment/notify/wechat',
})

// 查询订单
const query = await payment.queryOrder('wechat', 'ORD001')

await payment.close()
```

### Browser client

```typescript
import { invokePayment } from '@h-ai/payment/client'

// 使用服务端返回的订单数据调起支付
await invokePayment(orderData)
```

## HTTP API contracts

Payment HTTP APIs are defined by `apiContract.payment` in `@h-ai/api-contract`. After composing them into the application contract, call them through the typed client:

```typescript
const order = await api.payment.orders.create({
  provider: 'wechat',
  amount: 100,
  description: '商品',
  tradeType: 'jsapi',
})
```

## Configuration

```typescript
await payment.init({
  wechat: {
    mchId: '商户号',
    apiV3Key: 'API v3 密钥',
    serialNo: '证书序列号',
    privateKey: '私钥内容',
    appId: '应用 ID',
  },
  alipay: {
    appId: '应用 ID',
    privateKey: '私钥',
    alipayPublicKey: '支付宝公钥',
    signType: 'RSA2', // 可选，默认 RSA2
    sandbox: false, // 可选，默认 false
  },
  stripe: {
    secretKey: 'sk_xxx',
    webhookSecret: 'whsec_xxx',
    webhookToleranceSeconds: 300, // 可选，默认 300 秒
  },
})
```

Configure only the providers you need; unconfigured providers are not registered.

Amounts use minor currency units (cents) and must be positive integers. `amount` / `totalAmount` are validated before calling a provider, so invalid amounts never reach the payment platform.

All built-in provider HTTP requests have a default 15-second timeout to avoid long hangs on network failures.

## Audit logging

Successful key payment operations automatically write audit logs through `@h-ai/audit`, without extra configuration. Audit failures produce warn logs and do not affect payment operations.

| Operation        | `action`         | Recorded data                           |
| ---------------- | ---------------- | --------------------------------------- |
| Create order     | `create_order`   | provider、amount、tradeType             |
| Payment callback | `payment_notify` | provider、transactionId、status、amount |
| Refund           | `refund`         | provider、refundNo、amount              |
| Close order      | `close_order`    | provider                                |

> Order queries (`queryOrder`) are read-only and do not write audit logs.

## Error handling

```typescript
const result = await payment.createOrder('wechat', orderInput)
if (!result.success) {
  switch (result.error.code) {
    case HaiPaymentError.INVALID_AMOUNT:
      // 金额不是正整数，或 refund.totalAmount < amount
      break
    case HaiPaymentError.PROVIDER_NOT_FOUND:
      // Provider 未注册
      break
    case HaiPaymentError.CREATE_ORDER_FAILED:
      // 创建订单失败
      break
  }
}
```

Common error codes:

| Error code                             | code              | Description                            |
| -------------------------------------- | ----------------- | -------------------------------------- |
| `HaiPaymentError.CREATE_ORDER_FAILED`  | `hai:payment:001` | Order creation failed                  |
| `HaiPaymentError.NOT_INITIALIZED`      | `hai:payment:010` | Module not initialized                 |
| `HaiPaymentError.PROVIDER_NOT_FOUND`   | `hai:payment:030` | Provider not registered                |
| `HaiPaymentError.INVALID_AMOUNT`       | `hai:payment:040` | Invalid amount                         |
| `HaiPaymentError.NOTIFY_VERIFY_FAILED` | `hai:payment:050` | Callback signature verification failed |
| `HaiPaymentError.NOTIFY_PARSE_FAILED`  | `hai:payment:051` | Callback parsing failed                |
| `HaiPaymentError.CONFIG_ERROR`         | `hai:payment:070` | Invalid configuration                  |

## Tests

```bash
pnpm --filter @h-ai/payment test
```

## License

Apache-2.0
