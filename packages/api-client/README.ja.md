# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

通常のリクエストとトークン更新は、現在の `core.i18n` 言語を `Accept-Language` に設定します。サーバーのエラーも画面の言語に従います。`headers` で明示的に上書きできます。

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/api-contract](../api-contract/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md)

hai-framework のクロスプラットフォーム oRPC/OpenAPI 型付きクライアント。Web、アプリ、ミニプログラムに共通の API 呼び出しと Token 管理を提供します。

## クイックスタート

`apiClient.close()` を呼び出すと、すでに始まっている更新処理はセッションを書き換えられなくなります。進行中の認証情報の書き込みを待ち、外部の `TokenStorage` の値は残します。再初期化時に同じ保存先を使えます。

タイムアウトには応答ヘッダー、JSON 本文全体、HTML エラーページなどのエラー本文を読む時間が含まれます。タイムアウトや取り消し後にトークンは更新しません。アプリが成功応答をストリームとして読む場合は、渡した中断シグナルで読み取りを止めます。

既定の Cookie 保存方式では、ログインと更新時に `credentials: "include"` でブラウザーの Cookie を送信します。ページと API のオリジンが異なる場合は、API の CORS 設定でページのオリジンと認証情報の送信を許可します。メモリーやネイティブストレージでは、アプリがリクエストに指定した `credentials` 設定を使います。

```ts
import type { IamAuthLoginInput } from '@h-ai/api-client'
import { apiClient } from '@h-ai/api-client'

async function loginAndLoadProfile(input: IamAuthLoginInput) {
  const initialized = await apiClient.init({ baseUrl: '/api/v1', auth: {} })
  if (!initialized.success)
    return initialized
  try {
    const actions = apiClient.createAuthActions(apiClient)
    const loggedIn = await actions.login(input)
    if (!loggedIn.success)
      return loggedIn
    const profile = await apiClient.iam.auth.currentUser()
    if (!profile.success)
      return profile
    return profile
  }
  catch (writeError) {
    try {
      await apiClient.auth.clear()
    }
    catch (cleanupError) {
      throw new AggregateError([writeError, cleanupError], 'Credential persistence and cleanup failed')
    }
    throw writeError
  }
  finally {
    await apiClient.close()
  }
}
```

## 設定一覧

`apiClient.init(config)` に API のベース URL を渡します。認証情報の保存先、リクエストのタイムアウト、通信の暗号化は必要に応じて指定します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/api-client.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/api-client.md)（中国語）を参照してください。

- `apiClient.init` / `apiClient.create` / `apiClient.close` / `apiClient.config` / `apiClient.isInitialized` — 既定クライアントの初期化、独立インスタンスの作成
- `apiClient.auth` / `apiClient.tokenStorage` / `apiClient.createAuthActions` — 認証情報の保存先を選び、ログインやセッション更新の処理を作る
- `apiClient.iam` / `apiClient.storage` / `apiClient.ai` / `apiClient.observeRequests` — ユーザー、ファイル、AI の API を呼び出し、各呼び出しが終わったときの結果と所要時間を取得する

## データ構造

モジュール独自のデータベーステーブルは作成しません。

アクセス用と更新用のトークンの保存先、およびトークンが消える条件については[データ構造](../../docs/usage/data/api-client.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

`transport.maxPlaintextBytes` は鍵交換で取得します。ローカル上限を明示した場合は小さい値を採用します。容量エラーは `HaiApiClientError.PAYLOAD_TOO_LARGE`（`hai:api-client:020`）と方向・段階・バイト診断を返します。[容量と移行](../crypto/TRANSPORT-CAPACITY.md)を参照してください。

Serv/Kit は要求の結合、署名、MAC を検証した後、時刻の許容範囲を超えた要求に暗号化した HTTP 400 を返します。クライアントは `TransportTimeError`（`hai:crypto:071`）をスローし、検証時のサーバー UTC 時刻を表示して、自動時刻同期を有効にするか手動で時刻を設定してから再読み込みするよう案内します。`serverTime` は Unix ミリ秒です。`api-client` は `VALIDATION_FAILED` に変換し、`cause.transportCode` と `cause.serverTime` を保持します。

## ライセンス

Apache-2.0
