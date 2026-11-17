# @h-ai/iam API リファレンス

<!-- translation: partial -->

[原文（中国語）](iam.md) · [設定](../configuration/iam.ja.md) · [データ構造](../data/iam.ja.md)

<a id="quick-start"></a>

## クイックスタート

認証リクエストを受ける前にサーバーの IAM を初期化します。アプリは本人を確認してから認可を行い、管理操作では信頼できる ID を使います。

```bash
pnpm add @h-ai/iam
```

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

<a id="api-reference"></a>

## API 一覧

各例は IAM が初期化済みで、対象の利用者やリソースに対する権限をアプリ側で確認済みであることを前提とします。`HaiResult` では `success` を確認してから `data` または `error` を読みます。成功時の列は `data` の型です。`void` の場合は取得する値はありません。`?` は任意の引数を示します。

### ログインと登録

設定で有効にした認証方式を使います。`context` は任意で、サーバーで確認済みのリクエスト情報を渡します。成功すると利用者、トークン、ロール、権限が返ります。

| API | 引数 | 成功時の値 | 例 |
| --- | --- | --- | --- |
| `iam.auth.login` | credentials, context? | `AuthResult` | `await iam.auth.login({ identifier, password })` |
| `iam.auth.loginWithOtp` | credentials, context? | `AuthResult` | `await iam.auth.loginWithOtp({ identifier, code })` |
| `iam.auth.loginWithLdap` | credentials, context? | `AuthResult` | `await iam.auth.loginWithLdap({ username, password })` |
| `iam.auth.loginWithApiKey` | credentials, context? | `AuthResult` | `await iam.auth.loginWithApiKey({ key: rawKey })` |
| `iam.auth.registerAndLogin` | options, context? | `AuthResult` | `await iam.auth.registerAndLogin({ username, password })` |

### チャレンジ、検証、再認証

実行する操作のチャレンジを作成します。セッションの確認や終了にはアクセストークンを渡します。再認証チケットは発行時に指定した操作にだけ使います。

| API | 引数 | 成功時の値 | 例 |
| --- | --- | --- | --- |
| `iam.auth.createCaptcha` | input | `IamCaptchaChallenge` | `await iam.auth.createCaptcha({ operation: 'login' })` |
| `iam.auth.sendOtp` | identifier, options? | `{ expiresAt: Date; }` | `await iam.auth.sendOtp(identifier)` |
| `iam.auth.verifyToken` | accessToken | `Session` | `await iam.auth.verifyToken(accessToken)` |
| `iam.auth.logout` | accessToken | `void` | `await iam.auth.logout(accessToken)` |
| `iam.auth.reauthenticate` | accessToken, password, operation | `IssuedTicket` | `await iam.auth.reauthenticate(accessToken, password, 'users:delete')` |
| `iam.auth.checkSensitiveOperation` | accessToken, operation, ticket | `void` | `await iam.auth.checkSensitiveOperation(accessToken, 'users:delete', operationTicket)` |

### 利用者情報

本人用のメソッドには呼び出し元のアクセストークンを渡します。管理用のメソッドを呼ぶ前に対象アカウントへの操作権限を確認します。任意の取得オプションでロールを含め、一覧オプションでページを指定できます。

| API | 引数 | 成功時の値 | 例 |
| --- | --- | --- | --- |
| `iam.user.createUser` | options | `RegisterResult` | `await iam.user.createUser({ username, password })` |
| `iam.user.register` | options | `RegisterResult` | `await iam.user.register({ username, password })` |
| `iam.user.inviteUser` | options | `RegisterResult` | `await iam.user.inviteUser({ username, email })` |
| `iam.user.getUser` | userId, options? | `User \| null` | `await iam.user.getUser(userId)` |
| `iam.user.getUsers` | userIds, options? | `User[]` | `await iam.user.getUsers([userId], { include: ['roles'] })` |
| `iam.user.listUsers` | options? | `PaginatedResult<User>` | `await iam.user.listUsers({ page: 1, pageSize: 20 })` |
| `iam.user.getCurrentUser` | accessToken | `User` | `await iam.user.getCurrentUser(accessToken)` |
| `iam.user.updateCurrentUser` | accessToken, data | `User` | `await iam.user.updateCurrentUser(accessToken, { displayName: 'Alice' })` |
| `iam.user.updateUser` | userId, data | `User` | `await iam.user.updateUser(userId, { displayName: 'Alice' })` |
| `iam.user.deleteUser` | userId | `void` | `await iam.user.deleteUser(userId)` |

### パスワードとアカウントの管理

既存の認証情報を変更する際は現在のパスワードが必要です。再設定リンクと管理者による再設定には、それぞれ専用のメソッドを使います。アカウントの走査は対象となった利用者の件数を返します。

| API | 引数 | 成功時の値 | 例 |
| --- | --- | --- | --- |
| `iam.user.adminResetPassword` | userId, newPassword | `void` | `await iam.user.adminResetPassword(userId, newPassword)` |
| `iam.user.renewPassword` | input | `void` | `await iam.user.renewPassword({ identifier, password, newPassword })` |
| `iam.user.changePassword` | userId, oldPassword, newPassword | `void` | `await iam.user.changePassword(userId, oldPassword, newPassword)` |
| `iam.user.changeCurrentUserPassword` | accessToken, oldPassword, newPassword | `void` | `await iam.user.changeCurrentUserPassword(accessToken, oldPassword, newPassword)` |
| `iam.user.requestPasswordReset` | identifier, options? | `void` | `await iam.user.requestPasswordReset(identifier)` |
| `iam.user.confirmPasswordReset` | token, newPassword | `void` | `await iam.user.confirmPasswordReset(resetToken, newPassword)` |
| `iam.user.validatePassword` | password | `void` | `iam.user.validatePassword(newPassword)` |
| `iam.user.scanInactiveAccounts` | なし | `number` | `await iam.user.scanInactiveAccounts()` |

### 認可情報の取得

サーバーで確認済みの利用者 ID またはロール ID を渡します。一括取得は、該当する ID をキーにしたマップを返します。

| API | 引数 | 成功時の値 | 例 |
| --- | --- | --- | --- |
| `iam.authz.getUserAuthorization` | userId | `Pick<Session, "roles" \| "permissions">` | `await iam.authz.getUserAuthorization(userId)` |
| `iam.authz.checkPermission` | userId, permission | `boolean` | `await iam.authz.checkPermission(userId, 'orders:read')` |
| `iam.authz.getUserPermissions` | userId | `Permission[]` | `await iam.authz.getUserPermissions(userId)` |
| `iam.authz.getUserRoles` | userId | `Role[]` | `await iam.authz.getUserRoles(userId)` |
| `iam.authz.getUserRolesForMany` | userIds | `Map<string, Role[]>` | `await iam.authz.getUserRolesForMany([userId])` |
| `iam.authz.getRolePermissionsForMany` | roleIds | `Map<string, Permission[]>` | `await iam.authz.getRolePermissionsForMany([roleId])` |

### ロールと権限の割り当て

個別に割り当てや解除を行うか、`syncRoles` で利用者のロールを入れ替えます。複数の書き込みをまとめる場合は、既存のトランザクションを `tx` に渡します。

| API | 引数 | 成功時の値 | 例 |
| --- | --- | --- | --- |
| `iam.authz.assignRole` | userId, roleId, tx? | `void` | `await iam.authz.assignRole(userId, roleId)` |
| `iam.authz.removeRole` | userId, roleId, tx? | `void` | `await iam.authz.removeRole(userId, roleId)` |
| `iam.authz.syncRoles` | userId, roleIds, tx? | `void` | `await iam.authz.syncRoles(userId, [roleId])` |
| `iam.authz.assignPermissionToRole` | roleId, permissionId, tx? | `void` | `await iam.authz.assignPermissionToRole(roleId, permissionId)` |
| `iam.authz.removePermissionFromRole` | roleId, permissionId, tx? | `void` | `await iam.authz.removePermissionFromRole(roleId, permissionId)` |

### ロールと権限の管理

定義を作成、取得、一覧表示、更新、削除します。対象が見つからない場合、単体取得は `null` を返します。一覧ではオプションでページを指定できます。

| API | 引数 | 成功時の値 | 例 |
| --- | --- | --- | --- |
| `iam.authz.createRole` | role, tx? | `Role` | `await iam.authz.createRole({ code: 'editor', name: 'Editor', description: null, isSystem: false })` |
| `iam.authz.getRole` | roleId | `Role \| null` | `await iam.authz.getRole(roleId)` |
| `iam.authz.getRoleByCode` | code | `Role \| null` | `await iam.authz.getRoleByCode('editor')` |
| `iam.authz.getAllRoles` | options? | `PaginatedResult<Role>` | `await iam.authz.getAllRoles({ page: 1, pageSize: 20 })` |
| `iam.authz.getRoleUserCounts` | roleIds | `Map<string, number>` | `await iam.authz.getRoleUserCounts([roleId])` |
| `iam.authz.updateRole` | roleId, data, tx? | `Role` | `await iam.authz.updateRole(roleId, { name: 'Editor' })` |
| `iam.authz.deleteRole` | roleId, tx? | `void` | `await iam.authz.deleteRole(roleId)` |
| `iam.authz.createPermission` | permission, tx? | `Permission` | `await iam.authz.createPermission({ code: 'orders:read', name: 'Read orders', type: 'api' })` |
| `iam.authz.getPermission` | permissionId | `Permission \| null` | `await iam.authz.getPermission(permissionId)` |
| `iam.authz.getPermissionByCode` | code | `Permission \| null` | `await iam.authz.getPermissionByCode('orders:read')` |
| `iam.authz.getAllPermissions` | options? | `PaginatedResult<Permission>` | `await iam.authz.getAllPermissions({ page: 1, pageSize: 20 })` |
| `iam.authz.deletePermission` | permissionId, tx? | `void` | `await iam.authz.deletePermission(permissionId)` |
| `iam.authz.getRolePermissions` | roleId | `Permission[]` | `await iam.authz.getRolePermissions(roleId)` |

### 機密操作のポリシー

追加の本人確認が必要な操作を現在の RBAC 設定から取得します。`operation` を省略すると全操作が対象になります。RBAC が無効なら空の一覧が返ります。権限に操作一覧を設定するか、空の一覧を渡してデータベース側のルールだけを解除できます。

| API | 引数 | 成功時の値 | 例 |
| --- | --- | --- | --- |
| `iam.authz.getSensitiveOperations` | operation? | `string[]` | `await iam.authz.getSensitiveOperations('users:delete')` |
| `iam.authz.setPermissionSensitiveOperations` | permissionId, operations | `void` | `await iam.authz.setPermissionSensitiveOperations(permissionId, ['users:delete'])` |

### セッション

認証情報の確認と失効、リフレッシュトークンによるトークンペアの更新を行います。楽観的に更新する際は直近に読み取ったバージョンを渡してください。`create` にはサーバーで検証済みの入力を渡します。

| API | 引数 | 成功時の値 | 例 |
| --- | --- | --- | --- |
| `iam.session.create` | options | `Session` | `await iam.session.create(trustedSessionInput)` |
| `iam.session.get` | accessToken | `Session \| null` | `await iam.session.get(accessToken)` |
| `iam.session.verifyToken` | accessToken | `Session` | `await iam.session.verifyToken(accessToken)` |
| `iam.session.update` | accessToken, data, expectedVersion | `void` | `await iam.session.update(accessToken, sessionPatch, expectedVersion)` |
| `iam.session.delete` | accessToken | `void` | `await iam.session.delete(accessToken)` |
| `iam.session.deleteByUserId` | userId | `number` | `await iam.session.deleteByUserId(userId)` |
| `iam.session.refresh` | refreshToken | `TokenPair` | `await iam.session.refresh(refreshToken)` |
| `iam.session.revokeRefresh` | refreshToken | `void` | `await iam.session.revokeRefresh(refreshToken)` |
| `iam.session.patchUserSessions` | userId, updates | `void` | `await iam.session.patchUserSessions(userId, sessionFieldUpdates)` |

### API キー

キーの平文は作成時にのみ返ります。安全な場所に保存してください。キー情報の取得、提出されたキーの検証、キーの失効ができます。

| API | 引数 | 成功時の値 | 例 |
| --- | --- | --- | --- |
| `iam.apiKey.createApiKey` | userId, options | `CreateApiKeyResult` | `await iam.apiKey.createApiKey(userId, { name: 'reporting', scopes: ['orders:read'] })` |
| `iam.apiKey.listApiKeys` | userId, options? | `PaginatedResult<ApiKey>` | `await iam.apiKey.listApiKeys(userId, { page: 1, pageSize: 20 })` |
| `iam.apiKey.getApiKey` | keyId | `ApiKey \| null` | `await iam.apiKey.getApiKey(keyId)` |
| `iam.apiKey.revokeApiKey` | keyId | `void` | `await iam.apiKey.revokeApiKey(keyId)` |
| `iam.apiKey.verifyApiKey` | rawKey | `ApiKey` | `await iam.apiKey.verifyApiKey(rawKey)` |

### 一回用チケット

用途と主体を指定して短時間だけ有効なチケットを発行します。想定した関連情報とともに消費します。消費済みのチケットは再利用できません。

| API | 引数 | 成功時の値 | 例 |
| --- | --- | --- | --- |
| `iam.ticket.issue` | options | `IssuedTicket` | `await iam.ticket.issue(ticketInput)` |
| `iam.ticket.consume` | ticket, options | `ConsumedTicket` | `await iam.ticket.consume(operationTicket, ticketBinding)` |

### 公開設定とライフサイクル

公開設定にディレクトリ、データベース、通知の認証情報は含まれません。`iam.isRegisterEnabled` を参照する前に `iam.isInitialized` を確認してください。初期化前と、公開登録を明示的に無効にしていない場合に `true` になります。

| API | 引数 | 成功時の値 | 例 |
| --- | --- | --- | --- |
| `iam.init` | config | `void` | `await iam.init({})` |
| `iam.close` | なし | `Promise<void>` | `await iam.close()` |
| `iam.isInitialized` | なし | `boolean` | `iam.isInitialized` |
| `iam.isRegisterEnabled` | なし | `boolean` | `iam.isRegisterEnabled` |
| `iam.getPublicConfig` | なし | `IamPublicConfig` | `await iam.getPublicConfig()` |

追加の設定項目や利用例は[中国語リファレンス](iam.md)に掲載しています。
