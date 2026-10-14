# @h-ai/iam

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/audit](../audit/README.ja.md) · [@h-ai/cache](../cache/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md) · [@h-ai/reach](../reach/README.ja.md)

共通の `iam` オブジェクトで認証、セッション、認可、ユーザー管理を提供する Identity and Access Management モジュールです。

## 機能

| 機能                           | 説明                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| **認証**                       | パスワード、OTP（メール・SMS コード）、LDAP、API Key の認証方式                           |
| **セッション**                 | 状態を持つセッション（ランダム access token + キャッシュ、任意の自動延長）                |
| **認可**                       | RBAC のロール・権限管理（DB + キャッシュ、ワイルドカード照合）                            |
| **ユーザー管理**               | 登録、検索、更新、パスワードリセット、管理者によるリセット                                |
| **API Key**                    | scope・期限付き API Key の作成、失効、検証                                                |
| **一度限りのチケット**         | Bearer Token を付けられない WebSocket などのための短期チケット（発行 / アトミックな消費） |
| **フロントエンドクライアント** | 独立フロントエンド向けの HTTP API 契約                                                    |

## インストール

```bash
pnpm add @h-ai/iam
```

## 依存関係

- `@h-ai/reldb`：ユーザー・ロール・権限の永続化。**iam.init() より先に初期化**。
- `@h-ai/cache`：セッション・OTP・リセット Token・権限のキャッシュ。**iam.init() より先に初期化**。
- `@h-ai/crypto`：内部で使用するパスワードハッシュ。自動初期化。
- `@h-ai/audit`：主要な RBAC 操作の監査記録。

- `@h-ai/reach`：**任意**。アプリがインストール、初期化、注入して通知テンプレートを使用します。独自送信コールバックでは不要です。
- `ldapts`：**任意**。LDAP を明示的に有効化し、`ldapClientFactory` がない場合だけ読み込みます。

## 任意の LDAP と通知連携

パスワード認証、ユーザー管理、RBAC は LDAP/Reach なしで動作します。両方とも任意の peer dependency で、必要な連携だけをインストールします。以下は reldb/cache 初期化後の起動・認証関数内の例で、`username/password` は検証済み入力です。

### LDAP / Active Directory

既定クライアントは `pnpm add ldapts` で追加し、`login.ldap: true` と接続設定を明示します。接続設定だけでは LDAP は有効になりません。SDK なしで既定クライアントを有効にすると初期化が設定エラーを返します。

```yaml
# config/_iam.yml（启动前设置 LDAP_BIND_PASSWORD）
login:
  ldap: true
ldap:
  url: ldaps://ldap.example.com:636
  bindDn: cn=service,dc=example,dc=com
  bindPassword: '${LDAP_BIND_PASSWORD}'
  searchBase: ou=users,dc=example,dc=com
  searchFilter: '(uid={{username}})'
  usernameAttribute: uid
  emailAttribute: mail
  displayNameAttribute: cn
  connectTimeout: 5000
```

`ldaps://` は TLS、`ldap://` と `useTls: true` は StartTLS を使用します。Active Directory では `searchFilter: "(sAMAccountName={{username}})"` と `usernameAttribute: sAMAccountName` を指定できます。検索前に入力をエスケープします。初回ログインはローカルユーザーを同期して既定ロールを割り当て、無効化とロックも適用します。`ldapSyncUser: false` または `bind/search/unbind` を HaiResult で返す `ldapClientFactory` を注入できます。独自ファクトリでは ldapts は不要です。

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

### 任意の Reach による自動送信

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

### 独自メール・SMS 送信

`onOtpSendEmail`、`onOtpSendSms`、`onPasswordResetRequest` を注入して既存の送信サービスを使用します。必要なものだけ実装でき、Reach と併用する場合は明示コールバックを優先します。例のサービスはアプリ実装で、送信成功時のみ Promise を解決します。HaiResult を返すサービスは `success` を検査し、失敗時はコールバック内で例外にします。IAM は例外を捕捉して業務エラーを返し、コードや Token、送信内部情報をユーザーに表示しません。

```ts
import { iam } from '@h-ai/iam'
import { mailService, smsService } from './notifications.js'

// mailService/smsService 为应用已有的发送服务；不需要安装或初始化 Reach。
// 调用方须检查服务投递结果，失败时拒绝 Promise，不能吞掉错误。
const initialized = await iam.init({
  otp: { email: true, sms: true },
  onOtpSendEmail: async (email, code) => {
    await mailService.send({ to: email, subject: 'Verification code', text: code })
  },
  onOtpSendSms: async (phone, code) => {
    await smsService.send({ to: phone, code })
  },
  passwordReset: { mode: 'email' },
  onPasswordResetRequest: async (user, token, expiresAt) => {
    if (!user.email)
      throw new Error('Reset recipient unavailable')
    const url = new URL('https://app.example.com/auth/reset-password')
    url.searchParams.set('token', token)
    await mailService.send({ to: user.email, subject: 'Password reset', text: url.toString(), expiresAt })
  },
})
if (!initialized.success)
  return initialized
```

## クイックスタート

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

## 設計

### アーキテクチャ

IAM は `iam.init()` / `iam.close()` で状態を管理する**ライフサイクル付きシングルトン**です。内部の 5 つのサブモジュールを依存順に初期化します：

```
iam.init()
  ├─ session  （キャッシュによるセッション、DB 依存なし）
  ├─ authz    （RBAC ロール・権限、DB + キャッシュ）
  ├─ authn    （認証、session + authz に依存）
  ├─ user     （ユーザー管理、session + authz + passwordStrategy に依存）
  └─ seed     （初期データ、authz に依存）
```

各サブモジュールは class ではなく**ファクトリー + クロージャー**（`createSessionOperations(deps)` など）で作成し、getter で `iam.auth` / `iam.user` / `iam.authz` / `iam.session` / `iam.apiKey` として公開します。

初期化前のサブモジュール呼び出しは `NotInitializedKit` Proxy により `NOT_INITIALIZED` を返します。

### データの保存先

| データ種別                                        | 保存先                                  | 説明                                                                                                                          |
| ------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ユーザー、ロール、権限、関連付け、API Key         | DB（基本 5、任意の API Key 1 テーブル） | `hai_iam_users`、`hai_iam_roles`、`hai_iam_permissions`、`hai_iam_role_permissions`、`hai_iam_user_roles`、`hai_iam_api_keys` |
| セッション（accessToken → Session）               | キャッシュ                              | TTL 付き、任意の自動延長                                                                                                      |
| Token 対応（refreshToken → userId + accessToken） | キャッシュ                              | 独立 key、更新後に旧 Token を即時無効化                                                                                       |
| OTP コード                                        | キャッシュ                              | TTL + 試行回数制限                                                                                                            |
| パスワードリセット Token                          | キャッシュ                              | TTL + 最大検証回数                                                                                                            |
| API Key                                           | DB                                      | `hai_iam_api_keys`。平文は保存せず hash のみ。接頭辞で候補検索                                                                |

---

### 認証（authn）— `iam.auth`

#### 主要な型

- **`AuthnOperations`**：認証操作。`login` / `loginWithOtp` / `loginWithLdap` / `loginWithApiKey` / `logout` / `verifyToken` / `sendOtp` / `registerAndLogin`。
- **`AuthStrategy`**：認証方式のインターフェース（`type` + `authenticate` + `challenge?`）。パスワード・OTP・LDAP・API Key の 4 実装。
- **`AuthResult`**：ユーザー情報、`TokenPair`（accessToken + refreshToken）、ロール・権限を含むログイン結果。
- **`Credentials`**：`{ type: 'password' | 'otp' | 'ldap' | 'apikey' }` と各方式の認証情報を組み合わせた共通の共用体型。

#### 主要な処理

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
  → 自動延長モードなら TTL を延長
  → 現在のユーザー状態・ロール JOIN・権限一括検索（ロールなしなら権限検索を省略）
  → 無効ユーザー・DB 読取失敗は拒否し、API Key scope を再適用
  → 現在の Session を返す（userId、roles、permissions）
```

#### 使用方法

`authz.createRole({ ..., permissionIds })` と `authz.updateRole(id, { ..., permissionIds })` は、同じトランザクションでロールと権限集合全体を保存し、途中の失敗はすべてロールバックします。`permissionIds: []` は消去、省略は維持、重複 ID は除去、不明な権限は失敗です。並行更新は最後にコミットした完全な集合を採用し、集合を合成しません。自動管理のコミット後はユーザーセッションを同期し、外部トランザクションでは呼び出し元がコミット後に同期します。Admin Console も直接この API を使い、分割更新や補償削除は行いません。

```ts
// 密码登录
const result = await iam.auth.login({ identifier: 'admin', password: 'Password123' })

// OTP 登录
await iam.auth.sendOtp('user@example.com')
const result = await iam.auth.loginWithOtp({ identifier: 'user@example.com', code: '123456' })

// LDAP 登录（内置客户端，可选注入 ldapClientFactory）
const result = await iam.auth.loginWithLdap({ username: 'jdoe', password: 'pass' })

// API Key 登录（需启用 login.apikey: true）
const result = await iam.auth.loginWithApiKey({ key: 'hai_xxxx...' })

// 验证令牌
const session = await iam.auth.verifyToken(accessToken)

// 注册并登录（一站式）
const result = await iam.auth.registerAndLogin({ username: 'new', password: 'Pass123' })
```

#### 注意点

- **タイミング攻撃対策**：未存在ユーザーにも dummy password hash を実行し、応答時間をそろえます。
- **アカウントロック**：連続 `maxLoginAttempts` 回の失敗で `lockoutDuration` 秒ロック。
- **方式ごとの有効化**：`login.password` / `login.otp` / `login.ldap` / `login.apikey` で制御。
- **OTP の安全性**：rejection sampling で剰余偏りを除去、定時間比較でタイミング攻撃を防ぎ、`resendInterval` で頻度制限。

---

### セッション（session）— `iam.session`

#### 主要な型

- **`SessionOperations`**：`create` / `get` / `verifyToken` / `update` / `delete` / `deleteByUserId` / `refresh` / `revokeRefresh` / `patchUserSessions`。
- **`Session`**：userId、roles、permissions、accessToken、期限などを含むセッション。
- **`TokenPair`**：Token のペア。`{ accessToken, refreshToken, expiresIn, tokenType: 'Bearer' }`。

#### 主要な処理

**Token 更新（Rotation）：**

```
refresh(refreshToken)
  → キャッシュから refreshToken → { userId, accessToken } を取得
  → accessToken で旧 session を取得
  → 旧 refreshToken を削除（即時無効化で再使用防止）
  → 旧 accessToken の session を削除
  → 旧ユーザー context で新 session を作成
  → 新 TokenPair を返す
```

**単一端末のログイン：**

```
create(options) [singleDevice=true]
  → user→tokens の対応から既存の全 Token を削除
  → 新 accessToken + refreshToken を生成
  → session をキャッシュへ保存
```

#### 使用方法

```ts
// 创建会话（通常由 login 内部调用）
const session = await iam.session.create({
  userId: 'user-id',
  username: 'admin',
  roles: ['admin'],
  permissions: ['user:read', 'user:write'],
})

// 验证令牌
const session = await iam.session.verifyToken(accessToken)

// 刷新令牌
const newTokens = await iam.session.refresh(refreshToken)

// 强制下线
await iam.session.deleteByUserId(userId)
```

#### 注意点

- **キャッシュのみの保存**：Memory は再起動時に消失します。共有 Redis のセッションは IAM サービス再起動後も TTL または失効まで保持します。
- **自動延長**：`sliding: true` なら各 `get()` で TTL を延長。
- **Refresh Rotation**：旧 refreshToken は一度の使用で無効化。再使用は漏洩の兆候。
- **Token 強度**：256-bit の暗号学的乱数（`crypto.getRandomValues(new Uint8Array(32))`）、base64url 形式。

---

### 認可（authz）— `iam.authz`

ロール一覧は `iam.authz.getRoleUserCounts(roleIds)` の 1 回の集計で現在のページの実際の所属人数を取得し、`HaiResult<Map<string, number>>` を返します。関連がなければ 0、検索失敗は読み込みエラーを表示し、0 件の統計を作りません。

#### 主要な型

- **`AuthzOperations`**：ロール・権限 CRUD、ロールと権限・ユーザーとロールの割り当て、権限確認。
- **`Role`**：ロール。`{ id, code, name, description, isSystem }`。
- **`Permission`**：権限。`{ id, code, name, type, resource, action }`、type は `menu` / `api` / `button`。
- **`PermissionType`**：権限種別の enum。

#### 主要な処理

**権限確認（`checkPermission`）：**

```
checkPermission(userId, permission)
  → RBAC 無効なら true
  → ユーザーのロール一覧を DB から取得
  → 最高管理者を確認（キャッシュの superAdminRoleId）、あれば true
  → 各ロールの権限を取得（キャッシュ優先、miss は DB から取得して保存）
  → 厳密・ワイルドカード照合（`admin:*` は `admin:read` に一致）
  → true / false を返す
```

**ロール・権限変更後のセッション同期：**

```
assignPermissionToRole(roleId, permId)
  → 関連を DB に保存
  → ロール権限のキャッシュを消去
  → 所属ユーザー検索 → 各権限を再解決 → 活動中 session を更新
  （best-effort：失敗は log.error のみで割り当て結果に影響しない）
```

#### 使用方法

```ts
// 角色管理
const role = await iam.authz.createRole({ code: 'editor', name: '编辑' })
const roles = await iam.authz.getAllRoles({ page: 1, pageSize: 20 })

// 权限管理
const perm = await iam.authz.createPermission({
  code: 'article:publish',
  name: '发布文章',
  type: 'api',
  resource: 'article',
  action: 'publish',
})

// 分配与检查
await iam.authz.assignRole(userId, role.data.id)
await iam.authz.assignPermissionToRole(role.data.id, perm.data.id)
const allowed = await iam.authz.checkPermission(userId, 'article:publish')

// 批量同步角色
await iam.authz.syncRoles(userId, [roleId1, roleId2])
```

#### 注意点

- **ワイルドカード**：`admin:*` は `admin:read`、`admin:write:detail` などに一致。1 つの `*` がコロン以降全体に一致します。
- **最高管理者**：`rbac.superAdminRole`（既定 `super_admin`）はすべての権限を持ちます。
- **トランザクション**：`deleteRole` / `deletePermission` は DB トランザクションで関連を削除してから本体を削除。
- **セッション同期**：キャッシュ更新は best-effort です。保護されたリクエストは `iam.auth.verifyToken` で現在の状態・権限を読み、読取失敗を拒否します。`iam.session.verifyToken` はスナップショット検証のみです。`iam.authz.getUserAuthorization(userId)` はロール JOIN と権限一括検索を共有します。
- **初期データ**：`seedDefaultData: true` で admin/user/guest と基本権限を冪等に作成。

---

### ユーザー管理（user）— `iam.user`

#### 主要な型

- **`UserOperations`**：登録、検索、更新、削除、パスワード変更・リセット、強度検証。
- **`User`**（公開フィールド）：`{ id, username, email, phone, displayName, avatarUrl, enabled, roles? }`。
- **`StoredUser`**：内部保存用ユーザー。`passwordHash`、`loginFailedCount`、`lockedUntil` などの機密フィールドを含みます。
- **`RegisterOptions`** / **`RegisterResult`**：登録の入力・出力。
- **`UpdateCurrentUserInput`**：現在のユーザーが変更できるフィールド（`displayName` / `avatarUrl` / `phone` / `metadata`）。

#### 主要な処理

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

#### 使用方法

```ts
// 注册
const result = await iam.user.register({
  username: 'alice',
  email: 'alice@example.com',
  password: 'Password123',
})

// 当前用户操作
const me = await iam.user.getCurrentUser(accessToken)
await iam.user.updateCurrentUser(accessToken, { displayName: '新名称' })
await iam.user.changeCurrentUserPassword(accessToken, 'oldPass', 'newPass')

// 管理操作
const users = await iam.user.listUsers({
  page: 1,
  pageSize: 20,
  search: 'alice',
  roleCode: 'editor', // ページ分割前に絞り込み、total にも反映。
  sortBy: 'createdAt',
  sortDirection: 'desc',
  include: ['roles'],
})
const batch = await iam.user.getUsers([userId1, userId2], { include: ['roles'] }) // 最大 1000 ID、重複除去・入力順維持・未存在 ID は省略。
await iam.user.updateUser(userId, { enabled: false }) // 禁用用户 → 自动清除会话
await iam.user.deleteUser(userId) // 删除用户 → 事务清除角色关联

// 密码重置
await iam.user.requestPasswordReset('alice@example.com')
await iam.user.confirmPasswordReset(token, 'NewPassword456')
await iam.user.adminResetPassword(userId, 'TempPassword123')

// 密码强度验证（同步方法）
const valid = iam.user.validatePassword('weak')
```

#### 注意点

- **`toUser()` の機密除去**：公開ユーザー情報から `passwordHash`、`loginFailedCount` などを除外。
- **セッション連動**：`deleteUser` / `updateUser({ enabled: false })` / `changePassword` / `confirmPasswordReset` は対象ユーザーの全セッションを削除。
- **列挙攻撃対策**：未登録メールへの `requestPasswordReset` はエラーでなく `ok(undefined)`。
- **validatePassword は同期**：`UserOperations` の唯一の同期メソッドで、ほかは非同期。
- **部分一致検索**：`listUsers` はユーザー名・メール・電話・表示名を検索し、LIKE のワイルドカードはエスケープ済み。
- **サーバー側の並び順**：`listUsers` は `username`、`email`、`displayName`、`enabled`、`createdAt` のみを許可リストで対応付け、既定は作成日時の降順。

---

### API Key — `iam.apiKey`

`scopes` は主体の権限との共通範囲を適用し、`*` と名前空間 `:*` に対応します。既定の空配列は本人確認のみで操作権限を付与しません。制限付き key のセッション `roles` は空で permission ガードを使用し、明示的な `*` も主体の権限を超えません。ログインは key ID に結び付き、get/verifyToken/refresh は永続状態を再確認し、失効・無効・期限切れ・DB エラーを拒否します。verifyApiKey 単独は鍵のメタデータ検証のみで、主体・操作の認可は別途必要です。

#### 主要な型

- **`ApiKeyOperations`**：`createApiKey` / `listApiKeys` / `getApiKey` / `revokeApiKey` / `verifyApiKey`。
- **`ApiKey`**（公開フィールド）：`{ id, userId, name, keyPrefix, enabled, expiresAt, scopes }`。
- **`CreateApiKeyResult`**：`{ apiKey, rawKey }`。平文の鍵を返すのは一度のみ。

#### 主要な処理

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

#### 使用方法

```ts
// 创建 API Key
const result = await iam.apiKey.createApiKey(userId, {
  name: 'CI/CD',
  expirationDays: 90,
  scopes: ['api:read'],
})
// result.data.rawKey → 明文密钥（仅此一次展示）

// 列出用户的 API Key（服务端分页）
const keys = await iam.apiKey.listApiKeys(userId, { page: 1, pageSize: 20, search: 'ci' })
// keys.data → { items, total, page, pageSize }

// 吊销
await iam.apiKey.revokeApiKey(keyId)
```

#### 注意点

- **平文は保存しない**：DB は hash のみを保存し、作成時の `rawKey` が唯一の取得機会。
- **接頭辞検索**：`keyPrefix` で候補を絞り、全テーブル走査を避けます。
- **件数制限**：ユーザーあたり最大 `maxKeysPerUser`（既定 10）件。
- **明示的有効化**：`login.apikey: true` の場合のみ初期化。

---

## その他の使い方

API 引数・エラーコード・統合パターンの詳細は中国語の Skill テンプレート（`packages/cli/templates/skills/hai-iam/SKILL.md`）を参照してください。

## フロントエンドの API 呼び出し

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

## パスワードリセット

```ts
// 请求重置（即使用户不存在也返回 ok，防止枚举）
await iam.user.requestPasswordReset('admin@example.com')

// 确认重置（校验令牌有效期和尝试次数 → 更新密码 → 清除所有会话）
const result = await iam.user.confirmPasswordReset(token, 'NewPassword456')

// 管理员重置（无需旧密码）
await iam.user.adminResetPassword(userId, 'TempPassword123')
```

## 一度限りのチケット — `iam.ticket`

WebSocket URL など Bearer Token を付けられない経路向けの短期チケットです。認証済み HTTP リクエストで、主体・用途・操作に結び付けて発行します。サーバーは初回検証時に**アトミックに消費**し、一度のみ有効です。

```ts
// 签发（已登录 HTTP 请求内）：绑定主体、用途与本次操作，30 秒过期
const issued = await iam.ticket.issue({
  subjectId: session.userId,
  purpose: 'ai-audio',
  grant: { operation: 'transcribe', model: 'whisper-1' },
  ttlMs: 30_000,
})
// issued.data.ticket 交给客户端，用于建立 WebSocket 连接

// 消费（服务端建连时）：原子单次，返回主体 + 用途 + grant
const consumed = await iam.ticket.consume(ticket, { purpose: 'ai-audio' })
if (consumed.success) {
  const { subjectId, grant } = consumed.data
  // 用 grant.operation / grant.model 交叉校验客户端请求
}
```

特徴：暗号学的に安全な乱数、TTL、アトミックな単回消費（並行消費では 1 件のみ成功）、用途の固定による別用途の再使用防止。

## 設定による認証画面

`iam.publicConfig` とクライアントの HTTP `client.iam.auth.publicConfig()` は秘密情報を含まない設定だけを公開し、実際に利用可能な認証方式を表示します。`login.password/otp/ldap`、`otp.email/sms`、`register.enabled/defaultEnabled`、`passwordReset.enabled/mode/resetUrl` と規約表示を個別に設定できます。`ui` はカード/分割レイアウト、タイトル、説明、ブランド、Logo、画像を指定します。LDAP は任意で既定は無効です。既定クライアントを選択する時だけ ldapts を追加するか、独自ファクトリを注入します。

任意の Reach を選択した場合、reldb/cache/Reach の初期化後、`iam.init({ ...settings, reach })` を呼び出します。`otp_email`、`otp_sms`、`password_reset`、`password_reset_sms` テンプレートを対応する送信 Provider に接続します。明示的なコールバックは既定動作を上書きします。Console はメタデータだけを記録するため、実際の配送には SMTP、SMS または HTTP サービスが必要です。送信失敗はエラーになります。

SvelteKit は `kit.auth.createApi(iam)` と匿名用の `kit.auth.publicPaths` を使用し、Cookie 認証のフォームには `kit.client.createAuthActions()` を使用します。HTTP クライアントは `apiClient.createAuthActions(client)` により安全な設定済みストレージに Token を保存します。`AuthPanel` に設定と actions を渡すと、ログイン、登録、パスワード復旧を利用できます。`LoginForm` は複数方式と再送間隔を、パスワードフォームは完全な `passwordPolicy` を受け取ります。管理者は権限を検証した上で `iam.user.createUser()` を使用できます。

規約は入力を保持したまま Modal で開きます。URL のページは iframe 埋め込みを許可する必要があり、スクリプトを無効にし別ウィンドウ表示も用意します。LoginForm/RegisterForm は `header/extraFields/footer`、AuthPanel は `loginHeader/loginFields/loginFooter` と `registerHeader/registerFields/registerFooter` を提供します。追加フィールドはアプリの状態と actions で処理します。[UI の使い方](../ui/README.ja.md) を参照してください。

複数ノードは同じ DB と Redis を共有する必要があります。Memory は単一プロセス専用です。ログイン失敗は DB の原子的更新で累積し、OTP の試行回数、再送間隔、単回使用は共有状態で管理します。コードの使用や試行上限によって再送制限を回避できません。リセットは共有 TTL とユーザー別ロックを使用し、ポリシー違反も試行に含め、最新 Token の成功使用は一回だけです。リセット後は旧セッションとログインロックを解除します。無効なユーザーは認証できません。

標準 HTTP 入口は `GET /auth/config`、`POST /auth/login/ldap`、`POST /auth/password-reset/request`、`POST /auth/password-reset/confirm` です。セキュリティエラーは `SECURITY_BUSY (hai:iam:023)` と `PASSWORD_RESET_DISABLED (hai:iam:024)` です。`ldap` などの任意項目は YAML に宣言してから環境変数で上書きするか、`HAI_IAM` の JSON 値でモジュール設定全体を置き換えます。既存項目には `HAI_IAM_LOGIN_OTP` などを使用できます。

`passwordReset.mode` は `email`（既定、`password_reset`）または `phone`（`password_reset_sms`）を選び、公開設定に応じて復旧フォームが入力欄を切り替えます。

### Markdown の規約

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

## エラー処理

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

## テスト

```bash
pnpm test
```

## ライセンス

Apache-2.0
