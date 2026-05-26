# @h-ai/kit

`@h-ai/kit` 是 hai-framework 的 SvelteKit 集成模块，提供统一的请求管道与同源 endpoint 工具：

- `kit.createHandle()`：会话解析、路由守卫、中间件链、可选传输加密与 Cookie 加密
- `kit.handler()`：API 端点异常边界
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`

> 公共跨端 HTTP API contract 统一放在 `@h-ai/api-contract`，由 `@h-ai/serv` 挂载，客户端通过 `@h-ai/api-client` typed client 调用；`@h-ai/kit` 不定义也不承载业务 API contract。

## 安装

```bash
npm install @h-ai/kit
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite
```

## 支持的能力

- Handle Hook 组合（`createHandle` / `sequence`）
- 认证/角色/权限守卫（`guard.require` / `guard.check`）
- 内置 Logging / RateLimit / CORS 中间件（通过 `createHandle` 配置启用）
- 统一 API 响应与请求验证（Zod）
- Bearer Token 工具（服务端 login/logout + 浏览器端 Token 存储）
- 浏览器端统一客户端（自动 CSRF，支持传输加密）
- 声明式 CRUD 资源定义（`crud.define`）
- A2A 协议集成
- 双构建模式（`createAdapter()`）

## 依赖

- `@h-ai/iam` — 身份认证与授权（A2A 认证），可选；使用 A2A 功能时需在 kit 使用前初始化
- `@h-ai/crypto` — 加密（传输加密 / Cookie 加密），可选；启用加密时需在 kit 使用前初始化

## 快速开始

### 项目配置

**svelte.config.js**：

```js
import adapter from '@sveltejs/adapter-auto'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

const config = {
  preprocess: [vitePreprocess()],
  compilerOptions: { runes: true },
  kit: {
    adapter: adapter(),
    // 双构建模式：import { createAdapter } from '@h-ai/kit/adapter'
    // adapter: createAdapter(),
  },
}

export default config
```

**vite.config.ts**：

```ts
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  optimizeDeps: { exclude: ['bits-ui'] },
  ssr: { noExternal: [/@h-ai\//] },
})
```

### 搭建请求管道

**src/hooks.server.ts**：

```typescript
import type { Handle } from '@sveltejs/kit'
import { kit } from '@h-ai/kit'

const haiHandle = kit.createHandle({
  auth: {
    verifyToken: async (token) => {
      return token ? { userId: 'u_1', roles: ['admin'], permissions: ['user:read'] } : null
    },
    loginUrl: '/auth/login',
    protectedPaths: ['/admin/*', '/api/*'],
    publicPaths: ['/api/auth/*', '/api/public/*'],
  },
  rateLimit: { windowMs: 60_000, maxRequests: 100 },
  logging: true,
})

export const handle: Handle = haiHandle
```

### API 端点

```typescript
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

export const POST = kit.handler(async ({ request, locals }) => {
  kit.guard.require(locals.session, 'user:create')
  const payload = await kit.validate.body(request, CreateUserSchema)
  return kit.response.created(payload)
})
```

### 浏览器客户端

`kit.client.create()` 面向 SvelteKit 同源 endpoint；Web / App / 小程序跨域访问公共 API 时，请使用 `@h-ai/api-client`。

```typescript
// src/lib/utils/api.ts — 全应用共享
import { kit } from '@h-ai/kit'

const client = kit.client.create({ auth: true })
export const { apiFetch } = client
```

```typescript
// 使用
import { apiFetch } from '$lib/utils/api'

const response = await apiFetch('/api/users', { method: 'GET' })
```

> CSRF Header 注入由 `apiFetch` 自动处理；`@h-ai/kit` 不提供独立的 CSRF 中间件工厂。

### 同源传输加密

kit 的传输加密也统一委托 `@h-ai/crypto`：服务端通过 `crypto.transport.createServer()` 创建管理器，浏览器端通过 `kit.client.installBrowserTransport(kitConfig, { crypto })` 一行安装同源 fetch 包装。应用层只配置顶层 `crypto` 句柄。

**src/hooks.server.ts**：

```ts
import { crypto } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

await crypto.init()

export const handle = kit.createHandle({
  auth: {
    verifyToken,
    protectedPaths: ['/api/*'],
    publicPaths: ['/api/_hai/*'], // 默认密钥协商端点
  },
  crypto: {
    crypto,
    transport: { requireEncryption: true },
  },
})
```

**src/routes/+layout.svelte**（推荐入口：浏览器端只需一行）：

```svelte
<script lang='ts'>
  import { browser } from '$app/environment'
  import { appKitConfig } from '$lib/config/kit-config'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit'

  // 一次性安装：内部按 _kit.yml 决定是否启用 transport，并预热 crypto
  if (browser) {
    kit.client.installBrowserTransport(appKitConfig, { crypto })
  }
</script>
```

**src/lib/utils/api.ts**（业务层只看到 `apiFetch`）：

```ts
import { kit } from '@h-ai/kit'

export const { apiFetch } = kit.client.create()
```

> 不再需要 `src/hooks.client.ts`：默认 `handleFetch` 行为已经够用，SvelteKit 内部 `__data.json` 请求会自动走上面安装的全局 fetch 包装。同源 Authorization 注入统一通过 `kit.client.create({ auth: true })` 完成，避免浏览器端 hooks 与全局 fetch 包装形成两条链路。

默认密钥协商路径为 `/api/_hai/key-exchange`。如服务端自定义 `transport.keyExchangePath`，客户端需同步配置 `transport.keyExchangeUrl`。

transport 默认作用于同源 `/api/*` endpoint 与 SvelteKit `__data.json` 页面数据请求（以及密钥协商端点本身）；页面文档与静态资源仍保持明文，不要求携带 `X-Client-Id`。文件上传等 `multipart/form-data` 请求会保持原样发送，需在服务端 `excludePaths` 中显式放行对应上传路径。

安全策略默认 fail-closed：`requireEncryption: true` 时，受保护路径缺少 `X-Client-Id` 会直接返回 400；服务端 transport 管理器不可用、响应体无法加密或超过单次加密上限时返回错误，不会把业务明文响应透传给客户端。`requireEncryption: false` 仅用于迁移期灰度，不建议在生产启用。

### 使用 `_kit.yml` 统一 transport 配置

`@h-ai/kit` 提供 `KitConfigSchema` / `resolveKitConfig()`，方便应用用同一份 `_kit.yml`
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

如只在服务端读取配置，也可配合 `core.config.validate('kit', KitConfigSchema)` 使用。
由于浏览器端也可能读取这份配置，`_kit.yml` 只应放公开的 transport 路径/开关，不要写入密钥。

## 配置

`kit.createHandle()` 配置项：

| 字段         | 类型                                     | 说明                                                              |
| ------------ | ---------------------------------------- | ----------------------------------------------------------------- |
| `auth`       | `HandleAuthConfig`                       | 认证配置（verifyToken / protectedPaths / publicPaths / loginUrl） |
| `rateLimit`  | `object \| false`                        | 速率限制（windowMs / maxRequests）                                |
| `logging`    | `boolean \| object`                      | 请求日志（默认 `true`，`{ logBody: true }` 记录请求体）           |
| `crypto`     | `HookCryptoConfig`                       | 传输加密 + Cookie 加密                                            |
| `guards`     | `GuardConfig[]`                          | 自定义守卫（在 auth 自动守卫之后执行）                            |
| `middleware` | `Middleware[]`                           | 自定义中间件（在内置中间件之后执行）                              |
| `a2a`        | `HandleA2AOperations \| HandleA2AConfig` | A2A 协议集成（Agent Card + JSON-RPC）                             |
| `onError`    | `function`                               | 自定义错误处理                                                    |

## 导出路径

- `@h-ai/kit`：主入口，提供 `kit` 命名空间与类型。
- `@h-ai/kit/client`：浏览器端客户端。
- `@h-ai/kit/adapter`：双构建 adapter（`createAdapter()`）。
- `@h-ai/kit/vite`：Vite 插件。
- `@h-ai/kit/a2a`：A2A 协议集成。
- `@h-ai/kit/crypto`：加密模块集成。

## 错误处理

- 推荐使用 `kit.handler()` 包装 API 端点。
- `kit.validate.body` / `kit.guard.require` 会抛出 `Response`（SvelteKit 控制流）。
- 非控制流异常会由 `kit.handler()` 统一转换为 `500 INTERNAL_ERROR` 响应。

## 测试

```bash
pnpm --filter @h-ai/kit test
```

## License

Apache-2.0
