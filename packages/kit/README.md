# @hai/kit - SvelteKit 集成

> hai-framework 与 SvelteKit 的服务端/客户端集成封装，提供 Handle Hook、中间件、路由守卫、API 响应工具、表单验证、模块集成（IAM/Storage/Cache/Crypto）和客户端 Store。

## 安装

```bash
pnpm add @hai/kit
```

**Peer dependencies**：`@sveltejs/kit ^2.50.1`、`svelte ^5.49.11`

## 导入路径

```typescript
// 主入口 — 包含所有服务端 + 客户端导出
import { authGuard, createHandle, ok, validateForm } from '@hai/kit'

// 客户端 Store（浏览器侧）
import { useSession, useUpload } from '@hai/kit/client'
import { createCacheHandle } from '@hai/kit/modules/cache'
import { verifyWebhookSignature } from '@hai/kit/modules/crypto'
// 模块化导入（按需拆分，减小 bundle）
import { createIamActions, createIamHandle } from '@hai/kit/modules/iam'

import { createStorageEndpoint } from '@hai/kit/modules/storage'
```

对应 `package.json` exports：

| 路径                       | 说明                |
| -------------------------- | ------------------- |
| `@hai/kit`                 | 全量入口            |
| `@hai/kit/modules/iam`     | IAM 集成            |
| `@hai/kit/modules/storage` | Storage 集成        |
| `@hai/kit/modules/cache`   | Cache 集成          |
| `@hai/kit/modules/crypto`  | Crypto 集成         |
| `@hai/kit/client`          | Svelte 客户端 Store |

## 快速上手

### 1. 创建 hooks.server.ts

```typescript
// src/hooks.server.ts
import { iam } from '$lib/server/iam'
import {
  authGuard,
  corsMiddleware,
  createHandle,
  createIamHandle,
  rateLimitMiddleware,
  sequence,
  setAllModulesLocale,
} from '@hai/kit'

// IAM Handle — 自动验证会话、注入 session/user 到 event.locals
const iamHandle = createIamHandle({
  iam,
  publicPaths: ['/login', '/register', '/api/health'],
  sessionCookieName: 'session',
  onUnauthenticated: () =>
    new Response(null, { status: 303, headers: { Location: '/login' } }),
})

// 通用 Handle — 中间件 + 守卫
const appHandle = createHandle({
  middleware: [
    corsMiddleware({ origin: ['https://example.com'], credentials: true }),
    rateLimitMiddleware({ windowMs: 60_000, maxRequests: 100 }),
  ],
  guards: [
    { guard: authGuard({ apiMode: true }), paths: ['/api/*'], exclude: ['/api/health'] },
  ],
})

// 组合多个 handle
export const handle = sequence(iamHandle, appHandle)
```

### 2. 创建 API 端点（验证 + 响应）

```typescript
import { badRequest, ok, unauthorized, validateForm, validationError } from '@hai/kit'
// src/routes/api/users/+server.ts
import { z } from 'zod'

const CreateUserSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
})

export async function POST(event) {
  if (!event.locals.session)
    return unauthorized()

  const { valid, data, errors } = await validateForm(event.request, CreateUserSchema)
  if (!valid)
    return validationError(errors)

  const user = await createUser(data!)
  return ok(user)
}
```

### 3. 客户端 Store（Svelte 组件）

```svelte
<script>
  import { useSession, useUpload, useIsAuthenticated } from '@hai/kit/client'

  const session = useSession({ fetchUrl: '/api/session', refreshInterval: 300 })
  const upload  = useUpload({ uploadUrl: '/api/storage', maxConcurrent: 3 })
  const isAuth  = useIsAuthenticated(session)
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
import { badRequest, conflict, created, error, forbidden, internalError, noContent, notFound, ok, redirect, unauthorized, validationError } from '@hai/kit'

ok({ id: '1' }) // 200 { success: true, data: { id: '1' } }
created({ id: '1' }) // 201
noContent() // 204
badRequest('invalid input') // 400
unauthorized() // 401
forbidden() // 403
notFound() // 404
conflict('duplicate') // 409
validationError([{ field: 'email', message: 'invalid' }]) // 422
internalError() // 500
redirect('/login', 303) // 303 Location: /login
error('CUSTOM', 'msg', 418) // 自定义状态码
```

### 表单验证

基于 Zod Schema 的请求数据验证。

```typescript
import { validateForm, validateParams, validateQuery } from '@hai/kit'

// 验证请求体（JSON / FormData）
const { valid, data, errors } = await validateForm(request, schema)

// 验证 URL 查询参数
const { valid, data, errors } = validateQuery(url, schema)

// 验证路由参数
const { valid, data, errors } = validateParams(params, schema)
```

### 路由守卫

```typescript
import {
  allGuards,
  anyGuard,
  authGuard,
  conditionalGuard,
  notGuard,
  permissionGuard,
  roleGuard,
} from '@hai/kit'

// 认证守卫
authGuard({ loginUrl: '/login', apiMode: false })

// 角色守卫（默认 OR 逻辑，requireAll: true 切换为 AND）
roleGuard({ roles: ['admin', 'editor'], requireAll: false })

// 权限守卫（支持通配符：admin:* 匹配 admin:read 等）
permissionGuard({ permissions: ['posts:write'], apiMode: true })

// 组合守卫
allGuards(authGuard(), roleGuard({ roles: ['admin'] })) // AND
anyGuard(roleGuard({ roles: ['admin'] }), permissionGuard({ permissions: ['posts:*'] })) // OR
notGuard(authGuard(), { redirect: '/dashboard' }) // 取反
conditionalGuard(event => event.url.pathname.startsWith('/admin'), roleGuard({ roles: ['admin'] }))
```

在 `createHandle` 中使用守卫：

```typescript
createHandle({
  guards: [
    { guard: authGuard({ apiMode: true }), paths: ['/api/*'], exclude: ['/api/health'] },
    { guard: roleGuard({ roles: ['admin'] }), paths: ['/admin/**'] },
  ],
})
```

### 中间件

```typescript
import { corsMiddleware, csrfMiddleware, loggingMiddleware, rateLimitMiddleware } from '@hai/kit'

createHandle({
  middleware: [
    corsMiddleware({ origin: ['https://example.com'], credentials: true, maxAge: 86400 }),
    csrfMiddleware({ cookieName: 'hai_csrf', headerName: 'X-CSRF-Token', exclude: ['/api/webhook/*'] }),
    loggingMiddleware({ logBody: true, redactFields: ['password', 'token'] }),
    rateLimitMiddleware({ windowMs: 60_000, maxRequests: 100 }),
  ],
})
```

### IAM 集成

```typescript
// src/hooks.server.ts
import { iam } from '$lib/server/iam'
import { createIamHandle, sequence } from '@hai/kit'

const iamHandle = createIamHandle({
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
import { createIamActions } from '@hai/kit'

export const actions = createIamActions({
  iam,
  loginRedirect: '/dashboard',
  logoutRedirect: '/login',
  onLoginSuccess: async ({ user }) => { /* ... */ },
})
```

### Cache 集成

```typescript
import { cache } from '$lib/server/cache'
import { createCacheHandle, createCacheUtils, sequence } from '@hai/kit'

const cacheHandle = createCacheHandle({
  cache,
  routes: {
    '/api/products': { ttl: 300, staleWhileRevalidate: 60 },
    '/api/categories/*': { ttl: 600 },
  },
})

export const handle = sequence(iamHandle, cacheHandle)

// 缓存工具
const cacheUtils = createCacheUtils({ cache })
```

### Storage 集成

```typescript
// src/routes/api/storage/[...path]/+server.ts
import { storage } from '$lib/server/storage'
import { createStorageEndpoint } from '@hai/kit'

const endpoint = createStorageEndpoint({
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
import { createCsrfManager, createEncryptedCookie, verifyWebhookSignature } from '@hai/kit'

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
const csrf = createCsrfManager({ crypto, cookieName: 'csrf' })

// 加密 Cookie
const secureCookie = createEncryptedCookie({ crypto, encryptionKey: 'key-32-bytes' })
```

### i18n 集成

`setAllModulesLocale` 一次调用同步所有 hai 模块的语言，内部通过 `@hai/core` 的 `setGlobalLocale` 实现。

```typescript
// src/hooks.server.ts
import { setAllModulesLocale } from '@hai/kit'

export async function handle({ event, resolve }) {
  const locale = event.cookies.get('PARAGLIDE_LOCALE') ?? 'zh-CN'
  setAllModulesLocale(locale)
  return resolve(event)
}
```
