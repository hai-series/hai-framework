# @h-ai/payment

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/audit](../audit/README.ja.md) · [@h-ai/core](../core/README.ja.md)

## 概要

WeChat Pay、Alipay、Stripe に対応する統一決済モジュールです。Provider によるサーバー側の決済処理と、複数プラットフォームからの決済開始を提供します。

## 主な機能

| Provider   | 決済方式                                         |
| ---------- | ------------------------------------------------ |
| WeChat Pay | JSAPI / H5 / App / Native（QR コード）           |
| Alipay     | JSAPI / H5 / App / Native                        |
| Stripe     | h5：ホスト型 Checkout ページへの遷移（国際決済） |

## 使い始める

### 依存関係

- `@h-ai/audit`：任意の監査ログ。初期化済みの場合、決済操作を自動記録します。
- `@h-ai/reldb`：Stripe 有効時は必須です。共有データベースを先に初期化し、チャネル識別子と冪等結果を永続化します。WeChat/Alipay のみなら必須ではありません。

### クイックスタート

#### Node.js サーバー

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

#### ブラウザークライアント

```typescript
import { invokePayment } from '@h-ai/payment/client'

// 使用服务端返回的订单数据调起支付
await invokePayment(orderData)
```

### HTTP API 契約

決済 HTTP API は `@h-ai/api-contract` の `apiContract.payment` で定義します。アプリケーション contract に組み込むと、型付きクライアントで呼び出せます：

```typescript
const order = await api.payment.orders.create({
  provider: 'wechat',
  amount: 100,
  description: '商品',
  tradeType: 'jsapi',
})
```

### 設定

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
    secretKey: 'sk_test_xxx',
    webhookSecret: 'whsec_xxx',
    successUrl: 'https://app.example/payment/success?session_id={CHECKOUT_SESSION_ID}', // 必須
    cancelUrl: 'https://app.example/payment/cancel', // 任意
    webhookToleranceSeconds: 300, // 可选，默认 300 秒
  },
})
```

必要な Provider のみ設定してください。未設定の Provider は登録されません。

金額は最小通貨単位（分・セント）で指定し、正の整数でなければなりません。Provider を呼ぶ前に `amount` / `totalAmount` を検証し、不正な金額を決済サービスに渡さないようにします。

すべての組み込み Provider の HTTP リクエストには既定で 15 秒のタイムアウトがあり、ネットワーク障害による長時間の待機を防ぎます。

### Stripe ホスト型 Checkout と注文終了

`mode=payment`、`ui_mode=hosted_page`、`tradeType=h5` のみ実装し、API は `Stripe-Version: 2026-09-30.endive` に固定します。embedded/elements、JSAPI、App、Native、小程序は Provider・HTTP schema・ブラウザー入口で拒否します。サーバー設定の `successUrl` は必須、`cancelUrl` は任意で、HTTP(S) のみ使用できます。成功 URL には `{CHECKOUT_SESSION_ID}` を含められます。クライアントから変更できず、同じ注文の再試行でも作成パラメータを変更できません。

`closeOrder('stripe', orderNo)` は保存済み Session を照会し、open/unpaid の場合のみ expire を呼びます。expired 確認済みなら冪等に成功し、complete/paid は失敗します。同時終了や応答喪失時は再照会で過期を確認してから成功を返します。成功・キャンセル画面への遷移は支払完了や注文終了の証明ではありません。

参照：[Checkout Session 作成](https://docs.stripe.com/api/checkout/sessions/create)、[Session の終了](https://docs.stripe.com/api/checkout/sessions/expire)。

### Stripe 通知の状態

Stripe Provider は `mode=payment` の `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired` のみ処理します。Webhook はこれらのイベントのみ購読してください。他のリソースイベントや不完全な Session は `NOTIFY_PARSE_FAILED` となり、仮の pending 注文を生成しません。

`completed` でも `payment_status=unpaid` なら `pending` であり、履行できません。`paid` / `no_payment_required` のみ `paid`、非同期決済失敗は `failed`、期限切れは `closed` です。`paidAt` は paid の場合のみ返り、成功イベントの `created` を使用するため再配信でも変わりません。

結果には `eventId` と大文字の `currency` が含まれ、`transactionId` は Checkout Session ID です。アプリケーションは共有データベースで注文・金額・通貨を照合し、通知の重複排除と状態の逆戻り防止を行う必要があります。署名検証と解析は業務トランザクションの代わりにはなりません。`success` だけでなく `status === 'paid'` を確認して履行してください。

参照：[Stripe イベント種類](https://docs.stripe.com/api/events/types)、[Checkout Session のフィールド](https://docs.stripe.com/api/checkout/sessions/object)。

### Stripe の永続化と冪等性

Stripe を有効にする前に reldb を初期化して success を確認し、その後 payment を初期化してください。終了は payment、reldb の順です。初期化は `hai_payment_stripe_operations` の作成を待ち、失敗時は Provider を公開しません。複数ノードは同一の PostgreSQL/MySQL を使用します。SQLite は開発または同一ホストで明示的に共有するファイル用で、別ホストのローカルファイルを共有状態として扱えません。

注文マッピングを必要とする最初の操作は `/v1/account` を読みます。アカウント ID とキーの test/live モードで記録を分離し、同アカウントのキー更新後もマッピングを維持します。キーは `sk_test_`、`sk_live_`、`rk_test_`、`rk_live_` のいずれかで始まり、制限付きキーにはアカウント読取権限も必要です。

注文作成はアカウント・モード・orderNo から安定した `Idempotency-Key` を生成し、DB の一意な記録で正規化リクエストと Session ID を結びます。metadata.orderNo の上書きは禁止です。照会・返金はその Session ID のみを読み、注文番号・金額・通貨を照合し、PaymentIntent を保存します。不明な注文は失敗します。返金は refundNo ごとに結果を保持し、同じ識別子でのパラメータ変更を拒否します。自由記述 reason は metadata に保存し、Stripe reason は requested_by_customer を使用します。

応答喪失や DB 保存失敗でも予約を削除せず、成功扱いにしません。結果不明の操作は DB 時刻による 23 時間の範囲内だけ同一キーで再試行できます。それ以降は Stripe と照合して記録を修復し、記録を削除して無条件に再送してはいけません。確定結果はキャッシュ TTL で削除しません。返金の processing は着金完了を示しません。参照：[Stripe の冪等性保持期間](https://docs.stripe.com/api/idempotent_requests)。

### 監査ログ

主要な決済操作が成功すると、追加設定なしで `@h-ai/audit` に監査ログを自動記録します。監査記録の失敗は warn ログのみを出力し、決済操作に影響しません。

| 操作       | `action`         | 記録内容                                |
| ---------- | ---------------- | --------------------------------------- |
| 注文作成   | `create_order`   | provider、amount、tradeType             |
| 決済通知   | `payment_notify` | provider、transactionId、status、amount |
| 返金       | `refund`         | provider、refundNo、amount              |
| 注文の終了 | `close_order`    | provider                                |

> 注文照会（`queryOrder`）は読み取り専用で、監査ログを記録しません。

### エラー処理

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

主なエラーコード：

| エラーコード                             | code              | 説明                 |
| ---------------------------------------- | ----------------- | -------------------- |
| `HaiPaymentError.CREATE_ORDER_FAILED`    | `hai:payment:001` | 注文作成に失敗       |
| `HaiPaymentError.NOT_INITIALIZED`        | `hai:payment:010` | モジュールが未初期化 |
| `HaiPaymentError.PROVIDER_NOT_FOUND`     | `hai:payment:030` | Provider が未登録    |
| `HaiPaymentError.INVALID_AMOUNT`         | `hai:payment:040` | 無効な金額           |
| `HaiPaymentError.UNSUPPORTED_TRADE_TYPE` | `hai:payment:041` | 未実装の決済方式     |
| `HaiPaymentError.NOTIFY_VERIFY_FAILED`   | `hai:payment:050` | 通知の署名検証に失敗 |
| `HaiPaymentError.NOTIFY_PARSE_FAILED`    | `hai:payment:051` | 通知の解析に失敗     |
| `HaiPaymentError.CONFIG_ERROR`           | `hai:payment:070` | 無効な設定           |

## 開発とテスト

```bash
pnpm --filter @h-ai/payment test
```

## ライセンス

Apache-2.0
