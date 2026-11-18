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

<a id="api-一覧"></a>

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

<a id="providers"></a>

### 決済経路への接続：`payment`

検証済みのサーバー設定で決済経路を準備します。独自 Provider は公開契約を実装し、加盟店の秘密はサーバーに保持します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `payment.init` | 設定済みの決済チャネルを初期化 | `config: PaymentConfigInput`（必填） | `void` | `await payment.init(config)` |
| `payment.close` | モジュールの状態を解放 | 无参数 | `Promise<void>` | `await payment.close()` |
| `payment.getProvider` | 登録済み決済プロバイダーを取得 | name | `PaymentProvider or undefined` | `payment.getProvider(name)` |
| `payment.registerProvider` | 独自決済プロバイダーを登録 | provider | `void` | `payment.registerProvider(customProvider)` |

#### 利用例：決済経路への接続

入力はアプリが実装した PaymentProvider。登録・取得は同期処理です。初期化と終了は最小例を参照してください。

```ts
import type { PaymentProvider } from '@h-ai/payment'

function installProvider(provider: PaymentProvider) {
  payment.registerProvider(provider)
  return payment.getProvider(provider.name) === provider // true
}
payment.getProvider('not-registered') // undefined
```

<a id="orders"></a>

### 注文の作成・照会・終了：`payment`

業務注文番号で決済注文を作り、状態を照会します。未払い注文の終了は返金とは別です。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `payment.createOrder` | 決済注文を作成 | providerName, input | `PaymentOrder` | `await payment.createOrder(providerName, orderInput)` |
| `payment.queryOrder` | 決済状態を取得 | providerName, orderNo | `OrderStatus` | `await payment.queryOrder(providerName, orderNo)` |
| `payment.closeOrder` | 決済注文をクローズ | providerName, orderNo | `void` | `await payment.closeOrder(providerName, orderNo)` |

微信支付が `204 No Content` を返すと、`payment.closeOrder('wechat', orderNo)` は成功し、`data` は `undefined` です。プロキシは決済サービスのステータスをそのまま転送します。他のステータスや通信エラーは `CLOSE_ORDER_FAILED` です。

#### 利用例：注文の作成・照会・終了

作成は最小例を参照。元の決済先と注文番号を渡すと pending の注文だけを終了し、再照会結果または失敗を返します。

```ts
async function inspectAndClose(providerName: string, orderNo: string) {
  const queried = await payment.queryOrder(providerName, orderNo)
  if (!queried.success)
    return queried
  if (queried.data.status !== 'pending')
    return queried
  const closed = await payment.closeOrder(providerName, orderNo)
  if (!closed.success)
    return closed
  return payment.queryOrder(providerName, orderNo)
}
```

<a id="refunds"></a>

### 返金と結果の確認：`payment.refund`

元の注文番号と独立した返金番号で申請し、受付と最終的な返金完了を区別します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `payment.refund` | 返金要求と受付結果を取得 | providerName, input | `RefundResult` | `await payment.refund(providerName, refundInput)` |

#### 利用例：返金と結果の確認

確認済み注文と今回の一意な返金番号を入力。100 は最小通貨単位です。失敗や processing は返金完了を意味しません。

```ts
async function refundOrder(providerName: string, orderNo: string, refundNo: string) {
  const refunded = await payment.refund(providerName, { orderNo, refundNo, amount: 100 })
  if (!refunded.success)
    return refunded
  return refunded // data.status distinguishes success from processing
}
```

<a id="notifications"></a>

### 決済通知の検証：`payment.handleNotify`

元の HTTP 本文と署名ヘッダーで経路を検証し、業務注文を重複なく更新します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `payment.handleNotify` | 通知を検証してコールバックを実行 | providerName, request | `PaymentNotifyResult` | `await payment.handleNotify(providerName, originalNotification)` |

#### 利用例：決済通知の検証

入力はルートの元の Request、出力は HaiResult<PaymentNotifyResult>。本文は一度だけ読み、成功後も注文・金額・通貨・イベント ID をトランザクションで確認してから応答します。

```ts
async function verifyNotification(providerName: string, request: Request) {
  return payment.handleNotify(providerName, {
    body: await request.text(),
    headers: Object.fromEntries(request.headers),
  })
}
```


<a id="browser-payment"></a>

### ブラウザーで支払いを開始：`invokePayment`

最小例の startPayment を使い、サーバーで作成済みの注文を渡します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `invokePayment` | 決済画面を開く | `orderData: PaymentOrder` | `Promise<HaiResult<InvokePaymentResult>>` | `await invokePayment(orderData)` |

#### 利用例：呼び出し結果を確認

startPayment は success と data.invoked を確認して結果を返します。キャンセル・遷移・画面表示は入金確認になりません。
