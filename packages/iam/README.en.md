# @h-ai/iam

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/audit](../audit/README.en.md) · [@h-ai/cache](../cache/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md) · [@h-ai/reldb](../reldb/README.en.md) · [@h-ai/reach](../reach/README.en.md)

## Introduction

Identity and access management through a unified `iam` object for authentication, sessions, authorization, and user management.

## Core features

| Feature              | Description                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Authentication**   | Password, OTP (email/SMS codes), LDAP, and API Key strategies                                                          |
| **Sessions**         | Stateful sessions (random access tokens + cache, optional sliding renewal)                                             |
| **Authorization**    | RBAC roles and permissions (batched DB reads, wildcard matching)                                                       |
| **User management**  | Registration, queries, updates, password reset, and admin password reset                                               |
| **API Key**          | Create, revoke, and verify API keys with scopes and expiration                                                         |
| **One-time tickets** | Short-lived capability tickets (issue / atomic consume) for channels such as WebSocket that cannot carry Bearer tokens |
| **Frontend client**  | HTTP API contracts for independent frontends                                                                           |

## Getting started

### Installation

```bash
pnpm add @h-ai/iam
```

### Dependencies

- `@h-ai/reldb`: persistence for users/roles/permissions; **initialize before iam.init()**.
- `@h-ai/cache`: sessions/OTP/reset tokens/one-time tickets/shared locks; **initialize before iam.init()**.
- `@h-ai/crypto`: password hashing, used internally and initialized automatically.
- `@h-ai/audit`: audit records for key RBAC operations.

- `@h-ai/reach`: **optional**, installed, initialized and injected by the application for standard notifications; custom callbacks do not require Reach.
- `ldapts`: **optional**, loaded only when LDAP is explicitly enabled without an injected `ldapClientFactory`.

### Optional LDAP and notifications

Password authentication, users and RBAC work without LDAP or Reach. Both are optional peer dependencies: install only the integrations you use. The snippets below run inside application startup/authentication functions after reldb/cache initialization; `username/password` are validated input.

#### LDAP / Active Directory

For the default client run `pnpm add ldapts`, then explicitly set `login.ldap: true` and connection settings. Connection settings alone do not enable LDAP. Enabling the default client without the SDK returns an initialization configuration error.

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

`ldaps://` uses TLS; `ldap://` with `useTls: true` uses StartTLS. For Active Directory use `searchFilter: "(sAMAccountName={{username}})"` and `usernameAttribute: sAMAccountName`; the username placeholder is escaped before searching. First login synchronizes a local user and assigns the default role; disabled accounts and lockouts still apply. Set `ldapSyncUser: false` or inject a `ldapClientFactory` returning `bind/search/unbind` methods with HaiResult results. An injected factory does not require ldapts.

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

#### Automatic delivery with optional Reach

Run `pnpm add @h-ai/reach`. The application configures, initializes and closes Reach; IAM uses only the injected instance. These SMTP/HTTP providers are examples; the SMS gateway accepts the [Reach notification interface](../reach/README.en.md). Console logs metadata and does not deliver messages.

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

Standard templates: `otp_email / otp_sms` use `{code}`; `password_reset / password_reset_sms` use `{token}`, `{expiresAt}`, `{resetUrl}`. `passwordReset.mode: phone` selects SMS reset. Configure templates before `iam.init()`; unavailable channels are hidden by the public configuration.

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

#### Custom email and SMS delivery

Inject `onOtpSendEmail`, `onOtpSendSms` and `onPasswordResetRequest` to use existing application services. Implement only needed callbacks or mix them with Reach; explicit callbacks take priority. These services are application implementations whose promises resolve only after successful delivery. If a service returns HaiResult, check `success` and throw inside the callback on failure. IAM catches callback exceptions and returns a business error without exposing codes, tokens or internal delivery details.

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

### Quick start

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

LDAP is disabled by default. Public OTP methods require `otp` settings and send callbacks; password reset requires a notification callback.

`iam.config` returns a **redacted configuration snapshot**. Sensitive LDAP `url` / `bindPassword` and similar fields are hidden automatically. Use it to inspect state, not as the original configuration source.

### Design

#### Architecture

IAM is a **lifecycle singleton** managed through `iam.init()` / `iam.close()`. Five internal subsystems initialize in dependency order:

```
iam.init()
  ├─ session  (cached sessions; no DB dependency)
  ├─ authz    (RBAC roles/permissions; batched DB reads)
  ├─ authn    (authentication; depends on session + authz)
  ├─ user     (users; depends on session + authz + passwordStrategy)
  └─ seed     (seed data; depends on authz)
```

All subsystems use **factories + closures** (for example `createSessionOperations(deps)`), not classes. Getters expose them as `iam.auth` / `iam.user` / `iam.authz` / `iam.session` / `iam.apiKey`.

Before initialization, every subsystem method returns `NOT_INITIALIZED` through a `NotInitializedKit` proxy.

#### Data storage

| Data                                                | Storage                                      | Description                                                                                                                   |
| --------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Users, roles, permissions, associations, API keys   | DB (5 base tables, 1 optional API Key table) | `hai_iam_users`、`hai_iam_roles`、`hai_iam_permissions`、`hai_iam_role_permissions`、`hai_iam_user_roles`、`hai_iam_api_keys` |
| Sessions (accessToken → Session)                    | Cache                                        | TTL, optional sliding renewal                                                                                                 |
| Refresh state | Redis user partition | Atomic with session/index |
| OTP codes                                           | Cache                                        | TTL + attempt limit                                                                                                           |
| Password reset tokens                               | Cache                                        | TTL + maximum verification attempts                                                                                           |
| API Key                                             | DB                                           | `hai_iam_api_keys`; store hashes only, never plaintext; prefix narrows candidates                                             |

---

#### Authentication (authn) — `iam.auth`

##### Key types

- **`AuthnOperations`**: `login` / `loginWithOtp` / `loginWithLdap` / `loginWithApiKey` / `logout` / `verifyToken` / `sendOtp` / `registerAndLogin`.
- **`AuthStrategy`**: strategy interface (`type` + `authenticate` + `challenge?`), implemented for password, OTP, LDAP, and API Key.
- **`AuthResult`**: login result with user details, `TokenPair` (accessToken + refreshToken), and roles/permissions.
- **`Credentials`**: a credential union combining `{ type: 'password' | 'otp' | 'ldap' | 'apikey' }` with strategy-specific credentials.

##### Key workflows

**Password login:**

```
login(credentials)
  → Check password login is enabled
  → Find user by identifier (username / email / phone)
  → Dummy hash for missing users (fixed timing to mitigate timing attacks)
  → Check account lock (loginFailedCount >= maxLoginAttempts within lockoutDuration)
  → Verify password hash (@h-ai/crypto)
  → Failure: record attempt; lock at the limit
  → Success: reset failure count
  → Check password expiration (passwordUpdatedAt when expirationDays > 0)
  → Query user roles + permissions
  → Create session (session.create → TokenPair)
  → Return AuthResult { user, tokens, roles, permissions, agreements? }
```

**Token verification:**

```
verifyToken(accessToken)
  → session.get(accessToken) → cache lookup
  → Extend TTL automatically when sliding renewal is enabled
  → Read current user status, role JOIN and one batched permission query (skip permissions for no roles)
  → Reject disabled users or database failures; intersect API Key scopes again
  → Return current Session (userId, roles, permissions)
```

##### Usage

These examples run on the server after successful reldb/cache/IAM initialization, with validated request input. Password login is available by default. OTP requires `login.otp: true`, an `otp` channel and delivery callbacks/Reach templates; LDAP requires `login.ldap: true` (see configuration above); API Key requires `login.apikey: true` (see the complete flow below). Login returns `AuthResult`; registration with login returns the same authentication structure. Registration and password login have separate switches.

OTP has two interactions: send a code, then log in with the code the user received. Both operations return HaiResult. LDAP uses `iam.auth.loginWithLdap({ username, password })`, and API Key uses `loginWithApiKey({ key })`. Check `success` before reading `data`.

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

##### Considerations

- **Timing attack mitigation**: perform a dummy password hash for nonexistent users to keep response timing consistent.
- **Account lockout**: lock for `lockoutDuration` seconds after `maxLoginAttempts` consecutive failures.
- **Independent strategy toggles**: `login.password` / `login.otp` / `login.ldap` / `login.apikey`.
- **OTP security**: rejection sampling avoids modulo bias, constant-time comparison mitigates timing attacks, and `resendInterval` limits frequency.

---

#### Sessions (session) — `iam.session`

##### Key types

- **`SessionOperations`**: `create` / `get` / `verifyToken` / `update` / `delete` / `deleteByUserId` / `refresh` / `revokeRefresh` / `patchUserSessions`.
- **`Session`**: userId, roles, permissions, accessToken, expiration, and other session data.
- **`TokenPair`**: `{ accessToken, refreshToken, expiresIn, tokenType: 'Bearer' }`.

##### Key workflows

**Token refresh (rotation):**

```
refresh(refreshToken)
  → Read the user partition and session version; validate authorization
  → Build candidate tokens without publishing them
  → Single-key CAS rechecks version/refresh and atomically replaces the old session
  → Return the unique successor only after commit
```

**Single-device login:**

```
create(options) [singleDevice=true]
  → Build candidate accessToken + refreshToken
  → Single-key CAS replaces all old sessions and their index together
  → Failed commits preserve the previous session
```

##### Usage

Use `tokens.accessToken` to authenticate requests and `tokens.refreshToken` to obtain a new pair; `expiresIn` is measured in seconds. Independent APIs use `Authorization: Bearer <accessToken>`. For SvelteKit Cookie endpoints, use kit's standard authentication integration described below.

Protected requests use `iam.auth.verifyToken` to read current user status, roles and permissions. `iam.session.get/verifyToken` exposes a lower-level session snapshot and does not replace current authorization. Only trusted server integrations should use `session.create`; never accept client-provided roles/permissions or API Key bindings.

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

##### Considerations

- **Cache-only storage**: Memory sessions are lost on restart; shared Redis sessions survive IAM service restarts until TTL or revocation.
- **Sliding renewal**: with `sliding: true`, each `get()` extends TTL automatically.
- **Refresh rotation**: old refreshToken expires after one use; replay detection indicates token leakage.
- **Token strength**: 256-bit cryptographic randomness (`crypto.getRandomValues(new Uint8Array(32))`), base64url encoded.

---

#### Authorization (authz) — `iam.authz`

Role lists use `iam.authz.getRoleUserCounts(roleIds)` to aggregate actual membership for the current page in one query, returning `HaiResult<Map<string, number>>`. Missing relations mean zero; query failures display an error instead of invented zero counts.

##### Key types

- **`AuthzOperations`**: role/permission CRUD, role-permission/user-role assignments, and permission checks.
- **`Role`**: `{ id, code, name, description, isSystem }`.
- **`Permission`**: `{ id, code, name, type, resource, action }`; type is `menu` / `api` / `button`.
- **`PermissionType`**: permission type enum.

##### Key workflows

**Permission checks (`checkPermission`):**

```
checkPermission(userId, permission)
  → Return true if RBAC is disabled
  → Query user roles (DB)
  → Check super-admin role (cached superAdminRoleId); return true if present
  → Read these roles' permission codes in one DB query; return errors on read failure
  → Match each permission exactly or by wildcard (`admin:*` matches `admin:read`)
  → Return true / false
```

**Session synchronization after role/permission changes:**

```
assignPermissionToRole(roleId, permId)
  → Write association to DB
  → Find role users → resolve permissions per user → update active sessions
  (best-effort: failures only log.error; permission assignment still succeeds)
```

##### Usage

Create permissions, save permission **IDs** through the role's `permissionIds`, and assign a role by its **ID**. Session roles/permissions and guards use stable **codes**; display names can change independently. These examples assume RBAC is enabled. Applications must authorize administrative operations and check resource access before calling them.

`createRole/updateRole` saves role metadata and the complete permission set in one transaction: omission preserves it, an empty array clears it, duplicates are removed, and unknown permission IDs fail. Concurrent updates use the last committed complete set. Owned transactions synchronize sessions after commit; callers using an external transaction must synchronize after their commit.

`checkPermission(userId, code)` and `getUserAuthorization` read the subject's RBAC authorization without the requesting API Key's scopes. API Key requests must use scoped permissions returned by `iam.auth.verifyToken`, as shown below. Re-querying by userId alone can bypass Key restrictions. serv's `.permission('record:read')` declares an exact permission guard. Hiding a menu/button does not authorize the business API.

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

##### Considerations

- **Wildcard matching**: `admin:*` matches `admin:read`, `admin:write:detail`, etc.; one `*` matches everything after the colon.
- **Super-admin role**: `rbac.superAdminRole` (default `super_admin`) automatically grants all permissions.
- **Transactions**: `deleteRole` / `deletePermission` clear associations before deleting entities in a DB transaction.
- **Session synchronization**: cache updates are best-effort. Protected requests use `iam.auth.verifyToken` to read current user status and authorization and reject read failures. `iam.session.verifyToken` validates a session snapshot only. `iam.authz.getUserAuthorization(userId)` shares the role JOIN and batched permission query.
- **Seed data**: `seedDefaultData: true` idempotently creates admin/user/guest roles and basic permissions.

---

#### Users (user) — `iam.user`

##### Key types

- **`UserOperations`**: registration, queries, updates, deletion, password changes/resets, and password strength validation.
- **`User`** (public fields): `{ id, username, email, phone, displayName, avatarUrl, enabled, roles? }`.
- **`StoredUser`**: internal stored user, including sensitive `passwordHash`, `loginFailedCount`, `lockedUntil`, etc.
- **`RegisterOptions`** / **`RegisterResult`**: registration input/output.
- **`UpdateCurrentUserInput`**: fields the current user may change (`username` / `email` / `displayName` / `avatarUrl` / `phone` / `metadata`).

##### Key workflows

**User registration:**

```
register(options)
  → Check registration is enabled
  → Validate password strength (Zod schema + custom rules)
  → Hash password (@h-ai/crypto)
  → DB transaction: create user + query result
  → Assign default role (rbac.defaultRole, outside transaction; failures only log)
  → Return RegisterResult { user, agreements? }
```

**Password reset:**

```
requestPasswordReset(email)
  → Find user by email (missing users return ok silently to prevent enumeration)
  → Generate a random 256-bit token
  → Cache SHA-256(token) → userId (TTL + maxAttempts)
  → Call onPasswordResetRequest (application sends email/SMS)

confirmPasswordReset(token, newPassword)
  → Look up SHA-256(token) and verify expiration/attempts
  → Validate password strength → hash → update DB
  → Clear all active user sessions to force login
  → Delete consumed reset token
```

##### Usage

`register` returns a user without a session; use `auth.registerAndLogin` when both are needed. `createUser` is an administrative operation independent of self-registration settings. Use `getCurrentUser/updateCurrentUser` for profile fields: username/email/displayName/avatarUrl/phone/metadata. Security fields and roles require authorized administrative operations.

Lists return `PaginatedResult<User>` and filter `roleCode` before pagination; request `include: ['roles']` only when needed. Bulk reads keep deduplicated input order and omit missing IDs, so associate results by id rather than array position. Returned users are public DTOs, but applications still control data scope and field disclosure.

`getUser(id)` returns `null` on a successful missing lookup; `getCurrentUser(token)` fails for an invalid session or missing user. Database failures are not empty results. `validatePassword` is synchronous and returns HaiResult. Deletion, disabling and password changes/resets revoke affected sessions.

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

##### Considerations

- **`toUser()` redaction**: public users omit sensitive fields such as `passwordHash` and `loginFailedCount`.
- **Session invalidation**: `deleteUser` / `updateUser({ enabled: false })` / `changePassword` / `confirmPasswordReset` clear all active sessions for affected users.
- **Enumeration protection**: `requestPasswordReset` returns `ok(undefined)` for nonexistent emails instead of an error.
- **Synchronous validatePassword**: the only synchronous method in `UserOperations`; all others are asynchronous.
- **Fuzzy search**: `listUsers` searches username, email, phone, and display name with escaped LIKE wildcards.
- **Server sorting**: `listUsers` allows only `username`, `email`, `displayName`, `enabled`, and `createdAt`, mapped through an allowlist; defaults to newest creation first.

---

#### API keys — `iam.apiKey`

`scopes` intersect the subject's permissions and support `*` and namespace `:*`. The default empty array grants identity only, without operation permissions. Restricted keys have empty session `roles` and use permission guards; explicit `*` never exceeds subject authorization. API Key login binds the key ID: get/verifyToken/refresh recheck its persistent state and reject revoked, disabled, expired keys or DB failures. Standalone verifyApiKey returns verified key metadata and still requires subject/operation authorization.

##### Key types

- **`ApiKeyOperations`**: `createApiKey` / `listApiKeys` / `getApiKey` / `revokeApiKey` / `verifyApiKey`.
- **`ApiKey`** (public fields): `{ id, userId, name, keyPrefix, enabled, expiresAt, scopes }`.
- **`CreateApiKeyResult`**: `{ apiKey, rawKey }`; the plaintext key is returned only once.

##### Key workflows

**API key verification:**

```
verifyApiKey(rawKey)
  → Extract prefix from rawKey (prefix + first 8 characters)
  → Query candidate keys by prefix from DB
  → Verify each hash synchronously
  → If valid, check expiration/disabled state
  → Update lastUsedAt asynchronously without blocking return
  → Return ApiKey
```

##### Usage

Enable API Key during initialization. A Key is a restricted user credential: **effective permissions = current subject permissions ∩ scopes**. Scopes use permission codes, not role/display names or resource IDs. They neither create permissions nor replace tenant/record ownership checks.

```yaml
# config/_iam.yml
login:
  apikey: true
apikey:
  maxKeysPerUser: 10
  defaultExpirationDays: 30
```

For a subject holding `record:read`, `record:write` and `user:read`, the results are recalculated whenever subject authorization changes:

| scopes                         | Effective permissions                   | roles                  |
| ------------------------------ | --------------------------------------- | ---------------------- |
| Omitted or `[]`                | Identity only, no operation permissions | `[]`                   |
| `['record:read']`              | `record:read`                           | `[]`                   |
| `['record:*']`                 | `record:read`, `record:write`           | `[]`                   |
| `['record:read', 'user:read']` | Both specified permissions              | `[]`                   |
| `['missing:read']`             | None, because the subject lacks it      | `[]`                   |
| `['*']`                        | All current subject permissions         | Subject roles retained |

`record:*` matches every level after the colon; arbitrary patterns such as `record:r*` are unsupported. If the subject only holds `record:read`, `['record:*']` still grants only read. Intersections with subject wildcards keep the narrower range. Restricted Keys have no role authorization; use permission guards. Choose explicit `*` only when broad access is intended.

The server examples cover creation → Key login → Bearer verification and operation authorization → listing → revocation. Administrative endpoints must verify ownership or administrator rights; IAM does not know the caller's business identity.

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

Only `rawKey` can be used for Key login. `apiKey.id` is a management ID and `keyPrefix` is for display/search. `verifyApiKey(rawKey)` validates Key metadata only; it does not replace user-status, scope or operation authorization.

Key-derived sessions remain bound to the Key when refreshed through `iam.session.refresh`. Successful revocation invalidates existing accessToken get/verify operations and refreshToken refresh operations. Expiration, disabling or persistent-read failures also reject access. Current role changes are enforced through `iam.auth.verifyToken`. There is no scope-update API; create a replacement Key and revoke the old one.

`expirationDays: 0` means no expiration; omission uses `apikey.defaultExpirationDays`. Set an explicit duration for time-limited access. Never put raw Keys or Tokens in URLs, logs, public configuration or ordinary localStorage.

##### Considerations

- **No plaintext persistence**: only hashes are stored; `rawKey` at creation is the sole opportunity to retrieve it.
- **Prefix lookup**: `keyPrefix` narrows candidates without a full table scan.
- **Count limit**: at most `maxKeysPerUser` (default 10) keys per user.
- **Explicit enablement**: API keys initialize only with `login.apikey: true`.

---

### More usage

See the skill template (Chinese) for detailed API parameters, codes, and integration patterns: `packages/cli/templates/skills/hai-iam/SKILL.md`.

### Frontend API calls

Public HTTP APIs are defined by `@h-ai/api-contract` and called through the `@h-ai/api-client` typed client:

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

### Password reset

Password reset requires `passwordReset.enabled` and a working delivery callback/Reach template. Success does not prove that the account exists or the recipient received a message. Handle delivery/internal failures through HaiResult. Reset tokens expire, limit attempts, and permit one successful consumption; success revokes old sessions. Administrator resets do not require the old password, but applications must authorize the administrator.

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

### One-time tickets — `iam.ticket`

Short-lived capability tickets for channels that cannot carry Bearer tokens, such as WebSocket URLs. An authenticated HTTP request issues a ticket bound to a subject, purpose, and operation. The server **atomically consumes** it on first validation, making it valid only once.

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

Features: cryptographically secure randomness, TTL, atomic single use (only one concurrent consumer succeeds), and purpose binding to prevent cross-purpose replay.

### Configuration driven authentication

`iam.publicConfig` and the client's `client.iam.auth.publicConfig()` HTTP contract expose a safe configuration whitelist and only advertise configured, available methods. `login.password/otp/ldap`, `otp.email/sms`, `register.enabled/defaultEnabled`, `passwordReset.enabled/mode/resetUrl` and agreement display flags are independent. `ui` configures card/split layout, title, subtitle, brand text, Logo and illustration URLs. Browser links only accept HTTP(S). LDAP is optional and disabled by default; install ldapts only for the default client, or inject a custom factory.

When using optional Reach, initialize it after reldb/cache and call `iam.init({ ...settings, reach })`. Standard `otp_email`, `otp_sms`, `password_reset` and `password_reset_sms` templates supply notification callbacks. Explicit callbacks override these defaults. Configure a real SMTP, SMS or HTTP provider for delivery; Console records metadata only. Delivery failures return errors.

SvelteKit routes export handlers from `kit.auth.createApi(iam)`; use `kit.auth.publicPaths` for anonymous endpoints and `kit.client.createAuthActions()` for Cookie based form actions. HTTP clients use `apiClient.createAuthActions(client)`, which saves successful authentication tokens through the configured storage. Pass actions and config to `AuthPanel` for login, registration and password recovery. Individual `LoginForm` components support `methods/onsendotp/resendInterval`; password forms accept the full `passwordPolicy`. Administrators use permission-guarded `iam.user.createUser()`; disabling public registration does not disable administrator creation.

Agreements open in a Modal without losing form input. URL pages must allow iframe embedding; scripts are disabled and a new-window fallback is available. LoginForm/RegisterForm expose `header/extraFields/footer` snippets. AuthPanel forwards `loginHeader/loginFields/loginFooter` and `registerHeader/registerFields/registerFooter`; application state and actions handle additional fields. See [UI usage](../ui/README.en.md#configuration-driven-authentication).

All nodes must share a database and Redis. Memory is limited to one process. Login counters and lock expiry use atomic database updates. OTP attempt limits, resend intervals and consumption use shared state; consuming/exhausting a code does not reset the resend interval. Reset TTL and attempt limits use shared cache and per-user locks: policy failures count, only the newest token is valid, and concurrent use succeeds once. Reset revokes old sessions and clears login locks. Disabled users cannot authenticate. Server password policy is authoritative.

Standard endpoints: `GET /auth/config`, `POST /auth/login/ldap`, `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm`. Security errors: `SECURITY_BUSY (hai:iam:023)` and `PASSWORD_RESET_DISABLED (hai:iam:024)`. Declare optional fields such as `ldap` in YAML before overriding them, or replace the module configuration with a JSON value in `HAI_IAM`. Existing fields support overrides such as `HAI_IAM_LOGIN_OTP`.

`passwordReset.mode` selects `email` (default, `password_reset`) or `phone` (`password_reset_sms`); the public config tells the recovery form which identifier to request.

#### Markdown agreements

Configure `agreements.userAgreementMarkdown` and `privacyPolicyMarkdown` to load agreement content directly from configuration. YAML `|` preserves paragraphs and newlines. The modal reuses the safe MarkdownRenderer with raw HTML, scripts and code tools disabled. Markdown takes priority over a URL for the same agreement; a URL remains an optional external-view link. URL-only agreements use a sandboxed iframe.

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

### Error handling

All operations return `HaiResult<T>`; branch on `HaiIamError`:

```ts
import { HaiIamError, iam } from '@h-ai/iam'

const result = await iam.auth.login({ identifier: 'admin', password: 'wrong' })
if (!result.success) {
  if (result.error.code === HaiIamError.INVALID_CREDENTIALS.code) {
    // 用户名或密码错误
  }
}
```

### Optional integrations

Role lists aggregate actual member counts for the current page with one `iam.authz.getRoleUserCounts(roleIds)` call, returning `HaiResult<Map<string, number>>`. Unassigned roles get 0; failed queries show loading errors rather than fabricated zero counts.


Sessions and refresh consumption share one versioned `hai:iam:sessions:{SHA256(userId)}` document, replacing separate mappings/indexes. Bearer tokens contain an untrusted routing hint plus 256 random bits; clients must treat them as opaque strings. Rotation checks `Session.version` at commit. Memory is for single-process tests; production nodes share Redis, including Cluster. Conflicts retry from the latest state and return CONFLICT when exhausted; one refresh cannot publish two successors. An ambiguous lost response requires failing closed and signing in again, without assuming the old token remains valid. All records remain covered by the same user index.

`iam.session.update(token, patch, expectedVersion)` requires the Session.version from the read. Stale versions return CONFLICT; revoked tokens return SESSION_NOT_FOUND. Timestamp-only sliding updates keep the content version, allowing normal parallel requests. Batch permission updates bind the initial token/version set and never apply delayed snapshots to later sign-ins; newer content versions require re-reading authorization before retry.

## Development and testing

```bash
pnpm test
```

## License

Apache-2.0

`create({ maxAge })` overrides the configured default with a positive safe integer in seconds, persisted as `Session.maxAge`. Issuance and refresh return that duration in `expiresIn`. Sliding renewal uses this duration and returns committed `lastActiveAt/expiresAt`; delayed requests cannot shorten a newer renewal. Explicit `update` applies valid date patches and creates a new content version. Clients schedule refresh from the returned `expiresIn` rather than a hardcoded default.

Access and refresh expire independently. The user partition remains until the latest live access/refresh deadline, while access authentication checks only its own `expiresAt`. An expired access token can still be rotated with a live refresh token. Each rotation starts a new `refreshTokenMaxAge` period and invalidates both old credentials. Access deletion, logoutAll and single-device replacement also revoke refresh-only records; revokeRefresh preserves a still-live access token. Refresh routes validate refresh credentials without requiring a live access token first.

Session cache read/commit failures return failed HaiResult values, never absence/expiry or cleanup compensation. Sessions and their index share one document, so batch updates no longer use per-token get/ttl calls or a separate index; cleanup uses confirmed absolute deadlines only. After recovery, re-read and retry updates/logout; logoutAll still covers every original record. Malformed state fails closed and is preserved for operator repair instead of being overwritten with an empty document.
