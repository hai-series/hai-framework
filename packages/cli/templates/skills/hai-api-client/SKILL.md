---
name: hai-api-client
description: 使用 @h-ai/api-client 构建多端共用的纯 TypeScript HTTP 客户端，支持 Bearer Token 自动管理、401 刷新重试、契约调用（EndpointDef）与流式响应；当需求涉及客户端 API 请求、Token 管理、契约调用或多端数据层时使用。
---

# hai-api-client

> `@h-ai/api-client` 是 hai-framework 的纯 TypeScript HTTP 客户端，多端共用（Web/H5/Android），基于 fetch API 实现。核心能力：Token 自动附加、401 自动刷新重试、基于 EndpointDef 的类型安全契约调用。

---

## 适用场景

- 浏览器端/App 端统一 API 请求
- Bearer Token 自动管理（存储、附加、刷新）
- 基于 EndpointDef 契约的类型安全调用
- 流式响应（SSE / ReadableStream）
- 拦截器（请求/响应前后处理）

---

## 使用步骤

### 1. 创建客户端实例

```typescript
import { createApiClient } from '@h-ai/api-client'

export const api = createApiClient({
  baseUrl: 'http://localhost:3000',
  tokenStorage: 'localStorage', // 或 'memory'，App 端用 createCapacitorTokenStorage()
  refreshUrl: '/api/v1/auth/refresh',
  timeout: 15000,
})
```

### 2. 普通请求

```typescript
// GET 请求
const users = await api.get<User[]>('/api/v1/users')

// POST 请求
const result = await api.post<CreateResult>('/api/v1/users', {
  body: { username: 'alice', email: 'alice@example.com' },
})

// 带查询参数
const page = await api.get<PageResult>('/api/v1/users', {
  params: { page: 1, pageSize: 20 },
})
```

### 3. 契约调用（推荐）

```typescript
import { iamEndpoints } from '@h-ai/iam/api'

// 类型安全：入参和返回值由 EndpointDef 的 Zod schema 推导
const loginResult = await api.call(iamEndpoints.login, {
  username: 'admin',
  password: 'StrongPassword123',
})

if (loginResult.success) {
  // loginResult.data 类型自动推导为 { user, tokens, agreements? }
  console.log(loginResult.data.tokens.accessToken)
}
```

### 4. Token 管理

```typescript
// 手动设置 Token（登录后）
await api.tokenManager.setTokens({
  accessToken: 'xxx',
  refreshToken: 'yyy',
  expiresIn: 3600,
  tokenType: 'Bearer',
})

// 清除 Token（登出）
await api.tokenManager.clearTokens()

// 获取当前 Token
const token = await api.tokenManager.getAccessToken()
```

### 5. 流式响应

```typescript
const stream = await api.stream('/api/v1/ai/chat', {
  method: 'POST',
  body: { message: 'Hello' },
})

for await (const chunk of stream) {
  console.log(chunk)
}
```

---

## 核心 API

| API                            | 用途           | 关键点                               |
| ------------------------------ | -------------- | ------------------------------------ |
| `createApiClient(config)`      | 创建客户端实例 | 返回 api 对象                        |
| `api.get<T>(url, options?)`    | GET 请求       | 自动附加 Token                       |
| `api.post<T>(url, options?)`   | POST 请求      | 自动序列化 body                      |
| `api.put<T>(url, options?)`    | PUT 请求       | —                                    |
| `api.delete<T>(url, options?)` | DELETE 请求    | —                                    |
| `api.call(endpoint, input)`    | 契约调用       | 入参/出参自动 Zod 验证，类型安全     |
| `api.stream(url, options?)`    | 流式请求       | 返回 AsyncIterable                   |
| `api.tokenManager`             | Token 管理器   | setTokens/clearTokens/getAccessToken |
| `api.addInterceptor(fn)`       | 添加拦截器     | 请求/响应拦截                        |

### EndpointDef 契约结构

```typescript
interface EndpointDef<TInput, TOutput> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  input: ZodSchema<TInput>
  output: ZodSchema<TOutput>
  requireAuth?: boolean
  meta?: Record<string, unknown>
}
```

### TokenStorage 接口

```typescript
interface TokenStorage {
  getAccessToken: () => Promise<string | null>
  getRefreshToken: () => Promise<string | null>
  setTokens: (tokens: TokenPair) => Promise<void>
  clearTokens: () => Promise<void>
}
```

内置实现：`'localStorage'`（Web）、`'memory'`（SSR/测试）。
App 端使用 `@h-ai/capacitor` 的 `createCapacitorTokenStorage()`。

---

## 错误码 — `ApiClientErrorCode`

| 错误码 | 常量                   | 说明                       |
| ------ | ---------------------- | -------------------------- |
| 6000   | `NETWORK_ERROR`        | 网络不可达                 |
| 6001   | `TIMEOUT`              | 请求超时                   |
| 6002   | `UNAUTHORIZED`         | 401 未认证                 |
| 6003   | `FORBIDDEN`            | 403 无权限                 |
| 6004   | `NOT_FOUND`            | 404 资源不存在             |
| 6005   | `SERVER_ERROR`         | 5xx 服务端错误             |
| 6010   | `VALIDATION_ERROR`     | 契约入参/出参 Zod 校验失败 |
| 6011   | `TOKEN_REFRESH_FAILED` | Token 刷新失败             |
| 6020   | `STREAM_ERROR`         | 流式响应错误               |

---

## 常见模式

### 与 @h-ai/iam/api 契约配合

```typescript
import { iamEndpoints } from '@h-ai/iam/api'

// 登录
const login = await api.call(iamEndpoints.login, { username, password })
if (login.success) {
  await api.tokenManager.setTokens(login.data.tokens)
}

// 获取当前用户
const me = await api.call(iamEndpoints.currentUser, {})

// 登出
await api.call(iamEndpoints.logout, {})
await api.tokenManager.clearTokens()
```

### Android App 中使用

```typescript
import { createApiClient } from '@h-ai/api-client'
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

const api = createApiClient({
  baseUrl: import.meta.env.PUBLIC_API_BASE,
  tokenStorage: createCapacitorTokenStorage(),
  refreshUrl: '/api/v1/auth/refresh',
})
```

---

## 相关 Skills

- `hai-iam`：认证契约定义（iamEndpoints）
- `hai-capacitor`：原生 Token 存储
- `hai-kit`：服务端契约处理（kit.fromContract）
- `hai-core`：Result 类型、错误处理基础
