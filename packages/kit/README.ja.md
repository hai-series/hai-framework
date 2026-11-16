# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md) · [@h-ai/iam](../iam/README.ja.md)

`@h-ai/kit` は、SvelteKit でのリクエスト処理、認証、API の実装を支援します。ページと API を同じサイトから提供する場合、ブラウザーはそのサイトのアドレスで API を呼び出せます。

SvelteKit のサーバーでは `@h-ai/kit` から `kit` をインポートし、`kit.createHandle()` でリクエスト処理関数を作成します。ブラウザーで同じパッケージをインポートすると、HTTP クライアント、一覧やフォームの補助機能、ページのトークン、既定言語の設定が使えます。型はサーバーで `KitFunctions`、ブラウザーで `BrowserKitFunctions` です。`AuthCookieWriter` はログイン後などにサーバーが現在のレスポンスに Cookie を設定するためのメソッドを定義します。

- `kit.createHandle()`：セッション解析、ルートガード、middleware チェーン、任意の通信・Cookie 暗号化。
- `kit.handler()`：API endpoint の例外処理境界。
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`

> クロスプラットフォームの公開 HTTP contract は `@h-ai/api-contract` で定義し、`@h-ai/serv` にマウント、`@h-ai/api-client` の型付きクライアントで呼び出します。`@h-ai/kit` は業務 API contract を定義・提供しません。

## クイックスタート

[最小構成の導入手順](../../docs/usage/function/kit.md#最小接入示例)（中国語）を参照してください。

## 設定一覧

生成したプロジェクトでは、待ち受けアドレスとポートを `config/_kit.yml` に記述します。アクセス制限と暗号化の設定を `kit.createHandle(options)` に渡し、返された関数を SvelteKit のサーバーフックとして使います。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/kit.md)（中国語）を参照してください。

## 機能

[API 一覧](../../docs/usage/function/kit.md#api-reference)（中国語）で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

モジュール独自のデータベーステーブルは作成しません。

リクエストコンテキスト、Cookie、アプリ側の永続化については[データ構造](../../docs/usage/data/kit.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/kit test
```

Kit に共通の init/close はありません。共有 cache・IAM・crypto はアプリが初期化と終了を管理します。型検査できる例は [JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。認証は iam.auth.verifyToken で検証し、空でない token だけでは許可しません。

## ライセンス

Apache-2.0
