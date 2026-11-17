# @h-ai/runner

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークホーム](../../README.ja.md) · [リレーショナルデータベース](../reldb/README.ja.md) · [AI エージェント](../ai/README.ja.md)

Runner は Node.js のサーバー側で管理対象の Agent Worker とツールジョブを実行します。API ノードは投入、照会、キャンセル要求を受け付けます。実行ノードはジョブを取得し、コンテナを所有します。ジョブ、リース、イベント、実行結果はリレーショナルデータベースで共有します。

## クイックスタート

`pnpm add @h-ai/runner @h-ai/reldb` でインストールします。

[最小構成の導入手順](../../docs/usage/function/runner.ja.md#quick-start)を参照してください。

## 設定一覧

起動時に `runner.init(options)` で、そのノードがタスクを実行するか、どのコンテナ環境を使えるか、完了したタスクをいつまで保持するかを指定します。タスクの送信と照会だけを行うノードでは実行を無効にできます。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/runner.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/runner.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

永続タスク、実行リース、イベント、ワークスペース、コンテナ成果物については[データ構造](../../docs/usage/data/runner.ja.md)を参照してください。

## 開発とテスト

リポジトリのルートで実行します。PowerShell では `pnpm.cmd` を使います。SQLite でジョブの流れ、PostgreSQL と MySQL で共有所有権、Podman/Docker でコンテナの実制限、キャンセルと成果物を検証します。`HAI_TEST_CONTAINER_ENGINE` でコンテナエンジンを選択します。DB テストでは Docker 互換の Testcontainers 接続先も必要です。`HAI_TEST_RUNNER_ARTIFACT_IMAGE` に構築済みのテスト用イメージを指定すると、成果物とノード間事前起動のテストを有効化できます。

```sh
pnpm --filter @h-ai/runner typecheck
pnpm --filter @h-ai/runner lint
pnpm --filter @h-ai/runner build
pnpm --filter @h-ai/runner test
```

## ライセンス

Apache-2.0
