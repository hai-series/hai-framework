# @hai/kit Skills

> 此文件描述 @hai/kit 模块的架构、API 与集成方式，供 AI 助手参考。

## 1. 模块概述

`@hai/kit` 是 hai-framework 与 SvelteKit 的集成层，将框架各模块（IAM / Cache / Storage / Crypto）以 SvelteKit 惯用方式暴露为 Handle Hook、中间件、路由守卫、API 响应工具、表单验证与客户端 Store。

架构关键特征：

- 服务端 Handle Hook 流程：**会话解析 → 守卫执行 → 中间件链 → resolve → 响应**
- 守卫与中间件可通过 `createHandle` 声明式配置，也可独立使用
- 模块集成（IAM/Cache/Crypto/Storage）通过 `XxxServiceLike` 接口解耦，不直接依赖具体实现
- 客户端 Store 基于 Svelte `writable`/`derived`，与服务端 API 配合

## 2. 目录结构

```
packages/kit/
  package.json
  README.md
  SKILLS.md
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  messages/
    en-US.json                            # 英文消息（25+ key）
    zh-CN.json                            # 中文消息
  src/
    index.ts                              # 主入口（仅导出 kit 对象 + 公共类型）
    kit-main.ts                           # 统一命名空间 export const kit = { ... }
    kit-types.ts                          # 公共类型（SessionData, HookConfig, Middleware 等）
    kit-response.ts                       # API 响应工具（ok, created, error 等）
    kit-validation.ts                     # 表单验证（validateForm/Query/Params）
    guards/
      index.ts                            # Guards 导出聚合
      auth.ts                             # authGuard — 认证守卫
      role.ts                             # roleGuard — 角色守卫
      permission.ts                       # permissionGuard — 权限守卫（通配符）
      compose.ts                          # allGuards / anyGuard / notGuard / conditionalGuard
    hooks/
      index.ts                            # Hooks 导出聚合
      handle.ts                           # createHandle + sequence
    middleware/
      index.ts                            # Middleware 导出聚合
      cors.ts                             # corsMiddleware
      csrf.ts                             # csrfMiddleware
      logging.ts                          # loggingMiddleware
      ratelimit.ts                        # rateLimitMiddleware
    modules/
      index.ts                            # 模块导出聚合
      iam/
        index.ts                          # IAM 导出
        iam-handle.ts                     # createIamHandle / requireAuth / requireRole / requirePermission
        iam-actions.ts                    # createIamActions（SvelteKit Form Actions）
        iam-types.ts                      # IamServiceLike / IamHandleConfig / IamActionsConfig 等
      cache/
        index.ts                          # Cache 导出
        cache-handle.ts                   # createCacheHandle / createCacheUtils
        cache-types.ts                    # CacheServiceLike / CacheHandleConfig 等
      crypto/
        index.ts                          # Crypto 导出
        crypto-helpers.ts                 # verifyWebhookSignature / signRequest / createCsrfManager / createEncryptedCookie
        crypto-types.ts                   # CryptoServiceLike / WebhookVerifyConfig 等
      storage/
        index.ts                          # Storage 导出
        storage-handle.ts                 # createStorageEndpoint
        storage-types.ts                  # StorageServiceLike / StorageEndpointConfig 等
    client/
      index.ts                            # Client 导出聚合
      stores.ts                           # useSession / useUpload / useIsAuthenticated / useUser
      client-types.ts                     # ClientUser / SessionStore / UploadStore 等
  tests/
```

## 3. 导入方式

所有功能通过 `kit` 统一命名空间访问（`kit-main.ts` 导出）：

```typescript
import { kit } from '@hai/kit'

// 服务端
kit.createHandle({ /* config */ })
kit.sequence(handle1, handle2)
kit.guard.auth({ loginUrl: '/login' })
kit.middleware.cors({ origin: '*' })
kit.response.ok(data)
kit.validate.form(request, schema)
kit.iam.createHandle({ iam })
kit.cache.createHandle({ cache, routes })
kit.storage.createEndpoint({ storage, bucket: 'uploads' })
kit.crypto.createCsrfManager({ crypto })
kit.setAllModulesLocale('zh-CN')

// 客户端
kit.client.useSession()
kit.client.useUpload()
kit.client.useTransportEncryption({ crypto })
```

## 4. 核心类型

### SessionData（服务端通用会话）

| 字段          | 类型                       | 说明       |
| ------------- | -------------------------- | ---------- |
| `userId`      | `string`                   | 用户 ID    |
| `username`    | `string?`                  | 用户名     |
| `roles`       | `string[]`                 | 角色列表   |
| `permissions` | `string[]`                 | 权限列表   |
| `data`        | `Record<string, unknown>?` | 自定义数据 |

### HaiRequestEvent

继承 `RequestEvent`，额外附加 `session?: SessionData` 和 `requestId: string`。

### MiddlewareContext

| 字段        | 类型           | 说明     |
| ----------- | -------------- | -------- |
| `event`     | `RequestEvent` | 原始事件 |
| `session`   | `SessionData?` | 当前会话 |
| `requestId` | `string`       | 请求 ID  |

### Middleware（函数签名）

```typescript
type Middleware = (context: MiddlewareContext, next: () => Promise<Response>) => Promise<Response>
```

### GuardResult

| 字段       | 类型      | 说明             |
| ---------- | --------- | ---------------- |
| `allowed`  | `boolean` | 是否放行         |
| `redirect` | `string?` | 拒绝时重定向 URL |
| `message`  | `string?` | 拒绝时错误消息   |
| `status`   | `number?` | HTTP 状态码      |

### RouteGuard（函数签名）

```typescript
type RouteGuard = (event: RequestEvent, session?: SessionData) => Promise<GuardResult> | GuardResult
```

### GuardConfig

| 字段      | 类型         | 说明                         |
| --------- | ------------ | ---------------------------- |
| `guard`   | `RouteGuard` | 守卫函数                     |
| `paths`   | `string[]?`  | 适用路径（glob，`/*`/`/**`） |
| `exclude` | `string[]?`  | 排除路径                     |

### ApiResponse\<T\>

| 字段        | 类型                                           | 说明     |
| ----------- | ---------------------------------------------- | -------- |
| `success`   | `boolean`                                      | 是否成功 |
| `data`      | `T?`                                           | 数据     |
| `error`     | `{ code: string, message: string, details? }?` | 错误     |
| `requestId` | `string?`                                      | 请求 ID  |

### FormValidationResult\<T\>

| 字段     | 类型          | 说明         |
| -------- | ------------- | ------------ |
| `valid`  | `boolean`     | 是否有效     |
| `data`   | `T?`          | 解析后的数据 |
| `errors` | `FormError[]` | 错误列表     |

### FormError

| 字段      | 类型     | 说明     |
| --------- | -------- | -------- |
| `field`   | `string` | 字段名   |
| `message` | `string` | 错误消息 |

## 5. Handle Hook

### kit.createHandle(config?: HookConfig): Handle

创建 SvelteKit handle hook，执行流程：

1. 生成 `requestId`，写入 `event.locals.requestId`
2. 若配置 `validateSession`，从 cookie 读取 token 并验证，结果写入 `event.locals.session`
3. 依次执行 `guards`（匹配 `paths`/`exclude`），任何守卫返回 `allowed: false` 则终止并返回错误/重定向
4. 以洋葱模型执行 `middleware` 链
5. 调用 `resolve(event)` 获取响应
6. 响应头添加 `X-Request-Id`
7. 异常处理：SvelteKit redirect/error 异常会重新抛出，其他异常调用 `onError` 或返回 500

#### HookConfig

| 字段                | 类型                                                | 默认值          | 说明         |
| ------------------- | --------------------------------------------------- | --------------- | ------------ |
| `sessionCookieName` | `string`                                            | `'hai_session'` | Cookie 名    |
| `validateSession`   | `(token: string) => Promise<SessionData \| null>`   | —               | 会话验证函数 |
| `middleware`        | `Middleware[]`                                      | `[]`            | 中间件列表   |
| `guards`            | `GuardConfig[]`                                     | `[]`            | 守卫列表     |
| `onError`           | `(error: unknown, event: RequestEvent) => Response` | —               | 错误回调     |
| `logging`           | `boolean`                                           | `true`          | 请求日志     |

### kit.sequence(...handles: Handle[]): Handle

组合多个 SvelteKit handle，从左到右嵌套执行。

```typescript
export const handle = kit.sequence(iamHandle, cacheHandle, appHandle)
```

## 6. 路由守卫

### kit.guard.auth(config?: AuthGuardConfig): RouteGuard

| 参数       | 类型      | 默认值     | 说明                            |
| ---------- | --------- | ---------- | ------------------------------- |
| `loginUrl` | `string`  | `'/login'` | 未登录时重定向 URL              |
| `apiMode`  | `boolean` | `false`    | `true` 返回 JSON 401 而非重定向 |

未登录时在非 API 模式下，重定向携带 `?returnUrl=` 参数。

### kit.guard.role(config: RoleGuardConfig): RouteGuard

| 参数           | 类型       | 默认值   | 说明                            |
| -------------- | ---------- | -------- | ------------------------------- |
| `roles`        | `string[]` | 必填     | 需要的角色列表                  |
| `requireAll`   | `boolean`  | `false`  | `false` = OR 逻辑，`true` = AND |
| `forbiddenUrl` | `string`   | `'/403'` | 无权限时重定向 URL              |
| `apiMode`      | `boolean`  | `false`  | `true` 返回 JSON 403            |

### kit.guard.permission(config: PermissionGuardConfig): RouteGuard

| 参数           | 类型       | 默认值   | 说明                            |
| -------------- | ---------- | -------- | ------------------------------- |
| `permissions`  | `string[]` | 必填     | 需要的权限列表                  |
| `requireAll`   | `boolean`  | `false`  | `false` = OR 逻辑，`true` = AND |
| `forbiddenUrl` | `string`   | `'/403'` | 无权限时重定向 URL              |
| `apiMode`      | `boolean`  | `false`  | `true` 返回 JSON 403            |

通配符规则：

- `admin:*` 匹配 `admin:read`、`admin:write` 等
- `*` 匹配所有权限

### 组合守卫

| 函数                    | 签名                                                                   | 说明     |
| ----------------------- | ---------------------------------------------------------------------- | -------- |
| `kit.guard.all`         | `(...guards: RouteGuard[]) => RouteGuard`                              | AND 逻辑 |
| `kit.guard.any`         | `(...guards: RouteGuard[]) => RouteGuard`                              | OR 逻辑  |
| `kit.guard.not`         | `(guard: RouteGuard, options?: { redirect?, message? }) => RouteGuard` | 取反     |
| `kit.guard.conditional` | `(condition: ConditionFn, guard: RouteGuard) => RouteGuard`            | 条件执行 |

`ConditionFn = (event: RequestEvent, session?: SessionData) => boolean | Promise<boolean>`

组合示例：

```typescript
// 管理员 OR 拥有 posts:* 权限
kit.guard.any(kit.guard.role({ roles: ['admin'] }), kit.guard.permission({ permissions: ['posts:*'] }))

// 仅在 /admin 下执行角色检查
kit.guard.conditional(
  event => event.url.pathname.startsWith('/admin'),
  kit.guard.role({ roles: ['admin'] }),
)

// 已登录用户不允许访问登录页
kit.guard.not(kit.guard.auth(), { redirect: '/dashboard' })
```

## 7. 中间件

所有中间件签名均为 `(config?) => Middleware`。

### kit.middleware.cors(config?: CorsConfig): Middleware

| 参数             | 类型                                                  | 默认值                                                | 说明           |
| ---------------- | ----------------------------------------------------- | ----------------------------------------------------- | -------------- |
| `origin`         | `string \| string[] \| ((origin: string) => boolean)` | `'*'`                                                 | 允许的源       |
| `methods`        | `string[]`                                            | `['GET','HEAD','PUT','PATCH','POST','DELETE']`        | 允许的方法     |
| `allowedHeaders` | `string[]`                                            | `['Content-Type','Authorization','X-Requested-With']` | 允许的请求头   |
| `exposedHeaders` | `string[]`                                            | `[]`                                                  | 暴露的响应头   |
| `credentials`    | `boolean`                                             | `false`                                               | 允许凭证       |
| `maxAge`         | `number`                                              | `86400`                                               | 预检缓存（秒） |

自动处理 OPTIONS 预检请求（返回 204）。

### kit.middleware.csrf(config?: CsrfConfig): Middleware

| 参数         | 类型       | 默认值           | 说明            |
| ------------ | ---------- | ---------------- | --------------- |
| `cookieName` | `string`   | `'hai_csrf'`     | Token Cookie 名 |
| `headerName` | `string`   | `'X-CSRF-Token'` | Token Header 名 |
| `exclude`    | `string[]` | `[]`             | 排除路径        |

GET/HEAD/OPTIONS 请求自动生成 CSRF token 写入 cookie（httpOnly: false，前端可读）。非安全方法需要 header 中携带与 cookie 一致的 token。

### kit.middleware.logging(config?: LoggingMiddlewareConfig): Middleware

| 参数           | 类型       | 默认值                            | 说明           |
| -------------- | ---------- | --------------------------------- | -------------- |
| `logBody`      | `boolean`  | `false`                           | 是否记录请求体 |
| `logResponse`  | `boolean`  | `false`                           | 是否记录响应头 |
| `redactFields` | `string[]` | `['password', 'token', 'secret']` | 屏蔽的敏感字段 |

使用 `core.logger.trace` 输出结构化日志。

### kit.middleware.rateLimit(config: RateLimitConfig): Middleware

| 参数             | 类型                                | 默认值      | 说明           |
| ---------------- | ----------------------------------- | ----------- | -------------- |
| `windowMs`       | `number`                            | 必填        | 时间窗口（ms） |
| `maxRequests`    | `number`                            | 必填        | 最大请求数     |
| `keyGenerator`   | `(event: RequestEvent) => string`   | 按客户端 IP | 自定义限流 key |
| `onLimitReached` | `(event: RequestEvent) => Response` | —           | 超限自定义响应 |

超限返回 429，附带 `X-RateLimit-Limit`、`X-RateLimit-Remaining`、`X-RateLimit-Reset`、`Retry-After` 头。使用内存 Map 存储，定期清理过期条目。

## 8. API 响应工具

所有函数返回 `Response` 对象，body 为 JSON 格式的 `ApiResponse`。

| 函数                           | 状态码 | 签名                                                                                                  |
| ------------------------------ | ------ | ----------------------------------------------------------------------------------------------------- |
| `kit.response.ok`              | 200    | `<T>(data: T, requestId?: string) => Response`                                                        |
| `kit.response.created`         | 201    | `<T>(data: T, requestId?: string) => Response`                                                        |
| `kit.response.noContent`       | 204    | `() => Response`                                                                                      |
| `kit.response.error`           | 自定义 | `(code: string, message: string, status?: number, requestId?: string, details?: unknown) => Response` |
| `kit.response.badRequest`      | 400    | `(message: string, requestId?: string, details?: unknown) => Response`                                |
| `kit.response.unauthorized`    | 401    | `(message?: string, requestId?: string) => Response`                                                  |
| `kit.response.forbidden`       | 403    | `(message?: string, requestId?: string) => Response`                                                  |
| `kit.response.notFound`        | 404    | `(message?: string, requestId?: string) => Response`                                                  |
| `kit.response.conflict`        | 409    | `(message: string, requestId?: string) => Response`                                                   |
| `kit.response.validationError` | 422    | `(errors: Array<{ field: string, message: string }>, requestId?: string) => Response`                 |
| `kit.response.internalError`   | 500    | `(message?: string, requestId?: string) => Response`                                                  |
| `kit.response.redirect`        | 3xx    | `(url: string, status?: 301\|302\|303\|307\|308) => Response`                                         |

`error` 函数 `status` 默认 400。`redirect` 函数 `status` 默认 302。

## 9. 表单验证

基于 Zod Schema，返回 `FormValidationResult<T>`。

### kit.validate.form(request: Request, schema: ZodType): Promise\<FormValidationResult\>

解析请求体并验证：

- `application/json` → `request.json()`
- `application/x-www-form-urlencoded` / `multipart/form-data` → `request.formData()` → `Object.fromEntries`
- 其他 content-type → 返回错误

### kit.validate.query(url: URL, schema: ZodType): FormValidationResult

从 `url.searchParams` 提取键值对并验证。

### kit.validate.params(params: Record\<string, string\>, schema: ZodType): FormValidationResult

直接验证路由参数对象。

典型用法：

```typescript
import { kit } from '@hai/kit'
import { z } from 'zod'

const Schema = z.object({ name: z.string().min(1), age: z.number().int().positive() })

export async function POST(event) {
  const { valid, data, errors } = await kit.validate.form(event.request, Schema)
  if (!valid)
    return kit.response.validationError(errors)
  return kit.response.ok(data)
}
```

## 10. 模块集成

### IAM 模块

#### kit.iam.createHandle(config: IamHandleConfig): Handle

创建 IAM 认证 Handle Hook。

| 参数                | 类型                                                     | 默认值      | 说明           |
| ------------------- | -------------------------------------------------------- | ----------- | -------------- |
| `iam`               | `IamServiceLike`                                         | 必填        | IAM 服务实例   |
| `publicPaths`       | `string[]`                                               | `[]`        | 公开路径       |
| `sessionCookieName` | `string`                                                 | `'session'` | 会话 Cookie 名 |
| `onUnauthenticated` | `(event: RequestEvent) => Response \| Promise<Response>` | —           | 未认证回调     |
| `onUnauthorized`    | `(event: RequestEvent) => Response \| Promise<Response>` | —           | 未授权回调     |

执行流程：

1. 匹配 `publicPaths` → 跳过认证
2. 从 cookie 读取 session token → `iam.session.verifyToken(token)` 验证
3. 通过 `iam.user.getById` 获取用户信息
4. 写入 `event.locals.session` 和 `event.locals.user`
5. 验证失败调用 `onUnauthenticated`

#### kit.iam.createActions(config: IamActionsConfig): Actions

创建 SvelteKit Form Actions（login / register / logout / changePassword）。

| 参数                | 类型                                      | 默认值      | 说明             |
| ------------------- | ----------------------------------------- | ----------- | ---------------- |
| `iam`               | `IamServiceLike`                          | 必填        | IAM 服务实例     |
| `sessionCookieName` | `string`                                  | `'session'` | 会话 Cookie 名   |
| `sessionMaxAge`     | `number`                                  | —           | 会话有效期（秒） |
| `rememberMeMaxAge`  | `number`                                  | —           | 记住我有效期     |
| `loginRedirect`     | `string`                                  | —           | 登录成功重定向   |
| `logoutRedirect`    | `string`                                  | —           | 登出后重定向     |
| `registerRedirect`  | `string`                                  | —           | 注册成功重定向   |
| `onLoginSuccess`    | `(ctx: { user, session, event }) => void` | —           | 登录成功回调     |
| `onRegisterSuccess` | `(ctx: { user, event }) => void`          | —           | 注册成功回调     |
| `onLogoutSuccess`   | `(ctx: { event }) => void`                | —           | 登出成功回调     |

#### kit.iam.requireAuth(iam: IamServiceLike): 端点级守卫

#### kit.iam.requireRole(iam: IamServiceLike, roles: string[]): 端点级角色守卫

#### kit.iam.requirePermission(iam: IamServiceLike, permission: string): 端点级权限守卫

#### IamServiceLike 接口

IAM 服务需实现以下子对象：

- `auth.authenticate({ type, username, password })` → `Result<{ id, username, email? }>`
- `session.create({ userId, roles, source?, maxAge? })` → `Result<{ accessToken, expiresAt }>`
- `session.get(sessionId)` → `Result<SessionData | null>`
- `session.verifyToken(token)` → `Result<SessionData>`
- `session.delete(sessionId)` → `Result`
- `user.getById(userId)` → `Result<UserData | null>`
- `user.register({ username, email, password })` → `Result<UserData>`
- `user.changePassword(userId, oldPassword, newPassword)` → `Result`
- `authz.checkPermission({ userId }, permission)` → `Result<boolean>`
- `authz.getUserRoles(userId)` → `Result<Array<{ id, code }>>`

### Cache 模块

#### kit.cache.createHandle(config: CacheHandleConfig): Handle

| 参数           | 类型                               | 默认值 | 说明                     |
| -------------- | ---------------------------------- | ------ | ------------------------ |
| `cache`        | `CacheServiceLike`                 | 必填   | 缓存服务实例             |
| `routes`       | `Record<string, CacheRouteConfig>` | `{}`   | 路由缓存配置             |
| `defaultTtl`   | `number`                           | `0`    | 默认 TTL（秒），0 不缓存 |
| `methods`      | `string[]`                         | —      | 缓存的 HTTP 方法         |
| `varyHeaders`  | `string[]`                         | —      | Vary 头                  |
| `bypassHeader` | `string`                           | —      | 绕过缓存的请求头         |

CacheRouteConfig：

| 字段                   | 类型                              | 默认值 | 说明                 |
| ---------------------- | --------------------------------- | ------ | -------------------- |
| `ttl`                  | `number`                          | 必填   | 缓存时间（秒）       |
| `staleWhileRevalidate` | `number`                          | —      | 过期后可用旧值的时间 |
| `keyGenerator`         | `(event: RequestEvent) => string` | —      | 自定义缓存 key       |
| `cacheAuthenticated`   | `boolean`                         | —      | 是否缓存认证请求     |

#### kit.cache.createUtils(config: { cache: CacheServiceLike })

返回缓存工具对象，包含缓存清除、预热等方法。

### Crypto 模块

#### kit.crypto.verifyWebhookSignature(config: WebhookVerifyConfig): Promise\<boolean\>

| 参数              | 类型                 | 默认值          | 说明            |
| ----------------- | -------------------- | --------------- | --------------- |
| `crypto`          | `CryptoServiceLike`  | 必填            | Crypto 服务实例 |
| `event`           | `RequestEvent`       | 必填            | 请求事件        |
| `secretKey`       | `string`             | 必填            | 签名密钥        |
| `signatureHeader` | `string`             | `'X-Signature'` | 签名头名称      |
| `algorithm`       | `'sha256'\|'sha512'` | —               | 算法            |
| `encoding`        | `'hex'\|'base64'`    | —               | 编码            |

#### kit.crypto.signRequest(config): Promise\<string\>

生成请求签名。

#### kit.crypto.createCsrfManager(config: CsrfConfig)

| 参数            | 类型                | 默认值 | 说明            |
| --------------- | ------------------- | ------ | --------------- |
| `crypto`        | `CryptoServiceLike` | 必填   | Crypto 服务实例 |
| `cookieName`    | `string`            | —      | Cookie 名       |
| `headerName`    | `string`            | —      | Header 名       |
| `formFieldName` | `string`            | —      | 表单字段名      |
| `tokenLength`   | `number`            | —      | Token 长度      |
| `cookieOptions` | `object`            | —      | Cookie 选项     |

返回 CSRF Token 管理器对象。

#### kit.crypto.createEncryptedCookie(config: EncryptedCookieConfig)

| 参数            | 类型                | 默认值 | 说明        |
| --------------- | ------------------- | ------ | ----------- |
| `crypto`        | `CryptoServiceLike` | 必填   | Crypto 服务 |
| `encryptionKey` | `string`            | 必填   | 加密密钥    |
| `cookieOptions` | `object`            | —      | Cookie 选项 |

返回加密 Cookie 管理器（get/set/delete）。

#### kit.crypto.createTransportEncryption(cryptoService: TransportCryptoServiceLike)

创建传输加密管理器，基于 SM2（非对称）+ SM4（对称）的混合加密方案。

| 参数            | 类型                         | 说明                                     |
| --------------- | ---------------------------- | ---------------------------------------- |
| `cryptoService` | `TransportCryptoServiceLike` | 需提供 `sm2` 和 `sm4` 操作的 Crypto 服务 |

返回 `TransportEncryptionManager`：

| 方法                                 | 说明                                              |
| ------------------------------------ | ------------------------------------------------- |
| `getServerPublicKey()`               | 获取服务端 SM2 公钥                               |
| `registerClientKey(clientPublicKey)` | 注册客户端公钥，返回 clientId                     |
| `getClientPublicKey(clientId)`       | 获取已注册客户端的公钥                            |
| `encryptResponse(clientId, data)`    | 用客户端公钥加密响应数据，返回 `EncryptedPayload` |
| `decryptRequest(payload)`            | 用服务端私钥解密请求载荷                          |

#### kit.crypto.createKeyExchangeHandler(manager: TransportEncryptionManager)

创建密钥交换端点处理器，用于客户端与服务端交换 SM2 公钥。

接收 `POST { clientPublicKey: string }` 请求，返回 `{ serverPublicKey, clientId }`。

#### kit.crypto.transportEncryptionMiddleware(config: TransportEncryptionConfig)

SvelteKit 中间件，自动对请求/响应进行传输加密解密。

| 参数              | 类型                         | 默认值                    | 说明             |
| ----------------- | ---------------------------- | ------------------------- | ---------------- |
| `enabled`         | `boolean`                    | —                         | 是否启用         |
| `crypto`          | `TransportCryptoServiceLike` | 必填                      | Crypto 服务      |
| `keyExchangePath` | `string`                     | `'/api/kit/key-exchange'` | 密钥交换端点路径 |
| `excludePaths`    | `string[]`                   | `[]`                      | 排除的路径       |
| `encryptResponse` | `boolean`                    | `true`                    | 是否加密响应     |

行为：

- 通过 `X-Client-Id` 请求头关联客户端
- 自动解密 POST/PUT/PATCH/DELETE 请求体
- 自动加密响应并添加 `X-Encrypted: true` 头
- 密钥交换端点和 excludePaths 不加密

#### kit.crypto.isValidEncryptedPayload(payload: unknown)

校验载荷是否为合法的 `EncryptedPayload` 格式（包含 `encryptedKey`、`ciphertext`、`iv` 字符串字段）。

### Storage 模块

#### kit.storage.createEndpoint(config: StorageEndpointConfig)

| 参数               | 类型                                                | 默认值 | 说明                 |
| ------------------ | --------------------------------------------------- | ------ | -------------------- |
| `storage`          | `StorageServiceLike`                                | 必填   | Storage 服务实例     |
| `bucket`           | `string`                                            | 必填   | 存储桶名             |
| `allowedTypes`     | `string[]`                                          | —      | 允许的文件类型       |
| `maxFileSize`      | `number`                                            | —      | 最大文件大小（字节） |
| `requireAuth`      | `boolean`                                           | —      | 是否需要认证         |
| `generateKey`      | `(filename: string, event: RequestEvent) => string` | —      | 自定义 key 生成      |
| `onUploadComplete` | `(ctx: { result, file, event }) => void`            | —      | 上传完成回调         |
| `onUploadError`    | `(ctx: { error, file, event }) => void`             | —      | 上传失败回调         |

返回对象包含 `get`、`post`、`delete` 三个 SvelteKit RequestHandler。

## 11. 客户端 Store

通过 `kit.client` 命名空间访问。

### kit.client.useSession(options?: UseSessionOptions): SessionStore

| 参数              | 类型                                 | 默认值           | 说明                         |
| ----------------- | ------------------------------------ | ---------------- | ---------------------------- |
| `fetchUrl`        | `string`                             | `'/api/session'` | 获取会话的 URL               |
| `refreshInterval` | `number`                             | `0`              | 自动刷新间隔（秒），0 不刷新 |
| `onSessionChange` | `(user: ClientUser \| null) => void` | —                | 会话变化回调                 |

返回 `SessionStore`（继承 `Readable<SessionState>`）：

| 方法                         | 说明                          |
| ---------------------------- | ----------------------------- |
| `fetch()`                    | 手动获取会话                  |
| `refresh()`                  | 刷新会话                      |
| `logout(url?)`               | 登出（默认 POST /api/logout） |
| `startAutoRefresh(interval)` | 启动自动刷新（秒）            |
| `stopAutoRefresh()`          | 停止自动刷新                  |

SessionState：

| 字段      | 类型               | 说明     |
| --------- | ------------------ | -------- |
| `user`    | `ClientUser\|null` | 用户信息 |
| `loading` | `boolean`          | 加载中   |
| `error`   | `string\|null`     | 错误信息 |

ClientUser：

| 字段       | 类型      | 说明 |
| ---------- | --------- | ---- |
| `id`       | `string`  | 必填 |
| `username` | `string`  | 必填 |
| `email`    | `string?` | 可选 |
| `nickname` | `string?` | 可选 |
| `avatar`   | `string?` | 可选 |

### kit.client.useUpload(options?: UseUploadOptions): UploadStore

| 参数            | 类型                                         | 默认值           | 说明       |
| --------------- | -------------------------------------------- | ---------------- | ---------- |
| `uploadUrl`     | `string`                                     | `'/api/storage'` | 上传 URL   |
| `presignUrl`    | `string`                                     | —                | 预签名 URL |
| `maxConcurrent` | `number`                                     | `3`              | 最大并发数 |
| `onProgress`    | `(fileId: string, progress: number) => void` | —                | 进度回调   |
| `onComplete`    | `(fileId: string, result: unknown) => void`  | —                | 完成回调   |
| `onError`       | `(fileId: string, error: Error) => void`     | —                | 错误回调   |

返回 `UploadStore`（继承 `Readable<UploadState>`）：

| 方法                     | 说明               |
| ------------------------ | ------------------ |
| `addFiles(files, opts?)` | 添加文件到上传队列 |
| `removeFile(id)`         | 移除文件           |
| `retryFile(id)`          | 重试失败的文件     |
| `clear()`                | 清空所有文件       |
| `cancel()`               | 取消待上传文件     |

UploadState：

| 字段        | 类型           | 说明       |
| ----------- | -------------- | ---------- |
| `files`     | `UploadFile[]` | 文件列表   |
| `uploading` | `boolean`      | 是否上传中 |
| `progress`  | `number`       | 整体进度   |

UploadFile：

| 字段       | 类型                                           | 说明       |
| ---------- | ---------------------------------------------- | ---------- |
| `id`       | `string`                                       | 文件 ID    |
| `file`     | `File`                                         | 原始文件   |
| `progress` | `number`                                       | 进度 0-100 |
| `status`   | `'pending'\|'uploading'\|'completed'\|'error'` | 状态       |
| `result`   | `unknown?`                                     | 上传结果   |
| `error`    | `string?`                                      | 错误信息   |

支持预签名上传（设置 `presignUrl`）：先 GET 获取预签名 URL，再 PUT 文件。

### kit.client.useIsAuthenticated(sessionStore: SessionStore): Readable\<boolean\>

从 SessionStore 派生的认证状态。

### kit.client.useUser(sessionStore: SessionStore): Readable\<ClientUser | null\>

从 SessionStore 派生的用户信息。

### kit.client.useTransportEncryption(options: UseTransportEncryptionOptions): TransportEncryptionStore

客户端传输加密 Store，管理密钥生成、密钥交换与加密 fetch。

| 参数             | 类型                         | 默认值                    | 说明                   |
| ---------------- | ---------------------------- | ------------------------- | ---------------------- |
| `crypto`         | `TransportCryptoServiceLike` | 必填                      | 浏览器端 Crypto 服务   |
| `keyExchangeUrl` | `string`                     | `'/api/kit/key-exchange'` | 密钥交换端点           |
| `autoInit`       | `boolean`                    | `true`                    | 是否自动初始化密钥交换 |

返回 `TransportEncryptionStore`（Svelte Readable Store）：

| 字段             | 类型                                   | 说明              |
| ---------------- | -------------------------------------- | ----------------- |
| `ready`          | `boolean`                              | 加密通道是否就绪  |
| `error`          | `string \| null`                       | 错误信息          |
| `encryptedFetch` | `(url, options?) => Promise<Response>` | 加密的 fetch 方法 |

方法：

- `init()` — 手动触发密钥交换初始化
- `destroy()` — 清理资源

## 12. 会话流程（端到端）

```
浏览器请求 → hooks.server.ts handle
  │
  ├─ kit.iam.createHandle:
  │    ├─ 匹配 publicPaths → 跳过认证
  │    ├─ 读取 cookie → iam.session.verifyToken(token)
  │    ├─ iam.user.getById(session.userId) → 写入 event.locals.user
  │    └─ 验证失败 → onUnauthenticated 回调
  │
  ├─ kit.createHandle:
  │    ├─ 执行 guards（kit.guard.auth / kit.guard.role / kit.guard.permission）
  │    ├─ 执行 middleware 链（cors → csrf → logging → rateLimit → ...）
  │    └─ resolve(event) → 生成响应
  │
  ├─ API 端点（+server.ts）:
  │    ├─ 从 event.locals.session 读取会话
  │    ├─ kit.validate.form / kit.validate.query / kit.validate.params 验证
  │    └─ kit.response.ok / kit.response.created / kit.response.error 返回标准响应
  │
  └─ 响应头: X-Request-Id
```

客户端侧：

```
kit.client.useSession → fetch('/api/session') → 获取 user
                     → 自动 refreshInterval 刷新
                     → logout() → POST /api/logout → 清空状态

kit.client.useUpload  → addFiles → 队列 → XMLHttpRequest 上传（带进度）
                     → 或 presignUrl 模式 → GET 预签名 → PUT 文件
```

## 13. i18n 集成

### kit.getKitMessage(key: KitMessageKey): string

获取 kit 模块的 i18n 消息，自动跟随全局 locale。

### kit.setAllModulesLocale(locale: string): void

调用 `core.i18n.setGlobalLocale(locale)`，一次同步所有 hai 模块的语言。

消息 key 列表（messages/\*.json）：

| key                                 | 说明                |
| ----------------------------------- | ------------------- |
| `kit_unauthorized`                  | 未授权              |
| `kit_missingFilename`               | 缺少 filename 参数  |
| `kit_presignUrlFailed`              | 预签名 URL 生成失败 |
| `kit_listFailed`                    | 获取列表失败        |
| `kit_downloadUrlFailed`             | 下载 URL 生成失败   |
| `kit_invalidRequest`                | 无效请求            |
| `kit_missingFile`                   | 缺少文件            |
| `kit_unsupportedFileType`           | 不支持的文件类型    |
| `kit_fileSizeExceeded`              | 文件大小超限        |
| `kit_uploadFailed`                  | 上传失败            |
| `kit_missingKey`                    | 缺少 key 参数       |
| `kit_deleteFailed`                  | 删除失败            |
| `kit_csrfTokenFailed`               | CSRF Token 生成失败 |
| `kit_csrfVerifyFailed`              | CSRF Token 验证失败 |
| `kit_encryptFailed`                 | 加密失败            |
| `kit_presignFetchFailed`            | 获取预签名 URL 失败 |
| `kit_loginUsernamePasswordRequired` | 请输入用户名密码    |
| `kit_sessionCreateFailed`           | 创建会话失败        |
| `kit_registerFieldsRequired`        | 请填写必填字段      |
| `kit_passwordMismatch`              | 密码不匹配          |
| `kit_passwordMinLength`             | 密码长度不足        |
| `kit_loginRequired`                 | 请先登录            |
| `kit_changePasswordSuccess`         | 密码修改成功        |

## 14. 错误处理模式

### API 端点

```typescript
import { kit } from '@hai/kit'

export async function POST(event) {
  // 认证检查
  if (!event.locals.session)
    return kit.response.unauthorized()

  // 验证
  const { valid, data, errors } = await kit.validate.form(event.request, Schema)
  if (!valid)
    return kit.response.validationError(errors)

  // 业务逻辑
  try {
    const result = await doSomething(data!)
    return kit.response.ok(result)
  }
  catch (e) {
    return kit.response.internalError()
  }
}
```

### createHandle 全局错误

```typescript
kit.createHandle({
  onError: (error, event) => {
    core.logger.error('Unhandled error', { error })
    return kit.response.internalError()
  },
})
```

SvelteKit 内置的 redirect/error 异常会被 createHandle 重新抛出，不会被拦截。
