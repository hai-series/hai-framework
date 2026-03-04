# @h-ai/iam

身份与访问管理模块，提供统一的 `iam` 对象实现认证、会话、授权与用户管理。

## 功能特性

| 功能           | 说明                                             |
| -------------- | ------------------------------------------------ |
| **认证**       | 密码、OTP（邮箱/短信验证码）、LDAP 多策略认证    |
| **会话**       | 有状态会话（随机访问令牌 + 缓存，滑动续期可选）  |
| **授权**       | RBAC 角色与权限管理（DB + 缓存，通配符权限匹配） |
| **用户管理**   | 注册、查询、更新、密码重置、管理员重置密码       |
| **前端客户端** | HTTP API 客户端，支持独立前端使用                |

## 安装

```bash
pnpm add @h-ai/iam
```

## 依赖

- `@h-ai/reldb` — 数据库（用户/角色/权限持久化）
- `@h-ai/cache` — 缓存（会话/OTP/重置令牌/权限缓存）
- `@h-ai/crypto` — 密码哈希（内部使用，自动初始化）

## 快速开始

```ts
import { cache } from '@h-ai/cache'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

// 1. 初始化
await reldb.init({ type: 'sqlite', database: './data.db' })
await cache.init({ type: 'memory' })
await iam.init({
  db,
  cache,
  session: { maxAge: 86400, sliding: true },
  // OTP 回调（启用 OTP 登录时注入发送逻辑）
  onOtpSendEmail: async (email, code) => {
    await sendEmail(email, `验证码: ${code}`)
  },
  // 密码重置回调（启用密码重置时注入通知逻辑）
  onPasswordResetRequest: async (user, token, expiresAt) => {
    await sendEmail(user.email!, `重置链接: https://example.com/reset?token=${token}`)
  },
})

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

// 5. OTP 验证码登录
await iam.auth.sendOtp('user@example.com')
const otpResult = await iam.auth.loginWithOtp({
  identifier: 'user@example.com',
  code: '123456',
})

// 6. 检查权限
const hasPermission = await iam.authz.checkPermission(
  user.id,
  'user:read',
)

// 7. 关闭
await iam.close()
```

## 更多用法

详细 API 参数、错误码及集成模式请参考 Skill 模板（`packages/cli/templates/skills/hai-iam/SKILL.md`）。

## 前端 API 契约

前端通过 `@h-ai/iam/api` 导出的契约定义（`iamEndpoints`）与 `@h-ai/api-client` 配合调用：

```ts
import { createApiClient } from '@h-ai/api-client'
import { iamEndpoints } from '@h-ai/iam/api'

const api = createApiClient({ baseUrl: '/api/iam' })

// 登录
const result = await api.call(iamEndpoints.login, {
  identifier: 'admin',
  password: 'Password123',
})

// 获取当前用户
const user = await api.call(iamEndpoints.currentUser, {})

// 修改密码
await api.call(iamEndpoints.changePassword, {
  oldPassword: 'Password123',
  newPassword: 'NewPassword456',
})
```

## 密码重置

```ts
// 请求重置（即使用户不存在也返回 ok，防止枚举）
await iam.user.requestPasswordReset('admin@example.com')

// 确认重置（校验令牌有效期和尝试次数 → 更新密码 → 清除所有会话）
const result = await iam.user.confirmPasswordReset(token, 'NewPassword456')

// 管理员重置（无需旧密码）
await iam.user.adminResetPassword(userId, 'TempPassword123')
```

## 错误处理

所有操作返回 `Result<T, IamError>`，通过 `IamErrorCode` 做分支判断：

```ts
import { iam, IamErrorCode } from '@h-ai/iam'

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
