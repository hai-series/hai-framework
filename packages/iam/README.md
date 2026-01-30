# @hai/iam

身份与访问管理模块，提供统一的 `iam` 对象实现认证与授权功能。

## 功能特性

| 功能           | 说明                                 |
| -------------- | ------------------------------------ |
| **认证**       | 密码、OTP、LDAP、OAuth2 多策略认证   |
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
- `@hai/cache` - 缓存服务（必需，用于权限缓存）

## 快速开始

```ts
import { cache } from '@hai/cache'
import { db } from '@hai/db'
import { iam } from '@hai/iam'

// 1. 初始化数据库和缓存
db.init({ type: 'sqlite', database: './data.db' })
await cache.init({ url: 'redis://localhost:6379' })

// 2. 初始化 IAM（传入 db 和 cache）
await iam.init(db, cache, {
  strategies: ['password'],
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

| 函数                          | 说明            |
| ----------------------------- | --------------- |
| `iam.init(db, cache, config)` | 初始化 IAM 服务 |
| `iam.close()`                 | 关闭 IAM 服务   |

### iam.auth - 认证操作

| 方法                               | 说明            |
| ---------------------------------- | --------------- |
| `login(credentials)`               | 密码登录        |
| `loginWithOtp(credentials)`        | OTP 登录        |
| `loginWithLdap(credentials)`       | LDAP 登录       |
| `getOAuthUrl(providerId)`          | 获取 OAuth 授权 |
| `handleOAuthCallback(credentials)` | 处理 OAuth 回调 |
| `logout(accessToken)`              | 登出            |
| `refresh(refreshToken)`            | 刷新令牌        |
| `verifyToken(accessToken)`         | 验证令牌        |
| `sendOtp(identifier)`              | 发送 OTP 验证码 |

### iam.user - 用户管理

| 方法                                               | 说明         |
| -------------------------------------------------- | ------------ |
| `register(options)`                                | 注册用户     |
| `getCurrentUser(accessToken)`                      | 获取当前用户 |
| `getUser(userId)`                                  | 获取用户     |
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
| `assignRole(userId, roleId)`                   | 分配角色       |
| `removeRole(userId, roleId)`                   | 移除角色       |
| `createRole(role)`                             | 创建角色       |
| `assignPermissionToRole(roleId, permissionId)` | 分配权限到角色 |

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

| 方法                         | 说明           |
| ---------------------------- | -------------- |
| `login(credentials)`         | 登录           |
| `loginWithOtp(credentials)`  | OTP 登录       |
| `sendOtp(identifier)`        | 发送验证码     |
| `logout()`                   | 登出           |
| `refreshToken(token)`        | 刷新令牌       |
| `register(options)`          | 注册           |
| `getCurrentUser()`           | 获取当前用户   |
| `updateUser(options)`        | 更新用户信息   |
| `changePassword(options)`    | 修改密码       |
| `validatePassword(password)` | 验证密码强度   |
| `getOAuthUrl(provider)`      | 获取 OAuth URL |

## 配置选项

```ts
interface IamConfig {
  /** 启用的认证策略 */
  strategies: ('password' | 'otp' | 'ldap' | 'oauth')[]

  /** 密码策略 */
  passwordPolicy?: {
    minLength?: number // 最小长度，默认 8
    maxLength?: number // 最大长度，默认 128
    requireUppercase?: boolean // 需要大写字母
    requireLowercase?: boolean // 需要小写字母
    requireNumbers?: boolean // 需要数字
    requireSpecial?: boolean // 需要特殊字符
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
  }

  /** RBAC 配置 */
  rbac?: {
    defaultRole?: string // 新用户默认角色
    cacheEnabled?: boolean // 启用权限缓存
    cacheTtl?: number // 缓存 TTL（秒）
  }
}
```

## 创建独立实例

```ts
import { createIamService } from '@hai/iam'

// 创建独立实例（多租户场景）
const tenantIam = createIamService()
await tenantIam.init(db, cache, { strategies: ['password'] })

// 使用
const result = await tenantIam.auth.login({ ... })

// 关闭
await tenantIam.close()
```

## 自定义存储

数据存储基于 `@hai/db`，权限缓存基于 `@hai/cache`：

```ts
import { cache } from '@hai/cache'
import { db } from '@hai/db'
import { iam } from '@hai/iam'

// 初始化数据库（SQLite/PostgreSQL/MySQL）
db.init({
  type: 'sqlite',
  database: './data.db',
})

// 初始化缓存（Redis）
await cache.init({
  url: 'redis://localhost:6379',
})

// IAM 会自动创建所需的数据表
await iam.init(db, cache, {
  strategies: ['password'],
})
```
