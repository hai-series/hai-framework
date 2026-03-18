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
| `login` | `({ identifier, password }) => Promise<Result<AuthResult>>` | 密码登录 |
| `loginWithOtp` | `({ identifier, code }) => Promise<Result<AuthResult>>` | OTP 登录 |
| `loginWithLdap` | `({ username, password }) => Promise<Result<AuthResult>>` | LDAP 登录 |
| `loginWithApiKey` | `({ key }) => Promise<Result<AuthResult>>` | API Key 登录（需启用 `login.apikey`） |
| `sendOtp` | `(identifier) => Promise<Result<{ expiresAt }>>` | 发送 OTP |
| `verifyToken` | `(token) => Promise<Result<Session>>` | 验证令牌 |
| `logout` | `(token) => Promise<Result<void>>` | 登出 |
| `registerAndLogin` | `(options: RegisterOptions) => Promise<Result<AuthResult>>` | 注册并登录（一站式） |

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
| `create` | `({ userId, username, roles, source? }) => Promise<Result<Session>>` | 创建会话 |
| `get` | `(token) => Promise<Result<Session \| null>>` | 获取会话（滑动续期） |
| `verifyToken` | `(token) => Promise<Result<Session>>` | 验证令牌 |
| `update` | `(token, data: Partial<Session>) => Promise<Result<void>>` | 更新会话字段 |
| `delete` | `(token) => Promise<Result<void>>` | 删除会话 |
| `deleteByUserId` | `(userId) => Promise<Result<number>>` | 强制下线（返回删除数量） |
| `refresh` | `(refreshToken) => Promise<Result<TokenPair>>` | 刷新 Token（rotation） |
| `revokeRefresh` | `(refreshToken) => Promise<Result<void>>` | 吊销 refreshToken |
| `patchUserSessions` | `(userId, updates: SessionFieldUpdates) => Promise<Result<void>>` | 批量更新用户活跃会话的 roles/permissions |

**Token 刷新（rotation）**：`refresh()` 删除旧 Token 对，创建新 session，旧 refreshToken 立即失效。

---

## §4 用户管理 — `iam.user`

| 方法 | 签名 | 说明 |
|------|------|------|
| `register` | `(input) => Promise<Result<RegisterResult>>` | 注册 |
| `getCurrentUser` | `(token) => Promise<Result<User>>` | 通过令牌获取当前用户 |
| `updateCurrentUser` | `(token, data: UpdateCurrentUserInput) => Promise<Result<User>>` | 更新当前用户（白名单字段） |
| `getUser` | `(id, options?) => Promise<Result<User \| null>>` | 获取用户（可 include roles） |
| `listUsers` | `(options?) => Promise<Result<PaginatedResult<User>>>` | 分页列表（支持 search + include） |
| `updateUser` | `(id, data) => Promise<Result<User>>` | 更新用户 |
| `deleteUser` | `(id) => Promise<Result<void>>` | 删除用户（清除会话 + 角色关联） |
| `changePassword` | `(id, old, new) => Promise<Result<void>>` | 修改密码（按用户 ID） |
| `changeCurrentUserPassword` | `(token, old, new) => Promise<Result<void>>` | 当前用户修改密码（按令牌） |
| `requestPasswordReset` | `(email) => Promise<Result<void>>` | 请求重置（防枚举） |
| `confirmPasswordReset` | `(token, newPassword) => Promise<Result<void>>` | 确认重置 |
| `adminResetPassword` | `(userId, newPassword) => Promise<Result<void>>` | 管理员重置 |
| `validatePassword` | `(password) => Result<void>` | 密码强度验证（**同步**） |

---

## §5 RBAC 授权 — `iam.authz`

### 权限检查

| 方法 | 签名 | 说明 |
|------|------|------|
| `checkPermission` | `(userId, permission) => Promise<Result<boolean>>` | 检查权限（支持通配符） |
| `getUserPermissions` | `(userId) => Promise<Result<Permission[]>>` | 获取用户所有权限 |
| `getUserRoles` | `(userId) => Promise<Result<Role[]>>` | 获取用户角色 |
| `getUserRolesForMany` | `(userIds[]) => Promise<Result<Map<string, Role[]>>>` | 批量获取多用户角色 |
| `getRolePermissionsForMany` | `(roleIds[]) => Promise<Result<Map<string, Permission[]>>>` | 批量获取多角色权限 |

### 角色管理

| 方法 | 签名 | 说明 |
|------|------|------|
| `createRole` | `({ code, name, description? }, tx?) => Promise<Result<Role>>` | 创建角色 |
| `getRole` | `(roleId) => Promise<Result<Role \| null>>` | 获取角色 |
| `getRoleByCode` | `(code) => Promise<Result<Role \| null>>` | 按 code 获取角色 |
| `getAllRoles` | `(options?) => Promise<Result<PaginatedResult<Role>>>` | 分页获取所有角色 |
| `updateRole` | `(roleId, data, tx?) => Promise<Result<Role>>` | 更新角色 |
| `deleteRole` | `(roleId, tx?) => Promise<Result<void>>` | 删除角色（事务清关联） |

### 权限管理

| 方法 | 签名 | 说明 |
|------|------|------|
| `createPermission` | `({ code, name, type?, resource?, action? }, tx?) => Promise<Result<Permission>>` | 创建权限 |
| `getPermission` | `(permissionId) => Promise<Result<Permission \| null>>` | 获取权限 |
| `getPermissionByCode` | `(code) => Promise<Result<Permission \| null>>` | 按 code 获取权限 |
| `getAllPermissions` | `(options?) => Promise<Result<PaginatedResult<Permission>>>` | 分页获取所有权限（可按 type 筛选） |
| `deletePermission` | `(permissionId, tx?) => Promise<Result<void>>` | 删除权限（事务清关联） |

### 分配操作

| 方法 | 签名 | 说明 |
|------|------|------|
| `assignRole` | `(userId, roleId, tx?) => Promise<Result<void>>` | 分配角色给用户 |
| `removeRole` | `(userId, roleId, tx?) => Promise<Result<void>>` | 移除用户角色 |
| `syncRoles` | `(userId, roleIds[], tx?) => Promise<Result<void>>` | 同步用户角色（全量替换） |
| `assignPermissionToRole` | `(roleId, permId, tx?) => Promise<Result<void>>` | 分配权限给角色 |
| `removePermissionFromRole` | `(roleId, permId, tx?) => Promise<Result<void>>` | 移除角色权限 |
| `getRolePermissions` | `(roleId) => Promise<Result<Permission[]>>` | 获取角色的权限列表 |

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
| `createApiKey` | `(userId, { name, expirationDays?, scopes? }) => Promise<Result<CreateApiKeyResult>>` | 创建 API Key（`rawKey` 仅返回一次） |
| `listApiKeys` | `(userId) => Promise<Result<ApiKey[]>>` | 列出用户的 API Key |
| `getApiKey` | `(keyId) => Promise<Result<ApiKey \| null>>` | 获取 API Key 详情 |
| `revokeApiKey` | `(keyId) => Promise<Result<void>>` | 吊销 API Key |
| `verifyApiKey` | `(rawKey) => Promise<Result<ApiKey>>` | 验证 API Key 有效性 |

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

## §10 错误码 — `IamErrorCode`

| 错误码 | 常量 | 说明 |
|--------|------|------|
| **认证 (5000-5099)** | | |
| 5000 | `AUTH_FAILED` | 认证失败（通用） |
| 5001 | `INVALID_CREDENTIALS` | 凭证无效 |
| 5002 | `USER_NOT_FOUND` | 用户不存在 |
| 5003 | `USER_DISABLED` | 用户已禁用 |
| 5004 | `USER_LOCKED` | 用户已锁定 |
| 5005 | `USER_ALREADY_EXISTS` | 用户已存在 |
| 5006 | `PASSWORD_EXPIRED` | 密码已过期 |
| 5007 | `PASSWORD_POLICY_VIOLATION` | 密码不符合策略 |
| 5010 | `OTP_INVALID` | 验证码无效 |
| 5011 | `OTP_EXPIRED` | 验证码已过期 |
| 5012 | `OTP_RESEND_TOO_FAST` | 发送过频 |
| 5013 | `LOGIN_DISABLED` | 登录方式已禁用 |
| 5014 | `REGISTER_DISABLED` | 注册已禁用 |
| 5015 | `STRATEGY_NOT_SUPPORTED` | 认证策略不支持 |
| 5016 | `APIKEY_INVALID` | API Key 无效 |
| 5017 | `APIKEY_EXPIRED` | API Key 已过期 |
| 5018 | `APIKEY_DISABLED` | API Key 已禁用 |
| 5019 | `APIKEY_NOT_FOUND` | API Key 不存在 |
| 5020 | `RESET_TOKEN_INVALID` | 重置令牌无效 |
| 5021 | `RESET_TOKEN_EXPIRED` | 重置令牌过期 |
| 5022 | `RESET_TOKEN_MAX_ATTEMPTS` | 重置令牌尝试次数超限 |
| **会话 (5100-5199)** | | |
| 5100 | `SESSION_NOT_FOUND` | 会话不存在 |
| 5101 | `SESSION_EXPIRED` | 会话已过期 |
| 5102 | `SESSION_INVALID` | 会话无效 |
| 5103 | `SESSION_CREATE_FAILED` | 会话创建失败 |
| 5104 | `TOKEN_EXPIRED` | 令牌过期 |
| 5105 | `TOKEN_INVALID` | 令牌无效 |
| 5106 | `TOKEN_REFRESH_FAILED` | 令牌刷新失败 |
| **授权 (5200-5299)** | | |
| 5200 | `PERMISSION_DENIED` | 权限不足 |
| 5201 | `ROLE_NOT_FOUND` | 角色不存在 |
| 5202 | `PERMISSION_NOT_FOUND` | 权限不存在 |
| 5203 | `ROLE_ALREADY_EXISTS` | 角色已存在 |
| 5204 | `PERMISSION_ALREADY_EXISTS` | 权限已存在 |
| **LDAP (5400-5499)** | | |
| 5400 | `LDAP_CONNECTION_FAILED` | LDAP 连接失败 |
| 5401 | `LDAP_BIND_FAILED` | LDAP 绑定失败 |
| 5402 | `LDAP_SEARCH_FAILED` | LDAP 搜索失败 |
| **存储层 (5500-5599)** | | |
| 5500 | `REPOSITORY_ERROR` | 存储层错误 |
| 5501 | `NOT_FOUND` | 资源不存在 |
| 5502 | `CONFLICT` | 资源冲突 |
| **通用 (5800-5999)** | | |
| 5800 | `FORBIDDEN` | 禁止访问 |
| 5801 | `INVALID_ARGUMENT` | 参数无效 |
| 5900 | `CONFIG_ERROR` | 配置错误 |
| 5910 | `NOT_INITIALIZED` | 模块未初始化 |
| 5999 | `INTERNAL_ERROR` | 内部错误 |

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
