# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/api-contract](../api-contract/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md)

ブラウザー、Node.js、モバイルアプリ向けの型付き HTTP クライアントです。共通の oRPC/OpenAPI 契約に従って API を呼び出し、資格情報の保存、自動更新、アプリケーション層の暗号化、リクエストの監視を行えます。実行環境の Fetch を使うか、互換の実装を渡します。

## クイックスタート

`pnpm add @h-ai/api-client` でインストールします。アプリが共通の契約を直接インポートする場合は、`@h-ai/api-contract` も直接依存に追加します。

[最小構成の例](../../docs/usage/function/api-client.ja.md#quick-start) · [依存関係と初期化順序](../../docs/usage/function/api-client.ja.md#module-dependencies)

## 設定一覧

アプリが実行時設定を読み取り、API アドレスと必要なオプションを `apiClient.init(config)` または独立したインスタンスの `client.init(config)` に渡します。[設定の読み込み](../../docs/usage/configuration/api-client.ja.md)と[呼び出しオプション](../../docs/usage/function/api-client.ja.md#call-options)を参照してください。

## 機能

- 既定のクライアントを使うか、アプリの契約から独立したインスタンスを作成します。[クライアントのライフサイクル](../../docs/usage/function/api-client.ja.md#client-lifecycle)
- ログイン、資格情報、セッション更新を扱います。[認証操作](../../docs/usage/function/api-client.ja.md#auth-actions)と[資格情報の更新](../../docs/usage/function/api-client.ja.md#credentials)
- 呼び出しごとにリクエストのオプションを指定し、契約に従って `HaiResult`、ラップされていない JSON 値、または SSE ストリームを読み取ります。[リクエストオプション](../../docs/usage/function/api-client.ja.md#request-options)と[独自の応答](../../docs/usage/function/api-client.ja.md#custom-response-results)
- 暗号化をサポートするサーバーに接続したり、リクエストの概要を購読したりできます。[通信の暗号化](../../docs/usage/function/api-client.ja.md#encrypted-requests)、[平文の容量](../../docs/usage/function/crypto.ja.md#transport-capacity)、[リクエストの監視](../../docs/usage/function/api-client.ja.md#transport-observation)

[API 全一覧](../../docs/usage/function/api-client.ja.md#api-reference)

- プロジェクトの契約から、チャットイベントや公開済み拡張操作を呼ぶクライアントを作成します。 [拡張 HTTP 契約](../../docs/usage/function/api-client.ja.md#http-contract-extensions)

## データ構造

トークンの保存先はアプリが選び、セッションと業務データはサーバーが保存します。応答と監視記録を保存するかどうかは呼び出し側が決めます。[データ構造](../../docs/usage/data/api-client.ja.md)を参照してください。

## 開発とテスト

ワークスペースの依存関係をインストールした後、リポジトリのルートで実行します。

```bash
pnpm --filter @h-ai/api-client typecheck
pnpm --filter @h-ai/api-client test
```

## ライセンス

Apache-2.0
