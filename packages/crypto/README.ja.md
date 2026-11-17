# @h-ai/crypto

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/cache](../cache/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

非対称暗号、ハッシュ、対称暗号、パスワードハッシュを提供する暗号モジュールです。

## クイックスタート

`pnpm add @h-ai/crypto` でインストールします。

[最小構成の導入手順](../../docs/usage/function/crypto.ja.md#quick-start)を参照してください。

## 設定一覧

独立した実行時設定ファイルはありません。[ファイルの所有者](../../docs/usage/configuration/crypto.ja.md)と[引数・応答のリファレンス](../../docs/usage/function/crypto.ja.md#call-options)。

## 機能

アルゴリズムは `crypto.asymmetric/hash/symmetric/password`、通信ファクトリー、キャッシュ登録、鍵リング解析、HTTP 補助機能は `crypto.transport` から呼び出します。公開鍵検証は初期化不要で未知の入力を受け付けます。型とエラークラスは名前付きでインポートします。

[通信プロトコル](../../docs/usage/function/crypto.ja.md#transport-protocol)と[入力の互換性](../../docs/usage/function/crypto.ja.md#primitive-validation)も参照してください。

[API 一覧](../../docs/usage/function/crypto.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

伝送状態は `@h-ai/cache` に統一し、有効期限付き公開鍵、原子的なリプレイ防止、共有分単位クォータを保存します。本番は Redis を使用し、Crypto はデータベース表を作成しません。

[伝送状態](../../docs/usage/data/crypto.ja.md#transport-state)

## 開発とテスト

```bash
pnpm --filter @h-ai/crypto test
```

## ライセンス

Apache-2.0
