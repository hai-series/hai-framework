---
name: hai-kit
description: 使用 @h-ai/kit 构建 SvelteKit 请求管道、认证守卫、统一响应、Zod 校验、浏览器端 apiFetch、A2A 与双构建适配；当需求涉及 hooks.server.ts、hooks.client.ts、权限守卫、CORS、限流或 SvelteKit API endpoint 时使用。
---

# hai-kit

> `@h-ai/kit` 只负责 SvelteKit 集成：Handle Hook、guard、response、validate、client、auth、crud、A2A。公共跨端 HTTP API 契约统一使用 `@h-ai/api-contract` + `@h-ai/serv`，不要在 kit 中定义业务 API contract。

## 使用步骤

### 1. 请求管道

```ts
import type { Handle } from '@sveltejs/kit'
import { kit } from '@h-ai/kit'

const haiHandle = kit.createHandle({
  auth: {
    verifyToken: async token => token ? { userId: 'u_1', roles: ['admin'], permissions: ['user:read'] } : null,
    loginUrl: '/auth/login',
    protectedPaths: ['/admin/*'],
  },
  rateLimit: { windowMs: 60_000, maxRequests: 100 },
  logging: true,
})

export const handle: Handle = haiHandle
```

### 2. SvelteKit API endpoint

```ts
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const CreateUserSchema = z.object({ name: z.string().min(1) })

export const POST = kit.handler(async ({ request, locals }) => {
  kit.guard.require(locals.session, 'user:create')
  const payload = await kit.validate.body(request, CreateUserSchema)
  return kit.response.created(payload)
})
```

### 3. 浏览器同源请求

```ts
import { kit } from '@h-ai/kit'

const client = kit.client.create({ auth: true })
export const { apiFetch } = client
```

### 4. 同源传输加密

kit 不再维护本地传输加密实现；服务端和客户端都统一委托 `@h-ai/crypto` 的 `crypto.transport`。

```ts
// hooks.server.ts
import { crypto } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

await crypto.init()

export const handle = kit.createHandle({
  auth: {
    verifyToken,
    protectedPaths: ['/api/*'],
    publicPaths: ['/api/_hai/*'],
  },
  crypto: {
    crypto,
    transport: { requireEncryption: false },
  },
})
```

```ts
// lib/utils/api.ts
import { crypto } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

if (typeof window !== 'undefined') {
  crypto.init()
}

export const { apiFetch } = kit.client.create({
  transport: { crypto },
  auth: true,
})
```

默认协商端点：`/api/_hai/key-exchange`。如 `keyExchangePath` 自定义，浏览器端同步设置 `keyExchangeUrl`。

### 5. 使用 `_kit.yml` 统一 transport 配置

`@h-ai/kit` 现在提供 `KitConfigSchema` / `resolveKitConfig()`，适合同一份 `_kit.yml`
同时驱动 `hooks.server.ts` 与浏览器端 `kit.client.create()`：

```yml
transport:
  keyExchangePath: /api/_hai/key-exchange
  requireEncryption: true
  encryptResponse: true
  excludePaths:
    - /api/storage
    - /api/public
    - /api/auth/profile/avatar
  maxClients: 10000
```

```ts
import { resolveKitConfig } from '@h-ai/kit'
import { parse } from 'yaml'
import rawKitConfig from '../config/_kit.yml?raw'

export const appKitConfig = resolveKitConfig(parse(rawKitConfig) ?? {})
```

`_kit.yml` 只放公开的 transport 路径/开关，不放密钥；如自定义 `keyExchangePath`，浏览器端必须同步映射为 `keyExchangeUrl`。

## 核心 API

| API | 用途 |
| --- | --- |
| `kit.createHandle()` | 创建 SvelteKit Handle |
| `kit.sequence()` | 组合多个 Handle |
| `kit.handler()` | API endpoint 错误边界 |
| `kit.guard.require()` | 权限守卫 |
| `kit.response.*` | 统一响应工厂 |
| `kit.validate.*` | Zod 请求校验 |
| `kit.auth.*` | Cookie / Token 辅助 |
| `kit.client.create()` | 浏览器端同源 apiFetch |
| `kit.crud.define()` | 声明式 CRUD 资源 |

## 常见模式

- SvelteKit 应用内同源请求用 `kit.client.create().apiFetch`。
- Web/App/小程序跨域访问公共 API 用 `@h-ai/api-client` typed client。
- 传输加密只通过 `crypto.transport` 间接装配，不在 kit 中新增本地加密工厂或鸭子类型。
- 服务端业务模块直接调用模块 API，不通过 HTTP 自环。
- API endpoint 必须用 Zod 校验用户输入，并设置认证/权限边界。
