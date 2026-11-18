# @h-ai/iam API reference

<!-- translation: partial -->

[Chinese source](iam.md) · [Configuration](../configuration/iam.en.md) · [Data structures](../data/iam.en.md)

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

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Run these examples after IAM initialization. value checks the result and stops on failure. Authorize management operations at the application boundary.

```ts
import type { HaiResult } from '@h-ai/core'
import { iam } from '@h-ai/iam'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="lifecycle"></a>

### Prepare IAM and public policies: `iam`

Prepare the database and cache before IAM. Public settings drive available authentication UI without exposing secrets.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `iam.init` | 先连接 RelDB 和 Cache，再等待身份服务可用 | config | `void` | `await iam.init({})` |
| `iam.close` | 释放 IAM 运行时状态；缓存和数据库仍由应用关闭 | None | `Promise<void>` | `await iam.close()` |
| `iam.getPublicConfig` | Read public policy including stored sensitive operations | None | `Promise<HaiResult<IamPublicConfig>>` | `await iam.getPublicConfig()` |
| `iam.config` | Read the current redacted config | Read-only property; no arguments | `IamConfig \| null` | `iam.config` |
| `iam.publicConfig` | Read the last public policy snapshot | Read-only property; no arguments | `IamPublicConfig \| null` | `iam.publicConfig` |
| `iam.isInitialized` | Check whether IAM is ready | Read-only property; no arguments | `boolean` | `iam.isInitialized` |

#### Scenario: Prepare IAM and public policies

```ts
const publicSettings = value(await iam.getPublicConfig()) // merged public IAM settings
// Read only the returned public policy; never return iam.config as a public response.
```

See the quick start for initialization and reverse shutdown. Public policy reflects current settings and cannot bypass server checks. File settings stay in the configuration guide.

Examples assume that IAM is initialized and that the application has checked permissions for the target user or resource. For a `HaiResult`, check `success` before reading `data` or `error`. The success column shows the value inside `data`; `void` means there is no data to read. `?` marks an optional argument.

#### Parameters and result semantics: Public settings and lifecycle

The public settings exclude directory, database and notification credentials. Check `iam.isInitialized` before relying on `iam.isRegisterEnabled`, which is true before initialization or unless public registration is explicitly disabled.

[Detailed parameters and workflows](iam.md#lifecycle)

config/publicConfig are null before initialization. publicConfig is the last in-memory snapshot; call getPublicConfig to refresh persisted policy and check its result. isInitialized does not grant authorization.

<a id="authentication"></a>

### Sign in, register and reauthenticate: `iam.auth`

Follow enabled server authentication flows, including challenges, password expiry and operation-bound proof. The frontend does not establish identity.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `iam.auth.login` | Authenticate with a password and create a session | credentials, context? | `AuthResult` | `await iam.auth.login({ identifier, password })` |
| `iam.auth.loginWithOtp` | Authenticate with a one-time code | credentials, context? | `AuthResult` | `await iam.auth.loginWithOtp({ identifier, code })` |
| `iam.auth.loginWithLdap` | Authenticate against a directory | credentials, context? | `AuthResult` | `await iam.auth.loginWithLdap({ username, password })` |
| `iam.auth.loginWithApiKey` | Create a scoped session with an API key | credentials, context? | `AuthResult` | `await iam.auth.loginWithApiKey({ key: rawKey })` |
| `iam.auth.registerAndLogin` | Register and create a session when allowed | options, context? | `AuthResult` | `await iam.auth.registerAndLogin({ username, password })` |
| `iam.auth.createCaptcha` | Create a challenge for an operation | input | `IamCaptchaChallenge` | `await iam.auth.createCaptcha({ operation: 'login' })` |
| `iam.auth.sendOtp` | Send a code through an enabled channel | identifier, options? | `{ expiresAt: Date; }` | `await iam.auth.sendOtp(identifier)` |
| `iam.auth.verifyToken` | Verify an access token and current identity | accessToken | `Session` | `await iam.auth.verifyToken(accessToken)` |
| `iam.auth.logout` | Revoke the presented access and refresh credentials | accessToken | `void` | `await iam.auth.logout(accessToken)` |
| `iam.auth.reauthenticate` | Recheck a password and issue an operation ticket | accessToken, password, operation | `IssuedTicket` | `await iam.auth.reauthenticate(accessToken, password, 'users:delete')` |
| `iam.auth.checkSensitiveOperation` | Check and consume operation proof | accessToken, operation, ticket | `void` | `await iam.auth.checkSensitiveOperation(accessToken, 'users:delete', operationTicket)` |

<a id="ldap-identity-migration"></a>

#### Migrate existing LDAP identity bindings

Pause LDAP sign-in and upgrade all nodes. Have a directory administrator independently verify each immutable directory entry ID against its IAM user ID. The example binds a verified OpenLDAP entry to the existing `user-42` account and preserves its roles and data. The username, DN and legacy metadata are only inputs to that review.

```json
{
  "directoryId": "company-directory",
  "identityAttribute": "entryUUID",
  "bindings": [{ "entryId": "3dd5e1a0-6199-49b7-a8e3-9f2d260f7b76", "userId": "user-42" }]
}
```

```sh
node ./node_modules/@h-ai/iam/dist/ldap-bindings.js --database private-db.json --manifest approved-bindings.json
node ./node_modules/@h-ai/iam/dist/ldap-bindings.js --database private-db.json --manifest approved-bindings.json --apply
```

`private-db.json` contains the private RelDB JSON configuration for the target database. The first command previews the number of new and existing bindings. Run `--apply` after reviewing the counts. The import commits in one transaction, supports reruns of the same bindings and rejects conflicts. Keep both input files private. Reopen LDAP sign-in after checking the verified accounts. Use `ldapSyncUser: false` to require an existing binding.

#### Scenario: Sign in, register and reauthenticate

The workflows cover registration, login, challenges, OTP/LDAP, session verification and reauthentication. Form values are inputs; use identities and proof only from successful results. Disabled methods fail.

#### Parameters and result semantics: Sign-in and registration

Choose the method that matches the configured credentials. `context` is optional and carries trusted request metadata. Success returns the user, tokens, roles and permissions.

#### Parameters and result semantics: Challenges, verification and fresh proof

Create a challenge for the intended operation. Pass the access token to validate or end a session. Bind a reauthentication ticket to the operation for which it was issued.

[Detailed parameters and workflows](iam.md#authentication)

<a id="users"></a>

### Maintain users and passwords: `iam.user`

Authorize the actor before looking up or modifying users. Distinguish self-service password changes from administrative resets.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `iam.user.createUser` | Create a user as an administrator | options | `RegisterResult` | `await iam.user.createUser({ username, password })` |
| `iam.user.register` | Register under the public policy | options | `RegisterResult` | `await iam.user.register({ username, password })` |
| `iam.user.inviteUser` | Create a user and send a password-setup invitation | options | `RegisterResult` | `await iam.user.inviteUser({ username, email })` |
| `iam.user.getUser` | Find a user by ID | userId, options? | `User \| null` | `await iam.user.getUser(userId)` |
| `iam.user.getUsers` | Read users and requested relations in bulk | userIds, options? | `User[]` | `await iam.user.getUsers([userId], { include: ['roles'] })` |
| `iam.user.listUsers` | Filter and paginate users | options? | `PaginatedResult<User>` | `await iam.user.listUsers({ page: 1, pageSize: 20 })` |
| `iam.user.getCurrentUser` | Read the current token holder profile | accessToken | `User` | `await iam.user.getCurrentUser(accessToken)` |
| `iam.user.updateCurrentUser` | Update the current token holder profile | accessToken, data | `User` | `await iam.user.updateCurrentUser(accessToken, { displayName: 'Alice' })` |
| `iam.user.updateUser` | Update a user by ID | userId, data | `User` | `await iam.user.updateUser(userId, { displayName: 'Alice' })` |
| `iam.user.deleteUser` | Delete a user | userId | `void` | `await iam.user.deleteUser(userId)` |
| `iam.user.adminResetPassword` | Reset a password as an administrator | userId, newPassword | `void` | `await iam.user.adminResetPassword(userId, newPassword)` |
| `iam.user.renewPassword` | Replace an expired or initial password using original credentials | input | `void` | `await iam.user.renewPassword({ identifier, password, newPassword })` |
| `iam.user.changePassword` | Change a password after verifying the old one | userId, oldPassword, newPassword | `void` | `await iam.user.changePassword(userId, oldPassword, newPassword)` |
| `iam.user.changeCurrentUserPassword` | Change the token holder password | accessToken, oldPassword, newPassword | `void` | `await iam.user.changeCurrentUserPassword(accessToken, oldPassword, newPassword)` |
| `iam.user.requestPasswordReset` | Request reset delivery | identifier, options? | `void` | `await iam.user.requestPasswordReset(identifier)` |
| `iam.user.confirmPasswordReset` | Consume reset credentials and replace a password | token, newPassword | `void` | `await iam.user.confirmPasswordReset(resetToken, newPassword)` |
| `iam.user.validatePassword` | Check the password policy synchronously | password | `void` | `iam.user.validatePassword(newPassword)` |
| `iam.user.scanInactiveAccounts` | Deactivate accounts under inactivity policy | None | `number` | `await iam.user.scanInactiveAccounts()` |

#### Scenario: Maintain users and passwords

User scenarios cover create, ID/name/email lookup, pages, updates and deletion; password scenarios cover reset proof, expiry and account state. Handle missing users separately from failed database operations.

#### Parameters and result semantics: User records

Use the current-user methods with the caller’s access token. Authorize access to the target account before calling an administrative method. The optional read options can include roles; list options can set pagination.

#### Parameters and result semantics: Password and account maintenance

Use the submitted old password to change an existing credential. A reset link or an administrator can use the corresponding reset method. The account scan returns the number of affected users.

[Detailed parameters and workflows](iam.md#users)

<a id="authorization"></a>

### Assign roles and check permissions: `iam.authz`

Store roles and permissions on the server and authorize sensitive operations against the current principal and purpose.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `iam.authz.getUserAuthorization` | Read roles and permissions together | userId | `Pick<Session, "roles" \| "permissions">` | `await iam.authz.getUserAuthorization(userId)` |
| `iam.authz.checkPermission` | Check a user permission | userId, permission | `boolean` | `await iam.authz.checkPermission(userId, 'orders:read')` |
| `iam.authz.getUserPermissions` | Read user permissions | userId | `Permission[]` | `await iam.authz.getUserPermissions(userId)` |
| `iam.authz.getUserRoles` | Read user roles | userId | `Role[]` | `await iam.authz.getUserRoles(userId)` |
| `iam.authz.getUserRolesForMany` | Read roles for multiple users | userIds | `Map<string, Role[]>` | `await iam.authz.getUserRolesForMany([userId])` |
| `iam.authz.getRolePermissionsForMany` | Read permissions for multiple roles | roleIds | `Map<string, Permission[]>` | `await iam.authz.getRolePermissionsForMany([roleId])` |
| `iam.authz.assignRole` | Assign a role to a user | userId, roleId, tx? | `void` | `await iam.authz.assignRole(userId, roleId)` |
| `iam.authz.removeRole` | Remove a user role | userId, roleId, tx? | `void` | `await iam.authz.removeRole(userId, roleId)` |
| `iam.authz.syncRoles` | Replace a user role set | userId, roleIds, tx? | `void` | `await iam.authz.syncRoles(userId, [roleId])` |
| `iam.authz.assignPermissionToRole` | Assign a permission to a role | roleId, permissionId, tx? | `void` | `await iam.authz.assignPermissionToRole(roleId, permissionId)` |
| `iam.authz.removePermissionFromRole` | Remove a role permission | roleId, permissionId, tx? | `void` | `await iam.authz.removePermissionFromRole(roleId, permissionId)` |
| `iam.authz.createRole` | Create a role | role, tx? | `Role` | `await iam.authz.createRole({ code: 'editor', name: 'Editor', description: null, isSystem: false })` |
| `iam.authz.getRole` | Read a role by ID | roleId | `Role \| null` | `await iam.authz.getRole(roleId)` |
| `iam.authz.getRoleByCode` | Read a role by code | code | `Role \| null` | `await iam.authz.getRoleByCode('editor')` |
| `iam.authz.getAllRoles` | Read all roles | options? | `PaginatedResult<Role>` | `await iam.authz.getAllRoles({ page: 1, pageSize: 20 })` |
| `iam.authz.getRoleUserCounts` | Count users for roles | roleIds | `Map<string, number>` | `await iam.authz.getRoleUserCounts([roleId])` |
| `iam.authz.updateRole` | Update a role | roleId, data, tx? | `Role` | `await iam.authz.updateRole(roleId, { name: 'Editor' })` |
| `iam.authz.deleteRole` | Delete a role | roleId, tx? | `void` | `await iam.authz.deleteRole(roleId)` |
| `iam.authz.createPermission` | Create a permission | permission, tx? | `Permission` | `await iam.authz.createPermission({ code: 'orders:read', name: 'Read orders', type: 'api' })` |
| `iam.authz.getPermission` | Read a permission by ID | permissionId | `Permission \| null` | `await iam.authz.getPermission(permissionId)` |
| `iam.authz.getPermissionByCode` | Read a permission by code | code | `Permission \| null` | `await iam.authz.getPermissionByCode('orders:read')` |
| `iam.authz.getAllPermissions` | Read all permissions | options? | `PaginatedResult<Permission>` | `await iam.authz.getAllPermissions({ page: 1, pageSize: 20 })` |
| `iam.authz.deletePermission` | Delete a permission | permissionId, tx? | `void` | `await iam.authz.deletePermission(permissionId)` |
| `iam.authz.getRolePermissions` | Read role permissions | roleId | `Permission[]` | `await iam.authz.getRolePermissions(roleId)` |
| `iam.authz.getSensitiveOperations` | Read effective sensitive-operation rules | operation? | `string[]` | `await iam.authz.getSensitiveOperations('users:delete')` |
| `iam.authz.setPermissionSensitiveOperations` | Set sensitive-operation rules for a permission | permissionId, operations | `void` | `await iam.authz.setPermissionSensitiveOperations(permissionId, ['users:delete'])` |

#### Scenario: Assign roles and check permissions

Use isolated development data with RBAC enabled and a test user with no other roles. syncRoles replaces the whole role set. Pages and Maps reflect the database; every failure stops subsequent writes.

```ts
async function reviewReader(userId: string) {
  const permission = value(await iam.authz.createPermission({ code: 'docs:read', name: 'Read docs', type: 'api' }))
  const role = value(await iam.authz.createRole({ code: 'docs_reader', name: 'Docs reader', permissionIds: [] }))
  value(await iam.authz.assignPermissionToRole(role.id, permission.id)) // undefined
  value(await iam.authz.assignRole(userId, role.id)) // undefined
  value(await iam.authz.syncRoles(userId, [role.id])) // replaces the complete role set
  value(await iam.authz.checkPermission(userId, 'docs:read')) // true (RBAC enabled)
  value(await iam.authz.getUserAuthorization(userId)) // role and permission codes
  value(await iam.authz.getUserRoles(userId)) // Role[]
  value(await iam.authz.getUserPermissions(userId)) // Permission[]
  value(await iam.authz.getUserRolesForMany([userId])) // Map keyed by user ID
  value(await iam.authz.getRolePermissionsForMany([role.id])) // Map keyed by role ID
  value(await iam.authz.getRoleUserCounts([role.id])).get(role.id) // 1 in this isolated example
  value(await iam.authz.getRole(role.id)) // the created Role
  value(await iam.authz.getRoleByCode('docs_reader')) // same Role
  value(await iam.authz.getAllRoles({ page: 1, pageSize: 20 })) // role page
  value(await iam.authz.updateRole(role.id, { name: 'Document readers' })) // updated Role
  value(await iam.authz.getPermission(permission.id)) // the created Permission
  value(await iam.authz.getPermissionByCode('docs:read')) // same Permission
  value(await iam.authz.getAllPermissions({ page: 1, pageSize: 20 })) // permission page
  value(await iam.authz.getRolePermissions(role.id)) // includes docs:read
  value(await iam.authz.setPermissionSensitiveOperations(permission.id, ['docs:export'])) // undefined
  value(await iam.authz.getSensitiveOperations('docs:export')) // configured rule when reauthentication is enabled
  value(await iam.authz.removePermissionFromRole(role.id, permission.id)) // undefined
  value(await iam.authz.removeRole(userId, role.id)) // undefined
  value(await iam.authz.deleteRole(role.id)) // undefined
  value(await iam.authz.deletePermission(permission.id)) // undefined
}
```

The flow creates permissions and roles, links them, assigns users, checks and revokes access, then covers sensitive-operation policy. Boolean false means denied; a failed HaiResult means the check failed to complete.

#### Parameters and result semantics: Authorization reads

Pass trusted user or role IDs. The batch methods return maps keyed by the corresponding IDs.

#### Parameters and result semantics: Role and permission assignments

Assign or remove individual relations, or replace the user’s role set with `syncRoles`. Pass an existing transaction in `tx` only when grouping writes.

#### Parameters and result semantics: Managing roles and permissions

Create, retrieve, list, update or delete definitions. Lookups return `null` if nothing matches. The list options can specify pagination.

#### Parameters and result semantics: Policies for sensitive operations

Read the current RBAC operations that require additional proof. Omit `operation` to list all operations; when RBAC is disabled the list is empty. Assign a new list to a permission, or pass an empty list to clear the database rules for it and keep the file rules.

[Detailed parameters and workflows](iam.md#authorization)

<a id="sessions"></a>

### Renew and revoke sessions: `iam.session`

Validate session tokens on the server. Refresh, list and revoke through the same session system; page-exit revocation is best effort.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `iam.session.create` | Create a session and token pair | options | `Session` | `await iam.session.create(trustedSessionInput)` |
| `iam.session.get` | Read a session by access token | accessToken | `Session \| null` | `await iam.session.get(accessToken)` |
| `iam.session.verifyToken` | Verify a session token | accessToken | `Session` | `await iam.session.verifyToken(accessToken)` |
| `iam.session.update` | Update session data | accessToken, data, expectedVersion | `void` | `await iam.session.update(accessToken, sessionPatch, expectedVersion)` |
| `iam.session.delete` | Delete a session by token | accessToken | `void` | `await iam.session.delete(accessToken)` |
| `iam.session.deleteByUserId` | Revoke all user sessions | userId | `number` | `await iam.session.deleteByUserId(userId)` |
| `iam.session.refresh` | Rotate refresh credentials | refreshToken | `TokenPair` | `await iam.session.refresh(refreshToken)` |
| `iam.session.revokeRefresh` | Revoke refresh credentials | refreshToken | `void` | `await iam.session.revokeRefresh(refreshToken)` |
| `iam.session.patchUserSessions` | Patch user profile snapshots in sessions | userId, updates | `void` | `await iam.session.patchUserSessions(userId, sessionFieldUpdates)` |

#### Scenario: Renew and revoke sessions

Session workflows explain create’s TokenPair, verify’s session, refresh’s replacement tokens and destroy/destroyAll revocation. Tokens are described by source and type rather than logged; optional policies remain server-enforced.

#### Parameters and result semantics: Sessions

Verify or revoke credentials and rotate a token pair with a refresh token. Use the most recently read version for optimistic updates. Use `create` only with trusted session input.

[Detailed parameters and workflows](iam.md#sessions)

#### Scenario: Manage sessions and rotate tokens

Only trusted server code may build options after verifying the user. These low-level methods do not grant business authorization. The first function affects all sessions for the test user. Run the second separately with a refresh token from a successful login.

```ts
import type { CreateSessionOptions } from '@h-ai/iam'

async function manageTrustedSession(options: CreateSessionOptions, refreshToken: string) {
  const created = value(await iam.session.create(options)) // Session, not TokenPair
  const token = created.accessToken
  const found = value(await iam.session.get(token)) // Session or null
  const verified = value(await iam.session.verifyToken(token)) // Session; missing/expired fails
  value(await iam.session.update(token, { data: { theme: 'dark' } }, verified.version)) // undefined
  value(await iam.session.patchUserSessions(options.userId, { roles: verified.roles, permissions: verified.permissions })) // undefined
  value(await iam.session.delete(token)) // undefined; revokes this session
  value(await iam.session.deleteByUserId(options.userId)) // remaining revoked count
}

async function rotateThenRevoke(refreshToken: string) {
  const pair = value(await iam.session.refresh(refreshToken)) // new TokenPair
  value(await iam.session.revokeRefresh(pair.refreshToken)) // undefined; access remains valid until expiry/revocation
  value(await iam.session.delete(pair.accessToken)) // undefined
}
```

<a id="api-keys"></a>

### Issue and revoke API keys: `iam.apiKey`

Issue API keys with ownership and scopes for programmatic access. Give the raw key to its holder only at issuance.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `iam.apiKey.createApiKey` | Issue an API key with one-time plaintext access | userId, options | `CreateApiKeyResult` | `await iam.apiKey.createApiKey(userId, { name: 'reporting', scopes: ['orders:read'] })` |
| `iam.apiKey.listApiKeys` | Paginate a user API keys | userId, options? | `PaginatedResult<ApiKey>` | `await iam.apiKey.listApiKeys(userId, { page: 1, pageSize: 20 })` |
| `iam.apiKey.getApiKey` | Read safe API key metadata by ID | keyId | `ApiKey \| null` | `await iam.apiKey.getApiKey(keyId)` |
| `iam.apiKey.revokeApiKey` | Revoke an API key | keyId | `void` | `await iam.apiKey.revokeApiKey(keyId)` |
| `iam.apiKey.verifyApiKey` | Verify an API key | rawKey | `ApiKey` | `await iam.apiKey.verifyApiKey(rawKey)` |

#### Scenario: Issue and revoke API keys

Use issuance results for validation, listing, updates and revocation. Stored summaries cannot reconstruct the secret. Pass the keyId or issued secret according to each method’s signature.

#### Parameters and result semantics: API keys

Save the raw key securely when creating it; only the creation result contains it. List or get key metadata, verify a submitted secret, or revoke a key.

[Detailed parameters and workflows](iam.md#api-keys)

<a id="tickets"></a>

### Issue and consume one-time proof: `iam.ticket`

Allow a verified principal to perform one purpose for a short period. A successfully consumed ticket cannot be reused.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `iam.ticket.issue` | Issue a time-bound operation ticket | options | `IssuedTicket` | `await iam.ticket.issue(ticketInput)` |
| `iam.ticket.consume` | Verify the purpose and atomically consume a ticket | ticket, options | `ConsumedTicket` | `await iam.ticket.consume(operationTicket, ticketBinding)` |

#### Scenario: Issue and consume one-time proof

issue takes a purpose and binding and returns random proof. consume checks the proof and expected purpose before returning bound data. Wrong-purpose, expired or reused proof must stop the operation.

#### Parameters and result semantics: One-time tickets

Issue a short-lived ticket for a purpose and subject. Consume it with the expected binding; a consumed ticket cannot be reused.

[Detailed parameters and workflows](iam.md#tickets)
