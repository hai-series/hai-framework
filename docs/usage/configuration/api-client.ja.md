# @h-ai/api-client 設定

[原文（中国語）](api-client.md) · [データ構造](../data/api-client.ja.md) · [API リファレンス](../function/api-client.ja.md)

既定のクライアントには `apiClient.init(config)` で設定を渡します。アプリ独自の契約を使う場合は `apiClient.create(contract)` でクライアントを作成し、戻り値の `init(config)` を呼びます。ブラウザーはサーバーの応答に従って Cookie を保存し、Fetch で送信します。SSR ではクライアントとトークンの保存先をリクエストごとに作ります。

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `baseUrl` | 必須 | クライアントから到達できる API のベース URL。同一オリジンのブラウザーなら `/api/v1`、アプリや別オリジンなら絶対 URL を指定する。 |
| `timeout` | `30000` ms | ヘッダーと JSON 読み取りの期限。ストリームの読み取りは呼び出し元の中断シグナルを使う。 |
| `clientName` | `hai-api-client` | 診断用の `x-request-client` の値。 |
| `headers` | 追加なし | 固定のヘッダーまたはヘッダーを返す同期・非同期関数。 |
| `fetch` | グローバルの `fetch` | Fetch 互換の関数。差し替える場合はキャンセルと Cookie の扱いを維持する。 |
| `auth` | `undefined` | 既定の認証と更新を有効にするには `{}` を指定。 |
| `auth.storage` | `apiClient.tokenStorage.httpOnlyCookie()` | アクセストークンはブラウザーのメモリー。更新 Cookie はサーバーで管理。 |
| `auth.refreshPath` | `/auth/refresh` | ベース URL からの相対パス。 |
| `auth.refreshTimeoutMs` | `10000` | 更新の期限（ミリ秒）。タイムアウトでは認証情報を保持。 |
| `auth.terminalType` | `web` | IAM が許可する端末種別。 `web`、`app`、`desktop`、`api`。 |
| `auth.recoverSession` | 省略可 | 更新の確定失敗後に同じセッションを復元。true を返すと元のリクエストを一回再試行。 |
| `auth.onTokenRefreshed` | 省略可 | 更新の成功後に呼ぶ。表示中のログイン状態を更新できる。 |
| `auth.onRefreshFailed` | 省略可 | 更新できないことが確定したときに呼ぶ。再ログインを案内できる。 |
| `transport` | `undefined` | オブジェクトを指定するとアプリ層の通信暗号化が有効。 |
| `transport.crypto` | 必須 | 暗号化を使う場合に初期化済みの `@h-ai/crypto` を指定。 |
| `transport.keyExchangePath` | `/_hai/key-exchange` | ベース URL からの鍵交換の相対パス。 |
| `transport.maxPlaintextBytes` | 省略可 | サーバーの上限を使用。小さい上限を指定した場合はその値を採用。 |
