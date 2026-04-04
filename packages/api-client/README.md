# @h-ai/api-client

统一 HTTP 客户端模块，提供 Bearer Token 管理、契约调用与流式请求能力。

## 支持的能力

- 单例模式：`api.init()` → `api.get()` / `api.call()` → `api.close()`
- 通用 HTTP 方法：`get` / `post` / `put` / `patch` / `delete`
- 契约调用：`api.call(endpoint, input)`（入参/出参 Zod 双向校验，端到端类型安全）
- 自动附加 Bearer Token，401 自动刷新重试（并发去重）
- 可插拔 Token 存储（默认 localStorage，可切换 memory / Capacitor / 自定义）
- 文件上传（支持附加字段）
- SSE 流式响应（`api.stream()`）
- 请求/响应拦截器
- 统一返回 `HaiResult<T>`

## 快速开始

```ts
import { api } from '@h-ai/api-client'
import { iamEndpoints } from '@h-ai/iam/api'

// 1. 初始化
await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: { refreshUrl: '/auth/refresh' },
})

// 2. 登录（契约调用）
const loginResult = await api.call(iamEndpoints.login, {
  identifier: 'alice',
  password: 'xxx',
})

// 3. 登录成功后保存 Token（后续请求自动附加 Bearer）
if (loginResult.success) {
  await api.auth.setTokens(loginResult.data.tokens)
}

// 4. 后续请求自动携带 Token
const me = await api.call(iamEndpoints.currentUser, {})

// 5. 关闭
await api.close()
```

> `auth.storage` 未传时默认使用 `createLocalStorageTokenStorage()`；在 SSR/测试环境可显式传入 `createMemoryTokenStorage()`。

## 与 @h-ai/iam 集成

`@h-ai/api-client` 与 `@h-ai/iam` 通过 **API 契约（`EndpointDef`）** 实现端到端类型安全。客户端和服务端共享同一份契约定义，编译时保证一致性。

### 架构总览

```
┌─────────────────────────────────────────────────┐
│                @h-ai/iam/api                     │
│  iam-api-schemas.ts  ← Zod Schema（唯一真相源） │
│  iam-api-contract.ts ← iamEndpoints             │
└────────┬────────────────────────┬────────────────┘
         │                        │
  ┌──────▼──────┐        ┌───────▼────────┐
  │  客户端      │        │  服务端         │
  │  api.call()  │  HTTP  │  kit.fromContract│
  │  @h-ai/     │ ◄────► │  @h-ai/kit      │
  │  api-client  │        │                 │
  └─────────────┘        └─────────────────┘
```

### 完整登录 → 使用 → 登出流程

```ts
import { api } from '@h-ai/api-client'
import { iamEndpoints } from '@h-ai/iam/api'

// ── 初始化 ──
await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {
    refreshUrl: '/auth/refresh',
    // Token 刷新成功后的回调（可选，适合更新全局状态）
    onTokenRefreshed: (tokens) => {
      // tokens 包含新的 accessToken / refreshToken / expiresIn
    },
    // Token 刷新失败后的回调（可选，常用于跳转登录页）
    onRefreshFailed: () => {
      window.location.href = '/login'
    },
  },
})

// ── 登录 ──
const loginResult = await api.call(iamEndpoints.login, {
  identifier: 'alice',
  password: 'StrongPassword123',
})

if (!loginResult.success) {
  // loginResult.error.code 可能是：
  //   1203 (UNAUTHORIZED) — 凭证错误
  //   1206 (VALIDATION_FAILED) — 入参不合法
  //   1202 (SERVER_ERROR) — 服务端异常
  console.error('Login failed:', loginResult.error.message)
}
else {
  // loginResult.data 类型自动推导为 { user, tokens, agreements? }
  const { user, tokens } = loginResult.data

  // 保存 Token — 后续所有请求自动附加 Authorization: Bearer <accessToken>
  await api.auth.setTokens(tokens)
}

// ── 获取当前用户 ──（自动携带 Bearer Token）
const meResult = await api.call(iamEndpoints.currentUser, {})
if (meResult.success) {
  // meResult.data 类型推导为 { user, roles, permissions }
}

// ── 修改密码 ──
await api.call(iamEndpoints.changePassword, {
  oldPassword: 'OldPass123',
  newPassword: 'NewPass456',
})

// ── 登出 ──
const accessToken = '...' // 从 Token 存储获取
await api.call(iamEndpoints.logout, { accessToken })
await api.auth.clear() // 清空本地 Token 存储
```

### 401 自动刷新机制

当请求收到 401 响应时，`api-client` 自动执行以下流程：

1. 使用存储的 `refreshToken` 调用 `auth.refreshUrl`（POST）
2. 刷新成功 → 更新存储 → 用新 Token 重试原请求（仅重试一次）
3. 刷新失败 → 清空 Token → 触发 `onRefreshFailed` 回调
4. 多个并发 401 请求 → **自动去重**，只发一次刷新请求

> 流式请求（`api.stream()`）同样支持 401 自动刷新 + 重试。

### 可用的 IAM 端点

| 分类         | 端点                              | 方法   | 路径                          | 认证 |
| ------------ | --------------------------------- | ------ | ----------------------------- | ---- |
| **认证**     | `iamEndpoints.login`              | POST   | /auth/login                   | 否   |
|              | `iamEndpoints.loginWithOtp`       | POST   | /auth/login/otp               | 否   |
|              | `iamEndpoints.logout`             | POST   | /auth/logout                  | 是   |
|              | `iamEndpoints.currentUser`        | GET    | /auth/me                      | 是   |
|              | `iamEndpoints.refreshToken`       | POST   | /auth/refresh                 | 否   |
|              | `iamEndpoints.sendOtp`            | POST   | /auth/otp/send                | 否   |
|              | `iamEndpoints.register`           | POST   | /auth/register                | 否   |
|              | `iamEndpoints.changePassword`     | POST   | /auth/change-password         | 是   |
|              | `iamEndpoints.updateCurrentUser`  | PUT    | /auth/me                      | 是   |
| **用户管理** | `iamEndpoints.listUsers`          | GET    | /iam/users                    | 是   |
|              | `iamEndpoints.getUser`            | GET    | /iam/users/:id                | 是   |
|              | `iamEndpoints.createUser`         | POST   | /iam/users                    | 是   |
|              | `iamEndpoints.updateUser`         | PUT    | /iam/users/:id                | 是   |
|              | `iamEndpoints.deleteUser`         | DELETE | /iam/users/:id                | 是   |
|              | `iamEndpoints.adminResetPassword` | POST   | /iam/users/:id/reset-password | 是   |
| **角色管理** | `iamEndpoints.listRoles`          | GET    | /iam/roles                    | 是   |
|              | `iamEndpoints.getRole`            | GET    | /iam/roles/:id                | 是   |
|              | `iamEndpoints.createRole`         | POST   | /iam/roles                    | 是   |
|              | `iamEndpoints.updateRole`         | PUT    | /iam/roles/:id                | 是   |
|              | `iamEndpoints.deleteRole`         | DELETE | /iam/roles/:id                | 是   |
| **权限管理** | `iamEndpoints.listPermissions`    | GET    | /iam/permissions              | 是   |
|              | `iamEndpoints.getPermission`      | GET    | /iam/permissions/:id          | 是   |
|              | `iamEndpoints.createPermission`   | POST   | /iam/permissions              | 是   |
|              | `iamEndpoints.deletePermission`   | DELETE | /iam/permissions/:id          | 是   |

## 常见配置场景

### 浏览器端（默认 localStorage）

```ts
import { api } from '@h-ai/api-client'

await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: { refreshUrl: '/auth/refresh' },
  timeout: 15000,
})
```

### Android / iOS App（Capacitor 安全存储）

```ts
import { api } from '@h-ai/api-client'
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

await api.init({
  baseUrl: `${PUBLIC_API_BASE}/api/v1`,
  auth: {
    storage: createCapacitorTokenStorage(),
    refreshUrl: '/auth/refresh',
  },
})
```

### SSR / 测试环境（内存存储）

```ts
import { api, createMemoryTokenStorage } from '@h-ai/api-client'

await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {
    storage: createMemoryTokenStorage(),
    refreshUrl: '/auth/refresh',
  },
})
```

## 错误处理

所有通用 HTTP / 契约调用均返回 `HaiResult<T>`：

```ts
const result = await api.call(iamEndpoints.currentUser, {})

if (!result.success) {
  switch (result.error.code) {
    case 1203: // UNAUTHORIZED — Token 失效且刷新也失败
      redirectToLogin()
      break
    case 1201: // TIMEOUT — 请求超时
      showRetryDialog()
      break
    case 1206: // VALIDATION_FAILED — 入参或出参校验失败
      showValidationError(result.error.details)
      break
    default:
      showGenericError(result.error.message)
  }
  return
}

// result.data 类型安全
renderUserProfile(result.data.user)
```

### 错误码速查

| 错误码                                   | code                 | 说明             |
| ---------------------------------------- | -------------------- | ---------------- |
| `HaiApiClientError.NETWORK_ERROR`        | `hai:api-client:001` | 网络不可达       |
| `HaiApiClientError.TIMEOUT`              | `hai:api-client:002` | 请求超时         |
| `HaiApiClientError.SERVER_ERROR`         | `hai:api-client:003` | 5xx 服务端错误   |
| `HaiApiClientError.UNAUTHORIZED`         | `hai:api-client:004` | 401 未认证       |
| `HaiApiClientError.FORBIDDEN`            | `hai:api-client:005` | 403 无权限       |
| `HaiApiClientError.NOT_FOUND`            | `hai:api-client:006` | 404 资源不存在   |
| `HaiApiClientError.VALIDATION_FAILED`    | `hai:api-client:007` | 请求参数校验失败 |
| `HaiApiClientError.TOKEN_REFRESH_FAILED` | `hai:api-client:008` | Token 刷新失败   |
| `HaiApiClientError.NOT_INITIALIZED`      | `hai:api-client:010` | 未初始化         |
| `HaiApiClientError.CONFIG_ERROR`         | `hai:api-client:011` | 配置错误         |
| `HaiApiClientError.UNKNOWN`              | `hai:api-client:099` | 未知错误         |

## Token 管理

```ts
// 设置 Token（通常在登录成功后）
await api.auth.setTokens({
  accessToken: 'xxx',
  refreshToken: 'yyy',
  expiresIn: 3600,
  tokenType: 'Bearer',
})

// 清空 Token（登出时）
await api.auth.clear()

// 监听自动刷新事件
const unsubscribe = api.auth.onTokenRefreshed((tokens) => {
  // Token 自动刷新成功时触发
})

// 取消监听
unsubscribe()
```

## 流式响应（SSE）

```ts
const controller = new AbortController()

for await (const chunk of api.stream('/ai/chat/stream', { message: 'hello' }, { signal: controller.signal })) {
  // chunk 对应 SSE 的 data: 内容
  process.stdout.write(chunk)
}

// 主动停止流式响应
controller.abort()
```

说明：

- `stream()` 内置超时控制（连接阶段与流式读取阶段均生效）
- 401 会尝试自动刷新 Token 后重试一次
- 解析器支持跨 chunk 的 SSE 行缓冲
- 支持外部传入 `AbortSignal` 主动取消

## 拦截器（高级用法）

```ts
await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: { refreshUrl: '/auth/refresh' },
  interceptors: {
    request: [
      async config => ({
        ...config,
        headers: {
          ...config.headers,
          'X-App-Version': '1.0.0',
        },
      }),
    ],
    response: [
      async (response) => {
        // 可统一记录埋点、限流处理等
        return response
      },
    ],
  },
})
```

## 测试

```bash
pnpm --filter @h-ai/api-client test
```

## License

Apache-2.0

## License

Apache-2.0
