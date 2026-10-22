# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/api-contract](../api-contract/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md)

## 概要

hai-framework のクロスプラットフォーム oRPC/OpenAPI 型付きクライアント。Web、アプリ、ミニプログラムに共通の API 呼び出しと Token 管理を提供します。

## 主な機能

- `apiClient`：iam/storage/ai ドメインに対応する既定の型付きクライアント。
- `apiClient.create(contract)`：独自の contract に対応する型付きクライアントを作成。
- `apiClient.tokenStorage.{memory,httpOnlyCookie}()`：Token ストレージのファクトリー。ブラウザーでは access token をメモリー、refresh token をサーバー管理の httpOnly Cookie に保持し、ネイティブではプラットフォームの安全なストレージを注入します。認証情報を Web Storage に保存しません。
- ブラウザー、Node、Capacitor、ミニプログラムのブリッジに対応する独自 `fetch` を指定可能。
- Bearer Token の自動付与と、401 応答後の更新および 1 回の再試行。
- ネットワークエラーを `HaiResult` のエラーに変換。
- 任意の通信暗号化：`apiClient.init({ transport: { crypto } })` が `crypto.transport.createClient()` を自動使用。
- 通信暗号化と自動更新を併用可能。401 後の `/auth/refresh` も暗号化された fetch を使用し、平文には切り替わりません。

## 使い始める

### クイックスタート

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {}, // 默认使用 httpOnly cookie 存储（推荐）；SSR 测试请显式传入 apiClient.tokenStorage.memory()
})

const login = await apiClient.iam.auth.login({
  identifier: 'alice',
  password: 'secret',
})

if (login.success) {
  // httpOnly cookie 模式下 refresh token 由服务端 Set-Cookie 管理，
  // api-client 默认存储只需要把 access token 写入内存。
  await apiClient.auth.setTokens(login.data.tokens)
}

const me = await apiClient.iam.auth.currentUser()
if (me.success) {
  // 身份资料与服务端重新校验后的访问范围一次返回，客户端无需持久化权限快照。
  const { roles, permissions, ...user } = me.data
}

await apiClient.close()
```

#### 通信暗号化の有効化

サーバーで先に `serv.createApp({ transport: { crypto } })` を有効にします。クライアントには同じ `@h-ai/crypto` サービスのインスタンスを渡すだけで、鍵交換コードの実装は不要です。

```ts
import { apiClient } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

await crypto.init()

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
  transport: { crypto }, // 默认协商路径：/api/v1/_hai/key-exchange
})

await apiClient.close()
await crypto.close()
```

### API 契約

独自のアプリケーションでは、専用の oRPC contract を指定できます：

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

const contract = apiContract.create({ iam: apiContract.iam })
const client = apiClient.create(contract)

await client.init({ baseUrl: 'https://api.example.com/api/v1' })
const result = await client.iam.auth.login({ identifier: 'alice', password: 'secret' })
```

### API 一覧

- `apiClient.init(config)`：既定のクライアントを初期化。
- `apiClient.close()`：クライアントの状態を解放。
- `apiClient.auth.setTokens(tokens)`：認証情報を置き換えて access token を保存。httpOnly 以外では指定された refresh token も保存し、省略時は古い値を削除します。
- `apiClient.auth.clear()`：Token を削除。
- `apiClient.create(contract)`：独自の型付きクライアントを作成。

`auth.clear()` と `auth.setTokens()` は、このクライアントの既存の更新リクエストを直ちにキャンセルして無効化します。遅れて届いた成功応答や 401 は、ログアウト済みの認証状態を復元したり、新しいアカウントを上書きしたり、古い更新コールバックを通知したりしません。ストレージへの書き込みは直列化され、メソッド完了後に以前の非同期書き込みが認証情報を上書きすることはありません。ログアウトとアカウント切り替えには、ストレージを直接変更せずこれらのメソッドを使ってください。httpOnly Cookie とサーバーセッションは、引き続きサーバーのログアウトエンドポイントで失効させる必要があります。

初期化済みのクライアントで `init()` を再度呼ぶと `CONFIG_ERROR` が返り、既存のクライアントは維持されます。`baseUrl` / `fetch` / `transport` を変更する場合は、先に `await apiClient.close()` を呼んでから再初期化してください。

### 設定

- `baseUrl`：API のベース URL。通常は `/api/v1` を含みます。
- `auth.storage`：Token ストレージアダプター。既定は `apiClient.tokenStorage.httpOnlyCookie()`（ブラウザー推奨）。SSR / テストでは `apiClient.tokenStorage.memory()` を明示してください。
- `auth.refreshPath`：Token 更新パス。既定は `/auth/refresh`。
- `timeout`：リクエストのタイムアウト。既定は 30000 ms。
- `headers`：静的または動的な共通リクエストヘッダー。
- `fetch`：独自の fetch 実装。
- `transport.crypto`：透過的なリクエスト/レスポンス暗号化・復号。初期化済みの `@h-ai/crypto` インスタンスが必要です。
- `transport.keyExchangePath`：鍵交換のサブパス。既定は `/_hai/key-exchange` で、`baseUrl` に自動的に連結されます。
- `apiClient.config`：**機密情報をマスクした実行時設定のスナップショット**。`baseUrl` 内の認証情報や `headers.authorization` などの機密値は自動的に非表示になります。

### 設定による認証画面

規約は設定の userAgreementMarkdown/privacyPolicyMarkdown または URL を使用できます。同じ規約は Markdown 本文を優先して安全な Modal で描画します。

標準 IAM contract のクライアントには apiClient.createAuthActions(client) を使用します。複数方式、登録、OTP、復旧を統一し、認証成功時に設定済み TokenStorage に保存します。アプリ側は認証後の状態更新と遷移だけを担当します。

[完整 IAM 配置 / IAM configuration](../iam/README.ja.md)

### エラー処理

業務 API は `HaiResult<T>` を返します：

```ts
const result = await apiClient.iam.auth.currentUser()
if (!result.success) {
  // result.error.code / result.error.message
}
else {
  // result.data = User & { roles: string[], permissions: string[] }
}
```

未初期化、ネットワークエラー、タイムアウト、401/403/404 などのクライアント側の問題も、失敗の `HaiResult` に変換されます。

自動更新は実際の HTTP 401（`Response.status`）、または HTTP 200 の有効な失敗 HaiResult（`success=false`、文字列の `error.code/message`、`error.httpStatus=401`）で動作します。更新が成功すると元のリクエストを一度だけ再試行します。組み込みのログイン・登録と設定された `auth.refreshPath` は自動更新の対象外で、403/500 など他の失敗でも更新しません。serv の通常の procedure は引き続き HTTP 200 を返します。呼び出し側は最終結果の `success` と `error.code` を確認し、更新失敗による認証失効を処理してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

## ライセンス

Apache-2.0
