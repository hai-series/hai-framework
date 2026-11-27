# @h-ai/tools-runner

[简体中文](./README.md) · [English](./README.en.md) · [日本語](./README.ja.md)

Node.js で Tools のツールをアプリケーションの Runner に登録します。永続化された受付情報で、進捗照会、再開、キャンセルができます。固定コンテナージョブはホストが登録した環境で実行します。

## クイックスタート

`pnpm add @h-ai/core @h-ai/reldb @h-ai/runner @h-ai/tools @h-ai/tools-runner` で利用例の依存パッケージをインストールします。RelDB と Runner を初期化し、`toolsRunner.createService({ ...options, runner })` でツールサービスを登録します。 [依存関係と初期化順序](../../docs/usage/function/tools-runner.ja.md#module-dependencies) · [実行できるタスクサービスの例](../../docs/usage/function/tools-runner.ja.md#service-example)

## 設定一覧

ホストはファクトリーにサービス ID、有効なツール、認可ポリシーを渡します。コンテナー環境、リソース上限、保持期間は注入された Runner が管理します。 [ツールサービスの設定](../../docs/usage/configuration/tools-runner.ja.md) · [Runner の設定](../../docs/usage/configuration/runner.ja.md)

## 機能

- `toolsRunner.createService(options)` で投入、照会、再開、キャンセルに対応するサービスを作成します。投入時と実行時に認可を確認します。
- `toolsRunner.createJobTools(options)` で文書、Office、OCR、ウェブ、プレビュー、動画用のコンテナーツールを構成します。イメージは配備時に準備します。 [コンテナージョブのイメージとプロトコル](../tools/jobs/README.md)

## データ構造

ツールジョブは Runner の実行、イベント、冪等キーの記録を使います。成果物はアプリケーションが保存します。 [ツールの受付情報とデータの境界](../../docs/usage/data/tools-runner.ja.md) · [Runner の記録](../../docs/usage/data/runner.ja.md)

## 開発とテスト

```sh
pnpm --filter @h-ai/tools-runner typecheck
pnpm --filter @h-ai/tools-runner lint
pnpm --filter @h-ai/tools-runner build
pnpm --filter @h-ai/tools-runner test
```

## ライセンス

Apache-2.0
