---
name: hai-api-client
description: 使用 @h-ai/api-client 构建多端共用的 oRPC/OpenAPI typed client，通过 api.init() 初始化，支持 Bearer Token 自动管理、401 刷新重试与 contract 嵌套方法调用；当需求涉及客户端 API 请求、Token 管理或多端数据层时使用。
---

# hai-api-client

> `@h-ai/api-client` 是跨端 typed API client。公共 HTTP API 由 `@h-ai/api-contract` 定义，服务端由 `@h-ai/serv` 挂载，客户端直接调用 `api.<domain>.<group>.<operation>()`。

## 使用步骤

### 1. 初始化

浏览器默认使用 httpOnly cookie 存储（推荐）：

```ts
import { api } from '@h-ai/api-client'

await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
})
```

启用传输加密时，只传顶层 `crypto` 句柄；api-client 内部自动调用 `crypto.transport.createClient()`：

```ts
import { api } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

await crypto.init()

await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
  transport: { crypto }, // 默认协商路径：/api/v1/_hai/key-exchange
})
```

App/Capacitor 场景传入自定义 TokenStorage：

```ts
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: { storage: createCapacitorTokenStorage() },
})
```

SSR / Node.js 测试场景请显式传入内存存储：

```ts
import { api, createMemoryTokenStorage } from '@h-ai/api-client'

await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: { storage: createMemoryTokenStorage() },
})
```

### 2. 调用 typed API

```ts
const login = await api.iam.auth.login({ identifier: 'alice', password: 'secret' })
if (login.success) {
  // 默认 httpOnly cookie 模式下，refresh token 由服务端 Set-Cookie 管理。
  await api.auth.setTokens(login.data.tokens)
}

const me = await api.iam.auth.currentUser()
const upload = await api.storage.presignedUrls.createUpload({ key: 'avatar.png' })
const answer = await api.ai.chats.sendMessage({ message: 'hello' })
```

### 3. 自定义 contract

```ts
import { createApiClient } from '@h-ai/api-client'
import { createApiContract, iamContract } from '@h-ai/api-contract'

const contract = createApiContract({ iam: iamContract })
const client = createApiClient(contract)
await client.init({ baseUrl: 'https://api.example.com/api/v1' })
```

### 4. 关闭

```ts
await api.close()
```

## Token Storage 适配器

| 工厂函数 | 存储位置 | 适用场景 |
| --- | --- | --- |
| `createHttpOnlyCookieTokenStorage()` | httpOnly cookie（服务端管理） | **默认**；浏览器端推荐，refresh token 不暴露给 JS |
| `createMemoryTokenStorage()` | 内存 | SSR / Node.js 单元测试（需显式传入） |
| `createLocalStorageTokenStorage()` | localStorage | 非敏感场景（有 XSS 风险，生产不推荐） |

### httpOnly Cookie 模式

Access token 存在内存中，refresh token 由服务端通过 `HttpOnly` cookie 管理，浏览器 JS 无法读取，可有效防止 XSS 窃取 token。

**前提**：服务端需配置 `serv.createApp({ iam, refreshCookie: {} })`，参见 `hai-serv` skill。

```ts
import { api } from '@h-ai/api-client'

// createHttpOnlyCookieTokenStorage 是默认存储，无需显式指定
await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
})

// 登录后设置 access token（refresh token 由服务端写入 cookie，前端无需操作）
const login = await api.iam.auth.login({ identifier: 'alice', password: 'secret' })
if (login.success) {
  await api.auth.setTokens(login.data.tokens)
}
```

## 核心 API

| API | 用途 |
| --- | --- |
| `api.init(config)` | 初始化默认 API Service client |
| `api.close()` | 清理 client 状态 |
| `api.auth.setTokens(tokens)` | 写入 access token；非 httpOnly 存储会同时写入 refresh token |
| `api.auth.clear()` | 清理 Token |
| `api.auth.onTokenRefreshed(cb)` | 监听刷新结果 |
| `createApiClient(contract)` | 创建自定义 typed client |

### Transport 配置

| 字段 | 说明 |
| --- | --- |
| `transport.crypto` | 已初始化的 `@h-ai/crypto` 实例 |
| `transport.keyExchangePath` | 相对于 `baseUrl` 的协商子路径，默认 `/_hai/key-exchange` |

服务端必须对应启用 `serv.createApp({ transport: { crypto } })`。

## 常见模式

- `baseUrl` 通常包含服务端 `apiPrefix`，例如 `/api/v1`。
- 业务错误不 throw，统一判断 `HaiResult.success`。
- 客户端不导入服务端 `procedures` 或 `@h-ai/serv`。
- 客户端不导入 `@h-ai/crypto` 的内部 transport 工厂，只通过 `transport: { crypto }` 装配。
- 前端只依赖 `@h-ai/api-client` 和 contract 类型，不依赖业务模块实现。
- httpOnly cookie 模式需服务端与客户端同步配置，不支持跨域刷新（`SameSite=Strict`）。
