# @h-ai/tools

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

モデルに依存しないツール定義、検証、登録、認可付き実行。軽量エントリーは初期化なしで Node とブラウザーに対応します。`@h-ai/tools/server` は再開可能なサービスと成果物・ジョブファクトリーを提供し、Runner とホストの認可を再利用します。

## クイックスタート

`pnpm add @h-ai/tools zod` でインストールします。

[最小構成とカスタムツール](../../docs/usage/function/tools.ja.md#quick-start)

[依存関係と初期化順序](../../docs/usage/function/tools.ja.md#module-dependencies)を参照してください。

## 設定一覧

独立した実行時設定ファイルはありません。[ファイルの所有者](../../docs/usage/configuration/tools.ja.md)と[引数・応答のリファレンス](../../docs/usage/function/tools.ja.md#call-options)。

## 機能

[公開 API とモデルアダプター](../../docs/usage/function/tools.ja.md)

## データ構造

[登録情報と実行データの所有者](../../docs/usage/data/tools.ja.md)

## 開発とテスト

```sh
pnpm --filter @h-ai/tools typecheck
pnpm --filter @h-ai/tools lint
pnpm --filter @h-ai/tools build
pnpm --filter @h-ai/tools test
pnpm --filter @h-ai/tools test:jobs
```

## ライセンス

Apache-2.0
