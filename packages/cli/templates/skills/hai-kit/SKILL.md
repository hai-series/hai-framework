---
name: hai-kit
description: 使用 @h-ai/kit 进行 SvelteKit 服务端集成，包括 Handle Hook、路由守卫、中间件、API Handler、API 响应工具、表单验证、会话管理、客户端透明加密；当需求涉及 hooks.server.ts、请求管道、guard、middleware、kit.response、kit.validate、kit.handler 或传输加密时使用。
---

# hai-kit

> `@h-ai/kit` 是 hai-framework 的 SvelteKit 集成层，提供 Handle Hook、路由守卫、中间件链、API Handler（自动错误边界）、API 响应构建、表单验证、会话 Cookie 管理和透明加密（Cookie 加密 + SM2+SM4 传输加密）。

---

## 适用场景

- 配置 `hooks.server.ts` 请求管道（Handle / Guard / Middleware / 加密）
- 实现认证/授权守卫（登录检查、角色/权限控制）
- 使用 CORS、CSRF、限流等中间件
- 使用 `kit.handler()` 包装 API 端点（统一错误边界）
- 构建标准化 API 响应
- 表单/查询参数/路由参数验证
- 会话 Cookie 管理
- 客户端 CSRF + 传输加密
- i18n 全局语言设置

---

## 命名空间概览

```
kit
├── createHandle(config?)  — SvelteKit Handle Hook（含透明加密）
├── sequence(...handles)   — 组合多个 Handle
├── handler(fn)            — API Handler 包装器（自动错误边界）
├── guard
│   ├── auth(config?)      — 认证守卫
│   ├── role(config)       — 角色守卫
│   ├── permission(config) — 权限守卫
│   ├── hasPermission()    — 检查权限（布尔）
│   ├── assertPermission() — 断言权限（返回 403 Response）
│   ├── requirePermission() — 要求权限（throw Response）
│   ├── all / any / not / conditional — 组合守卫
├── middleware
│   ├── cors(config?)      — CORS 中间件
│   ├── csrf(config?)      — CSRF 中间件
│   ├── logging(config?)   — 请求日志中间件
│   └── rateLimit(config)  — 速率限制中间件
├── response
│   ├── ok / created / noContent
│   ├── badRequest / unauthorized / forbidden / notFound / conflict
│   ├── validationError / internalError / redirect / error
├── validate
│   ├── form / query / params
│   └── formOrFail / queryOrFail / paramsOrFail
├── session
│   ├── setCookie(cookies, token, options?)
│   └── clearCookie(cookies, options?)
├── client
│   └── create(config?)    — 统一客户端（CSRF + 传输加密）
└── i18n
    └── setLocale(locale)  — 设置所有 hai 模块的默认语言
```

---

## 使用步骤

### 1. 配置 hooks.server.ts

```typescript
import { crypto } from '@h-ai/crypto'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

const haiHandle = kit.createHandle({
  sessionCookieName: 'hai_session',
  validateSession: async (token) => {
    const result = await iam.user.getCurrentUser(token)
    return result.success
      ? { userId: result.data.id, roles: [], permissions: [] }
      : null
  },
  guards: [
    {
      guard: kit.guard.auth({ loginUrl: '/auth/login' }),
      paths: ['/admin/*'],
    },
    {
      guard: kit.guard.auth({ apiMode: true }),
      paths: ['/api/*'],
      exclude: ['/api/auth/*', '/api/public/*'],
    },
  ],
  middleware: [
    kit.middleware.logging({ logBody: false }),
    kit.middleware.rateLimit({ windowMs: 60_000, maxRequests: 100 }),
    kit.middleware.csrf({ exclude: ['/api/auth/*', '/api/public/*'] }),
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

**所有 API 端点必须使用 `kit.handler()` 包装**，获得统一错误边界：

```typescript
// src/routes/api/users/+server.ts
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

export const POST = kit.handler(async ({ request, locals }) => {
  kit.guard.requirePermission(locals.session, 'user:create')
  const data = await kit.validate.formOrFail(request, CreateUserSchema)
  const user = await createUser(data)
  return kit.response.created(user)
})

export const GET = kit.handler(async ({ url, locals }) => {
  kit.guard.requirePermission(locals.session, 'user:read')
  const query = kit.validate.queryOrFail(url, ListSchema)
  return kit.response.ok(await fetchUsers(query))
})
```

### 3. 客户端 API 请求

```typescript
// src/lib/utils/api.ts
import { crypto } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

const client = kit.client.create({ transport: { crypto } })
export const { apiFetch } = client
```

### 4. i18n 设置

```typescript
const locale = event.cookies.get('PARAGLIDE_LOCALE') ?? 'zh-CN'
kit.i18n.setLocale(locale)
```

---

## 核心 API

### Handle Hook

#### `kit.createHandle(config?: HookConfig): Handle`

创建 SvelteKit Handle Hook，执行流程：请求 → requestId → Cookie 加密代理 → 会话验证 → guards → middleware → resolve → 响应

| 参数                | 类型                                              | 默认值          | 说明                   |
| ------------------- | ------------------------------------------------- | --------------- | ---------------------- |
| `sessionCookieName` | `string`                                          | `'hai_session'` | Cookie 名              |
| `validateSession`   | `(token: string) => Promise<SessionData \| null>` | —               | 会话验证函数           |
| `middleware`        | `Middleware[]`                                    | `[]`            | 中间件列表             |
| `guards`            | `GuardConfig[]`                                   | `[]`            | 守卫列表               |
| `onError`           | `(error, event) => Response`                      | —               | 全局错误回调           |
| `logging`           | `boolean`                                         | `true`          | 请求日志               |
| `crypto`            | `HookCryptoConfig`                                | —               | 加密配置（见透明加密） |

#### `kit.sequence(...handles: Handle[]): Handle`

组合多个 Handle，从左到右嵌套执行：

```typescript
export const handle = kit.sequence(i18nHandle, haiHandle)
```

### API Handler

#### `kit.handler(fn): RequestHandler`

包装 API 端点函数，提供统一错误边界：

- SvelteKit 控制流（`Response` / `redirect` / `error`）→ re-throw
- 业务异常 → `core.logger.error()` + `kit.response.internalError()`

```typescript
export const GET = kit.handler(async ({ locals }) => {
  kit.guard.requirePermission(locals.session, 'user:read')
  return kit.response.ok(await getUsers())
})
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

#### 权限断言

```typescript
// 布尔检查
kit.guard.hasPermission(session, 'user:read') // => boolean

// 断言（不满足返回 403 Response，用于 kit.handler 内）
const resp = kit.guard.assertPermission(session, 'user:read')
if (resp)
  return resp

// 要求（不满足 throw Response，SvelteKit 控制流）
kit.guard.requirePermission(locals.session, 'user:read')
```

#### 组合守卫

```typescript
kit.guard.all(guardA, guardB) // AND
kit.guard.any(guardA, guardB) // OR
kit.guard.not(kit.guard.auth(), { redirect: '/home' }) // 取反
kit.guard.conditional(event => event.url.pathname.startsWith('/admin'), guardA)
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

| 方法           | 签名                                                 | 说明                                        |
| -------------- | ---------------------------------------------------- | ------------------------------------------- |
| `form`         | `(request, schema) => Promise<FormValidationResult>` | 解析请求体并验证                            |
| `query`        | `(url, schema) => FormValidationResult`              | 验证 URL 查询参数                           |
| `params`       | `(params, schema) => FormValidationResult`           | 验证路由参数                                |
| `formOrFail`   | `(request, schema) => Promise<T>`                    | 验证失败 throw Response（SvelteKit 控制流） |
| `queryOrFail`  | `(url, schema) => T`                                 | 验证失败 throw Response                     |
| `paramsOrFail` | `(params, schema) => T`                              | 验证失败 throw Response                     |

### 会话管理 — `kit.session`

```typescript
kit.session.setCookie(cookies, token, { maxAge: 86400 })
kit.session.clearCookie(cookies)
```

### 客户端 — `kit.client`

#### `kit.client.create(config?): KitClient`

创建统一客户端，自动 CSRF + 传输加密：

```typescript
const client = kit.client.create({ transport: { crypto } })
const { apiFetch } = client

// apiFetch 自动：
// 1. 写方法附加 CSRF Token
// 2. 请求体 SM4 加密
// 3. 响应体 SM4 解密
```

### i18n — `kit.i18n`

```typescript
kit.i18n.setLocale('zh-CN') // 统一设置所有 hai 模块的默认语言
```

---

## 透明加密配置

### HookCryptoConfig

| 参数                  | 类型                | 说明                                          |
| --------------------- | ------------------- | --------------------------------------------- |
| `crypto`              | `CryptoLike`        | @h-ai/crypto 实例                             |
| `transport`           | `boolean \| object` | 启用传输加密（可配置路径等）                  |
| `encryptedCookies`    | `string[]`          | 需要加密的 Cookie 名列表                      |
| `cookieEncryptionKey` | `string`            | Cookie 加密密钥（或 HAI_COOKIE_KEY 环境变量） |

---

## 常见模式

### 完整 hooks.server.ts

```typescript
import { crypto } from '@h-ai/crypto'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

const haiHandle = kit.createHandle({
  sessionCookieName: 'hai_session',
  validateSession: async (token) => { /* ... */ },
  guards: [
    { guard: kit.guard.auth({ apiMode: true }), paths: ['/api/*'], exclude: ['/api/auth/*'] },
  ],
  middleware: [
    kit.middleware.logging(),
    kit.middleware.rateLimit({ windowMs: 60_000, maxRequests: 100 }),
    kit.middleware.csrf({ exclude: ['/api/auth/*'] }),
  ],
  crypto: { crypto, transport: true, encryptedCookies: ['hai_session'], cookieEncryptionKey: '' },
})

export const handle = kit.sequence(i18nHandle, haiHandle)
```

### API 端点标准模式

```typescript
export const POST = kit.handler(async ({ request, locals }) => {
  kit.guard.requirePermission(locals.session, 'user:create')
  const data = await kit.validate.formOrFail(request, Schema)
  const result = await businessLogic(data)
  if (!result.success)
    return kit.response.badRequest(result.error.message)
  return kit.response.created(result.data)
})
```
