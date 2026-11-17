# @h-ai/tools

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

モデルに依存しないツール定義、検証、登録、認可付き実行。軽量エントリーは初期化なしで Node とブラウザーに対応します。`@h-ai/tools/server` は再開可能なサービスと成果物・ジョブファクトリーを提供し、Runner とホストの認可を再利用します。

## クイックスタート

`pnpm add @h-ai/tools zod` でインストールします。

[最小構成とカスタムツール](../../docs/usage/function/tools.ja.md#quick-start)

## 設定一覧

[定義・実行・有効化](../../docs/usage/configuration/tools.ja.md)

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
