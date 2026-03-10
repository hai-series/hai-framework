---
name: hai-payment
description: 使用 @h-ai/payment 接入微信支付、支付宝、Stripe 统一支付；支持创建订单、回调验签、订单查询与退款；当需求涉及支付接入、订单创建、支付回调、退款或客户端调起支付时使用。
---

# hai-payment

> `@h-ai/payment` 是 hai-framework 的统一支付模块，通过 Provider 模式支持微信支付、支付宝、Stripe。服务端处理订单和回调，客户端调起支付。

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
  appId: ${WECHAT_PAY_APP_ID}
  mchId: ${WECHAT_PAY_MCH_ID}
  apiV3Key: ${WECHAT_PAY_API_KEY_V3}
  privateKey: ${WECHAT_PAY_PRIVATE_KEY}
  serialNo: ${WECHAT_PAY_SERIAL_NO}
  notifyUrl: ${WECHAT_PAY_NOTIFY_URL}

alipay:
  appId: ${ALIPAY_APP_ID}
  privateKey: ${ALIPAY_PRIVATE_KEY}
  alipayPublicKey: ${ALIPAY_PUBLIC_KEY}
  notifyUrl: ${ALIPAY_NOTIFY_URL}

stripe:
  secretKey: ${STRIPE_SECRET_KEY}
  webhookSecret: ${STRIPE_WEBHOOK_SECRET}
  successUrl: ${STRIPE_SUCCESS_URL}
  cancelUrl: ${STRIPE_CANCEL_URL}
```

### 2. 初始化（服务端）

```typescript
import { payment } from '@h-ai/payment'

await payment.init({
  wechat: {
    appId: 'wx1234567890',
    mchId: '1600000000',
    apiV3Key: 'your-api-key-v3',
    privateKey: '-----BEGIN RSA PRIVATE KEY-----...',
    serialNo: 'CERT_SERIAL_NO',
    notifyUrl: 'https://example.com/api/v1/payment/notify/wechat',
  },
  alipay: {
    appId: '2021000000000000',
    privateKey: '-----BEGIN RSA PRIVATE KEY-----...',
    alipayPublicKey: '-----BEGIN PUBLIC KEY-----...',
    notifyUrl: 'https://example.com/api/v1/payment/notify/alipay',
  },
})
```

### 3. 创建订单

```typescript
const result = await payment.createOrder({
  provider: 'wechat',
  tradeType: 'JSAPI',
  outTradeNo: 'ORDER_20250101_001',
  totalAmount: 9900, // 单位：分
  subject: '商品名称',
  notifyUrl: 'https://example.com/api/v1/payment/notify/wechat',
  extra: { openid: 'user_openid' },
})

if (result.success) {
  // result.data: PaymentOrder { outTradeNo, providerData, status }
  // providerData 包含调起支付所需参数
}
```

### 4. 处理支付回调

```typescript
// API 路由：POST /api/v1/payment/notify/:provider
const result = await payment.handleNotify({
  provider: 'wechat',
  headers: Object.fromEntries(request.headers),
  body: await request.text(),
})

if (result.success) {
  // result.data: { outTradeNo, status, amount }
  // 更新订单状态...
}
```

### 5. 查询订单

```typescript
const result = await payment.queryOrder('wechat', 'ORDER_20250101_001')

if (result.success) {
  console.log(result.data.status) // 'PAID' | 'PENDING' | 'CLOSED' | 'REFUNDED'
}
```

### 6. 退款

```typescript
const result = await payment.refund({
  provider: 'wechat',
  outTradeNo: 'ORDER_20250101_001',
  outRefundNo: 'REFUND_20250101_001',
  totalAmount: 9900,
  refundAmount: 9900,
  reason: '用户退款',
})
```

### 7. 客户端调起支付（浏览器）

```typescript
import { invokePayment } from '@h-ai/payment/client'

// 前端拿到 providerData 后调起支付
const payResult = await invokePayment({
  provider: 'wechat',
  tradeType: 'JSAPI',
  providerData: orderResult.data.providerData,
})
```

---

## 核心 API（服务端）

| API                                        | 用途     | 返回值                        |
| ------------------------------------------ | -------- | ----------------------------- |
| `payment.init(config)`                     | 初始化   | `void`                        |
| `payment.createOrder(input)`               | 创建订单 | `Result<PaymentOrder>`        |
| `payment.handleNotify(request)`            | 处理回调 | `Result<PaymentNotifyResult>` |
| `payment.queryOrder(provider, outTradeNo)` | 查询订单 | `Result<OrderStatus>`         |
| `payment.refund(input)`                    | 退款     | `Result<RefundResult>`        |
| `payment.closeOrder(provider, outTradeNo)` | 关闭订单 | `Result<void>`                |

## 客户端 API

| API                      | 用途     | 返回值                        |
| ------------------------ | -------- | ----------------------------- |
| `invokePayment(options)` | 调起支付 | `Result<InvokePaymentResult>` |

---

## 错误码 — `PaymentErrorCode`

| 错误码 | 常量                    | 说明                   |
| ------ | ----------------------- | ---------------------- |
| 7000   | `CREATE_ORDER_FAILED`   | 创建订单失败           |
| 7001   | `QUERY_ORDER_FAILED`    | 查询订单失败           |
| 7002   | `REFUND_FAILED`         | 退款失败               |
| 7003   | `CLOSE_ORDER_FAILED`    | 关闭订单失败           |
| 7010   | `NOT_INITIALIZED`       | 模块未初始化           |
| 7020   | `SIGN_FAILED`           | 签名失败               |
| 7030   | `PROVIDER_NOT_FOUND`    | Provider 未注册        |
| 7040   | `INVALID_AMOUNT`        | 金额无效               |
| 7050   | `NOTIFY_VERIFY_FAILED`  | 回调验签失败           |
| 7051   | `NOTIFY_PARSE_FAILED`   | 回调解析失败           |
| 7060   | `INVOKE_WEB_FAILED`     | Web 端调起支付失败     |
| 7061   | `INVOKE_APP_FAILED`     | App 端调起支付失败     |
| 7070   | `CONFIG_ERROR`          | 配置无效               |

---

## Provider 模式

### PaymentProvider 接口

```typescript
interface PaymentProvider {
  readonly name: string
  createOrder: (input: CreateOrderInput) => Promise<Result<PaymentOrder, PaymentError>>
  handleNotify: (request: PaymentNotifyRequest) => Promise<Result<PaymentNotifyResult, PaymentError>>
  queryOrder: (outTradeNo: string) => Promise<Result<OrderStatus, PaymentError>>
  refund: (input: RefundInput) => Promise<Result<RefundResult, PaymentError>>
  closeOrder: (outTradeNo: string) => Promise<Result<void, PaymentError>>
}
```

内置 Provider：

- **wechat** — 微信支付 API v3（RSA-SHA256 签名、AES-256-GCM 回调解密）
- **alipay** — 支付宝开放平台（RSA2 签名验签）
- **stripe** — Stripe Checkout Session 模式

### API 契约

```typescript
import { paymentEndpoints } from '@h-ai/payment/api'

// paymentEndpoints.createOrder    — POST /api/v1/payment/create
// paymentEndpoints.queryOrder     — GET  /api/v1/payment/query/:orderNo
// paymentEndpoints.notifyWechat   — POST /api/v1/payment/notify/wechat
// paymentEndpoints.notifyAlipay   — POST /api/v1/payment/notify/alipay
// paymentEndpoints.notifyStripe   — POST /api/v1/payment/notify/stripe
// paymentEndpoints.refund         — POST /api/v1/payment/refund
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
  const result = await payment.createOrder(body)

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

## 相关 Skills

- `hai-kit`：服务端 API 路由与契约处理
- `hai-api-client`：客户端契约调用
- `hai-reldb`：订单持久化存储
- `hai-core`：Result 类型、日志、配置
