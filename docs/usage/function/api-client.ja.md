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

追加の設定項目や利用例は[中国語リファレンス](api-client.md)に掲載しています。
