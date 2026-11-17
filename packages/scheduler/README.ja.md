# @h-ai/scheduler

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

`scheduler` は cron スケジュールに従って JavaScript の処理や HTTP API を実行します。タスク設定と実行ログをデータベースに保存し、実行前後にアプリが指定した処理も呼び出せます。

## クイックスタート

[最小構成の導入手順](../../docs/usage/function/scheduler.ja.md#quick-start)を参照してください。

## 設定一覧

生成したプロジェクトでは、タスクを探す間隔と実行権の有効期間を `config/_scheduler.yml` に記述します。アプリの起動コードがファイルを読み込み、設定オブジェクトを `scheduler.init(config)` に渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/scheduler.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/scheduler.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

タスク、実行ログ、分散リース、復旧状態については[データ構造](../../docs/usage/data/scheduler.ja.md)を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/scheduler test
```

宣言の JSDoc 例は実在する公開入口から import します。内部リポジトリ、runner、コンパイラ、cron ツールは「模块内部上下文」と明記し、パッケージルートの公開 API を意味しません。HaiResult、明示的な取消しの reject、close の Promise<void> を区別し、業務 status とログ persistence も別に確認します。ログ修復で業務を再実行しません。保守時は `node scripts/check-module-jsdoc.mjs --package scheduler` で宣言網羅性と実際の型を検証します。例のコンパイルは共有 DB・独立プロセス検証を代替しません。

## ライセンス

Apache-2.0
