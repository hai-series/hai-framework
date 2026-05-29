---
name: hai-kit
description: 使用 @h-ai/kit 构建 SvelteKit 请求管道、认证守卫、统一响应、Zod 校验、浏览器端 apiFetch、A2A 与双构建适配；当需求涉及 hooks.server.ts、权限守卫、CORS、限流、同源 transport 或 SvelteKit API endpoint 时使用。
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

const client = kit.client.create()
export const { apiFetch } = client
```

> 同源 endpoint 优先使用 httpOnly Cookie；`auth: true` 只读取 `kit.auth.setBrowserToken()` 写入的页面内存 Token，不会默认读写 localStorage。确需 Bearer Header 时，显式传入 `BrowserTokenStore`，禁止把敏感 Token 存入 localStorage。

### 4. 同源传输加密

kit 不再维护本地传输加密实现；服务端和客户端都统一委托 `@h-ai/crypto` 的 `crypto.transport`。

```ts
// hooks.server.ts
import { cache } from '@h-ai/cache'
import { createRedisTransportKeyStore, crypto } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

await crypto.init()
await cache.init({ type: 'redis', host: '127.0.0.1', port: 6379 })

export const handle = kit.createHandle({
  auth: {
    verifyToken,
    protectedPaths: ['/api/*'],
    publicPaths: ['/api/_hai/*'],
  },
  crypto: {
    crypto,
    transport: {
      requireEncryption: true,
      keyStore: createRedisTransportKeyStore({ cache, ttlSeconds: 3600 }),
    },
  },
})
```

```ts
// routes/+layout.svelte
<script lang='ts'>
  import { browser } from '$app/environment'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit'
  import { appKitConfig } from '$lib/config/kit-config'

  // 一次性安装：内部按 appKitConfig.transport 是否启用决定行为，并预热 crypto
  if (browser) {
    kit.client.installBrowserTransport(appKitConfig, { crypto })
  }
</script>
```

```ts
// lib/utils/api.ts —— 业务层只看到 apiFetch
import { kit } from '@h-ai/kit'

export const { apiFetch } = kit.client.create()
```

默认协商端点：`/api/_hai/key-exchange`。如 `keyExchangePath` 自定义，浏览器端同步设置 `keyExchangeUrl`。

多节点部署时，可在 `kit.createHandle({ crypto: { transport } })` 的运行时对象里直接传 `keyStore`；推荐使用 `@h-ai/crypto` 根入口导出的 `createRedisTransportKeyStore()` / `createReldbTransportKeyStore()`。这类对象依赖不要写进 `_kit.yml`。

transport 默认保护同源 `/api/*` endpoint 与 SvelteKit `__data.json` 页面数据请求；页面文档、静态资源与 `multipart/form-data` 上传请求保持明文透传。

安全策略默认 fail-closed：`requireEncryption: true` 时，受保护路径缺少 `X-Client-Id` 必须返回 400；服务端 transport 管理器不可用、响应体无法加密或超过单次加密上限时返回错误，禁止明文业务响应回退。`requireEncryption: false` 只适合迁移期灰度。

### 5. 使用 `_kit.yml` 统一 transport 配置

`@h-ai/kit` 现在提供 `KitConfigSchema` / `resolveKitConfig()`，适合同一份 `_kit.yml`
同时驱动 `hooks.server.ts` 与浏览器端 `kit.client.installBrowserTransport()`：

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
| `kit.client.installBrowserTransport(config, { crypto })` | 推荐入口：按解析后的 `_kit.yml` 一键安装浏览器端传输加密 |
| `kit.client.installBrowserTransportFetch()` | 底层入口：直接传 transport 配置安装浏览器全局 fetch 包装 |
| `kit.crud.define()` | 声明式 CRUD 资源 |

## 常见模式

- SvelteKit 应用内同源请求用 `kit.client.create().apiFetch`。
- SvelteKit 应用启用 transport 时，在 `+layout.svelte` 的 `if (browser)` 分支调用一次 `kit.client.installBrowserTransport(appKitConfig, { crypto })`，无需重复连线 `keyExchangeUrl` / `excludePaths`。
- Web/App/小程序跨域访问公共 API 用 `@h-ai/api-client` typed client。
- 传输加密只通过 `crypto.transport` 间接装配，不在 kit 中新增本地加密工厂或鸭子类型。
- 服务端业务模块直接调用模块 API，不通过 HTTP 自环。
- API endpoint 必须用 Zod 校验用户输入，并设置认证/权限边界。
