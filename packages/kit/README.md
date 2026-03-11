# @h-ai/kit

`@h-ai/kit` 是 hai-framework 的 SvelteKit 集成模块，提供统一的请求管道与 API 工具：

- `kit.createHandle()`：会话解析、路由守卫、中间件链、可选传输加密与 Cookie 加密
- `kit.handler()`：API 端点异常边界
- `kit.guard` / `kit.middleware` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client`

## 支持的能力

- Handle Hook 组合（`createHandle` / `sequence`）
- 认证/角色/权限守卫及组合守卫
- CORS / Logging / RateLimit 中间件
- 统一 API 响应与请求验证（Zod）
- Bearer Token 工具
- 浏览器端统一客户端（自动 CSRF，支持传输加密）

## 快速开始

### Node.js 服务端

```typescript
import { kit } from '@h-ai/kit'

export const handle = kit.createHandle({
  validateSession: async (token) => {
    // 返回 SessionData 或 null
    return token ? { userId: 'u_1', roles: ['admin'], permissions: ['user:read'] } : null
  },
  guards: [
    { guard: kit.guard.auth({ apiMode: true }), paths: ['/api/*'] },
  ],
  middleware: [
    kit.middleware.logging(),
    kit.middleware.rateLimit({ windowMs: 60_000, maxRequests: 100 }),
  ],
})
```

```typescript
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

export const POST = kit.handler(async ({ request, locals }) => {
  kit.guard.requirePermission(locals.session, 'user:create')
  const payload = await kit.validate.formOrFail(request, CreateUserSchema)
  return kit.response.created(payload)
})
```

### 浏览器客户端（可选）

```typescript
import { createKitClient } from '@h-ai/kit/client'

const client = createKitClient()
const response = await client.apiFetch('/api/users', { method: 'GET' })
```

启用传输加密时：

```typescript
import { crypto } from '@h-ai/crypto'
import { createKitClient } from '@h-ai/kit/client'

const client = createKitClient({ transport: { crypto } })
```

> CSRF Header 注入由 `createKitClient()` 在浏览器端自动处理；`@h-ai/kit` 不提供独立的 CSRF 中间件工厂。

## 配置

`kit.createHandle()` 常用配置项：

- `validateSession(token)`：会话解析函数
- `guards`：路由守卫列表
- `middleware`：中间件列表
- `logging`：是否输出请求生命周期日志（默认 `false`）
- `crypto`：加密配置（传输加密 + Cookie 加密）

若使用 Cookie 加密，需提供 `crypto.cookieEncryptionKey`，或通过环境变量 `HAI_COOKIE_KEY` 提供密钥。

## 错误处理

- 推荐使用 `kit.handler()` 包装 API 端点。
- `kit.validate.*OrFail` 与 `kit.guard.requirePermission` 会抛出 `Response`（SvelteKit 控制流）。
- 非控制流异常会由 `kit.handler()` 统一转换为 `500 INTERNAL_ERROR` 响应。

## 测试

```bash
pnpm --filter @h-ai/kit test
```

## License

Apache-2.0
