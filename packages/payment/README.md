# @h-ai/payment

统一支付模块，支持微信支付、支付宝和 Stripe，提供 Provider 模式的后端支付处理与多端客户端调起能力。

## 支持的 Provider

| Provider | 支付场景                         |
| -------- | -------------------------------- |
| 微信支付 | JSAPI / H5 / App / Native (扫码) |
| 支付宝   | JSAPI / H5 / App / Native        |
| Stripe   | Checkout Session（国际支付）     |

## 依赖

- `@h-ai/audit` — 审计日志（支付操作自动审计），可选；已初始化时自动写入审计日志

## 快速开始

### Node.js 服务端

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

### 浏览器客户端

```typescript
import { invokePayment } from '@h-ai/payment/client'

// 使用服务端返回的订单数据调起支付
await invokePayment(orderData)
```

## API 契约

通过 `@h-ai/payment/api` 导出端点定义，与 `@h-ai/api-client` 和 `@h-ai/kit` 配合使用：

```typescript
import { paymentEndpoints } from '@h-ai/payment/api'
```

## 配置

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
  },
})
```

只配置需要的 Provider 即可，未配置的 Provider 不会注册。

## 审计日志

关键支付操作执行成功后会自动写入审计日志（依赖 `@h-ai/audit`），无需额外配置。审计写入失败仅输出 warn 日志，不影响支付操作。

| 操作     | `action`         | 记录内容                                |
| -------- | ---------------- | --------------------------------------- |
| 创建订单 | `create_order`   | provider、amount、tradeType             |
| 支付回调 | `payment_notify` | provider、transactionId、status、amount |
| 退款     | `refund`         | provider、refundNo、amount              |
| 关闭订单 | `close_order`    | provider                                |

> 订单查询（`queryOrder`）为只读操作，不写审计日志。

## 错误处理

```typescript
const result = await payment.createOrder('wechat', orderInput)
if (!result.success) {
  switch (result.error.code) {
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
| `HaiPaymentError.NOTIFY_VERIFY_FAILED` | `hai:payment:050` | 回调验签失败    |
| `HaiPaymentError.CONFIG_ERROR`         | `hai:payment:070` | 配置无效        |

## 测试

```bash
pnpm --filter @h-ai/payment test
```

## License

Apache-2.0
