# @h-ai/payment API リファレンス

<!-- translation: partial -->

[原文（中国語）](payment.md) · [設定](../configuration/payment.ja.md) · [データ構造](../data/payment.ja.md)

<a id="quick-start"></a>

## クイックスタート

注文作成前に Payment を初期化します。金額の検証と操作の認可はアプリ側で行います。決済サービスの通知と照会結果はアプリ独自の注文状態の入力として扱います。

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

## API 一覧

直接値や Promise<void> を返す行以外、出力は成功時の HaiResult.data です。

| API | 用途 | 入力と既定値 | 出力 | 例 |
| --- | --- | --- | --- | --- |
| `payment.init` | 設定済みの決済チャネルを初期化 | `config` | `void` | `await payment.init(config)` |
| `payment.close` | モジュールの状態を解放 | なし | `Promise<void>` | `await payment.close()` |
| `payment.createOrder` | 決済チャネルの支払い情報を発行 | `providerName, input` | `PaymentOrder` | `await payment.createOrder(providerName, orderInput)` |
| `payment.queryOrder` | 現在の決済状態を取得 | `providerName, orderNo` | `OrderStatus` | `await payment.queryOrder(providerName, orderNo)` |
| `payment.refund` | 業務上の返金 ID を指定して返金を依頼 | `providerName, input` | `RefundResult` | `await payment.refund(providerName, refundInput)` |
| `payment.closeOrder` | 未決済の注文の取り消しを依頼 | `providerName, orderNo` | `void` | `await payment.closeOrder(providerName, orderNo)` |
| `payment.handleNotify` | 決済通知を使う前に署名を確認 | `providerName, request` | `PaymentNotifyResult` | `await payment.handleNotify(providerName, originalNotification)` |
| `payment.getProvider` | 登録済み、または設定したプロバイダーを取得 | `name` | `PaymentProvider or undefined` | `payment.getProvider(name)` |
| `payment.registerProvider` | アプリが用意した決済プロバイダーを登録 | `provider` | `void` | `payment.registerProvider(customProvider)` |

支払い情報の発行成功は入金を意味しません。通知を検証し、同じ業務イベントで注文を二重に更新しないようにします。

未翻訳：決済チャネルごとの購入手続き、通知、返金例。[中国語の該当節](payment.md#api-reference)を参照してください。
