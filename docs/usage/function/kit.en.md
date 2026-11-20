# @h-ai/kit API reference

<!-- translation: partial -->

[Chinese source](kit.md) · [Configuration](../configuration/kit.en.md) · [Data structures](../data/kit.en.md)

## Quick start

Use Kit in SvelteKit hooks, route handlers and the browser client. Server code protects routes and validates input as well as translating domain results into HTTP responses.

```bash
npm install @h-ai/kit @h-ai/core sm-crypto@0.5.8
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite
```

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

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

<a id="hooks"></a>

### Compose SvelteKit hooks: `kit`

Compose authentication, access, rate limits and locale into hooks; map failures safely at the handler boundary.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.createHandle` | 请求管道 | `HandleConfig: auth/guards/logging/rateLimit/crypto/access` | `SvelteKit Handle` | `kit.createHandle({ logging: true })` |
| `kit.sequence` | 组合 Hook | `...Handle` | `Handle preserving resolve options` | `kit.sequence(i18nHandle, authHandle)` |
| `kit.handler` | 端点异常边界 | `(RequestEvent) => Response \| Promise<Response>` | `SvelteKit request handler` | `kit.handler(async () => kit.response.ok({ ready: true }))` |
| `kit.middleware.rateLimit` | 固定窗口限流 | `{ windowMs, maxRequests, store, ...options }` | `Middleware; 429 on quota and 503 on store failure` | `kit.middleware.rateLimit({ windowMs: 60000, maxRequests: 100, store })` |
| `kit.middleware.createCacheRateLimitStore` | 共享计数器 | `initialized shared cache, { namespace, allowMemory? }` | `RateLimitStore` | `kit.middleware.createCacheRateLimitStore(cache, { namespace: "orders" })` |
| `kit.middleware.createMemoryRateLimitStore` | 开发计数器 | `none; development or explicit test only` | `MemoryRateLimitStore` | `kit.middleware.createMemoryRateLimitStore()` |
| `kit.i18n.setLocale` | 启动默认语言 | `locale string` | `void; do not change process default per request` | `kit.i18n.setLocale("zh-CN")` |
| `kit.i18n.runWithLocale` | 请求语言隔离 | `locale, callback; Node server only` | `same callback return value` | `kit.i18n.runWithLocale("en-US", () => resolve(event))` |

#### Scenario: Compose SvelteKit hooks

The workflow starts with createHandle and sequence, using an application-initialized Cache for rate-limit storage. Limits return 429, store failures 503. Locale callbacks preserve their result; do not mutate global defaults per request.

<a id="host-options"></a>

#### Hook arguments and runtime dependencies

This integration guide was moved from the configuration handbook because it describes code arguments. The complete walkthrough is currently available in [Chinese](kit.md#host-options); this subsection is partially translated.

[Detailed parameters and workflows](kit.md#hooks)

<a id="responses"></a>

### Validate and respond: `kit.validate`, `kit.response`

Parse endpoint input before constructing success, no-content, validation or domain-error responses.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.response.ok` | 成功响应 | `data, requestId?` | `Response with HTTP 200 and success data` | `kit.response.ok({ id: "o1" })` |
| `kit.response.created` | 创建响应 | `data, requestId?` | `Response with HTTP 201 and success data` | `kit.response.created({ id: "o1" })` |
| `kit.response.noContent` | 无正文 | `none` | `Response with HTTP 204` | `kit.response.noContent()` |
| `kit.response.error` | 指定失败 | `code, message, status?, requestId?, public details?` | `safe failure Response` | `kit.response.error("app:orders:001", "请求无效", 400)` |
| `kit.response.badRequest` | 无效请求 | `message, requestId?` | `HTTP 400 Response` | `kit.response.badRequest("Invalid request")` |
| `kit.response.unauthorized` | 未认证 | `message?, requestId?` | `HTTP 401 Response` | `kit.response.unauthorized()` |
| `kit.response.forbidden` | 无权限 | `message?, requestId?` | `HTTP 403 Response` | `kit.response.forbidden()` |
| `kit.response.notFound` | 未找到 | `message?, requestId?` | `HTTP 404 Response` | `kit.response.notFound()` |
| `kit.response.conflict` | 版本冲突 | `message, requestId?` | `HTTP 409 Response` | `kit.response.conflict("Data changed")` |
| `kit.response.validationError` | 字段校验 | `{ field, message }[], requestId?` | `HTTP 422 Response; errors in safe error.cause` | `kit.response.validationError([{ field: "title", message: "请输入标题" }])` |
| `kit.response.internalError` | 内部失败 | `message?, requestId?` | `HTTP 500 Response with safe message` | `kit.response.internalError()` |
| `kit.response.redirect` | 重定向 | `location, status?` | `redirect Response` | `kit.response.redirect("/auth/login")` |
| `kit.response.fromResult` | 映射领域结果 | `HaiResult<T>, httpStatusMap?, requestId?` | `HTTP Response; preserves safe code/status/traceId` | `kit.response.fromResult(result)` |
| `kit.response.fromError` | 映射领域错误 | `HaiError, requestId?` | `safe HTTP failure Response` | `kit.response.fromError(result.error)` |
| `kit.validate.body` | JSON/表单校验 | `Request, Zod schema` | `Promise<schema data>; invalid input throws Response` | `kit.validate.body(request, InputSchema)` |
| `kit.validate.query` | 查询校验 | `URL, Zod schema` | `schema data; invalid input throws Response` | `kit.validate.query(url, QuerySchema)` |
| `kit.validate.params` | 路径参数校验 | `Record<string,string>, Zod schema` | `schema data; invalid input throws Response` | `kit.validate.params(params, IdSchema)` |
| `kit.validate.IdParamSchema` | 通用资源编号 | `{ id: string }` | `Zod parsed ID object` | `kit.validate.IdParamSchema.parse({ id: "o1" })` |
| `kit.validate.PaginationQuerySchema` | 分页输入 | `page/pageSize/search query` | `normalized pagination object` | `kit.validate.PaginationQuerySchema.parse({ page: "1" })` |

#### Scenario: Validate and respond

```ts
import { ok } from '@h-ai/core'
import { z } from 'zod'
const schema = z.object({ title: z.string().min(1) })
const request = new Request('https://app.example.com/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Order' }) })
// Validate the sample JSON POST body with the title schema. On success body is { title: 'Order' }. Invalid JSON or fields fail validation.
const body = await kit.validate.body(request, schema) // { title: 'Order' }
// Parse page=1 from this URL and normalize it with pagination defaults. Invalid query values fail validation.
kit.validate.query(new URL('https://app.example.com/?page=1'), kit.validate.PaginationQuerySchema) // normalized page
// Validate the sample route parameters. id remains o1 and invalid values fail validation.
kit.validate.params({ id: 'o1' }, kit.validate.IdParamSchema) // { id: 'o1' }
// Validate the same id with the schema directly. Returns { id: 'o1' } or throws a Zod error.
kit.validate.IdParamSchema.parse({ id: 'o1' }) // { id: 'o1' }
// Convert the query string page to a numeric page and fill its defaults. An invalid page throws a Zod error.
kit.validate.PaginationQuerySchema.parse({ page: '1' }) // normalized page defaults
// Wrap the validated order body as a successful JSON response with status 200.
kit.response.ok(body).status // 200
// Return a success envelope for the new order o1 with status 201.
kit.response.created({ id: 'o1' }).status // 201
// Return an empty response with status 204.
kit.response.noContent().status // 204
// Return HTTP 400 with the supplied Invalid request message.
kit.response.badRequest('Invalid request').status // 400
// Return the default authentication error envelope with HTTP 401.
kit.response.unauthorized().status // 401
// Return the default permission-denied error envelope with HTTP 403.
kit.response.forbidden().status // 403
// Return the default missing-resource error envelope with HTTP 404.
kit.response.notFound().status // 404
// Use the supplied Data changed message for HTTP 409.
kit.response.conflict('Data changed').status // 409
// Include the supplied title field issue in the HTTP 422 response.
kit.response.validationError([{ field: 'title', message: 'Required' }]).status // 422
// Return the default internal-error envelope with HTTP 500.
kit.response.internalError().status // 500
// Create a redirect response whose Location is /auth/login.
kit.response.redirect('/auth/login').headers.get('location') // '/auth/login'
// Return the supplied app error code and message with HTTP 400.
kit.response.error('app:orders:001', 'Invalid request', 400).status // 400
// Wrap { id: 'o1' } in a successful HaiResult and convert it to HTTP 200. Failed results use their recorded error status.
kit.response.fromResult(ok({ id: 'o1' })).status // 200
```

Concrete JSON, query and path inputs produce the values and statuses shown. Invalid validate calls throw Response and belong inside a handler boundary. fromError accepts failed HaiResult.error, never raw private exception text.

[Detailed parameters and workflows](kit.md#responses)

<a id="auth"></a>

### Authentication cookies and guards: `kit.auth`, `kit.guard`

Check permissions against the current session on the server. Auth APIs manage cookies; UI permission matching does not grant server access.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.guard.check` | 检查权限 | `session, permission` | `boolean` | `kit.guard.check(session, "orders.read")` |
| `kit.guard.require` | 要求权限 | `session, permission` | `void; denied access throws Response` | `kit.guard.require(session, "orders.write")` |
| `kit.guard.requireSensitive` | 确认操作用途 | `initialized IAM, current RequestEvent request/cookies, operation` | `Promise<void>; invalid proof throws Response` | `kit.guard.requireSensitive(iam, event, "orders.approve")` |
| `kit.auth.publicPaths` | 匿名端点名单 | Obtain public authentication paths for authentication guards. | Obtain public authentication paths for authentication guards. | `kit.auth.publicPaths` |
| `kit.auth.createApi` | 认证 handler 集合 | `initialized IAM service` | `RequestHandler map for login/OTP/reset/config/etc.` | `kit.auth.createApi(iam)` |
| `kit.auth.login` | 密码登录 | `Cookie writer, PasswordCredentials, request context?` | `Promise<HaiResult<AuthResult>>; writes token cookies on success` | `kit.auth.login(cookies, { identifier: "alice", password })` |
| `kit.auth.loginWithOtp` | 验证码登录 | `Cookie writer, OtpCredentials, request context?` | `Promise<HaiResult<AuthResult>>` | `kit.auth.loginWithOtp(cookies, otpCredentials)` |
| `kit.auth.loginWithLdap` | LDAP 登录 | `Cookie writer, LdapCredentials, request context?` | `Promise<HaiResult<AuthResult>>` | `kit.auth.loginWithLdap(cookies, ldapCredentials)` |
| `kit.auth.loginWithApiKey` | API Key 登录 | `Cookie writer, ApiKeyCredentials, request context?` | `Promise<HaiResult<AuthResult>>` | `kit.auth.loginWithApiKey(cookies, apiKeyCredentials)` |
| `kit.auth.registerAndLogin` | 注册并登录 | `Cookie writer, RegisterOptions, request context?` | `Promise<HaiResult<AuthResult>>` | `kit.auth.registerAndLogin(cookies, registration)` |
| `kit.auth.logout` | 显式退出 | `Cookie writer, accessToken?` | `Promise<HaiResult<void>>` | `kit.auth.logout(cookies, accessToken)` |
| `kit.auth.setBrowserToken` | 页面内存凭据 | `access token string` | `void; no Web Storage persistence` | `kit.auth.setBrowserToken(accessToken)` |
| `kit.auth.clearBrowserToken` | 清理页面凭据 | `none` | `void` | `kit.auth.clearBrowserToken()` |
| `@h-ai/kit` 的 `matchPermission` | Match permissions for frontend display | `matchPermission('reports:read', ['reports:read'])` | `boolean` | `matchPermission('reports:read', ['reports:read'])` |

#### Scenario: Authentication cookies and guards

Authentication examples take cookies, forms and trusted request context and produce auth results plus cookie changes. check may return false; require throws Response on denial. Sensitive actions also require purpose-bound proof.

[Detailed parameters and workflows](kit.md#auth)

<a id="browser-client"></a>

### Connect a same-origin browser: `kit.client`

Use the client for same-origin cookies, CSRF and transport; components consume actions and results.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.client.create` | 同源客户端 | `KitClientConfig: auth/transport/recoverSession?` | `KitClient { apiFetch, init, destroy, ready }` | `kit.client.create()` |
| `kit.client.createAuthActions` | 标准认证动作 | `{ basePath?, ...auth client options }?` | `AuthPanel-compatible actions` | `kit.client.createAuthActions({ basePath: "/api/auth" })` |
| `kit.client.installBrowserTransport` | 按公共配置安装加密 | `public KitConfig, { crypto, basePath? }` | `void; installs same-origin global fetch wrapper when enabled` | `kit.client.installBrowserTransport(publicKitConfig, { crypto })` |
| `kit.client.installBrowserTransportFetch` | 自定义传输安装 | `ClientTransportConfig` | `void; installs browser global fetch wrapper` | `kit.client.installBrowserTransportFetch(transportOptions)` |
| `@h-ai/kit/client` 的 `createKitClient` | Create a same-origin client | `options?` | `KitClient` | `createKitClient({})` |
| `@h-ai/kit/client` 的 `createKitAuthActions` | Create same-origin authentication actions | `options?: { apiFetch, basePath, … }` | `AuthActions` | `createKitAuthActions({ apiFetch: client.apiFetch })` |
| `@h-ai/kit/client` 的 `createSvelteKitNavAdapter` | Adapt SvelteKit navigation for CRUD | `createSvelteKitNavAdapter()` | `CrudNavAdapter` | `createSvelteKitNavAdapter()` |

#### Scenario: Connect a same-origin browser

Run in a browser module with an existing same-origin /api/ping endpoint. Defaults create a client; apiFetch returns Response. Destroy on owner teardown. authActions and nav are UI-facing objects.

```ts
import { createKitAuthActions, createKitClient, createSvelteKitNavAdapter } from '@h-ai/kit/client'

// Create a browser client with defaults. The returned object has its own request and transport methods.
const client = createKitClient({}) // same factory as kit.client.create
// Bind authentication actions to that client's apiFetch.
const actions = createKitAuthActions({ apiFetch: client.apiFetch })
// Create a navigation adapter for the current SvelteKit runtime.
const nav = createSvelteKitNavAdapter()
// Initialize this client's transport if enabled. A failed enabled handshake rejects.
await client.init()
try {
  // Fetch /api/ping through the configured client. Inspect the returned HTTP status and handle network rejection as for fetch.
  const response = await client.apiFetch('/api/ping')
  const body: unknown = await response.json() // the application endpoint's JSON
  client.ready // whether an enabled transport session is ready
}
finally {
  // Destroy this client's transport state without changing other clients.
  client.destroy()
}
```

The factories return client, actions and navigation adapters. Initialize before apiFetch and destroy to release page resources. Named exports follow the same contracts and public entry paths.

[Detailed parameters and workflows](kit.md#browser-client)

<a id="crud"></a>

### Declare resources and form fields: `kit.crud`

Declare CRUD fields and operations, and authorize the principal and resource on every server operation.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.crud.define` | 声明 CRUD 资源 | `CrudResourceConfig` | `resource operation object` | `kit.crud.define(resourceDefinition)` |
| `@h-ai/kit` 的 `defineCrud` | Define a resource and form fields | `resource` | `CrudOperations<T>` | `defineCrud(resource)` |
| `@h-ai/kit` 的 `resolveText` | Resolve static or deferred text | `text: string \| (() => string)` | `string` | `resolveText('Name')` |
| `@h-ai/kit` 的 `resolveOptions` | Resolve static or deferred options | `options: array \| (() => array)` | `CrudOption[]` | `resolveOptions([{ label: 'Active', value: true }])` |

#### Scenario: Declare resources and form fields

resource contains application-owned fields and authorized callbacks typed by CrudResource. Both factories return resource operations without executing writes. true is an option value.

```ts
import { defineCrud, kit, resolveOptions, resolveText } from '@h-ai/kit'

function buildResource(resource: Parameters<typeof defineCrud>[0]) {
  // Build the operations for the supplied resource declaration.
  const operations = defineCrud(resource)
  // Build the equivalent operations through kit.crud using the same declaration.
  const equivalent = kit.crud.define(resource)
  // Evaluate the supplied label function. The resolved label is Name.
  const label = resolveText(() => 'Name') // 'Name'
  // Resolve the supplied Active option with boolean true. This array is returned as the available choices.
  const choices = resolveOptions([{ label: 'Active', value: true }]) // same option array
  return { operations, equivalent, label, choices }
}
```

The resource definition produces CrudOperations. resolveText returns text from a value or callback; resolveOptions returns option arrays. Definitions do not confer write permissions.

[Detailed parameters and workflows](kit.md#crud)

<a id="transport"></a>

### Assemble encrypted transport: client and middleware

Prepare Crypto and shared Cache, give public policy to the client and a trusted manager to the server.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `@h-ai/kit` 的 `resolveKitTransportConfig` | Resolve Kit transport arguments | `false \| partial transport options` | `false \| KitTransportConfig` | `resolveKitTransportConfig(false)` |
| `@h-ai/kit/crypto` 的 `transportEncryptionMiddleware` | Create transport authentication middleware | `transportConfig` | `Middleware` | `transportEncryptionMiddleware(transportConfig)` |

#### Scenario: Assemble encrypted transport: client and middleware

This covers ordinary business routes with transport enabled. Handshake, A2A, preflight and explicit plaintext paths have separate branches. Access decisions are computed first; ordinary denials run inside the authenticated transport boundary.

![Kit: an encrypted business request through Handle](../images/function-kit-request.en.svg)

Access or session/guard rejection prevents resolve. Transport encrypts normal responses and errors produced inside its boundary, followed by audit and response headers. Custom middleware must not treat encrypted bytes as business input; endpoints or load/actions still validate application data.

resolveKitTransportConfig returns false or complete options. The middleware returns a SvelteKit handler. Preserve real HTTP failures for overload and handshake errors; the application owns dependencies.

[Detailed parameters and workflows](kit.md#transport)

<a id="protocol-integrations"></a>

### Mount feedback and A2A routes: `kit`

Mount services at explicit paths with host-resolved trusted contexts and authorization. Route factories do not decide business ownership.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.createFeedbackHandler` | 受控反馈入口 | `{ feedback, resolveContext, ...options }` | `catch-all RequestHandler` | `kit.createFeedbackHandler({ feedback, resolveContext })` |
| `createA2AApiKeyAuthenticator` | Create an A2A API-key authenticator | `API-key location and name` | `A2AAuthenticator` | `createA2AApiKeyAuthenticator({ in: 'header', name: 'x-api-key' })` |
| `createAgentCardHandler` | Create an agent-card handler | `getAgentCard` | `RequestHandler` | `createAgentCardHandler(() => card)` |
| `createA2AHandler` | Create an A2A request handler | `handleRequest, options` | `RequestHandler` | `createA2AHandler(handleRequest, { authenticate })` |
| `resolveA2AConfig` | Resolve A2A arguments | `operations or integration options` | `ResolvedA2AConfig \| null` | `resolveA2AConfig({ operations, rpcPath: '/a2a' })` |
| `handleA2ARequest` | Handle an assembled A2A request | `event, requestId, config` | `Promise<Response \| null>` | `await handleA2ARequest(event, requestId, config)` |

#### Scenario: Mount feedback and A2A routes

Feedback, Agent Card GET and A2A POST examples take handlers and authenticators and produce JSON/SSE. Unmatched A2A dispatch returns null to continue the hook pipeline.

[Detailed parameters and workflows](kit.md#protocol-integrations)
