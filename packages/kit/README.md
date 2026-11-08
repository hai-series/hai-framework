# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md) · [@h-ai/iam](../iam/README.md)

`@h-ai/kit` 是 hai-framework 的 SvelteKit 集成模块，提供统一的请求管道与同源 endpoint 工具：

运行时统一通过 `kit.xx` 使用。根入口公开 `KitFunctions`（服务端）和 `BrowserKitFunctions`（浏览器）命名空间类型，浏览器条件入口的 `kit` 仅包含客户端、CRUD、页面 Token 与默认语言操作。`AuthCookieWriter` 是服务端认证对当前请求 Cookie 的最小写入契约。导出这些方法或命名空间时，可直接生成消费者声明，无需导入内部 helper。

- `kit.createHandle()`：会话解析、路由守卫、中间件链、可选传输加密与 Cookie 加密
- `kit.handler()`：API 端点异常边界
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`

> 公共跨端 HTTP API contract 统一放在 `@h-ai/api-contract`，由 `@h-ai/serv` 挂载，客户端通过 `@h-ai/api-client` typed client 调用；`@h-ai/kit` 不定义也不承载业务 API contract。

## 快速开始

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

## 功能

### 用途、输入与输出

下表的调用片段复用本页已初始化的服务；命名变量代表应用已提供的请求、Schema、资源定义或配置。完整步骤和失败处理见对应功能示例。`HaiResult` 先判断 `success`，异步项按签名 `await`。

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

### 搭建请求管道

应用部署在 `/yyy/` 等子目录时，SvelteKit 的 `paths.base` 与守卫使用的实际 URL 应保持一致：将 `resolve('/').replace(/\/$/, '')`（配置 `paths.relative: false`） 加到 `protectedPaths`、`publicPaths` 和 `loginUrl`，例如 `${base}/api/*`。认证页面使用 ``kit.client.createAuthActions({ basePath: `${base}/api/auth` })``。Kit 根据应用路由识别 `/api/*`，包括路由分组和挂载前缀；未认证的 API 返回 401，页面按配置跳转登录。生成模板已处理这些路径。

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
      return verified.success ? verified.data : null
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

部署到子目录时，配置 `paths.relative: false`，从 `$app/paths` 以 `resolve('/').replace(/\/$/, '')` 得到 `base`：服务端 `crypto.transport` 传入 `basePath: base`，浏览器调用 `installBrowserTransport(kitConfig, { crypto, basePath: base })`；独立 `kit.client.create` 的 `transport.basePath` 采用同一值。默认空字符串表示域名根目录。这个运行时参数来自宿主的构建目录，不在 YAML 另设一份，也不从转发头推断。`keyExchangePath`、`excludePaths` 和路由容量仍使用完整请求路径。CLI 的 SSR 模板已同步装配。

**src/hooks.server.ts**：

```ts
import { resolve } from '$app/paths'
import { cache } from '@h-ai/cache'
import { createRedisTransportKeyStore, crypto, parseTransportServerKeyRing } from '@h-ai/crypto'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { appKitConfig } from '#lib/server/kit-config.js'

const base = resolve('/').replace(/\/$/, '')

const cryptoReady = await crypto.init()
if (!cryptoReady.success)
  throw new Error(cryptoReady.error.message)
const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
if (!ring.success)
  throw new Error(ring.error.message)
const serverKeyRing = ring.data
// Redis/IAM 由应用启动流程初始化并检查；此处复用同一实例。

export const handle = kit.createHandle({
  auth: {
    verifyToken: async (token) => {
      const verified = await iam.auth.verifyToken(token)
      return verified.success ? verified.data : null
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
          keyStore: createRedisTransportKeyStore({ cache, ttlSeconds: 3600 }),
        },
  },
})
```

**src/routes/+layout.svelte**（推荐入口：浏览器端只需一行）：

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

服务端必须显式注入相同的受管 `serverKeyRing` 和共享 `keyStore`（Redis 或共享数据库）。仅共享客户端公钥不足以跨节点解密。没有隐式进程私钥或内存 registry 回退；开发/测试显式用 `createInMemoryKeyStore(capacity)`。服务端重启后重新加载同一密钥环即可，无需 sticky session。

transport 默认作用于同源 `/api/*` endpoint 与 SvelteKit `__data.json` 页面数据请求（以及密钥协商端点本身）；页面文档与静态资源仍保持明文，不要求携带 `X-Client-Id`。文件上传等 `multipart/form-data` 请求会保持原样发送，需在服务端 `excludePaths` 中显式放行对应上传路径。

传输使用认证 v2 封装，先验签和 MAC 再解密，并绑定方法、路径、时间与响应状态。共享 registry 原子消费 nonce；TLS、可信代理、业务授权及幂等仍由宿主负责。自定义跨域入口须允许并暴露 `X-Hai-Transport`。完整字段、无正文响应、时钟窗口和防重放要求统一见 [Transport 协议](../crypto/TRANSPORT-PROTOCOL.md)。

业务容量通过 `transport.maxPlaintextBytes` 统一配置：默认 1 MiB，整数范围 1 KiB～64 MiB，请求和响应共用 UTF-8 明文字节预算。客户端从握手自动获取上限，密文与部署代理预算由 `resolveTransportBodyLimits()` 推导（两倍明文 + 32 KiB）。握手、公钥、认证头和防重放约束独立；超限取消原流并释放 reader，请求 413、响应为加密的 500 容量错误，客户端识别 `TransportBodyTooLargeError` / `hai:crypto:070`。 [Transport capacity and upgrade](../crypto/TRANSPORT-CAPACITY.md)。

普通业务仍使用 `transport.maxPlaintextBytes`（auto/省略为 1 MiB）；Feedback 的报告受理、证据、附件及 ZIP 下载路由通过 `routePlaintextBytes` 单独声明 `feedback.budget.maxTransportBytes`。路径中的 `*` 仅匹配一个完整路径段；宿主显式路由值优先。握手、adapter-node 与代理使用各路由最大容量，普通业务不会随材料预算扩大。HTTP 适配器为单独声明且大于 1 MiB 的材料路由保留最多 2 个槽，普通业务另有 16 个槽，完整响应/失败后释放；忙碌返回 503 / `hai:crypto:072`，不自动重放业务写入。

Serv/Kit 对通过请求绑定、签名和 MAC 校验但超出时间窗口的请求返回加密的 HTTP 400 错误。客户端抛出 `TransportTimeError`（`hai:crypto:071`），显示校验时的服务器 UTC 时间，提示开启设备的自动校时或手工修改时间后刷新。`serverTime` 为 Unix 毫秒，旧服务端未提供该值时仍显示校时提示。`api-client` 映射为 `VALIDATION_FAILED`，在 `cause.transportCode` 和 `cause.serverTime` 保留诊断信息。标准认证动作将已认证的传输时间错误转为 `HaiResult`，保留校验时间和校时提示，AuthPanel 可直接展示。

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

// 仅放在 src/lib/server 中；浏览器通过 layout data 接收公共投影。
const loaded = core.config.load('kit', './config/_kit.yml', KitConfigSchema)
if (!loaded.success)
  throw new Error(loaded.error.message)
export const appKitConfig = loaded.data
export const publicKitConfig = { transport: appKitConfig.transport }
```

在 `src/routes/+layout.server.ts` 将公共投影交给上述浏览器布局，不导入服务端配置文件：

```ts
import { publicKitConfig } from '#lib/server/kit-config.js'

export function load() {
  return { kitConfig: publicKitConfig }
}
```

`resolveKitConfig()` 同时解析 `server` （host/port）与 `transport`；host/port 优先级为 `HOST` / `PORT` 环境变量 > `_kit.yml` 的 `server` > 默认 `127.0.0.1:3000`，供 SvelteKit 服务器入口统一消费（与 `@h-ai/serv` 同构）。
如只在服务端读取配置，也可配合 `core.config.validate('kit', KitConfigSchema)` 使用。
完整 `_kit.yml` 由服务端读取，可包含内部代理网段和访问策略文件路径。`+layout.server.ts` 只返回 `{ kitConfig: publicKitConfig }` 等明确公共投影，浏览器消费其中的 transport；禁止用 `?raw` 把完整配置或策略文件打入客户端，也不要在其中写入密钥。

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

协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

路由直接导出 `kit.auth.createApi(iam)` 的 login、loginWithOtp、loginWithLdap、register、publicConfig、sendOtp、requestPasswordReset、confirmPasswordReset handler；自动执行 schema 验证、Cookie 设置和 HaiResult 映射。匿名白名单使用 `kit.auth.publicPaths`，不会放开 /me 和改密端点。浏览器用 `kit.client.createAuthActions({ apiFetch })` 直接连接 AuthPanel，复用 CSRF/transport。

[完整 IAM 配置 / IAM configuration](../iam/README.md)

`kit.auth.logout(cookies, accessToken)` 返回 `Promise<HaiResult<void>>`。无令牌时仅清除 Cookie 并成功；有令牌但未配置认证操作时返回失败。无论服务端结果如何都清除本地 Cookie，调用方仍必须把失败转换为错误响应或提示；仅成功结果代表服务端撤销已经确认。底层控制流异常继续传播。

### CRUD fields

声明式 CRUD 字段支持 `colSpan: 'auto' | 1 | 2`，供 UI 双列表单决定字段宽度；`validation.message` 支持字符串或 `() => string`，便于随当前语言显示校验错误。UI 布局在 `CrudPage.form` 上配置，服务端仍须独立校验。

### 请求语言隔离

Node 请求与 SSR 使用 `core.i18n.runWithLocale(locale, () => handleRequest())`；SvelteKit 可使用 `kit.i18n.runWithLocale(locale, () => resolve(event))`，serv 自动按请求头建立上下文。异步子任务继承请求语言，优先级为显式 `MessageOptions.locale`、请求语言、进程启动默认语言。`setGlobalLocale` 在请求上下文中只更新当前请求；上下文外仅用于启动默认值，不能在请求 hook 中调用它修改默认值。

浏览器继续使用应用级 `setGlobalLocale` / `createLocaleStore`。SSR 的 UI store 初始化和 setter 只修改自身状态，不写全局语言；UI 消息从请求上下文读取。`runWithLocale` 仅支持 Node 入口，浏览器通过显式 locale 或应用状态翻译。

### 反馈接口与普通请求关联

`kit.createFeedbackHandler` 可作为 `/api/feedback/[...path]/+server.ts` 的 GET/POST/PATCH handler，复用 api-contract schema，与 serv 使用同一数据契约；输入流受大小上限约束，客户端身份/租户字段被拒绝。宿主通过 resolveContext 从已经验证的 locals.session 映射范围和权限，null 拒绝访问，并保留现有 createHandle 的 CSRF、认证与传输加密。

createHandle 保留有效且有界的入站 X-Request-Id，补写响应头，并为异步业务传递请求 ID 和已验证用户。需要收集普通业务后端日志时，在宿主 middleware 中以 `core.context.run({ scopeId: 'configured-product' }, next)` 包住实际业务；该可信范围应与反馈接口一致，不能从客户端头推导。

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

策略、默认值和恢复边界见 [IAM](../iam/README.md)。

### 原地恢复过期会话

配置 `kit.client.create({ recoverSession })` 回调可在服务端明确拒绝会话时原地重新登录并保留页面输入。使用 `@h-ai/ui` 的 `createSessionRecovery` / `SessionRecoveryDialog`：根布局绑定公开配置与原用户，回调设为 `recovery.recover`，弹窗使用标准认证 actions，销毁时 `cancel()`。登录的 `expectedUserId` 由 IAM 限定原主体；常规验证码、锁定、改密和登录限制照常执行。只对明确未认证拒绝的原请求续接一次；取消、5xx、超时和结果不明的网络写入不重放。敏感操作证明绑定旧会话时可能需要再次确认，不复用到新会话。标准认证动作显式禁用自身的恢复重试，避免错误密码递归打开弹窗。自定义认证请求应传第三个参数 `{ recoverSession: false }`。终端分组通过 terminalType（web/app/desktop/api，默认 web）传入；它不是硬件身份认证。

### 页面离开会话策略

`session.endOnPageHide` 默认 `false`。启用后宿主调用 `actions.bindPageExit({ enabled: config.session.endOnPageHide })` 并在卸载时调用返回的清理函数；标准 admin/H5/fullstack 模板已经接入。非 BFCache 的 `pagehide`（也包括刷新、整页导航）通过 POST `/auth/session/close` 尽力撤销当前 access 及关联 refresh，沿用 CSRF/传输加密，使用 `keepalive` 且不自动刷新会话。该响应不清 Cookie/本地凭据，避免旧响应覆盖下一次登录。显式退出仍使用正常 logout，可靠撤销并清理当前凭据。浏览器可能不发送页面离开请求，因此必须按业务配合服务端 `idleTimeout`/`absoluteTimeout`；不能据此保证关闭即撤销。

### 每次请求的访问控制

路径规则的 `encryption` 可选 required / disabled，省略沿用宿主。disabled 不解密请求或加密响应，仍执行访问和身份检查；不接受框架传输信封。required 可保护自定义 JSON 端点并优先于 `excludePaths`，没有 Crypto、密钥环和 registry 时不能启用。模式冲突在创建 Handle 时拒绝。CLI 的 crypto 模板同步装配服务端和浏览器，生产选择 db 和共享数据库；策略及代理配置不下发浏览器，明文调用方按公开传输排除路径选择协议。

将服务端 `_kit.yml` 的 `trustedProxies` 和 `access` 显式传给 `kit.createHandle`。示例和生成模板在应用初始化后只创建一次 Handle。`access` 默认为 `false`；内联 `{ rules: [{ id: 'external', paths: ['/api/v1/external/**'], allowIps: ['192.0.2.0/24'] }] }` 只限制匹配接口，`global` 则限制宿主处理的全部请求。实际路径包含部署前缀；静态服务器直接返回的资源不经过 Handle。

独立文件使用 `access: { file: './config/security/request-access.yml' }`，按工作目录解析，启动读取一次，最大 1 MiB，修改后重建 Handle。全局与所有匹配规则取交集，空列表不限对应维度，时区默认 UTC。时间窗口结束后，已有会话的后续请求同样被拒绝。预检和密钥交换也执行策略；普通 transport 请求的 HTTP 403 / `hai:common:104` 保留响应加密。

`trustedProxies: auto` 在普通宿主不信任转发头；受管 Compose 只有后端私有且存在入口代理时才采用容器网段。自管入口显式指定代理 IP/CIDR，`[]` 可关闭。解析后的 `event.getClientAddress()` 与策略、IAM、审计使用相同地址。外层代理、不可恢复的源地址丢失、环境变量与部署回滚见[请求访问控制手册](../../docs/usage/configuration/request-access.md)。

## 配置

### 按场景选择配置入口

| 配置入口                                  | 场景             | 输入                                                             | 生效结果                                                      | 示例                                            |
| ----------------------------------------- | ---------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| `server.host / server.port`               | 服务监听         | host string, port integer; HOST/PORT override                    | resolved Kit server config; default 127.0.0.1:3000            | `server: { host: 127.0.0.1, port: 3000 }`       |
| `transport`                               | 同源认证加密     | false or keyExchangePath/excludePaths/byte/time/route budgets    | public transport config for hook and browser; no private keys | `transport: { maxPlaintextBytes: auto }`        |
| `trustedProxies`                          | 可信连接来源     | auto or explicit IP/CIDR list; [] disables forwarded headers     | normalized client address for access policy                   | `trustedProxies: []`                            |
| `access`                                  | 请求访问策略     | false or independent policy configuration                        | per-request IP/time/path checks; not business ownership       | `access: false`                                 |
| `createHandle.auth / guards / middleware` | 宿主鉴权管道     | verifyToken/operations, paths and guard/middleware callbacks     | RequestEvent locals/session and rejection Response            | `kit.createHandle({ auth: authOptions })`       |
| `createHandle.rateLimit`                  | 共享限流         | windowMs, maxRequests and explicit atomic store                  | fixed window; 429 over quota, 503 on unavailable storage      | `kit.createHandle({ rateLimit: limitOptions })` |
| `createHandle.crypto`                     | 注入私密运行依赖 | initialized crypto, serverKeyRing/keyStore, encryptedCookies/key | authenticated payload/cookies; ring stays server-only         | `kit.createHandle({ crypto: cryptoOptions })`   |
| `client.create`                           | 浏览器请求选项   | auth memory store, CSRF names, transport, recoverSession         | same-origin apiFetch plus init/destroy/ready                  | `kit.client.create({ auth: true })`             |

使用 pnpm 构建 Svelte 应用时，工程需要在 `patchedDependencies` 注册 `deepmerge@4.3.1` 对应的补丁，并保留实际 patch 文件；采用 DaisyUI 时同样保留其样式补丁。CLI 生成工程已携带适用项。安装框架 npm 包不会把框架仓库的 pnpm 补丁配置自动传递到你的工程，手工接入应同步[补丁目录](../../patches/)及相应注册后重新安装依赖。

`kit.createHandle()` 配置项：

| 字段             | 类型                                     | 说明                                                               |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| `auth`           | `HandleAuthConfig`                       | 认证配置（verifyToken / protectedPaths / publicPaths / loginUrl）  |
| `trustedProxies` | `TrustedProxies`                         | 默认 `auto`；普通宿主忽略转发头，受管私有 Compose 代理采用容器网段 |
| `access`         | `RequestAccessConfigInput`               | 默认 `false`；按路径、IP 和时间检查每次请求，可引用独立 YAML       |
| `rateLimit`      | `object \| false`                        | 速率限制（windowMs / maxRequests）                                 |
| `logging`        | `boolean \| object`                      | 请求日志（默认 `true`，`{ logBody: true }` 记录请求体）            |
| `crypto`         | `HookCryptoConfig`                       | 传输加密 + Cookie 加密                                             |
| `guards`         | `GuardConfig[]`                          | 自定义守卫（在 auth 自动守卫之后执行）                             |
| `middleware`     | `Middleware[]`                           | 自定义中间件（在内置中间件之后执行）                               |
| `a2a`            | `HandleA2AOperations \| HandleA2AConfig` | A2A 协议集成（Agent Card + JSON-RPC）                              |
| `onError`        | `function`                               | 自定义错误处理                                                     |

请求/响应摘要使用 `trace` 日志级别；`logging` 默认开启，`logBody` 默认关闭。日志查询从原始 `request.url` 读取，路径保留 SvelteKit 当前路由的 `event.url.pathname`，不会读取预渲染受限的 `event.url.search/searchParams`；静态页无需为构建关闭日志。查询和启用后的 JSON 正文在日志入口对 password/token/secret、授权/API Key 等字段脱敏，正文使用请求副本读取，不影响业务处理。

请求自动审计仅在 `audit.isInitialized` 时执行，纯静态站点或未选 Audit 的应用无需为 handle 初始化它。该状态在每个请求中判断，因此 handle 可先创建、模块随后初始化。选择了 Audit 的应用仍必须检查 `audit.init()` 结果并在失败时停止启动；业务显式 `audit.log/capture` 的未初始化错误不变，已初始化模块的真实写入失败仍记录 `Request audit failed`。需要强制审计的业务应检查显式审计结果，并按业务事务约束提交。

配置 `crypto.encryptedCookies` 时必须同时提供 `crypto.cookieEncryptionKey`，或设置 `HAI_KIT_COOKIE_KEY`。缺少密钥会在 `createHandle()` 时立即报错；受保护 Cookie 的明文、损坏密文或解密失败都按不存在处理，加密失败也不会回退写入明文。

密钥必须是 32 位十六进制字符串。Cookie 使用独立派生的 SM4-CBC/HMAC-SHA256 密钥，认证版本、Cookie 名、IV 与密文后才解密，防止修改或跨名称替换。未通过认证的 Cookie 按无效处理。

认证 Cookie 的 `Secure` 默认值在 `NODE_ENV` 或 `HAI_CORE_ENV` 为 `production` 时开启，`HAI_E2E` / `HAI_E2E_MOCK` 不降低 Cookie 安全要求。生产限流同样识别这两个环境标志；仅显式测试开关可放宽内存计数器限制。

### 传输容量与模块预算

配置 `transport.maxPlaintextBytes` 支持 1 KiB～64 MiB 的显式整数或 `auto`。auto/省略在解析后为 undefined：无模块需求时仍为 1 MiB，反馈宿主使用 resolveTransportBodyLimits 的 requiredPlaintextBytes 统一推导。显式上限不足时启动/打包失败，不能被反馈覆盖；代理、adapter-node、握手与运行时使用一致预算。业务附件、解压和数据行数上限继续独立校验。

敏感调用通过本次 `reauthorize: () => sensitiveActions.authorize(operation)` 重新确认用途：Kit 放 apiFetch 第三参数，typed client 放 options.context。会话刷新/恢复或明确的再认证拒绝后仅续发一次；取消不写入，未提供回调不重放旧证明。

## 错误处理

- 推荐使用 `kit.handler()` 包装 API 端点。
- `kit.validate.body` / `kit.guard.require` 抛出 `Response`，由 `kit.handler` 处理 API 控制流。页面 `load` 使用 `kit.guard.check` 和 SvelteKit `error`；校验查询参数用 `schema.safeParse` 后返回原生页面错误，不能直接抛 API Response。
- 非控制流异常会由 `kit.handler()` 统一转换为 `500 INTERNAL_ERROR` 响应。

### 错误提示与关联日志

`kit.response.fromError/fromResult` 保留安全的字段校验 `cause`、显式公开的 `publicExt`（映射为 `ext`）和 `httpStatus`；任意内部 cause/ext 不公开。每次模块失败只写一条关联日志。

HTTP/UI 边界只对明确的有效 4xx 状态公开业务提示；错误缺少 `httpStatus` 或状态非法时按 500 返回安全提示。手写业务错误须提供完整错误定义或显式状态，不能依赖缺省状态展示原文。

`kit.response.validationError(errors)` 也沿用同一白名单：响应 `error.cause` 只含本地化的 `field/message`，不回显 rejectedValue、SQL 或其他额外字段，字段校验从 `error.cause` 读取。

快捷响应、认证守卫和限流均使用 `HaiCommonError` 标准错误码，附带 `httpStatus`、`traceId` 与 `X-Trace-Id`。未认证返回 `UNAUTHORIZED.code`，无权限返回 `FORBIDDEN.code`，限流返回 `RATE_LIMIT_EXCEEDED.code`（429）；限流存储故障返回安全的 503，原始原因只记服务端日志。

HTTP 错误返回本地化安全文案及追踪编号；ToastContainer 默认隐藏编号，由排查信息图标展开和复制。响应同时包含 `error.traceId` 和 `X-Trace-Id`。框架复用本次 requestId 作为 traceId，前后端日志自动关联。底层异常、堆栈和操作上下文经凭据脱敏后写入日志，不通过 cause/ext 向用户公开。字段校验只返回本地化的字段名和错误。

`core.error.toPublic(error, traceId?)` 用于接口/UI 边界；`core.error.formatMessage(error)` 用于重新翻译后的提示，重复调用不会重复追加标识。日志传入完整 Error 对象，不能只记录通用标题或提前 String(error) 丢失上下文。数据库失败记录驱动错误码、消息、堆栈及表/列；SQL 原文、绑定值和连接凭据不进入日志。

audit 已初始化时，createHandle 为业务 audit.log 绑定已验证会话的身份/角色快照、平台 getClientAddress 地址和请求编号。自动入口事件 request.execute 包含路由模板、方法、状态和成功/失败/拒绝，包含守卫跳转及 SvelteKit HTTP 控制流；不复制请求体或错误详情。capture.enabled 可关闭自动采集，capture.includeReads 可开启成功读取；默认保留失败读取、跳过成功读取。业务含义仍在应用完成/失败边界显式记录，关闭自动采集不影响业务 log。

## 开发测试

```bash
pnpm --filter @h-ai/kit test
```

模块无统一 init/close；共享缓存、IAM 与 crypto 由应用启动时初始化并统一关闭。示例使用真实公开入口并作类型检查，见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)。请求认证必须调用 iam.auth.verifyToken，不能把非空 token 视为有效身份。

## 许可证

Apache-2.0
