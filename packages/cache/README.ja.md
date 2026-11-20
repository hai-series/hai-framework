# @h-ai/cache

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

統一されたキャッシュモジュールです。`cache` オブジェクトで KV / Hash / List / Set / ZSet / 分散ロックを操作し、メモリーと Redis のバックエンドに対応します。

## クイックスタート

`pnpm add @h-ai/cache` でインストールします。

[最小構成の導入手順](../../docs/usage/function/cache.ja.md#quick-start)を参照してください。

## 設定一覧

生成したプロジェクトでは、バックエンドの種類と Redis の接続設定を `config/_cache.yml` に記述します。アプリの起動コードがファイルを読み込み、設定オブジェクトを `cache.init(config)` に渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/cache.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/cache.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

Redis とメモリの値型、キー、TTL、ロック所有者については[データ構造](../../docs/usage/data/cache.ja.md)を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/cache test
```

> Redis の統合テストには Docker API が必要です。Docker、または Docker 互換 API を有効にした Podman を使用できます。

公開契約と内部構造には型検査できる例を用意しています。[JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。

## ライセンス

Apache-2.0
