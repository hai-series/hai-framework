# @h-ai/iam

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/audit](../audit/README.ja.md) · [@h-ai/cache](../cache/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md) · [@h-ai/reach](../reach/README.ja.md)

共通の `iam` オブジェクトで認証、セッション、認可、ユーザー管理を提供する Identity and Access Management モジュールです。

## クイックスタート

[最小構成の導入手順](../../docs/usage/function/iam.md#最小接入示例)（中国語）を参照してください。

## 設定一覧

生成したプロジェクトでは、利用できるログイン方法、パスワードのルール、セッションの有効期間を `config/_iam.yml` に記述します。アプリの起動コードがファイルを読み込み、設定オブジェクトを `iam.init(config)` に渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/iam.md)（中国語）を参照してください。

## 機能

[API 一覧](../../docs/usage/function/iam.md#api-reference)（中国語）で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

アカウント、ロール、権限、セッション、ワンタイム認証情報については[データ構造](../../docs/usage/data/iam.md)（中国語）を参照してください。

## 開発とテスト

公開例は `@h-ai/iam` を使用し、既定値を省略できる `IamConfigInput` と解析済み `IamConfig` を区別します。依存を先に初期化し、`HaiResult.success` を確認し、会話更新には読取時の `version`、通知には永続的な冪等キーを使います。「模块内部上下文」の戦略・倉庫例はアプリ向け深い import の契約ではありません。チェッカーは型だけを確認し、Redis/DB・LDAP・配送の動作には対応する統合テストが必要です。[JSDoc 規約](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)も参照してください。

```bash
pnpm --filter @h-ai/iam typecheck
pnpm --filter @h-ai/iam lint
pnpm --filter @h-ai/iam build
pnpm --filter @h-ai/iam test
node scripts/check-module-jsdoc.mjs --package iam
```

## ライセンス

Apache-2.0
