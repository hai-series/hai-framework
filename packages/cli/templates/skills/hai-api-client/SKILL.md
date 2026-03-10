---
name: hai-api-client
description: 使用 @h-ai/api-client 单例模式构建多端共用的纯 TypeScript HTTP 客户端，通过 api.init() 初始化，支持 Bearer Token 自动管理、401 刷新重试、契约调用（EndpointDef）与流式响应；当需求涉及客户端 API 请求、Token 管理、契约调用或多端数据层时使用。
---

# hai-api-client

> `@h-ai/api-client` 是 hai-framework 的纯 TypeScript HTTP 客户端，多端共用（Web/H5/Android），基于 fetch API 实现。以单例模式暴露 `api` 对象，通过 `api.init()` 初始化。核心能力：Token 自动附加、401 自动刷新重试、基于 EndpointDef 的类型安全契约调用。

---

## 适用场景

- 浏览器端/App 端统一 API 请求
- Bearer Token 自动管理（存储、附加、刷新）
- 基于 EndpointDef 契约的类型安全调用
- 流式响应（SSE / ReadableStream）
- 拦截器（请求/响应前后处理）

---

## 使用步骤

### 1. 初始化客户端

```typescript
import { api } from '@h-ai/api-client'

// 应用启动时初始化
await api.init({
  baseUrl: 'http://localhost:3000',
  auth: {
    refreshUrl: '/auth/refresh',
  },
  timeout: 15000,
})
```

> `auth.storage` 可选：默认使用 `createLocalStorageTokenStorage()`；SSR/测试建议显式传 `createMemoryTokenStorage()`，App 端建议传 `createCapacitorTokenStorage()`。

### 2. 普通请求

```typescript
// GET 请求
const users = await api.get<User[]>('/api/v1/users')

// POST 请求
const result = await api.post<CreateResult>('/api/v1/users', {
  username: 'alice',
  email: 'alice@example.com',
})

// 带查询参数（直接传入 Record<string, unknown>）
const page = await api.get<PageResult>('/api/v1/users', { page: 1, pageSize: 20 })
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
await api.auth.setTokens({
  accessToken: 'xxx',
  refreshToken: 'yyy',
  expiresIn: 3600,
  tokenType: 'Bearer',
})

// 清除 Token（登出）
await api.auth.clear()

// 监听 Token 刷新
api.auth.onTokenRefreshed((tokens) => {
  // tokens 包含新的 accessToken / refreshToken
})
```

### 5. 流式响应

```typescript
const controller = new AbortController()

// stream(path, body?, options?) — 返回 AsyncIterable<string>，按 SSE data: 行 yield
for await (const chunk of api.stream('/api/v1/ai/chat', { message: 'Hello' }, { signal: controller.signal })) {
  // 每个 chunk 是 SSE data: 行的内容
}

// 主动停止
controller.abort()
```

### 6. 关闭

```typescript
await api.close()
```

---

## 核心 API

| API                                | 用途           | 关键点                                |
| ---------------------------------- | -------------- | ------------------------------------- |
| `api.init(config)`                 | 初始化客户端   | 返回 `Result<void, ApiClientError>`   |
| `api.close()`                      | 关闭并释放资源 | 重复调用安全                          |
| `api.isInitialized`                | 初始化状态     | `boolean`                             |
| `api.config`                       | 当前配置       | 未初始化时为 `null`                   |
| `api.get<T>(path, params?)`        | GET 请求       | params 附加到 URL query string        |
| `api.post<T>(path, body?)`         | POST 请求      | body 自动 JSON 序列化                 |
| `api.put<T>(path, body?)`          | PUT 请求       | —                                     |
| `api.patch<T>(path, body?)`        | PATCH 请求     | —                                     |
| `api.delete<T>(path, params?)`     | DELETE 请求    | params 附加到 URL query string        |
| `api.call(endpoint, input)`        | 契约调用       | 入参 Zod 校验，路径/方法由契约决定    |
| `api.upload(path, file, options?)`  | 文件上传       | FormData，支持附加字段                |
| `api.stream(path, body?)`          | 流式请求       | 返回 AsyncIterable<string>（SSE）     |
| `api.auth.setTokens(tokens)`       | 设置 Token     | 存入 TokenStorage                     |
| `api.auth.clear()`                 | 清空 Token     | 清空存储                              |
| `api.auth.onTokenRefreshed(cb)`    | 刷新回调       | 返回取消订阅函数，Token 自动刷新成功时通知 |

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
  setAccessToken: (token: string) => Promise<void>
  getRefreshToken: () => Promise<string | null>
  setRefreshToken: (token: string) => Promise<void>
  clear: () => Promise<void>
}
```

内置实现：`createLocalStorageTokenStorage()`（Web）、`createMemoryTokenStorage()`（SSR/测试）。
App 端使用 `@h-ai/capacitor` 的 `createCapacitorTokenStorage()`。

---

## 错误码 — `ApiClientErrorCode`

| 错误码 | 常量                   | 说明                       |
| ------ | ---------------------- | -------------------------- |
| 1200   | `NETWORK_ERROR`        | 网络不可达                 |
| 1201   | `TIMEOUT`              | 请求超时                   |
| 1202   | `SERVER_ERROR`         | 5xx 服务端错误             |
| 1203   | `UNAUTHORIZED`         | 401 未认证                 |
| 1204   | `FORBIDDEN`            | 403 无权限                 |
| 1205   | `NOT_FOUND`            | 404 资源不存在             |
| 1206   | `VALIDATION_FAILED`    | 请求参数校验失败（400）    |
| 1207   | `TOKEN_REFRESH_FAILED` | Token 刷新失败             |
| 1210   | `NOT_INITIALIZED`      | 未初始化（未调用 api.init）|
| 1211   | `CONFIG_ERROR`         | 配置错误                   |
| 1299   | `UNKNOWN`              | 未知错误                   |

---

## API 契约范式（端到端类型安全）

> `@h-ai/api-client` 和 `@h-ai/kit` 共同消费模块 `api/` 下的 `EndpointDef` 定义，实现客户端↔服务端的全链路类型安全 + 运行时 Zod 校验。

### 契约架构

```
┌─────────────────────────────────────────────────────────────┐
│                    @h-ai/xx/api                             │
│  xx-api-schemas.ts  ←  Zod Schema（唯一真相源）            │
│  xx-api-contract.ts ←  xxEndpoints（method + path + schema）│
└─────────────┬──────────────────────────┬────────────────────┘
              │                          │
     ┌────────▼────────┐       ┌─────────▼─────────┐
     │  客户端（浏览器）│       │  服务端（SvelteKit）│
     │  api.call(ep, i) │       │  kit.fromContract  │
     │  @h-ai/api-client│       │  @h-ai/kit         │
     └────────┬────────┘       └─────────┬─────────┘
              │      HTTP（类型安全）     │
              └──────────────────────────┘
```

### 客户端流程（本模块责任）

1. 从 `@h-ai/xx/api` 导入 `xxEndpoints`
2. `api.call(xxEndpoints.xxx, input)` → 自动 Zod 校验入参 → 按 method/path 发起 HTTP → 自动 Zod 校验出参
3. 返回 `Result<TOutput, ApiClientError>`

```typescript
import { storageEndpoints } from '@h-ai/storage/api'
import { iamEndpoints } from '@h-ai/iam/api'
import { aiEndpoints } from '@h-ai/ai/api'

// 存储：获取上传签名 URL
const upload = await api.call(storageEndpoints.presignUpload, {
  key: 'avatars/user-1.png',
  contentType: 'image/png',
})

// IAM：登录
const login = await api.call(iamEndpoints.login, {
  username: 'admin',
  password: 'xxx',
})

// AI：发送消息
const chat = await api.call(aiEndpoints.sendMessage, {
  conversationId: 'conv-1',
  content: 'Hello',
})
```

### 已有契约模块一览

| 模块       | 导入路径               | 端点对象             | 典型端点                        |
| ---------- | -------------------- | -------------------- | ------------------------------- |
| `storage`  | `@h-ai/storage/api`  | `storageEndpoints`   | presignUpload, listFiles, …     |
| `iam`      | `@h-ai/iam/api`      | `iamEndpoints`       | login, logout, currentUser, …   |
| `ai`       | `@h-ai/ai/api`       | `aiEndpoints`        | chat, chatStream, sendMessage   |
| `payment`  | `@h-ai/payment/api`  | `paymentEndpoints`   | createOrder, queryOrder, …      |

### 新模块接入契约

在模块 `src/api/` 下创建 Schema + Contract，并在 `package.json` 中声明 `"./api"` 子路径导出。

---

## 常见模式

### 与 @h-ai/iam/api 契约配合

```typescript
import { iamEndpoints } from '@h-ai/iam/api'

// 登录
const login = await api.call(iamEndpoints.login, { username, password })
if (login.success) {
  await api.auth.setTokens(login.data.tokens)
}

// 获取当前用户
const me = await api.call(iamEndpoints.currentUser, {})

// 登出
await api.call(iamEndpoints.logout, {})
await api.auth.clear()
```

### Android App 中使用

```typescript
import { api } from '@h-ai/api-client'
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

// 应用启动时初始化
await api.init({
  baseUrl: import.meta.env.PUBLIC_API_BASE,
  auth: {
    storage: createCapacitorTokenStorage(),
    refreshUrl: '/api/v1/auth/refresh',
  },
})
```

---

## 相关 Skills

- `hai-iam`：认证契约定义（iamEndpoints）
- `hai-capacitor`：原生 Token 存储
- `hai-kit`：服务端契约处理（kit.fromContract）
- `hai-core`：Result 类型、错误处理基础
