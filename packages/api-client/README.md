# @h-ai/api-client

统一 HTTP 客户端模块，提供 Bearer Token 管理、契约调用与流式请求能力。

## 支持的能力

- 单例模式：`api.init()` → `api.get()` / `api.call()` → `api.close()`
- 通用 HTTP 方法：`get` / `post` / `put` / `patch` / `delete`
- 契约调用：`api.call(endpoint, input)`（入参/出参类型安全）
- 自动附加 Bearer Token，401 自动刷新重试
- 可插拔 Token 存储（默认 localStorage，可切换 memory / 自定义）
- 文件上传（支持附加字段）
- SSE 流式响应（`api.stream()`）
- 请求/响应拦截器
- 统一返回 `Result<T, ApiClientError>`

## 快速开始

```ts
import { api } from '@h-ai/api-client'
import { iamEndpoints } from '@h-ai/iam/api'

// 初始化
await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: { refreshUrl: '/auth/refresh' },
})

// 契约调用（推荐）
const loginResult = await api.call(iamEndpoints.login, {
  identifier: 'alice',
  password: 'xxx',
})

// 通用 HTTP
const users = await api.get<User[]>('/users', { page: 1 })

// 关闭
await api.close()
```

> `auth.storage` 未传时默认使用 `createLocalStorageTokenStorage()`；在 SSR/测试环境可显式传入 `createMemoryTokenStorage()`。

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

### SSR / 测试环境（推荐 memory storage）

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

## 错误处理示例

`@h-ai/api-client` 所有通用 HTTP / 契约调用均返回 `Result<T, ApiClientError>`：

```ts
const result = await api.get<{ id: string, name: string }>('/users/me')

if (!result.success) {
  // 可根据 error.code 做分支处理
  // 1203: UNAUTHORIZED, 1201: TIMEOUT, 1210: NOT_INITIALIZED ...
  console.error(result.error.code, result.error.message)
  return
}

console.log(result.data.name)
```

## Token 管理与订阅

```ts
await api.auth.setTokens({
  accessToken: 'xxx',
  refreshToken: 'yyy',
  expiresIn: 3600,
  tokenType: 'Bearer',
})

const unsubscribe = api.auth.onTokenRefreshed((tokens) => {
  // 刷新成功后的最新 token
  console.log(tokens.accessToken)
})

// 不再需要监听时，调用取消订阅
unsubscribe()
```

## 流式响应（SSE）

```ts
for await (const chunk of api.stream('/ai/chat/stream', { message: 'hello' })) {
  // chunk 对应 SSE 的 data: 内容
  process.stdout.write(chunk)
}
```

说明：

- `stream()` 内置超时控制
- 401 会尝试自动刷新 Token 后重试一次
- 解析器支持跨 chunk 的 SSE 行缓冲

## 测试

```bash
pnpm --filter @h-ai/api-client test
```

## License

Apache-2.0
