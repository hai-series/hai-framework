# @h-ai/kit 功能说明

[English](kit.en.md) · [日本語](kit.ja.md)

在 SvelteKit 中使用 `kit` 组合处理请求的 hooks、编写 API 路由和创建同源 HTTP 客户端。根入口会按服务端或浏览器选择可用功能。需要 Node 部署适配器、传输加密中间件或 A2A 接入时，见下文对应的导入路径。

SvelteKit 的服务端和浏览器代码都可以导入 `kit`。请求校验和访问控制由服务端执行。浏览器可以创建同源客户端和绑定登录表单的操作。

[模块 README](../../../packages/kit/README.md) · [配置清单](../configuration/kit.md) · [数据结构](../data/kit.md) · [前后端接入](../development/frontend-backend.md)

<a id="quick-start"></a>

## 最小接入示例

`sequence` 保留并组合 SvelteKit 的 `resolve` 选项：页面转换由内向外执行，`preload` 与序列化响应头过滤使用首个配置，确保 i18n 的 HTML 语言标记正确替换。

### 安装

```bash
npm install @h-ai/kit @h-ai/core sm-crypto@0.5.8
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite
```

### 项目配置

**vite.config.ts**：

```ts
import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter(),
      preprocess: [
        vitePreprocess()
      ],
      compilerOptions: { runes: true },
      // 绝对路径保持 SSR 与浏览器端认证、加密路径一致。
      paths: { base: '', relative: false },
    }),
    tailwindcss(),
  ],
  optimizeDeps: {
    exclude: ['bits-ui']
  },
  ssr: {
    noExternal: ['@h-ai/ui', '@h-ai/kit'],
    external: ['@h-ai/core', 'sm-crypto']
  },
})
```

使用 Crypto 或依赖它的 Kit/IAM 时，应用生产依赖需包含 `sm-crypto@0.5.8`。CLI 已配好这一项；手工接入时运行 `pnpm add sm-crypto@0.5.8`。仅设置 external 不够，adapter-node 还需要这项直接依赖声明才能保留原包加载。

## 功能说明

<a id="api-reference"></a>

### 用途、输入与输出

表中的调用片段使用各节示例已经打开的服务或建立的对象。示例变量由应用提供，例如当前 HTTP 请求、用于校验输入的 Schema、资源定义或配置。返回 Promise 时用 `await` 等待。返回 `HaiResult` 时先判断 `success`，再读取数据或错误。

| 入口                                        | 场景               | 输入                                                               | 输出                                                              | 调用片段                                                                    |
| ------------------------------------------- | ------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `kit.createHandle`                          | 请求管道           | `HandleConfig: auth/guards/logging/rateLimit/crypto/access`        | `SvelteKit Handle`                                                | `kit.createHandle({ logging: true })`                                       |
| `kit.sequence`                              | 组合 Hook          | `...Handle`                                                        | `Handle preserving resolve options`                               | `kit.sequence(i18nHandle, authHandle)`                                      |
| `kit.handler`                               | 端点异常边界       | `(RequestEvent) => Response \| Promise<Response>`                  | `SvelteKit request handler`                                       | `kit.handler(async () => kit.response.ok({ ready: true }))`                 |
| `kit.guard.check`                           | 检查权限           | `session, permission`                                              | `boolean`                                                         | `kit.guard.check(session, "orders.read")`                                   |
| `kit.guard.require`                         | 要求权限           | `session, permission`                                              | `void; denied access throws Response`                             | `kit.guard.require(session, "orders.write")`                                |
| `kit.guard.requireSensitive`                | 确认操作用途       | `initialized IAM, current RequestEvent request/cookies, operation` | `Promise<void>; invalid proof throws Response`                    | `kit.guard.requireSensitive(iam, event, "orders.approve")`                  |
| `kit.response.ok`                           | 成功响应           | `data, requestId?`                                                 | `Response with HTTP 200 and success data`                         | `kit.response.ok({ id: "o1" })`                                             |
| `kit.response.created`                      | 创建响应           | `data, requestId?`                                                 | `Response with HTTP 201 and success data`                         | `kit.response.created({ id: "o1" })`                                        |
| `kit.response.noContent`                    | 无正文             | `none`                                                             | `Response with HTTP 204`                                          | `kit.response.noContent()`                                                  |
| `kit.response.error`                        | 指定失败           | `code, message, status?, requestId?, public details?`              | `safe failure Response`                                           | `kit.response.error("app:orders:001", "请求无效", 400)`                     |
| `kit.response.badRequest`                   | 无效请求           | `message?, requestId?`                                             | `HTTP 400 Response`                                               | `kit.response.badRequest("Invalid request")`                                |
| `kit.response.unauthorized`                 | 未认证             | `message?, requestId?`                                             | `HTTP 401 Response`                                               | `kit.response.unauthorized()`                                               |
| `kit.response.forbidden`                    | 无权限             | `message?, requestId?`                                             | `HTTP 403 Response`                                               | `kit.response.forbidden()`                                                  |
| `kit.response.notFound`                     | 未找到             | `message?, requestId?`                                             | `HTTP 404 Response`                                               | `kit.response.notFound()`                                                   |
| `kit.response.conflict`                     | 版本冲突           | `message, requestId?`                                              | `HTTP 409 Response`                                               | `kit.response.conflict("Data changed")`                                     |
| `kit.response.validationError`              | 字段校验           | `{ field, message }[], requestId?`                                 | `HTTP 422 Response; errors in safe error.cause`                   | `kit.response.validationError([{ field: "title", message: "请输入标题" }])` |
| `kit.response.internalError`                | 内部失败           | `message?, requestId?`                                             | `HTTP 500 Response with safe message`                             | `kit.response.internalError()`                                              |
| `kit.response.redirect`                     | 重定向             | `location, status?`                                                | `redirect Response`                                               | `kit.response.redirect("/auth/login")`                                      |
| `kit.response.fromResult`                   | 映射领域结果       | `HaiResult<T>, httpStatusMap?, requestId?`                         | `HTTP Response; preserves safe code/status/traceId`               | `kit.response.fromResult(result)`                                           |
| `kit.response.fromError`                    | 映射领域错误       | `HaiError, requestId?`                                             | `safe HTTP failure Response`                                      | `kit.response.fromError(result.error)`                                      |
| `kit.validate.body`                         | JSON/表单校验      | `Request, Zod schema`                                              | `Promise<schema data>; invalid input throws Response`             | `kit.validate.body(request, InputSchema)`                                   |
| `kit.validate.query`                        | 查询校验           | `URL, Zod schema`                                                  | `schema data; invalid input throws Response`                      | `kit.validate.query(url, QuerySchema)`                                      |
| `kit.validate.params`                       | 路径参数校验       | `Record<string,string>, Zod schema`                                | `schema data; invalid input throws Response`                      | `kit.validate.params(params, IdSchema)`                                     |
| `kit.validate.IdParamSchema`                | 通用资源编号       | `{ id: string }`                                                   | `Zod parsed ID object`                                            | `kit.validate.IdParamSchema.parse({ id: "o1" })`                            |
| `kit.validate.PaginationQuerySchema`        | 分页输入           | `page/pageSize/search query`                                       | `normalized pagination object`                                    | `kit.validate.PaginationQuerySchema.parse({ page: "1" })`                   |
| `kit.client.create`                         | 同源客户端         | `KitClientConfig: auth/transport/recoverSession?`                  | `KitClient { apiFetch, init, destroy, ready }`                    | `kit.client.create()`                                                       |
| `kit.client.createAuthActions`              | 标准认证动作       | `{ basePath?, ...auth client options }?`                           | `AuthPanel-compatible actions`                                    | `kit.client.createAuthActions({ basePath: "/api/auth" })`                   |
| `kit.client.installBrowserTransport`        | 按公共配置安装加密 | `public KitConfig, { crypto, basePath? }`                          | `void; installs same-origin global fetch wrapper when enabled`    | `kit.client.installBrowserTransport(publicKitConfig, { crypto })`           |
| `kit.client.installBrowserTransportFetch`   | 自定义传输安装     | `ClientTransportConfig`                                            | `void; installs browser global fetch wrapper`                     | `kit.client.installBrowserTransportFetch(transportOptions)`                 |
| `kit.auth.publicPaths`                      | 匿名端点名单       | `none`                                                             | `string[]; prepend the host base path when needed`                | `kit.auth.publicPaths`                                                      |
| `kit.auth.createApi`                        | 认证 handler 集合  | `initialized IAM service`                                          | `RequestHandler map for login/OTP/reset/config/etc.`              | `kit.auth.createApi(iam)`                                                   |
| `kit.auth.login`                            | 密码登录           | `Cookie writer, PasswordCredentials, request context?`             | `Promise<HaiResult<AuthResult>>; writes token cookies on success` | `kit.auth.login(cookies, { identifier: "alice", password })`                |
| `kit.auth.loginWithOtp`                     | 验证码登录         | `Cookie writer, OtpCredentials, request context?`                  | `Promise<HaiResult<AuthResult>>`                                  | `kit.auth.loginWithOtp(cookies, otpCredentials)`                            |
| `kit.auth.loginWithLdap`                    | LDAP 登录          | `Cookie writer, LdapCredentials, request context?`                 | `Promise<HaiResult<AuthResult>>`                                  | `kit.auth.loginWithLdap(cookies, ldapCredentials)`                          |
| `kit.auth.loginWithApiKey`                  | API Key 登录       | `Cookie writer, ApiKeyCredentials, request context?`               | `Promise<HaiResult<AuthResult>>`                                  | `kit.auth.loginWithApiKey(cookies, apiKeyCredentials)`                      |
| `kit.auth.registerAndLogin`                 | 注册并登录         | `Cookie writer, RegisterOptions, request context?`                 | `Promise<HaiResult<AuthResult>>`                                  | `kit.auth.registerAndLogin(cookies, registration)`                          |
| `kit.auth.logout`                           | 显式退出           | `Cookie writer, accessToken?`                                      | `Promise<HaiResult<void>>`                                        | `kit.auth.logout(cookies, accessToken)`                                     |
| `kit.auth.setBrowserToken`                  | 页面内存凭据       | `access token string`                                              | `void; no Web Storage persistence`                                | `kit.auth.setBrowserToken(accessToken)`                                     |
| `kit.auth.clearBrowserToken`                | 清理页面凭据       | `none`                                                             | `void`                                                            | `kit.auth.clearBrowserToken()`                                              |
| `kit.crud.define`                           | 声明 CRUD 资源     | `CrudResourceConfig`                                               | `resource operation object`                                       | `kit.crud.define(resourceDefinition)`                                       |
| `kit.middleware.rateLimit`                  | 固定窗口限流       | `{ windowMs, maxRequests, store, ...options }`                     | `Middleware; 429 on quota and 503 on store failure`               | `kit.middleware.rateLimit({ windowMs: 60000, maxRequests: 100, store })`    |
| `kit.middleware.createCacheRateLimitStore`  | 共享计数器         | `initialized shared cache, { namespace, allowMemory? }`            | `RateLimitStore`                                                  | `kit.middleware.createCacheRateLimitStore(cache, { namespace: "orders" })`  |
| `kit.middleware.createMemoryRateLimitStore` | 开发计数器         | `none; development or explicit test only`                          | `MemoryRateLimitStore`                                            | `kit.middleware.createMemoryRateLimitStore()`                               |
| `kit.createFeedbackHandler`                 | 受控反馈入口       | `{ feedback, resolveContext, ...options }`                         | `catch-all RequestHandler`                                        | `kit.createFeedbackHandler({ feedback, resolveContext })`                   |
| `kit.i18n.setLocale`                        | 启动默认语言       | `locale string`                                                    | `void; do not change process default per request`                 | `kit.i18n.setLocale("zh-CN")`                                               |
| `kit.i18n.runWithLocale`                    | 请求语言隔离       | `locale, callback; Node server only`                               | `same callback return value`                                      | `kit.i18n.runWithLocale("en-US", () => resolve(event))`                     |

- Handle Hook 组合（`createHandle` / `sequence`）
- 认证/角色/权限守卫（`guard.require` / `guard.check`）
- 内置 Logging / RateLimit / CORS 中间件（通过 `createHandle` 配置启用）
- 统一 API 响应与请求验证（Zod）
- Bearer Token 工具（服务端 login/logout + 浏览器端 Token 存储）
- 浏览器端统一客户端（自动 CSRF，支持传输加密）
- 声明式 CRUD 资源定义（`crud.define`）
- A2A 协议集成：默认发现路径 `/.well-known/agent-card.json`；配置 `authenticate` 后 null/undefined 返回 401，仅未配置认证时允许匿名。API Key 参数从完整 Agent Card 的 `securitySchemes.apiKey` 读取。Hook 与显式 A2A 路由共享 JSON-RPC 解析错误和 SSE 取消清理逻辑。
- 双构建模式（`createAdapter()`）

<a id="detailed-workflow"></a>

### 搭建请求管道

应用部署在 `/yyy/` 等子目录时，SvelteKit 的 `paths.base` 与守卫使用的实际 URL 应保持一致：配置 `paths.relative: false`，从 `$app/paths` 的 `resolve('/').replace(/\/$/, '')` 得到挂载路径后拼接到 `protectedPaths`、`publicPaths` 和 `loginUrl`，例如 `${base}/api/*`。认证页面使用 ``kit.client.createAuthActions({ basePath: `${base}/api/auth` })``。Kit 根据应用路由识别 `/api/*`，包括路由分组和挂载前缀；未认证的 API 返回 401，页面按配置跳转登录。生成模板已处理这些路径。

以下 Hook 片段假设应用已完成数据库、共享缓存和 IAM 初始化，并检查每项初始化结果。关闭资源由应用统一负责；不在每个请求中初始化模块。

**src/hooks.server.ts**：

```typescript
import type { Handle } from '@sveltejs/kit/hooks'
import { cache } from '@h-ai/cache'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

const haiHandle = kit.createHandle({
  auth: {
    verifyToken: async (token) => {
      const verified = await iam.auth.verifyToken(token)
      if (!verified.success)
        return null
      const { userId, username, roles, permissions } = verified.data
      return { userId, username, roles, permissions }
    },
    loginUrl: '/auth/login',
    protectedPaths: ['/admin/*', '/api/*'],
    publicPaths: ['/api/auth/*', '/api/public/*'],
  },
  rateLimit: {
    windowMs: 60_000,
    maxRequests: 100,
    store: kit.middleware.createCacheRateLimitStore(cache, { namespace: 'app' })
  },
  logging: true,
})

export const handle: Handle = haiHandle
```

限流采用首次成功提交为起点的固定窗口，后续请求不延长 TTL。必须显式传 store；应用先检查共享 Redis 初始化结果，所有节点使用相同 namespace/windowMs/maxRequests。缓存读取/条件提交失败或冲突耗尽返回503，超限429；不会回退 get+set 或本地计数。createMemoryRateLimitStore 仅开发或显式 HAI_E2E/HAI_E2E_MOCK 测试使用，无常驻定时器，丢弃引用即可回收；每次请求最多惰性扫描 64 项，最多保存 10000 个窗口，容量满时对新 key 返回503且不驱逐有效计数，外部 store 生命周期由创建者管理；生产不得设置测试开关。响应重置时间为节点时钟估算，实际窗口由 Redis TTL 决定，须同步时钟。默认键只读取可信 adapter 的 getClientAddress、规范化等价IPv6和IPv4映射地址，不采信原始转发头；代理信任通过部署adapter配置。

### API 端点

先在应用的 `src/app.d.ts` 中声明会话字段。如果生成模板已经声明了 `Locals.session`，沿用现有定义。

```ts
import type { SessionData } from '@h-ai/kit'

declare global {
  namespace App {
    interface Locals {
      session?: SessionData
    }
  }
}
```

请求经过上面的 Kit Hook 后，端点从 `locals.session` 读取已验证的会话。没有 `user:create` 权限时，处理函数不会读入请求正文。

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

### 浏览器客户端

`kit.client.create()` 面向 SvelteKit 同源 endpoint；Web / App / 小程序跨域访问公共 API 时，请使用 `@h-ai/api-client`。

```typescript
// src/lib/utils/api.ts — 全应用共享
import { kit } from '@h-ai/kit'

const client = kit.client.create()
export const { apiFetch } = client
```

```typescript
// 使用
import { apiFetch } from '#lib/utils/api.js'

const response = await apiFetch('/api/users', { method: 'GET' })
```

> CSRF Header 注入由 `apiFetch` 自动处理；`@h-ai/kit` 不提供独立的 CSRF 中间件工厂。
> `apiFetch` 接受字符串、URL 或 Request；Request 自带的方法、请求头与正文会保留，写方法同样附加 CSRF。启用 transport 时仅加密可支持的正文，multipart 上传保持原始边界。
>
> 同源 SvelteKit endpoint 使用 httpOnly Cookie，由服务端读取 Cookie 完成鉴权。浏览器 Bearer Token 使用 `kit.auth.setBrowserToken()` 写入页面内存，再通过 `kit.client.create({ auth: true })` 注入。自定义 `BrowserTokenStore` 也必须使用内存或平台安全存储，禁止将敏感凭据写入 Web Storage。

### 同源传输加密

kit 的传输加密也统一委托 `@h-ai/crypto`：服务端通过 `crypto.transport.createServer({ serverKeyRing, keyStore })` 创建管理器，浏览器端通过 `kit.client.installBrowserTransport(kitConfig, { crypto })` 一行安装同源 fetch 包装。服务端还须注入受管密钥环和共享 registry。

`paths.relative: false` 使 SvelteKit 生成绝对的应用路径。例如部署到 `/console` 时，在应用中用 `resolve('/').replace(/\/$/, '')`（`resolve` 来自 `$app/paths`）得到 `'/console'`。将 `basePath: base` 同时交给服务端 `crypto.transport` 和浏览器的 `kit.client.installBrowserTransport(kitConfig, { crypto, basePath: base })`。若使用独立客户端，把相同值传给 `kit.client.create()` 的 `transport.basePath`。根目录使用空字符串。这个值由 SvelteKit 构建时设置，无需在 YAML 或请求头重复填写。密钥交换、排除规则和路由字节上限仍使用完整的请求路径。SSR 模板已配置这些值。

**服务端 Hook 装配**：在应用启动时将计算出的 `base` 传给 `createTransportHandle(base)`，再把返回的 Hook 交给 SvelteKit。

```ts
import { cache } from '@h-ai/cache'
import { createCacheTransportKeyStore, crypto, parseTransportServerKeyRing } from '@h-ai/crypto'
import { iam } from '@h-ai/iam'
import { core } from '@h-ai/core'
import { kit, KitConfigSchema, type KitConfig } from '@h-ai/kit'

export async function createTransportHandle(base: string) {
  // 启动时从应用指定的目录读取并校验 _kit.yml。
  core.init({ configDir: './config', configSchemas: { kit: KitConfigSchema } })
  const appKitConfig = core.config.getOrThrow<KitConfig>('kit')

  const cryptoReady = await crypto.init()
  if (!cryptoReady.success)
    throw new Error(cryptoReady.error.message)
  const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
  if (!ring.success)
    throw new Error(ring.error.message)
  const serverKeyRing = ring.data
  // Redis/IAM 由应用启动流程初始化并检查；此处复用同一实例。

  return kit.createHandle({
    trustedProxies: appKitConfig.trustedProxies,
    access: appKitConfig.access,
    auth: {
      verifyToken: async (token) => {
        const verified = await iam.auth.verifyToken(token)
        if (!verified.success)
          return null
        const { userId, username, roles, permissions } = verified.data
        return { userId, username, roles, permissions }
      },
      protectedPaths: [`${base}/api/*`],
      publicPaths: [`${base}/api/_hai/*`], // 默认密钥协商端点
    },
    crypto: {
      crypto,
      transport: appKitConfig.transport === false
        ? false
        : {
            ...appKitConfig.transport,
            basePath: base,
            serverKeyRing,
            keyStore: createCacheTransportKeyStore({ cache, ttlSeconds: 3600 }),
          },
    },
  })
}
```

`verifyToken` 把 IAM 的验证结果投影为 Kit 所需的会话字段；验证失败返回 `null`，由守卫判断未登录。密钥环和缓存连接仅保留在服务器。

**src/routes/+layout.svelte**（安装浏览器端包装）：

```svelte
<script lang='ts'>
  import { browser } from '$app/env'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit'
  import { untrack } from 'svelte'

  const base = resolve('/').replace(/\/$/, '')

  // 一次性安装：内部按 _kit.yml 决定是否启用 transport，并预热 crypto
  if (browser) {
    kit.client.installBrowserTransport(untrack(() => page.data.kitConfig), { crypto, basePath: base })
  }
</script>
```

**src/lib/utils/api.ts**（业务层只看到 `apiFetch`）：

```ts
import { kit } from '@h-ai/kit'

export const { apiFetch } = kit.client.create()
```

> 不再需要 `src/hooks.client.ts`：默认 `handleFetch` 行为已经够用，SvelteKit 内部 `__data.json` 请求会自动走上面安装的全局 fetch 包装。若确需同源 Authorization Header，使用显式 `BrowserTokenStore` 或 `kit.auth.setBrowserToken()` + `kit.client.create({ auth: true })`；不要把敏感 Token 存入 `localStorage`。

默认密钥协商路径为 `/api/_hai/key-exchange`。如服务端自定义 `transport.keyExchangePath`，客户端需同步配置 `transport.keyExchangeUrl`。

服务端必须显式注入相同的受管 `serverKeyRing` 和共享 `keyStore`（Redis 或共享数据库）。仅共享客户端公钥不足以跨节点解密。没有隐式进程私钥或内存 registry 回退；开发/测试显式用 `createCacheTransportKeyStore(capacity)`。服务端重启后重新加载同一密钥环即可，无需 sticky session。

transport 默认作用于同源 `/api/*` endpoint 与 SvelteKit `__data.json` 页面数据请求（以及密钥协商端点本身）；页面文档与静态资源仍保持明文，不要求携带 `X-Client-Id`。文件上传等 `multipart/form-data` 请求会保持原样发送，需在服务端 `excludePaths` 中显式放行对应上传路径。

加密传输使用 v2 格式。服务端先核对签名、消息认证码（MAC）、请求方法、路径和时间，再解密。客户端还会校验响应状态。服务节点共用同一处 Redis 或数据库，每个请求编号只准登记一次，以拒绝重复发送的加密报文。应用仍需使用 HTTPS、配置接受转发头的代理、检查当前用户权限，并防止重试导致业务重复执行。跨域接入时，CORS 需允许请求携带 `X-Hai-Transport`，并让前端读取同名响应头。完整规则见 [Transport 协议](crypto.md#transport-protocol)。

业务容量通过 `transport.maxPlaintextBytes` 统一配置：默认 1 MiB，整数范围 1 KiB～64 MiB，请求和响应共用 UTF-8 明文字节预算。客户端从握手自动获取上限，密文与部署代理预算由 `resolveTransportBodyLimits()` 推导（两倍明文 + 32 KiB）。握手、公钥、认证头和防重放约束独立；超限取消原流并释放 reader，请求 413、响应为加密的 500 容量错误，客户端识别 `TransportBodyTooLargeError` / `hai:crypto:070`。 [Transport capacity and upgrade](crypto.md#transport-capacity)。

普通接口沿用 `transport.maxPlaintextBytes`，设为 `auto` 或省略时上限为 1 MiB。反馈上报、证据、附件和 ZIP 下载通常需要更大正文。给这些路由单独设置 `routePlaintextBytes`，取值可用 `feedback.budget.maxTransportBytes`。路径中的 `*` 只匹配一个路径段。若应用已为某条路由配置额度，以该值为准。

握手、Node HTTP 适配器和反向代理按各路由的最大值预留空间。HTTP 适配器为显式配置且超过 1 MiB 的路由最多同时处理 2 个请求，普通路由另有 16 个名额。响应发送完毕或请求失败时释放名额。忙碌时返回 HTTP 503（`hai:crypto:072`），应用决定是否重试。

Serv/Kit 对通过请求绑定、签名和 MAC 校验但超出时间窗口的请求返回加密的 HTTP 400 错误。客户端抛出 `TransportTimeError`（`hai:crypto:071`），显示校验时的服务器 UTC 时间，提示开启设备的自动校时或手工修改时间后刷新。`serverTime` 为 Unix 毫秒。`api-client` 映射为 `VALIDATION_FAILED`，在 `cause.transportCode` 和 `cause.serverTime` 保留诊断信息。标准认证动作将已认证的传输时间错误转为 `HaiResult`，保留校验时间和校时提示，AuthPanel 可直接展示。

### 使用 `_kit.yml` 统一 transport 配置

`@h-ai/kit` 提供 `KitConfigSchema` / `resolveKitConfig()`，方便应用用同一份 `_kit.yml`
同时驱动 `hooks.server.ts` 与浏览器端 `kit.client.installBrowserTransport()`：

```yml
server:
  host: 127.0.0.1
  port: 3000

transport:
  keyExchangePath: /api/_hai/key-exchange
  excludePaths:
    - /api/storage
    - /api/public
    - /api/auth/profile/avatar
```

```ts
import { core } from '@h-ai/core'
import { KitConfigSchema } from '@h-ai/kit'

// 仅放在 src/lib/server 中；浏览器只收到 +layout.server.ts 返回的公开设置。
const loaded = core.config.load('kit', './config/_kit.yml', KitConfigSchema)
if (!loaded.success)
  throw new Error(loaded.error.message)
export const appKitConfig = loaded.data
export const publicKitConfig = { transport: appKitConfig.transport }
```

在 `src/routes/+layout.server.ts` 返回浏览器建立连接需要的值，由页面的布局数据读取。下面的示例只返回对客户端有用的 `kitConfig`。

```ts
import { publicKitConfig } from '#lib/server/kit-config.js'

export function load() {
  return { kitConfig: publicKitConfig }
}
```

读取 HTTP 监听设置时，服务端启动代码可从 `@h-ai/kit` 导入独立的 `resolveKitConfig()`。它在服务器启动前解析 `server` 和 `transport`。监听地址和端口先用 `HOST` / `PORT` 环境变量，再读取 `_kit.yml` 的 `server`，最后才用 `127.0.0.1:3000`。
如只在服务端读取配置，也可配合 `core.config.validate('kit', KitConfigSchema)` 使用。
完整的 `_kit.yml` 在服务端读取，其中可以包含内部代理网段和访问规则的文件位置。通过 `+layout.server.ts` 传给浏览器的 `kitConfig` 只需包含浏览器会读取的字段，例如传输加密是否开启、密钥交换路径和不加密的路径。不要把代理地址、规则文件、私钥或完整配置发给浏览器，也不要用 `?raw` 导入服务端配置。

### 依赖

- `@h-ai/iam` — 身份认证与授权（A2A 认证），可选；使用 A2A 功能时需在 kit 使用前初始化
- `@h-ai/crypto` — 加密（传输加密 / Cookie 加密），可选；启用加密时需在 kit 使用前初始化

### 导出路径

子模块运行时方法通过 `kit` 命名空间或明确子路径使用，类型单独导出；浏览器声明不暴露服务端工厂。Vite 配置使用 `@sveltejs/kit/vite`，不存在 `@h-ai/kit/vite` 插件。

- `@h-ai/kit`：主入口，提供 `kit` 命名空间与类型。
- `@h-ai/kit/client`：浏览器端客户端。
- `@h-ai/kit/adapter`：双构建 adapter（`createAdapter()`）。
- `@h-ai/kit/a2a`：A2A 协议集成。
- `@h-ai/kit/crypto`：加密模块集成。

### 配置驱动认证页面

密码登录只提交 `identifier` 和 `password`；`AuthPanel` 将 `LoginForm` 的 `username` 映射为 `identifier`。会话有效期由服务端 `session.maxAge` / `session.refreshTokenMaxAge` 配置决定，登录表单不提供按次登录的持久会话选项。

服务端可在认证配置中提供用户协议和隐私政策的 Markdown 正文或 URL。如果正文和 URL 同时存在，登录页面的弹窗优先显示经过安全处理的 Markdown。

路由直接导出 `kit.auth.createApi(iam)` 的 login、loginWithOtp、loginWithLdap、register、publicConfig、sendOtp、requestPasswordReset、confirmPasswordReset handler；自动执行 schema 验证、Cookie 设置和 HaiResult 映射。匿名白名单使用 `kit.auth.publicPaths`，不会放开 /me 和改密端点。浏览器用 `kit.client.createAuthActions({ apiFetch })` 直接连接 AuthPanel，复用 CSRF/transport。

[IAM 配置清单](../configuration/iam.md)

`kit.auth.logout(cookies, accessToken)` 返回 `Promise<HaiResult<void>>`。无令牌时仅清除 Cookie 并成功；有令牌但未配置认证操作时返回失败。无论服务端结果如何都清除本地 Cookie，调用方仍必须把失败转换为错误响应或提示；仅成功结果代表服务端撤销已经确认。底层控制流异常继续传播。

### CRUD fields

声明式 CRUD 字段支持 `colSpan: 'auto' | 1 | 2`，供 UI 双列表单决定字段宽度；`validation.message` 支持字符串或 `() => string`，便于随当前语言显示校验错误。UI 布局在 `CrudPage.form` 上配置，服务端仍须独立校验。

### 请求语言隔离

多位用户的请求可能同时在一个 Node.js 进程里执行。用 `core.i18n.runWithLocale(locale, () => handleRequest())` 为本次请求和它启动的异步工作设定语言。SvelteKit 可以用 `kit.i18n.runWithLocale(locale, () => resolve(event))`，Serv 会按请求头自动设定。翻译优先使用显式传入的 `MessageOptions.locale`，其次使用本次请求的语言，最后使用进程启动时的默认语言。

设定请求语言后，`setGlobalLocale()` 只改本次请求。启动时在请求之外调用它，可设置进程默认语言。服务端渲染时，UI 的语言状态对象只更新自己，翻译读取本次请求的语言。浏览器中从 `@h-ai/ui/i18n` 导入 `createLocaleStore()` 管理当前页面语言，或在翻译时直接传入 `locale`。

### 反馈接口与普通请求关联

在 `/api/feedback/[...path]/+server.ts` 中，可以把 `kit.createFeedbackHandler()` 返回的函数导出为 GET、POST、PATCH。Kit 和 Serv 使用同一份 Feedback API 契约。服务端限制正文大小，也拒绝客户端声称自己的身份或租户。应用实现 `resolveContext`，从已经验证的 `locals.session` 取用户信息并决定反馈范围和权限。返回 `null` 表示拒绝。现有的 CSRF、认证和传输加密仍由 `kit.createHandle()` 中设置的中间件处理。

createHandle 保留有效且有界的入站 X-Request-Id，补写响应头，并为异步业务传递请求 ID 和已验证用户。需要收集普通业务后端日志时，在应用的请求中间件中以 `core.context.run({ scopeId: 'configured-product' }, next)` 包住实际业务；该可信范围应与反馈接口一致，不能从客户端头推导。

```ts
import type { SessionData } from '@h-ai/kit'
import { feedback } from '@h-ai/feedback'
import { kit } from '@h-ai/kit'

const handler = kit.createFeedbackHandler({
  feedback,
  resolveContext: (event) => {
    const session = (event.locals as { session?: SessionData }).session
    return session
      ? { scopeId: 'configured-product', userId: session.userId, permissions: session.permissions }
      : null
  },
})
export const GET = handler
export const POST = handler
export const PATCH = handler
```

### 可选交互挑战

将 kit.auth.createApi(iam).createCaptcha 导出为 POST /api/auth/captcha；kit.auth.publicPaths 已包含它。kit.client.createAuthActions() 保留标准交互请求的 captcha 字段，并提供 createCaptcha；AuthPanel 提交时自动求解。匿名首次/过期改密仍须导出 /api/auth/password/renew。服务端 IAM 检查证明，开启策略不会只依赖界面。

何时要求验证、验证失败后如何处理，见 [IAM 配置](../configuration/iam.md)和 [IAM 功能说明](./iam.md)。

### 原地恢复过期会话

配置 `kit.client.create({ recoverSession })` 回调可在服务端明确拒绝会话时原地重新登录并保留页面输入。使用 `@h-ai/ui` 的 `createSessionRecovery` / `SessionRecoveryDialog`：根布局绑定公开配置与原用户，回调设为 `recovery.recover`，弹窗使用标准认证 actions，销毁时 `cancel()`。登录的 `expectedUserId` 由 IAM 限定原主体；常规验证码、锁定、改密和登录限制照常执行。只对明确未认证拒绝的原请求续接一次；取消、5xx、超时和结果不明的网络写入不重放。敏感操作证明绑定旧会话时可能需要再次确认，不复用到新会话。标准认证动作显式禁用自身的恢复重试，避免错误密码递归打开弹窗。自定义认证请求应传第三个参数 `{ recoverSession: false }`。终端分组通过 terminalType（web/app/desktop/api，默认 web）传入；它不是硬件身份认证。

### 页面离开会话策略

`session.endOnPageHide` 默认关闭。开启后，在浏览器页面加载时调用 `actions.bindPageExit({ enabled: config.session.endOnPageHide })`，卸载时执行它返回的函数，移除监听器。标准 admin、H5 和 fullstack 模板已接好此步骤。这里的 `actions` 来自 `apiClient.createAuthActions(...)` 或 SvelteKit 的 `kit.client.createAuthActions(...)`。配置从登录页使用的公开认证接口读取。

浏览器触发 `pagehide` 时会尝试调用 `POST /auth/session/close`。这包括刷新或整页导航，但页面进入往返缓存（BFCache）时会跳过。请求沿用 CSRF 防护和已启用的传输加密，并使用 `keepalive` 争取在页面关闭后完成。该请求不会刷新会话，响应也不会清除 Cookie 或本地凭据，以免较早的请求清掉新的登录状态。

浏览器可能根本没有发出请求。服务端仍需用 `idleTimeout` 或 `absoluteTimeout` 限制会话寿命。用户主动退出时，应正常调用应用的 logout 接口，让服务端撤销凭据，并清除客户端保存的登录状态。

### 每次请求的访问控制

路径规则的 `encryption` 可以填 `required` 或 `disabled`，省略时沿用应用的传输加密配置。设为 `disabled` 时，服务端按普通 HTTPS 正文处理，仍检查 IP、时段和身份，收到框架加密数据会拒绝。设为 `required` 时优先于 `excludePaths`，没有启用 Crypto、服务端密钥环和共享密钥登记存储就无法创建 Handle。相互冲突的路径规则也会使创建失败。CLI 的 Crypto 模板已配置两端。浏览器只需要知道哪些路由走普通请求，代理地址和完整访问规则保留在服务端。

将服务端 `_kit.yml` 的 `trustedProxies` 和 `access` 显式传给 `kit.createHandle`。示例和生成模板在应用初始化后只创建一次 Handle。`access` 默认为 `false`；内联 `{ rules: [{ id: 'external', paths: ['/api/v1/external/**'], allowIps: ['192.0.2.0/24'] }] }` 只限制匹配接口，`global` 则限制应用 Handle 处理的全部请求。实际路径包含部署前缀；静态服务器直接返回的资源不经过 Handle。

独立文件使用 `access: { file: './config/security/request-access.yml' }`，按工作目录解析，启动读取一次，最大 1 MiB，修改后重建 Handle。全局与所有匹配规则取交集，空列表不限对应维度，时区默认 UTC。时间窗口结束后，已有会话的后续请求同样被拒绝。预检和密钥交换也执行策略；普通 transport 请求的 HTTP 403 / `hai:common:104` 保留响应加密。

`trustedProxies: auto` 在未配置托管代理的应用中不使用转发头；受管 Compose 只有后端私有且存在入口代理时才采用容器网段。自管入口显式指定代理 IP/CIDR，`[]` 可关闭。解析后的 `event.getClientAddress()` 与策略、IAM、审计使用相同地址。外层代理、不可恢复的源地址丢失、环境变量与部署回滚见[请求访问控制手册](../configuration/request-access.md)。

### 客户端、CRUD 和传输的命名导出

| 公开入口                                              | 使用与输入                                                                           | 输出                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `@h-ai/kit/client` 的 `createKitClient`               | `createKitClient({})`，可传 CSRF、base path 和加密等选项                             | 独立同源客户端，调用方式同 `kit.client.create`                         |
| `@h-ai/kit/client` 的 `createKitAuthActions`          | `createKitAuthActions({ apiFetch: client.apiFetch })`，指定已创建客户端的 fetch      | 提供登录、会话恢复和密码相关动作的对象                                 |
| `@h-ai/kit/client` 的 `createSvelteKitNavAdapter`     | `createSvelteKitNavAdapter()`                                                        | 包含当前路径和 `navigate` / `refresh` 的 UI 导航适配器                 |
| `@h-ai/kit` 的 `defineCrud`                           | `defineCrud(resource)`，用表单字段及资源操作定义 CRUD                                | `CrudOperations<T>`，同 `kit.crud.define`                              |
| `@h-ai/kit` 的 `matchPermission`                      | `matchPermission('reports:read', ['reports:read'])`                                  | `true`，表示权限匹配；受保护接口依旧由服务端校验                       |
| `@h-ai/kit` 的 `resolveText`                          | `resolveText('Name')`，或传返回本地化文案的函数                                      | 字符串 `'Name'`                                                        |
| `@h-ai/kit` 的 `resolveOptions`                       | `resolveOptions([{ label: 'Active', value: true }])`，也可传返回选项的函数           | 解析选项后的 `{ label, value }[]`                                      |
| `@h-ai/kit` 的 `resolveKitTransportConfig`            | `resolveKitTransportConfig(false)`，或传传输部分配置                                 | `false` 表示禁用，其余返回完整 `KitTransportConfig`                    |
| `@h-ai/kit/crypto` 的 `transportEncryptionMiddleware` | `transportEncryptionMiddleware(transportConfig)`，可传按路径、方法判定加密模式的函数 | SvelteKit 请求中间件；应用负责初始化 Crypto 和密钥存储，并在退出时关闭 |

`client`、`resource` 和 `transportConfig` 分别为已创建的 Kit Client、应用定义的 CRUD 资源及校验完成的传输配置。

### 独立 A2A 路由工厂

以下入口由 `@h-ai/kit/a2a` 公开，供需要独立处理器或自定义请求管道的 SvelteKit 应用使用。使用 API Key 认证时先初始化 IAM。

| 入口                           | 使用与输入                                                                                    | 输出                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `createA2AApiKeyAuthenticator` | `createA2AApiKeyAuthenticator({ in: 'header', name: 'x-api-key' })`，指定请求头中的凭据名称   | 异步认证函数，用请求事件返回调用方身份及范围，认证失败返回 `null` |
| `createAgentCardHandler`       | `createAgentCardHandler(() => card)`，传入返回 Agent Card 文档的回调                          | 返回 JSON 文档的 SvelteKit GET `RequestHandler`                   |
| `createA2AHandler`             | `createA2AHandler(handleRequest, { authenticate })`，传入协议处理函数与认证函数               | SvelteKit POST `RequestHandler`，按处理结果返回 JSON 或 SSE       |
| `resolveA2AConfig`             | `resolveA2AConfig({ operations, rpcPath: '/a2a' })`，传入 `ai.a2a` 操作集或带路径与认证的配置 | `ResolvedA2AConfig \| null`                                       |
| `handleA2ARequest`             | `await handleA2ARequest(event, requestId, config)`，输入当前事件、关联编号及已解析配置        | 对匹配的路径返回 `Response`，其余返回 `null` 交给后续管道         |

`handleRequest` 可包装 `ai.a2a.handleRequest`，`card` 取自成功的 `ai.a2a.getAgentCard()`。更多协议操作见 [AI 的 A2A 边界](./ai.md#a2a-协议边界)。

<a id="host-options"></a>

SvelteKit 部署在 `/yyy` 等目录时，在 Vite 的 sveltekit 配置设置 `paths.relative: false`，从 `$app/paths` 用 `resolve('/').replace(/\/$/, '')` 读取构建挂载目录 `base`，在服务端 `crypto.transport` 传入 `basePath: base`，浏览器使用 `kit.client.installBrowserTransport(公开配置, { crypto, basePath: base })`。独立 Kit client 的 `transport.basePath` 采用同一个值。默认空字符串表示根目录；它是宿主构建参数，不在 YAML 重复配置。这样 `/yyy/api/*` 的默认加密范围与页面目录保持一致，交换路径和排除列表仍填写完整请求路径。

## Hooks 参数与运行时依赖

在服务端代码中调用 `kit.createHandle()` 时传这些参数。地址等设置可以来自 `_kit.yml`，函数、私钥和已初始化的存储对象由服务端代码提供。

| 参数 | 默认与用途 | 输入改变后的结果和限制 |
| --- | --- | --- |
| `auth.verifyToken` / `operations` | auth 省略时不自动认证；提供 auth 时 verifyToken 必填 | 校验 Bearer/Cookie 并得到会话；operations 可用 `() => iam.auth` 延迟取已初始化实例 |
| `auth.cookieName` / `protectedPaths` / `publicPaths` / `loginUrl` | Cookie名 `hai_access_token`，路径由应用明确配置 | publicPaths 优先；匿名API返回401，页面按 loginUrl 跳转。路径含实际挂载目录 |
| `guards[].guard/paths/exclude` | 可省略，exclude 优先于 paths | auth 自动守卫之后检查业务权限；返回 allowed 不代替资源所有权校验 |
| `rateLimit` | 省略或 false 不启用；对象内 windowMs=60000、maxRequests=100 | 必须提供原子 `store`；超过每窗次数时拒绝。keyGenerator 选择稳定限流主体，onLimitReached 可返回安全响应 |
| `logging` / `logging.logBody` | 默认 true；logBody 默认不启用 | 请求日志用于关联诊断。正文可能有凭据和业务隐私，开启前明确脱敏与采集必要性 |
| `middleware` / `onError` | 可选；默认错误为安全500响应 | 自定义中间件在内置日志/限流之后；自定义异常响应同样不能泄露堆栈、SQL和密钥 |
| `crypto.encryptedCookies` / `cookieEncryptionKey` | 未列Cookie不加密；密钥可从 `HAI_KIT_COOKIE_KEY` 读取 | 指定Cookie保存为认证加密格式 `enc:v2`，读取时先验真；密钥必须为32个十六进制字符，缺失/非法时创建Handle失败 |
| `a2a.operations` / `cardPath` / `rpcPath` / `authenticate` | 显式接入；路径默认 `/.well-known/agent-card.json` 与 `/a2a` | 挂载Agent Card及协议入口；未提供authenticate即匿名，生产按实际需求提供apiKey或认证回调；不自动获得业务权限 |

例如只给业务偏好 Cookie 启用加密：

```ts
import { crypto } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

const ready = await crypto.init()
if (!ready.success) throw new Error(ready.error.message)
const handle = kit.createHandle({
  crypto: { crypto, encryptedCookies: ['order_preferences'] },
})
// 从 hooks.server.ts 导出 handle，先在服务端环境设置 HAI_KIT_COOKIE_KEY。
```

应用向 `order_preferences` Cookie 写入文本后，浏览器保存密文，服务端读取时解密为原文本。验证时可修改 Cookie 的加密值，确认服务端拒绝读取。示例只开启 Cookie 加密，可把这段设置合并到已有的请求处理函数中。密钥留在服务端。

## 错误处理

- 推荐使用 `kit.handler()` 包装 API 端点。
- `kit.validate.body` / `kit.guard.require` 抛出 `Response`，由 `kit.handler` 处理 API 控制流。页面 `load` 使用 `kit.guard.check` 和 SvelteKit `error`；校验查询参数用 `schema.safeParse` 后返回原生页面错误，不能直接抛 API Response。
- 非控制流异常会由 `kit.handler()` 统一转换为 `500 INTERNAL_ERROR` 响应。

### 错误提示与关联日志

`kit.response.fromError/fromResult` 保留安全的字段校验 `cause`、显式公开的 `publicExt`（映射为 `ext`）和 `httpStatus`。4xx 响应以 `debug` 记录错误码、状态和追踪编号。5xx 响应以 `error` 记录，并在服务端保留脱敏的异常诊断。

HTTP/UI 边界只对明确的有效 4xx 状态公开业务提示；错误缺少 `httpStatus` 或状态非法时按 500 返回安全提示。手写业务错误须提供完整错误定义或显式状态，不能依赖缺省状态展示原文。

`kit.response.validationError(errors)` 也沿用同一白名单：响应 `error.cause` 只含本地化的 `field/message`，不回显 rejectedValue、SQL 或其他额外字段，字段校验从 `error.cause` 读取。

快捷响应、认证守卫和限流均使用 `HaiCommonError` 标准错误码，附带 `httpStatus`、`traceId` 与 `X-Trace-Id`。未认证返回 `UNAUTHORIZED.code`，无权限返回 `FORBIDDEN.code`，限流返回 `RATE_LIMIT_EXCEEDED.code`（429）；限流存储故障返回安全的 503，原始原因只记服务端日志。

HTTP 错误向浏览器返回当前语言的提示和追踪编号。编号既在响应的 `error.traceId`，也在 `X-Trace-Id` 响应头，等于本次请求的 `requestId`。用户可在 Toast 的排查信息中展开并复制编号，开发人员可用它查找前后端日志。异常详情、堆栈和操作信息去除凭据后写入服务端日志。字段校验仅返回字段名和可显示的错误提示。

服务端把错误发给浏览器之前，可用 `core.error.toPublic(error, traceId)` 去除内部信息。界面需要重新显示错误时，可用 `core.error.formatMessage(error)` 格式化提示，重复调用也只附一次追踪编号。

写服务端日志时传入完整的 Error 对象，保留堆栈和错误原因。数据库操作失败时，可按驱动错误码、表和列定位问题。日志不记录 SQL 原文、参数值或数据库凭据。

audit 已初始化时，createHandle 为业务 audit.log 绑定已验证会话的身份/角色快照、平台 getClientAddress 地址和请求编号。自动入口事件 request.execute 包含路由模板、方法、状态和成功/失败/拒绝，包含守卫跳转及 SvelteKit HTTP 控制流；不复制请求体或错误详情。capture.enabled 可关闭自动采集，capture.includeReads 可开启成功读取；默认保留失败读取、跳过成功读取。业务含义仍在应用完成/失败边界显式记录，关闭自动采集不影响业务 log。
