# @h-ai/api-client 設定

[原文（中国語）](api-client.md) · [データ構造](../data/api-client.ja.md) · [API リファレンス](../function/api-client.ja.md)

アプリの契約からクライアントを作成し、`apiClient.init()` に設定を渡します。ブラウザーの Cookie はサーバーと Fetch が扱います。SSR ではリクエストごとに別のクライアントとストレージを作成します。

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `baseUrl` | 必須 | API のベース URL。プレフィックスを含む。 |
| `timeout` | `30000` ms | ヘッダーと JSON 読み取りの期限。ストリームの読み取りは呼び出し元の中断シグナルを使う。 |
| `clientName` | `hai-api-client` | 診断用の `x-request-client` の値。 |
| `headers`, `fetch` | 省略可 | 固定または動的な追加ヘッダーと任意の Fetch 実装。既定はグローバルの Fetch。 |
| `auth` | `undefined` | 既定の認証と更新を有効にするには `{}` を指定。 |
| `auth.storage` | `apiClient.tokenStorage.httpOnlyCookie()` | アクセストークンはブラウザーのメモリー。更新 Cookie はサーバーで管理。 |
| `auth.refreshPath` | `/auth/refresh` | ベース URL からの相対パス。 |
| `auth.refreshTimeoutMs` | `10000` | 更新の期限（ミリ秒）。タイムアウトでは認証情報を保持。 |
| `auth.terminalType` | `web` | IAM が許可する端末種別。 `web`、`app`、`desktop`、`api`。 |
| `auth.recoverSession` | 省略可 | 更新の確定失敗後に同じセッションを復元。true を返すと元のリクエストを一回再試行。 |
| `auth.onTokenRefreshed`, `auth.onRefreshFailed` | 省略可 | 更新成功または確定失敗後にアプリの状態を更新。 |
| `transport` | `undefined` | オブジェクトを指定するとアプリ層の通信暗号化が有効。 |
| `transport.crypto` | 必須 | 暗号化を使う場合に初期化済みの `@h-ai/crypto` を指定。 |
| `transport.keyExchangePath` | `/_hai/key-exchange` | ベース URL からの鍵交換の相対パス。 |
| `transport.maxPlaintextBytes` | 省略可 | サーバーの上限を使用。小さい上限を指定した場合はその値を採用。 |
