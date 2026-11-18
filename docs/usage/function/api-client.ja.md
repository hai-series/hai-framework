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

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

モジュールの import は入門例と同じです。開始・終了の例以外は初期化成功後、終了前に実行します。value は HaiResult.success を確認し元エラーを保持します。独立したテストデータと明示した後片付けを使います。

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="client-lifecycle"></a>

### クライアントの準備と分離：`apiClient`

ブラウザでは既定インスタンス、SSR では要求ごとに別のインスタンスを作り、主体の混在を防ぎます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiClient.init` | 既定クライアントを準備 | config: baseUrl、认证及传输选项 | `Promise<HaiResult<void>>` | `await apiClient.init({ baseUrl: '/api/v1', auth: {} })` |
| `apiClient.close` | 既定クライアントを終了 | 无参数 | `Promise<void>` | `await apiClient.close()` |
| `apiClient.create` | 独立クライアントを作成 | contract: 应用共享契约 | `ApiClient<TContract>` | `apiClient.create(contract)` |
| `apiClient.config` | 現在のマスク済みクライアント設定を取得 | 読み取り専用プロパティ、引数なし | `ApiClientConfig \| null` | `apiClient.config` |
| `apiClient.isInitialized` | 既定クライアントの準備状態を確認 | 読み取り専用プロパティ、引数なし | `boolean` | `apiClient.isInitialized` |

#### 利用例：クライアントの準備と分離

```ts
import { apiContract } from '@h-ai/api-contract'
apiClient.isInitialized // default client readiness
const settings = apiClient.config // redacted config or null
const client = apiClient.create(apiContract.create({ iam: apiContract.iam }))
value(await client.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} }))
try {
  const policy = value(await client.iam.auth.publicConfig()) // IamPublicConfig from this server
}
finally {
  await client.close() // undefined; local resources released
}
```

実際のテストサービスの URL に置き換えます。create は通信せず、使用前に初期化します。close はサーバーのログアウトではありません。

ローカルトークンの削除とサーバー側のログアウトは別の操作です。サーバーで無効化するには IAM のログアウトを呼び出します。認証の復旧では同じ利用者のセッションを復元してください。

未翻訳：既定の各 API、認証フォーム用操作、更新処理の詳細。[中国語の該当節](api-client.md#detailed-workflow)を参照してください。

<a id="call-options"></a>

#### 呼び出し引数と接続オプション

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

更新結果に応じて保存済み認証情報を扱います。`401` の場合は認証情報を削除し、セッション失効を通知します。`429`、`408`、`409` などの失敗やタイムアウト時は既存の認証情報を保持します。HTTP 200 内の有効な失敗 `HaiResult` は `error.httpStatus` で判定します。後続の業務リクエストで再度更新できます。

<a id="client-integration"></a>

#### クライアントのアドレス・期限・復旧

コード引数を扱うため設定手冊から移動しました。完全な手順は現在[中国語](api-client.md#client-integration)にあり、この節は部分翻訳です。

[引数と手順の詳細](api-client.md#client-lifecycle)

<a id="credentials"></a>

### 資格情報の保存と更新：`apiClient.auth`・`tokenStorage`

保存と更新はクライアントに任せます。SSR/テストは分離メモリ、ブラウザの更新用トークンは httpOnly Cookie です。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiClient.auth.setTokens` | 現在の資格情報を保存 | TokenPair: 可信认证响应 | `Promise<void>` | `await apiClient.auth.setTokens(tokens)` |
| `apiClient.auth.clear` | 現在の資格情報を削除 | 无参数 | `Promise<void>` | `await apiClient.auth.clear()` |
| `apiClient.auth.onTokenRefreshed` | トークン更新を購読 | callback(TokenPair) | `() => void` | `apiClient.auth.onTokenRefreshed(() => refreshProfile())` |
| `apiClient.tokenStorage.memory` | メモリー資格情報ストアを作成 | 无参数 | `TokenStorage` | `apiClient.tokenStorage.memory()` |
| `apiClient.tokenStorage.httpOnlyCookie` | サーバー管理の更新 Cookie を利用 | 无参数 | `TokenStorage` | `apiClient.tokenStorage.httpOnlyCookie()` |
| `storage.getAccessToken` | アクセストークンを取得 | — | `Promise<string \| null>` | `await storage.getAccessToken()` |
| `storage.setAccessToken` | アクセストークンを保存 | token | `Promise<void>` | `await storage.setAccessToken(accessToken)` |
| `storage.getRefreshToken` | 更新トークンを取得 | — | `Promise<string \| null>` | `await storage.getRefreshToken()` |
| `storage.setRefreshToken` | 更新トークンを保存 | token | `Promise<void>` | `await storage.setRefreshToken(refreshToken)` |
| `storage.clear` | 全資格情報を削除 | — | `Promise<void>` | `await storage.clear()` |

#### 利用例：資格情報の保存と更新

信頼できるログインのトークンを入力。保存失敗は拒否し、finally で購読と端末の認証情報を消します。サーバーのログアウトは別操作です。

```ts
async function useIssuedTokens(tokens: Parameters<typeof apiClient.auth.setTokens>[0]) {
  const storage = apiClient.tokenStorage.memory()
  await storage.setAccessToken(tokens.accessToken)
  if (tokens.refreshToken)
    await storage.setRefreshToken(tokens.refreshToken)
  const stored = { access: await storage.getAccessToken(), refresh: await storage.getRefreshToken() }
  await storage.clear()
  const afterClear = await storage.getAccessToken() // null
  const browserStorage = apiClient.tokenStorage.httpOnlyCookie() // refresh cookie is not readable
  let refreshCount = 0
  const stop = apiClient.auth.onTokenRefreshed(() => { refreshCount += 1 })
  try {
    await apiClient.auth.setTokens(tokens)
    return { stored, afterClear, refreshCount }
  }
  finally {
    stop()
    await apiClient.auth.clear()
  }
}
```

<a id="auth-actions"></a>

### 認証フォームの接続：`apiClient.createAuthActions`

公開方針を UI に渡し、ログイン・登録・OTP・パスワード回復・再認証を手順に沿って実行します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiClient.createAuthActions` | 認証フォームの操作を作成 | client: 含标准 IAM 契约 | `Auth actions object` | `apiClient.createAuthActions(apiClient)` |
| `actions.publicConfig` | 公開認証方針を取得 | — | `Promise<HaiResult<T>>` → IamPublicConfig | `await actions.publicConfig()` |
| `actions.createCaptcha` | 操作用チャレンジを取得 | { operation } | `Promise<HaiResult<T>>` → IamCaptchaChallenge | `await actions.createCaptcha({ operation: 'login' })` |
| `actions.login` | ログインフォームを送信 | IamAuthLoginInput | `Promise<HaiResult<T>>` | `await actions.login({ identifier, password })` |
| `actions.register` | 登録フォームを送信 | IamRegisterInput | `Promise<HaiResult<T>>` | `await actions.register({ username, password })` |
| `actions.sendOtp` | ワンタイムコードを要求 | identifier, { captcha? }? | `Promise<HaiResult<T>>` → { expiresAt } | `await actions.sendOtp(identifier)` |
| `actions.requestPasswordReset` | 再設定通知を要求 | identifier, { captcha? }? | `Promise<HaiResult<T>>` → void | `await actions.requestPasswordReset(identifier)` |
| `actions.confirmPasswordReset` | 再設定資格情報と新パスワードを送信 | token, newPassword | `Promise<HaiResult<T>>` → void | `await actions.confirmPasswordReset(resetToken, newPassword)` |
| `actions.renewPassword` | 期限切れ・初期パスワードを変更 | { identifier, password, newPassword, captcha? } | `Promise<HaiResult<T>>` → void | `await actions.renewPassword({ identifier, password, newPassword })` |
| `actions.reauthenticate` | 機密操作のため再認証 | password, operation | `Promise<HaiResult<T>>` | `await actions.reauthenticate(password, 'users:delete')` |
| `actions.bindPageExit` | ページ離脱時のセッション処理を設定 | { enabled? } | `() => void` | `actions.bindPageExit({ enabled: endOnPageHide })` |

#### 利用例：認証フォームの接続

フォーム入力を受け、actions が保存完了を待ちます。以下の関数は別々の操作用で、実アカウントに順次実行しません。必要な captcha は AuthPanel が渡します。

```ts
const actions = apiClient.createAuthActions(apiClient)
const config = value(await actions.publicConfig()) // IamPublicConfig | null
if (!config)
  throw new Error('Public authentication settings are unavailable')
const unbind = actions.bindPageExit({ enabled: config.session.endOnPageHide })
async function login(input: Parameters<typeof actions.login>[0]) {
  return value(await actions.login(input)) // authenticated user and tokens, or throws preserved failure
}
async function register(input: Parameters<typeof actions.register>[0]) {
  return value(await actions.register(input)) // registration/authentication result
}
async function sendCode(identifier: string) {
  return value(await actions.sendOtp(identifier)) // expiresAt
}
async function requestReset(identifier: string) {
  value(await actions.requestPasswordReset(identifier)) // undefined
}
async function resetPassword(token: string, newPassword: string) {
  value(await actions.confirmPasswordReset(token, newPassword)) // undefined
}
async function renew(input: Parameters<typeof actions.renewPassword>[0]) {
  value(await actions.renewPassword(input)) // undefined
}
async function confirmSensitive(password: string) {
  return value(await actions.reauthenticate(password, 'users:delete')) // one-operation credential
}
const challenge = await actions.createCaptcha({ operation: 'login' }) // check success; solve through AuthPanel
unbind() // call when this page is destroyed
```

<a id="iam-requests"></a>

### 認証と管理 API の呼び出し：`apiClient.iam`

標準 HTTP 契約でアカウント・利用者・ロール・権限を扱い、各操作と資源の権限はサーバーで確認します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiClient.iam.auth.publicConfig` | 读取公开认证配置 | 无必填参数 | 当前登录注册、密码、协议等公开策略 | `await apiClient.iam.auth.publicConfig()` |
| `apiClient.iam.auth.createCaptcha` | 生成挑战 | `{ operation: 'login' }` | 登录挑战与凭证 | `await apiClient.iam.auth.createCaptcha({ operation: 'login' })` |
| `apiClient.iam.auth.login` | 密码登录 | `{ identifier, password }` | 已认证用户与 Token | `await apiClient.iam.auth.login({ identifier, password })` |
| `apiClient.iam.auth.loginWithLdap` | LDAP 登录 | `{ username, password }` | 已认证用户与 Token | `await apiClient.iam.auth.loginWithLdap({ username, password })` |
| `apiClient.iam.auth.sendOtp` | 发送一次性验证码 | `{ identifier }` | 验证码失效时间 | `await apiClient.iam.auth.sendOtp({ identifier })` |
| `apiClient.iam.auth.loginWithOtp` | 验证码登录 | `{ identifier, code }` | 已认证用户与 Token | `await apiClient.iam.auth.loginWithOtp({ identifier, code })` |
| `apiClient.iam.auth.register` | 注册 | `{ username, password }` | 新用户与 Token | `await apiClient.iam.auth.register({ username, password })` |
| `apiClient.iam.auth.currentUser` | 读取当前账号 | 无必填参数 | 当前用户以及角色和权限 | `await apiClient.iam.auth.currentUser()` |
| `apiClient.iam.auth.updateCurrentUser` | 更新本人资料 | `{ displayName: 'Mina' }` | 更新后的用户资料 | `await apiClient.iam.auth.updateCurrentUser({ displayName: 'Mina' })` |
| `apiClient.iam.auth.changePassword` | 已登录用户修改密码 | `{ oldPassword, newPassword }` | 无业务数据 | `await apiClient.iam.auth.changePassword({ oldPassword, newPassword })` |
| `apiClient.iam.auth.renewPassword` | 密码到期后续密 | `{ identifier, password, newPassword }` | 无业务数据 | `await apiClient.iam.auth.renewPassword({ identifier, password, newPassword })` |
| `apiClient.iam.auth.requestPasswordReset` | 申请密码重置 | `{ identifier }` | 无业务数据 | `await apiClient.iam.auth.requestPasswordReset({ identifier })` |
| `apiClient.iam.auth.confirmPasswordReset` | 使用重置凭证 | `{ token, newPassword }` | 无业务数据 | `await apiClient.iam.auth.confirmPasswordReset({ token, newPassword })` |
| `apiClient.iam.auth.reauthenticate` | 申请敏感操作票据 | `{ password, operation: 'users:delete' }` | 票据和到期时间 | `await apiClient.iam.auth.reauthenticate({ password, operation: 'users:delete' })` |
| `apiClient.iam.auth.refresh` | 刷新凭据 | `{ refreshToken }` | 新 Token；通常由客户端刷新流程调用 | `await apiClient.iam.auth.refresh({ refreshToken })` |
| `apiClient.iam.auth.logout` | 主动退出 | 无必填参数 | 无业务数据 | `await apiClient.iam.auth.logout()` |
| `apiClient.iam.auth.closeSession` | 请求结束当前会话 | 无必填参数 | 无业务数据 | `await apiClient.iam.auth.closeSession()` |
| `apiClient.iam.users.list` | 分页查询用户 | `{ page: 1, pageSize: 20 }` | 用户分页 | `await apiClient.iam.users.list({ page: 1, pageSize: 20 })` |
| `apiClient.iam.users.get` | 读取用户 | `{ id: userId }` | `null` | `await apiClient.iam.users.get({ id: userId })` |
| `apiClient.iam.users.create` | 创建用户 | `{ username, password }` | 新用户资料 | `await apiClient.iam.users.create({ username, password })` |
| `apiClient.iam.users.invite` | 发出邀请 | `{ username, email }` | 已创建的待激活用户资料 | `await apiClient.iam.users.invite({ username, email })` |
| `apiClient.iam.users.update` | 修改用户 | `{ id: userId, displayName: 'Mina' }` | 更新后的用户资料 | `await apiClient.iam.users.update({ id: userId, displayName: 'Mina' })` |
| `apiClient.iam.users.delete` | 删除用户 | `{ id: userId }` | 无业务数据 | `await apiClient.iam.users.delete({ id: userId })` |
| `apiClient.iam.users.resetPassword` | 管理员重置密码 | `{ id: userId, newPassword }` | 无业务数据 | `await apiClient.iam.users.resetPassword({ id: userId, newPassword })` |
| `apiClient.iam.roles.list` | 查询角色 | 无必填参数 | 角色分页 | `await apiClient.iam.roles.list({})` |
| `apiClient.iam.roles.get` | 读取角色 | `{ id: roleId }` | `null` | `await apiClient.iam.roles.get({ id: roleId })` |
| `apiClient.iam.roles.create` | 创建角色 | `{ code: 'reader', name: 'Reader' }` | 新角色 | `await apiClient.iam.roles.create({ code: 'reader', name: 'Reader' })` |
| `apiClient.iam.roles.update` | 更新角色 | `{ id: roleId, name: 'Report reader' }` | 更新后的角色 | `await apiClient.iam.roles.update({ id: roleId, name: 'Report reader' })` |
| `apiClient.iam.roles.delete` | 删除角色 | `{ id: roleId }` | 无业务数据 | `await apiClient.iam.roles.delete({ id: roleId })` |
| `apiClient.iam.permissions.list` | 分页查询权限 | `{ page: 1, type: 'api' }` | 权限分页 | `await apiClient.iam.permissions.list({ page: 1, type: 'api' })` |
| `apiClient.iam.permissions.get` | 读取权限 | `{ id: permissionId }` | `null` | `await apiClient.iam.permissions.get({ id: permissionId })` |
| `apiClient.iam.permissions.create` | 创建权限 | `{ code: 'reports:read', name: 'Read reports' }` | 新权限 | `await apiClient.iam.permissions.create({ code: 'reports:read', name: 'Read reports' })` |
| `apiClient.iam.permissions.setSensitiveOperations` | 配置敏感操作 | `{ id: permissionId, sensitiveOperations: ['users:delete'] }` | 无业务数据 | `await apiClient.iam.permissions.setSensitiveOperations({ id: permissionId, sensitiveOperations: ['users:delete'] })` |
| `apiClient.iam.permissions.delete` | 删除权限 | `{ id: permissionId }` | 无业务数据 | `await apiClient.iam.permissions.delete({ id: permissionId })` |

#### 利用例：認証と管理 API の呼び出し

```ts
const current = await apiClient.iam.auth.currentUser()
if (!current.success)
  throw new Error(current.error.message)
const users = value(await apiClient.iam.users.list({ page: 1, pageSize: 20 }))
// users.items is the authorized user page, not every user in the database
const roles = value(await apiClient.iam.roles.list({})) // configured roles visible to this caller
const permissions = value(await apiClient.iam.permissions.list({})) // permitted permission records
```

一覧に個々の入力と成功データを示しています。ID は前の成功応答から取得し、内容は実サービスと権限によります。ログインだけで管理権限は得られません。

[引数と手順の詳細](api-client.md#iam-requests)

<a id="business-requests"></a>

### ファイルと AI API：`apiClient.storage`・`apiClient.ai`

署名 URL は直接転送に使い、チャット・記憶・セッションは定義済みの AI 経路から取得します。サーバー内部 API とは別です。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiClient.storage.files.list` | 必须传对象，可填 `prefix`、`maxKeys`、`continuationToken`、`delimiter` | `maxKeys` 范围 1–1000 | 文件列表和继续分页所需的信息 | `await apiClient.storage.files.list({ prefix: 'reports/', maxKeys: 20 })` |
| `apiClient.storage.files.getMetadata` | 读对象元数据 | `{ key }` | 键、大小、类型等 | `await apiClient.storage.files.getMetadata({ key })` |
| `apiClient.storage.files.delete` | 删除单个对象 | `{ key }` | 无业务数据 | `await apiClient.storage.files.delete({ key })` |
| `apiClient.storage.files.deleteMany` | 批量删除对象 | `{ keys: [key] }` | 已确认删除的键与空失败列表 | `await apiClient.storage.files.deleteMany({ keys: [key] })` |
| `apiClient.storage.presignedUrls.createUpload` | 签发上传地址 | `{ key, contentType: 'application/pdf' }` | 临时上传 URL 和对象键 | `await apiClient.storage.presignedUrls.createUpload({ key, contentType: 'application/pdf' })` |
| `apiClient.storage.presignedUrls.createDownload` | 签发下载地址 | `{ key, expiresIn: 60 }` | 临时下载 URL 和对象键 | `await apiClient.storage.presignedUrls.createDownload({ key, expiresIn: 60 })` |
| `apiClient.ai.chats.createCompletion` | `messages` 必填 | 可选模型和生成设置 | 补全文本及响应元信息 | `await apiClient.ai.chats.createCompletion({ messages: [{ role: 'user', content: 'Hello' }] })` |
| `apiClient.ai.chats.sendMessage` | 发送会话消息 | `{ message, sessionId }` | 回复与当前会话信息 | `await apiClient.ai.chats.sendMessage({ message, sessionId })` |
| `apiClient.ai.chats.listHistory` | 查询历史 | `{ sessionId, limit: 20 }` | 聊天记录列表 | `await apiClient.ai.chats.listHistory({ sessionId, limit: 20 })` |
| `apiClient.ai.memories.list` | 查询记忆 | `{ objectId, limit: 20 }` | 记忆列表 | `await apiClient.ai.memories.list({ objectId, limit: 20 })` |
| `apiClient.ai.memories.recall` | 按内容检索记忆 | `{ query: 'preferred language', topK: 3 }` | 召回的记忆项 | `await apiClient.ai.memories.recall({ query: 'preferred language', topK: 3 })` |
| `apiClient.ai.sessions.list` | 查询对象的会话 | `{ objectId }` | 会话列表 | `await apiClient.ai.sessions.list({ objectId })` |

#### 利用例：ファイルと AI API

```ts
const files = value(await apiClient.storage.files.list({ prefix: 'reports/', maxKeys: 20 }))
// files contains metadata and pagination for this authorized prefix
const sessions = value(await apiClient.ai.sessions.list({})) // visible AI sessions
```

reports/ と成功応答のセッション ID を使います。削除は実データを変え、署名結果は URL・キー・期限を含みます。AI の文言は固定ではありません。

[引数と手順の詳細](api-client.md#business-requests)

<a id="transport-observation"></a>

### 通信の暗号化と結果の監視：`apiClient`

初期化時に通信設定を渡します。論理要求の監視は一つの業務呼び出しのマスク済み結果を受け取ります。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiClient.observeRequests` | 論理リクエストの最終結果を監視 | observer(ApiRequestRecord) | `() => void` | `apiClient.observeRequests(record => reportOutcome(record))` |

#### 利用例：通信の暗号化と結果の監視

```ts
const outcomes: string[] = []
const stop = apiClient.observeRequests(record => { outcomes.push(JSON.stringify(record)) })
try {
  const result = await apiClient.iam.auth.publicConfig()
  if (!result.success)
    throw new Error(result.error.message)
  // outcomes now contains the sanitized logical request record for this call
}
finally {
  stop()
}
```

監視関数を入力して解除関数を得ます。記録に生のトークンは含めません。更新・再試行の内部段階を複数の業務成功と数えません。

[引数と手順の詳細](api-client.md#transport-observation)
