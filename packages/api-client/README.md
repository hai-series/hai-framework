# @h-ai/api-client

统一 HTTP 客户端模块，提供 Bearer Token 管理、契约调用与流式请求能力。

## 支持的能力

- 通用 HTTP 方法：`get` / `post` / `put` / `patch` / `delete`
- 契约调用：`api.call(endpoint, input)`（入参/出参类型安全）
- 自动附加 Bearer Token，401 自动刷新重试
- 可插拔 Token 存储（localStorage / memory / 自定义）
- 文件上传（支持进度回调）
- SSE 流式响应（`api.stream()`）
- 请求/响应拦截器
- 统一返回 `Result<T, ApiClientError>`

## 快速开始

```ts
import { createApiClient, createLocalStorageTokenStorage } from '@h-ai/api-client'
import { iamEndpoints } from '@h-ai/iam/api'

const api = createApiClient({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {
    storage: createLocalStorageTokenStorage(),
    refreshUrl: '/auth/refresh',
  },
})

// 契约调用（推荐）
const loginResult = await api.call(iamEndpoints.login, {
  identifier: 'alice',
  password: 'xxx',
})

// 通用 HTTP
const users = await api.get<User[]>('/users', { page: 1 })
```
