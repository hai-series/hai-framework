# @h-ai/payment

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/audit](../audit/README.ja.md) · [@h-ai/core](../core/README.ja.md)

WeChat Pay、Alipay、Stripe に対応する統一決済モジュールです。Provider によるサーバー側の決済処理と、複数プラットフォームからの決済開始を提供します。

## クイックスタート

[最小構成の導入手順](../../docs/usage/function/payment.ja.md#quick-start)を参照してください。

## 設定一覧

生成したプロジェクトでは、決済チャネルごとのアカウントとサーバー側の認証情報を `config/_payment.yml` に記述します。アプリの起動コードがファイルを読み込み、設定オブジェクトを `payment.init(config)` に渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/payment.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/payment.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

決済プロバイダーの状態、加盟店注文の対応、通知の冪等性については[データ構造](../../docs/usage/data/payment.ja.md)を参照してください。

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
