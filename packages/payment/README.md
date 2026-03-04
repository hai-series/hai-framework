# @h-ai/payment

统一支付模块，支持微信支付、支付宝和 Stripe，提供 Provider 模式的后端支付处理与多端客户端调起能力。

## 快速开始

```ts
import { payment } from '@h-ai/payment'

// 客户端调起支付
import { invokePayment } from '@h-ai/payment/client'

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

if (result.success) {
  await invokePayment(result.data)
}
```

## 功能

| Provider | 支付场景                         |
| -------- | -------------------------------- |
| 微信支付 | JSAPI / H5 / App / Native (扫码) |
| 支付宝   | JSAPI / H5 / App / Native        |
| Stripe   | Checkout Session（国际支付）     |
