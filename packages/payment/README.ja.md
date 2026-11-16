# @h-ai/payment

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/audit](../audit/README.ja.md) · [@h-ai/core](../core/README.ja.md)

WeChat Pay、Alipay、Stripe に対応する統一決済モジュールです。Provider によるサーバー側の決済処理と、複数プラットフォームからの決済開始を提供します。

## クイックスタート

### 依存関係

- `@h-ai/audit`：任意の監査ログ。初期化済みの場合、決済操作を自動記録します。
- `@h-ai/reldb`：Stripe 有効時は必須です。共有データベースを先に初期化し、チャネル識別子と冪等結果を永続化します。WeChat/Alipay のみなら必須ではありません。

並行する `close()` は未完了の `init()` を無効にし、遅い初期化がモジュールを再開しないようにします。その初期化の完了を待ってから再初期化できます。

#### Node.js サーバー

```typescript
import type { PaymentConfigInput } from '@h-ai/payment'
import { payment } from '@h-ai/payment'

export async function paymentExample(trustedConfig: PaymentConfigInput, trustedOpenid: string) {
  // 常駐サービスでは起動時に初期化し、停止時に閉じます。
  // Stripe を有効にする場合は、先に共有 reldb の初期化結果を確認します。
  const initialized = await payment.init(trustedConfig)
  if (!initialized.success)
    throw new Error(initialized.error.message)
  try {
    const created = await payment.createOrder('wechat', {
      orderNo: 'ORD001',
      amount: 100,
      description: 'サンプル商品',
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
    await payment.close() // ホストはその後で reldb を閉じます。
  }
}
```

#### ブラウザークライアント

バックエンドの `payment.createOrder` が成功時に返した注文データを `startPayment` に渡します。WeChat 内では `WeixinJSBridgeReady` を待ってから呼び出します。

```typescript
import type { PaymentOrder } from '@h-ai/payment'
import { invokePayment } from '@h-ai/payment/client'

export async function startPayment(orderData: PaymentOrder) {
  // 注文とプロバイダーのパラメーターで決済を開始し、実行結果を確認します。
  const invoked = await invokePayment(orderData)
  if (!invoked.success)
    throw new Error(invoked.error.message)
  if (!invoked.data.invoked)
    throw new Error(invoked.data.message)
  // 起動結果を返します。決済の成立はサーバーの照会や非同期通知で確認します。
  return invoked.data
}
```

## 設定一覧

生成プロジェクトは `config/_payment.yml` を使用します。アプリで設定を取り込む入口は `payment.init(config)` です。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/payment.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/payment.md)（中国語）を参照してください。

- `init` / `close` / `config` / `isInitialized` / `registerProvider` / `getProvider` — 決済チャネルの設定とプロバイダー管理
- `createOrder` / `queryOrder` / `refund` / `closeOrder` / `handleNotify` — 注文作成、照会、返金、終了、通知の署名検証
- `invokePayment` — クライアントからチャネルの決済フローを開始

## データ構造

決済プロバイダーの状態、加盟店注文の対応、通知の冪等性については[データ構造](../../docs/usage/data/payment.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/payment typecheck
pnpm --filter @h-ai/payment lint
pnpm --filter @h-ai/payment build
pnpm --filter @h-ai/payment test
node scripts/check-module-jsdoc.mjs --package payment
pnpm --filter @h-ai/payment exec vitest run tests/payment-provider-alipay.test.ts tests/payment-provider-wechat.test.ts tests/payment-provider-stripe.test.ts
```

宣言の例は実際の `@h-ai/payment` / `@h-ai/payment/client` を使い、設定入力と解析済み出力、`HaiResult.success` と決済・返金の確定状態を区別します。署名、プロトコル解析、永続操作の内部ヘルパーには「模块内部上下文」と明記し、アプリからの深い import の入口にはしません。`node scripts/check-module-jsdoc.mjs --package payment` で網羅性と例の型を確認できます。実決済、ネットワーク通信、端末ブリッジ、履行は実行しないため、別途統合検証が必要です。[モジュール JSDoc 規約](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)も参照してください。

## ライセンス

Apache-2.0
