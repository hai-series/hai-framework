---
name: hai-iam
description: 使用 @h-ai/iam 进行身份认证（密码/OTP/LDAP/API Key）、统一 Bearer Token 管理（TokenPair/refresh/revoke）与 RBAC 授权（角色/权限/通配符）；当需求涉及登录、注册、权限检查、角色管理、Token 认证或 API 契约时使用。
---

# hai-iam

> `@h-ai/iam` 是统一的身份与访问管理模块，支持多种认证策略（密码/OTP/LDAP/API Key）、Bearer Token 管理和 RBAC 授权。依赖 `@h-ai/reldb`（持久化）、`@h-ai/cache`（Token + 权限缓存）、`@h-ai/crypto`（密码哈希）、`@h-ai/audit`（审计日志）。

---

## 依赖

| 模块 | 用途 | 是否必需 | 初始化要求 |
| --- | --- | --- | --- |
| `@h-ai/reldb` | 数据库（用户/角色/权限持久化） | **必需** | 需在 `iam.init()` 前初始化 |
| `@h-ai/cache` | 缓存（会话/OTP/重置令牌/权限缓存） | **必需** | 需在 `iam.init()` 前初始化 |
| `@h-ai/crypto` | 密码哈希 | 内部使用 | 自动初始化 |
| `@h-ai/audit` | 审计日志（RBAC 关键操作记录） | 内部使用 | 已初始化时自动写入 |

## 适用场景

- 用户注册与登录（密码/OTP/LDAP/API Key）
- Bearer Token 认证与管理（TokenPair: accessToken + refreshToken）
- Token 刷新（rotation 策略）与吊销
- RBAC 角色/权限的创建、分配与检查
- API Key 管理（创建、吊销、验证）
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

// 必须先初始化 reldb 和 cache
await reldb.init(core.config.get('db'))
await cache.init(core.config.get('cache'))

// IAM 自动使用已初始化的 reldb 和 cache 单例
await iam.init({
  ...core.config.get('iam'),
  seedDefaultData: true,
})
```

初始化时自动创建数据库表（5 张）：`hai_iam_users`、`hai_iam_roles`、`hai_iam_permissions`、`hai_iam_role_permissions`、`hai_iam_user_roles`。

Token 和 OTP 存储在 cache 中（不落库）。refreshToken 使用独立的 cache key 存储。

---

## 核心 API

### 认证 — `iam.auth`

| 方法               | 签名                                                        | 说明                               |
| ------------------ | ----------------------------------------------------------- | ---------------------------------- |
| `login`            | `({ identifier, password }) => Promise<HaiResult<AuthResult>>` | 密码登录（用户名/邮箱/手机号）     |
| `loginWithOtp`     | `({ identifier, code }) => Promise<HaiResult<AuthResult>>`     | OTP 验证码登录                     |
| `loginWithLdap`    | `({ username, password }) => Promise<HaiResult<AuthResult>>`   | LDAP 登录                          |
| `loginWithApiKey`  | `({ key }) => Promise<HaiResult<AuthResult>>`                  | API Key 登录                       |
| `sendOtp`          | `(identifier) => Promise<HaiResult<{ expiresAt }>>`            | 发送 OTP 验证码                    |
| `verifyToken`      | `(token) => Promise<HaiResult<Session>>`                       | 验证令牌（推荐入口，委托 session） |
| `logout`           | `(token) => Promise<HaiResult<void>>`                          | 登出                               |
| `registerAndLogin` | `(options: RegisterOptions) => Promise<HaiResult<AuthResult>>`  | 注册并登录（一站式）               |

**AuthResult**（已改造为 TokenPair）：

```typescript
interface AuthResult {
  user: User
  tokens: TokenPair
  roles: string[]
  permissions: string[]
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

| 方法                | 签名                                                                 | 说明                                    |
| ------------------- | -------------------------------------------------------------------- | --------------------------------------- |
| `create`            | `({ userId, username, roles, source? }) => Promise<HaiResult<Session>>` | 创建会话（返回含 TokenPair 的 session） |
| `get`               | `(token) => Promise<HaiResult<Session \| null>>`                        | 获取会话（滑动续期自动延长）            |
| `verifyToken`       | `(token) => Promise<HaiResult<Session>>`                                | 验证令牌                                |
| `update`            | `(token, data) => Promise<HaiResult<void>>`                             | 更新会话字段（浅合并 data）             |
| `delete`            | `(token) => Promise<HaiResult<void>>`                                   | 删除会话                                |
| `deleteByUserId`    | `(userId) => Promise<HaiResult<number>>`                                | 删除用户所有会话（返回删除数量）        |
| `refresh`           | `(refreshToken) => Promise<HaiResult<TokenPair>>`                       | 刷新 Token（rotation：旧 Token 失效）   |
| `revokeRefresh`     | `(refreshToken) => Promise<HaiResult<void>>`                            | 吊销 refreshToken                       |
| `patchUserSessions` | `(userId, updates: SessionFieldUpdates) => Promise<HaiResult<void>>`    | 批量更新用户所有会话的 roles/permissions |

**Token 刷新（rotation 策略）**：

- `refresh()` 会删除旧的 accessToken + refreshToken
- 创建全新的 session，返回新的 TokenPair
- 旧 refreshToken 立即失效，防止重放攻击

### 用户管理 — `iam.user`

| 方法                       | 签名                                                                    | 说明                                 |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------------------ |
| `register`                 | `(input) => Promise<HaiResult<RegisterResult>>`                            | 用户注册                             |
| `getUser`                  | `(id, options?) => Promise<HaiResult<User \| null>>`                       | 获取用户（可选 include: ['roles']）  |
| `getCurrentUser`           | `(token) => Promise<HaiResult<User>>`                                      | 通过令牌获取当前用户                 |
| `updateCurrentUser`        | `(token, data: UpdateCurrentUserInput) => Promise<HaiResult<User>>`        | 当前用户修改个人资料（白名单字段）   |
| `listUsers`                | `(options?: ListUsersOptions) => Promise<HaiResult<PaginatedResult<User>>>` | 用户列表（分页 + 搜索 + 过滤）      |
| `updateUser`               | `(id, data) => Promise<HaiResult<User>>`                                   | 更新用户信息                         |
| `deleteUser`               | `(id) => Promise<HaiResult<void>>`                                         | 删除用户（自动清除会话）             |
| `changePassword`           | `(id, old, new) => Promise<HaiResult<void>>`                               | 修改密码（自动清除会话）             |
| `changeCurrentUserPassword`| `(token, old, new) => Promise<HaiResult<void>>`                            | 当前用户修改密码（通过令牌识别）     |
| `requestPasswordReset`     | `(email) => Promise<HaiResult<void>>`                                      | 请求密码重置（防枚举）               |
| `confirmPasswordReset`     | `(token, newPassword) => Promise<HaiResult<void>>`                         | 确认密码重置（自动清除会话）         |
| `adminResetPassword`       | `(userId, newPassword) => Promise<HaiResult<void>>`                        | 管理员直接重置密码                   |
| `validatePassword`         | `(password) => HaiResult<void>`                                  | 验证密码强度（**同步方法**）         |

### RBAC 授权 — `iam.authz`

| 方法                       | 签名                                                                             | 说明                                         |
| -------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| `checkPermission`          | `(userId, permission) => Promise<HaiResult<boolean>>`                               | 检查权限（超管自动通过，支持通配符）         |
| `getUserPermissions`       | `(userId) => Promise<HaiResult<Permission[]>>`                                      | 获取用户权限列表（通过角色聚合去重）         |
| `getUserRoles`             | `(userId) => Promise<HaiResult<Role[]>>`                                            | 获取用户角色列表                             |
| `getUserRolesForMany`      | `(userIds) => Promise<HaiResult<Map<string, Role[]>>>`                              | 批量获取多用户角色（避免 N+1）               |
| `assignRole`               | `(userId, roleId, tx?) => Promise<HaiResult<void>>`                                 | 分配角色给用户                               |
| `removeRole`               | `(userId, roleId, tx?) => Promise<HaiResult<void>>`                                 | 移除用户角色                                 |
| `syncRoles`                | `(userId, roleIds, tx?) => Promise<HaiResult<void>>`                                | 同步用户角色（替换为目标列表）               |
| `createRole`               | `({ code, name, description? }, tx?) => Promise<HaiResult<Role>>`                   | 创建角色                                     |
| `getRole`                  | `(roleId) => Promise<HaiResult<Role \| null>>`                                      | 获取角色                                     |
| `getRoleByCode`            | `(code) => Promise<HaiResult<Role \| null>>`                                        | 根据代码获取角色                             |
| `getAllRoles`              | `(options?) => Promise<HaiResult<PaginatedResult<Role>>>`                           | 获取所有角色（分页）                         |
| `updateRole`               | `(roleId, data, tx?) => Promise<HaiResult<Role>>`                                   | 更新角色                                     |
| `deleteRole`               | `(roleId, tx?) => Promise<HaiResult<void>>`                                         | 删除角色（级联清理关联 + 会话同步）          |
| `createPermission`         | `({ code, name, type?, resource?, action? }, tx?) => Promise<HaiResult<Permission>>`| 创建权限                                     |
| `getPermission`            | `(permissionId) => Promise<HaiResult<Permission \| null>>`                          | 获取权限                                     |
| `getPermissionByCode`      | `(code) => Promise<HaiResult<Permission \| null>>`                                  | 根据代码获取权限                             |
| `getAllPermissions`         | `(options?: PermissionQueryOptions) => Promise<HaiResult<PaginatedResult<Permission>>>` | 获取所有权限（分页 + 类型/关键字筛选）   |
| `deletePermission`         | `(permissionId, tx?) => Promise<HaiResult<void>>`                                   | 删除权限（级联清理关联 + 会话同步）          |
| `assignPermissionToRole`   | `(roleId, permId, tx?) => Promise<HaiResult<void>>`                                 | 分配权限给角色                               |
| `removePermissionFromRole` | `(roleId, permId, tx?) => Promise<HaiResult<void>>`                                 | 移除角色权限                                 |
| `getRolePermissions`       | `(roleId) => Promise<HaiResult<Permission[]>>`                                      | 获取角色的权限列表                           |
| `getRolePermissionsForMany`| `(roleIds) => Promise<HaiResult<Map<string, Permission[]>>>`                        | 批量获取多角色权限（避免 N+1）               |

**通配符规则**：`admin:*` 匹配 `admin:read`、`admin:write` 等。超管角色自动拥有所有权限。

### API Key 管理 — `iam.apiKey`

| 方法           | 签名                                                                    | 说明                                   |
| -------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| `createApiKey` | `(userId, options: CreateApiKeyOptions) => Promise<HaiResult<CreateApiKeyResult>>` | 创建 API Key（明文密钥仅返回一次） |
| `listApiKeys`  | `(userId) => Promise<HaiResult<ApiKey[]>>`                                 | 列出用户的所有 API Key                 |
| `getApiKey`    | `(keyId) => Promise<HaiResult<ApiKey \| null>>`                            | 获取 API Key 详情                      |
| `revokeApiKey` | `(keyId) => Promise<HaiResult<void>>`                                      | 吊销/删除 API Key                      |
| `verifyApiKey` | `(rawKey) => Promise<HaiResult<ApiKey>>`                                   | 验证 API Key 并返回实体（含用户 ID）   |

> 需在 `login.apikey: true` 时才会初始化此子模块，否则访问返回 `NOT_INITIALIZED` 错误。

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

## 错误码 — `HaiIamError`

| 错误码 | 常量                       | HTTP | 说明                 |
| ------ | -------------------------- | ---- | -------------------- |
| 5000   | `AUTH_FAILED`              | 401  | 认证失败             |
| 5001   | `INVALID_CREDENTIALS`      | 401  | 凭证无效             |
| 5002   | `USER_NOT_FOUND`           | 404  | 用户不存在           |
| 5003   | `USER_DISABLED`            | 403  | 用户已禁用           |
| 5004   | `USER_LOCKED`              | 403  | 用户已锁定           |
| 5005   | `USER_ALREADY_EXISTS`      | 409  | 用户已存在           |
| 5006   | `PASSWORD_EXPIRED`         | 401  | 密码已过期           |
| 5007   | `PASSWORD_POLICY_VIOLATION`| 400  | 密码不符合策略       |
| 5010   | `OTP_INVALID`              | 400  | 验证码无效           |
| 5011   | `OTP_EXPIRED`              | 400  | 验证码已过期         |
| 5012   | `OTP_RESEND_TOO_FAST`      | 429  | 发送过于频繁         |
| 5013   | `LOGIN_DISABLED`           | 400  | 登录方式已禁用       |
| 5014   | `REGISTER_DISABLED`        | 403  | 注册已禁用           |
| 5015   | `STRATEGY_NOT_SUPPORTED`   | 400  | 认证策略不支持       |
| 5016   | `APIKEY_INVALID`           | 401  | API Key 无效         |
| 5017   | `APIKEY_EXPIRED`           | 401  | API Key 已过期       |
| 5018   | `APIKEY_DISABLED`          | 403  | API Key 已禁用       |
| 5019   | `APIKEY_NOT_FOUND`         | 404  | API Key 不存在       |
| 5020   | `RESET_TOKEN_INVALID`      | 400  | 重置令牌无效         |
| 5021   | `RESET_TOKEN_EXPIRED`      | 400  | 重置令牌已过期       |
| 5022   | `RESET_TOKEN_MAX_ATTEMPTS` | 429  | 重置验证次数超限     |
| 5100   | `SESSION_NOT_FOUND`        | 401  | 会话不存在           |
| 5101   | `SESSION_EXPIRED`          | 401  | 会话已过期           |
| 5102   | `SESSION_INVALID`          | 401  | 会话无效             |
| 5103   | `SESSION_CREATE_FAILED`    | 500  | 会话创建失败         |
| 5104   | `TOKEN_EXPIRED`            | 401  | 令牌已过期           |
| 5105   | `TOKEN_INVALID`            | 401  | 令牌无效             |
| 5106   | `TOKEN_REFRESH_FAILED`     | 401  | 令牌刷新失败         |
| 5200   | `PERMISSION_DENIED`        | 403  | 权限不足             |
| 5201   | `ROLE_NOT_FOUND`           | 404  | 角色不存在           |
| 5202   | `PERMISSION_NOT_FOUND`     | 404  | 权限不存在           |
| 5203   | `ROLE_ALREADY_EXISTS`      | 409  | 角色已存在           |
| 5204   | `PERMISSION_ALREADY_EXISTS`| 409  | 权限已存在           |
| 5400   | `LDAP_CONNECTION_FAILED`   | 500  | LDAP 连接失败        |
| 5401   | `LDAP_BIND_FAILED`         | 401  | LDAP 绑定失败        |
| 5402   | `LDAP_SEARCH_FAILED`       | 500  | LDAP 搜索失败        |
| 5500   | `REPOSITORY_ERROR`         | 500  | 存储层操作错误       |
| 5501   | `NOT_FOUND`                | 404  | 资源不存在           |
| 5502   | `CONFLICT`                 | 409  | 资源冲突             |
| 5800   | `FORBIDDEN`                | 403  | 禁止访问             |
| 5801   | `INVALID_ARGUMENT`         | 400  | 参数无效             |
| 5900   | `CONFIG_ERROR`             | 500  | 配置错误             |
| 5910   | `NOT_INITIALIZED`          | 500  | 未初始化             |
| 5999   | `INTERNAL_ERROR`           | 500  | 内部错误             |

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
