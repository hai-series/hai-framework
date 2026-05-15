---
name: hai-api-client
description: 使用 @h-ai/api-client 构建多端共用的 oRPC/OpenAPI typed client，通过 api.init() 初始化，支持 Bearer Token 自动管理、401 刷新重试与 contract 嵌套方法调用；当需求涉及客户端 API 请求、Token 管理或多端数据层时使用。
---

# hai-api-client

> `@h-ai/api-client` 是跨端 typed API client。公共 HTTP API 由 `@h-ai/api-contract` 定义，服务端由 `@h-ai/serv` 挂载，客户端直接调用 `api.<domain>.<group>.<operation>()`。

## 使用步骤

### 1. 初始化

```ts
import { api } from '@h-ai/api-client'

await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: { refreshPath: '/auth/refresh' },
})
```

App/Capacitor 场景传入自定义 TokenStorage：

```ts
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: { storage: createCapacitorTokenStorage(), refreshPath: '/auth/refresh' },
})
```

### 2. 调用 typed API

```ts
const login = await api.iam.auth.login({ identifier: 'alice', password: 'secret' })
if (login.success) {
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

## 核心 API

| API | 用途 |
| --- | --- |
| `api.init(config)` | 初始化默认 API Service client |
| `api.close()` | 清理 client 状态 |
| `api.auth.setTokens(tokens)` | 写入 Token |
| `api.auth.clear()` | 清理 Token |
| `api.auth.onTokenRefreshed(cb)` | 监听刷新结果 |
| `createApiClient(contract)` | 创建自定义 typed client |

## 常见模式

- `baseUrl` 通常包含服务端 `apiPrefix`，例如 `/api/v1`。
- 业务错误不 throw，统一判断 `HaiResult.success`。
- 客户端不导入服务端 `procedures` 或 `@h-ai/serv`。
- 前端只依赖 `@h-ai/api-client` 和 contract 类型，不依赖业务模块实现。
