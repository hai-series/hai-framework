# @h-ai/iam API reference

<!-- translation: partial -->

[Chinese source](iam.md) · [Configuration](../configuration/iam.en.md) · [Data structures](../data/iam.en.md)

<a id="quick-start"></a>

## Quick start

Initialize the server IAM instance before accepting authentication requests. The application verifies identity before invoking authorization and uses trusted IDs for administration.

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

## API list

Examples assume that IAM is initialized and that the application has checked permissions for the target user or resource. For a `HaiResult`, check `success` before reading `data` or `error`. The success column shows the value inside `data`; `void` means there is no data to read. `?` marks an optional argument.

### Sign-in and registration

Choose the method that matches the configured credentials. `context` is optional and carries trusted request metadata. Success returns the user, tokens, roles and permissions.

| API | Arguments | Success data | Example |
| --- | --- | --- | --- |
| `iam.auth.login` | credentials, context? | `AuthResult` | `await iam.auth.login({ identifier, password })` |
| `iam.auth.loginWithOtp` | credentials, context? | `AuthResult` | `await iam.auth.loginWithOtp({ identifier, code })` |
| `iam.auth.loginWithLdap` | credentials, context? | `AuthResult` | `await iam.auth.loginWithLdap({ username, password })` |
| `iam.auth.loginWithApiKey` | credentials, context? | `AuthResult` | `await iam.auth.loginWithApiKey({ key: rawKey })` |
| `iam.auth.registerAndLogin` | options, context? | `AuthResult` | `await iam.auth.registerAndLogin({ username, password })` |

### Challenges, verification and fresh proof

Create a challenge for the intended operation. Pass the access token to validate or end a session. Bind a reauthentication ticket to the operation for which it was issued.

| API | Arguments | Success data | Example |
| --- | --- | --- | --- |
| `iam.auth.createCaptcha` | input | `IamCaptchaChallenge` | `await iam.auth.createCaptcha({ operation: 'login' })` |
| `iam.auth.sendOtp` | identifier, options? | `{ expiresAt: Date; }` | `await iam.auth.sendOtp(identifier)` |
| `iam.auth.verifyToken` | accessToken | `Session` | `await iam.auth.verifyToken(accessToken)` |
| `iam.auth.logout` | accessToken | `void` | `await iam.auth.logout(accessToken)` |
| `iam.auth.reauthenticate` | accessToken, password, operation | `IssuedTicket` | `await iam.auth.reauthenticate(accessToken, password, 'users:delete')` |
| `iam.auth.checkSensitiveOperation` | accessToken, operation, ticket | `void` | `await iam.auth.checkSensitiveOperation(accessToken, 'users:delete', operationTicket)` |

### User records

Use the current-user methods with the caller’s access token. Authorize access to the target account before calling an administrative method. The optional read options can include roles; list options can set pagination.

| API | Arguments | Success data | Example |
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

### Password and account maintenance

Use the submitted old password to change an existing credential. A reset link or an administrator can use the corresponding reset method. The account scan returns the number of affected users.

| API | Arguments | Success data | Example |
| --- | --- | --- | --- |
| `iam.user.adminResetPassword` | userId, newPassword | `void` | `await iam.user.adminResetPassword(userId, newPassword)` |
| `iam.user.renewPassword` | input | `void` | `await iam.user.renewPassword({ identifier, password, newPassword })` |
| `iam.user.changePassword` | userId, oldPassword, newPassword | `void` | `await iam.user.changePassword(userId, oldPassword, newPassword)` |
| `iam.user.changeCurrentUserPassword` | accessToken, oldPassword, newPassword | `void` | `await iam.user.changeCurrentUserPassword(accessToken, oldPassword, newPassword)` |
| `iam.user.requestPasswordReset` | identifier, options? | `void` | `await iam.user.requestPasswordReset(identifier)` |
| `iam.user.confirmPasswordReset` | token, newPassword | `void` | `await iam.user.confirmPasswordReset(resetToken, newPassword)` |
| `iam.user.validatePassword` | password | `void` | `iam.user.validatePassword(newPassword)` |
| `iam.user.scanInactiveAccounts` | None | `number` | `await iam.user.scanInactiveAccounts()` |

### Authorization reads

Pass trusted user or role IDs. The batch methods return maps keyed by the corresponding IDs.

| API | Arguments | Success data | Example |
| --- | --- | --- | --- |
| `iam.authz.getUserAuthorization` | userId | `Pick<Session, "roles" \| "permissions">` | `await iam.authz.getUserAuthorization(userId)` |
| `iam.authz.checkPermission` | userId, permission | `boolean` | `await iam.authz.checkPermission(userId, 'orders:read')` |
| `iam.authz.getUserPermissions` | userId | `Permission[]` | `await iam.authz.getUserPermissions(userId)` |
| `iam.authz.getUserRoles` | userId | `Role[]` | `await iam.authz.getUserRoles(userId)` |
| `iam.authz.getUserRolesForMany` | userIds | `Map<string, Role[]>` | `await iam.authz.getUserRolesForMany([userId])` |
| `iam.authz.getRolePermissionsForMany` | roleIds | `Map<string, Permission[]>` | `await iam.authz.getRolePermissionsForMany([roleId])` |

### Role and permission assignments

Assign or remove individual relations, or replace the user’s role set with `syncRoles`. Pass an existing transaction in `tx` only when grouping writes.

| API | Arguments | Success data | Example |
| --- | --- | --- | --- |
| `iam.authz.assignRole` | userId, roleId, tx? | `void` | `await iam.authz.assignRole(userId, roleId)` |
| `iam.authz.removeRole` | userId, roleId, tx? | `void` | `await iam.authz.removeRole(userId, roleId)` |
| `iam.authz.syncRoles` | userId, roleIds, tx? | `void` | `await iam.authz.syncRoles(userId, [roleId])` |
| `iam.authz.assignPermissionToRole` | roleId, permissionId, tx? | `void` | `await iam.authz.assignPermissionToRole(roleId, permissionId)` |
| `iam.authz.removePermissionFromRole` | roleId, permissionId, tx? | `void` | `await iam.authz.removePermissionFromRole(roleId, permissionId)` |

### Managing roles and permissions

Create, retrieve, list, update or delete definitions. Lookups return `null` if nothing matches. The list options can specify pagination.

| API | Arguments | Success data | Example |
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

### Policies for sensitive operations

Read the current RBAC operations that require additional proof. Omit `operation` to list all operations; when RBAC is disabled the list is empty. Assign a new list to a permission, or pass an empty list to clear the database rules for it and keep the file rules.

| API | Arguments | Success data | Example |
| --- | --- | --- | --- |
| `iam.authz.getSensitiveOperations` | operation? | `string[]` | `await iam.authz.getSensitiveOperations('users:delete')` |
| `iam.authz.setPermissionSensitiveOperations` | permissionId, operations | `void` | `await iam.authz.setPermissionSensitiveOperations(permissionId, ['users:delete'])` |

### Sessions

Verify or revoke credentials and rotate a token pair with a refresh token. Use the most recently read version for optimistic updates. Use `create` only with trusted session input.

| API | Arguments | Success data | Example |
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

### API keys

Save the raw key securely when creating it; only the creation result contains it. List or get key metadata, verify a submitted secret, or revoke a key.

| API | Arguments | Success data | Example |
| --- | --- | --- | --- |
| `iam.apiKey.createApiKey` | userId, options | `CreateApiKeyResult` | `await iam.apiKey.createApiKey(userId, { name: 'reporting', scopes: ['orders:read'] })` |
| `iam.apiKey.listApiKeys` | userId, options? | `PaginatedResult<ApiKey>` | `await iam.apiKey.listApiKeys(userId, { page: 1, pageSize: 20 })` |
| `iam.apiKey.getApiKey` | keyId | `ApiKey \| null` | `await iam.apiKey.getApiKey(keyId)` |
| `iam.apiKey.revokeApiKey` | keyId | `void` | `await iam.apiKey.revokeApiKey(keyId)` |
| `iam.apiKey.verifyApiKey` | rawKey | `ApiKey` | `await iam.apiKey.verifyApiKey(rawKey)` |

### One-time tickets

Issue a short-lived ticket for a purpose and subject. Consume it with the expected binding; a consumed ticket cannot be reused.

| API | Arguments | Success data | Example |
| --- | --- | --- | --- |
| `iam.ticket.issue` | options | `IssuedTicket` | `await iam.ticket.issue(ticketInput)` |
| `iam.ticket.consume` | ticket, options | `ConsumedTicket` | `await iam.ticket.consume(operationTicket, ticketBinding)` |

### Public settings and lifecycle

The public settings exclude directory, database and notification credentials. Check `iam.isInitialized` before relying on `iam.isRegisterEnabled`, which is true before initialization or unless public registration is explicitly disabled.

| API | Arguments | Success data | Example |
| --- | --- | --- | --- |
| `iam.init` | config | `void` | `await iam.init({})` |
| `iam.close` | None | `Promise<void>` | `await iam.close()` |
| `iam.isInitialized` | None | `boolean` | `iam.isInitialized` |
| `iam.isRegisterEnabled` | None | `boolean` | `iam.isRegisterEnabled` |
| `iam.getPublicConfig` | None | `IamPublicConfig` | `await iam.getPublicConfig()` |

Still untranslated: LDAP, custom notification delivery and extended account workflows. Read the [Chinese source section](iam.md#detailed-workflow).
