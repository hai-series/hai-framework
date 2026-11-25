# @h-ai/audit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

Node.js サービスで監査イベントを記録、検索、削除、集計します。`@h-ai/reldb` でデータを永続化し、必要に応じて非公開アーカイブとアラートを利用できます。

## クイックスタート

`pnpm add @h-ai/audit @h-ai/reldb` でインストールします。

[最小構成の導入手順](../../docs/usage/function/audit.ja.md#quick-start)を参照してください。

## 設定一覧

生成したプロジェクトでは、監査の記録、保持、バックアップ、アラートを `config/_audit.yml` に設定します。アプリは起動時に設定を `audit.init(config)` に渡します。同じデータベースを使うインスタンスには同じ保持設定を適用し、変更後は再起動を調整してください。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/audit.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/audit.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

`audit.countByOutcome(filters)` で一覧の成功、失敗、拒否を集計します。直近一週間の操作の傾向は `getStats(7)` で確認できます。

## データ構造

RelDB はイベントとアラートの取得状況を保持し、非公開 Storage がアーカイブを保存します。設定した最短保持期間はデータベーストリガーが適用します。イベント時刻は DB では Unix ミリ秒、API では `Date` です。[データ構造](../../docs/usage/data/audit.ja.md)を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/audit test
```

ソース例は RelDB を先に初期化し、監査結果と依存関係の逆順による終了結果を確認します。[JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。

## ライセンス

Apache-2.0
