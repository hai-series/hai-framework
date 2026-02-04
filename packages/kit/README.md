# @hai/kit - SvelteKit 集成

> SvelteKit 与 hai-framework 各模块的集成封装

## 安装

```bash
pnpm add @hai/kit
```

## 功能模块

### 服务端模块

#### IAM 集成

```typescript
import { iam } from '$lib/server/iam'
// src/hooks.server.ts
import { createIamHandle, sequence } from '@hai/kit'

const iamHandle = createIamHandle({
  iam,
  publicPaths: ['/login', '/register', '/api/health'],
  sessionCookieName: 'session',
  onUnauthenticated: (event) => {
    return new Response(null, {
      status: 303,
      headers: { Location: '/login' }
    })
  }
})

export const handle = iamHandle
```

```typescript
import { iam } from '$lib/server/iam'
// src/routes/login/+page.server.ts
import { createIamActions } from '@hai/kit'

export const actions = createIamActions({
  iam,
  loginRedirect: '/dashboard',
  logoutRedirect: '/login',
  onLoginSuccess: async ({ user }) => {
    console.log('User logged in:', user.username)
  }
})
```

#### Storage 集成

```typescript
import { storage } from '$lib/server/storage'
// src/routes/api/storage/[...path]/+server.ts
import { createStorageEndpoint } from '@hai/kit'

const endpoint = createStorageEndpoint({
  storage,
  bucket: 'uploads',
  allowedTypes: ['image/*', 'application/pdf'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  requireAuth: true,
})

export const GET = endpoint.get
export const POST = endpoint.post
export const DELETE = endpoint.delete
```

#### Cache 集成

```typescript
import { cache } from '$lib/server/cache'
// src/hooks.server.ts
import { createCacheHandle, sequence } from '@hai/kit'

const cacheHandle = createCacheHandle({
  cache,
  routes: {
    '/api/products': { ttl: 300, staleWhileRevalidate: 60 },
    '/api/categories/*': { ttl: 600 },
  }
})

export const handle = sequence(iamHandle, cacheHandle)
```

#### Crypto 集成

```typescript
import { crypto } from '$lib/server/crypto'
// src/routes/api/webhook/+server.ts
import { verifyWebhookSignature } from '@hai/kit'

export async function POST(event) {
  const isValid = await verifyWebhookSignature({
    crypto,
    event,
    secretKey: 'webhook_secret',
    signatureHeader: 'X-Signature',
  })

  if (!isValid) {
    return new Response('Invalid signature', { status: 401 })
  }

  // 处理 webhook
}
```

### 客户端 Store

```svelte
<script>
  import { useSession, useUpload, useIsAuthenticated } from '@hai/kit/client'

  const session = useSession({
    fetchUrl: '/api/session',
    refreshInterval: 300, // 5 分钟刷新
  })

  const upload = useUpload({
    uploadUrl: '/api/storage',
    maxConcurrent: 3,
    onComplete: (fileId, result) => {
      console.log('上传完成:', result)
    }
  })

  const isAuth = useIsAuthenticated(session)
</script>

{#if $session.loading}
  <p>加载中...</p>
{:else if $session.user}
  <p>欢迎, {$session.user.username}</p>
  <button onclick={() => session.logout()}>登出</button>
{:else}
  <a href="/login">登录</a>
{/if}

<input
  type="file"
  multiple
  onchange={(e) => upload.addFiles(Array.from(e.target.files))}
/>

{#each $upload.files as file (file.id)}
  <div>
    {file.file.name} - {file.progress}%
    {#if file.status === 'error'}
      <button onclick={() => upload.retryFile(file.id)}>重试</button>
    {/if}
  </div>
{/each}
```

### i18n 集成

`setAllModulesLocale` 用于在 SvelteKit 应用中统一设置所有 hai 模块的语言。

```typescript
// src/hooks.server.ts
import { setAllModulesLocale } from '@hai/kit'

export async function handle({ event, resolve }) {
  // 从 cookie 或其他来源获取 locale
  const locale = event.cookies.get('PARAGLIDE_LOCALE') ?? 'zh-CN'

  // 一次调用同步所有模块（IAM、DB、Cache 等）
  setAllModulesLocale(locale)

  return resolve(event)
}
```

该函数内部调用 `@hai/core` 的 `setGlobalLocale`，所有通过 `createMessageGetter` 创建的消息获取器会读取全局 locale。

## API 参考

### IAM

| 函数                | 描述                       |
| ------------------- | -------------------------- |
| `createIamHandle`   | 创建认证 Handle Hook       |
| `createIamActions`  | 创建登录/注册 Form Actions |
| `requireAuth`       | API 路由认证守卫           |
| `requireRole`       | 角色权限守卫               |
| `requirePermission` | 权限守卫                   |

### Storage

| 函数                    | 描述                       |
| ----------------------- | -------------------------- |
| `createStorageEndpoint` | 创建文件上传/下载 API 端点 |

### Cache

| 函数                | 描述                       |
| ------------------- | -------------------------- |
| `createCacheHandle` | 创建响应缓存 Handle        |
| `createCacheUtils`  | 创建缓存工具（清除、预热） |

### Crypto

| 函数                     | 描述                   |
| ------------------------ | ---------------------- |
| `verifyWebhookSignature` | 验证 Webhook 签名      |
| `signRequest`            | 生成请求签名           |
| `createCsrfManager`      | 创建 CSRF Token 管理器 |
| `createEncryptedCookie`  | 创建加密 Cookie 管理器 |

### Client Stores

| 函数                 | 描述               |
| -------------------- | ------------------ |
| `useSession`         | 会话状态管理       |
| `useUpload`          | 文件上传状态管理   |
| `useIsAuthenticated` | 认证状态派生 store |
| `useUser`            | 用户信息派生 store |

## 导入路径

```typescript
// 主入口 - 包含所有功能
import { createIamHandle, useSession } from '@hai/kit'

import { useSession, useUpload } from '@hai/kit/client'
import { createCacheHandle } from '@hai/kit/modules/cache'
import { verifyWebhookSignature } from '@hai/kit/modules/crypto'
// 模块化导入
import { createIamActions, createIamHandle } from '@hai/kit/modules/iam'
import { createStorageEndpoint } from '@hai/kit/modules/storage'
```
