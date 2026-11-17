# @h-ai/ui

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

内蔵メッセージは `zh-CN`、`en-US`、`ja-JP` に対応し、言語セレクターは既定で3言語を表示します。

Svelte 5 Runes のクロスプラットフォーム UI ライブラリーです。DaisyUI v5 + Tailwind CSS v4 のスタイル、Bits UI v2 のヘッドレス UI、内蔵 i18n（zh-CN / en-US / ja-JP）、15 種類の厳選テーマ、ハイコントラスト、直角ビジネス、目にやさしいテーマを提供します。

HTTP/UI 境界で業務メッセージを公開するのは、明示された有効な4xx状態のみです。`httpStatus` が未指定または不正な場合は500として安全なメッセージを返します。独自の業務エラーには完全なエラー定義または明示的な状態を指定してください。

## クイックスタート

[最小構成の導入手順](../../docs/usage/function/ui.ja.md#quick-start)を参照してください。

## 設定一覧

表の列と行など、Svelte コンポーネントの動作や表示に必要な値は props として渡します。テーマ、言語、初回ガイドにはそれぞれ `@h-ai/ui/theme`、`@h-ai/ui/i18n`、`@h-ai/ui/guide` を使います。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/ui.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/ui.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

[ツールと成果物のワークスペース](../../docs/usage/function/ui.ja.md#tool-workspaces)は、パラメーターフォーム、操作例、タスク進捗、文書編集、バージョン競合、メディアプレビューを提供します。アプリは認可済みの読み取り、保存、実行コールバックを接続します。

## データ構造

モジュール独自のデータベーステーブルは作成しません。

テーマ、言語、ガイド進捗のブラウザー内の保存先については[データ構造](../../docs/usage/data/ui.ja.md)を参照してください。

## 開発とテスト

```sh
pnpm --filter @h-ai/ui typecheck
pnpm --filter @h-ai/ui lint
pnpm --filter @h-ai/ui build
pnpm --filter @h-ai/ui test
```

## ライセンス

Apache-2.0
