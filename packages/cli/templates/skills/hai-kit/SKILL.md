---
name: hai-kit
description: 使用 @h-ai/kit 构建 SvelteKit 请求管道与 API 安全边界（handle/guard/middleware/handler/validate/response/client）。当需求涉及 hooks.server.ts、权限守卫、CSRF、限流、统一响应或传输加密时使用。
---

# hai-kit

`@h-ai/kit` 是 hai-framework 的 SvelteKit 集成层。它把请求处理中的“通用横切能力”收敛到统一命名空间 `kit`：

- 请求入口：`createHandle` / `sequence`
- 安全边界：`guard` / `middleware`
- API 工具：`handler` / `response` / `validate`
- 会话与客户端：`session` / `client`

## 模块概述

当任务涉及以下关键词时，优先使用本 Skill：

- `hooks.server.ts`
- `kit.createHandle` / `kit.sequence`
- `kit.guard.*` / `kit.middleware.*`
- `kit.handler` / `kit.response` / `kit.validate`
- `kit.client.create`（浏览器端统一请求）
- 传输加密（key exchange / `X-Client-Id`）

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
    kit.middleware.csrf({ exclude: ['/api/public/*'] }),
    kit.middleware.rateLimit({ windowMs: 60_000, maxRequests: 100 }),
  ],
})
```

### 2) API 端点统一使用 `kit.handler`

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

### 3) 浏览器侧使用统一客户端

```typescript
import { kit } from '@h-ai/kit'

const client = kit.client.create()
const res = await client.apiFetch('/api/users', { method: 'GET' })
```

### 4) 需要传输加密时启用 `crypto` 配置

```typescript
import { crypto } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

export const handle = kit.createHandle({
  crypto: {
    crypto,
    transport: true,
    encryptedCookies: ['hai_session'],
    cookieEncryptionKey: process.env.HAI_COOKIE_KEY,
  },
})
```

## 核心 API

| API                          | 用途                        | 关键点                                        |
| ---------------------------- | --------------------------- | --------------------------------------------- |
| `kit.createHandle(config?)`  | 创建 SvelteKit Handle       | 会话解析、守卫、中间件、可选加密              |
| `kit.sequence(...handles)`   | 组合多个 Handle             | 洋葱模型顺序执行                              |
| `kit.handler(fn)`            | 包装 API 处理函数           | 非控制流异常统一转 500                        |
| `kit.guard.*`                | 认证/角色/权限守卫          | 支持 `all/any/not/conditional`                |
| `kit.middleware.*`           | cors/csrf/logging/rateLimit | 建议在 `createHandle` 中统一编排              |
| `kit.response.*`             | 标准化响应                  | 统一 `{ success, data?, error?, requestId? }` |
| `kit.validate.*`             | 表单/查询/参数校验          | `OrFail` 变体会抛出 `Response`                |
| `kit.client.create(config?)` | 浏览器统一请求客户端        | 自动附加 CSRF，支持传输加解密                 |

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

- 页面路由与 API 路由分离守卫（页面重定向 + API JSON 401/403）
- `kit.validate.*OrFail + kit.handler` 组合，减少模板化错误处理代码
- `rateLimit + csrf + logging` 作为基础中间件三件套
- 逐步开启传输加密：先 `requireEncryption: false`，稳定后切换 `true`

## 相关 Skills

- `hai-core`：全局配置、日志、Result 基础能力
- `hai-iam`：会话验证、角色权限模型
- `hai-crypto`：传输加密与密钥管理能力
