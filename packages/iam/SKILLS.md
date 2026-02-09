# @hai/iam - AI 助手参考

## 模块概述

`@hai/iam` 是一个统一的身份与访问管理模块，支持多种认证策略、会话管理和 RBAC 授权。

**依赖**：

- `@hai/db` - 数据库服务（必需，持久化用户/角色/权限/OTP 数据）
- `@hai/cache` - 缓存服务（必需，会话存储 + RBAC 权限缓存）
- `@hai/crypto` - 密码哈希（内部使用）

**重要**：所有操作返回 `Result<T, IamError>` 类型，需检查 `success` 属性。

## 目录结构

```
packages/iam/
├── src/
│   ├── index.ts                    # Node.js 主入口（导出所有模块）
│   ├── iam-index.browser.ts        # 浏览器入口（仅导出客户端）
│   ├── iam-main.ts                 # 统一 iam 对象（IamService 单例）
│   ├── iam-config.ts               # 配置 Schema + 错误码
│   ├── iam-core-types.ts           # IamError 等核心类型
│   ├── iam-i18n.ts                 # i18n 文案
│   ├── iam-initializer.ts          # 组件初始化 + 种子数据
│   ├── authn/                      # 认证模块
│   │   ├── iam-authn-service.ts    # 认证操作聚合
│   │   ├── iam-authn-types.ts      # 凭证/策略/操作接口
│   │   ├── iam-authn-utils.ts      # 登录失败/锁定工具
│   │   ├── password/               # 密码策略
│   │   ├── otp/                    # OTP 策略 + OTP 存储
│   │   └── ldap/                   # LDAP 策略
│   ├── authz/rbac/                 # RBAC 授权模块
│   │   ├── iam-authz-rbac-service.ts          # 授权管理器
│   │   ├── iam-authz-rbac-types.ts            # Role/Permission/AuthzManager
│   │   ├── iam-authz-rbac-repository-role.ts  # 角色 DB 存储
│   │   ├── iam-authz-rbac-repository-permission.ts  # 权限 DB 存储
│   │   └── iam-authz-rbac-repository-relation.ts    # 角色-权限/用户-角色关联（DB + Cache）
│   ├── session/                    # 会话模块
│   │   ├── iam-session-service.ts           # 会话管理器
│   │   ├── iam-session-types.ts             # Session/SessionManager
│   │   ├── iam-session-utils.ts             # 令牌生成/会话构建
│   │   └── iam-session-repository-cache.ts  # 缓存会话存储
│   ├── user/                       # 用户模块
│   │   ├── iam-user-service.ts              # 用户操作
│   │   ├── iam-user-types.ts                # User/UserOperations
│   │   ├── iam-user-utils.ts                # StoredUser → User 转换
│   │   └── iam-user-repository-user.ts      # 用户 DB 存储
│   └── client/                     # 前端客户端
│       ├── index.ts                # 客户端入口
│       └── iam-client.ts           # HTTP 客户端实现
└── tests/
```

## 存储架构

### 数据库表（@hai/db，初始化时自动创建）

| 表名                   | 用途          | 主要字段                                                            |
| ---------------------- | ------------- | ------------------------------------------------------------------- |
| `iam_users`            | 用户信息      | id, username, email, phone, password_hash, enabled, locked_until 等 |
| `iam_otp`              | OTP 验证码    | identifier(PK), code, attempts, expires_at, created_at              |
| `iam_roles`            | 角色定义      | id, code, name, description, is_system                              |
| `iam_permissions`      | 权限定义      | id, code, name, resource, action                                    |
| `iam_role_permissions` | 角色-权限关联 | role_id, permission_id（联合唯一索引）                              |
| `iam_user_roles`       | 用户-角色关联 | user_id, role_id（联合唯一索引）                                    |

### 缓存键（@hai/cache）

| Key                           | 数据结构      | 用途                            | TTL            |
| ----------------------------- | ------------- | ------------------------------- | -------------- |
| `iam:token:{token}`           | String/Object | Token → Session 会话数据        | session.maxAge |
| `iam:user:{userId}:tokens`    | Set           | 用户 → 活跃 Token 集合          | 无（手动管理） |
| `iam:role:{roleId}:perms`     | Set           | 角色 → 权限代码集合             | 无（写时更新） |
| `iam:permission:{code}:roles` | Set           | 权限代码 → 拥有该权限的角色集合 | 无（写时更新） |

## 核心流程（含 DB/Cache 节点标注）

### 1. 初始化流程 (`iam.init`)

```
iam.init(db, config, { cache })
  ├─ 校验配置（Zod Schema）
  ├─ initializeComponents()
  │   ├─ 【DB】创建表：iam_users, iam_otp, iam_roles, iam_permissions,
  │   │                  iam_role_permissions, iam_user_roles（含索引）
  │   ├─ 创建密码策略（PasswordStrategy）
  │   ├─ 创建 OTP 策略（OtpStrategy, 可选, 取决于 login.otp + otp 配置）
  │   ├─ 创建 LDAP 策略（LdapStrategy, 可选, 取决于 login.ldap + ldap 配置 + ldapClientFactory）
  │   ├─ 创建会话管理器（SessionManager, 底层使用 Cache）
  │   └─ 创建授权管理器（AuthzManager, 底层使用 DB + Cache）
  ├─ seedIamData()（可选，config.seedDefaultData = true）
  │   └─ 【DB 事务】INSERT OR IGNORE 默认角色/权限/角色-权限关联
  ├─ createAuthOperations()（组装认证操作）
  └─ createUserOperations()（组装用户操作）
```

### 2. 密码登录流程 (`iam.auth.login`)

```
iam.auth.login({ identifier, password })
  ├─ 检查密码登录是否启用（loginConfig.password）
  ├─ passwordStrategy.authenticate()
  │   ├─ 【DB】userRepository.findByIdentifier() → 查 iam_users
  │   ├─ 校验账户状态（enabled, lockedUntil）
  │   ├─ 【内存】passwordProvider.verify() → @hai/crypto 校验密码哈希
  │   ├─ 失败 → 【DB】recordLoginFailure() → UPDATE iam_users 失败计数/锁定时间
  │   ├─ 成功 → 【DB】resetLoginFailures() → UPDATE iam_users 重置计数
  │   └─ 检查密码是否过期（passwordConfig.expirationDays）
  ├─ resolveUserRoles()
  │   └─ 【DB】userRoleRepository.getRoles() → 查 iam_user_roles + iam_roles
  ├─ sessionManager.create()
  │   ├─ 【内存】generateToken() → crypto.randomUUID()
  │   ├─ （单设备模式）clearUserTokens() → 【Cache】遍历删除旧令牌
  │   ├─ 【Cache】set(iam:token:{token}, session, TTL)
  │   └─ 【Cache】sadd(iam:user:{userId}:tokens, token)
  └─ 返回 AuthResult { user, accessToken, accessTokenExpiresAt, agreements }
```

### 3. OTP 登录流程 (`iam.auth.loginWithOtp`)

```
sendOtp(identifier):
  ├─ 【DB】otpRepository.fetchOtp() → 查 iam_otp（检查发送频率）
  ├─ 【内存】generateOtpCode()（crypto.getRandomValues 安全随机）
  ├─ 【DB】otpRepository.saveOtp() → UPSERT iam_otp
  └─ otpRepository.sendEmail/sendSms()（外部发送）

loginWithOtp({ identifier, code }):
  ├─ 【DB】userRepository.findByIdentifier() → 校验账户状态
  ├─ 【DB】otpRepository.fetchOtp() → 查 iam_otp
  ├─ 校验：过期、尝试次数、验证码匹配
  │   ├─ 不匹配 → 【DB】incrementOtpAttempts() → UPDATE iam_otp
  │   └─ 匹配 → 【DB】removeOtp() → DELETE iam_otp
  ├─ （用户不存在 + autoRegister）→ 【DB】userRepository.create() → INSERT iam_users
  ├─ 【DB】resetLoginFailures()
  ├─ resolveUserRoles() → 同密码登录
  ├─ sessionManager.create() → 同密码登录
  └─ 返回 AuthResult
```

### 4. LDAP 登录流程 (`iam.auth.loginWithLdap`)

```
loginWithLdap({ username, password }):
  ├─ ldapClientFactory() → 获取 LDAP 客户端
  ├─ LDAP bind + search（外部 LDAP 服务）
  ├─ 解析 LDAP 属性 → buildLdapUser()
  ├─ （syncUser 模式）
  │   ├─ 【DB】userRepository.findByUsername() → 查 iam_users
  │   ├─ 已存在 → 【DB】updateById() → 同步 LDAP 属性
  │   └─ 不存在 → 【DB】create() → INSERT iam_users
  ├─ 【DB】校验账户状态 + 重置失败计数
  ├─ resolveUserRoles() + sessionManager.create() → 同密码登录
  └─ 返回 AuthResult
```

### 5. 令牌验证流程 (`iam.auth.verifyToken`)

```
verifyToken(accessToken):
  ├─ sessionManager.get(accessToken)
  │   ├─ 【Cache】get(iam:token:{token}) → 读取 Session
  │   ├─ 检查过期 → 过期则 【Cache】del(iam:token:{token})
  │   └─ （滑动续期）→ 【Cache】set(iam:token:{token}, session, maxAge) 更新 TTL
  └─ Session 不存在 → 返回 SESSION_INVALID 错误
```

### 6. 登出流程 (`iam.auth.logout`)

```
logout(accessToken):
  ├─ 【Cache】sessionManager.get(accessToken) → 获取 Session
  ├─ 【Cache】del(iam:token:{token}) → 删除会话
  └─ 【Cache】srem(iam:user:{userId}:tokens, token) → 从用户令牌集合移除
```

### 7. 用户注册流程 (`iam.user.register`)

```
register({ username, email, password, ... }):
  ├─ 校验注册是否启用（registerConfig.enabled）
  ├─ 【内存】validatePassword() → 密码强度校验
  ├─ 【DB】existsByUsername() → 查 iam_users
  ├─ 【DB】existsByEmail() → 查 iam_users
  ├─ 【内存】hashPassword() → @hai/crypto 哈希
  ├─ 【DB 事务】
  │   ├─ userRepository.create() → INSERT iam_users
  │   └─ userRepository.findByUsername() → 查回新用户
  ├─ assignDefaultRole()（事务外，失败不影响注册）
  │   ├─ 【DB】roleRepository.findById() → 查 iam_roles
  │   └─ 【DB + Cache】userRoleRepository.assign() → INSERT iam_user_roles + 同步会话角色
  └─ 返回 RegisterResult { user, agreements }
```

### 8. 权限检查流程 (`iam.authz.checkPermission`)

```
checkPermission({ userId, roles }, permission):
  ├─ resolveRoleIds()
  │   ├─ ctx.roles 非空 → 直接使用
  │   └─ 空 → 【DB】userRoleRepository.getRoleIds() → 查 iam_user_roles
  ├─ resolveSuperAdminRoleId()
  │   └─ 首次 →【DB】roleRepository.findByCode('super_admin')，之后缓存在内存
  ├─ 是超管 → 直接返回 true
  └─ 并行查询每个角色的权限代码
      └─ getPermissionCodesCached(roleId)
          ├─ 【Cache】exists(iam:role:{roleId}:perms) → 缓存命中
          │   └─ 【Cache】smembers(iam:role:{roleId}:perms) → 返回权限代码
          └─ 缓存未命中
              ├─ 【DB】查 iam_role_permissions + iam_permissions
              └─ 【Cache】sadd(iam:role:{roleId}:perms, ...codes) → 写缓存
              └─ 【Cache】sadd(iam:permission:{code}:roles, roleId) → 反向索引
```

### 9. 角色分配/移除流程 (`iam.authz.assignRole / removeRole`)

```
assignRole(userId, roleId):
  ├─ 【DB】roleRepository.existsById() → 校验角色存在
  ├─ 【DB】INSERT iam_user_roles
  └─ syncUserSessionRoles(userId)
      ├─ 【DB】getRoleIdsInternal() → 查最新角色列表
      ├─ 【Cache】smembers(iam:user:{userId}:tokens) → 获取用户所有活跃令牌
      └─ 对每个令牌：
          ├─ 【Cache】get(iam:token:{token}) → 读取 Session
          ├─ 【Cache】ttl(iam:token:{token}) → 获取剩余 TTL
          ├─ 更新 Session.roles = 最新角色列表
          ├─ 【Cache】set(iam:token:{token}, updated, TTL) → 回写
          └─ stale token → 【Cache】srem(iam:user:{userId}:tokens, token) → 清理
```

### 10. 权限分配到角色 (`iam.authz.assignPermissionToRole`)

```
assignPermissionToRole(roleId, permissionId):
  ├─ 【DB】roleRepository.existsById() → 校验角色存在
  ├─ 【DB】permissionRepository.findById() → 查权限（获取 code）
  ├─ 【DB】INSERT iam_role_permissions
  ├─ 【Cache】sadd(iam:role:{roleId}:perms, permissionCode) → 更新角色权限缓存
  └─ 【Cache】sadd(iam:permission:{code}:roles, roleId) → 更新反向索引
```

### 11. 移除角色权限 (`iam.authz.removePermissionFromRole`)

```
removePermissionFromRole(roleId, permissionId):
  ├─ 【DB】permissionRepository.findById() → 查权限（获取 code）
  ├─ 权限不存在 → 返回 PERMISSION_NOT_FOUND 错误
  ├─ 【DB】DELETE iam_role_permissions WHERE role_id = ? AND permission_id = ?
  ├─ 【Cache】srem(iam:role:{roleId}:perms, permissionCode) → 移除角色权限缓存
  └─ 【Cache】srem(iam:permission:{code}:roles, roleId) → 移除反向索引
```

### 12. 创建角色 (`iam.authz.createRole`)

```
createRole({ code, name, description? }):
  ├─ 【DB】roleRepository.create() → INSERT iam_roles
  ├─ 【DB】roleRepository.findByCode(code) → 查回新创建的角色
  └─ 返回 Role { id, code, name, description, createdAt, updatedAt }
```

### 13. 更新角色 (`iam.authz.updateRole`)

```
updateRole(roleId, data):
  ├─ 【DB】roleRepository.updateById() → UPDATE iam_roles
  ├─ changes = 0 → 返回 ROLE_NOT_FOUND 错误
  ├─ 【DB】roleRepository.findById() → 查回更新后的角色
  └─ 返回 Role
```

### 14. 删除角色 (`iam.authz.deleteRole`)

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

### 15. 创建权限 (`iam.authz.createPermission`)

```
createPermission({ code, name, description? }):
  ├─ 【DB】permissionRepository.create() → INSERT iam_permissions
  ├─ 【DB】permissionRepository.findByCode(code) → 查回新创建的权限
  └─ 返回 Permission { id, code, name, description, createdAt, updatedAt }
```

### 16. 删除权限 (`iam.authz.deletePermission`)

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

### 17. 获取角色权限列表 (`iam.authz.getRolePermissions`)

```
getRolePermissions(roleId):
  └─ 【DB】查 iam_role_permissions + iam_permissions WHERE role_id = ?
      └─ 返回 Permission[]
```

## 核心 API

```ts
import { cache } from '@hai/cache'
import { db } from '@hai/db'
import { iam } from '@hai/iam'
```

### 初始化与关闭

```ts
// 1. 先初始化数据库
await db.init({ type: 'sqlite', database: ':memory:' })

// 2. 初始化缓存
await cache.init({ type: 'memory' })

// 3. 初始化 IAM（db/cache 为必需参数）
await iam.init(db, {
  password: {
    minLength: 8
  }
}, {
  cache,
})

// 完整配置
await iam.init(db, {
  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecialChar: false,
    expirationDays: 0, // 0 = 不过期
  },

  session: {
    maxAge: 86400, // 会话最大有效期（秒）
    sliding: true, // 滑动续期
    singleDevice: false, // 单设备登录
  },

  otp: {
    length: 6,
    expiresIn: 300,
    maxAttempts: 3,
    resendInterval: 60
  },

  login: {
    password: true,
    otp: true,
    ldap: false
  },

  // 认证策略启用规则：提供对应配置且 login 未禁用时启用

  register: {
    enabled: true,
    defaultEnabled: true
  },

  agreements: {
    userAgreementUrl: 'https://example.com/terms',
    privacyPolicyUrl: 'https://example.com/privacy',
    showOnRegister: true,
    showOnLogin: false
  },

  security: {
    maxLoginAttempts: 5,
    lockoutDuration: 900
  },

  rbac: {
    defaultRole: 'user',
    superAdminRole: 'super_admin',
  },

  seedDefaultData: false, // 初始化时是否种子默认角色/权限
}, {
  cache,
})

// LDAP 登录需额外传入 ldapClientFactory
await iam.init(
  db,
  {
    login: { ldap: true },
    ldap: {
      url: 'ldap://localhost:389',
      bindDn: 'cn=admin,dc=example,dc=com',
      bindPassword: 'secret',
      searchBase: 'dc=example,dc=com'
    }
  },
  {
    cache,
    ldapClientFactory: async () => {
      return {
        success: false,
        error: { code: iam.errorCode.LDAP_CONNECTION_FAILED, message: 'LDAP client not configured' }
      }
    }
  }
)

// 关闭
await iam.close()
```

### 用户注册 (iam.user)

```ts
// 注册用户
const result = await iam.user.register({
  username: 'admin',
  email: 'admin@example.com',
  phone: '+8613800138000',
  password: 'Password123',
  displayName: '管理员',
  metadata: { department: 'IT' }
})

if (result.success) {
  const user = result.data.user
  // user: { id, username, email, phone, displayName, enabled, emailVerified, phoneVerified, createdAt, updatedAt, metadata }
}

// 验证密码强度（同步，不创建用户）
const validateResult = iam.user.validatePassword('weak')
if (!validateResult.success) {
  console.log('密码不符合要求:', validateResult.error.message)
}
```

### 密码登录 (iam.auth)

```ts
// 使用用户名或邮箱登录
const loginResult = await iam.auth.login({
  identifier: 'admin', // 用户名/邮箱/手机号
  password: 'Password123'
})

if (loginResult.success) {
  const { user, accessToken, accessTokenExpiresAt } = loginResult.data
}

// 登出
await iam.auth.logout(accessToken)
```

### OTP 登录

```ts
// 发送验证码
const sendResult = await iam.auth.sendOtp('user@example.com')
if (sendResult.success) {
  console.log('验证码过期时间:', sendResult.data.expiresAt)
}

// 使用验证码登录
const otpLoginResult = await iam.auth.loginWithOtp({
  identifier: 'user@example.com', // 邮箱或手机号
  code: '123456'
})
```

### LDAP 登录

```ts
const ldapLoginResult = await iam.auth.loginWithLdap({
  username: 'ldap-user',
  password: 'LdapPassword123'
})

if (ldapLoginResult.success) {
  const { user, accessToken } = ldapLoginResult.data
}
```

> 安全说明：OTP/LDAP 登录失败同样会触发 `security.maxLoginAttempts` 与 `security.lockoutDuration` 账户锁定策略。

### 令牌操作

```ts
// 验证令牌
const verifyResult = await iam.auth.verifyToken(accessToken)
if (verifyResult.success) {
  const session = verifyResult.data
  // session: { userId, username, roles, accessToken, expiresAt, createdAt, lastActiveAt }
}
```

### 用户管理

```ts
import type { PaginationOptionsInput } from '@hai/core'

// 获取当前用户（通过令牌）
const currentUser = await iam.user.getCurrentUser(accessToken)

// 获取用户
const user = await iam.user.getUser('user-id')

// 用户分页列表
const listResult = await iam.user.listUsers({ page: 1, pageSize: 20 } satisfies PaginationOptionsInput)
if (listResult.success) {
  const { items, total } = listResult.data
}

// 更新用户
const updated = await iam.user.updateUser('user-id', {
  displayName: '新名称',
  metadata: { level: 'vip' }
})

// 修改密码
const changeResult = await iam.user.changePassword('user-id', 'oldPassword', 'newPassword')
```

### RBAC 授权 (iam.authz)

> 注意：角色/权限创建使用 `code` 字段，`id` 由系统自动生成。授权上下文中的 `roles` 使用 **角色 ID**。

```ts
// 创建权限（code 为业务标识，id 自动生成）
await iam.authz.createPermission({ code: 'users:read', name: '读取用户', description: '查看用户列表' })
await iam.authz.createPermission({ code: 'users:write', name: '写入用户' })
await iam.authz.createPermission({ code: 'users:delete', name: '删除用户' })

// 创建角色（code 为业务标识，id 自动生成）
await iam.authz.createRole({
  code: 'admin',
  name: '管理员',
  description: '系统管理员'
})

// 分配权限给角色（使用 ID）
await iam.authz.assignPermissionToRole('role_admin', 'perm_users_read')
await iam.authz.assignPermissionToRole('role_admin', 'perm_users_write')

// 分配角色给用户
await iam.authz.assignRole('user-id', 'role_admin')

// 移除用户角色（同步更新活跃会话中的角色列表）
await iam.authz.removeRole('user-id', 'role_admin')

// 检查权限
const context = { userId: 'user-id', roles: ['role_admin'] }
const canRead = await iam.authz.checkPermission(context, 'users:read')
const canDelete = await iam.authz.checkPermission(context, 'users:delete')

// 通配符权限
await iam.authz.createPermission({ code: 'admin:*', name: '管理员全部权限' })
// 'admin:*' 匹配 'admin:users', 'admin:settings' 等

// 获取单个角色/权限
const role = await iam.authz.getRole('role_admin')
const perm = await iam.authz.getPermission('perm_users_read')

// 更新角色
await iam.authz.updateRole('role_admin', { name: '超级管理员', description: '拥有所有权限' })

// 获取用户权限
const permissions = await iam.authz.getUserPermissions('user-id')

// 获取用户角色
const roles = await iam.authz.getUserRoles('user-id')
const isAdmin = roles.success && roles.data.some(role => role.code === 'admin')

// 获取角色关联的权限列表
const rolePerms = await iam.authz.getRolePermissions('role_admin')

// 角色与权限分页列表
const rolesResult = await iam.authz.getAllRoles({ page: 1, pageSize: 50 })
const permissionsResult = await iam.authz.getAllPermissions({ page: 1, pageSize: 50 })

// 移除角色权限（同步清理双向缓存）
await iam.authz.removePermissionFromRole('role_admin', 'perm_users_write')

// 删除角色/权限（同步清理关联缓存）
await iam.authz.deleteRole('role_admin') // 清理 iam:role:{id}:perms + 反向索引
await iam.authz.deletePermission('perm_id') // 清理 iam:permission:{code}:roles + 角色缓存
```

### 会话管理 (iam.session)

```ts
// 创建会话
const sessionResult = await iam.session.create({
  userId: 'user-id',
  username: 'admin',
  roles: ['role_admin'],
  source: 'pc'
})

// 获取会话（滑动续期模式下自动延长过期时间）
const session = await iam.session.get(accessToken)

// 验证令牌（与 iam.auth.verifyToken 相同）
const verified = await iam.session.verifyToken(accessToken)

// 删除会话
await iam.session.delete(accessToken)

// 删除用户所有会话（强制下线）
await iam.session.deleteByUserId('user-id')
```

### 前端客户端 (iam.client)

```ts
// 方式 1：通过 iam 对象创建（Node.js 环境）
// 方式 2：独立导入（前端/浏览器环境）
import { createIamClient } from '@hai/iam/client'

const client = iam.client.create({ baseUrl: '/api/iam' })

const client = createIamClient({
  baseUrl: '/api/iam',
  getAccessToken: () => localStorage.getItem('accessToken'),
  onTokenRefresh: (tokens) => {
    localStorage.setItem('accessToken', tokens.accessToken)
  },
  onAuthError: (error) => {
    console.error('认证失败:', error.message)
    window.location.href = '/login'
  },
})

// 登录
const loginResult = await client.login({
  identifier: 'admin',
  password: 'Password123',
})

// OTP 登录
await client.sendOtp('user@example.com')
const otpResult = await client.loginWithOtp({
  identifier: 'user@example.com',
  code: '123456',
})

// 获取当前用户
const userResult = await client.getCurrentUser()

// 更新用户信息
await client.updateUser({
  displayName: '新名称',
  avatarUrl: 'https://example.com/avatar.png',
})

// 修改密码
await client.changePassword({
  oldPassword: 'Password123',
  newPassword: 'NewPassword456',
})

// 验证密码强度
const validateResult = await client.validatePassword('weak')

// 登出
await client.logout()
```

**浏览器入口**：打包器（Vite/Webpack）通过 `package.json` 的 `browser` 条件自动选取 `iam-index.browser.ts`，仅包含客户端代码，不引入 Node.js 依赖。

## 错误码

```ts
import { iam } from '@hai/iam'

if (!result.success) {
  switch (result.error.code) {
    case iam.errorCode.INVALID_CREDENTIALS: // 5001 凭证无效
    case iam.errorCode.USER_NOT_FOUND: // 5002 用户不存在
    case iam.errorCode.USER_DISABLED: // 5003 用户已禁用
    case iam.errorCode.USER_LOCKED: // 5004 用户已锁定
    case iam.errorCode.USER_ALREADY_EXISTS: // 5005 用户已存在
    case iam.errorCode.PASSWORD_EXPIRED: // 5006 密码已过期
    case iam.errorCode.PASSWORD_POLICY_VIOLATION: // 5007 密码不符合策略
    case iam.errorCode.OTP_INVALID: // 5010 验证码无效
    case iam.errorCode.OTP_RESEND_TOO_FAST: // 5012 发送过于频繁
    case iam.errorCode.LOGIN_DISABLED: // 5013 登录方式已禁用
    case iam.errorCode.REGISTER_DISABLED: // 5014 注册已禁用
    case iam.errorCode.SESSION_INVALID: // 5102 会话无效
    case iam.errorCode.ROLE_NOT_FOUND: // 5200 角色不存在
    case iam.errorCode.PERMISSION_NOT_FOUND: // 5201 权限不存在
    case iam.errorCode.REPOSITORY_ERROR: // 5300 存储层错误
    case iam.errorCode.CONFIG_ERROR: // 5400 配置错误
      break
  }
}
```

## 类型定义

### 用户类型

```ts
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

### 认证结果

```ts
interface AuthResult {
  user: User
  accessToken: string
  accessTokenExpiresAt: Date
  agreements?: AgreementDisplay
}
```

### 会话

```ts
interface Session {
  userId: string
  username?: string
  roles: string[]
  source?: string
  accessToken: string
  createdAt: Date
  lastActiveAt: Date
  expiresAt: Date
  data?: Record<string, unknown>
}
```

### 授权上下文

```ts
interface AuthzContext {
  userId: string
  roles: string[] // 角色 ID 列表
  resource?: string
  action?: string
  context?: Record<string, unknown>
}
```

### 角色与权限

```ts
interface Role {
  id: string
  code: string
  name: string
  description?: string
  isSystem?: boolean
  createdAt: Date
  updatedAt: Date
}

interface Permission {
  id: string
  code: string
  name: string
  description?: string
  resource?: string
  action?: string
  createdAt: Date
  updatedAt: Date
}
```

## 创建独立实例

```ts
import { iam } from '@hai/iam'

// 多租户场景
const tenant1Iam = iam.create()
const tenant2Iam = iam.create()

await tenant1Iam.init(db, { password: { minLength: 8 } }, { cache })
await tenant2Iam.init(db2, { otp: { length: 6 } }, { cache })
```

## 常见使用场景

### 场景 1：API 认证中间件

```ts
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: '未提供令牌' })
  }

  const result = await iam.auth.verifyToken(token)
  if (!result.success) {
    return res.status(401).json({ error: result.error.message })
  }

  req.user = result.data
  next()
}
```

### 场景 2：权限检查中间件

```ts
function requirePermission(permission: string) {
  return async (req, res, next) => {
    const context = {
      userId: req.user.userId,
      roles: req.user.roles || []
    }

    const result = await iam.authz.checkPermission(context, permission)
    if (!result.success || !result.data) {
      return res.status(403).json({ error: '权限不足' })
    }

    next()
  }
}

// 使用
app.delete('/users/:id', authMiddleware, requirePermission('users:delete'), deleteUser)
```
