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
    // Open project-local data.db as SQLite. Success has no data; failure stops IAM setup.
    const db = await reldb.init({ type: 'sqlite', database: './data.db' })
    if (!db.success)
      return db
    // Initialize a local cache for the development sign-in. Success has no data; shared-backend policy can reject it.
    const cached = await cache.init({ type: 'memory' })
    if (!cached.success)
      return cached
    // Apply default IAM settings over the ready database and cache. Success has no data; failure stops registration.
    const initialized = await iam.init({})
    if (!initialized.success)
      return initialized
    // Register demo with the sample password. Success returns the registration result; duplicate usernames or policy violations fail.
    const registered = await iam.user.register({ username: 'demo', password: 'Password123' })
    if (!registered.success)
      return registered
    // Sign in as the newly registered demo with the same password. Success returns user and tokens; invalid credentials fail.
    const login = await iam.auth.login({ identifier: 'demo', password: 'Password123' })
    if (!login.success)
      return login
    // Validate the access token from sign-in. Success returns the current authorized session; invalid or expired tokens fail.
    return await iam.auth.verifyToken(login.data.tokens.accessToken)
  }
  finally {
    // 应用关闭时按依赖的反向顺序释放。
    // Close IAM without arguments and stop using its current runtime. The host still owns the cache and database.
    await iam.close()
    // Release this example's in-memory cache and data with no arguments. The cache reports its own cleanup result.
    await cache.close()
    // Close data.db last without arguments. Its cleanup result is separate from sign-in.
    await reldb.close()
  }
}

const result = await example()
if (!result.success)
  // Write an error-level event with the failure code, omitting passwords and tokens.
  core.logger.error('Authentication example failed', { code: result.error.code })
```

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Run these examples after IAM initialization. Check success after each call, return the original failed result, and read data only on success. Scenarios without a function declaration are fragments inside an async application function. Authorize management operations at the application boundary.


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
// Fragment inside an async application function; return failed results to its caller.
// Read merged public authentication policy with no arguments. Success omits private settings; return the failed result on failure.
const publicSettingsResult = await iam.getPublicConfig()
if (!publicSettingsResult.success)
  return publicSettingsResult
const publicSettings = publicSettingsResult.data // merged public IAM settings
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

Login requires valid input, challenge, account state and session policy. This follows password login; other strategies validate their own credentials.

![Login: checks beyond valid credentials](../images/function-iam-login.en.svg)

An enabled challenge is consumed once for its operation, even when the password is wrong. Valid credentials and account state precede effective authorization and shared terminal/session-limit checks. Tokens and user data do not grant access to every resource.

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
  // Create the docs:read API permission and receive its ID. Return the failed result on a duplicate code or write failure.
  const permissionResult = await iam.authz.createPermission({ code: 'docs:read', name: 'Read docs', type: 'api' })
  if (!permissionResult.success)
    return permissionResult
  const permission = permissionResult.data
  // Create the docs_reader role with no permissions. Success returns its ID; a conflicting code fails.
  const roleResult = await iam.authz.createRole({ code: 'docs_reader', name: 'Docs reader', permissionIds: [] })
  if (!roleResult.success)
    return roleResult
  const role = roleResult.data
  // Link the newly created docs:read permission to docs_reader. Success has no data.
  const assignPermissionToRoleResult = await iam.authz.assignPermissionToRole(role.id, permission.id)
  if (!assignPermissionToRoleResult.success)
    return assignPermissionToRoleResult
  // Success has no business data.
  // Assign the new role to the supplied user. Success has no data; return the failed result on a write error.
  const assignRoleResult = await iam.authz.assignRole(userId, role.id)
  if (!assignRoleResult.success)
    return assignRoleResult
  // Success has no business data.
  // Replace this user's entire role set with the one newly created role. Success has no data.
  const syncRolesResult = await iam.authz.syncRoles(userId, [role.id])
  if (!syncRolesResult.success)
    return syncRolesResult
  // replaces the complete role set
  // Check docs:read for this user. Success is true in this example; false means denied. Return a failed lookup result to the caller.
  const checkPermissionResult = await iam.authz.checkPermission(userId, 'docs:read')
  if (!checkPermissionResult.success)
    return checkPermissionResult
  checkPermissionResult.data // true (RBAC enabled)
  // Read effective role and permission codes for the user, including docs_reader and docs:read.
  const getUserAuthorizationResult = await iam.authz.getUserAuthorization(userId)
  if (!getUserAuthorizationResult.success)
    return getUserAuthorizationResult
  getUserAuthorizationResult.data // role and permission codes
  // Read role records for the same user, including the assigned docs_reader.
  const getUserRolesResult = await iam.authz.getUserRoles(userId)
  if (!getUserRolesResult.success)
    return getUserRolesResult
  getUserRolesResult.data // Role[]
  // Read effective permission records for the user, including docs:read here.
  const getUserPermissionsResult = await iam.authz.getUserPermissions(userId)
  if (!getUserPermissionsResult.success)
    return getUserPermissionsResult
  getUserPermissionsResult.data // Permission[]
  // Read roles for the one-user batch. The Map keys are user IDs and the values are role arrays.
  const getUserRolesForManyResult = await iam.authz.getUserRolesForMany([userId])
  if (!getUserRolesForManyResult.success)
    return getUserRolesForManyResult
  getUserRolesForManyResult.data // Map keyed by user ID
  // Read permissions for the new role ID. The Map associates role IDs with permission arrays.
  const getRolePermissionsForManyResult = await iam.authz.getRolePermissionsForMany([role.id])
  if (!getRolePermissionsForManyResult.success)
    return getRolePermissionsForManyResult
  getRolePermissionsForManyResult.data // Map keyed by role ID
  // Read counts for the role batch and look up this role ID. It has one member in the isolated example.
  const getRoleUserCountsResult = await iam.authz.getRoleUserCounts([role.id])
  if (!getRoleUserCountsResult.success)
    return getRoleUserCountsResult
  getRoleUserCountsResult.data.get(role.id) // 1 in this isolated example
  // Look up the new role by ID. An absent record returns null.
  const getRoleResult = await iam.authz.getRole(role.id)
  if (!getRoleResult.success)
    return getRoleResult
  getRoleResult.data // the created Role
  // Look up the same role by stable code docs_reader. A miss gives null.
  const getRoleByCodeResult = await iam.authz.getRoleByCode('docs_reader')
  if (!getRoleByCodeResult.success)
    return getRoleByCodeResult
  getRoleByCodeResult.data // same Role
  // Read the first role page with up to 20 records and pagination metadata.
  const getAllRolesResult = await iam.authz.getAllRoles({ page: 1, pageSize: 20 })
  if (!getAllRolesResult.success)
    return getAllRolesResult
  getAllRolesResult.data // role page
  // Rename this role to Document readers and return the updated record.
  const updateRoleResult = await iam.authz.updateRole(role.id, { name: 'Document readers' })
  if (!updateRoleResult.success)
    return updateRoleResult
  updateRoleResult.data // updated Role
  // Look up the created permission by ID; a missing record gives null.
  const getPermissionResult = await iam.authz.getPermission(permission.id)
  if (!getPermissionResult.success)
    return getPermissionResult
  getPermissionResult.data // the created Permission
  // Find the same permission by stable code docs:read; a miss gives null.
  const getPermissionByCodeResult = await iam.authz.getPermissionByCode('docs:read')
  if (!getPermissionByCodeResult.success)
    return getPermissionByCodeResult
  getPermissionByCodeResult.data // same Permission
  // Read the first permission page, up to 20 records, with pagination metadata.
  const getAllPermissionsResult = await iam.authz.getAllPermissions({ page: 1, pageSize: 20 })
  if (!getAllPermissionsResult.success)
    return getAllPermissionsResult
  getAllPermissionsResult.data // permission page
  // Read the permissions attached to this role ID, including docs:read.
  const getRolePermissionsResult = await iam.authz.getRolePermissions(role.id)
  if (!getRolePermissionsResult.success)
    return getRolePermissionsResult
  getRolePermissionsResult.data // includes docs:read
  // Store docs:export as the sensitive operation for this permission. Success has no data.
  const setPermissionSensitiveOperationsResult = await iam.authz.setPermissionSensitiveOperations(permission.id, ['docs:export'])
  if (!setPermissionSensitiveOperationsResult.success)
    return setPermissionSensitiveOperationsResult
  // Success has no business data.
  // Read effective sensitive operations for docs:export. An enabled reauthentication policy includes this rule; no match yields an empty array.
  const getSensitiveOperationsResult = await iam.authz.getSensitiveOperations('docs:export')
  if (!getSensitiveOperationsResult.success)
    return getSensitiveOperationsResult
  getSensitiveOperationsResult.data // configured rule when reauthentication is enabled
  // Unlink the role and permission. Success has no data; their definitions remain.
  const removePermissionFromRoleResult = await iam.authz.removePermissionFromRole(role.id, permission.id)
  if (!removePermissionFromRoleResult.success)
    return removePermissionFromRoleResult
  // Success has no business data.
  // Remove this example's role assignment from the user. Success has no data.
  const removeRoleResult = await iam.authz.removeRole(userId, role.id)
  if (!removeRoleResult.success)
    return removeRoleResult
  // Success has no business data.
  // Delete the role created for this example. Success has no data; return the failed result on deletion failure.
  const deleteRoleResult = await iam.authz.deleteRole(role.id)
  if (!deleteRoleResult.success)
    return deleteRoleResult
  // Success has no business data.
  // Delete the permission created for this example. Success has no data; return the failed result on deletion failure.
  const deletePermissionResult = await iam.authz.deletePermission(permission.id)
  if (!deletePermissionResult.success)
    return deletePermissionResult
  // Success has no business data.
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

Refresh does not extend the same token string. IAM prepares a successor and atomically consumes the old refresh token while publishing the new session.

![refresh: one successor per old token](../images/function-iam-refresh.en.svg)

Two nodes using the same old token cannot both publish successors. Account, API Key and credential-version checks can reject refresh. After success the client replaces the credential pair. Storage or network failures must not be reported as completed refresh.

Session workflows explain create’s TokenPair, verify’s session, refresh’s replacement tokens and destroy/destroyAll revocation. Tokens are described by source and type rather than logged; optional policies remain server-enforced.

#### Parameters and result semantics: Sessions

Verify or revoke credentials and rotate a token pair with a refresh token. Use the most recently read version for optimistic updates. Use `create` only with trusted session input.

[Detailed parameters and workflows](iam.md#sessions)

#### Scenario: Manage sessions and rotate tokens

Only trusted server code may build options after verifying the user. These low-level methods do not grant business authorization. The first function affects all sessions for the test user. Run the second separately with a refresh token from a successful login.

```ts
import type { CreateSessionOptions } from '@h-ai/iam'

async function manageTrustedSession(options: CreateSessionOptions, refreshToken: string) {
  // Create a Session from the host's trusted options. Return the failed result on storage failure.
  const createdResult = await iam.session.create(options)
  if (!createdResult.success)
    return createdResult
  const created = createdResult.data // Session, not TokenPair
  const token = created.accessToken
  // Look up the session by the access token just created. An absent session yields null.
  const foundResult = await iam.session.get(token)
  if (!foundResult.success)
    return foundResult
  const found = foundResult.data // Session or null
  // Validate the same access token at the session layer. Success yields a Session; an absent or expired token fails.
  const verifiedResult = await iam.session.verifyToken(token)
  if (!verifiedResult.success)
    return verifiedResult
  const verified = verifiedResult.data // Session; missing/expired fails
  // Set theme dark on this session using the observed version. Success has no data; a version mismatch fails.
  const updateResult = await iam.session.update(token, { data: { theme: 'dark' } }, verified.version)
  if (!updateResult.success)
    return updateResult
  // Success has no business data.
  // Apply the verified role and permission snapshot to this user's sessions. Success has no data; return the failed result on write failure.
  const patchUserSessionsResult = await iam.session.patchUserSessions(options.userId, { roles: verified.roles, permissions: verified.permissions })
  if (!patchUserSessionsResult.success)
    return patchUserSessionsResult
  // Success has no business data.
  // Revoke this session using its original access token. Success has no data; return the failed result on storage failure.
  const deleteResult2 = await iam.session.delete(token)
  if (!deleteResult2.success)
    return deleteResult2
  // undefined; revokes this session
  // Revoke the remaining sessions for the user ID in options and return the count.
  const deleteByUserIdResult = await iam.session.deleteByUserId(options.userId)
  if (!deleteByUserIdResult.success)
    return deleteByUserIdResult
  deleteByUserIdResult.data // remaining revoked count
}

async function rotateThenRevoke(refreshToken: string) {
  // Rotate the supplied refresh token to obtain a new token pair. A used or expired token fails.
  const pairResult = await iam.session.refresh(refreshToken)
  if (!pairResult.success)
    return pairResult
  const pair = pairResult.data // new TokenPair
  // Revoke the newly issued refresh token to prevent renewal. Success has no data; the access token is separate.
  const revokeRefreshResult = await iam.session.revokeRefresh(pair.refreshToken)
  if (!revokeRefreshResult.success)
    return revokeRefreshResult
  // undefined; access remains valid until expiry/revocation
  // Revoke the session for the access token issued in the same rotation. Success has no data.
  const deleteResult = await iam.session.delete(pair.accessToken)
  if (!deleteResult.success)
    return deleteResult
  // Success has no business data.
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
