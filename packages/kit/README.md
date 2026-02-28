# @h-ai/kit

> hai-framework 与 SvelteKit 的服务端/客户端集成封装，提供 Handle Hook、中间件、路由守卫、API Handler（自动错误边界）、响应工具、请求验证、会话管理和透明加密。

## 安装

```bash
pnpm add @h-ai/kit
```

**Peer dependencies**：`@sveltejs/kit`、`svelte`

## 导入方式

所有功能通过 `kit` 对象统一访问：

```typescript
import { kit } from '@h-ai/kit'

kit.createHandle({ /* config */ })
kit.guard.auth({ loginUrl: '/login' })
kit.response.ok(data)
await kit.validate.form(request, schema)
```

| 命名空间             | 说明                                         |
| -------------------- | -------------------------------------------- |
| `kit.createHandle()` | 创建 SvelteKit Handle Hook（含透明加密）     |
| `kit.sequence()`     | 组合多个 Handle                              |
| `kit.handler()`      | API Handler 包装器（自动错误边界）           |
| `kit.guard`          | 路由守卫（auth / role / permission / 组合）  |
| `kit.middleware`     | 中间件（cors / csrf / logging / rateLimit）  |
| `kit.response`       | API 标准响应（ok / error / unauthorized 等） |
| `kit.validate`       | 请求验证（form / query / params）            |
| `kit.session`        | 会话 Cookie 管理                             |
| `kit.client`         | 客户端工具（CSRF + 传输加密）                |
| `kit.i18n`           | 国际化（setLocale）                          |

## 快速上手

### 1. 创建 hooks.server.ts

```typescript
import { crypto } from '@h-ai/crypto'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

const haiHandle = kit.createHandle({
  sessionCookieName: 'hai_session',
  validateSession: async (token) => {
    const result = await iam.user.getCurrentUser(token)
    return result.success ? { userId: result.data.id, roles: [], permissions: [] } : null
  },
  middleware: [
    kit.middleware.logging({ logBody: false }),
    kit.middleware.rateLimit({ windowMs: 60_000, maxRequests: 100 }),
    kit.middleware.csrf({ exclude: ['/api/auth/*', '/api/public/*'] }),
  ],
  guards: [
    { guard: kit.guard.auth({ apiMode: true }), paths: ['/api/*'], exclude: ['/api/auth/*'] },
  ],
  // 透明加密（可选）
  crypto: {
    crypto,
    transport: true,
    encryptedCookies: ['hai_session'],
    cookieEncryptionKey: process.env.HAI_COOKIE_KEY ?? '',
  },
})

export const handle = kit.sequence(i18nHandle, haiHandle)
```

### 2. 编写 API 端点

```typescript
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const CreateUserSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
})

export const POST = kit.handler(async ({ request, locals }) => {
  kit.guard.requirePermission(locals.session, 'user:create')
  const data = await kit.validate.formOrFail(request, CreateUserSchema)
  const user = await createUser(data)
  return kit.response.created(user)
})

export const GET = kit.handler(async ({ locals, url }) => {
  kit.guard.requirePermission(locals.session, 'user:read')
  const query = kit.validate.queryOrFail(url, ListSchema)
  return kit.response.ok(await fetchUsers(query))
})
```

### 3. 客户端 API 请求

```typescript
import { crypto } from '@h-ai/crypto'
import { createKitClient } from '@h-ai/kit/client'

// 启用传输加密 + CSRF
const client = createKitClient({ transport: { crypto } })
export const { apiFetch } = client

// 业务代码
const response = await apiFetch('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', email: 'admin@example.com' }),
})
```

### 4. i18n 设置

```typescript
import { kit } from '@h-ai/kit'

const locale = event.cookies.get('PARAGLIDE_LOCALE') ?? 'zh-CN'
kit.i18n.setLocale(locale)
```

## 常见模式

### API 端点标准模式

`kit.handler()` 自动处理：

- SvelteKit 控制流（`Response` / `redirect` / `error`）→ re-throw
- 业务异常 → 日志记录 + `500 InternalError` 响应

### 透明加密

加密能力已内置于 `createHandle`（服务端）与 `createKitClient`（客户端），业务代码无需直接操作底层 crypto API：

- **Cookie 加密**：`createHandle({ crypto: { encryptedCookies: ['hai_session'] } })`
- **传输加密**：`createHandle({ crypto: { transport: true } })` + `createKitClient({ transport: { crypto } })`
- **CSRF 保护**：`kit.middleware.csrf()` + `createKitClient()` 自动附加 Token

## 测试

```bash
pnpm --filter @h-ai/kit test
```

## 相关模块

- `@h-ai/core`：配置、日志、Result 基础能力
- `@h-ai/crypto`：SM2/SM4 加密能力（透明加密所需）
- `@h-ai/iam`：认证/授权/RBAC

## License

Apache-2.0
