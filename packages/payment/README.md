# @h-ai/payment

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/audit](../audit/README.md) · [@h-ai/core](../core/README.md)

统一支付模块，支持微信支付、支付宝和 Stripe，提供 Provider 模式的后端支付处理与浏览器支付调起能力。

## 快速开始

### 依赖

- `@h-ai/audit` — 审计日志（支付操作自动审计），可选；已初始化时自动写入审计日志
- `@h-ai/reldb` — 启用 Stripe 时必需，先初始化共享数据库；持久化渠道映射和幂等结果。仅微信/支付宝时无此硬依赖。

并发调用 `close()` 会使尚未完成的 `init()` 失效，迟到初始化不会重新打开模块；等待该次初始化返回后可再次初始化。

#### Node.js 服务端

```typescript
import type { PaymentConfigInput } from '@h-ai/payment'
import { payment } from '@h-ai/payment'

export async function paymentExample(trustedConfig: PaymentConfigInput, trustedOpenid: string) {
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

#### 浏览器客户端

将后端 `payment.createOrder` 成功返回的订单数据传给 `startPayment`。在微信内使用时，先等待 `WeixinJSBridgeReady`。

```typescript
import type { PaymentOrder } from '@h-ai/payment'
import { invokePayment } from '@h-ai/payment/client'

export async function startPayment(orderData: PaymentOrder) {
  // 用订单及渠道参数发起支付，检查接口调用是否成功。
  const invoked = await invokePayment(orderData)
  if (!invoked.success)
    throw new Error(invoked.error.message)
  if (!invoked.data.invoked)
    throw new Error(invoked.data.message)
  // 返回调起结果。成交状态由服务端查询或异步通知确认。
  return invoked.data
}
```

## 配置清单

生成项目使用 `config/_payment.yml`。应用可以通过 `payment.init(config)` 接入配置。

在[模块配置清单](../../docs/usage/configuration/payment.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/payment.md)中查看调用示例、输入输出、错误处理与使用要点。

- `init` / `close` / `config` / `isInitialized` / `registerProvider` / `getProvider` — 管理渠道配置与 Provider
- `createOrder` / `queryOrder` / `refund` / `closeOrder` / `handleNotify` — 下单、查单、退款、关单和验签通知
- `invokePayment` — 从客户端启动渠道支付流程

## 数据结构

查看[数据结构](../../docs/usage/data/payment.md)，了解支付渠道状态、商户订单映射与通知幂等记录。

## 开发测试

```bash
pnpm --filter @h-ai/payment typecheck
pnpm --filter @h-ai/payment lint
pnpm --filter @h-ai/payment build
pnpm --filter @h-ai/payment test
node scripts/check-module-jsdoc.mjs --package payment
pnpm --filter @h-ai/payment exec vitest run tests/payment-provider-alipay.test.ts tests/payment-provider-wechat.test.ts tests/payment-provider-stripe.test.ts
```

声明中的示例使用真实 `@h-ai/payment` / `@h-ai/payment/client` 入口，区分配置输入与解析输出、`HaiResult.success` 与业务付款/退款状态。内部签名、协议解析和持久操作仓库标注“模块内部上下文”，不能作为应用的深层导入入口。运行 `node scripts/check-module-jsdoc.mjs --package payment` 校验覆盖及示例类型；它不会执行真实支付、网络请求、设备桥接或业务履约，渠道集成仍需对应验收。详见 [模块 JSDoc 规范](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## 许可证

Apache-2.0
