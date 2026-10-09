# @h-ai/payment

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/audit](../audit/README.ja.md) · [@h-ai/core](../core/README.ja.md)

WeChat Pay、Alipay、Stripe に対応する統一決済モジュールです。Provider によるサーバー側の決済処理と、複数プラットフォームからの決済開始を提供します。

## 対応 Provider

| Provider   | 決済方式                               |
| ---------- | -------------------------------------- |
| WeChat Pay | JSAPI / H5 / App / Native（QR コード） |
| Alipay     | JSAPI / H5 / App / Native              |
| Stripe     | Checkout Session（国際決済）           |

## 依存関係

- `@h-ai/audit`：任意の監査ログ。初期化済みの場合、決済操作を自動記録します。

## クイックスタート

### Node.js サーバー

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

### ブラウザークライアント

```typescript
import { invokePayment } from '@h-ai/payment/client'

// 使用服务端返回的订单数据调起支付
await invokePayment(orderData)
```

## HTTP API 契約

決済 HTTP API は `@h-ai/api-contract` の `apiContract.payment` で定義します。アプリケーション contract に組み込むと、型付きクライアントで呼び出せます：

```typescript
const order = await api.payment.orders.create({
  provider: 'wechat',
  amount: 100,
  description: '商品',
  tradeType: 'jsapi',
})
```

## 設定

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

必要な Provider のみ設定してください。未設定の Provider は登録されません。

金額は最小通貨単位（分・セント）で指定し、正の整数でなければなりません。Provider を呼ぶ前に `amount` / `totalAmount` を検証し、不正な金額を決済サービスに渡さないようにします。

すべての組み込み Provider の HTTP リクエストには既定で 15 秒のタイムアウトがあり、ネットワーク障害による長時間の待機を防ぎます。

## 監査ログ

主要な決済操作が成功すると、追加設定なしで `@h-ai/audit` に監査ログを自動記録します。監査記録の失敗は warn ログのみを出力し、決済操作に影響しません。

| 操作       | `action`         | 記録内容                                |
| ---------- | ---------------- | --------------------------------------- |
| 注文作成   | `create_order`   | provider、amount、tradeType             |
| 決済通知   | `payment_notify` | provider、transactionId、status、amount |
| 返金       | `refund`         | provider、refundNo、amount              |
| 注文の終了 | `close_order`    | provider                                |

> 注文照会（`queryOrder`）は読み取り専用で、監査ログを記録しません。

## エラー処理

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

| エラーコード                           | code              | 説明                 |
| -------------------------------------- | ----------------- | -------------------- |
| `HaiPaymentError.CREATE_ORDER_FAILED`  | `hai:payment:001` | 注文作成に失敗       |
| `HaiPaymentError.NOT_INITIALIZED`      | `hai:payment:010` | モジュールが未初期化 |
| `HaiPaymentError.PROVIDER_NOT_FOUND`   | `hai:payment:030` | Provider が未登録    |
| `HaiPaymentError.INVALID_AMOUNT`       | `hai:payment:040` | 無効な金額           |
| `HaiPaymentError.NOTIFY_VERIFY_FAILED` | `hai:payment:050` | 通知の署名検証に失敗 |
| `HaiPaymentError.NOTIFY_PARSE_FAILED`  | `hai:payment:051` | 通知の解析に失敗     |
| `HaiPaymentError.CONFIG_ERROR`         | `hai:payment:070` | 無効な設定           |

## テスト

```bash
pnpm --filter @h-ai/payment test
```

## License

Apache-2.0
