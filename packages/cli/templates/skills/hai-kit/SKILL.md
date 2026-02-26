---
name: hai-kit
description: 使用 @h-ai/kit 进行 SvelteKit 服务端集成，包括 Handle Hook、路由守卫、中间件、API 响应工具、表单验证、模块集成（IAM/Cache/Storage/Crypto）与客户端 Store；当需求涉及 hooks.server.ts、请求管道、guard、middleware、kit.response、kit.validate 或客户端会话管理时使用。
---

# hai-kit

> `@h-ai/kit` 是 hai-framework 的 SvelteKit 集成层，提供 Handle Hook、路由守卫、中间件链、API 响应构建、表单验证和模块集成（IAM/Cache/Storage/Crypto），以及客户端 Store（会话/上传/传输加密）。

---

## 适用场景

- 配置 `hooks.server.ts` 请求管道（Handle/Guard/Middleware）
- 实现认证/授权守卫（登录检查、角色/权限控制）
- 使用 CORS、CSRF、限流等中间件
- 构建标准化 API 响应
- 表单/查询参数/路由参数验证
- 集成 IAM/Cache/Storage/Crypto 模块到 SvelteKit
- 客户端会话管理与文件上传

---

## 使用步骤

### 1. 配置 hooks.server.ts

```typescript
import { initModules } from '$lib/server/init'
import { kit } from '@h-ai/kit'

await initModules()

const appHandle = kit.createHandle({
  guards: [
    {
      guard: kit.guard.auth({ loginUrl: '/login' }),
      paths: ['/admin/**', '/api/**'],
      exclude: ['/api/public/**'],
    },
  ],
  middleware: [
    kit.middleware.cors({ origin: '*' }),
    kit.middleware.logging(),
  ],
})

export const handle = kit.sequence(appHandle)
```

### 2. 编写 API 端点

```typescript
// src/routes/api/users/+server.ts
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

export async function POST(event) {
  const { valid, data, errors } = await kit.validate.form(event.request, CreateUserSchema)
  if (!valid)
    return kit.response.validationError(errors)

  // 业务逻辑...
  return kit.response.created(data)
}
```

---

## 核心 API

### Handle Hook

#### `kit.createHandle(config?: HookConfig): Handle`

创建 SvelteKit Handle Hook，执行流程：请求 → requestId → 会话验证 → guards → middleware → resolve → 响应

| 参数                | 类型                                              | 默认值          | 说明         |
| ------------------- | ------------------------------------------------- | --------------- | ------------ |
| `sessionCookieName` | `string`                                          | `'hai_session'` | Cookie 名    |
| `validateSession`   | `(token: string) => Promise<SessionData \| null>` | —               | 会话验证函数 |
| `middleware`        | `Middleware[]`                                    | `[]`            | 中间件列表   |
| `guards`            | `GuardConfig[]`                                   | `[]`            | 守卫列表     |
| `onError`           | `(error, event) => Response`                      | —               | 全局错误回调 |
| `logging`           | `boolean`                                         | `true`          | 请求日志     |

#### `kit.sequence(...handles: Handle[]): Handle`

组合多个 Handle，从左到右嵌套执行：

```typescript
export const handle = kit.sequence(iamHandle, cacheHandle, appHandle)
```

### 路由守卫

所有守卫返回 `RouteGuard` 函数，通过 `GuardConfig` 配置匹配路径：

```typescript
interface GuardConfig {
  guard: RouteGuard
  paths?: string[] // glob 匹配（`/*` 一级, `/**` 递归）
  exclude?: string[] // 排除路径
}
```

#### `kit.guard.auth(config?)`

| 参数       | 类型      | 默认值     | 说明               |
| ---------- | --------- | ---------- | ------------------ |
| `loginUrl` | `string`  | `'/login'` | 未登录重定向 URL   |
| `apiMode`  | `boolean` | `false`    | true 返回 JSON 401 |

#### `kit.guard.role(config)`

| 参数           | 类型       | 默认值   | 说明               |
| -------------- | ---------- | -------- | ------------------ |
| `roles`        | `string[]` | 必填     | 需要的角色         |
| `requireAll`   | `boolean`  | `false`  | true = AND 逻辑    |
| `forbiddenUrl` | `string`   | `'/403'` | 无权限重定向       |
| `apiMode`      | `boolean`  | `false`  | true 返回 JSON 403 |

#### `kit.guard.permission(config)`

| 参数           | 类型       | 默认值   | 说明                                |
| -------------- | ---------- | -------- | ----------------------------------- |
| `permissions`  | `string[]` | 必填     | 需要的权限（支持 `admin:*` 通配符） |
| `requireAll`   | `boolean`  | `false`  | true = AND 逻辑                     |
| `forbiddenUrl` | `string`   | `'/403'` | 无权限重定向                        |
| `apiMode`      | `boolean`  | `false`  | true 返回 JSON 403                  |

#### 组合守卫

```typescript
// AND：管理员且有权限
kit.guard.all(
  kit.guard.role({ roles: ['admin'] }),
  kit.guard.permission({ permissions: ['posts:write'] }),
)

// OR：管理员或有权限
kit.guard.any(
  kit.guard.role({ roles: ['admin'] }),
  kit.guard.permission({ permissions: ['posts:*'] }),
)

// 取反：已登录用户不能访问登录页
kit.guard.not(kit.guard.auth(), { redirect: '/dashboard' })

// 条件执行：仅在 /admin 下检查角色
kit.guard.conditional(
  event => event.url.pathname.startsWith('/admin'),
  kit.guard.role({ roles: ['admin'] }),
)
```

### 中间件

签名统一为 `(config?) => Middleware`，其中 `Middleware = (context, next) => Promise<Response>`。

#### `kit.middleware.cors(config?)`

| 参数          | 类型                             | 默认值                                         |
| ------------- | -------------------------------- | ---------------------------------------------- |
| `origin`      | `string \| string[] \| Function` | `'*'`                                          |
| `methods`     | `string[]`                       | `['GET','HEAD','PUT','PATCH','POST','DELETE']` |
| `credentials` | `boolean`                        | `false`                                        |
| `maxAge`      | `number`                         | `86400`                                        |

#### `kit.middleware.csrf(config?)`

| 参数         | 类型       | 默认值           |
| ------------ | ---------- | ---------------- |
| `cookieName` | `string`   | `'hai_csrf'`     |
| `headerName` | `string`   | `'X-CSRF-Token'` |
| `exclude`    | `string[]` | `[]`             |

#### `kit.middleware.logging(config?)`

| 参数           | 类型       | 默认值                          |
| -------------- | ---------- | ------------------------------- |
| `logBody`      | `boolean`  | `false`                         |
| `logResponse`  | `boolean`  | `false`                         |
| `redactFields` | `string[]` | `['password','token','secret']` |

#### `kit.middleware.rateLimit(config)`

| 参数           | 类型                | 说明                  |
| -------------- | ------------------- | --------------------- |
| `windowMs`     | `number`            | 时间窗口（ms）        |
| `maxRequests`  | `number`            | 窗口内最大请求数      |
| `keyGenerator` | `(event) => string` | 限流 key（默认按 IP） |

超限返回 429，附带 `X-RateLimit-*` 和 `Retry-After` 头。

### API 响应工具 — `kit.response`

| 方法              | 状态码 | 签名                                                         |
| ----------------- | ------ | ------------------------------------------------------------ |
| `ok`              | 200    | `(data, requestId?) => Response`                             |
| `created`         | 201    | `(data, requestId?) => Response`                             |
| `noContent`       | 204    | `() => Response`                                             |
| `badRequest`      | 400    | `(message, requestId?, details?) => Response`                |
| `unauthorized`    | 401    | `(message?, requestId?) => Response`                         |
| `forbidden`       | 403    | `(message?, requestId?) => Response`                         |
| `notFound`        | 404    | `(message?, requestId?) => Response`                         |
| `conflict`        | 409    | `(message, requestId?) => Response`                          |
| `validationError` | 422    | `(errors: FormError[], requestId?) => Response`              |
| `internalError`   | 500    | `(message?, requestId?) => Response`                         |
| `redirect`        | 302    | `(url, status?) => Response`                                 |
| `error`           | 自定义 | `(code, message, status?, requestId?, details?) => Response` |

所有响应 body 格式：`{ success, data?, error?, requestId? }`

### 表单验证 — `kit.validate`

| 方法     | 签名                                                 | 说明              |
| -------- | ---------------------------------------------------- | ----------------- |
| `form`   | `(request, schema) => Promise<FormValidationResult>` | 解析请求体并验证  |
| `query`  | `(url, schema) => FormValidationResult`              | 验证 URL 查询参数 |
| `params` | `(params, schema) => FormValidationResult`           | 验证路由参数      |

```typescript
interface FormValidationResult<T> {
  valid: boolean
  data?: T
  errors: Array<{ field: string, message: string }>
}
```

支持的 Content-Type：`application/json`、`application/x-www-form-urlencoded`、`multipart/form-data`。

---

## 模块集成

### IAM 集成

#### `kit.iam.createHandle(config): Handle`

| 参数                | 类型                  | 说明                 |
| ------------------- | --------------------- | -------------------- |
| `iam`               | `IamServiceLike`      | IAM 服务实例         |
| `publicPaths`       | `string[]`            | 公开路径（跳过认证） |
| `sessionCookieName` | `string`              | 会话 Cookie 名       |
| `onUnauthenticated` | `(event) => Response` | 未认证回调           |

执行流程：匹配公开路径 → 读取 cookie → 验证 token → 获取用户信息 → 写入 `event.locals.session` 和 `event.locals.user`。

#### `kit.iam.createActions(config): Actions`

创建 SvelteKit Form Actions：`login` / `register` / `logout` / `changePassword`。

```typescript
import { iam } from '$lib/server/init'
// src/routes/(auth)/login/+page.server.ts
import { kit } from '@h-ai/kit'

export const actions = kit.iam.createActions({
  iam,
  loginRedirect: '/dashboard',
  logoutRedirect: '/login',
})
```

### Cache 集成

#### `kit.cache.createHandle(config): Handle`

| 参数         | 类型                               | 说明           |
| ------------ | ---------------------------------- | -------------- |
| `cache`      | `CacheServiceLike`                 | 缓存服务实例   |
| `routes`     | `Record<string, CacheRouteConfig>` | 路由缓存规则   |
| `defaultTtl` | `number`                           | 默认 TTL（秒） |

```typescript
kit.cache.createHandle({
  cache,
  routes: {
    '/api/products': { ttl: 300 },
    '/api/config': { ttl: 3600, staleWhileRevalidate: 60 },
  },
})
```

### Storage 集成

#### `kit.storage.createEndpoint(config)`

| 参数           | 类型                 | 说明                 |
| -------------- | -------------------- | -------------------- |
| `storage`      | `StorageServiceLike` | Storage 服务实例     |
| `bucket`       | `string`             | 存储桶名             |
| `allowedTypes` | `string[]`           | 允许的文件类型       |
| `maxFileSize`  | `number`             | 最大文件大小（字节） |

返回 `{ get, post, delete }` RequestHandler，直接用于 `+server.ts`：

```typescript
// src/routes/api/storage/+server.ts
const endpoint = kit.storage.createEndpoint({
  storage,
  bucket: 'uploads',
  allowedTypes: ['image/*', 'application/pdf'],
  maxFileSize: 10 * 1024 * 1024,
})

export const GET = endpoint.get
export const POST = endpoint.post
export const DELETE = endpoint.delete
```

### Crypto 集成

- `kit.crypto.verifyWebhookSignature(config)` — 验证 Webhook 签名
- `kit.crypto.createCsrfManager(config)` — CSRF Token 管理器
- `kit.crypto.createEncryptedCookie(config)` — 加密 Cookie
- `kit.crypto.transportEncryptionMiddleware(config)` — 传输加密中间件（SM2+SM4）

---

## 客户端 Store

通过 `kit.client` 访问，适用于 Svelte 组件。

### `kit.client.useSession(options?): SessionStore`

```typescript
const session = kit.client.useSession({
  fetchUrl: '/api/session',
  refreshInterval: 300, // 5 分钟自动刷新
})

// 在组件中
$session.user // ClientUser | null
$session.loading // boolean
session.logout() // 登出
```

### `kit.client.useUpload(options?): UploadStore`

```typescript
const upload = kit.client.useUpload({
  uploadUrl: '/api/storage',
  maxConcurrent: 3,
})

upload.addFiles(fileList)
$upload.progress // 0-100
$upload.uploading // boolean
```

### `kit.client.useIsAuthenticated(session): Readable<boolean>`

### `kit.client.useUser(session): Readable<ClientUser | null>`

---

## 常见模式

### 完整 hooks.server.ts

```typescript
import { iam, initModules } from '$lib/server/init'
import { kit } from '@h-ai/kit'

await initModules()

const iamHandle = kit.iam.createHandle({
  iam,
  publicPaths: ['/login', '/register', '/api/public/**'],
})

const appHandle = kit.createHandle({
  guards: [
    {
      guard: kit.guard.role({ roles: ['admin'] }),
      paths: ['/admin/**'],
    },
  ],
  middleware: [
    kit.middleware.cors({ origin: ['https://example.com'] }),
    kit.middleware.rateLimit({ windowMs: 60000, maxRequests: 100 }),
  ],
})

export const handle = kit.sequence(iamHandle, appHandle)
```

### API 端点标准模式

```typescript
export async function POST(event) {
  if (!event.locals.session)
    return kit.response.unauthorized()

  const { valid, data, errors } = await kit.validate.form(event.request, Schema)
  if (!valid)
    return kit.response.validationError(errors)

  const result = await businessLogic(data!)
  if (!result.success)
    return kit.response.error(result.error.code, result.error.message)

  return kit.response.created(result.data)
}
```

---

## 相关 Skills

- `hai-build`：项目架构与模块初始化顺序
- `hai-core`：配置、日志、Result 基础能力
- `hai-iam`：IAM 模块详细 API（认证/授权/RBAC）
- `hai-cache`：缓存模块详细 API
- `hai-storage`：存储模块详细 API
- `hai-crypto`：加密模块详细 API
- `hai-ui`：UI 组件（表单/上传等场景组件）
