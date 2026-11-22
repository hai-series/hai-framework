# @h-ai/audit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

統一された監査ログモジュールです。`audit` オブジェクトで記録、検索、削除、集計を行い、`@h-ai/reldb` で永続化します。

## クイックスタート

`pnpm add @h-ai/audit @h-ai/reldb` でインストールします。

[最小構成の導入手順](../../docs/usage/function/audit.ja.md#quick-start)を参照してください。

## 設定一覧

生成したプロジェクトでは、監査の記録、保持、バックアップ、通知の設定を `config/_audit.yml` に記述します。アプリの起動コードがファイルを読み込み、設定オブジェクトを `audit.init(config)` に渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/audit.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/audit.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

`audit.countByOutcome(filters)` で一覧の成功、失敗、拒否、未分類を集計します。直近一週間の操作の傾向は `getStats(7)` で確認できます。

## データ構造

監査レコード、フィールド対応、アーカイブ、アラート重複排除については[データ構造](../../docs/usage/data/audit.ja.md)を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/audit test
```

ソース例は RelDB を先に初期化し、監査結果と依存関係の逆順による終了結果を確認します。[JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。

## ライセンス

Apache-2.0
