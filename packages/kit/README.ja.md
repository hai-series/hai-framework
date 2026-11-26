# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md) · [@h-ai/iam](../iam/README.ja.md)

`@h-ai/kit` は、SvelteKit でのリクエスト処理、認証、API の実装を支援します。ページと API を同じサイトから提供する場合、ブラウザーはそのサイトのアドレスで API を呼び出せます。

SvelteKit のサーバーでは `@h-ai/kit` から `kit` をインポートし、`kit.createHandle()` でリクエスト処理関数を作成します。ブラウザーのコードでは `@h-ai/kit/client` から `kit` を読み込み、HTTP クライアント、一覧やフォームの補助機能、ページのトークン、言語の設定を使います。ルートエントリーの型はサーバーで `KitFunctions`、ブラウザーで `BrowserKitFunctions` です。`AuthCookieWriter` はログイン後などにサーバーが現在のレスポンスに Cookie を設定するためのメソッドを定義します。

- `kit.createHandle()`：セッション解析、ルートガード、middleware チェーン、任意の通信・Cookie 暗号化。
- `kit.handler()`：API endpoint の例外処理境界。
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`
- 画面に表示する操作は `kit.guard.matchPermission()` で判定します。リクエストの権限はサーバーの `kit.guard.require()` で確認します。
- 一覧やフォームのラベルと選択肢は `kit.crud.resolveText()` と `kit.crud.resolveOptions()` で取得します。
- サーバーで `ai.a2a.createHttpHandler()` を `kit.createHandle({ a2a })` に渡します。`kit.crypto` はサーバー、`@h-ai/kit/adapter` はビルド時に利用します。

複数のプラットフォームで共有する独立 HTTP サービスでは、`@h-ai/api-contract` で契約を定義し、`@h-ai/serv` でルートを登録し、`@h-ai/api-client` の型付きクライアントで呼び出せます。

## クイックスタート

`pnpm add @h-ai/kit` でインストールします。

[最小構成の導入手順](../../docs/usage/getting-started/kit.ja.md#quick-start)を参照してください。 [依存関係と初期化順序](../../docs/usage/function/kit.ja.md#module-dependencies)を参照してください。

## 設定一覧

生成したプロジェクトの Node サーバーは、待ち受けアドレスとポートを `HOST` と `PORT` から読み込みます。`config/_kit.yml` の `http` と `transport` を `kit.createHandle({ http, transport })` に渡します。通信暗号化を有効にする場合は、初期化済みの Crypto、サーバーの鍵リング、共有登録ストアを渡します。信頼済みプロキシとアクセス規則は `http` 配下に、鍵交換パスは `transport.keyExchangePath` にオリジン直下からの絶対パスで指定します。

待ち受け、信頼するプロキシ、アクセス制御、通信暗号化の項目と配置例は[設定一覧](../../docs/usage/configuration/kit.ja.md)を参照してください。独立 HTTP サービスの設定は [Serv の設定一覧](../../docs/usage/configuration/serv.ja.md)を参照してください。

アクセス制御、信頼済みプロキシ、レート制限は `http` 配下で設定します。`http.rateLimit` を有効にするときは計数ストアを渡します。 [レート制限の利用例](../../docs/usage/function/kit.ja.md#rate-limit-example)

通信暗号化を有効にすると、Kit はマウント済みの契約 API を既定で暗号化します。カスタムプレフィックスを使用する場合はブラウザーのインストーラーに同じ完全なパスを渡します。 [サブディレクトリーのレポート例](../../docs/usage/function/kit.ja.md#kit-custom-contract-transport)

## 機能

[API 一覧](../../docs/usage/function/kit.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

モジュール独自のデータベーステーブルは作成しません。

リクエストコンテキスト、Cookie、アプリ側の永続化については[データ構造](../../docs/usage/data/kit.ja.md)を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/kit test
```

Kit に共通の init/close はありません。共有 cache・IAM・crypto はアプリが初期化と終了を管理します。型検査できる例は [JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。認証は iam.auth.verifyToken で検証し、空でない token だけでは許可しません。

## ライセンス

Apache-2.0
