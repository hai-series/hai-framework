# @h-ai/iam

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/audit](../audit/README.ja.md) · [@h-ai/cache](../cache/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md) · [@h-ai/reach](../reach/README.ja.md)

## 概要

共通の `iam` オブジェクトで認証、セッション、認可、ユーザー管理を提供する Identity and Access Management モジュールです。

## 主な機能

| 機能                           | 説明                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| **認証**                       | パスワード、OTP（メール・SMS コード）、LDAP、API Key の認証方式                           |
| **セッション**                 | 状態を持つセッション（ランダム access token + キャッシュ、任意の自動延長）                |
| **認可**                       | RBAC のロール・権限管理（DB 一括検索、ワイルドカード照合）                                |
| **ユーザー管理**               | 登録、検索、更新、パスワードリセット、管理者によるリセット                                |
| **API Key**                    | scope・期限付き API Key の作成、失効、検証                                                |
| **一度限りのチケット**         | Bearer Token を付けられない WebSocket などのための短期チケット（発行 / アトミックな消費） |
| **フロントエンドクライアント** | 独立フロントエンド向けの HTTP API 契約                                                    |

## 使い始める

### インストール

```bash
pnpm add @h-ai/iam
```

### 依存関係

- `@h-ai/reldb`：ユーザー・ロール・権限の永続化。**iam.init() より先に初期化**。
- `@h-ai/cache`：セッション・OTP・一度限りのチケット。**iam.init() より先に初期化**。
- `@h-ai/crypto`：内部で使用するパスワードハッシュ。自動初期化。
- `@h-ai/audit`：主要な RBAC 操作の監査記録。

- `@h-ai/reach`：**任意**。アプリがインストール、初期化、注入して通知テンプレートを使用します。独自送信コールバックでは不要です。
- `ldapts`：**任意**。LDAP を明示的に有効化し、`ldapClientFactory` がない場合だけ読み込みます。

### 任意の LDAP と通知連携

パスワード認証、ユーザー管理、RBAC は LDAP/Reach なしで動作します。両方とも任意の peer dependency で、必要な連携だけをインストールします。以下は reldb/cache 初期化後の起動・認証関数内の例で、`username/password` は検証済み入力です。

#### LDAP / Active Directory

既定クライアントは `pnpm add ldapts` で追加し、`login.ldap: true` と接続設定を明示します。接続設定だけでは LDAP は有効になりません。SDK なしで既定クライアントを有効にすると初期化が設定エラーを返します。

```yaml
# config/_iam.yml（启动前设置 HAI_IAM_LDAP_BINDPASSWORD）
login:
  ldap: true
ldap:
  url: ldaps://ldap.example.com:636
  bindDn: cn=service,dc=example,dc=com
  bindPassword: '${HAI_IAM_LDAP_BINDPASSWORD}'
  searchBase: ou=users,dc=example,dc=com
  searchFilter: '(uid={{username}})'
  usernameAttribute: uid
  emailAttribute: mail
  displayNameAttribute: cn
  connectTimeout: 5000
```

`ldaps://` は TLS、`ldap://` と `useTls: true` は StartTLS を使用します。Active Directory では `searchFilter: "(sAMAccountName={{username}})"` と `usernameAttribute: sAMAccountName` を指定できます。検索前に入力をエスケープします。初回ログインはローカルユーザーを同期して既定ロールを割り当て、無効化とロックも適用します。`ldapSyncUser: false` は DB 資格情報世代を持つ有効なローカルユーザーを必要とし、仮想 DN ユーザーは作りません。 `bind/search/unbind` を HaiResult で返す `ldapClientFactory` を注入できます。独自ファクトリでは ldapts は不要です。

```ts
import type { IamConfigSettingsInput } from '@h-ai/iam'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'

// core 已加载 config/，reldb 与 cache 已成功初始化。
const initialized = await iam.init(core.config.getOrThrow<IamConfigSettingsInput>('iam'))
if (!initialized.success)
  return initialized
const result = await iam.auth.loginWithLdap({ username, password })
if (!result.success)
  return result
return result
```

#### 任意の Reach による自動送信

`pnpm add @h-ai/reach` で追加します。設定、初期化、終了はアプリが管理し、IAM は注入されたインスタンスだけを使用します。SMTP/HTTP は例で、SMS ゲートウェイは [Reach 通知仕様](../reach/README.ja.md) を受け取ります。Console はメタデータのみを記録し、実際の送信は行いません。

```yaml
# config/_reach.yml；环境变量仅在服务端设置。
providers:
  - name: email
    type: smtp
    host: '${SMTP_HOST}'
    port: 465
    secure: true
    user: '${SMTP_USER}'
    pass: '${SMTP_PASSWORD}'
    from: '${MAIL_FROM}'
  - name: sms
    type: api
    url: '${SMS_GATEWAY_URL}'
templates:
  - name: otp_email
    provider: email
    subject: Verification code
    body: 'Your code is {code}.'
  - name: otp_sms
    provider: sms
    body: 'Your code is {code}.'
  - name: password_reset
    provider: email
    subject: Password reset
    body: 'Reset: {resetUrl}. Expires: {expiresAt}.'
  - name: password_reset_sms
    provider: sms
    body: 'Reset: {resetUrl}. Expires: {expiresAt}.'
```

`otp_email / otp_sms` は `{code}`、`password_reset / password_reset_sms` は `{token}`、`{expiresAt}`、`{resetUrl}` を使用します。`passwordReset.mode: phone` で SMS リセットを選択します。テンプレートは `iam.init()` より前に設定し、利用できないチャネルは公開設定で非表示になります。

```ts
import type { ReachConfigInput } from '@h-ai/reach'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reach } from '@h-ai/reach'

// core、reldb、cache 已初始化；按应用生命周期反序关闭 IAM 与 Reach。
const notification = await reach.init(core.config.getOrThrow<ReachConfigInput>('reach'))
if (!notification.success)
  return notification
const initialized = await iam.init({
  reach,
  login: { otp: true },
  otp: { email: true, sms: true },
  passwordReset: { mode: 'email', resetUrl: 'https://app.example.com/auth/reset-password' },
})
if (!initialized.success)
  return initialized
return iam.auth.sendOtp('user@example.com')
```

#### 独自メール・SMS 送信

`onOtpSendEmail`、`onOtpSendSms`、`onPasswordResetRequest` を注入して既存の送信サービスを使用します。必要なものだけ実装でき、Reach と併用する場合は明示コールバックを優先します。例のサービスはアプリ実装で、送信成功時のみ Promise を解決します。HaiResult を返すサービスは `success` を検査し、失敗時はコールバック内で例外にします。IAM は例外を捕捉して業務エラーを返し、コードや Token、送信内部情報をユーザーに表示しません。

```ts
import { iam } from '@h-ai/iam'
import { mailService, smsService } from './notifications.js'

// mailService/smsService 为应用已有的发送服务；不需要安装或初始化 Reach。
// 调用方须检查服务投递结果，失败时拒绝 Promise，不能吞掉错误。
const initialized = await iam.init({
  otp: { email: true, sms: true },
  onOtpSendEmail: async (email, code, context) => {
    await mailService.send({ to: email, subject: 'Verification code', text: code, idempotencyKey: context.idempotencyKey })
  },
  onOtpSendSms: async (phone, code, context) => {
    await smsService.send({ to: phone, code, idempotencyKey: context.idempotencyKey })
  },
  passwordReset: { mode: 'email' },
  onPasswordResetRequest: async (user, token, context) => {
    if (!user.email)
      throw new Error('Reset recipient unavailable')
    const url = new URL('https://app.example.com/auth/reset-password')
    url.searchParams.set('token', token)
    await mailService.send({ to: user.email, subject: 'Password reset', text: url.toString(), expiresAt: context.expiresAt, idempotencyKey: context.idempotencyKey })
  },
})
if (!initialized.success)
  return initialized
```

### クイックスタート

```ts
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

// 基础密码认证不需要安装 Reach 或 ldapts。
async function example() {
  try {
    const db = await reldb.init({ type: 'sqlite', database: './data.db' })
    if (!db.success)
      return db
    const cached = await cache.init({ type: 'memory' })
    if (!cached.success)
      return cached
    const initialized = await iam.init({})
    if (!initialized.success)
      return initialized
    const registered = await iam.user.register({ username: 'demo', password: 'Password123' })
    if (!registered.success)
      return registered
    const login = await iam.auth.login({ identifier: 'demo', password: 'Password123' })
    if (!login.success)
      return login
    return await iam.auth.verifyToken(login.data.tokens.accessToken)
  }
  finally {
    // 应用关闭时按依赖的反向顺序释放。
    await iam.close()
    await cache.close()
    await reldb.close()
  }
}

const result = await example()
if (!result.success)
  core.logger.error('Authentication example failed', { code: result.error.code })
```

LDAP は既定で無効です。公開 OTP は `otp` 設定と送信コールバック、パスワードリセットは通知コールバックが必要です。

`iam.config` は**機密情報をマスクした設定スナップショット**を返します。LDAP の `url` / `bindPassword` などは自動的に非表示になります。状態確認用で、元の設定の代わりにはなりません。

### 設計

#### アーキテクチャ

IAM は `iam.init()` / `iam.close()` で状態を管理する**ライフサイクル付きシングルトン**です。内部の 5 つのサブモジュールを依存順に初期化します：

```
iam.init()
  ├─ session  （キャッシュによるセッション、DB 依存なし）
  ├─ authz    （RBAC ロール・権限、DB 一括検索）
  ├─ authn    （認証、session + authz に依存）
  ├─ user     （ユーザー管理、session + authz + passwordStrategy に依存）
  └─ seed     （初期データ、authz に依存）
```

各サブモジュールは class ではなく**ファクトリー + クロージャー**（`createSessionOperations(deps)` など）で作成し、getter で `iam.auth` / `iam.user` / `iam.authz` / `iam.session` / `iam.apiKey` として公開します。

初期化前のサブモジュール呼び出しは `NotInitializedKit` Proxy により `NOT_INITIALIZED` を返します。

#### データの保存先

| データ種別                                | 保存先                                  | 説明                                                                                                                          |
| ----------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ユーザー、ロール、権限、関連付け、API Key | DB（基本 5、任意の API Key 1 テーブル） | `hai_iam_users`、`hai_iam_roles`、`hai_iam_permissions`、`hai_iam_role_permissions`、`hai_iam_user_roles`、`hai_iam_api_keys` |
| セッション（accessToken → Session）       | キャッシュ                              | TTL 付き、任意の自動延長                                                                                                      |
| Refresh 消費状態                          | Redis ユーザー分区                      | セッション・索引と単一キー CAS で更新                                                                                         |
| OTP コード                                | キャッシュ                              | TTL + 試行回数制限                                                                                                            |
| パスワードリセット Token                  | ユーザー DB 行                          | SM3 hash・DB 期限・試行回数・条件付き改密                                                                                     |
| API Key                                   | DB                                      | `hai_iam_api_keys`。平文は保存せず hash のみ。接頭辞で候補検索                                                                |

---

#### 認証（authn）— `iam.auth`

##### 主要な型

- **`AuthnOperations`**：認証操作。`login` / `loginWithOtp` / `loginWithLdap` / `loginWithApiKey` / `logout` / `verifyToken` / `sendOtp` / `registerAndLogin`。
- **`AuthStrategy`**：認証方式のインターフェース（`type` + `authenticate` + `challenge?`）。パスワード・OTP・LDAP・API Key の 4 実装。
- **`AuthResult`**：ユーザー情報、`TokenPair`（accessToken + refreshToken）、ロール・権限を含むログイン結果。
- **`Credentials`**：`{ type: 'password' | 'otp' | 'ldap' | 'apikey' }` と各方式の認証情報を組み合わせた共通の共用体型。

##### 主要な処理

**パスワードによるログイン：**

```
login(credentials)
  → パスワードログインの有効化を確認
  → identifier でユーザー検索（username / email / phone）
  → 未存在なら dummy hash（固定時間でタイミング攻撃を防止）
  → アカウントロックを確認（lockoutDuration 内で loginFailedCount >= maxLoginAttempts）
  → パスワードハッシュ検証（@h-ai/crypto）
  → 失敗：回数を記録し、上限でロック
  → 成功：失敗回数をリセット
  → 期限を確認（expirationDays > 0 なら passwordUpdatedAt）
  → ロール + 権限を検索
  → セッション作成（session.create → TokenPair）
  → AuthResult { user, tokens, roles, permissions, agreements? } を返す
```

**Token の検証：**

```
verifyToken(accessToken)
  → session.get(accessToken) → キャッシュ検索
  → 永続ユーザーの有効状態とセッションに紐付く credentialVersion を検証
  → 自動延長モードなら TTL を延長
  → 現在のユーザーを再読込し、有効状態と credentialVersion を再確認して、ロール JOIN・権限一括検索（ロールなしなら権限検索を省略）
  → 永続データの読取失敗、ユーザー不在・無効、資格情報の世代不一致は拒否し、API Key scope を再適用
  → 現在の Session を返す（userId、roles、permissions）
```

##### 使用方法

例は reldb/cache/IAM の初期化に成功したサーバーで実行し、検証済みの入力を使います。パスワード認証は既定で有効です。OTP には `login.otp: true`、`otp` チャネル、送信コールバック/Reach テンプレートが必要です。LDAP は `login.ldap: true`、API Key は `login.apikey: true` を有効にします。ログインと登録後ログインは `AuthResult` を返します。登録とパスワード認証のスイッチは独立しています。

OTP は送信と受信したコードによるログインの二段階です。両方とも HaiResult を返します。LDAP は `iam.auth.loginWithLdap({ username, password })`、API Key は `loginWithApiKey({ key })` を使います。`data` の前に `success` を確認してください。

```ts
import { iam } from '@h-ai/iam'

async function passwordLogin(identifier: string, password: string) {
  const result = await iam.auth.login({ identifier, password })
  if (!result.success)
    return result
  // 成功后返回 user、tokens、roles、permissions；令牌只交给安全存储。
  return result
}

async function requestLoginCode(identifier: string) {
  // identifier 为启用通道对应的邮箱/手机号，返回 expiresAt。
  return iam.auth.sendOtp(identifier)
}

async function otpLogin(identifier: string, code: string) {
  // 用户收到验证码并输入后调用；发送失败时不能伪报成功。
  return iam.auth.loginWithOtp({ identifier, code })
}

async function registerWithSession(username: string, password: string) {
  return iam.auth.registerAndLogin({ username, password })
}
```

##### 注意点

- **タイミング攻撃対策**：未存在ユーザーにも dummy password hash を実行し、応答時間をそろえます。
- **アカウントロック**：連続 `maxLoginAttempts` 回の失敗で `lockoutDuration` 秒ロック。
- **方式ごとの有効化**：`login.password` / `login.otp` / `login.ldap` / `login.apikey` で制御。
- **OTP の安全性**：rejection sampling で剰余偏りを除去、定時間比較でタイミング攻撃を防ぎ、`resendInterval` で頻度制限。

`iam.auth.logout(accessToken)` は完全な不透明 Token を使い、ユーザー文書の一回の CAS で access と refresh を同時に取り消します。access 期限後も実行します。不正・不存在 Token は冪等成功ですが、キャッシュの読取・確定障害は失敗で返し、復旧後に同じ Token で再試行できます。HTTP 入口は保持している Token だけを取り消し、userId を対象にせず、有効な access 認証を前提にしません。呼出側は `success` を確認し、Cookie・安全ストレージのローカル消去だけでサーバー失効を成功と扱わず、失敗を表示します。

---

#### セッション（session）— `iam.session`

##### 主要な型

- **`SessionOperations`**：`create` / `get` / `verifyToken` / `update` / `delete` / `deleteByUserId` / `refresh` / `revokeRefresh` / `patchUserSessions`。
- **`Session`**：userId、roles、permissions、accessToken、期限などを含むセッション。
- **`TokenPair`**：Token のペア。`{ accessToken, refreshToken, expiresIn, tokenType: 'Bearer' }`。

##### 主要な処理

**Token 更新（Rotation）：**

```
refresh(refreshToken)
  → ユーザー分区と会話バージョンを読み、認可を検証
  → 未公開の新 Token 候補を生成
  → 単一キー CAS で version/refresh を再検証し、旧会話と原子的に置換
  → コミット後のみ唯一の後続 TokenPair を返す
```

**単一端末のログイン：**

```
create(options) [singleDevice=true]
  → 新 accessToken + refreshToken の候補を生成
  → 単一キー CAS で既存会話と索引を同時に置換
  → コミット失敗時は旧会話を維持
```

##### 使用方法

`tokens.accessToken` でリクエストを認証し、`tokens.refreshToken` で新しいペアを取得します。`expiresIn` は秒です。独立 API は `Authorization: Bearer <accessToken>`、SvelteKit の Cookie 入口は後述の kit 標準連携を使います。

保護されたリクエストは `iam.auth.verifyToken` で現在のユーザー状態・ロール・権限を読みます。`iam.session.get/verifyToken` は低水準のスナップショットで、現在の認可を代替しません。`session.create` は信頼できるサーバー連携専用で、クライアント指定のロール/権限/Key バインドを受け入れません。

```ts
import { iam } from '@h-ai/iam'

async function authenticateRequest(accessToken: string) {
  // 受保护请求读取当前用户状态及角色/权限，失败时停止业务操作。
  const verified = await iam.auth.verifyToken(accessToken)
  if (!verified.success)
    return verified
  return verified
}

async function rotateTokens(refreshToken: string) {
  const refreshed = await iam.session.refresh(refreshToken)
  if (!refreshed.success)
    return refreshed
  // 安全存储替换两个令牌；下一次请求仍走 auth.verifyToken。
  return refreshed
}

async function signOut(accessToken: string) {
  return iam.auth.logout(accessToken)
}

async function forceSignOut(userId: string) {
  // 调用前已验证管理员权限，返回撤销的会话数。
  return iam.session.deleteByUserId(userId)
}
```

##### 注意点

- **キャッシュのみの保存**：Memory は再起動時に消失します。共有 Redis のセッションは IAM サービス再起動後も TTL または失効まで保持します。
- **自動延長**：`sliding: true` なら各 `get()` で TTL を延長。
- **Refresh Rotation**：refresh は一度だけ消費します。重複は正常な並行処理や応答喪失でも発生し、それだけで漏洩と判断しません。
- **Token 強度**：256-bit の暗号学的乱数（`crypto.getRandomValues(new Uint8Array(32))`）、base64url 形式。

`create({ maxAge })` は設定の既定値を正の安全な整数秒で上書きし、`Session.maxAge` に保存します。発行と更新の `expiresIn` はこの値を使います。自動延長は同じ期間を使い、確定済みの `lastActiveAt/expiresAt` を返し、遅いリクエストが新しい延長を短縮しません。明示的な `update` は有効な日時を反映して内容版を更新します。クライアントは返された `expiresIn` から更新時刻を決めます。

access と refresh は独立して期限切れになります。ユーザー文書は両期限の最大まで保持しますが、access 認証は自身の expiresAt のみを確認します。access 期限後も有効な refresh で更新でき、更新ごとに新しい refreshTokenMaxAge を開始して旧資格情報を失効させます。access 削除・全ログアウト・単一端末置換は更新待ち記録も取り消し、revokeRefresh は有効な access を残します。更新経路で旧 access の認証成功を前提にしません。

セッションの読取・確定障害は失敗 HaiResult として返し、不存在や期限切れと解釈せず補償削除もしません。索引と会話は同じ文書で保持し、個別 get/ttl や二重索引を廃止します。確定した期限だけで整理し、復旧後の再読取・全ログアウトは元の全記録を対象にします。破損状態は保持して認証を拒否し、空文書で上書きせず運用者が修復します。

Session.credentialVersion は作成時の DB 資格情報世代に結び付けます。CreateSessionOptions.expectedCredentialVersion は検証済みの信頼する戦略だけが指定し、旧世代は拒否します。省略した低レベル create でも実在する有効なローカルユーザーを DB から読み、現世代に結び付けるため、DB 記録のない認証済み ID は作れません。

---

#### 認可（authz）— `iam.authz`

ロール一覧は `iam.authz.getRoleUserCounts(roleIds)` の 1 回の集計で現在のページの実際の所属人数を取得し、`HaiResult<Map<string, number>>` を返します。関連がなければ 0、検索失敗は読み込みエラーを表示し、0 件の統計を作りません。

##### 主要な型

- **`AuthzOperations`**：ロール・権限 CRUD、ロールと権限・ユーザーとロールの割り当て、権限確認。
- **`Role`**：ロール。`{ id, code, name, description, isSystem }`。
- **`Permission`**：権限。`{ id, code, name, type, resource, action }`、type は `menu` / `api` / `button`。
- **`PermissionType`**：権限種別の enum。

##### 主要な処理

**権限確認（`checkPermission`）：**

```
checkPermission(userId, permission)
  → RBAC 無効なら true
  → ユーザーのロール一覧を DB から取得
  → 最高管理者を確認（キャッシュの superAdminRoleId）、あれば true
  → 各ロールの権限コードを DB で一括取得。読み取り失敗はエラーを返す
  → 厳密・ワイルドカード照合（`admin:*` は `admin:read` に一致）
  → true / false を返す
```

**ロール・権限変更後のセッション同期：**

```
assignPermissionToRole(roleId, permId)
  → 関連を DB に保存
  → 所属ユーザー検索 → 各権限を再解決 → 活動中 session を更新
  （best-effort：失敗は log.error のみで割り当て結果に影響しない）
```

##### 使用方法

権限を作成し、その **ID** を `permissionIds` に保存してロールを作成し、ロール **ID** でユーザーに割り当てます。セッションとガードは安定した **code** を使います。表示名は独立して変更できます。例は RBAC が有効であることを前提とし、管理操作の権限とリソース範囲はアプリで確認します。

`createRole/updateRole` はロール情報と完全な権限集合を同一トランザクションに保存します。省略は維持、空配列は解除、重複は除去、不明な ID は失敗です。同時更新は最後にコミットした完全な集合を採用します。自管理トランザクションはコミット後にセッションを同期し、外部トランザクションは呼び出し側がコミット後に同期します。

`checkPermission(userId, code)` と `getUserAuthorization` はユーザーの RBAC を読み、リクエストの API Key scopes を考慮しません。Key リクエストでは `iam.auth.verifyToken` の収束済み権限を使用し、userId の再照会だけで許可しないでください。serv の `.permission('record:read')` は厳密な権限ガードです。メニュー/ボタンの非表示は API 認可の代替ではありません。

```ts
import { iam } from '@h-ai/iam'

async function provisionReader(userId: string) {
  // 示例初始化权限/角色；生产种子应先按 code 查询，保证幂等。
  const permission = await iam.authz.createPermission({
    code: 'record:read',
    name: '读取记录',
    type: 'api',
    resource: 'record',
    action: 'read',
  })
  if (!permission.success)
    return permission
  const role = await iam.authz.createRole({
    code: 'record_reader',
    name: '记录读取者',
    permissionIds: [permission.data.id],
  })
  if (!role.success)
    return role
  return iam.authz.assignRole(userId, role.data.id)
}

async function replaceRolePermissions(roleId: string, permissionIds: string[]) {
  // 完整替换：[] 清空；省略 permissionIds 则保持已有权限。
  return iam.authz.updateRole(roleId, { permissionIds })
}

async function replaceUserRoles(userId: string, roleIds: string[]) {
  // 完整替换用户的角色集合；[] 移除全部角色。
  return iam.authz.syncRoles(userId, roleIds)
}

async function currentAuthorization(userId: string) {
  // 返回 roles/permissions 的 code 数组，不接受 ID 或显示名称代替 code。
  return iam.authz.getUserAuthorization(userId)
}
```

##### 注意点

- **ワイルドカード**：`admin:*` は `admin:read`、`admin:write:detail` などに一致。1 つの `*` がコロン以降全体に一致します。
- **最高管理者**：`rbac.superAdminRole`（既定 `super_admin`）はすべての権限を持ちます。
- **トランザクション**：`deleteRole` / `deletePermission` は DB トランザクションで関連を削除してから本体を削除。
- **セッション同期**：キャッシュ更新は best-effort です。保護されたリクエストは `iam.auth.verifyToken` でセッションに紐付く永続資格情報の世代を検証し、現在のユーザー状態・資格情報の世代を再確認して最新の認可を読みます。いずれかの読取に失敗すれば拒否します。`iam.session.get/verifyToken` も永続ユーザーの有効状態と `credentialVersion` を検証しますが、ロール・権限はセッションのスナップショットであり、現在の認可を代替しません。`iam.authz.getUserAuthorization(userId)` はロール JOIN と権限一括検索を共有します。
- **初期データ**：`seedDefaultData: true` で admin/user/guest と基本権限を冪等に作成。

---

#### ユーザー管理（user）— `iam.user`

##### 主要な型

- **`UserOperations`**：登録、検索、更新、削除、パスワード変更・リセット、強度検証。
- **`User`**（公開フィールド）：`{ id, username, email, phone, displayName, avatarUrl, enabled, roles? }`。
- **`StoredUser`**：内部保存用ユーザー。`passwordHash`、`loginFailedCount`、`lockedUntil` などの機密フィールドを含みます。
- **`RegisterOptions`** / **`RegisterResult`**：登録の入力・出力。
- **`UpdateCurrentUserInput`**：現在のユーザーが変更できるフィールド（`username` / `email` / `displayName` / `avatarUrl` / `phone` / `metadata`）。

##### 主要な処理

**ユーザー登録：**

```
register(options)
  → 登録の有効化を確認
  → 強度検証（Zod schema + 独自ルール）
  → パスワードハッシュ（@h-ai/crypto）
  → DB トランザクション：作成 + 結果取得
  → 既定ロール付与（rbac.defaultRole、トランザクション外、失敗は log のみ）
  → RegisterResult { user, agreements? } を返す
```

**パスワードリセット：**

```
requestPasswordReset(email)
  → メールで検索（未存在は静かに ok、列挙攻撃を防止）
  → 256-bit ランダム Token を生成
  → SHA-256(token) → userId をキャッシュ（TTL + maxAttempts）
  → onPasswordResetRequest を呼ぶ（アプリがメール・SMS 送信）

confirmPasswordReset(token, newPassword)
  → SHA-256(token) を取得して期限・試行回数を検証
  → 強度検証 → ハッシュ → DB 更新
  → 全活動セッションを削除して再ログインを要求
  → 使用済みリセット Token を削除
```

##### 使用方法

`register` はユーザーだけを返し、セッションは作りません。同時ログインには `auth.registerAndLogin` を使います。管理用の `createUser` は自己登録設定と独立しています。自己プロフィールは `getCurrentUser/updateCurrentUser` で username/email/displayName/avatarUrl/phone/metadata を更新します。安全性に関わるフィールドとロールは認可された管理入口を使います。

一覧は `PaginatedResult<User>` を返し、`roleCode` はページング前に絞り込みます。必要時のみ `include: ['roles']` を指定します。一括取得は入力を重複排除した順序で返し、不明 ID は省略するため、配列位置ではなく id で関連付けます。公開 DTO でもデータ範囲と開示フィールドはアプリで制御します。

`getUser(id)` は検索成功・不存在時に `null`、`getCurrentUser(token)` は無効セッション/不存在時に失敗します。DB エラーを空データ扱いにしません。`validatePassword` は同期 HaiResult です。削除、無効化、パスワード変更/リセットは対象セッションを取り消します。

```ts
import { iam } from '@h-ai/iam'

async function registerUser(username: string, email: string, password: string) {
  // 返回 RegisterResult，不自动建立会话。
  return iam.user.register({ username, email, password })
}

async function createManagedUser(username: string, password: string) {
  // 先验证调用者管理权限；不受 register.enabled 开关限制。
  return iam.user.createUser({ username, password })
}

async function updateMyProfile(accessToken: string, displayName: string) {
  return iam.user.updateCurrentUser(accessToken, { displayName })
}

async function changeMyPassword(accessToken: string, oldPassword: string, newPassword: string) {
  // 成功后撤销该用户全部会话，客户端回到登录入口。
  return iam.user.changeCurrentUserPassword(accessToken, oldPassword, newPassword)
}

async function listReaders(page: number) {
  const result = await iam.user.listUsers({
    page,
    pageSize: 20,
    roleCode: 'record_reader',
    search: 'alice',
    enabled: true,
    include: ['roles'],
    sortBy: 'createdAt',
    sortDirection: 'desc',
  })
  if (!result.success)
    return result
  // 直接使用 items/total/page/pageSize，不对当前页再次过滤。
  return result
}

async function loadUsers(userIds: readonly string[]) {
  // 最多 1000 个输入 ID；去重保留输入顺序，缺失 ID 省略。
  return iam.user.getUsers(userIds, { include: ['roles'] })
}

async function disableUser(userId: string) {
  // 调用前已验证管理权限；成功后自动清除该用户会话。
  return iam.user.updateUser(userId, { enabled: false })
}
```

##### 注意点

- **`toUser()` の機密除去**：公開ユーザー情報から `passwordHash`、`loginFailedCount` などを除外。
- **セッション連動**：`deleteUser` / `updateUser({ enabled: false })` / `changePassword` / `confirmPasswordReset` は対象ユーザーの全セッションを削除。
- **列挙攻撃対策**：未登録メールへの `requestPasswordReset` はエラーでなく `ok(undefined)`。
- **validatePassword は同期**：`UserOperations` の唯一の同期メソッドで、ほかは非同期。
- **部分一致検索**：`listUsers` はユーザー名・メール・電話・表示名を検索し、LIKE のワイルドカードはエスケープ済み。
- **サーバー側の並び順**：`listUsers` は `username`、`email`、`displayName`、`enabled`、`createdAt` のみを許可リストで対応付け、既定は作成日時の降順。

---

#### API Key — `iam.apiKey`

`scopes` は主体の権限との共通範囲を適用し、`*` と名前空間 `:*` に対応します。既定の空配列は本人確認のみで操作権限を付与しません。制限付き key のセッション `roles` は空で permission ガードを使用し、明示的な `*` も主体の権限を超えません。ログインは key ID に結び付き、get/verifyToken/refresh は永続状態を再確認し、失効・無効・期限切れ・DB エラーを拒否します。verifyApiKey 単独は鍵のメタデータ検証のみで、主体・操作の認可は別途必要です。

##### 主要な型

- **`ApiKeyOperations`**：`createApiKey` / `listApiKeys` / `getApiKey` / `revokeApiKey` / `verifyApiKey`。
- **`ApiKey`**（公開フィールド）：`{ id, userId, name, keyPrefix, enabled, expiresAt, scopes }`。
- **`CreateApiKeyResult`**：`{ apiKey, rawKey }`。平文の鍵を返すのは一度のみ。

##### 主要な処理

**API Key の検証：**

```
verifyApiKey(rawKey)
  → rawKey から接頭辞取得（prefix + 最初の 8 文字）
  → DB で接頭辞による候補検索
  → 各 hash を同期検証
  → 成功後に期限・無効化を確認
  → lastUsedAt を非同期更新（応答をブロックしない）
  → ApiKey を返す
```

##### 使用方法

初期化設定で API Key を有効にします。Key はユーザーの制限付き認証情報です：**有効権限 = 現在のユーザー権限 ∩ scopes**。scope は権限 code で、ロール名、表示名、リソース ID ではありません。権限を作成せず、テナント/レコード所有権の検証も代替しません。

```yaml
# config/_iam.yml
login:
  apikey: true
apikey:
  maxKeysPerUser: 10
  defaultExpirationDays: 30
```

ユーザーが `record:read`、`record:write`、`user:read` を持つ場合、権限変更時にも交集を再計算します：

| scopes                         | 有効権限                       | roles                |
| ------------------------------ | ------------------------------ | -------------------- |
| 省略または `[]`                | 身元のみ、操作権限なし         | `[]`                 |
| `['record:read']`              | `record:read`                  | `[]`                 |
| `['record:*']`                 | `record:read`、`record:write`  | `[]`                 |
| `['record:read', 'user:read']` | 指定した二つの権限             | `[]`                 |
| `['missing:read']`             | ユーザーが持たないため権限なし | `[]`                 |
| `['*']`                        | 現在のユーザー権限すべて       | ユーザーロールを維持 |

`record:*` はコロン後の全階層に一致します。`record:r*` 等の任意パターンは未対応です。ユーザーが `record:read` のみなら `['record:*']` でも読み取りのみです。ユーザーがワイルドカードを持つ場合も狭い範囲を保持します。制限付き Key はロール認可を持たず、permission ガードを使います。広いアクセスが必要な場合のみ明示的な `*` を選びます。

以下は作成 → Key ログイン → Bearer 検証と操作認可 → 一覧 → 取り消しの例です。管理入口は本人の所有権または管理権限を検証します。IAM 自体は業務上の呼び出し者を知りません。

```ts
import { err, HaiCommonError, ok } from '@h-ai/core'
import { iam } from '@h-ai/iam'

async function createReadKey(userId: string) {
  // 调用前校验管理权限或本人归属；scopes 使用权限 code。
  const created = await iam.apiKey.createApiKey(userId, {
    name: 'Read client',
    expirationDays: 30,
    scopes: ['record:read'],
  })
  if (!created.success)
    return created
  // rawKey 仅本次返回；通过安全渠道展示一次，不写日志。
  return created
}

async function apiKeyLogin(rawKey: string) {
  // 通常由客户端取得 Key 后调用；服务器内部验证并绑定 Key。
  return iam.auth.loginWithApiKey({ key: rawKey })
}

async function requireRecordRead(accessToken: string, deniedMessage: string) {
  // deniedMessage 由应用 i18n 提供；先读取当前且已收敛 scope 的会话。
  const verified = await iam.auth.verifyToken(accessToken)
  if (!verified.success)
    return verified
  const allowed = verified.data.permissions.some(code =>
    code === '*' || code === 'record:read'
    || (code.endsWith(':*') && 'record:read'.startsWith(code.slice(0, -1))),
  )
  if (!allowed)
    return err(HaiCommonError.FORBIDDEN, deniedMessage)
  // 这里只确认操作权限；业务层还须检查具体记录的数据归属。
  return ok({ userId: verified.data.userId })
}

async function listMyKeys(userId: string) {
  return iam.apiKey.listApiKeys(userId, {
    page: 1,
    pageSize: 20,
    search: 'Read',
    enabled: true,
  })
}

async function revokeKey(keyId: string) {
  // 调用前校验本人归属或管理权限。
  return iam.apiKey.revokeApiKey(keyId)
}
```

Key ログインには `rawKey` のみ使用できます。`apiKey.id` は管理 ID、`keyPrefix` は表示/検索用です。`verifyApiKey(rawKey)` は Key のメタデータ検証のみで、ユーザー状態・scope・操作認可を代替しません。

Key セッションは `iam.session.refresh` 後も Key に紐付きます。取り消し成功後は既存 accessToken の get/verify と refreshToken の refresh が失敗します。期限切れ、無効化、永続化読み取りエラーも拒否します。ロール変更は `iam.auth.verifyToken` の現在の認可で反映します。scope 更新 API はないため、新 Key を作成して旧 Key を取り消します。

`expirationDays: 0` は無期限、省略時は `apikey.defaultExpirationDays` を使用します。期限が必要なら明示します。生 Key/Token を URL、ログ、公開設定、通常の localStorage に保存しません。

##### 注意点

- **平文は保存しない**：DB は hash のみを保存し、作成時の `rawKey` が唯一の取得機会。
- **接頭辞検索**：`keyPrefix` で候補を絞り、全テーブル走査を避けます。
- **件数制限**：ユーザーあたり最大 `maxKeysPerUser`（既定 10）件。
- **明示的有効化**：`login.apikey: true` の場合のみ初期化。

---

### その他の使い方

API 引数・エラーコード・統合パターンの詳細は中国語の Skill テンプレート（`packages/cli/templates/skills/hai-iam/SKILL.md`）を参照してください。

### フロントエンドの API 呼び出し

公開 HTTP API は `@h-ai/api-contract` で定義し、`@h-ai/api-client` の型付きクライアントで呼び出します：

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({ baseUrl: '/api/v1' })

// 登录
const result = await apiClient.iam.auth.login({
  identifier: 'admin',
  password: 'Password123',
})

// 获取当前用户
const user = await apiClient.iam.auth.currentUser()

// 修改密码
await apiClient.iam.auth.changePassword({
  oldPassword: 'Password123',
  newPassword: 'NewPassword456',
})
```

browser 条件の入口は設定 Schema、型、HaiIamError のみを公開し、サーバーの `iam` インスタンスは含みません。認証には HTTP/typed client を使用します。

### パスワードリセット

リセットには `passwordReset.enabled` と送信コールバック/Reach テンプレートが必要です。成功はアカウントの存在や受信を証明しません。送信・内部処理の HaiResult エラーも処理します。期限/試行回数制限があり、一度だけ成功消費でき、成功時に旧セッションを取り消します。管理者リセットに旧パスワードは不要ですが、アプリで管理権限を確認します。

```ts
import { iam } from '@h-ai/iam'

async function requestReset(identifier: string) {
  // 缺失用户与有效用户使用相同成功响应，避免枚举账户。
  return iam.user.requestPasswordReset(identifier)
}

async function confirmReset(token: string, newPassword: string) {
  // token 来自通知中的重置链接；成功后重新登录。
  return iam.user.confirmPasswordReset(token, newPassword)
}

async function resetByAdministrator(userId: string, newPassword: string) {
  // 管理权限校验在服务端入口完成；不接受未经校验的 userId。
  return iam.user.adminResetPassword(userId, newPassword)
}
```

キャッシュ削除が失敗を返しても、確定した新パスワードと資格情報世代は巻き戻しません。旧資格情報で自動再試行せず、再ログインしてください。

### 一度限りのチケット — `iam.ticket`

WebSocket URL など Bearer Token を付けられない経路向けの短期チケットです。認証済み HTTP リクエストで、主体・用途・操作に結び付けて発行します。サーバーは初回検証時に**アトミックに消費**し、一度のみ有効です。

```ts
import type { Session } from '@h-ai/iam'
import { iam } from '@h-ai/iam'

async function issueAudioTicket(session: Session) {
  // session 已通过当前授权校验，签发前还须验证该操作及资源范围。
  const issued = await iam.ticket.issue({
    subjectId: session.userId,
    purpose: 'ai-audio',
    grant: { operation: 'transcribe', model: 'whisper-1' },
    ttlMs: 30_000,
  })
  if (!issued.success)
    return issued
  // 仅将短期票据交给客户端，不把长期 accessToken 放进 URL。
  return issued
}

async function consumeAudioTicket(ticket: string) {
  const consumed = await iam.ticket.consume(ticket, { purpose: 'ai-audio' })
  if (!consumed.success)
    return consumed
  // 按 grant 校验本次建连操作/资源；票据本身不自动读取当前 RBAC。
  return consumed
}
```

特徴：暗号学的に安全な乱数、TTL、アトミックな単回消費（並行消費では 1 件のみ成功）、用途の固定による別用途の再使用防止。

### 設定による認証画面

パスワードログインの送信項目は `identifier` と `password` のみです。`AuthPanel` は `LoginForm` の `username` を `identifier` に変換します。有効期間はサーバーの `session.maxAge` / `session.refreshTokenMaxAge` で設定し、フォームにログインごとの永続セッション選択肢はありません。

`iam.publicConfig` とクライアントの HTTP `client.iam.auth.publicConfig()` は秘密情報を含まない設定だけを公開し、実際に利用可能な認証方式を表示します。`login.password/otp/ldap`、`otp.email/sms`、`register.enabled/defaultEnabled`、`passwordReset.enabled/mode/resetUrl` と規約表示を個別に設定できます。`ui` はカード/分割レイアウト、タイトル、説明、ブランド、Logo、画像を指定します。LDAP は任意で既定は無効です。既定クライアントを選択する時だけ ldapts を追加するか、独自ファクトリを注入します。

任意の Reach を選択した場合、reldb/cache/Reach の初期化後、`iam.init({ ...settings, reach })` を呼び出します。`otp_email`、`otp_sms`、`password_reset`、`password_reset_sms` テンプレートを対応する送信 Provider に接続します。明示的なコールバックは既定動作を上書きします。Console はメタデータだけを記録するため、実際の配送には SMTP、SMS または HTTP サービスが必要です。送信失敗はエラーになります。

SvelteKit は `kit.auth.createApi(iam)` と匿名用の `kit.auth.publicPaths` を使用し、Cookie 認証のフォームには `kit.client.createAuthActions()` を使用します。HTTP クライアントは `apiClient.createAuthActions(client)` により安全な設定済みストレージに Token を保存します。`AuthPanel` に設定と actions を渡すと、ログイン、登録、パスワード復旧を利用できます。`LoginForm` は複数方式と再送間隔を、パスワードフォームは完全な `passwordPolicy` を受け取ります。管理者は権限を検証した上で `iam.user.createUser()` を使用できます。

規約は入力を保持したまま Modal で開きます。URL のページは iframe 埋め込みを許可する必要があり、スクリプトを無効にし別ウィンドウ表示も用意します。LoginForm/RegisterForm は `header/extraFields/footer`、AuthPanel は `loginHeader/loginFields/loginFooter` と `registerHeader/registerFields/registerFooter` を提供します。追加フィールドはアプリの状態と actions で処理します。[UI の使い方](../ui/README.ja.md) を参照してください。

全ノードで同じ DB と Redis を共有します。Memory は単一プロセスのテスト用です。OTP のコード・試行回数・再送間隔は単一キーの CAS で公開・消費し、旧世代の競合を拒否します。消費後も再送制限を保持します。リセットの hash・期限・試行回数・resetVersion はユーザーの DB 行に保存し、ポリシー違反も計数します。最終 SQL が条件を検証してパスワード変更・Token 消費・credentialVersion 更新を同時に行い、新 Token・後続試行・無効化・期限切れ後の遅延書込を拒否します。リセット要求は resetVersion のみ進め、改密成功時に credentialVersion を進めます。認証で取得した資格情報世代を保持し、セッション作成・認証・更新で DB の現世代を照合するため、キャッシュ削除失敗でも旧会話を許可しません。通知は公開成功後に実行し、第3引数 { expiresAt, idempotencyKey } の安定キーをアプリと Reach Provider が永続的に重複排除します。例外・タイムアウトは送達済みの可能性があるため結果不明とし、自動再送や公開済み資格情報の巻き戻しはしません。外部副作用の厳密な一回実行には受信側の冪等性が必要です。

標準 HTTP 入口は `GET /auth/config`、`POST /auth/login/ldap`、`POST /auth/password-reset/request`、`POST /auth/password-reset/confirm` です。セキュリティエラーは `SECURITY_BUSY (hai:iam:023)` と `PASSWORD_RESET_DISABLED (hai:iam:024)` です。`ldap` などの任意項目は YAML に宣言してから環境変数で上書きするか、`HAI_IAM` の JSON 値でモジュール設定全体を置き換えます。既存項目には `HAI_IAM_LOGIN_OTP` などを使用できます。

`passwordReset.mode` は `email`（既定、`password_reset`）または `phone`（`password_reset_sms`）を選び、公開設定に応じて復旧フォームが入力欄を切り替えます。

#### Markdown の規約

`agreements.userAgreementMarkdown` と `privacyPolicyMarkdown` で設定から直接本文を読み込みます。YAML の `|` は段落と改行を保持します。Modal は安全な MarkdownRenderer を再利用し、生 HTML、スクリプト、コードツールを無効にします。同じ規約に本文と URL を指定した場合は本文を優先し、URL は任意の外部表示リンクとして使用します。URL のみの場合は隔離 iframe で表示します。

```yaml
agreements:
  showOnRegister: true
  showOnLogin: false
  userAgreementMarkdown: |
    # 用户协议

    **账户使用条款**

    - 请妥善保管账户凭据。
  privacyPolicyMarkdown: |
    # 隐私政策

    注册资料用于账户管理，会话信息用于身份认证。
  # 可选 URL；同主题同时配置 Markdown 和 URL 时，弹窗优先显示 Markdown。
  # userAgreementUrl: https://example.com/terms
  # privacyPolicyUrl: https://example.com/privacy
```

### エラー処理

すべての操作は `HaiResult<T>` を返し、`HaiIamError` で分岐します：

```ts
import { HaiIamError, iam } from '@h-ai/iam'

const result = await iam.auth.login({ identifier: 'admin', password: 'wrong' })
if (!result.success) {
  if (result.error.code === HaiIamError.INVALID_CREDENTIALS.code) {
    // 用户名或密码错误
  }
}
```

会話と refresh 消費状態を `hai:iam:sessions:{SHA256(userId)}` のバージョン付き文書にまとめ、独立した対応キーと索引を廃止します。Bearer Token は認証には使えない分区ヒントと256ビットの乱数を含み、クライアントは不透明な文字列として扱います。更新時は Session.version を再検証します。Memory は単一プロセスのテスト用で、本番は全ノードが Redis（Cluster 対応）を共有します。競合は最新状態から再試行し、上限で CONFLICT を返します。応答喪失で結果が不明なら認証を拒否し再ログインします。すべての会話は同じユーザー索引で管理されます。

`iam.session.update(token, patch, expectedVersion)` は読み取った Session.version が必須です。旧版は CONFLICT、失効 Token は SESSION_NOT_FOUND を返し、新しい状態を上書きしません。自動延長の時刻だけの更新は内容版を変更せず、通常の並行リクエストを許容します。権限一括更新は最初の Token/版集合に限定し、後続ログインに古い値を適用しません。

## スキーマと認証情報の通知

RelDB 初期化後の `migrateIam({ dryRun: true })` は読み取り専用です。iam.init は対応する認証・リセット列を補い、ユーザー、パスワードと権限を保持します。事前に旧書込を停止しバックアップしてください。安全世代のない旧セッションは再ログインが必要で、認可復元のため世代を戻してはいけません。既定 Reach 通知は sensitive/expiresAt/idempotencyKey で平文保存や遅延再送を防ぎます。独自コールバックも同じ期限と保護を守ってください。

## 開発とテスト

公開例は `@h-ai/iam` を使用し、既定値を省略できる `IamConfigInput` と解析済み `IamConfig` を区別します。依存を先に初期化し、`HaiResult.success` を確認し、会話更新には読取時の `version`、通知には永続的な冪等キーを使います。「模块内部上下文」の戦略・倉庫例はアプリ向け深い import の契約ではありません。チェッカーは型だけを確認し、Redis/DB・LDAP・配送の動作には対応する統合テストが必要です。[JSDoc 規約](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)も参照してください。

```bash
pnpm --filter @h-ai/iam typecheck
pnpm --filter @h-ai/iam lint
pnpm --filter @h-ai/iam build
pnpm --filter @h-ai/iam test
node scripts/check-module-jsdoc.mjs --package iam
```

## ライセンス

Apache-2.0
