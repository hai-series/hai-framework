# @h-ai/iam

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/audit](../audit/README.en.md) · [@h-ai/cache](../cache/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md) · [@h-ai/reldb](../reldb/README.en.md) · [@h-ai/reach](../reach/README.en.md)

Identity and access management through a unified `iam` object for authentication, sessions, authorization, and user management.

## Features

| Feature              | Description                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Authentication**   | Password, OTP (email/SMS codes), LDAP, and API Key strategies                                                          |
| **Sessions**         | Stateful sessions (random access tokens + cache, optional sliding renewal)                                             |
| **Authorization**    | RBAC roles and permissions (DB + cache, wildcard matching)                                                             |
| **User management**  | Registration, queries, updates, password reset, and admin password reset                                               |
| **API Key**          | Create, revoke, and verify API keys with scopes and expiration                                                         |
| **One-time tickets** | Short-lived capability tickets (issue / atomic consume) for channels such as WebSocket that cannot carry Bearer tokens |
| **Frontend client**  | HTTP API contracts for independent frontends                                                                           |

## Installation

```bash
pnpm add @h-ai/iam
```

## Dependencies

- `@h-ai/reldb`: persistence for users/roles/permissions; **initialize before iam.init()**.
- `@h-ai/cache`: sessions/OTP/reset tokens/permission cache; **initialize before iam.init()**.
- `@h-ai/crypto`: password hashing, used internally and initialized automatically.
- `@h-ai/audit`: audit records for key RBAC operations.

- `@h-ai/reach`: **optional**, installed, initialized and injected by the application for standard notifications; custom callbacks do not require Reach.
- `ldapts`: **optional**, loaded only when LDAP is explicitly enabled without an injected `ldapClientFactory`.

## Optional LDAP and notifications

Password authentication, users and RBAC work without LDAP or Reach. Both are optional peer dependencies: install only the integrations you use. The snippets below run inside application startup/authentication functions after reldb/cache initialization; `username/password` are validated input.

### LDAP / Active Directory

For the default client run `pnpm add ldapts`, then explicitly set `login.ldap: true` and connection settings. Connection settings alone do not enable LDAP. Enabling the default client without the SDK returns an initialization configuration error.

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

### Automatic delivery with optional Reach

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

### Custom email and SMS delivery

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

## Quick start

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

## Design

### Architecture

IAM is a **lifecycle singleton** managed through `iam.init()` / `iam.close()`. Five internal subsystems initialize in dependency order:

```
iam.init()
  ├─ session  (cached sessions; no DB dependency)
  ├─ authz    (RBAC roles/permissions; DB + cache)
  ├─ authn    (authentication; depends on session + authz)
  ├─ user     (users; depends on session + authz + passwordStrategy)
  └─ seed     (seed data; depends on authz)
```

All subsystems use **factories + closures** (for example `createSessionOperations(deps)`), not classes. Getters expose them as `iam.auth` / `iam.user` / `iam.authz` / `iam.session` / `iam.apiKey`.

Before initialization, every subsystem method returns `NOT_INITIALIZED` through a `NotInitializedKit` proxy.

### Data storage

| Data                                                | Storage                                      | Description                                                                                                                   |
| --------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Users, roles, permissions, associations, API keys   | DB (5 base tables, 1 optional API Key table) | `hai_iam_users`、`hai_iam_roles`、`hai_iam_permissions`、`hai_iam_role_permissions`、`hai_iam_user_roles`、`hai_iam_api_keys` |
| Sessions (accessToken → Session)                    | Cache                                        | TTL, optional sliding renewal                                                                                                 |
| Token mapping (refreshToken → userId + accessToken) | Cache                                        | Separate keys; old tokens expire immediately after refresh                                                                    |
| OTP codes                                           | Cache                                        | TTL + attempt limit                                                                                                           |
| Password reset tokens                               | Cache                                        | TTL + maximum verification attempts                                                                                           |
| API Key                                             | DB                                           | `hai_iam_api_keys`; store hashes only, never plaintext; prefix narrows candidates                                             |

---

### Authentication (authn) — `iam.auth`

#### Key types

- **`AuthnOperations`**: `login` / `loginWithOtp` / `loginWithLdap` / `loginWithApiKey` / `logout` / `verifyToken` / `sendOtp` / `registerAndLogin`.
- **`AuthStrategy`**: strategy interface (`type` + `authenticate` + `challenge?`), implemented for password, OTP, LDAP, and API Key.
- **`AuthResult`**: login result with user details, `TokenPair` (accessToken + refreshToken), and roles/permissions.
- **`Credentials`**: a credential union combining `{ type: 'password' | 'otp' | 'ldap' | 'apikey' }` with strategy-specific credentials.

#### Key workflows

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
  → Return Session (userId, roles, permissions)
```

#### Usage

`authz.createRole({ ..., permissionIds })` and `authz.updateRole(id, { ..., permissionIds })` save role data and the complete permission set in one transaction; any failure rolls back. `permissionIds: []` clears permissions, omission preserves them, duplicate IDs are deduplicated, and unknown permissions fail. Concurrent updates use the last committed complete set without merging. Self-managed commits synchronize user sessions; with an external transaction, the caller must synchronize after commit. Admin Console uses this API directly, without split updates or compensating role deletion.

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

#### Considerations

- **Timing attack mitigation**: perform a dummy password hash for nonexistent users to keep response timing consistent.
- **Account lockout**: lock for `lockoutDuration` seconds after `maxLoginAttempts` consecutive failures.
- **Independent strategy toggles**: `login.password` / `login.otp` / `login.ldap` / `login.apikey`.
- **OTP security**: rejection sampling avoids modulo bias, constant-time comparison mitigates timing attacks, and `resendInterval` limits frequency.

---

### Sessions (session) — `iam.session`

#### Key types

- **`SessionOperations`**: `create` / `get` / `verifyToken` / `update` / `delete` / `deleteByUserId` / `refresh` / `revokeRefresh` / `patchUserSessions`.
- **`Session`**: userId, roles, permissions, accessToken, expiration, and other session data.
- **`TokenPair`**: `{ accessToken, refreshToken, expiresIn, tokenType: 'Bearer' }`.

#### Key workflows

**Token refresh (rotation):**

```
refresh(refreshToken)
  → Read refreshToken → { userId, accessToken } from cache
  → Get old session via accessToken
  → Delete old refreshToken (expire key immediately to prevent replay)
  → Delete old accessToken session
  → Create a new session with the old user context
  → Return new TokenPair
```

**Single-device login:**

```
create(options) [singleDevice=true]
  → Clear all existing user tokens via user→tokens mapping
  → Generate new accessToken + refreshToken
  → Store session in cache
```

#### Usage

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

#### Considerations

- **Cache-only storage**: Memory sessions are lost on restart; shared Redis sessions survive IAM service restarts until TTL or revocation.
- **Sliding renewal**: with `sliding: true`, each `get()` extends TTL automatically.
- **Refresh rotation**: old refreshToken expires after one use; replay detection indicates token leakage.
- **Token strength**: 256-bit cryptographic randomness (`crypto.getRandomValues(new Uint8Array(32))`), base64url encoded.

---

### Authorization (authz) — `iam.authz`

Role lists use `iam.authz.getRoleUserCounts(roleIds)` to aggregate actual membership for the current page in one query, returning `HaiResult<Map<string, number>>`. Missing relations mean zero; query failures display an error instead of invented zero counts.

#### Key types

- **`AuthzOperations`**: role/permission CRUD, role-permission/user-role assignments, and permission checks.
- **`Role`**: `{ id, code, name, description, isSystem }`.
- **`Permission`**: `{ id, code, name, type, resource, action }`; type is `menu` / `api` / `button`.
- **`PermissionType`**: permission type enum.

#### Key workflows

**Permission checks (`checkPermission`):**

```
checkPermission(userId, permission)
  → Return true if RBAC is disabled
  → Query user roles (DB)
  → Check super-admin role (cached superAdminRoleId); return true if present
  → Get each role's permission codes (cache first; DB on miss, then cache)
  → Match each permission exactly or by wildcard (`admin:*` matches `admin:read`)
  → Return true / false
```

**Session synchronization after role/permission changes:**

```
assignPermissionToRole(roleId, permId)
  → Write association to DB
  → Clear role permission cache
  → Find role users → resolve permissions per user → update active sessions
  (best-effort: failures only log.error; permission assignment still succeeds)
```

#### Usage

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

#### Considerations

- **Wildcard matching**: `admin:*` matches `admin:read`, `admin:write:detail`, etc.; one `*` matches everything after the colon.
- **Super-admin role**: `rbac.superAdminRole` (default `super_admin`) automatically grants all permissions.
- **Transactions**: `deleteRole` / `deletePermission` clear associations before deleting entities in a DB transaction.
- **Session synchronization latency**: permission changes update active session permissions on a best-effort basis; many users may cause delay.
- **Seed data**: `seedDefaultData: true` idempotently creates admin/user/guest roles and basic permissions.

---

### Users (user) — `iam.user`

#### Key types

- **`UserOperations`**: registration, queries, updates, deletion, password changes/resets, and password strength validation.
- **`User`** (public fields): `{ id, username, email, phone, displayName, avatarUrl, enabled, roles? }`.
- **`StoredUser`**: internal stored user, including sensitive `passwordHash`, `loginFailedCount`, `lockedUntil`, etc.
- **`RegisterOptions`** / **`RegisterResult`**: registration input/output.
- **`UpdateCurrentUserInput`**: fields the current user may change (`displayName` / `avatarUrl` / `phone` / `metadata`).

#### Key workflows

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

#### Usage

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
  sortBy: 'createdAt',
  sortDirection: 'desc',
  include: ['roles'],
})
await iam.user.updateUser(userId, { enabled: false }) // 禁用用户 → 自动清除会话
await iam.user.deleteUser(userId) // 删除用户 → 事务清除角色关联

// 密码重置
await iam.user.requestPasswordReset('alice@example.com')
await iam.user.confirmPasswordReset(token, 'NewPassword456')
await iam.user.adminResetPassword(userId, 'TempPassword123')

// 密码强度验证（同步方法）
const valid = iam.user.validatePassword('weak')
```

#### Considerations

- **`toUser()` redaction**: public users omit sensitive fields such as `passwordHash` and `loginFailedCount`.
- **Session invalidation**: `deleteUser` / `updateUser({ enabled: false })` / `changePassword` / `confirmPasswordReset` clear all active sessions for affected users.
- **Enumeration protection**: `requestPasswordReset` returns `ok(undefined)` for nonexistent emails instead of an error.
- **Synchronous validatePassword**: the only synchronous method in `UserOperations`; all others are asynchronous.
- **Fuzzy search**: `listUsers` searches username, email, phone, and display name with escaped LIKE wildcards.
- **Server sorting**: `listUsers` allows only `username`, `email`, `displayName`, `enabled`, and `createdAt`, mapped through an allowlist; defaults to newest creation first.

---

### API keys — `iam.apiKey`

`scopes` intersect the subject's permissions and support `*` and namespace `:*`. The default empty array grants identity only, without operation permissions. Restricted keys have empty session `roles` and use permission guards; explicit `*` never exceeds subject authorization. API Key login binds the key ID: get/verifyToken/refresh recheck its persistent state and reject revoked, disabled, expired keys or DB failures. Standalone verifyApiKey returns verified key metadata and still requires subject/operation authorization.

#### Key types

- **`ApiKeyOperations`**: `createApiKey` / `listApiKeys` / `getApiKey` / `revokeApiKey` / `verifyApiKey`.
- **`ApiKey`** (public fields): `{ id, userId, name, keyPrefix, enabled, expiresAt, scopes }`.
- **`CreateApiKeyResult`**: `{ apiKey, rawKey }`; the plaintext key is returned only once.

#### Key workflows

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

#### Usage

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

#### Considerations

- **No plaintext persistence**: only hashes are stored; `rawKey` at creation is the sole opportunity to retrieve it.
- **Prefix lookup**: `keyPrefix` narrows candidates without a full table scan.
- **Count limit**: at most `maxKeysPerUser` (default 10) keys per user.
- **Explicit enablement**: API keys initialize only with `login.apikey: true`.

---

## More usage

See the skill template (Chinese) for detailed API parameters, codes, and integration patterns: `packages/cli/templates/skills/hai-iam/SKILL.md`.

## Frontend API calls

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

## Password reset

```ts
// 请求重置（即使用户不存在也返回 ok，防止枚举）
await iam.user.requestPasswordReset('admin@example.com')

// 确认重置（校验令牌有效期和尝试次数 → 更新密码 → 清除所有会话）
const result = await iam.user.confirmPasswordReset(token, 'NewPassword456')

// 管理员重置（无需旧密码）
await iam.user.adminResetPassword(userId, 'TempPassword123')
```

## One-time tickets — `iam.ticket`

Short-lived capability tickets for channels that cannot carry Bearer tokens, such as WebSocket URLs. An authenticated HTTP request issues a ticket bound to a subject, purpose, and operation. The server **atomically consumes** it on first validation, making it valid only once.

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

Features: cryptographically secure randomness, TTL, atomic single use (only one concurrent consumer succeeds), and purpose binding to prevent cross-purpose replay.

## Configuration driven authentication

`iam.publicConfig` and the client's `client.iam.auth.publicConfig()` HTTP contract expose a safe configuration whitelist and only advertise configured, available methods. `login.password/otp/ldap`, `otp.email/sms`, `register.enabled/defaultEnabled`, `passwordReset.enabled/mode/resetUrl` and agreement display flags are independent. `ui` configures card/split layout, title, subtitle, brand text, Logo and illustration URLs. Browser links only accept HTTP(S). LDAP is optional and disabled by default; install ldapts only for the default client, or inject a custom factory.

When using optional Reach, initialize it after reldb/cache and call `iam.init({ ...settings, reach })`. Standard `otp_email`, `otp_sms`, `password_reset` and `password_reset_sms` templates supply notification callbacks. Explicit callbacks override these defaults. Configure a real SMTP, SMS or HTTP provider for delivery; Console records metadata only. Delivery failures return errors.

SvelteKit routes export handlers from `kit.auth.createApi(iam)`; use `kit.auth.publicPaths` for anonymous endpoints and `kit.client.createAuthActions()` for Cookie based form actions. HTTP clients use `apiClient.createAuthActions(client)`, which saves successful authentication tokens through the configured storage. Pass actions and config to `AuthPanel` for login, registration and password recovery. Individual `LoginForm` components support `methods/onsendotp/resendInterval`; password forms accept the full `passwordPolicy`. Administrators use permission-guarded `iam.user.createUser()`; disabling public registration does not disable administrator creation.

Agreements open in a Modal without losing form input. URL pages must allow iframe embedding; scripts are disabled and a new-window fallback is available. LoginForm/RegisterForm expose `header/extraFields/footer` snippets. AuthPanel forwards `loginHeader/loginFields/loginFooter` and `registerHeader/registerFields/registerFooter`; application state and actions handle additional fields. See [UI usage](../ui/README.en.md#configuration-driven-authentication).

All nodes must share a database and Redis. Memory is limited to one process. Login counters and lock expiry use atomic database updates. OTP attempt limits, resend intervals and consumption use shared state; consuming/exhausting a code does not reset the resend interval. Reset TTL and attempt limits use shared cache and per-user locks: policy failures count, only the newest token is valid, and concurrent use succeeds once. Reset revokes old sessions and clears login locks. Disabled users cannot authenticate. Server password policy is authoritative.

Standard endpoints: `GET /auth/config`, `POST /auth/login/ldap`, `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm`. Security errors: `SECURITY_BUSY (hai:iam:023)` and `PASSWORD_RESET_DISABLED (hai:iam:024)`. Declare optional fields such as `ldap` in YAML before overriding them, or replace the module configuration with a JSON value in `HAI_IAM`. Existing fields support overrides such as `HAI_IAM_LOGIN_OTP`.

`passwordReset.mode` selects `email` (default, `password_reset`) or `phone` (`password_reset_sms`); the public config tells the recovery form which identifier to request.

### Markdown agreements

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

## Error handling

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

## Tests

```bash
pnpm test
```

## License

Apache-2.0

Role lists aggregate actual member counts for the current page with one `iam.authz.getRoleUserCounts(roleIds)` call, returning `HaiResult<Map<string, number>>`. Unassigned roles get 0; failed queries show loading errors rather than fabricated zero counts.
