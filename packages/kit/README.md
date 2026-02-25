# @hai/kit - SvelteKit 集成

> hai-framework 与 SvelteKit 的服务端/客户端集成封装，提供 Handle Hook、中间件、路由守卫、API 响应工具、表单验证、模块集成（IAM/Storage/Cache/Crypto）和客户端 Store。

## 安装

```bash
pnpm add @hai/kit
```

**Peer dependencies**：`@sveltejs/kit ^2.50.1`、`svelte ^5.49.11`

## 导入方式

所有功能通过 `kit` 对象统一访问：

```typescript
import { kit } from '@hai/kit'

kit.createHandle({ /* config */ })
kit.guard.auth({ loginUrl: '/login' })
kit.response.ok(data)
await kit.validate.form(request, schema)
```

## 快速上手

### 1. 创建 hooks.server.ts

```typescript
// src/hooks.server.ts
import { iam } from '$lib/server/iam'
import { kit } from '@hai/kit'

// IAM Handle — 自动验证会话、注入 session/user 到 event.locals
const iamHandle = kit.iam.createHandle({
  iam,
  publicPaths: ['/login', '/register', '/api/health'],
  sessionCookieName: 'session',
  onUnauthenticated: () =>
    new Response(null, { status: 303, headers: { Location: '/login' } }),
})

// 通用 Handle — 中间件 + 守卫
const appHandle = kit.createHandle({
  middleware: [
    kit.middleware.cors({ origin: ['https://example.com'], credentials: true }),
    kit.middleware.rateLimit({ windowMs: 60_000, maxRequests: 100 }),
  ],
  guards: [
    { guard: kit.guard.auth({ apiMode: true }), paths: ['/api/*'], exclude: ['/api/health'] },
  ],
})

// 组合多个 handle
export const handle = kit.sequence(iamHandle, appHandle)
```

### 2. 创建 API 端点（验证 + 响应）

```typescript
// src/routes/api/users/+server.ts
import { kit } from '@hai/kit'
import { z } from 'zod'

const CreateUserSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
})

export async function POST(event) {
  if (!event.locals.session)
    return kit.response.unauthorized()

  const { valid, data, errors } = await kit.validate.form(event.request, CreateUserSchema)
  if (!valid)
    return kit.response.validationError(errors)

  const user = await createUser(data!)
  return kit.response.ok(user)
}
```

### 3. 客户端 Store（Svelte 组件）

```svelte
<script>
  import { kit } from '@hai/kit'

  const session = kit.client.useSession({ fetchUrl: '/api/session', refreshInterval: 300 })
  const upload  = kit.client.useUpload({ uploadUrl: '/api/storage', maxConcurrent: 3 })
  const isAuth  = kit.client.useIsAuthenticated(session)
</script>

{#if $session.loading}
  <p>加载中...</p>
{:else if $session.user}
  <p>欢迎, {$session.user.username}</p>
  <button onclick={() => session.logout()}>登出</button>
{:else}
  <a href="/login">登录</a>
{/if}

<input type="file" multiple onchange={(e) => upload.addFiles(Array.from(e.target.files))} />

{#each $upload.files as file (file.id)}
  <div>
    {file.file.name} — {file.progress}%
    {#if file.status === 'error'}
      <button onclick={() => upload.retryFile(file.id)}>重试</button>
    {/if}
  </div>
{/each}
```

## 功能模块

### 响应工具

标准化 JSON 响应，返回统一的 `ApiResponse` 格式。

```typescript
import { kit } from '@hai/kit'

kit.response.ok({ id: '1' }) // 200
kit.response.created({ id: '1' }) // 201
kit.response.noContent() // 204
kit.response.badRequest('invalid input') // 400
kit.response.unauthorized() // 401
kit.response.forbidden() // 403
kit.response.notFound() // 404
kit.response.conflict('duplicate') // 409
kit.response.validationError([{ field: 'email', message: 'invalid' }]) // 422
kit.response.internalError() // 500
kit.response.redirect('/login', 303) // 303
kit.response.error('CUSTOM', 'msg', 418) // 自定义状态码
```

### 表单验证

基于 Zod Schema 的请求数据验证。

```typescript
import { kit } from '@hai/kit'

// 验证请求体（JSON / FormData）
const { valid, data, errors } = await kit.validate.form(request, schema)

// 验证 URL 查询参数
const { valid, data, errors } = kit.validate.query(url, schema)

// 验证路由参数
const { valid, data, errors } = kit.validate.params(params, schema)
```

### 路由守卫

```typescript
import { kit } from '@hai/kit'

// 认证守卫
kit.guard.auth({ loginUrl: '/login', apiMode: false })

// 角色守卫（默认 OR 逻辑，requireAll: true 切换为 AND）
kit.guard.role({ roles: ['admin', 'editor'], requireAll: false })

// 权限守卫（支持通配符：admin:* 匹配 admin:read 等）
kit.guard.permission({ permissions: ['posts:write'], apiMode: true })

// 组合守卫
kit.guard.all(kit.guard.auth(), kit.guard.role({ roles: ['admin'] })) // AND
kit.guard.any(kit.guard.role({ roles: ['admin'] }), kit.guard.permission({ permissions: ['posts:*'] })) // OR
kit.guard.not(kit.guard.auth(), { redirect: '/dashboard' }) // 取反
kit.guard.conditional(event => event.url.pathname.startsWith('/admin'), kit.guard.role({ roles: ['admin'] }))
```

在 `createHandle` 中使用守卫：

```typescript
kit.createHandle({
  guards: [
    { guard: kit.guard.auth({ apiMode: true }), paths: ['/api/*'], exclude: ['/api/health'] },
    { guard: kit.guard.role({ roles: ['admin'] }), paths: ['/admin/**'] },
  ],
})
```

### 中间件

```typescript
import { kit } from '@hai/kit'

kit.createHandle({
  middleware: [
    kit.middleware.cors({ origin: ['https://example.com'], credentials: true, maxAge: 86400 }),
    kit.middleware.csrf({ cookieName: 'hai_csrf', headerName: 'X-CSRF-Token', exclude: ['/api/webhook/*'] }),
    kit.middleware.logging({ logBody: true, redactFields: ['password', 'token'] }),
    kit.middleware.rateLimit({ windowMs: 60_000, maxRequests: 100 }),
  ],
})
```

### IAM 集成

```typescript
// src/hooks.server.ts
import { iam } from '$lib/server/iam'
import { kit } from '@hai/kit'

const iamHandle = kit.iam.createHandle({
  iam,
  publicPaths: ['/login', '/register', '/api/health'],
  sessionCookieName: 'session',
  onUnauthenticated: event =>
    new Response(null, { status: 303, headers: { Location: '/login' } }),
})

export const handle = iamHandle
```

```typescript
// src/routes/login/+page.server.ts
import { iam } from '$lib/server/iam'
import { kit } from '@hai/kit'

export const actions = kit.iam.createActions({
  iam,
  loginRedirect: '/dashboard',
  logoutRedirect: '/login',
  onLoginSuccess: async ({ user }) => { /* ... */ },
})
```

### Cache 集成

```typescript
import { cache } from '$lib/server/cache'
import { kit } from '@hai/kit'

const cacheHandle = kit.cache.createHandle({
  cache,
  routes: {
    '/api/products': { ttl: 300, staleWhileRevalidate: 60 },
    '/api/categories/*': { ttl: 600 },
  },
})

export const handle = kit.sequence(iamHandle, cacheHandle)

// 缓存工具
const cacheUtils = kit.cache.createUtils({ cache })
```

### Storage 集成

```typescript
// src/routes/api/storage/[...path]/+server.ts
import { storage } from '$lib/server/storage'
import { kit } from '@hai/kit'

const endpoint = kit.storage.createEndpoint({
  storage,
  bucket: 'uploads',
  allowedTypes: ['image/*', 'application/pdf'],
  maxFileSize: 10 * 1024 * 1024,
  requireAuth: true,
})

export const GET = endpoint.get
export const POST = endpoint.post
export const DELETE = endpoint.delete
```

### Crypto 集成

```typescript
// src/routes/api/webhook/+server.ts
import { crypto } from '$lib/server/crypto'
import { kit } from '@hai/kit'

// Webhook 签名验证
export async function POST(event) {
  const isValid = await verifyWebhookSignature({
    crypto,
    event,
    secretKey: 'webhook_secret',
    signatureHeader: 'X-Signature',
  })
  if (!isValid)
    return new Response('Invalid signature', { status: 401 })
  // 处理 webhook ...
}

// CSRF Token 管理
const csrf = kit.crypto.createCsrfManager({ crypto, cookieName: 'csrf' })

// 加密 Cookie
const secureCookie = kit.crypto.createEncryptedCookie({ crypto, encryptionKey: 'key-32-bytes' })
```

### i18n 集成

`kit.setAllModulesLocale` 一次调用同步所有 hai 模块的语言，内部通过 `@hai/core` 的 `setGlobalLocale` 实现。

```typescript
// src/hooks.server.ts
import { kit } from '@hai/kit'

export async function handle({ event, resolve }) {
  const locale = event.cookies.get('PARAGLIDE_LOCALE') ?? 'zh-CN'
  kit.setAllModulesLocale(locale)
  return resolve(event)
}
```
