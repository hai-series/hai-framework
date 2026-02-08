# @hai/iam

身份与访问管理模块，提供统一的 `iam` 对象实现认证与授权功能。

## 功能特性

| 功能           | 说明                              |
| -------------- | --------------------------------- |
| **认证**       | 密码、OTP、LDAP 多策略认证        |
| **会话**       | 有状态会话（随机访问令牌 + 缓存） |
| **授权**       | RBAC 角色与权限管理（DB + 缓存）  |
| **用户管理**   | 注册、查询、更新、密码管理        |
| **前端客户端** | HTTP API 客户端，支持独立前端使用 |

## 安装

```bash
pnpm add @hai/iam
```

## 依赖

- `@hai/db` - 数据库服务（必需，用户/角色/权限/OTP 持久化）
- `@hai/cache` - 缓存服务（必需，会话/权限缓存）
- `@hai/crypto` - 密码哈希（内部使用）

## 快速开始

```ts
import { cache } from '@hai/cache'
import { db } from '@hai/db'
import { iam } from '@hai/iam'

// 1. 初始化
await db.init({ type: 'sqlite', database: './data.db' })
await cache.init({ type: 'memory' })
await iam.init(db, { session: { maxAge: 86400, sliding: true } }, { cache })

// 2. 注册
const userResult = await iam.user.register({
  username: 'admin',
  email: 'admin@example.com',
  password: 'Password123',
})

// 3. 登录
const loginResult = await iam.auth.login({
  identifier: 'admin',
  password: 'Password123',
})
if (loginResult.success) {
  const { user, accessToken } = loginResult.data
}

// 4. 验证令牌
const session = await iam.auth.verifyToken(loginResult.data.accessToken)

// 5. 检查权限
const hasPermission = await iam.authz.checkPermission(
  { userId: user.id, roles: ['role_admin'] },
  'user:read',
)

// 6. 关闭
await iam.close()
```

## API 参考

### 初始化与关闭

| 函数                            | 说明                                  |
| ------------------------------- | ------------------------------------- |
| `iam.init(db, config, options)` | 初始化 IAM 服务（options.cache 必需） |
| `iam.close()`                   | 关闭 IAM 服务                         |
| `iam.create()`                  | 创建独立实例（多租户/测试隔离）       |

### iam.auth - 认证操作

| 方法                         | 说明            |
| ---------------------------- | --------------- |
| `login(credentials)`         | 密码登录        |
| `loginWithOtp(credentials)`  | OTP 登录        |
| `loginWithLdap(credentials)` | LDAP 登录       |
| `logout(accessToken)`        | 登出            |
| `verifyToken(accessToken)`   | 验证令牌        |
| `sendOtp(identifier)`        | 发送 OTP 验证码 |

### iam.user - 用户管理

| 方法                                               | 说明         |
| -------------------------------------------------- | ------------ |
| `register(options)`                                | 注册用户     |
| `getCurrentUser(accessToken)`                      | 获取当前用户 |
| `getUser(userId)`                                  | 获取用户     |
| `listUsers(options)`                               | 用户分页列表 |
| `updateUser(userId, data)`                         | 更新用户     |
| `changePassword(userId, oldPassword, newPassword)` | 修改密码     |
| `validatePassword(password)`                       | 验证密码强度 |

### iam.authz - 授权管理

> 注意：`roles` 使用 **角色 ID**（如 `role_admin`）。角色/权限的创建使用 `code` 字段标识。

| 方法                                           | 说明             |
| ---------------------------------------------- | ---------------- |
| `checkPermission(context, permission)`         | 检查权限         |
| `getUserPermissions(userId)`                   | 获取用户权限     |
| `getUserRoles(userId)`                         | 获取用户角色     |
| `assignRole(userId, roleId)`                   | 分配角色         |
| `removeRole(userId, roleId)`                   | 移除角色         |
| `createRole(role)`                             | 创建角色         |
| `getRole(roleId)`                              | 获取角色         |
| `updateRole(roleId, data)`                     | 更新角色         |
| `getAllRoles(options)`                         | 角色分页列表     |
| `deleteRole(roleId)`                           | 删除角色         |
| `createPermission(permission)`                 | 创建权限         |
| `getPermission(permissionId)`                  | 获取权限         |
| `getAllPermissions(options)`                   | 权限分页列表     |
| `deletePermission(permissionId)`               | 删除权限         |
| `assignPermissionToRole(roleId, permissionId)` | 分配权限到角色   |
| `removePermissionFromRole(roleId, permId)`     | 移除角色权限     |
| `getRolePermissions(roleId)`                   | 获取角色权限列表 |

### iam.session - 会话管理

| 方法                        | 说明                       |
| --------------------------- | -------------------------- |
| `create(options)`           | 创建会话                   |
| `get(accessToken)`          | 获取会话（滑动续期）       |
| `verifyToken(accessToken)`  | 验证令牌（返回会话或错误） |
| `update(accessToken, data)` | 更新会话                   |
| `delete(accessToken)`       | 删除会话                   |
| `deleteByUserId(userId)`    | 删除用户所有会话           |

### iam.client - 前端客户端

```ts
// 方式 1：通过 iam 对象创建（Node.js 环境）
// 方式 2：独立导入（前端/浏览器环境）
import { createIamClient } from '@hai/iam/client'

const client = iam.client.create({ baseUrl: '/api/iam' })
const client = createIamClient({ baseUrl: '/api/iam' })
```

| 方法                         | 说明         |
| ---------------------------- | ------------ |
| `login(credentials)`         | 登录         |
| `loginWithOtp(credentials)`  | OTP 登录     |
| `sendOtp(identifier)`        | 发送验证码   |
| `logout()`                   | 登出         |
| `register(options)`          | 注册         |
| `getCurrentUser()`           | 获取当前用户 |
| `updateUser(options)`        | 更新用户信息 |
| `changePassword(options)`    | 修改密码     |
| `validatePassword(password)` | 验证密码强度 |

## 核心流程

### 初始化 (`iam.init`)

```
iam.init(db, config, { cache })
  ├─ 校验配置（Zod Schema）
  ├─ initializeComponents()
  │   ├─ 【DB】创建表：iam_users, iam_otp, iam_roles, iam_permissions,
  │   │                  iam_role_permissions, iam_user_roles（含索引）
  │   ├─ 创建密码策略（PasswordStrategy）
  │   ├─ 创建 OTP 策略（可选，取决于 login.otp + otp 配置）
  │   ├─ 创建 LDAP 策略（可选，取决于 login.ldap + ldap 配置）
  │   ├─ 创建会话管理器（底层使用 Cache）
  │   └─ 创建授权管理器（底层使用 DB + Cache）
  ├─ seedIamData()（可选，seedDefaultData = true）
  │   └─ 【DB 事务】INSERT OR IGNORE 默认角色/权限/关联
  └─ 组装 auth / user 操作接口
```

### 密码登录 (`iam.auth.login`)

```
login({ identifier, password })
  ├─ 检查密码登录是否启用
  ├─ passwordStrategy.authenticate()
  │   ├─ 【DB】findByIdentifier() → 查 iam_users
  │   ├─ 校验账户状态（enabled, lockedUntil）
  │   ├─ 【内存】@hai/crypto 校验密码哈希
  │   ├─ 失败 → 【DB】UPDATE iam_users 失败计数/锁定时间
  │   └─ 成功 → 【DB】UPDATE iam_users 重置失败计数
  ├─ 【DB】getRoles() → 查 iam_user_roles + iam_roles
  ├─ sessionManager.create()
  │   ├─ 【内存】crypto.randomUUID() 生成令牌
  │   ├─ （单设备模式）【Cache】遍历删除旧令牌
  │   ├─ 【Cache】set(iam:token:{token}, session, TTL)
  │   └─ 【Cache】sadd(iam:user:{userId}:tokens, token)
  └─ 返回 AuthResult { user, accessToken, accessTokenExpiresAt }
```

### OTP 登录 (`iam.auth.loginWithOtp`)

```
sendOtp(identifier):
  ├─ 【DB】查 iam_otp（检查发送频率）
  ├─ 【内存】crypto.getRandomValues 生成验证码
  ├─ 【DB】UPSERT iam_otp
  └─ 外部发送（邮件/短信）

loginWithOtp({ identifier, code }):
  ├─ 【DB】查 iam_users → 校验账户状态
  ├─ 【DB】查 iam_otp → 校验过期/次数/匹配
  │   ├─ 不匹配 → 【DB】UPDATE iam_otp 递增尝试次数
  │   └─ 匹配 → 【DB】DELETE iam_otp
  ├─ （用户不存在 + autoRegister）→ 【DB】INSERT iam_users
  └─ 创建会话 → 同密码登录
```

### LDAP 登录 (`iam.auth.loginWithLdap`)

```
loginWithLdap({ username, password }):
  ├─ 外部 LDAP bind + search
  ├─ （syncUser 模式）
  │   ├─ 【DB】查 iam_users
  │   ├─ 已存在 → 【DB】UPDATE 同步属性
  │   └─ 不存在 → 【DB】INSERT iam_users
  └─ 创建会话 → 同密码登录
```

### 令牌验证 (`iam.auth.verifyToken`)

```
verifyToken(accessToken):
  ├─ 【Cache】get(iam:token:{token}) → 读取 Session
  ├─ 检查过期 → 过期则 【Cache】del
  └─ （滑动续期）→ 【Cache】set 更新 TTL
```

### 用户注册 (`iam.user.register`)

```
register({ username, email, password, ... }):
  ├─ 校验注册开关 + 密码强度
  ├─ 【DB】existsByUsername / existsByEmail
  ├─ 【内存】@hai/crypto 哈希密码
  ├─ 【DB 事务】INSERT iam_users + 查回新用户
  ├─ assignDefaultRole()（事务外，失败不影响注册）
  │   └─ 【DB + Cache】INSERT iam_user_roles + 同步会话角色
  └─ 返回 RegisterResult { user, agreements }
```

### 权限检查 (`iam.authz.checkPermission`)

```
checkPermission({ userId, roles }, permission):
  ├─ resolveRoleIds()
  │   ├─ ctx.roles 非空 → 直接使用
  │   └─ 空 → 【DB】查 iam_user_roles
  ├─ 是超管 → 直接返回 true
  └─ 查询每个角色的权限代码
      └─ 【Cache】exists(iam:role:{roleId}:perms)
          ├─ 命中 → 【Cache】smembers → 返回权限代码
          └─ 未命中 → 【DB】查 iam_role_permissions + iam_permissions
              └─ 【Cache】sadd 写缓存 + 反向索引
```

### 角色分配 (`iam.authz.assignRole`)

```
assignRole(userId, roleId):
  ├─ 【DB】校验角色存在
  ├─ 【DB】INSERT iam_user_roles
  └─ 实时同步所有活跃会话
      ├─ 【DB】查最新角色列表
      ├─ 【Cache】smembers(iam:user:{userId}:tokens) → 获取所有令牌
      └─ 对每个令牌：【Cache】get → 更新 roles → set 回写
```

### 权限分配到角色 (`iam.authz.assignPermissionToRole`)

```
assignPermissionToRole(roleId, permissionId):
  ├─ 【DB】校验角色/权限存在
  ├─ 【DB】INSERT iam_role_permissions
  ├─ 【Cache】sadd(iam:role:{roleId}:perms, code) → 角色权限缓存
  └─ 【Cache】sadd(iam:permission:{code}:roles, roleId) → 反向索引
```

### 移除用户角色 (`iam.authz.removeRole`)

```
removeRole(userId, roleId):
  ├─ 【DB】DELETE iam_user_roles WHERE user_id = ? AND role_id = ?
  └─ syncUserSessionRoles(userId)
      ├─ 【DB】查最新角色列表
      ├─ 【Cache】smembers(iam:user:{userId}:tokens) → 获取所有令牌
      └─ 对每个令牌：【Cache】get → 更新 roles → set 回写
```

### 移除角色权限 (`iam.authz.removePermissionFromRole`)

```
removePermissionFromRole(roleId, permissionId):
  ├─ 【DB】permissionRepository.findById() → 查权限（获取 code）
  ├─ 权限不存在 → 返回 PERMISSION_NOT_FOUND 错误
  ├─ 【DB】DELETE iam_role_permissions WHERE role_id = ? AND permission_id = ?
  ├─ 【Cache】srem(iam:role:{roleId}:perms, code) → 移除角色权限缓存
  └─ 【Cache】srem(iam:permission:{code}:roles, roleId) → 移除反向索引
```

### 创建角色 (`iam.authz.createRole`)

```
createRole({ code, name, description? }):
  ├─ 【DB】roleRepository.create() → INSERT iam_roles
  ├─ 【DB】roleRepository.findByCode(code) → 查回新角色
  └─ 返回 Role { id, code, name, description, createdAt, updatedAt }
```

### 更新角色 (`iam.authz.updateRole`)

```
updateRole(roleId, data):
  ├─ 【DB】roleRepository.updateById() → UPDATE iam_roles
  ├─ changes = 0 → 返回 ROLE_NOT_FOUND 错误
  ├─ 【DB】roleRepository.findById() → 查回更新后的角色
  └─ 返回 Role
```

### 删除角色 (`iam.authz.deleteRole`)

```
deleteRole(roleId):
  ├─ 【DB】roleRepository.deleteById() → DELETE iam_roles
  ├─ changes = 0 → 返回 ROLE_NOT_FOUND 错误
  ├─ （若 roleId === superAdminRoleId）→ 【内存】重置 superAdminRoleId = null
  ├─ 清理缓存：
  │   ├─ 【Cache】smembers(iam:role:{roleId}:perms) → 读取角色关联的权限代码
  │   ├─ 对每个权限代码：【Cache】srem(iam:permission:{code}:roles, roleId) → 清理反向索引
  │   └─ 【Cache】del(iam:role:{roleId}:perms) → 删除角色权限缓存
  └─ 返回 void
```

### 创建权限 (`iam.authz.createPermission`)

```
createPermission({ code, name, description? }):
  ├─ 【DB】permissionRepository.create() → INSERT iam_permissions
  ├─ 【DB】permissionRepository.findByCode(code) → 查回新权限
  └─ 返回 Permission { id, code, name, description, createdAt, updatedAt }
```

### 删除权限 (`iam.authz.deletePermission`)

```
deletePermission(permissionId):
  ├─ 【DB】permissionRepository.findById() → 查权限（获取 code）
  ├─ 权限不存在 → 返回 PERMISSION_NOT_FOUND 错误
  ├─ 【DB】permissionRepository.deleteById() → DELETE iam_permissions
  ├─ changes = 0 → 返回 PERMISSION_NOT_FOUND 错误
  ├─ 清理缓存：
  │   ├─ 【Cache】smembers(iam:permission:{code}:roles) → 读取拥有该权限的角色列表
  │   ├─ 对每个角色：【Cache】srem(iam:role:{roleId}:perms, code) → 从角色权限缓存中移除
  │   └─ 【Cache】del(iam:permission:{code}:roles) → 删除反向索引
  └─ 返回 void
```

### 获取角色权限列表 (`iam.authz.getRolePermissions`)

```
getRolePermissions(roleId):
  └─ 【DB】查 iam_role_permissions + iam_permissions WHERE role_id = ?
      └─ 返回 Permission[]
```

## 前端客户端

```ts
import { createIamClient } from '@hai/iam/client'

const client = createIamClient({
  baseUrl: '/api/iam',
  getAccessToken: () => localStorage.getItem('accessToken'),
  onTokenRefresh: (tokens) => {
    localStorage.setItem('accessToken', tokens.accessToken)
  },
  onAuthError: () => {
    window.location.href = '/login'
  },
})

// 登录
const result = await client.login({
  identifier: 'admin',
  password: 'Password123',
})

// 获取当前用户
const user = await client.getCurrentUser()

// 修改密码
await client.changePassword({
  oldPassword: 'Password123',
  newPassword: 'NewPassword456',
})
```

## 存储架构

### 数据库表（@hai/db，初始化时自动创建）

| 表名                   | 用途          |
| ---------------------- | ------------- |
| `iam_users`            | 用户信息      |
| `iam_otp`              | OTP 验证码    |
| `iam_roles`            | 角色定义      |
| `iam_permissions`      | 权限定义      |
| `iam_role_permissions` | 角色-权限关联 |
| `iam_user_roles`       | 用户-角色关联 |

### 缓存键（@hai/cache）

| Key                           | 数据结构      | 用途              |
| ----------------------------- | ------------- | ----------------- |
| `iam:token:{token}`           | String/Object | Token → 会话数据  |
| `iam:user:{userId}:tokens`    | Set           | 用户 → Token 集合 |
| `iam:role:{roleId}:perms`     | Set           | 角色 → 权限代码   |
| `iam:permission:{code}:roles` | Set           | 权限 → 角色集合   |
