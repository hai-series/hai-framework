# @h-ai/api-contract

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

hai-framework の公開 HTTP API 契約パッケージ。oRPC contract + Zod を唯一の定義元として使用します。

## クイックスタート

`pnpm add @h-ai/api-contract` でインストールします。

[最小構成の導入手順](../../docs/usage/function/api-contract.ja.md#quick-start)を参照してください。

[依存関係と初期化順序](../../docs/usage/function/api-contract.ja.md#module-dependencies)を参照してください。

## 設定一覧

アプリは契約をコードで宣言します。HTTP プレフィックスと通信設定はホストが読み込みます。[設定一覧](../../docs/usage/configuration/api-contract.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/api-contract.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

`route` で[単一操作を宣言](../../docs/usage/function/api-contract.ja.md#declare-routes)し、`create` で[ドメインを組み合わせ](../../docs/usage/function/api-contract.ja.md#compose-domains)、`pathOf` で[操作のパスを読み取り](../../docs/usage/function/api-contract.ja.md#read-route-path)ます。

[Serv](../../docs/usage/function/api-contract.ja.md#use-with-serv)、[Kit のファイルルート](../../docs/usage/function/api-contract.ja.md#use-with-kit)または [API Client](../../docs/usage/function/api-contract.ja.md#use-with-client)での利用方法を参照してください。

- ストリーミングチャット、AI メディア、IAM 管理、Storage ファイル、Audit、Payment の拡張契約を選択します。 [拡張 HTTP 契約](../../docs/usage/function/api-contract.ja.md#http-contract-extensions)

## データ構造

モジュール独自のデータベーステーブルは作成しません。

公開 HTTP ペイロードと永続化の責務については[データ構造](../../docs/usage/data/api-contract.ja.md)を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/api-contract test
pnpm --filter @h-ai/api-contract typecheck
```

Schema、推論型と組合せツールには型検査できる例があります。[JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。Schema のローカル例は provider の実行証明ではありません。

## ライセンス

Apache-2.0
