---
name: hai-iam
description: 使用 @h-ai/iam 进行身份认证（密码/OTP/LDAP）、统一 Bearer Token 管理（TokenPair/refresh/revoke）与 RBAC 授权（角色/权限/通配符）；当需求涉及登录、注册、权限检查、角色管理、Token 认证或 API 契约时使用。
---

# hai-iam

> `@h-ai/iam` 是统一的身份与访问管理模块，支持多种认证策略（密码/OTP/LDAP）、Bearer Token 管理和 RBAC 授权。依赖 `@h-ai/reldb`（持久化）、`@h-ai/cache`（Token + 权限缓存）、`@h-ai/crypto`（密码哈希）。

---

## 适用场景

- 用户注册与登录（密码/OTP/LDAP）
- Bearer Token 认证与管理（TokenPair: accessToken + refreshToken）
- Token 刷新（rotation 策略）与吊销
- RBAC 角色/权限的创建、分配与检查
- 密码重置流程
- 与 kit 集成的认证守卫
- API 契约定义（`@h-ai/iam/api`）

---

## 使用步骤

### 1. 配置

```yaml
# config/_iam.yml
password:
  minLength: ${HAI_IAM_PASSWORD_MIN_LENGTH:8}
  requireUppercase: true
  requireNumber: true
session:
  maxAge: ${HAI_IAM_SESSION_MAX_AGE:86400}
  refreshTokenMaxAge: ${HAI_IAM_REFRESH_TOKEN_MAX_AGE:604800} # 7 天
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

### 2. 初始化

```typescript
import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { iam } from '@h-ai/iam'

// 必须先初始化 db 和 cache
await reldb.init(core.config.get('db'))
await cache.init(core.config.get('cache'))

await iam.init({
  db,
  cache,
  ...core.config.get('iam'),
  seedDefaultData: true,
})
```

初始化时自动创建数据库表（5 张）：`iam_users`、`iam_roles`、`iam_permissions`、`iam_role_permissions`、`iam_user_roles`。

Token 和 OTP 存储在 cache 中（不落库）。refreshToken 使用独立的 cache key 存储。

---

## 核心 API

### 认证 — `iam.auth`

| 方法            | 签名                                                        | 说明                               |
| --------------- | ----------------------------------------------------------- | ---------------------------------- |
| `login`         | `({ identifier, password }) => Promise<Result<AuthResult>>` | 密码登录（用户名/邮箱/手机号）     |
| `loginWithOtp`  | `({ identifier, code }) => Promise<Result<AuthResult>>`     | OTP 验证码登录                     |
| `sendOtp`       | `(identifier) => Promise<Result<{ expiresAt }>>`            | 发送 OTP 验证码                    |
| `loginWithLdap` | `({ username, password }) => Promise<Result<AuthResult>>`   | LDAP 登录                          |
| `verifyToken`   | `(token) => Promise<Result<Session>>`                       | 验证令牌（推荐入口，委托 session） |
| `logout`        | `(token) => Promise<Result<void>>`                          | 登出                               |

**AuthResult**（已改造为 TokenPair）：

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

### 会话管理 — `iam.session`

| 方法             | 签名                                                                 | 说明                                    |
| ---------------- | -------------------------------------------------------------------- | --------------------------------------- |
| `create`         | `({ userId, username, roles, source? }) => Promise<Result<Session>>` | 创建会话（返回含 TokenPair 的 session） |
| `get`            | `(token) => Promise<Result<Session>>`                                | 获取会话（滑动续期自动延长）            |
| `verifyToken`    | `(token) => Promise<Result<Session>>`                                | 验证令牌                                |
| `delete`         | `(token) => Promise<Result<void>>`                                   | 删除会话                                |
| `deleteByUserId` | `(userId) => Promise<Result<void>>`                                  | 删除用户所有会话（强制下线）            |
| `refresh`        | `(refreshToken) => Promise<Result<TokenPair>>`                       | 刷新 Token（rotation：旧 Token 失效）   |
| `revokeRefresh`  | `(refreshToken) => Promise<Result<void>>`                            | 吊销 refreshToken                       |

**Token 刷新（rotation 策略）**：

- `refresh()` 会删除旧的 accessToken + refreshToken
- 创建全新的 session，返回新的 TokenPair
- 旧 refreshToken 立即失效，防止重放攻击

### 用户管理 — `iam.user`

| 方法                   | 签名                                             | 说明                         |
| ---------------------- | ------------------------------------------------ | ---------------------------- |
| `register`             | `(input) => Promise<Result<RegisterResult>>`     | 用户注册                     |
| `getUser`              | `(id) => Promise<Result<User>>`                  | 获取用户                     |
| `getCurrentUser`       | `(token) => Promise<Result<User>>`               | 通过令牌获取当前用户         |
| `listUsers`            | `(pagination?) => Promise<Result<PageResult>>`   | 用户分页列表                 |
| `updateUser`           | `(id, data) => Promise<Result<User>>`            | 更新用户信息                 |
| `deleteUser`           | `(id) => Promise<Result<void>>`                  | 删除用户（自动清除会话）     |
| `changePassword`       | `(id, old, new) => Promise<Result<void>>`        | 修改密码（自动清除会话）     |
| `requestPasswordReset` | `(email) => Promise<Result<void>>`               | 请求密码重置（防枚举）       |
| `confirmPasswordReset` | `(token, newPassword) => Promise<Result<void>>`  | 确认密码重置（自动清除会话） |
| `adminResetPassword`   | `(userId, newPassword) => Promise<Result<void>>` | 管理员直接重置密码           |

### RBAC 授权 — `iam.authz`

| 方法                     | 签名                                                            | 说明                                     |
| ------------------------ | --------------------------------------------------------------- | ---------------------------------------- |
| `createRole`             | `({ code, name, description? }) => Promise<Result<Role>>`       | 创建角色                                 |
| `assignRole`             | `(userId, roleId) => Promise<Result<void>>`                     | 分配角色给用户                           |
| `removeRole`             | `(userId, roleId) => Promise<Result<void>>`                     | 移除用户角色                             |
| `getUserRoles`           | `(userId) => Promise<Result<Role[]>>`                           | 获取用户角色列表                         |
| `createPermission`       | `({ code, name, description? }) => Promise<Result<Permission>>` | 创建权限                                 |
| `assignPermissionToRole` | `(roleId, permId) => Promise<Result<void>>`                     | 分配权限给角色                           |
| `checkPermission`        | `(userId, permission) => Promise<Result<boolean>>`              | 检查权限（角色从 DB 解析，权限缓存优先） |

**通配符规则**：`admin:*` 匹配 `admin:read`、`admin:write` 等。超管角色自动拥有所有权限。

---

## API 契约 — `@h-ai/iam/api`

```typescript
import { iamEndpoints } from '@h-ai/iam/api'

// 9 个端点契约，含 Zod schema
iamEndpoints.login // POST /api/v1/auth/login
iamEndpoints.loginWithOtp // POST /api/v1/auth/login-otp
iamEndpoints.sendOtp // POST /api/v1/auth/send-otp
iamEndpoints.logout // POST /api/v1/auth/logout
iamEndpoints.register // POST /api/v1/auth/register
iamEndpoints.currentUser // GET  /api/v1/auth/me
iamEndpoints.refreshToken // POST /api/v1/auth/refresh
iamEndpoints.changePassword // POST /api/v1/auth/change-password
iamEndpoints.resetPassword // POST /api/v1/auth/reset-password
```

服务端使用 `kit.fromContract()`，客户端使用 `api.call()`：

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

## 错误码 — `IamErrorCode`

| 错误码 | 常量                   | 说明           |
| ------ | ---------------------- | -------------- |
| 5001   | `INVALID_CREDENTIALS`  | 凭证无效       |
| 5002   | `USER_NOT_FOUND`       | 用户不存在     |
| 5003   | `USER_DISABLED`        | 用户已禁用     |
| 5004   | `USER_LOCKED`          | 用户已锁定     |
| 5005   | `USER_ALREADY_EXISTS`  | 用户已存在     |
| 5010   | `OTP_INVALID`          | 验证码无效     |
| 5012   | `OTP_RESEND_TOO_FAST`  | 发送过于频繁   |
| 5013   | `LOGIN_DISABLED`       | 登录方式已禁用 |
| 5014   | `REGISTER_DISABLED`    | 注册已禁用     |
| 5020   | `RESET_TOKEN_INVALID`  | 重置令牌无效   |
| 5021   | `RESET_TOKEN_EXPIRED`  | 重置令牌已过期 |
| 5102   | `SESSION_INVALID`      | 会话无效       |
| 5201   | `ROLE_NOT_FOUND`       | 角色不存在     |
| 5202   | `PERMISSION_NOT_FOUND` | 权限不存在     |

---

## 常见模式

### 与 kit 集成（hooks.server.ts）

```typescript
import { iam } from '$lib/server/init'
import { kit } from '@h-ai/kit'

const haiHandle = kit.createHandle({
  validateSession: async (token) => {
    const result = await iam.auth.verifyToken(token)
    if (!result.success)
      return null
    const roles = await iam.authz.getUserRoles(result.data.userId)
    return {
      userId: result.data.userId,
      roles: roles.success ? roles.data.map(r => r.code) : [],
      permissions: [],
    }
  },
  guards: [
    {
      guard: kit.guard.auth({ apiMode: true }),
      paths: ['/api/*'],
      exclude: ['/api/auth/*'],
    },
  ],
})

export const handle = kit.sequence(haiHandle)
```

### 客户端认证流程

```typescript
import { iamEndpoints } from '@h-ai/iam/api'

// 登录 → 保存 Token
const login = await api.call(iamEndpoints.login, { username, password })
if (login.success) {
  await api.auth.setTokens(login.data.tokens)
}

// 获取当前用户
const me = await api.call(iamEndpoints.currentUser, {})

// Token 过期时，api-client 自动调用 refreshUrl 刷新
// 刷新失败时，清除 Token 并跳转登录页

// 登出
await api.call(iamEndpoints.logout, {})
await api.auth.clear()
```

### 自动会话失效

以下操作自动清除受影响用户的所有活跃会话：

- `deleteUser` / `updateUser({ enabled: false })` / `changePassword` / `confirmPasswordReset`
- `assignRole` / `removeRole` / `deleteRole` 会同步更新活跃会话中的角色列表

---

## 相关 Skills

- `hai-build`：模块初始化顺序（db → cache → iam）
- `hai-kit`：SvelteKit 集成（Bearer Token + 契约处理）
- `hai-api-client`：客户端契约调用
- `hai-reldb`：底层数据存储
- `hai-cache`：Token 与权限缓存
- `hai-crypto`：密码哈希（内部依赖）
- `hai-ui`：IAM 场景组件（LoginForm/RegisterForm 等）
