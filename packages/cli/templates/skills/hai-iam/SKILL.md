---
name: hai-iam
description: 使用 @h-ai/iam 进行身份认证（密码/OTP/LDAP）、会话管理（Token/滑动续期）与 RBAC 授权（角色/权限/通配符）；当需求涉及登录、注册、权限检查、角色管理、会话或令牌操作时使用。
---

# hai-iam

> `@h-ai/iam` 是统一的身份与访问管理模块，支持多种认证策略（密码/OTP/LDAP）、会话管理和 RBAC 授权。依赖 `@h-ai/db`（持久化）、`@h-ai/cache`（会话+权限缓存）、`@h-ai/crypto`（密码哈希）。

---

## 适用场景

- 用户注册与登录（密码/OTP/LDAP）
- 令牌验证与会话管理
- RBAC 角色/权限的创建、分配与检查
- 密码重置流程
- 与 kit 集成的认证守卫

---

## 使用步骤

### 1. 配置

```yaml
# config/_iam.yml
password:
  minLength: ${IAM_PASSWORD_MIN_LENGTH:8}
  requireUppercase: true
  requireNumber: true
session:
  maxAge: ${IAM_SESSION_MAX_AGE:86400}
  sliding: true
  singleDevice: false
login:
  password: true
  otp: false
register:
  enabled: true
security:
  maxLoginAttempts: ${IAM_MAX_LOGIN_ATTEMPTS:5}
  lockoutDuration: 900
rbac:
  defaultRole: user
  superAdminRole: super_admin
```

### 2. 初始化

```typescript
import { cache } from '@h-ai/cache'
import { db } from '@h-ai/db'
import { iam } from '@h-ai/iam'

// 必须先初始化 db 和 cache
await db.init(core.config.get('db'))
await cache.init(core.config.get('cache'))

await iam.init({
  db,
  cache,
  ...core.config.get('iam'),
  seedDefaultData: true, // 初始化时种子默认角色/权限
})
```

初始化时自动创建数据库表（5 张）：`iam_users`、`iam_roles`、`iam_permissions`、`iam_role_permissions`、`iam_user_roles`。

会话、OTP 验证码、密码重置令牌均存储在 cache 中（不落库）。

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

**AuthResult**：`{ user: User, accessToken: string, accessTokenExpiresAt: Date, agreements?: AgreementDisplay }`

### 用户管理 — `iam.user`

| 方法                        | 签名                                             | 说明                               |
| --------------------------- | ------------------------------------------------ | ---------------------------------- |
| `register`                  | `(input) => Promise<Result<RegisterResult>>`     | 用户注册                           |
| `getUser`                   | `(id) => Promise<Result<User>>`                  | 获取用户                           |
| `getCurrentUser`            | `(token) => Promise<Result<User>>`               | 通过令牌获取当前用户               |
| `listUsers`                 | `(pagination?) => Promise<Result<PageResult>>`   | 用户分页列表                       |
| `updateUser`                | `(id, data) => Promise<Result<User>>`            | 更新用户信息                       |
| `deleteUser`                | `(id) => Promise<Result<void>>`                  | 删除用户（自动清除会话）           |
| `changePassword`            | `(id, old, new) => Promise<Result<void>>`        | 修改密码（自动清除会话）           |
| `validatePassword`          | `(password) => Result<void>`                     | 密码强度校验（同步）               |
| `requestPasswordReset`      | `(email) => Promise<Result<void>>`               | 请求密码重置（防枚举）             |
| `confirmPasswordReset`      | `(token, newPassword) => Promise<Result<void>>`  | 确认密码重置（自动清除会话）       |
| `adminResetPassword`        | `(userId, newPassword) => Promise<Result<void>>` | 管理员直接重置密码（自动清除会话） |
| `changeCurrentUserPassword` | `(token, old, new) => Promise<Result<void>>`     | 当前用户修改密码（自动清除会话）   |
| `updateCurrentUser`         | `(token, data) => Promise<Result<User>>`         | 当前用户更新个人信息               |

**User 类型**：

```typescript
interface User {
  id: string
  username: string
  email?: string
  phone?: string
  displayName?: string
  avatarUrl?: string
  enabled: boolean
  emailVerified: boolean
  phoneVerified: boolean
  createdAt: Date
  updatedAt: Date
  metadata?: Record<string, unknown>
}
```

### 会话管理 — `iam.session`

| 方法             | 签名                                                                 | 说明                         |
| ---------------- | -------------------------------------------------------------------- | ---------------------------- |
| `create`         | `({ userId, username, roles, source? }) => Promise<Result<Session>>` | 创建会话                     |
| `get`            | `(token) => Promise<Result<Session>>`                                | 获取会话（滑动续期自动延长） |
| `verifyToken`    | `(token) => Promise<Result<Session>>`                                | 验证令牌                     |
| `delete`         | `(token) => Promise<Result<void>>`                                   | 删除会话                     |
| `deleteByUserId` | `(userId) => Promise<Result<void>>`                                  | 删除用户所有会话（强制下线） |

**Session 类型**：

```typescript
interface Session {
  userId: string
  username?: string
  roles: string[]
  source?: string
  accessToken: string
  createdAt: Date
  lastActiveAt: Date
  expiresAt: Date
}
```

### RBAC 授权 — `iam.authz`

| 方法                       | 签名                                                            | 说明                                     |
| -------------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| `createRole`               | `({ code, name, description? }) => Promise<Result<Role>>`       | 创建角色                                 |
| `updateRole`               | `(id, data) => Promise<Result<Role>>`                           | 更新角色                                 |
| `deleteRole`               | `(id) => Promise<Result<void>>`                                 | 删除角色（级联清理缓存+会话）            |
| `getRole`                  | `(id) => Promise<Result<Role>>`                                 | 获取角色                                 |
| `getAllRoles`              | `(pagination?) => Promise<Result<PageResult>>`                  | 角色分页列表                             |
| `createPermission`         | `({ code, name, description? }) => Promise<Result<Permission>>` | 创建权限                                 |
| `deletePermission`         | `(id) => Promise<Result<void>>`                                 | 删除权限（级联清理缓存）                 |
| `getPermission`            | `(id) => Promise<Result<Permission>>`                           | 获取权限                                 |
| `getAllPermissions`        | `(pagination?) => Promise<Result<PageResult>>`                  | 权限分页列表                             |
| `assignRole`               | `(userId, roleId) => Promise<Result<void>>`                     | 分配角色给用户（自动同步活跃会话）       |
| `removeRole`               | `(userId, roleId) => Promise<Result<void>>`                     | 移除用户角色（自动同步活跃会话）         |
| `getUserRoles`             | `(userId) => Promise<Result<Role[]>>`                           | 获取用户角色列表                         |
| `assignPermissionToRole`   | `(roleId, permId) => Promise<Result<void>>`                     | 分配权限给角色                           |
| `removePermissionFromRole` | `(roleId, permId) => Promise<Result<void>>`                     | 移除角色权限                             |
| `getRolePermissions`       | `(roleId) => Promise<Result<Permission[]>>`                     | 获取角色权限列表                         |
| `getUserPermissions`       | `(userId) => Promise<Result<Permission[]>>`                     | 获取用户所有权限                         |
| `checkPermission`          | `(userId, permission) => Promise<Result<boolean>>`              | 检查权限（角色从 DB 解析，权限缓存优先） |

**通配符规则**：`admin:*` 匹配 `admin:read`、`admin:write` 等。超管角色自动拥有所有权限。

---

## 错误码 — `IamErrorCode`

| 错误码 | 常量                        | 说明                 |
| ------ | --------------------------- | -------------------- |
| 5001   | `INVALID_CREDENTIALS`       | 凭证无效             |
| 5002   | `USER_NOT_FOUND`            | 用户不存在           |
| 5003   | `USER_DISABLED`             | 用户已禁用           |
| 5004   | `USER_LOCKED`               | 用户已锁定           |
| 5005   | `USER_ALREADY_EXISTS`       | 用户已存在           |
| 5006   | `PASSWORD_EXPIRED`          | 密码已过期           |
| 5007   | `PASSWORD_POLICY_VIOLATION` | 密码不符合策略       |
| 5010   | `OTP_INVALID`               | 验证码无效           |
| 5012   | `OTP_RESEND_TOO_FAST`       | 发送过于频繁         |
| 5013   | `LOGIN_DISABLED`            | 登录方式已禁用       |
| 5014   | `REGISTER_DISABLED`         | 注册已禁用           |
| 5020   | `RESET_TOKEN_INVALID`       | 重置令牌无效         |
| 5021   | `RESET_TOKEN_EXPIRED`       | 重置令牌已过期       |
| 5022   | `RESET_TOKEN_MAX_ATTEMPTS`  | 重置令牌尝试次数超限 |
| 5102   | `SESSION_INVALID`           | 会话无效             |
| 5201   | `ROLE_NOT_FOUND`            | 角色不存在           |
| 5202   | `PERMISSION_NOT_FOUND`      | 权限不存在           |
| 5203   | `ROLE_ALREADY_EXISTS`       | 角色已存在           |
| 5204   | `PERMISSION_ALREADY_EXISTS` | 权限已存在           |

---

## 常见模式

### 与 kit 集成（hooks.server.ts）

```typescript
import { iam } from '$lib/server/init'
import { kit } from '@h-ai/kit'

const haiHandle = kit.createHandle({
  sessionCookieName: 'hai_session',
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

### 注册 + 分配角色

```typescript
const result = await iam.user.register({
  username: 'admin',
  email: 'admin@example.com',
  password: 'StrongPassword123',
})
if (result.success) {
  // 默认角色由 rbac.defaultRole 自动分配
  // 额外角色需手动分配
  await iam.authz.assignRole(result.data.user.id, adminRoleId)
}
```

### 权限检查

```typescript
const canEdit = await iam.authz.checkPermission(event.locals.session.userId, 'articles:write')

if (!canEdit.success || !canEdit.data) {
  return kit.response.forbidden()
}
```

### 自动会话失效

以下操作自动清除受影响用户的所有活跃会话：

- `deleteUser` / `updateUser({ enabled: false })` / `changePassword` / `confirmPasswordReset` / `adminResetPassword`
- `assignRole` / `removeRole` / `deleteRole` 会同步更新活跃会话中的角色列表

---

## 相关 Skills

- `hai-build`：模块初始化顺序（db → cache → iam）
- `hai-kit`：SvelteKit 集成（`kit.createHandle` + `kit.guard`）
- `hai-db`：底层数据存储
- `hai-cache`：会话与权限缓存
- `hai-crypto`：密码哈希（内部依赖）
- `hai-ui`：IAM 场景组件（LoginForm/RegisterForm 等）
