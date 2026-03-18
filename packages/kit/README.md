# @h-ai/kit

`@h-ai/kit` 是 hai-framework 的 SvelteKit 集成模块，提供统一的请求管道与 API 工具：

- `kit.createHandle()`：会话解析、路由守卫、中间件链、可选传输加密与 Cookie 加密
- `kit.handler()`：API 端点异常边界
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`

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

### 搭建请求管道

```typescript
import { kit } from '@h-ai/kit'

export const handle = kit.createHandle({
  auth: {
    verifyToken: async (token) => {
      // 返回 SessionData 或 null
      return token ? { userId: 'u_1', roles: ['admin'], permissions: ['user:read'] } : null
    },
    loginUrl: '/auth/login',
    protectedPaths: ['/admin/*', '/api/*'],
    publicPaths: ['/api/auth/*', '/api/public/*'],
  },
  rateLimit: { windowMs: 60_000, maxRequests: 100 },
  logging: true,
})
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

### 浏览器客户端（可选）

```typescript
import { createKitClient } from '@h-ai/kit/client'

const client = createKitClient()
const response = await client.apiFetch('/api/users', { method: 'GET' })
```

> CSRF Header 注入由 `createKitClient()` 在浏览器端自动处理；`@h-ai/kit` 不提供独立的 CSRF 中间件工厂。

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
