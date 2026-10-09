# @h-ai/serv

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/ai](../ai/README.en.md) · [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md) · [@h-ai/iam](../iam/README.en.md) · [@h-ai/storage](../storage/README.en.md)

> hai-framework's API service runtime: a stable public HTTP App abstraction that mounts `@h-ai/api-contract` contracts as cross-platform HTTP APIs. Hono is an internal implementation detail.

## Capabilities

- Start with `serv.createApp(...)` → `serv.listen(app, { port })`; applications need not import Hono.
- Flat API: `serv.createApp / serv.implement / serv.listen / serv.toFetch / serv.generateSpec / ...`.
- Procedure chains: `implement().context().route().auth/permission/role().handle().build()`.
- Custom pipelines: mount HTTP middleware with `createApp({ middlewares })`; inject request fields through context factories.
- Read-only storage assets: `serv.storageAssets(...)` handles safe keys, MIME allowlists, GET/HEAD, ETags, and cache headers.
- Default feature procedures: `createIamProcedures()`, `createStorageProcedures()`, `createAiProcedures()`.
- Built-in security headers and health checks; optional OpenAPI JSON, Scalar docs, and internal RPC endpoints.
- Optional transport encryption: `serv.createApp({ transport: { crypto } })` mounts key exchange and request/response encryption automatically.
- Optional audio: `serv.createApp({ audio: { ai, verifyTicket, authorize } })` mounts a unified audio WebSocket. Connections authenticate immediately with one-time tickets (`{ session, grant? }`, separate pre-auth timeout). Every frame uses runtime Zod validation and a strict state machine, with input/queue/send-buffer backpressure and cascading cancellation. Authorization verifies operations, models, voices, quotas, and concurrency on the server.

> Lifecycle: `@h-ai/serv` is a stateless HTTP App assembler and needs no `init()` / `close()`. Initialize `iam` / `storage` / `ai` / `crypto` before app creation, then release them in reverse order through `serv.listen(..., { onClose })`. `serv.createApp()` throws immediately on startup configuration errors such as transport manager creation failure.

## Quick start

```ts
import { apiContract } from '@h-ai/api-contract'
import { serv } from '@h-ai/serv'
import { createAiProcedures } from '@h-ai/serv/features/ai'
import { createIamProcedures } from '@h-ai/serv/features/iam'
import { createStorageProcedures } from '@h-ai/serv/features/storage'

// 1) 创建契约
const contract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

// 2) 组装 procedures（注入 iam / storage / ai 已初始化的 functions）
const procedures = {
  iam: createIamProcedures({ iam }),
  storage: createStorageProcedures({ storage }),
  ai: createAiProcedures({ ai }),
}

// 3) 创建 HTTP App
const app = serv.createApp({
  contract,
  procedures,
  http: {
    apiPrefix: '/api/v1',
    openapi: { path: '/openapi.json' },
    docs: { path: '/docs' },
  },
})

// 4) 启动 Node 服务（host/port 来自 _serv.yml 的 server；HOST/PORT 环境变量高于配置文件）
const { server } = core.config.getOrThrow<ServConfig>('serv')
serv.listen(app, {
  host: server.host,
  port: server.port,
  onListening: info => logger.info('API service listening', { port: info.port }),
  onClose: closeApp,
})

// 5) 优雅关闭由 serv 托管，无需手动注册 process.once('SIGINT', ...)
```

### host / port configuration

Host/port come from `server` in `config/_serv.yml`: `HOST` / `PORT` environment variables > configuration > `127.0.0.1:3000`. The default `127.0.0.1` is local-only; use `0.0.0.0` to expose a container:

```yaml
# config/_serv.yml
server:
  host: 127.0.0.1
  port: 3000
```

Pass the resolved `server` to `serv.listen`; explicit `host` / `port` arguments can also override it.

### Fetch Runtime（Workers / Bun / Deno）

```ts
const handler = serv.toFetch(app)
export default { fetch: handler }
```

### Audio WebSocket: tickets and server authorization

Audio connections require short-lived, one-time tickets. Issue them through an authenticated HTTP endpoint (recommended: `iam.ticket.issue`) and consume atomically in `verifyTicket` (recommended: `iam.ticket.consume`). Authentication runs at connection time with a separate timeout; no business frames are processed beforehand. The framework stores the returned `ServSession` and optional `grant`, then calls `authorize` to approve paid parameters:

```ts
const app = serv.createApp({
  contract,
  procedures,
  iam,
  audio: {
    ai,
    verifyTicket: consumeAudioTicket, // → HaiResult<{ session, grant? }>
    authorize: async (session, request, grant) => authorizeAudioRequest(session, request, grant),
    onSessionEnd: async (session, request) => releaseAudioConcurrency(session.userId, request.operation),
  },
})
```

- `verifyTicket(ticket)` must check purpose/expiration and allow one successful use, returning `HaiResult<AudioTicketVerification>` (`{ session, grant? }`). `grant` carries ticket-bound operation/model/session data.
- `authorize(session, request, grant)` checks IAM permissions, model/voice allowlists, Persona, quotas, and concurrency slots. Cross-check `start` against `grant`; only returned `AuthorizedAudioRequest` reaches `ai.audio`.
- Without `authorize`, client `model`, `voice`, and `instruction` are ignored. Only server defaults (or `grant.model`) are used; `start` mismatching `grant.operation` is rejected.
- Each frame is validated with Zod and a strict state machine: transcription accepts audio, synthesis accepts text, `start`/`done` occur once, and `segmentId` is unique per session. Input, pending-message, and send buffers are bounded; limits or cancellation close with domain errors and abort upstream work.
- Tunables: `preAuthTimeoutMs` (5000), `maxPendingMessages` (256), `maxSendBufferBytes` (8 MiB), and `maxMessageBytes` / `maxBufferedBytes` / `maxTextBytes` / `maxSessionMs`.
- `onSessionEnd` runs at most once after success, failure, or disconnection to release concurrency slots.
- Browser `createAIClient({ audio: { url, getTicket } })` puts only one-time `ticket` in the WebSocket URL. `getTicket(request)` receives the operation summary (`operation` / `model`) for a tightly bound ticket. Never pass ordinary IAM access tokens.

### Transport encryption (shared with `@h-ai/crypto`)

serv does not expose its own encryption factory; the server manager comes from `crypto.transport`. Applications only pass the top-level `crypto` handle:

```ts
import { cache } from '@h-ai/cache'
import { createRedisTransportKeyStore, crypto } from '@h-ai/crypto'
import { serv } from '@h-ai/serv'

await crypto.init()
await cache.init({ type: 'redis', host: '127.0.0.1', port: 6379 })

const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
  transport: {
    crypto,
    // keyExchangePath 默认 '/_hai/key-exchange'，最终端点为 '/api/v1/_hai/key-exchange'
    // excludePaths: ['/health'],
    // maxClients: 10000,
    keyStore: createRedisTransportKeyStore({ cache, ttlSeconds: 3600 }),
  },
})
```

Clients use `@h-ai/api-client`:

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  transport: { crypto },
})
```

When using `@h-ai/core` and `ServConfigSchema` with `config/_serv.yml`, transport can be configured together:

```yaml
# config/_serv.yml
http:
  apiPrefix: /api/v1

transport:
  keyExchangePath: /_hai/key-exchange
  excludePaths:
    - /health
    - /ready
    - /openapi.json
    - /docs
    - /_hai/scalar.js
  maxClients: 10000
```

```ts
const servConfig = core.config.getOrThrow<import('@h-ai/serv').ServConfig>('serv')

const app = serv.createApp({
  contract,
  procedures,
  http: servConfig.http,
  middlewares: [{
    middleware: serv.cors({
      origin: servConfig.cors.origin,
      credentials: servConfig.cors.credentials,
      allowedHeaders: [...servConfig.cors.allowedHeaders],
      exposedHeaders: [...servConfig.cors.exposedHeaders],
    }),
  }],
  transport: servConfig.transport === false
    ? undefined
    : {
        crypto,
        keyExchangePath: servConfig.transport.keyExchangePath,
        excludePaths: [...servConfig.transport.excludePaths],
        maxClients: servConfig.transport.maxClients,
      },
})
```

> **Multi-node deployments**: transport session keys are stored **in the server process** by default. Replicas require one of these:
>
> - Enable **sticky sessions** in the load balancer so each client reaches the same node.
> - Perform a separate initial key exchange for each client on each node.
> - Inject a shared `keyStore`, such as `createRedisTransportKeyStore()` / `createReldbTransportKeyStore()`.
>
> `keyStore` is a runtime object dependency and must not go in `config/_serv.yml`; configuration contains only static paths, allowlists, and capacities.

> **Security**: with `transport` enabled, business requests need valid `X-Client-Id` except `excludePaths` and key exchange. Missing/unknown clientId returns 400. Unencryptable bodies, non-JSON responses, or encryption size limits return errors rather than forwarding plaintext business data.

### Token authentication (`iam` / `refreshCookie`)

Pass the top-level `iam` handle to `serv.createApp` to derive:

- **Access token verification**: `iam.session.verifyToken` fills `context.session` on every request without caching.
- **Refresh rotation**: with `refreshCookie`, `iam.session.refresh` becomes the httpOnly-cookie refresh callback.

**Context factory precedence**: explicit `createContext` > `verifyToken` > `iam.session.verifyToken` > metadata-only default.

```ts
// 推荐：传入 iam，一行打开认证与 Cookie 刷新
const app = serv.createApp({
  contract,
  procedures,
  iam,
  refreshCookie: {}, // 可选：启用 httpOnly cookie 刷新路径
})

// 逃脱口 1：不使用 @h-ai/iam，自定义 verifyToken
const app = serv.createApp({
  contract,
  procedures,
  verifyToken: token => myAuthService.verify(token),
})

// 逃脱口 2（高级）：多租户等额外字段 — 完全接管上下文构造
const app = serv.createApp({
  contract,
  procedures,
  createContext: async ({ request }) => {
    const base = serv.parseRequestContext({ request })
    // 手动填充 session（serv 不再自动填充）
    const result = await iam.session.verifyToken(base.accessToken ?? '')
    return {
      ...base,
      session: result.success ? result.data : undefined,
      tenantId: request.headers.get('x-tenant') ?? null,
    }
  },
})
```

### Custom procedures (authentication + permissions)

```ts
const procedures = serv
  .implement(myContract)
  .context<ServContext>()
  .route('users.update')
  .permission('users.write')
  .handle(async ({ input, context }) => {
    return await userService.update(input.id, input)
  })
  .build()
```

### Advanced pipelines (HTTP middleware + context + route guards)

`@h-ai/serv` pipelines have three layers and extension points:

1. **HTTP middleware**: inject through `serv.createApp({ middlewares })`.
2. **Context**: customize through `verifyToken` / `createContext` / `serv.buildAuthContextFactory()`.
3. **Route guards**: declare authentication/authorization with `.auth()` / `.permission()` / `.role()`.

#### 1) Custom HTTP middleware

Use `middlewares` for **HTTP cross-cutting logic** such as logging, tracing, rate limits, CORS, and tenant headers, or WebSocket/file/binary endpoints unsuited to JSON/oRPC contracts. Reuse `serv.cors(...)` for common CORS needs:

```ts
import type { ServMiddleware } from '@h-ai/serv'
import { serv } from '@h-ai/serv'

const requestMetrics: ServMiddleware = async (c, next) => {
  const startedAt = Date.now()
  await next()
  c.header('x-response-time-ms', String(Date.now() - startedAt))
}

const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
  middlewares: [
    {
      middleware: serv.cors({
        origin: origin => origin === 'https://app.example.com',
        credentials: true,
        exposedHeaders: ['X-Encrypted', 'X-Request-Id'],
      }),
    },
    { middleware: requestMetrics }, // 默认挂到 '*'
    {
      path: '/api/v1/*',
      middleware: async (c, next) => {
        if (!c.req.header('x-tenant-id'))
          return c.text('Missing x-tenant-id', 400)
        await next()
      },
    },
    {
      path: '/assets/*',
      middleware: serv.storageAssets({
        storage,
        pathPrefix: '/assets/',
        keyPattern: /^public\/[\w-]+\.png$/,
        allowedContentTypes: ['image/png'],
        cacheControl: 'public, max-age=31536000, immutable',
        crossOriginResourcePolicy: 'cross-origin',
      }),
    },
  ],
})
```

Execution order is fixed:

1. Built-in `securityHeaders`.
2. Your `middlewares`.
3. Built-in `transport`, if enabled.
4. health / refresh-cookie / OpenAPI / RPC / docs / oRPC routes

Notes:

- `middlewares` register in array order.
- Omitted `path` defaults to `'*'`.
- Middleware runs before transport, so CORS preflight or binary endpoints can short-circuit. Responses retain security headers but bypass transport.
- Prefer `serv.storageAssets(...)` for public read-only files. Applications must supply key/MIME allowlists, caching, and CORS; no business concepts such as avatars are built in.
- Private resources, Range downloads, and dynamic authorization need custom middleware/procedures, not the public asset helper.
- To read decrypted business bodies, extend context/procedure instead.
- Expose custom response headers such as `X-Encrypted` explicitly through `serv.cors({ exposedHeaders: [...] })` for browsers.
- This layer works with HTTP middleware context and returns **HTTP Response**, not `HaiResult`.

#### 2) Custom context pipelines

To reuse `Bearer token -> session` and add tenant, workspace, or source-system fields,
prefer `serv.buildAuthContextFactory()` to assemble a custom `createContext`:

```ts
const baseContext = serv.buildAuthContextFactory(token => iam.session.verifyToken(token))

const app = serv.createApp({
  contract,
  procedures,
  createContext: async ({ request }) => {
    const context = await baseContext({ request })
    return {
      ...context,
      tenantId: request.headers.get('x-tenant-id') ?? null,
    }
  },
})
```

Choose the appropriate extension:

- Replace token verification only: use `verifyToken`.
- Add fields to default authentication context: use `buildAuthContextFactory(...) + createContext`.
- Replace context construction entirely: use `createContext` directly.

#### 3) Route guard

Public procedures use `.route(path, handler)`. For guarded routes, use
`.route(path).auth/permission/role().handle(handler)`：

```ts
const procedures = serv
  .implement(widgetContract)
  .context<ServContext>()
  .route('widgets.list', ({ input }) => widgetService.list(input))
  .route('widgets.create')
  .permission('widgets.write')
  .role('editor')
  .handle(({ input, context }) => {
    // guard 通过后 session 在类型上已是非空，不需要 `!`。
    return widgetService.create(context.session.userId, input)
  })
  .build()
```

Constraints:

- `.permission()` and `.role()` require authentication automatically. Failures return HaiResult with `error.httpStatus` 401/403; ordinary procedure responses remain HTTP 200 by default.
- Multiple permissions/roles on one route must all pass. `serv.WILDCARD_PERMISSION` / `serv.WILDCARD_ROLE` allow their respective categories.
- Unhandled handler exceptions become INTERNAL_ERROR HaiResult values; expected business failures should return `err(...)` directly.
- Paths, input, and output come from the contract. Duplicate/unknown paths are rejected; `.build()` requires complete contract implementation.

Public API boundaries:

- `src/pipelines/*` holds internal defaults and is not a public subpath API.
- The stable application-facing entry remains `@h-ai/serv`.
- Internal helpers such as `securityHeaders` / `requireInternalRPC` / `buildHaiErrorBody` are not documented as separate subpath exports.

### httpOnly cookie authentication (recommended for production)

httpOnly cookie mode stores refresh tokens in server-managed cookies unreadable to browser JavaScript, reducing XSS exposure.

Distinguish the two token responsibilities:

- `accessToken`: a short-lived credential kept in client memory and sent as `Authorization: Bearer <token>`.
  `serv.parseRequestContext()` / `extractBearerToken()` read it; `buildAuthContextFactory()` verifies it.
- `refreshToken`: a long-lived credential. With `refreshCookie`, it is hidden from frontend JavaScript and stored only in an httpOnly cookie.
  `extractBearerToken()` does **not** read it. Only `/auth/refresh` reads it on the server to issue a new access token.
  Trusted native clients can use JSON bodies through `nativeTokenTransport`, with both client identity and Origin verification required.

**Workflow:**

1. Browser login: server sets `Set-Cookie: hai_refresh_token=...;HttpOnly` and removes `refreshToken` from JSON.
2. Access token stays in client memory without persistence.
3. On access token expiration, the browser includes the cookie automatically when calling `/auth/refresh`.
4. Server reads the cookie, calls `onRefresh`, returns a new access token, and updates the cookie without exposing refresh token in the body.

For native clients matching `nativeTokenTransport.isRequest`, login/registration/refresh responses retain the rotated
`refreshToken`. Refresh reads `{ refreshToken }` from the body, and the entire flow avoids browser cookies.

**Server configuration:**

```ts
// 服务端：api-service/src/app.ts
const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
  iam, // 顶层 iam 同时驱动 verifyToken 与 refresh
  refreshCookie: {
    // cookieName: 'hai_refresh_token', // 默认
    // maxAge: 30 * 24 * 3600,          // 默认 30 天
    // secure: true,                    // 默认在 NODE_ENV=production 时开启
    // onRefresh: customFn,             // 可覆盖 iam.session.refresh。
    nativeTokenTransport: {
      // 必须 fail-closed：同时校验平台标识与允许的原生 Origin。
      isRequest: request =>
        request.headers.get('x-client-platform') === 'capacitor'
        && security.isNativeOrigin(request.headers.get('origin') ?? ''),
    },
  },
  // ✅ 无需再传 verifyToken，iam.session.verifyToken 自动用于填充 context.session
})
```

**Client configuration (with `@h-ai/api-client`):**

```ts
// 默认存储即 httpOnly cookie，refreshPath 默认 /auth/refresh，无需额外配置。
await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
})
```

> **Cookie attributes**: `HttpOnly; SameSite=Strict; Secure` in production; `Path` is limited to `{apiPrefix}/auth/refresh`.

## API overview

- `serv.createApp(options)`: create the HTTP App with custom middleware, health checks, OpenAPI, optional docs, and RPC.
- `serv.parseRequestContext({ request })`: extract Bearer token + requestId without populating session.
- `serv.listen(app, options)`: start Node.js HTTP service; return `{ server, address, close }`.
- `serv.toFetch(app)`: wrap as a standard `fetch(Request)` handler.
- `serv.generateSpec(contract, options)`: generate an OpenAPI 3.1 spec from the contract.
- `serv.storageAssets(config)`: read-only storage middleware with key/MIME allowlists, GET/HEAD, and ETags.
- `serv.implement(contract)`: create a chainable contract implementer.
- `.context<ServContext>()`: declare the procedure request context.
- `.route(path, handler)`: register a public procedure.
- `.route(path).auth/permission/role().handle(handler)`: register an authenticated/authorized procedure.
- `.build()`: build the router after implementing every contract procedure.
- `serv.validateInputOrFail(zodSchema, input, locale)`: secondary Zod validation in procedures; failure returns localized `HaiResult` + `ValidationFormError[]`.
- `serv.resolveRequestLocale(headers)`: parse and normalize locale from `x-hai-locale` / `Accept-Language`.
- `serv.m(key, options)`: read module messages with per-call `options.locale` localization.

Additional root types / named exports:

- `ServConfigSchema`: validate `config/_serv.yml` with `core.config.validate('serv', ServConfigSchema)`.
- HTTP App abstraction: `serv.createApp()` returns public `fetch/request` capabilities; internal Hono usage does not affect application code.
- `ServMiddlewareMount`: entries for `createApp({ middlewares })` (`{ path?, middleware }`).
- `ServMiddleware` / `ServProcedureHandler`: shared types for custom pipelines.
- `NativeRefreshTokenTransportConfig` / `ServStorageAssetsConfig`: native token transport and read-only asset configuration.

> Transport encryption is a `createApp` option delegated internally to `crypto.transport`, not a flat `serv.xxx` API.

## Configuration

`@h-ai/serv` does not scan YAML itself. Load `config/_serv.yml` through `@h-ai/core` and pass the result to `serv.createApp()`.

```ts
import { core } from '@h-ai/core'
import { serv, ServConfigSchema } from '@h-ai/serv'

core.init({ configDir: './config' })

const validation = core.config.validate('serv', ServConfigSchema)
if (!validation.success)
  throw new Error(validation.error.message)

const servConfig = core.config.getOrThrow<import('@h-ai/serv').ServConfig>('serv')

const app = serv.createApp({
  contract,
  procedures,
  http: servConfig.http,
  transport: servConfig.transport === false
    ? undefined
    : {
        crypto,
        keyExchangePath: servConfig.transport.keyExchangePath,
        excludePaths: [...servConfig.transport.excludePaths],
        maxClients: servConfig.transport.maxClients,
      },
})
```

Example `config/_serv.yml`:

```yaml
server:
  host: 127.0.0.1
  port: 3000

http:
  apiPrefix: /api/v1
  openapi:
    path: /openapi.json
  docs:
    path: /docs
  health:
    path: /health
    readyPath: /ready
  rpc: false

cors:
  origin: https://app.example.com
  nativeOrigins: capacitor://app.example.local,tauri://app.example.local
  credentials: true
  allowedHeaders:
    - Authorization
    - Content-Type
    - X-Client-Id
  exposedHeaders:
    - X-Encrypted

transport:
  keyExchangePath: /_hai/key-exchange
  excludePaths:
    - /health
    - /ready
    - /openapi.json
    - /docs
    - /_hai/scalar.js
  maxClients: 10000
```

`server` (host/port): `HOST` / `PORT` environment variables > configuration > `127.0.0.1:3000`. Applications pass `servConfig.server` to `serv.listen`.

`ServHttpConfigInput`：

- `apiPrefix`: defaults to `/api/v1`.
- `health`: defaults to `{ path: '/health', readyPath: '/ready' }`.
- `openapi`: defaults to `false`; enable with `{ path: '/openapi.json' }`.
- `docs`: defaults to `false`; enable with `{ path: '/docs' }` (requires `openapi`). It mounts `/_hai/scalar.js` from the `@scalar/api-reference` browser bundle for local Scalar UI without an external CDN.
- `rpc`: defaults to `false`; enable with `{ prefix: '/rpc', access: 'loopback' | 'private-network' | 'gateway-only', gatewayHeader?, gatewaySecret? }`.
- `cors`: configured origins, credentials, allowedHeaders, and exposedHeaders; mount through `serv.cors(...)`.
- `transport`: top-level `config/_serv.yml` option passed as `servConfig.transport` to `createApp({ transport })`; default key exchange subpath is `/_hai/key-exchange`.

In production, use `serv.createRuntimeSecurityPolicy(...)` to constrain CORS, cookies, and documentation exposure:

```ts
const security = serv.createRuntimeSecurityPolicy({
  environment: coreConfig.env,
  corsOrigin: servConfig.cors.origin,
  nativeOrigins: servConfig.cors.nativeOrigins,
})

const app = serv.createApp({
  contract,
  procedures,
  http: {
    ...servConfig.http,
    openapi: security.exposeApiDocs ? servConfig.http.openapi : false,
    docs: security.exposeApiDocs ? servConfig.http.docs : false,
  },
  refreshCookie: { secure: security.secureRefreshCookie },
  middlewares: [{
    middleware: serv.cors({
      origin: security.allowOrigin,
      credentials: servConfig.cors.credentials,
      allowedHeaders: [...servConfig.cors.allowedHeaders],
      exposedHeaders: [...servConfig.cors.exposedHeaders],
    }),
  }],
})
```

In production, empty or `*` `_serv.yml` `cors.origin` fails startup. Web and Capacitor/Tauri origins use exact normalized full-Origin matching to prevent suffix spoofing. Production also enforces Secure refresh cookies and disables OpenAPI/docs; configuration controls nonproduction endpoints.

## Error handling

Ordinary procedures return authentication, authorization, business failures and caught handler exceptions as HaiResult over HTTP 200 by default. `error.httpStatus` is domain-error metadata and does not change the response status. Clients must check `success` and `error.code`: an unauthenticated failure has `error.httpStatus=401`, while database query failures or INTERNAL_ERROR have 500.

oRPC contract input validation fails before procedures with HTTP 400 and a localized body containing `error.httpStatus=400` and field errors. Procedure-level `serv.validateInputOrFail` failures remain HTTP 200. HTTP middleware, refresh-cookie, OpenAPI/RPC access checks and transport protocol failures follow their own HTTP response contracts. api-client refreshes only after an actual HTTP 401; `error.httpStatus=401` inside an HTTP 200 envelope does not trigger refresh.

- All default procedures return `HaiResult<T>`; clients check `result.success`.
- Authentication failure → `HaiCommonError.UNAUTHORIZED`, localized by `.auth()` using `context.locale`.
- Authorization failure → `HaiCommonError.FORBIDDEN`, localized by `.permission()` / `.role()` using `context.locale`.
- Uncaught exception → `HaiCommonError.INTERNAL_ERROR`, handled and localized by the route implementer using `context.locale`.

Handle normal business requests at three layers:

1. **oRPC contract input validation**: runs before procedures. `serv.createApp()` intercepts default English Zod errors and rewrites them as localized `errors[]`.
2. **Procedure-level validation**: use `serv.validateInputOrFail(zodSchema, input, context.locale)` for DB-read objects, cross-field constraints, and other Zod-friendly rules. Simple business rules can return `err(...)`; no extra schema is needed just for uniformity.
3. **Business/domain errors**: do not throw expected failures; return `err(...)` and localize **where the message is created**, using the relevant module getter such as `serv.m(..., { locale: context.locale })` or `widgetM(..., { locale: context.locale })`.

```ts
import { err, HaiCommonError } from '@h-ai/core'
import { serv } from '@h-ai/serv'
import { z } from 'zod'

const CreateWidgetSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(3),
})

const procedures = serv
  .implement(widgetContract)
  .context<ServContext>()
  .route('widgets.create')
  .permission('widgets.write')
  .handle(({ input, context }) => {
    const validated = serv.validateInputOrFail(CreateWidgetSchema, input, context.locale)
    if (!validated.success)
      return validated

    if (validated.data.slug === 'admin') {
      return err(
        HaiCommonError.FORBIDDEN,
        serv.m('serv_errorForbidden', { locale: context.locale }),
      )
    }

    return widgetService.create(validated.data)
  })
  .build()
```

> When downstream modules (such as `iam.user.xxx()`) return `HaiResult` directly, serv forwards `error.message` unchanged. `HaiError` holds only the final `message`, not `messageKey/params`, so **serv cannot generically retranslate arbitrary downstream errors**. Request-level localization must receive locale at the module that creates the error message.

## Tests

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
pnpm --filter @h-ai/serv lint
```

## License

Apache-2.0
