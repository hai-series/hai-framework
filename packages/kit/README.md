# @h-ai/kit

`@h-ai/kit` 是 hai-framework 的 SvelteKit 集成模块，提供统一的请求管道与 API 工具：

- `kit.createHandle()`：会话解析、路由守卫、中间件链、可选传输加密与 Cookie 加密
- `kit.handler()`：API 端点异常边界
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`

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
- 基于 EndpointDef 的契约模式（`fromContract`）
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

**src/hooks.client.ts**：

```typescript
import { kit } from '@h-ai/kit'

export const handleFetch = kit.auth.createHandleFetch()
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

### 契约模式（推荐）

```typescript
import { iamEndpoints } from '@h-ai/iam/api'
import { kit } from '@h-ai/kit'

export const POST = kit.fromContract(iamEndpoints.login, async (input) => {
  const result = await iam.auth.login(input)
  if (!result.success)
    return kit.response.unauthorized(result.error.message)
  return kit.response.ok(result.data)
})
```

### 浏览器客户端

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

| 路径                | 用途                                           |
| ------------------- | ---------------------------------------------- |
| `@h-ai/kit`         | 主入口：`kit` 命名空间、类型、`defineEndpoint` |
| `@h-ai/kit/client`  | 浏览器端客户端                                 |
| `@h-ai/kit/adapter` | 双构建 adapter（`createAdapter()`）            |
| `@h-ai/kit/vite`    | Vite 插件                                      |
| `@h-ai/kit/a2a`     | A2A 协议集成                                   |
| `@h-ai/kit/crypto`  | 加密模块集成                                   |

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
