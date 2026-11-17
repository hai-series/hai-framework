# @h-ai/payment API reference

<!-- translation: partial -->

[Chinese source](payment.md) · [Configuration](../configuration/payment.en.md) · [Data structures](../data/payment.en.md)

<a id="quick-start"></a>

## Quick start

Initialize Payment before creating orders. Validate amounts and authorize operations in application code. Treat provider callbacks and query results as inputs to the app’s own order state machine.

```typescript
import type { PaymentConfigInput } from '@h-ai/payment'
import { payment } from '@h-ai/payment'

export async function paymentExample(trustedConfig: PaymentConfigInput, trustedOpenid: string) {
  // 常驻服务在启动/停机时分别 init/close；此函数演示完整生命周期。
  // 如启用 Stripe，应用已先调用 reldb.init() 打开共享数据库并检查 success。
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
    await payment.close() // 随后关闭应用打开的 reldb。
  }
}
```

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

<a id="api-reference"></a>

## API list

The output is successful HaiResult.data unless the operation is listed as returning a direct value or Promise<void>.

| API | Purpose | Inputs and defaults | Output | Example |
| --- | --- | --- | --- | --- |
| `payment.init` | Initialize configured payment channels | `config` | `void` | `await payment.init(config)` |
| `payment.close` | Release module state | None | `Promise<void>` | `await payment.close()` |
| `payment.createOrder` | Create channel payment instructions | `providerName, input` | `PaymentOrder` | `await payment.createOrder(providerName, orderInput)` |
| `payment.queryOrder` | Read current channel status | `providerName, orderNo` | `OrderStatus` | `await payment.queryOrder(providerName, orderNo)` |
| `payment.refund` | Request a refund with a business refund ID | `providerName, input` | `RefundResult` | `await payment.refund(providerName, refundInput)` |
| `payment.closeOrder` | Request cancellation of an unpaid order | `providerName, orderNo` | `void` | `await payment.closeOrder(providerName, orderNo)` |
| `payment.handleNotify` | Verify the provider notification before use | `providerName, request` | `PaymentNotifyResult` | `await payment.handleNotify(providerName, originalNotification)` |
| `payment.getProvider` | Look up a registered or configured provider | `name` | `PaymentProvider or undefined` | `payment.getProvider(name)` |
| `payment.registerProvider` | Register an application-provided provider | `provider` | `void` | `payment.registerProvider(customProvider)` |

An order creation result does not mean the customer paid. Verify notifications and update application orders once per business event.

Still untranslated: the channel-specific checkout, callback and refund examples. Read the [Chinese source section](payment.md#api-reference).
