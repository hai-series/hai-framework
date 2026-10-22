# @h-ai/payment

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/audit](../audit/README.md) · [@h-ai/core](../core/README.md)

## 简介

统一支付模块，支持微信支付、支付宝和 Stripe，提供 Provider 模式的后端支付处理与多端客户端调起能力。

## 核心功能清单

| Provider | 支付场景                         |
| -------- | -------------------------------- |
| 微信支付 | JSAPI / H5 / App / Native (扫码) |
| 支付宝   | JSAPI / H5 / App / Native        |
| Stripe   | Checkout Session（国际支付）     |

## 使用入门

### 依赖

- `@h-ai/audit` — 审计日志（支付操作自动审计），可选；已初始化时自动写入审计日志

### 快速开始

#### Node.js 服务端

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

#### 浏览器客户端

```typescript
import { invokePayment } from '@h-ai/payment/client'

// 使用服务端返回的订单数据调起支付
await invokePayment(orderData)
```

### HTTP API 契约

支付 HTTP API 由 `@h-ai/api-contract` 的 `apiContract.payment` 定义。组合进应用 contract 后，可通过 typed client 调用：

```typescript
const order = await api.payment.orders.create({
  provider: 'wechat',
  amount: 100,
  description: '商品',
  tradeType: 'jsapi',
})
```

### 配置

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

只配置需要的 Provider 即可，未配置的 Provider 不会注册。

金额字段统一使用“分”为单位，且必须为正整数。模块会在调用具体 Provider 之前先校验 `amount` / `totalAmount`，避免把非法金额继续传给下游支付平台。

所有内置 Provider 的 HTTP 请求默认附带 15 秒超时，避免网络异常时长时间挂起。

### Stripe 回调状态

Stripe Provider 只处理 `mode=payment` 的 `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired`。Webhook 端点只订阅这些事件；其它资源事件或不完整 Session 返回 `NOTIFY_PARSE_FAILED`，不会伪造 pending 订单。

`completed` 且 `payment_status=unpaid` 返回 `pending`，不得履约；`paid` / `no_payment_required` 才返回 `paid`。异步失败返回 `failed`，过期返回 `closed`。只有 `paid` 结果带 `paidAt`，时间取支付成功事件的 `created`，重复接收不会改变它。

结果包含 `eventId`、大写 `currency`，`transactionId` 是 Checkout Session ID。应用须在共享数据库中核对订单、金额、币种，持久去重并防止乱序通知把已支付/已退款订单回退；Provider 验签解析不代替业务事务。回调成功结果也可能为 pending，不能仅判断 `success` 就发货。

依据：[Stripe 事件类型](https://docs.stripe.com/api/events/types)、[Checkout Session 字段](https://docs.stripe.com/api/checkout/sessions/object)。

### 审计日志

关键支付操作执行成功后会自动写入审计日志（依赖 `@h-ai/audit`），无需额外配置。审计写入失败仅输出 warn 日志，不影响支付操作。

| 操作     | `action`         | 记录内容                                |
| -------- | ---------------- | --------------------------------------- |
| 创建订单 | `create_order`   | provider、amount、tradeType             |
| 支付回调 | `payment_notify` | provider、transactionId、status、amount |
| 退款     | `refund`         | provider、refundNo、amount              |
| 关闭订单 | `close_order`    | provider                                |

> 订单查询（`queryOrder`）为只读操作，不写审计日志。

### 错误处理

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

常用错误码：

| 错误码                                 | code              | 说明            |
| -------------------------------------- | ----------------- | --------------- |
| `HaiPaymentError.CREATE_ORDER_FAILED`  | `hai:payment:001` | 创建订单失败    |
| `HaiPaymentError.NOT_INITIALIZED`      | `hai:payment:010` | 模块未初始化    |
| `HaiPaymentError.PROVIDER_NOT_FOUND`   | `hai:payment:030` | Provider 未注册 |
| `HaiPaymentError.INVALID_AMOUNT`       | `hai:payment:040` | 金额无效        |
| `HaiPaymentError.NOTIFY_VERIFY_FAILED` | `hai:payment:050` | 回调验签失败    |
| `HaiPaymentError.NOTIFY_PARSE_FAILED`  | `hai:payment:051` | 回调解析失败    |
| `HaiPaymentError.CONFIG_ERROR`         | `hai:payment:070` | 配置无效        |

## 开发测试

```bash
pnpm --filter @h-ai/payment test
```

## 许可证

Apache-2.0
