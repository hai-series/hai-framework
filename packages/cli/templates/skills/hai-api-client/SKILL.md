---
name: hai-api-client
description: 使用 @h-ai/api-client 构建多端共用的 oRPC/OpenAPI typed client，通过 apiClient.init() 初始化，支持 Bearer Token 自动管理、401 刷新重试与 contract 嵌套方法调用；当需求涉及客户端 API 请求、Token 管理或多端数据层时使用。
---

# hai-api-client

> `@h-ai/api-client` 是跨端 typed API client。公共 HTTP API 由 `@h-ai/api-contract` 定义，服务端由 `@h-ai/serv` 挂载，客户端直接调用 `apiClient.<domain>.<group>.<operation>()`。

## 使用步骤

### 1. 初始化

浏览器默认使用 httpOnly cookie 存储（推荐）：

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
})
```

启用传输加密时，只传顶层 `crypto` 句柄；api-client 内部自动调用 `crypto.transport.createClient()`：

```ts
import { apiClient } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

await crypto.init()

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
  transport: { crypto }, // 默认协商路径：/api/v1/_hai/key-exchange
})
```

App/Capacitor 场景传入自定义 TokenStorage：

```ts
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: { storage: createCapacitorTokenStorage() },
})
```

SSR / Node.js 测试场景请显式传入内存存储：

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: { storage: apiClient.tokenStorage.memory() },
})
```

### 2. 调用 typed API

```ts
const login = await apiClient.iam.auth.login({ identifier: 'alice', password: 'secret' })
if (login.success) {
  // 默认 httpOnly cookie 模式下，refresh token 由服务端 Set-Cookie 管理。
  await apiClient.auth.setTokens(login.data.tokens)
}

const me = await apiClient.iam.auth.currentUser()
const upload = await apiClient.storage.presignedUrls.createUpload({ key: 'avatar.png' })
const answer = await apiClient.ai.chats.sendMessage({ message: 'hello' })
```

### 3. 自定义 contract

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

const contract = apiContract.create({ iam: apiContract.iam })
const client = apiClient.create(contract)
await client.init({ baseUrl: 'https://api.example.com/api/v1' })
```

### 4. 关闭

```ts
await apiClient.close()
```

## Token Storage 适配器

| 工厂调用 | 存储位置 | 适用场景 |
| --- | --- | --- |
| `apiClient.tokenStorage.httpOnlyCookie()` | httpOnly cookie（服务端管理） | **默认**；浏览器端推荐，refresh token 不暴露给 JS |
| `apiClient.tokenStorage.memory()` | 内存 | SSR / Node.js 单元测试（需显式传入） |
| `apiClient.tokenStorage.localStorage()` | localStorage | 非敏感场景（有 XSS 风险，生产不推荐） |

### httpOnly Cookie 模式

Access token 存在内存中，refresh token 由服务端通过 `HttpOnly` cookie 管理，浏览器 JS 无法读取，可有效防止 XSS 窃取 token。

**前提**：服务端需配置 `serv.createApp({ iam, refreshCookie: {} })`，参见 `hai-serv` skill。

启用 `transport` 时，登录、业务请求以及 401 后的自动刷新都会复用同一个加密 fetch 链路；不要在业务代码中手写明文 `/auth/refresh` 请求。

```ts
import { apiClient } from '@h-ai/api-client'

// apiClient.tokenStorage.httpOnlyCookie() 是默认存储，无需显式指定
await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
})

// 登录后设置 access token（refresh token 由服务端写入 cookie，前端无需操作）
const login = await apiClient.iam.auth.login({ identifier: 'alice', password: 'secret' })
if (login.success) {
  await apiClient.auth.setTokens(login.data.tokens)
}
```

## 核心 API

| API | 用途 |
| --- | --- |
| `apiClient.init(config)` | 初始化默认 API Service client |
| `apiClient.close()` | 清理 client 状态 |
| `apiClient.auth.setTokens(tokens)` | 写入 access token；非 httpOnly 存储会同时写入 refresh token |
| `apiClient.auth.clear()` | 清理 Token |
| `apiClient.auth.onTokenRefreshed(cb)` | 监听刷新结果 |
| `apiClient.create(contract)` | 创建自定义 typed client |
| `apiClient.tokenStorage.{memory,localStorage,httpOnlyCookie}()` | TokenStorage 工厂 |

### Transport 配置

| 字段 | 说明 |
| --- | --- |
| `transport.crypto` | 已初始化的 `@h-ai/crypto` 实例 |
| `transport.keyExchangePath` | 相对于 `baseUrl` 的协商子路径，默认 `/_hai/key-exchange` |

服务端必须对应启用 `serv.createApp({ transport: { crypto } })`。
自动刷新会沿用 `transport.encryptedFetch`，并在 httpOnly cookie 模式下发送空请求体 + `credentials: 'include'`，由服务端从 cookie 读取 refresh token。

## 常见模式

- `baseUrl` 通常包含服务端 `apiPrefix`，例如 `/api/v1`。
- 业务错误不 throw，统一判断 `HaiResult.success`。
- 客户端不导入服务端 `procedures` 或 `@h-ai/serv`。
- 客户端不导入 `@h-ai/crypto` 的内部 transport 工厂，只通过 `transport: { crypto }` 装配。
- 前端只依赖 `@h-ai/api-client` 和 contract 类型，不依赖业务模块实现。
- httpOnly cookie 模式需服务端与客户端同步配置，不支持跨域刷新（`SameSite=Strict`）。
