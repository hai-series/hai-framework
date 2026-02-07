# @hai/iam

身份与访问管理模块，提供统一的 `iam` 对象实现认证与授权功能。

## 功能特性

| 功能           | 说明                                 |
| -------------- | ------------------------------------ |
| **认证**       | 密码、OTP、LDAP 多策略认证           |
| **会话**       | JWT 无状态 / 有状态会话管理          |
| **授权**       | RBAC 角色与权限管理                  |
| **前端客户端** | 提供 HTTP API 客户端，用于前端集成   |
| **可扩展**     | 策略模式设计，可自定义认证/会话/存储 |

## 安装

```bash
pnpm add @hai/iam
```

## 依赖

- `@hai/db` - 数据库服务（必需）

## 快速开始

```ts
import { db } from '@hai/db'
import { iam } from '@hai/iam'

// 1. 初始化数据库
await db.init({ type: 'sqlite', database: './data.db' })

// 2. 初始化 IAM（传入 db）
await iam.init(db, {
  session: {
    type: 'jwt',
    jwt: { secret: 'your-secret-key-at-least-32-chars' }
  }
})

// 3. 注册用户
const userResult = await iam.user.register({
  username: 'admin',
  email: 'admin@example.com',
  password: 'Password123'
})
if (userResult.success) {
  const user = userResult.data.user
}

// 4. 登录
const loginResult = await iam.auth.login({
  identifier: 'admin',
  password: 'Password123'
})

if (loginResult.success) {
  const { user, accessToken, refreshToken } = loginResult.data
  console.log('登录成功:', user.username)
}

// 5. 验证令牌
const payload = await iam.auth.verifyToken(loginResult.data.accessToken)

// 6. 检查权限
const hasPermission = await iam.authz.checkPermission(
  { userId: user.id, roles: ['admin'] },
  'users:read'
)

// 7. 关闭
await iam.close()
```

## 目录结构

```
packages/iam/
├── src/
│   ├── index.ts
│   ├── iam-config.ts
│   ├── iam-i18n.ts
│   ├── iam-main.ts
│   ├── iam-core-types.ts
│   ├── iam-initializer.ts
│   ├── authn/
│   ├── authz/
│   ├── session/
│   ├── user/
│   └── client/
│       ├── index.ts
│       └── iam-client.ts
└── tests/
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

## API 参考

### 初始化函数

| 函数                            | 说明            |
| ------------------------------- | --------------- |
| `iam.init(db, config, options)` | 初始化 IAM 服务 |
| `iam.close()`                   | 关闭 IAM 服务   |

### iam.auth - 认证操作

| 方法                         | 说明            |
| ---------------------------- | --------------- |
| `login(credentials)`         | 密码登录        |
| `loginWithOtp(credentials)`  | OTP 登录        |
| `loginWithLdap(credentials)` | LDAP 登录       |
| `logout(accessToken)`        | 登出            |
| `refresh(refreshToken)`      | 刷新令牌        |
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

| 方法                                           | 说明           |
| ---------------------------------------------- | -------------- |
| `checkPermission(context, permission)`         | 检查权限       |
| `hasRole(context, roleId)`                     | 检查角色       |
| `getUserPermissions(userId)`                   | 获取用户权限   |
| `getUserRoles(userId)`                         | 获取用户角色   |
| `getAllRoles(options)`                         | 角色分页列表   |
| `getAllPermissions(options)`                   | 权限分页列表   |
| `assignRole(userId, roleId)`                   | 分配角色       |
| `removeRole(userId, roleId)`                   | 移除角色       |
| `createRole(role)`                             | 创建角色       |
| `assignPermissionToRole(roleId, permissionId)` | 分配权限到角色 |

### 分页参数

```ts
import type { PaginatedResult, PaginationOptionsInput } from '@hai/core'
```

```ts
const usersResult = await iam.user.listUsers({ page: 1, pageSize: 20 } satisfies PaginationOptionsInput)
if (usersResult.success) {
  const { items, total } = usersResult.data
}
```

### iam.session - 会话管理

| 方法                      | 说明         |
| ------------------------- | ------------ |
| `create(options)`         | 创建会话     |
| `get(sessionId)`          | 获取会话     |
| `getByToken(accessToken)` | 通过令牌获取 |
| `refresh(refreshToken)`   | 刷新会话     |
| `delete(sessionId)`       | 删除会话     |
| `deleteByUserId(userId)`  | 删除用户会话 |

### 前端客户端 API

```ts
import { createIamClient } from '@hai/iam/client'
```

| 方法                         | 说明         |
| ---------------------------- | ------------ |
| `login(credentials)`         | 登录         |
| `loginWithOtp(credentials)`  | OTP 登录     |
| `sendOtp(identifier)`        | 发送验证码   |
| `logout()`                   | 登出         |
| `refreshToken(token)`        | 刷新令牌     |
| `register(options)`          | 注册         |
| `getCurrentUser()`           | 获取当前用户 |
| `updateUser(options)`        | 更新用户信息 |
| `changePassword(options)`    | 修改密码     |
| `validatePassword(password)` | 验证密码强度 |

## 配置选项

```ts
interface IamConfig {
  /** 密码策略 */
  password?: {
    minLength?: number // 最小长度，默认 8
    maxLength?: number // 最大长度，默认 128
    requireUppercase?: boolean // 需要大写字母
    requireLowercase?: boolean // 需要小写字母
    requireNumber?: boolean // 需要数字
    requireSpecialChar?: boolean // 需要特殊字符
  }

  /** 会话配置 */
  session?: {
    type: 'jwt' | 'stateful'
    jwt?: {
      secret: string
      algorithm?: 'HS256' | 'HS384' | 'HS512'
      accessTokenExpiresIn?: number // 秒，默认 900
      refreshTokenExpiresIn?: number // 秒，默认 604800
    }
    maxAge?: number // 会话最大有效期（秒）
    sliding?: boolean // 是否滑动续期
  }

  /** OTP 配置 */
  otp?: {
    length?: number // 验证码长度，默认 6
    expiresIn?: number // 过期时间（秒），默认 300
    maxAttempts?: number // 最大尝试次数，默认 3
    resendInterval?: number // 发送间隔（秒），默认 60
  }

  /** LDAP 配置 */
  ldap?: {
    url?: string // LDAP 服务器 URL
    bindDn?: string // 绑定 DN
    bindPassword?: string // 绑定密码
    searchBase?: string // 搜索基础 DN
    searchFilter?: string // 搜索过滤器（默认 (uid={{username}})）
    usernameAttribute?: string // 用户名属性
    emailAttribute?: string // 邮箱属性
    displayNameAttribute?: string // 显示名称属性
    useTls?: boolean // 启用 TLS
    connectTimeout?: number // 连接超时（毫秒）
  }

  /**
   * 认证策略启用规则：
   * - otp/ldap：提供对应配置且 login 未禁用时启用
   * - password：默认启用，可通过 login.password 关闭
   */

  /** 登录类型启用 */
  login?: {
    password?: boolean
    otp?: boolean
    ldap?: boolean
  }

  /** 注册配置 */
  register?: {
    enabled?: boolean // 是否启用注册
    defaultEnabled?: boolean // 新注册用户是否默认启用
  }

  /** 协议展示配置 */
  agreements?: {
    userAgreementUrl?: string
    privacyPolicyUrl?: string
    showOnRegister?: boolean
    showOnLogin?: boolean
  }

  /** 安全策略配置 */
  security?: {
    maxLoginAttempts?: number // 最大登录失败次数
    lockoutDuration?: number // 锁定时长（秒）
  }

  /** RBAC 配置 */
  rbac?: {
    defaultRole?: string // 新用户默认角色
  }
}
```

### LDAP 集成

LDAP 登录需要同时满足：

- 配置 `ldap` 字段
- `login.ldap` 未禁用
- 在 `iam.init` 传入 `ldapClientFactory`

```ts
import { db } from '@hai/db'
import { iam } from '@hai/iam'

await db.init({ type: 'sqlite', database: ':memory:' })

await iam.init(
  db,
  {
    login: { ldap: true },
    ldap: {
      url: 'ldap://localhost:389',
      bindDn: 'cn=admin,dc=example,dc=com',
      bindPassword: 'secret',
      searchBase: 'dc=example,dc=com',
    },
  },
  {
    ldapClientFactory: async () => {
      return {
        success: false,
        error: {
          code: iam.errorCode.LDAP_CONNECTION_FAILED,
          message: 'LDAP client not configured',
        },
      }
    },
  },
)
```

> 安全说明：OTP/LDAP 登录会参与 `security.maxLoginAttempts` 与 `security.lockoutDuration` 账户锁定策略。

## 创建独立实例

```ts
import { iam } from '@hai/iam'

// 创建独立实例（多租户场景）
const tenantIam = iam.create()
await tenantIam.init(db)

// 使用
const result = await tenantIam.auth.login({ identifier: 'admin', password: 'Password123' })

// 关闭
await tenantIam.close()
```

## 自定义存储

数据存储基于 `@hai/db`：

```ts
import { db } from '@hai/db'
import { iam } from '@hai/iam'

// 初始化数据库（SQLite/PostgreSQL/MySQL）
await db.init({
  type: 'sqlite',
  database: './data.db',
})

// IAM 会自动创建所需的数据表
await iam.init(db, {
  password: {
    minLength: 8,
  },
})
```

如需自定义存储，可实现以下接口：

```ts
import type { SessionMappingRepository, UserRepository } from '@hai/iam'
import { ok } from '@hai/core'

// 用户存储接口
const customUserRepository: UserRepository = {
  async findById(id, tx) {
    const row = await myDb.queryOne('SELECT * FROM users WHERE id = ?', [id])
    return ok(row ? mapToUser(row) : null)
  },
  async findByUsername(username, tx) { /* ... */ },
  async findByEmail(email, tx) { /* ... */ },
  async findByPhone(phone, tx) { /* ... */ },
  async findByIdentifier(identifier, tx) { /* ... */ },
  async existsByUsername(username, tx) { /* ... */ },
  async existsByEmail(email, tx) { /* ... */ },
  async create(data, tx) { /* ... */ },
  async createMany(items, tx) { /* ... */ },
  async findAll(options, tx) { /* ... */ },
  async findPage(options, tx) {
    const page = options.pagination?.page ?? 1
    const pageSize = options.pagination?.pageSize ?? 20
    const offset = (page - 1) * pageSize

    const items = await myDb.query('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?', [pageSize, offset])
    const total = await myDb.queryOne('SELECT COUNT(*) as cnt FROM users')

    return ok({
      items: items.map(mapToUser),
      total: total.cnt,
      page,
      pageSize,
    })
  },
  async updateById(id, data, tx) { /* ... */ },
  async deleteById(id, tx) { /* ... */ },
  async count(options, tx) { /* ... */ },
  async exists(options, tx) { /* ... */ },
  async existsById(id, tx) { /* ... */ },
}

// 会话映射存储接口（示例：自定义实现）
const customSessionMappingRepository: SessionMappingRepository = {
  async get(_sessionId) { return ok(null) },
  async set(_sessionId, _session, _ttl) { return ok(undefined) },
  async getSessionIdByToken(_token) { return ok(null) },
  async setTokenMapping(_token, _sessionId, _ttl) { return ok(undefined) },
  async deleteTokenMapping(_token) { return ok(undefined) },
  async delete(_sessionId) { return ok(undefined) },
  async getUserSessionIds(_userId) { return ok([]) },
  async addUserSession(_userId, _sessionId) { return ok(undefined) },
  async removeUserSession(_userId, _sessionId) { return ok(undefined) },
}
```
