# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

通常のリクエストとトークン更新は、現在の `core.i18n` 言語を `Accept-Language` に設定します。サーバーのエラーも画面の言語に従います。`headers` で明示的に上書きできます。

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/api-contract](../api-contract/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md)

hai-framework のクロスプラットフォーム oRPC/OpenAPI 型付きクライアント。Web、アプリ、ミニプログラムに共通の API 呼び出しと Token 管理を提供します。

## クイックスタート

`pnpm add @h-ai/api-client` でインストールします。

[最小構成の導入手順](../../docs/usage/function/api-client.ja.md#quick-start)を参照してください。

## 設定一覧

`apiClient.init(config)` に API のベース URL を渡します。認証情報の保存先、リクエストのタイムアウト、通信の暗号化は必要に応じて指定します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/api-client.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/api-client.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

モジュール独自のデータベーステーブルは作成しません。

アクセス用と更新用のトークンの保存先、およびトークンが消える条件については[データ構造](../../docs/usage/data/api-client.ja.md)を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

`transport.maxPlaintextBytes` は鍵交換で取得します。ローカル上限を明示した場合は小さい値を採用します。容量エラーは `HaiApiClientError.PAYLOAD_TOO_LARGE`（`hai:api-client:020`）と方向・段階・バイト診断を返します。[容量と移行](../crypto/TRANSPORT-CAPACITY.md)を参照してください。

Serv/Kit は要求の結合、署名、MAC を検証した後、時刻の許容範囲を超えた要求に暗号化した HTTP 400 を返します。クライアントは `TransportTimeError`（`hai:crypto:071`）をスローし、検証時のサーバー UTC 時刻を表示して、自動時刻同期を有効にするか手動で時刻を設定してから再読み込みするよう案内します。`serverTime` は Unix ミリ秒です。`api-client` は `VALIDATION_FAILED` に変換し、`cause.transportCode` と `cause.serverTime` を保持します。

## ライセンス

Apache-2.0
