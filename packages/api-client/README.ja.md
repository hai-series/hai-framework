# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

通常のリクエストとトークン更新は、現在の `core.i18n` 言語を `Accept-Language` に設定します。サーバーのエラーも画面の言語に従います。`headers` で明示的に上書きできます。

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/api-contract](../api-contract/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md)

hai-framework のクロスプラットフォーム oRPC/OpenAPI 型付きクライアント。Web、アプリ、ミニプログラムに共通の API 呼び出しと Token 管理を提供します。

## クイックスタート

`pnpm add @h-ai/api-client` でインストールします。

[最小構成の導入手順](../../docs/usage/function/api-client.ja.md#quick-start)を参照してください。

## 設定一覧

独立した実行時設定ファイルはありません。[ファイルの所有者](../../docs/usage/configuration/api-client.ja.md)と[引数・応答のリファレンス](../../docs/usage/function/api-client.ja.md#call-options)。

## 機能

ブラウザーでは `baseUrl` に `/api/v1` のような同一オリジンのルート相対パスを指定できます。Node.js やブラウザーオリジンのない環境では HTTP(S) の絶対 URL を使います。無効なアドレスの場合、`init()` は `CONFIG_ERROR` を返します。

[API 一覧](../../docs/usage/function/api-client.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

`transport.maxPlaintextBytes` は鍵交換で取得します。ローカル上限を明示した場合は小さい値を採用します。容量エラーは `HaiApiClientError.PAYLOAD_TOO_LARGE`（`hai:api-client:020`）と方向・段階・バイト診断を返します。[容量と移行](../../docs/usage/function/crypto.ja.md#transport-capacity)を参照してください。

Serv/Kit は要求の結合、署名、MAC を検証した後、時刻の許容範囲を超えた要求に暗号化した HTTP 400 を返します。クライアントは `TransportTimeError`（`hai:crypto:071`）をスローし、検証時のサーバー UTC 時刻を表示して、自動時刻同期を有効にするか手動で時刻を設定してから再読み込みするよう案内します。`serverTime` は Unix ミリ秒です。`api-client` は `VALIDATION_FAILED` に変換し、`cause.transportCode` と `cause.serverTime` を保持します。

## データ構造

モジュール独自のデータベーステーブルは作成しません。

アクセス用と更新用のトークンの保存先、およびトークンが消える条件については[データ構造](../../docs/usage/data/api-client.ja.md)を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

## ライセンス

Apache-2.0
