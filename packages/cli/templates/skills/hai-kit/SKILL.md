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

Bearer Token 解析流程：

1. 检查 `Authorization: Bearer <token>` header
2. 若无 header，回退到 `event.cookies.get('hai_access_token')`（SSR 透传场景）
3. Token 经 `auth.verifyToken` 校验后挂载到 `event.locals.session`

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
    cookieEncryptionKey: process.env.HAI_COOKIE_KEY,
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

### 传输加密常见错误（i18n key）

| key                              | 含义                               |
| -------------------------------- | ---------------------------------- |
| `kit_transportClientIdRequired`  | 缺少 `X-Client-Id`（强制加密模式） |
| `kit_transportClientKeyNotFound` | 客户端密钥不存在或失效             |
| `kit_transportInvalidPayload`    | 加密载荷格式非法                   |
| `kit_transportDecryptFailed`     | 请求体解密失败                     |
| `kit_transportKeyExchangeFailed` | 密钥交换失败                       |

## API 契约范式（端到端类型安全）

> `kit.fromContract` 和 `api.call` 共同消费模块 `api/` 下的 `EndpointDef`，实现服务端↔客户端的全链路类型安全 + 运行时 Zod 校验。

### 契约架构

```
┌─────────────────────────────────────────────────────────────┐
│                    @h-ai/xx/api                             │
│  xx-api-schemas.ts  ←  Zod Schema（唯一真相源）            │
│  xx-api-contract.ts ←  xxEndpoints（method + path + schema）│
└─────────────┬──────────────────────────┬────────────────────┘
              │                          │
     ┌────────▼────────┐       ┌─────────▼─────────┐
     │  客户端（浏览器）│       │  服务端（SvelteKit）│
     │  api.call(ep, i) │       │  kit.fromContract  │
     │  @h-ai/api-client│       │  @h-ai/kit         │
     └────────┬────────┘       └─────────┬─────────┘
              │      HTTP（类型安全）     │
              └──────────────────────────┘
```

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

### 已有契约模块一览

| 模块       | 导入路径               | 端点对象             | 典型端点                        |
| ---------- | -------------------- | -------------------- | ------------------------------- |
| `storage`  | `@h-ai/storage/api`  | `storageEndpoints`   | presignUpload, listFiles, …     |
| `iam`      | `@h-ai/iam/api`      | `iamEndpoints`       | login, logout, currentUser, …   |
| `ai`       | `@h-ai/ai/api`       | `aiEndpoints`        | chat, chatStream, sendMessage   |
| `payment`  | `@h-ai/payment/api`  | `paymentEndpoints`   | createOrder, queryOrder, …      |

### 新模块接入契约

在模块 `src/api/` 下创建 Schema + Contract，并在 `package.json` 中声明 `"./api"` 子路径导出。

## 常见模式

### Bearer Token 认证流程

```
客户端 → Authorization: Bearer <accessToken> → kit.createHandle 解析
                                                  ↓
                                        auth.verifyToken(token) → locals.session
                                                  ↓
                                        protectedPaths 守卫检查 → 通过则继续
```

SSR 场景下，浏览器通过 `hai_access_token` httpOnly Cookie 透传 Token，Handle 自动回退读取。

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

- `hai-core`：全局配置、日志、Result 基础能力
- `hai-iam`：Token 认证、角色权限模型
- `hai-api-client`：客户端契约调用
- `hai-crypto`：传输加密与密钥管理能力
- `hai-capacitor`：原生 App CORS 场景
