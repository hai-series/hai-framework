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

初始化自动创建 5 张表：`iam_users`、`iam_roles`、`iam_permissions`、`iam_role_permissions`、`iam_user_roles`。

Token 和 OTP 存储在 cache 中（不落库）。

---

## §2 认证 — `iam.auth`

| 方法 | 签名 | 说明 |
|------|------|------|
| `login` | `({ identifier, password }) => Promise<Result<AuthResult>>` | 密码登录 |
| `loginWithOtp` | `({ identifier, code }) => Promise<Result<AuthResult>>` | OTP 登录 |
| `sendOtp` | `(identifier) => Promise<Result<{ expiresAt }>>` | 发送 OTP |
| `loginWithLdap` | `({ username, password }) => Promise<Result<AuthResult>>` | LDAP 登录 |
| `verifyToken` | `(token) => Promise<Result<Session>>` | 验证令牌 |
| `logout` | `(token) => Promise<Result<void>>` | 登出 |

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
| `get` | `(token) => Promise<Result<Session>>` | 获取会话（滑动续期） |
| `verifyToken` | `(token) => Promise<Result<Session>>` | 验证令牌 |
| `delete` | `(token) => Promise<Result<void>>` | 删除会话 |
| `deleteByUserId` | `(userId) => Promise<Result<void>>` | 强制下线 |
| `refresh` | `(refreshToken) => Promise<Result<TokenPair>>` | 刷新 Token（rotation） |
| `revokeRefresh` | `(refreshToken) => Promise<Result<void>>` | 吊销 refreshToken |

**Token 刷新（rotation）**：`refresh()` 删除旧 Token 对，创建新 session，旧 refreshToken 立即失效。

---

## §4 用户管理 — `iam.user`

| 方法 | 签名 | 说明 |
|------|------|------|
| `register` | `(input) => Promise<Result<RegisterResult>>` | 注册 |
| `getUser` | `(id, options?) => Promise<Result<User>>` | 获取用户（可 include roles） |
| `getCurrentUser` | `(token) => Promise<Result<User>>` | 通过令牌获取当前用户 |
| `listUsers` | `(pagination?) => Promise<Result<PageResult>>` | 分页列表 |
| `updateUser` | `(id, data) => Promise<Result<User>>` | 更新 |
| `deleteUser` | `(id) => Promise<Result<void>>` | 删除（清除会话） |
| `changePassword` | `(id, old, new) => Promise<Result<void>>` | 修改密码 |
| `requestPasswordReset` | `(email) => Promise<Result<void>>` | 请求重置（防枚举） |
| `confirmPasswordReset` | `(token, newPassword) => Promise<Result<void>>` | 确认重置 |
| `adminResetPassword` | `(userId, newPassword) => Promise<Result<void>>` | 管理员重置 |

---

## §5 RBAC 授权 — `iam.authz`

| 方法 | 签名 | 说明 |
|------|------|------|
| `createRole` | `({ code, name, description? }) => Promise<Result<Role>>` | 创建角色 |
| `assignRole` | `(userId, roleId) => Promise<Result<void>>` | 分配角色 |
| `removeRole` | `(userId, roleId) => Promise<Result<void>>` | 移除角色 |
| `getUserRoles` | `(userId) => Promise<Result<Role[]>>` | 获取用户角色 |
| `createPermission` | `({ code, name, description? }) => Promise<Result<Permission>>` | 创建权限 |
| `assignPermissionToRole` | `(roleId, permId) => Promise<Result<void>>` | 分配权限给角色 |
| `checkPermission` | `(userId, permission) => Promise<Result<boolean>>` | 检查权限 |

**通配符**：`admin:*` 匹配 `admin:read`、`admin:write`。超管角色自动拥有所有权限。

---

## §6 API 契约 — `@h-ai/iam/api`

```typescript
import { iamEndpoints } from '@h-ai/iam/api'

iamEndpoints.login          // POST /api/v1/auth/login
iamEndpoints.loginWithOtp   // POST /api/v1/auth/login-otp
iamEndpoints.sendOtp        // POST /api/v1/auth/send-otp
iamEndpoints.logout         // POST /api/v1/auth/logout
iamEndpoints.register       // POST /api/v1/auth/register
iamEndpoints.currentUser    // GET  /api/v1/auth/me
iamEndpoints.refreshToken   // POST /api/v1/auth/refresh
iamEndpoints.changePassword // POST /api/v1/auth/change-password
iamEndpoints.resetPassword  // POST /api/v1/auth/reset-password
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

## §8 自动会话失效

以下操作自动清除受影响用户的所有活跃会话：
- `deleteUser` / `updateUser({ enabled: false })` / `changePassword` / `confirmPasswordReset`
- `assignRole` / `removeRole` / `deleteRole` 同步更新活跃会话中的角色列表

---

## §9 错误码 — `IamErrorCode`

| 错误码 | 常量 | 说明 |
|--------|------|------|
| 5001 | `INVALID_CREDENTIALS` | 凭证无效 |
| 5002 | `USER_NOT_FOUND` | 用户不存在 |
| 5003 | `USER_DISABLED` | 用户已禁用 |
| 5004 | `USER_LOCKED` | 用户已锁定 |
| 5005 | `USER_ALREADY_EXISTS` | 用户已存在 |
| 5010 | `OTP_INVALID` | 验证码无效 |
| 5012 | `OTP_RESEND_TOO_FAST` | 发送过频 |
| 5013 | `LOGIN_DISABLED` | 登录方式已禁用 |
| 5014 | `REGISTER_DISABLED` | 注册已禁用 |
| 5020 | `RESET_TOKEN_INVALID` | 重置令牌无效 |
| 5021 | `RESET_TOKEN_EXPIRED` | 重置令牌过期 |
| 5102 | `SESSION_INVALID` | 会话无效 |
| 5201 | `ROLE_NOT_FOUND` | 角色不存在 |
| 5202 | `PERMISSION_NOT_FOUND` | 权限不存在 |

---

## §10 常见模式

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
