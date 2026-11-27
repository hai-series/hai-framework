# @h-ai/tools

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

Tools は Node.js とブラウザーで業務ツールを定義、検証、認可して呼び出します。Node.js ではホストのファイル操作で成果物を扱えます。ツールを永続キューに投入する場合は [Tools Runner](../tools-runner/README.ja.md) を使用します。

## クイックスタート

```sh
pnpm add @h-ai/tools zod
```

`@h-ai/tools` の `tools` で `sum` を定義して直接実行すると `5` が返ります。 [クイックスタート](../../docs/usage/function/tools.ja.md#quick-start) · [依存関係](../../docs/usage/function/tools.ja.md#module-dependencies)

## 設定一覧

ツールを定義するときやレジストリを作るときに設定を渡します。成果物ツールには認可済みのファイル操作を渡します。 [設定入口](../../docs/usage/configuration/tools.ja.md)

## 機能

ルート入口は `tools.define()` と `tools.createRegistry()` を提供します。Node.js では `@h-ai/tools/server` の `tools.createArtifactTools()` を使えます。 [API リファレンス](../../docs/usage/function/tools.ja.md#api-reference)

`packages/tools/jobs` には `hai-tool` の実装とジョブ用 Dockerfile が含まれます。イメージをビルドしてターミナルで 1 件の要求を処理するか、Tools Runner で同じイメージをアプリに接続できます。 [ジョブイメージ一覧と利用手順（中国語）](jobs/README.md#job-images)

## データ構造

現在のプロセスが定義と登録情報を保持します。成果物の内容、バージョン、所有者はホストが管理します。 [プロセス内データと成果物](../../docs/usage/data/tools.ja.md)

## 開発とテスト

```sh
pnpm exec turbo run typecheck lint build test --filter=@h-ai/tools
pnpm --filter @h-ai/tools test:jobs
```

## ライセンス

Apache-2.0
