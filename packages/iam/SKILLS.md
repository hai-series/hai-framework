# @hai/iam - AI 助手参考

## 模块概述

`@hai/iam` 是一个统一的身份与访问管理模块，支持多种认证策略、会话管理和 RBAC 授权。

**依赖**：

- `@hai/db` - 数据库服务（必需）

**重要**：所有操作返回 `Result<T, IamError>` 类型，需检查 `success` 属性。

## 核心 API

```ts
import { db } from '@hai/db'
import { iam } from '@hai/iam'
```

### 初始化与关闭

```ts
// 1. 先初始化数据库
await db.init({ type: 'sqlite', database: ':memory:' })

// 2. 初始化 IAM（db 为必需参数）
await iam.init(db, {
  password: {
    minLength: 8
  }
})

// 完整配置
await iam.init(db, {
  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecialChar: false
  },

  session: {
    type: 'jwt',
    jwt: {
      secret: process.env.JWT_SECRET,
      algorithm: 'HS256',
      accessTokenExpiresIn: 900, // 15 分钟
      refreshTokenExpiresIn: 604800 // 7 天
    },
    maxAge: 86400, // 会话最大有效期
    sliding: true // 滑动续期
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
    defaultRole: 'user'
  }
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

// 验证密码强度（不创建用户）
const validateResult = iam.user.validatePassword('weak')
if (!validateResult.success) {
  console.log('密码不符合要求:', validateResult.error.message)
}
```

### 密码登录 (iam.auth)

```ts
// 使用用户名或邮箱登录
const loginResult = await iam.auth.login({
  identifier: 'admin', // 用户名或邮箱
  password: 'Password123'
})

if (loginResult.success) {
  const { user, accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt } = loginResult.data
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
  const payload = verifyResult.data
  // payload: { sub: userId, username, iat, exp, type: 'access' }
}

// 刷新令牌
const refreshResult = await iam.auth.refresh(refreshToken)
if (refreshResult.success) {
  const { accessToken: newAccessToken, refreshToken: newRefreshToken } = refreshResult.data
}
```

### 用户管理

```ts
// 获取当前用户（通过令牌）
// 用户分页列表
import type { PaginationOptionsInput } from '@hai/core'

const currentUser = await iam.user.getCurrentUser(accessToken)

// 获取用户
const user = await iam.user.getUser('user-id')

// 更新用户
const updated = await iam.user.updateUser('user-id', {
  displayName: '新名称',
  metadata: { level: 'vip' }
})

// 修改密码
const changeResult = await iam.user.changePassword('user-id', 'oldPassword', 'newPassword')

const listResult = await iam.user.listUsers({ page: 1, pageSize: 20 } satisfies PaginationOptionsInput)
if (listResult.success) {
  const { items, total } = listResult.data
}
```

### RBAC 授权 (iam.authz)

```ts
// 创建权限
await iam.authz.createPermission({ id: 'users:read', name: '读取用户', description: '查看用户列表' })
await iam.authz.createPermission({ id: 'users:write', name: '写入用户', description: '创建/更新用户' })
await iam.authz.createPermission({ id: 'users:delete', name: '删除用户' })

// 创建角色
await iam.authz.createRole({
  id: 'admin',
  name: '管理员',
  description: '系统管理员'
})

// 分配权限给角色
await iam.authz.assignPermissionToRole('admin', 'users:read')
await iam.authz.assignPermissionToRole('admin', 'users:write')
await iam.authz.assignPermissionToRole('admin', 'users:delete')

// 分配角色给用户
await iam.authz.assignRole('user-id', 'admin')

// 检查权限
const context = { userId: 'user-id', roles: ['admin'] }
const canRead = await iam.authz.checkPermission(context, 'users:read')
const canDelete = await iam.authz.checkPermission(context, 'users:delete')

// 通配符权限
await iam.authz.createPermission({ id: 'admin:*', name: '管理员全部权限' })
// 'admin:*' 匹配 'admin:users', 'admin:settings' 等

// 获取用户权限
const permissions = await iam.authz.getUserPermissions('user-id')

// 获取用户角色
const roles = await iam.authz.getUserRoles('user-id')

// 检查角色
const isAdmin = await iam.authz.hasRole(context, 'admin')

// 角色与权限分页列表
const rolesResult = await iam.authz.getAllRoles({ page: 1, pageSize: 50 })
const permissionsResult = await iam.authz.getAllPermissions({ page: 1, pageSize: 50 })
```

### 会话管理 (iam.session)

```ts
// 创建会话
const sessionResult = await iam.session.create({
  userId: 'user-id',
  username: 'admin',
  metadata: { ip: '127.0.0.1', userAgent: 'Mozilla/5.0' }
})

// 获取会话
const session = await iam.session.get('session-id')

// 通过令牌获取会话
const sessionByToken = await iam.session.getByToken(accessToken)

// 删除会话
await iam.session.delete('session-id')

// 删除用户所有会话（强制下线）
await iam.session.deleteByUserId('user-id')

// 清理过期会话
await iam.session.cleanup()
```

## 错误码

```ts
import { iam } from '@hai/iam'

if (!result.success) {
  if (result.error.code === iam.errorCode.INVALID_CREDENTIALS) {
    // 处理错误：凭证无效
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
  refreshToken?: string
  accessTokenExpiresAt: Date
  refreshTokenExpiresAt?: Date
  agreements?: AgreementDisplay
}
```

### 令牌载荷

```ts
interface TokenPayload {
  sub: string // 用户 ID
  username: string
  iat: number // 签发时间
  exp: number // 过期时间
  type: 'access' | 'refresh'
}
```

### 授权上下文

```ts
interface AuthzContext {
  userId: string
  roles?: string[]
  permissions?: string[]
}
```

## 创建独立实例

```ts
import { iam } from '@hai/iam'

// 多租户场景
const tenant1Iam = iam.create()
const tenant2Iam = iam.create()

await tenant1Iam.init(db, {
  password: { minLength: 8 }
})
await tenant2Iam.init(db2, {
  password: { minLength: 8 },
  otp: { length: 6 }
})
```

## 前端客户端

```ts
import { createIamClient } from '@hai/iam/client'

// 创建客户端
const client = createIamClient({
  baseUrl: '/api/iam',
  getAccessToken: () => localStorage.getItem('accessToken'),
  onTokenRefresh: (tokens) => {
    localStorage.setItem('accessToken', tokens.accessToken)
    if (tokens.refreshToken) {
      localStorage.setItem('refreshToken', tokens.refreshToken)
    }
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

// 刷新令牌
const refreshResult = await client.refreshToken(localStorage.getItem('refreshToken'))

// 登出
await client.logout()

```

## 自定义存储实现

IAM 使用 `@hai/db` 进行数据持久化：

```ts
import { db } from '@hai/db'
import { iam } from '@hai/iam'

// 初始化 SQLite 数据库
await db.init({
  type: 'sqlite',
  database: './data.db',
})

// IAM 会自动创建所需的数据表
await iam.init(db, {
  password: {
    minLength: 8
  },
})
```

### 存储接口

如需自定义存储，可实现以下接口：

```ts
import type { SessionMappingRepository, UserRepository } from '@hai/iam'

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

// 会话映射存储接口
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
      userId: req.user.sub,
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

### 场景 3：刷新令牌

```ts
app.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body

  const result = await iam.auth.refresh(refreshToken)
  if (!result.success) {
    return res.status(401).json({ error: result.error.message })
  }

  res.json(result.data)
})
```
