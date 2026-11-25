# @h-ai/core

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md)

`@h-ai/core` は Hai Framework の共通基盤です。アプリケーションと他のモジュールに、設定、エラー、ログ、国際化の共通機能を提供します。ツールはそのまま利用でき、Node アプリでファイル設定が必要な場合に `core.init()` を呼びます。

## クイックスタート

`pnpm add @h-ai/core` でインストールします。

[最小構成の導入手順](../../docs/usage/function/core.ja.md#quick-start)を参照してください。

[依存関係と初期化順序](../../docs/usage/function/core.ja.md#module-dependencies)を参照してください。

## 設定一覧

Node の起動時に `core.init({ configDir: './config' })` を呼び出し、`config/_core.yml` からアプリ情報とログ設定を読み込みます。[Serv](../../docs/usage/configuration/serv.ja.md) または [Kit](../../docs/usage/configuration/kit.ja.md) は HTTP サービスを作成するときにアクセスルールを読み込みます。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/core.ja.md)を参照してください。

## 機能

[設定 API](../../docs/usage/function/core.ja.md#config-api) · [Core API 全体](../../docs/usage/function/core.ja.md#api-reference)

ログコンテキスト内の有効な JSON オブジェクト・配列文字列は、展開とマスキングを行ってから出力とログ監視に渡します。使い方と制限は[ログの記録](../../docs/usage/function/core.ja.md#logging-api)を参照してください。

## データ構造

モジュール独自のデータベーステーブルは作成しません。

アプリ設定、言語、ログ、リクエストコンテキストの管理範囲については[データ構造](../../docs/usage/data/core.ja.md)を参照してください。

[ワーカースレッド](../../docs/usage/function/core.ja.md#worker-api)

## 開発とテスト

リポジトリールートで実行します（PowerShell は `pnpm.cmd`）。

```bash
pnpm --filter @h-ai/core typecheck
pnpm --filter @h-ai/core lint
pnpm --filter @h-ai/core build
pnpm --filter @h-ai/core test
```

公開宣言と例の検証は[モジュール JSDoc 規約](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)を参照してください。

## ライセンス

Apache-2.0
