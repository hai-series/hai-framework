---
name: hai-usage-iam
description: "Use when: using @h-ai/iam, authentication, login, register, session management, RBAC, roles, permissions, user management, password reset, OTP, LDAP, token management, API contracts. 使用 @h-ai/iam 进行身份认证、Bearer Token 管理与 RBAC 授权。"
---

# hai-usage-iam — 身份与访问管理指南

> `@h-ai/iam` 是统一的身份与访问管理模块，支持多种认证策略（密码/OTP/LDAP）、Bearer Token 管理和 RBAC 授权。依赖 `@h-ai/reldb`（持久化）、`@h-ai/cache`（Token + 权限缓存）、`@h-ai/crypto`（密码哈希）。

---

## §1 配置与初始化

### 配置

```yaml
# config/_iam.yml
password:
  minLength: ${HAI_IAM_PASSWORD_MIN_LENGTH:8}
  requireUppercase: true
  requireNumber: true
session:
  maxAge: ${HAI_IAM_SESSION_MAX_AGE:86400}
  refreshTokenMaxAge: ${HAI_IAM_REFRESH_TOKEN_MAX_AGE:604800}
  sliding: true
  singleDevice: false
login:
  password: true
  otp: false
register:
  enabled: true
security:
  maxLoginAttempts: ${HAI_IAM_MAX_LOGIN_ATTEMPTS:5}
  lockoutDuration: 900
rbac:
  defaultRole: user
  superAdminRole: super_admin
```

### 初始化

```typescript
import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { iam } from '@h-ai/iam'

// 必须先初始化 db 和 cache
await reldb.init(core.config.get('db'))
await cache.init(core.config.get('cache'))

await iam.init({
  db: reldb,
  cache,
  ...core.config.get('iam'),
  seedDefaultData: true,
})
```

初始化自动创建 6 张表：`hai_iam_users`、`hai_iam_roles`、`hai_iam_permissions`、`hai_iam_role_permissions`、`hai_iam_user_roles`、`hai_iam_api_keys`。

Token 和 OTP 存储在 cache 中（不落库）。

---

## §2 认证 — `iam.auth`

| 方法 | 签名 | 说明 |
|------|------|------|
| `login` | `({ identifier, password }) => Promise<HaiResult<AuthResult>>` | 密码登录 |
| `loginWithOtp` | `({ identifier, code }) => Promise<HaiResult<AuthResult>>` | OTP 登录 |
| `loginWithLdap` | `({ username, password }) => Promise<HaiResult<AuthResult>>` | LDAP 登录 |
| `loginWithApiKey` | `({ key }) => Promise<HaiResult<AuthResult>>` | API Key 登录（需启用 `login.apikey`） |
| `sendOtp` | `(identifier) => Promise<HaiResult<{ expiresAt }>>` | 发送 OTP |
| `verifyToken` | `(token) => Promise<HaiResult<Session>>` | 验证令牌 |
| `logout` | `(token) => Promise<HaiResult<void>>` | 登出 |
| `registerAndLogin` | `(options: RegisterOptions) => Promise<HaiResult<AuthResult>>` | 注册并登录（一站式） |

**AuthResult**：

```typescript
interface AuthResult {
  user: User
  tokens: TokenPair
  agreements?: AgreementDisplay
}

interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: 'Bearer'
}
```

---

## §3 会话管理 — `iam.session`

| 方法 | 签名 | 说明 |
|------|------|------|
| `create` | `({ userId, username, roles, source? }) => Promise<HaiResult<Session>>` | 创建会话 |
| `get` | `(token) => Promise<HaiResult<Session \| null>>` | 获取会话（滑动续期） |
| `verifyToken` | `(token) => Promise<HaiResult<Session>>` | 验证令牌 |
| `update` | `(token, data: Partial<Session>) => Promise<HaiResult<void>>` | 更新会话字段 |
| `delete` | `(token) => Promise<HaiResult<void>>` | 删除会话 |
| `deleteByUserId` | `(userId) => Promise<HaiResult<number>>` | 强制下线（返回删除数量） |
| `refresh` | `(refreshToken) => Promise<HaiResult<TokenPair>>` | 刷新 Token（rotation） |
| `revokeRefresh` | `(refreshToken) => Promise<HaiResult<void>>` | 吊销 refreshToken |
| `patchUserSessions` | `(userId, updates: SessionFieldUpdates) => Promise<HaiResult<void>>` | 批量更新用户活跃会话的 roles/permissions |

**Token 刷新（rotation）**：`refresh()` 删除旧 Token 对，创建新 session，旧 refreshToken 立即失效。

---

## §4 用户管理 — `iam.user`

| 方法 | 签名 | 说明 |
|------|------|------|
| `register` | `(input) => Promise<HaiResult<RegisterResult>>` | 注册 |
| `getCurrentUser` | `(token) => Promise<HaiResult<User>>` | 通过令牌获取当前用户 |
| `updateCurrentUser` | `(token, data: UpdateCurrentUserInput) => Promise<HaiResult<User>>` | 更新当前用户（白名单字段） |
| `getUser` | `(id, options?) => Promise<HaiResult<User \| null>>` | 获取用户（可 include roles） |
| `listUsers` | `(options?) => Promise<HaiResult<PaginatedResult<User>>>` | 分页列表（支持 search + include） |
| `updateUser` | `(id, data) => Promise<HaiResult<User>>` | 更新用户 |
| `deleteUser` | `(id) => Promise<HaiResult<void>>` | 删除用户（清除会话 + 角色关联） |
| `changePassword` | `(id, old, new) => Promise<HaiResult<void>>` | 修改密码（按用户 ID） |
| `changeCurrentUserPassword` | `(token, old, new) => Promise<HaiResult<void>>` | 当前用户修改密码（按令牌） |
| `requestPasswordReset` | `(email) => Promise<HaiResult<void>>` | 请求重置（防枚举） |
| `confirmPasswordReset` | `(token, newPassword) => Promise<HaiResult<void>>` | 确认重置 |
| `adminResetPassword` | `(userId, newPassword) => Promise<HaiResult<void>>` | 管理员重置 |
| `validatePassword` | `(password) => HaiResult<void>` | 密码强度验证（**同步**） |

---

## §5 RBAC 授权 — `iam.authz`

### 权限检查

| 方法 | 签名 | 说明 |
|------|------|------|
| `checkPermission` | `(userId, permission) => Promise<HaiResult<boolean>>` | 检查权限（支持通配符） |
| `getUserPermissions` | `(userId) => Promise<HaiResult<Permission[]>>` | 获取用户所有权限 |
| `getUserRoles` | `(userId) => Promise<HaiResult<Role[]>>` | 获取用户角色 |
| `getUserRolesForMany` | `(userIds[]) => Promise<HaiResult<Map<string, Role[]>>>` | 批量获取多用户角色 |
| `getRolePermissionsForMany` | `(roleIds[]) => Promise<HaiResult<Map<string, Permission[]>>>` | 批量获取多角色权限 |

### 角色管理

| 方法 | 签名 | 说明 |
|------|------|------|
| `createRole` | `({ code, name, description? }, tx?) => Promise<HaiResult<Role>>` | 创建角色 |
| `getRole` | `(roleId) => Promise<HaiResult<Role \| null>>` | 获取角色 |
| `getRoleByCode` | `(code) => Promise<HaiResult<Role \| null>>` | 按 code 获取角色 |
| `getAllRoles` | `(options?) => Promise<HaiResult<PaginatedResult<Role>>>` | 分页获取所有角色 |
| `updateRole` | `(roleId, data, tx?) => Promise<HaiResult<Role>>` | 更新角色 |
| `deleteRole` | `(roleId, tx?) => Promise<HaiResult<void>>` | 删除角色（事务清关联） |

### 权限管理

| 方法 | 签名 | 说明 |
|------|------|------|
| `createPermission` | `({ code, name, type?, resource?, action? }, tx?) => Promise<HaiResult<Permission>>` | 创建权限 |
| `getPermission` | `(permissionId) => Promise<HaiResult<Permission \| null>>` | 获取权限 |
| `getPermissionByCode` | `(code) => Promise<HaiResult<Permission \| null>>` | 按 code 获取权限 |
| `getAllPermissions` | `(options?) => Promise<HaiResult<PaginatedResult<Permission>>>` | 分页获取所有权限（可按 type 筛选） |
| `deletePermission` | `(permissionId, tx?) => Promise<HaiResult<void>>` | 删除权限（事务清关联） |

### 分配操作

| 方法 | 签名 | 说明 |
|------|------|------|
| `assignRole` | `(userId, roleId, tx?) => Promise<HaiResult<void>>` | 分配角色给用户 |
| `removeRole` | `(userId, roleId, tx?) => Promise<HaiResult<void>>` | 移除用户角色 |
| `syncRoles` | `(userId, roleIds[], tx?) => Promise<HaiResult<void>>` | 同步用户角色（全量替换） |
| `assignPermissionToRole` | `(roleId, permId, tx?) => Promise<HaiResult<void>>` | 分配权限给角色 |
| `removePermissionFromRole` | `(roleId, permId, tx?) => Promise<HaiResult<void>>` | 移除角色权限 |
| `getRolePermissions` | `(roleId) => Promise<HaiResult<Permission[]>>` | 获取角色的权限列表 |

**通配符**：`admin:*` 匹配 `admin:read`、`admin:write`。超管角色自动拥有所有权限。

---

## §6 API 契约 — `@h-ai/iam/api`

```typescript
import { iamEndpoints } from '@h-ai/iam/api'

// ── 认证 ──
iamEndpoints.login              // POST   /auth/login
iamEndpoints.loginWithOtp       // POST   /auth/login/otp
iamEndpoints.sendOtp            // POST   /auth/otp/send
iamEndpoints.logout             // POST   /auth/logout
iamEndpoints.register           // POST   /auth/register
iamEndpoints.currentUser        // GET    /auth/me
iamEndpoints.updateCurrentUser  // PUT    /auth/me
iamEndpoints.refreshToken       // POST   /auth/refresh
iamEndpoints.changePassword     // POST   /auth/change-password

// ── 用户管理 ──
iamEndpoints.listUsers          // GET    /iam/users
iamEndpoints.getUser            // GET    /iam/users/:id
iamEndpoints.createUser         // POST   /iam/users
iamEndpoints.updateUser         // PUT    /iam/users/:id
iamEndpoints.deleteUser         // DELETE /iam/users/:id
iamEndpoints.adminResetPassword // POST   /iam/users/:id/reset-password

// ── 角色管理 ──
iamEndpoints.listRoles          // GET    /iam/roles
iamEndpoints.getRole            // GET    /iam/roles/:id
iamEndpoints.createRole         // POST   /iam/roles
iamEndpoints.updateRole         // PUT    /iam/roles/:id
iamEndpoints.deleteRole         // DELETE /iam/roles/:id

// ── 权限管理 ──
iamEndpoints.listPermissions    // GET    /iam/permissions
iamEndpoints.getPermission      // GET    /iam/permissions/:id
iamEndpoints.createPermission   // POST   /iam/permissions
iamEndpoints.deletePermission   // DELETE /iam/permissions/:id
```

```typescript
// 服务端
export const POST = kit.fromContract(iamEndpoints.login, async (input) => {
  const result = await iam.auth.login(input)
  return result.success ? kit.response.ok(result.data) : kit.response.unauthorized()
})

// 客户端
const result = await api.call(iamEndpoints.login, { username, password })
```

---

## §7 与 kit 集成

### hooks.server.ts 模式

```typescript
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

async function validateSession(token: string) {
  const result = await iam.auth.verifyToken(token)
  if (!result.success) return null
  const roles = await iam.authz.getUserRoles(result.data.userId)
  return {
    userId: result.data.userId,
    username: result.data.username,
    roles: roles.success ? roles.data.map(r => r.code) : [],
    permissions: [],
  }
}

export const handle = kit.auth.createHandle({
  i18nHandle,
  validateSession,
  publicPaths: ['/auth', '/api/auth', '/api/public'],
})
```

### API 端点权限检查

```typescript
export const GET = kit.handler(async ({ locals }) => {
  kit.guard.require(locals.session, 'user:list')
  // ...
})
```

### 客户端认证

```typescript
// 登录 → 保存 Token
const login = await api.call(iamEndpoints.login, { username, password })
if (login.success) {
  await api.auth.setTokens(login.data.tokens)
}

// Token 过期自动刷新
// 刷新失败清除 Token 并跳转登录页
```

---

## §8 API Key 管理 — `iam.apiKey`

> 需在配置中启用 `login.apikey: true`，否则 `iam.apiKey` 返回未初始化代理。

| 方法 | 签名 | 说明 |
|------|------|------|
| `createApiKey` | `(userId, { name, expirationDays?, scopes? }) => Promise<HaiResult<CreateApiKeyResult>>` | 创建 API Key（`rawKey` 仅返回一次） |
| `listApiKeys` | `(userId) => Promise<HaiResult<ApiKey[]>>` | 列出用户的 API Key |
| `getApiKey` | `(keyId) => Promise<HaiResult<ApiKey \| null>>` | 获取 API Key 详情 |
| `revokeApiKey` | `(keyId) => Promise<HaiResult<void>>` | 吊销 API Key |
| `verifyApiKey` | `(rawKey) => Promise<HaiResult<ApiKey>>` | 验证 API Key 有效性 |

```typescript
// 创建（rawKey 仅此一次展示）
const result = await iam.apiKey.createApiKey(userId, {
  name: 'CI/CD',
  expirationDays: 90,
  scopes: ['api:read'],
})
const { apiKey, rawKey } = result.data

// API Key 登录
const loginResult = await iam.auth.loginWithApiKey({ key: rawKey })
```

**配置**：`apikey.maxKeysPerUser`（默认 10）、`apikey.defaultExpirationDays`（默认 0=永不过期）、`apikey.prefix`（默认 `hai_`）。

---

## §9 自动会话失效

以下操作自动清除受影响用户的所有活跃会话：
- `deleteUser` / `updateUser({ enabled: false })` / `changePassword` / `confirmPasswordReset`

以下操作通过 `patchUserSessions` 同步更新活跃会话中的角色/权限列表（best-effort）：
- `assignRole` / `removeRole` / `syncRoles` / `deleteRole`
- `assignPermissionToRole` / `removePermissionFromRole`

---

## §10 错误码 — `HaiIamError`

| 错误码 | code | 说明 |
|--------|------|------|
| **认证** | | |
| `HaiIamError.AUTH_FAILED` | `hai:iam:001` | 认证失败 |
| `HaiIamError.INVALID_CREDENTIALS` | `hai:iam:002` | 凭证无效 |
| `HaiIamError.USER_NOT_FOUND` | `hai:iam:003` | 用户不存在 |
| `HaiIamError.USER_DISABLED` | `hai:iam:004` | 用户已禁用 |
| `HaiIamError.USER_LOCKED` | `hai:iam:005` | 用户已锁定 |
| `HaiIamError.USER_ALREADY_EXISTS` | `hai:iam:006` | 用户已存在 |
| `HaiIamError.PASSWORD_EXPIRED` | `hai:iam:007` | 密码已过期 |
| `HaiIamError.PASSWORD_POLICY_VIOLATION` | `hai:iam:008` | 密码不符合策略 |
| `HaiIamError.OTP_INVALID` | `hai:iam:009` | 验证码无效 |
| `HaiIamError.OTP_EXPIRED` | `hai:iam:010` | 验证码已过期 |
| `HaiIamError.OTP_RESEND_TOO_FAST` | `hai:iam:011` | 发送过于频繁 |
| `HaiIamError.LOGIN_DISABLED` | `hai:iam:012` | 登录方式已禁用 |
| `HaiIamError.REGISTER_DISABLED` | `hai:iam:013` | 注册已禁用 |
| `HaiIamError.STRATEGY_NOT_SUPPORTED` | `hai:iam:014` | 认证策略不支持 |
| `HaiIamError.APIKEY_INVALID` | `hai:iam:015` | API Key 无效 |
| `HaiIamError.APIKEY_EXPIRED` | `hai:iam:016` | API Key 已过期 |
| `HaiIamError.APIKEY_DISABLED` | `hai:iam:017` | API Key 已禁用 |
| `HaiIamError.APIKEY_NOT_FOUND` | `hai:iam:018` | API Key 不存在 |
| `HaiIamError.RESET_TOKEN_INVALID` | `hai:iam:019` | 重置令牌无效 |
| `HaiIamError.RESET_TOKEN_EXPIRED` | `hai:iam:020` | 重置令牌已过期 |
| `HaiIamError.RESET_TOKEN_MAX_ATTEMPTS` | `hai:iam:021` | 重置验证次数超限 |
| **会话** | | |
| `HaiIamError.SESSION_NOT_FOUND` | `hai:iam:101` | 会话不存在 |
| `HaiIamError.SESSION_EXPIRED` | `hai:iam:102` | 会话已过期 |
| `HaiIamError.SESSION_INVALID` | `hai:iam:103` | 会话无效 |
| `HaiIamError.SESSION_CREATE_FAILED` | `hai:iam:104` | 会话创建失败 |
| `HaiIamError.TOKEN_EXPIRED` | `hai:iam:105` | 令牌已过期 |
| `HaiIamError.TOKEN_INVALID` | `hai:iam:106` | 令牌无效 |
| `HaiIamError.TOKEN_REFRESH_FAILED` | `hai:iam:107` | 令牌刷新失败 |
| **授权** | | |
| `HaiIamError.PERMISSION_DENIED` | `hai:iam:201` | 权限不足 |
| `HaiIamError.ROLE_NOT_FOUND` | `hai:iam:202` | 角色不存在 |
| `HaiIamError.PERMISSION_NOT_FOUND` | `hai:iam:203` | 权限不存在 |
| `HaiIamError.ROLE_ALREADY_EXISTS` | `hai:iam:204` | 角色已存在 |
| `HaiIamError.PERMISSION_ALREADY_EXISTS` | `hai:iam:205` | 权限已存在 |
| **LDAP** | | |
| `HaiIamError.LDAP_CONNECTION_FAILED` | `hai:iam:301` | LDAP 连接失败 |
| `HaiIamError.LDAP_BIND_FAILED` | `hai:iam:302` | LDAP 绑定失败 |
| `HaiIamError.LDAP_SEARCH_FAILED` | `hai:iam:303` | LDAP 搜索失败 |
| **存储层** | | |
| `HaiIamError.REPOSITORY_ERROR` | `hai:iam:401` | 存储层操作错误 |
| `HaiIamError.NOT_FOUND` | `hai:iam:402` | 资源不存在 |
| `HaiIamError.CONFLICT` | `hai:iam:403` | 资源冲突 |
| **通用** | | |
| `HaiIamError.FORBIDDEN` | `hai:iam:501` | 禁止访问 |
| `HaiIamError.INVALID_ARGUMENT` | `hai:iam:502` | 参数无效 |
| `HaiIamError.CONFIG_ERROR` | `hai:iam:901` | 配置错误 |
| `HaiIamError.NOT_INITIALIZED` | `hai:iam:910` | 未初始化 |
| `HaiIamError.INTERNAL_ERROR` | `hai:iam:999` | 内部错误 |

---

## §11 常见模式

### 登录 → 操作 → 登出

```typescript
// 登录
const loginResult = await iam.auth.login({ identifier: 'admin', password: '...' })
if (!loginResult.success) { /* 处理错误 */ }
const { tokens, user } = loginResult.data

// 验证 Token
const session = await iam.auth.verifyToken(tokens.accessToken)

// 检查权限
const canEdit = await iam.authz.checkPermission(user.id, 'user:update')

// 登出
await iam.auth.logout(tokens.accessToken)
```

### 注册 + 分配角色

```typescript
const regResult = await iam.user.register({
  username: 'newuser',
  email: 'new@example.com',
  password: 'SecureP@ssw0rd',
})
if (regResult.success) {
  await iam.authz.assignRole(regResult.data.user.id, editorRoleId)
}
```

### 密码重置流程

```typescript
// 1. 请求重置（防枚举，始终返回成功）
await iam.user.requestPasswordReset('user@example.com')

// 2. 通过邮件链接的 token 重置
const resetResult = await iam.user.confirmPasswordReset(token, 'NewP@ssw0rd')
// 自动清除所有会话
```

---

## 示例触发语句

- "实现用户登录"
- "添加角色权限"
- "集成 IAM 认证"
- "实现密码重置"
- "配置 RBAC"
