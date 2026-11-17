# @h-ai/api-client API リファレンス

<!-- translation: partial -->

[原文（中国語）](api-client.md) · [設定](../configuration/api-client.ja.md) · [データ構造](../data/api-client.ja.md)

<a id="quick-start"></a>

## クイックスタート

Serv や Kit と同じ契約から型付きクライアントを作成します。リクエストの前に初期化し、各 `HaiResult` を確認し、所有元の終了時に閉じます。

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

<a id="api-reference"></a>

## API 一覧

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `apiClient.create(contract)`, `client.init(config)`, `client.close()` | 独立したインスタンスを作成。初期化は `Promise<HaiResult<void>>`、終了は進行中の更新を無効化して解放。 | `await client.init({ baseUrl: 'https://example.test/api/v1' })` |
| `client.auth.setTokens(pair)`, `clear()`, `onTokenRefreshed(fn)` | ローカルのトークンを更新・削除。保存に成功した更新を購読し、解除関数を取得。 | `const off = client.auth.onTokenRefreshed(onRefresh)` |
| `apiClient.tokenStorage.memory()`, `httpOnlyCookie()` | 独立したメモリー保管またはブラウザーの Cookie 用アダプターを作成。トークンの読み書きと削除を提供。 | `const storage = apiClient.tokenStorage.memory()` |
| `apiClient.createAuthActions(client)` | 公開設定、CAPTCHA、ログイン、登録、OTP、パスワード再設定・更新、再認証、ページ離脱処理の操作を作成。 | `const actions = apiClient.createAuthActions(client)` |
| `apiClient.observeRequests(observer)` | マスク済みのリクエスト記録を受け取り、解除関数を返す。 | `const stop = apiClient.observeRequests(onRequest)` |
| `client.iam`, `client.ai`, `client.storage`, `client.payment`, `client.feedback` | 契約に含めたドメインだけ利用可能。入力型は各エンドポイントのスキーマから取得。 | `await client.iam.auth.publicConfig()` |

ローカルトークンの削除とサーバー側のログアウトは別の操作です。サーバーで無効化するには IAM のログアウトを呼び出します。認証の復旧では同じ利用者のセッションを復元してください。

未翻訳：既定の各 API、認証フォーム用操作、更新処理の詳細。[中国語の該当節](api-client.md#detailed-workflow)を参照してください。

<a id="call-options"></a>

## 呼び出し引数と接続オプション

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

<a id="client-integration"></a>

## クライアントのアドレス・期限・復旧

コード引数を扱うため設定手冊から移動しました。完全な手順は現在[中国語](api-client.md#client-integration)にあり、この節は部分翻訳です。
