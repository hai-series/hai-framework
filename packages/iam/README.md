# @hai/iam

身份与访问管理模块，提供统一的 `iam` 对象实现认证与授权功能。

## 功能特性

| 功能           | 说明                                 |
| -------------- | ------------------------------------ |
| **认证**       | 密码、OTP、LDAP 多策略认证           |
| **会话**       | 有状态会话（随机访问令牌 + 缓存）    |
| **授权**       | RBAC 角色与权限管理（DB + 缓存）     |
| **用户管理**   | 注册、查询、更新、密码管理、密码重置 |
| **前端客户端** | HTTP API 客户端，支持独立前端使用    |

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
await iam.init({ db, cache, session: { maxAge: 86400, sliding: true } })

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

## 更多信息

详细 API 参数、错误码及内部流程请参考 [SKILLS.md](./SKILLS.md)。

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

## 密码重置

```ts
// 初始化时注入重置回调（发送邮件等）
await iam.init({
  db,
  cache,
  onPasswordResetRequest: async (user, token, expiresAt) => {
    await sendEmail(user.email, `重置链接: https://example.com/reset?token=${token}`)
  },
  passwordReset: { tokenExpiresIn: 3600, maxAttempts: 3 },
})

// 请求重置（即使用户不存在也返回 ok，防止枚举）
await iam.user.requestPasswordReset('admin@example.com')

// 确认重置
const result = await iam.user.confirmPasswordReset(token, 'NewPassword456')
```

## 错误处理

所有操作返回 `Result<T, IamError>`，通过 `IamErrorCode` 做分支判断：

```ts
import { iam, IamErrorCode } from '@hai/iam'

const result = await iam.auth.login({ identifier: 'admin', password: 'wrong' })
if (!result.success) {
  if (result.error.code === IamErrorCode.INVALID_CREDENTIALS) {
    // 用户名或密码错误
  }
}
```

## 测试

```bash
pnpm test
```

## 许可证

Apache-2.0
