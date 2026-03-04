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
- `kit.guard.*` / `kit.middleware.*`
- `kit.handler` / `kit.response` / `kit.validate`
- `kit.fromContract(endpoint, fn)` — 契约到 SvelteKit handler
- Bearer Token / `Authorization` header
- CORS 配置（含 Capacitor Origin 预设）
- 传输加密（key exchange / `X-Client-Id`）

> **重要变更**：Cookie Session 和 CSRF 中间件已移除。统一使用 Bearer Token 认证。

## 使用步骤

### 1) 在 `hooks.server.ts` 搭建请求管道

```typescript
import { kit } from '@h-ai/kit'

export const handle = kit.createHandle({
  validateSession: async token => token
    ? { userId: 'u_1', roles: ['admin'], permissions: ['user:read'] }
    : null,
  guards: [
    { guard: kit.guard.auth({ apiMode: true }), paths: ['/api/*'] },
  ],
  middleware: [
    kit.middleware.logging(),
    kit.middleware.rateLimit({ windowMs: 60_000, maxRequests: 100 }),
  ],
  cors: {
    origins: ['https://example.com'],
    capacitor: true, // 自动添加 capacitor://localhost 等原生 App Origin
  },
})
```

Bearer Token 解析流程：

1. 检查 `Authorization: Bearer <token>` header
2. 若无 header，回退到 `event.cookies.get('hai_token')`（SSR 透传场景）
3. Token 经 `validateSession` 校验后挂载到 `event.locals.session`

### 2) API 端点使用 `kit.handler`

```typescript
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const CreateSchema = z.object({ name: z.string().min(1) })

export const POST = kit.handler(async ({ request, locals }) => {
  kit.guard.requirePermission(locals.session, 'user:create')
  const data = await kit.validate.formOrFail(request, CreateSchema)
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
| `kit.guard.*`               | 认证/角色/权限守卫     | 支持 `all/any/not/conditional`                |
| `kit.middleware.*`          | cors/logging/rateLimit | 建议在 `createHandle` 中统一编排              |
| `kit.response.*`            | 标准化响应             | 统一 `{ success, data?, error?, requestId? }` |
| `kit.validate.*`            | 表单/查询/参数校验     | `OrFail` 变体会抛出 `Response`                |
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

## 常见模式

### Bearer Token 认证流程

```
客户端 → Authorization: Bearer <accessToken> → kit.createHandle 解析
                                                  ↓
                                        validateSession(token) → locals.session
                                                  ↓
                                        guard.auth 检查 → 通过则继续
```

SSR 场景下，浏览器通过 `hai_token` httpOnly Cookie 透传 Token，Handle 自动回退读取。

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
