---
name: hai-payment
description: 使用 @h-ai/payment 接入微信支付、支付宝、Stripe 统一支付；支持创建订单、回调验签、订单查询与退款；当需求涉及支付接入、订单创建、支付回调、退款或客户端调起支付时使用。
---

# hai-payment

> `@h-ai/payment` 是 hai-framework 的统一支付模块，通过 Provider 模式支持微信支付、支付宝、Stripe。服务端处理订单和回调，客户端调起支付。

---

## 依赖

| 模块 | 用途 | 是否必需 | 初始化要求 |
| --- | --- | --- | --- |
| `@h-ai/audit` | 审计日志（支付操作自动审计） | 可选 | 已初始化时自动写入审计日志 |

---

## 适用场景

- 接入微信支付（JSAPI / H5 / Native / App）
- 接入支付宝（H5 / App / PC）
- 接入 Stripe（Checkout Session）
- 支付回调验签与通知处理
- 订单查询与退款
- 客户端调起支付（Web / H5 / App）

---

## 使用步骤

### 1. 配置

```yaml
# config/_payment.yml（自行创建）
wechat:
  appId: ${HAI_PAYMENT_WECHAT_APP_ID}
  mchId: ${HAI_PAYMENT_WECHAT_MCH_ID}
  apiV3Key: ${HAI_PAYMENT_WECHAT_API_V3_KEY}
  privateKey: ${HAI_PAYMENT_WECHAT_PRIVATE_KEY}
  serialNo: ${HAI_PAYMENT_WECHAT_SERIAL_NO}
  platformCert: ${HAI_PAYMENT_WECHAT_PLATFORM_CERT}  # 可选，回调验签需要

alipay:
  appId: ${HAI_PAYMENT_ALIPAY_APP_ID}
  privateKey: ${HAI_PAYMENT_ALIPAY_PRIVATE_KEY}
  alipayPublicKey: ${HAI_PAYMENT_ALIPAY_PUBLIC_KEY}
  signType: RSA2  # 可选，默认 RSA2
  sandbox: false   # 可选，默认 false

stripe:
  secretKey: ${HAI_PAYMENT_STRIPE_SECRET_KEY}
  webhookSecret: ${HAI_PAYMENT_STRIPE_WEBHOOK_SECRET}
```

### 2. 初始化（服务端）

```typescript
import { payment } from '@h-ai/payment'

const initResult = await payment.init({
  wechat: {
    appId: 'wx1234567890',
    mchId: '1600000000',
    apiV3Key: 'your-api-key-v3',
    privateKey: '-----BEGIN RSA PRIVATE KEY-----...',
    serialNo: 'CERT_SERIAL_NO',
  },
  alipay: {
    appId: '2021000000000000',
    privateKey: '-----BEGIN RSA PRIVATE KEY-----...',
    alipayPublicKey: '-----BEGIN PUBLIC KEY-----...',
  },
})
if (!initResult.success) {
  // 处理初始化错误
}
```

### 3. 创建订单

```typescript
const result = await payment.createOrder('wechat', {
  orderNo: 'ORDER_20250101_001',
  amount: 9900, // 单位：分
  description: '商品名称',
  tradeType: 'jsapi',
  userId: 'user_openid',
  notifyUrl: 'https://example.com/payment/notify/wechat',
  metadata: { source: 'web' },
})

if (result.success) {
  // result.data: PaymentOrder { provider, tradeType, clientParams, prepayId? }
  // clientParams 包含调起支付所需参数
}
```

### 4. 处理支付回调

```typescript
// API 路由：POST /payment/notify/:provider
const result = await payment.handleNotify('wechat', {
  body: await request.text(),
  headers: Object.fromEntries(request.headers),
})

if (result.success) {
  // result.data: { orderNo, transactionId, amount, status, paidAt? }
  // 更新订单状态...
}
```

### 5. 查询订单

```typescript
const result = await payment.queryOrder('wechat', 'ORDER_20250101_001')

if (result.success) {
  // result.data.status: 'pending' | 'paid' | 'closed' | 'refunded' | 'failed'
}
```

### 6. 退款

```typescript
const result = await payment.refund('wechat', {
  orderNo: 'ORDER_20250101_001',
  refundNo: 'REFUND_20250101_001',
  amount: 9900,
  totalAmount: 9900, // 微信退款必填
  reason: '用户退款',
})
```

### 7. 客户端调起支付（浏览器）

```typescript
import { invokePayment } from '@h-ai/payment/client'

// 前端拿到服务端返回的 PaymentOrder 后调起支付
const payResult = await invokePayment(orderResult.data)
```

---

## 核心 API（服务端）

| API                                              | 用途     | 返回值                        |
| ------------------------------------------------ | -------- | ----------------------------- |
| `payment.init(config)`                           | 初始化   | `HaiResult<void>`                |
| `payment.close()`                                | 关闭     | `void`                        |
| `payment.createOrder(providerName, input)`       | 创建订单 | `HaiResult<PaymentOrder>`        |
| `payment.handleNotify(providerName, request)`    | 处理回调 | `HaiResult<PaymentNotifyResult>` |
| `payment.queryOrder(providerName, orderNo)`      | 查询订单 | `HaiResult<OrderStatus>`         |
| `payment.refund(providerName, input)`            | 退款     | `HaiResult<RefundResult>`        |
| `payment.closeOrder(providerName, orderNo)`      | 关闭订单 | `HaiResult<void>`                |
| `payment.getProvider(name)`                      | 获取 Provider | `PaymentProvider \| undefined` |
| `payment.registerProvider(provider)`             | 注册自定义 Provider | `void`              |

## 客户端 API

| API                      | 用途     | 返回值                        |
| ------------------------ | -------- | ----------------------------- |
| `invokePayment(options)` | 调起支付 | `HaiResult<InvokePaymentResult>` |

---

## 错误码 — `HaiPaymentError`

| 错误码 | code | 说明 |
|--------|------|------|
| `HaiPaymentError.CREATE_ORDER_FAILED` | `hai:payment:001` | 创建订单失败 |
| `HaiPaymentError.QUERY_ORDER_FAILED` | `hai:payment:002` | 查询订单失败 |
| `HaiPaymentError.REFUND_FAILED` | `hai:payment:003` | 退款失败 |
| `HaiPaymentError.CLOSE_ORDER_FAILED` | `hai:payment:004` | 关闭订单失败 |
| `HaiPaymentError.NOT_INITIALIZED` | `hai:payment:010` | 模块未初始化 |
| `HaiPaymentError.SIGN_FAILED` | `hai:payment:020` | 签名失败 |
| `HaiPaymentError.PROVIDER_NOT_FOUND` | `hai:payment:030` | Provider 未注册 |
| `HaiPaymentError.INVALID_AMOUNT` | `hai:payment:040` | 金额无效 |
| `HaiPaymentError.NOTIFY_VERIFY_FAILED` | `hai:payment:050` | 回调验签失败 |
| `HaiPaymentError.NOTIFY_PARSE_FAILED` | `hai:payment:051` | 回调解析失败 |
| `HaiPaymentError.INVOKE_WEB_FAILED` | `hai:payment:060` | Web 端调起支付失败 |
| `HaiPaymentError.INVOKE_APP_FAILED` | `hai:payment:061` | App 端调起支付失败 |
| `HaiPaymentError.CONFIG_ERROR` | `hai:payment:070` | 配置无效 |

---

## Provider 模式

### PaymentProvider 接口

```typescript
interface PaymentProvider {
  readonly name: string
  createOrder: (input: CreateOrderInput) => Promise<HaiResult<PaymentOrder>>
  handleNotify: (request: PaymentNotifyRequest) => Promise<HaiResult<PaymentNotifyResult>>
  queryOrder: (outTradeNo: string) => Promise<HaiResult<OrderStatus>>
  refund: (input: RefundInput) => Promise<HaiResult<RefundResult>>
  closeOrder: (outTradeNo: string) => Promise<HaiResult<void>>
}
```

内置 Provider：

- **wechat** — 微信支付 API v3（RSA-SHA256 签名、AES-256-GCM 回调解密）
- **alipay** — 支付宝开放平台（RSA2 签名验签）
- **stripe** — Stripe Checkout Session 模式

### API 契约

```typescript
import { paymentEndpoints } from '@h-ai/payment/api'

// paymentEndpoints.createOrder    — POST /payment/create
// paymentEndpoints.queryOrder     — GET  /payment/query
// paymentEndpoints.notifyWechat   — POST /payment/notify/wechat
// paymentEndpoints.notifyAlipay   — POST /payment/notify/alipay
// paymentEndpoints.notifyStripe   — POST /payment/notify/stripe
// paymentEndpoints.refund         — POST /payment/refund
```

---

## 常见模式

### 服务端路由（SvelteKit）

```typescript
import { kit } from '@h-ai/kit'
// src/routes/api/v1/payment/create/+server.ts
import { payment } from '@h-ai/payment'

export const POST = kit.handler(async ({ request, locals }) => {
  const body = await request.json()
  const result = await payment.createOrder(body.provider, {
    orderNo: body.orderNo,
    amount: body.amount,
    description: body.description,
    tradeType: body.tradeType,
    userId: body.userId,
    notifyUrl: body.notifyUrl,
  })

  if (!result.success) {
    return kit.response.internalError(result.error.message)
  }

  return kit.response.ok(result.data, locals.requestId)
})
```

### 完整支付流程

```
1. 客户端 → 服务端：创建订单（api.call(paymentEndpoints.createOrder, {...})）
2. 服务端 → 支付平台：调用 Provider 创建预支付
3. 服务端 → 客户端：返回 providerData（含调起参数）
4. 客户端：invokePayment(providerData) 调起支付
5. 支付平台 → 服务端：异步回调通知
6. 服务端：handleNotify() 验签 + 更新订单状态
7. 客户端：轮询或回调查询订单状态
```

---

## 审计日志

关键支付操作成功后自动写入审计日志（依赖 `@h-ai/audit`），无需额外配置。失败仅 warn，不影响支付流程。

| 操作 | `action` | `resource` | `resourceId` | `details` |
| --- | --- | --- | --- | --- |
| 创建订单 | `create_order` | `payment` | `orderNo` | `{ provider, amount, tradeType }` |
| 支付回调 | `payment_notify` | `payment` | `orderNo` | `{ provider, transactionId, status, amount }` |
| 退款 | `refund` | `payment` | `orderNo` | `{ provider, refundNo, amount }` |
| 关闭订单 | `close_order` | `payment` | `orderNo` | `{ provider }` |

> `queryOrder` 为只读操作，不写审计日志。

---

## 相关 Skills

- `hai-kit`：服务端 API 路由与契约处理
- `hai-api-client`：客户端契约调用
- `hai-reldb`：订单持久化存储
- `hai-audit`：审计日志（payment 内部自动调用）
- `hai-core`：HaiResult 类型、日志、配置
