---
name: hai-kit
description: 使用 @h-ai/kit 构建 SvelteKit 请求管道与 API 安全边界（handle/guard/middleware/handler/validate/response/fromContract）。当需求涉及 hooks.server.ts、权限守卫、限流、统一响应、Bearer Token 认证、契约处理或 CORS 配置时使用。
---

# hai-kit

`@h-ai/kit` 是 hai-framework 的 SvelteKit 集成层。它把请求处理中的"通用横切能力"收敛到统一命名空间 `kit`：

- 请求入口：`createHandle` / `sequence`
- 安全边界：`guard` / `middleware`
- API 工具：`handler` / `response` / `validate`
- Bearer Token 认证：从 `Authorization` header 解析，SSR 端通过 `hai_token` Cookie 透传
- 契约处理：`fromContract(endpoint, fn)` — 基于 EndpointDef 的类型安全 handler
- 双构建模式：`createAdapter()` 根据环境变量选择 adapter-node 或 adapter-static

## 模块概述

当任务涉及以下关键词时，优先使用本 Skill：

- `hooks.server.ts`
- `kit.createHandle` / `kit.sequence`
- `kit.guard.*`（`require` / `check`）
- `kit.handler` / `kit.response` / `kit.validate`
- `kit.fromContract(endpoint, fn)` — 契约到 SvelteKit handler
- `kit.client.create()` — 浏览器端统一 API 客户端（`apiFetch`）
- `kit.auth.createTokenStore()` — 浏览器端 Token 存储
- `kit.auth.createHandleFetch()` — `hooks.client.ts` 自动附加 Token
- Bearer Token / `Authorization` header
- CORS 配置（含 Capacitor Origin 预设）
- 传输加密（key exchange / `X-Client-Id`）

> **重要变更**：Cookie Session 和 CSRF 中间件已移除。统一使用 Bearer Token 认证。

## 依赖

| 模块 | 用途 | 是否必需 | 初始化要求 |
| --- | --- | --- | --- |
| `@h-ai/iam` | 身份认证与授权（A2A 认证） | 可选 | 使用 A2A 功能时需在 kit 使用前初始化 |
| `@h-ai/crypto` | 加密（传输加密 / Cookie 加密） | 可选 | 启用加密时需在 kit 使用前初始化 |

## 使用步骤

### 1) 在 `hooks.server.ts` 搭建请求管道

```typescript
import { kit } from '@h-ai/kit'

export const handle = kit.createHandle({
  auth: {
    verifyToken: async token => token
      ? { userId: 'u_1', roles: ['admin'], permissions: ['user:read'] }
      : null,
    loginUrl: '/auth/login',
    protectedPaths: ['/admin/*', '/api/*'],
    publicPaths: ['/api/auth/*', '/api/public/*'],
  },
  rateLimit: { windowMs: 60_000, maxRequests: 100 },
  logging: true,
  cors: {
    origins: ['https://example.com'],
    capacitor: true, // 自动添加 capacitor://localhost 等原生 App Origin
  },
})
```

### 2) API 端点使用 `kit.handler`

```typescript
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const CreateSchema = z.object({ name: z.string().min(1) })

export const POST = kit.handler(async ({ request, locals }) => {
  kit.guard.require(locals.session, 'user:create')
  const data = await kit.validate.body(request, CreateSchema)
  return kit.response.created(data)
})
```

### 3) 基于契约的类型安全 handler（推荐）

```typescript
import { iam } from '@h-ai/iam'
import { iamEndpoints } from '@h-ai/iam/api'
import { kit } from '@h-ai/kit'

// 入参自动 Zod 校验，返回值类型安全
export const POST = kit.fromContract(iamEndpoints.login, async (input, event) => {
  const result = await iam.auth.login(input)
  if (!result.success) {
    return kit.response.unauthorized(result.error.message)
  }
  return kit.response.ok(result.data)
})
```

### 4) CORS 配置

```typescript
export const handle = kit.createHandle({
  cors: {
    origins: ['https://example.com', 'https://*.example.com'], // 支持通配符
    capacitor: true, // 自动添加 capacitor://localhost, ionic://localhost 等
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  },
})
```

### 5) 需要传输加密时启用 `crypto` 配置

```typescript
import { crypto } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

export const handle = kit.createHandle({
  crypto: {
    crypto,
    transport: true,
    cookieEncryptionKey: process.env.HAI_KIT_COOKIE_KEY,
  },
})
```

## 核心 API

| API                         | 用途                   | 关键点                                        |
| --------------------------- | ---------------------- | --------------------------------------------- |
| `kit.createHandle(config?)` | 创建 SvelteKit Handle  | Bearer Token 解析、守卫、中间件、CORS         |
| `kit.sequence(...handles)`  | 组合多个 Handle        | 洋葱模型顺序执行                              |
| `kit.handler(fn)`           | 包装 API 处理函数      | 非控制流异常统一转 500                        |
| `kit.fromContract(ep, fn)`  | 契约到 handler         | 自动 Zod 入参校验，类型安全                   |
| `kit.guard.*`               | 权限守卫               | `require`（throw 式） / `check`（布尔）       |
| `kit.response.*`            | 标准化响应             | 统一 `{ success, data?, error?, requestId? }` |
| `kit.validate.*`            | 请求体/查询/参数校验   | 失败 throw Response（SvelteKit 控制流）       |
| `defineEndpoint(def)`       | 定义 EndpointDef 契约  | 与 api-client 配合使用                        |

### EndpointDef 契约

```typescript
import { defineEndpoint } from '@h-ai/kit'
import { z } from 'zod'

const myEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/v1/items',
  input: z.object({ name: z.string() }),
  output: z.object({ id: z.string(), name: z.string() }),
  requireAuth: true,
})
```

## 错误码（常见）

### API 响应错误码（`kit.response`）

| code               | status | 场景               |
| ------------------ | ------ | ------------------ |
| `BAD_REQUEST`      | 400    | 参数或请求格式错误 |
| `UNAUTHORIZED`     | 401    | 未认证             |
| `FORBIDDEN`        | 403    | 无权限             |
| `NOT_FOUND`        | 404    | 资源不存在         |
| `CONFLICT`         | 409    | 资源冲突           |
| `VALIDATION_ERROR` | 422    | 数据校验失败       |
| `INTERNAL_ERROR`   | 500    | 未处理异常         |

## API 契约范式（端到端类型安全）

> `kit.fromContract` 和 `api.call` 共同消费模块 `api/` 下的 `EndpointDef`，实现服务端↔客户端的全链路类型安全 + 运行时 Zod 校验。

### 服务端流程（本模块责任）

1. 从 `@h-ai/xx/api` 导入 `xxEndpoints`
2. `kit.fromContract(xxEndpoints.xxx, handler)` → 自动 Zod 校验入参 → handler 获得类型安全的 `input`
3. 需权限时在 handler 内调用 `kit.guard.require`

### 多模块契约示例

```typescript
// ─── 存储：预签名上传 ───
import { storageEndpoints } from '@h-ai/storage/api'
import { storage } from '$lib/server/init'

export const POST = kit.fromContract(storageEndpoints.presignUpload, async (input, event) => {
  kit.guard.require(event.locals.session, 'storage:write')
  const result = await storage.presign.putUrl(input.key, input)
  if (!result.success) {
    return kit.response.internalError(result.error.message)
  }
  return kit.response.ok({ url: result.data, key: input.key })
})

// ─── IAM：登录 ───
import { iamEndpoints } from '@h-ai/iam/api'
import { iam } from '$lib/server/init'

export const POST = kit.fromContract(iamEndpoints.login, async (input) => {
  const result = await iam.auth.login(input)
  if (!result.success) {
    return kit.response.unauthorized(result.error.message)
  }
  return kit.response.ok(result.data)
})

// ─── 支付：创建订单 ───
import { paymentEndpoints } from '@h-ai/payment/api'
import { payment } from '$lib/server/init'

export const POST = kit.fromContract(paymentEndpoints.createOrder, async (input, event) => {
  kit.guard.require(event.locals.session, 'payment:create')
  const result = await payment.order.create(input)
  if (!result.success) {
    return kit.response.internalError(result.error.message)
  }
  return kit.response.created(result.data)
})
```

## 常见模式

### 契约模式（推荐新项目使用）

1. 在模块的 `api/` 目录定义 `EndpointDef`（Zod schema）
2. 服务端用 `kit.fromContract(endpoint, handler)` 处理
3. 客户端用 `api.call(endpoint, input)` 调用
4. 入参/出参全链路类型安全 + 运行时校验

### CORS + Capacitor 配置

Capacitor 原生 App 的 WebView 发送的请求并非 CORS 同源，需要配置：

```typescript
cors: {
  origins: ['https://your-api.com'],
  capacitor: true,  // 自动添加 capacitor://* 和 ionic://* 等预设
}
```

### 双构建模式

```typescript
// svelte.config.js
import { createAdapter } from '@h-ai/kit/adapter'

const config = {
  kit: {
    adapter: createAdapter(),
    // VITE_ADAPTER=static → adapter-static (SPA)
    // VITE_ADAPTER=node   → adapter-node (SSR)
    // 默认 → adapter-node
  },
}
```

## 相关 Skills

- `hai-core`：全局配置、日志、HaiResult 基础能力
- `hai-iam`：Token 认证、角色权限模型
- `hai-api-client`：客户端契约调用（SPA / 原生 App 场景）
- `hai-crypto`：传输加密与密钥管理能力
- `hai-capacitor`：原生 App CORS 场景

---

## 浏览器侧使用

### 创建统一 API 客户端 — `kit.client`

> **所有浏览器端 API 请求必须通过 `apiFetch`，禁止直接 `fetch()`。**

在 `src/lib/utils/api.ts` 中一次性创建，全应用共享：

```typescript
// src/lib/utils/api.ts
import { kit } from '@h-ai/kit'

const client = kit.client.create({
  auth: true, // 自动从 localStorage 注入 Bearer Token
})

export const { apiFetch } = client
```

如需传输加密，传入 crypto：

```typescript
import { crypto } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

if (typeof window !== 'undefined') {
  crypto.init() // 浏览器端初始化加密模块
}

const client = kit.client.create({
  transport: { crypto }, // 透明完成密钥交换 + 请求/响应体加解密
  auth: true,
})

export const { apiFetch } = client
```

`apiFetch` 自动处理：
- **CSRF**：写方法（POST/PUT/DELETE）自动读取 `hai_csrf` Cookie 并设置 `X-CSRF-Token`
- **Bearer Token**：自动从 localStorage 读取并注入 `Authorization` header
- **传输加密**：可选，首次写请求时自动密钥交换

使用示例：

```typescript
// ✅ 正确方式
import { apiFetch } from '$lib/utils/api'

const res = await apiFetch('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
})

// ❌ 禁止在组件中直接 fetch
// const res = await fetch('/api/users', { ... })
```

### Token 存储 — `kit.auth.createTokenStore`

```typescript
import { kit } from '@h-ai/kit'

// 创建 localStorage 存储（Web 端默认）
const tokenStore = kit.auth.createTokenStore('hai_access_token')
tokenStore.set(tokens.accessToken) // 登录后保存
tokenStore.get()                   // string | null
tokenStore.clear()                 // 登出时清除
```

### hooks.client.ts 标准配置 — `kit.auth.createHandleFetch`

```typescript
// src/hooks.client.ts
import { kit } from '@h-ai/kit'

// 自动为同源请求附加 Authorization: Bearer <token>
export const handleFetch = kit.auth.createHandleFetch()
```

### 选择指南：kit.client vs api-client

| 场景 | 推荐 | 原因 |
|------|------|------|
| SSR SvelteKit 应用（同源请求） | `kit.client.create().apiFetch` | 自动 CSRF、同源 Cookie 透传、传输加密 |
| SPA / 原生 App（跨域请求） | `api.init()` + `api.call()` | 完整 Token 管理、401 自动刷新 |
| 服务端 `+page.server.ts` | 直接调用模块 API | 无需 HTTP 自环 |
| 契约调用（类型安全） | `api.call(endpoint, input)` | EndpointDef 双向 Zod 校验 |
