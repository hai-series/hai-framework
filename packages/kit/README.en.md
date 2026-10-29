# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md) · [@h-ai/iam](../iam/README.en.md)

## Introduction

`@h-ai/kit` integrates SvelteKit with hai-framework, providing a shared request pipeline and same-origin endpoint utilities:

## Core features

- Handle hook composition (`createHandle` / `sequence`)
- Authentication/role/permission guards (`guard.require` / `guard.check`)
- Built-in Logging / RateLimit / CORS middleware, enabled through `createHandle` configuration
- Shared API responses and request validation (Zod)
- Bearer token utilities (server login/logout + browser token storage)
- Browser client with automatic CSRF and transport encryption support
- Declarative CRUD resources (`crud.define`)
- A2A integration: discovery defaults to `/.well-known/agent-card.json`. With `authenticate` configured, null/undefined returns 401; anonymous access is allowed only without authentication configured. API Key parameters come from the complete Agent Card's `securitySchemes.apiKey`. Hooks and explicit A2A routes share JSON-RPC parse-error and SSE cancellation cleanup logic.
- Dual build mode (`createAdapter()`)

## Getting started

`sequence` preserves SvelteKit resolve options: page transformations run from inner to outer, while the first preload and serialized-header filter win. This preserves the i18n HTML language replacement.

### Installation

```bash
npm install @h-ai/kit @h-ai/core sm-crypto@0.5.7
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite
```

### Dependencies

- `@h-ai/iam`: optional authentication/authorization for A2A; initialize before using kit's A2A features.
- `@h-ai/crypto`: optional transport/cookie encryption; initialize before using encryption in kit.

### Quick start

#### Project configuration

**svelte.config.js**：

```js
import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

const config = {
  preprocess: [vitePreprocess()],
  compilerOptions: { runes: true },
  kit: {
    adapter: adapter(),
    // 双构建模式：import { createAdapter } from '@h-ai/kit/adapter'
    // adapter: await createAdapter(),
  },
}

export default config
```

**vite.config.ts**：

```ts
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  optimizeDeps: { exclude: ['bits-ui'] },
  ssr: { noExternal: ['@h-ai/ui', '@h-ai/kit'], external: ['@h-ai/core', 'sm-crypto'] },
})
```

When using Crypto or Kit/IAM, include `sm-crypto@0.5.7` in application production dependencies. CLI projects already do this; for manual setup, run `pnpm add sm-crypto@0.5.7`. The external option alone is insufficient: adapter-node also uses direct production dependencies to preserve native package loading.

#### Build the request pipeline

When mounting an application under `/yyy/`, keep SvelteKit's `kit.paths.base` and the actual URLs used by guards consistent. Prefix `protectedPaths`, `publicPaths` and `loginUrl` with `base` from `$app/paths`, for example `${base}/api/*`. Authentication pages use ``kit.client.createAuthActions({ basePath: `${base}/api/auth` })``. Kit recognizes application `/api/*` routes through route groups and mount prefixes: unauthenticated APIs return 401, while pages follow the configured login redirect. Generated templates include this wiring.

The Hook examples assume the application has initialized its database, shared cache and IAM and checked every result. The application owns resource cleanup; do not initialize modules per request.

**src/hooks.server.ts**：

```typescript
import type { Handle } from '@sveltejs/kit'
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
  rateLimit: { windowMs: 60_000, maxRequests: 100, store: kit.middleware.createCacheRateLimitStore(cache, { namespace: 'app' }) },
  logging: true,
})

export const handle: Handle = haiHandle
```

Rate limits use fixed windows beginning at the first successful commit; later requests preserve the TTL. A store is required. Initialize shared Redis and check its result before serving; all nodes use the same namespace/windowMs/maxRequests. Cache read/commit failure or exhausted contention returns 503, while exceeding the limit returns 429, without get+set or local fallback. createMemoryRateLimitStore is for development or explicit HAI_E2E/HAI_E2E_MOCK tests; it has no timer and can be garbage collected when released; each request scans at most 64 entries, capacity is 10000 windows, new keys receive 503 at capacity without evicting active counts, and external stores remain owned by their creators. Never enable test flags in production. Reset headers estimate node time; Redis TTL controls the actual window, so synchronize clocks. The default key uses the trusted adapter getClientAddress, normalizes equivalent IPv6/mapped IPv4 addresses and ignores raw forwarded headers; configure proxy trust in the deployment adapter.

#### API endpoints

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

#### Browser client

`kit.client.create()` targets SvelteKit same-origin endpoints. Use `@h-ai/api-client` for cross-origin access to public APIs from Web, apps, or mini programs.

```typescript
// src/lib/utils/api.ts — 全应用共享
import { kit } from '@h-ai/kit'

const client = kit.client.create()
export const { apiFetch } = client
```

```typescript
// 使用
import { apiFetch } from '$lib/utils/api'

const response = await apiFetch('/api/users', { method: 'GET' })
```

> `apiFetch` injects the CSRF header automatically; `@h-ai/kit` does not expose a separate CSRF middleware factory.
> `apiFetch` accepts a string, URL, or Request. It preserves the Request method, headers, and body and adds CSRF for writes. With transport enabled, supported bodies are encrypted and multipart uploads retain their original boundaries.
>
> Use httpOnly cookies for same-origin SvelteKit endpoints and verify them on the server. For browser Bearer headers, set an in-memory token with `kit.auth.setBrowserToken()` before `kit.client.create({ auth: true })`. Custom `BrowserTokenStore` implementations must use memory or platform secure storage; never persist sensitive credentials in Web Storage.

#### Same-origin transport encryption

kit delegates transport encryption to `@h-ai/crypto`. The server creates a manager with `crypto.transport.createServer({ serverKeyRing, keyStore })`; the browser installs a same-origin fetch wrapper with one call to `kit.client.installBrowserTransport(kitConfig, { crypto })`. Servers must also inject a managed key ring and shared registry.

For subdirectory hosting, read `base` from `$app/paths`: pass `basePath: base` in server `crypto.transport`, use `installBrowserTransport(kitConfig, { crypto, basePath: base })` in the browser, and set the same `transport.basePath` for a standalone `kit.client.create`. The default empty string means the domain root. This runtime argument comes from the host build path, without a duplicate YAML setting or inference from forwarding headers. Exchange paths, exclusions and route budgets still use full request paths. CLI SSR templates assemble both sides.

**src/hooks.server.ts**：

```ts
import { base } from '$app/paths'
import { appKitConfig } from '$lib/server/kit-config'
import { cache } from '@h-ai/cache'
import { createRedisTransportKeyStore, crypto, parseTransportServerKeyRing } from '@h-ai/crypto'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

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

**src/routes/+layout.svelte** (recommended entry: one browser-side call):

```svelte
<script lang='ts'>
  import { browser } from '$app/environment'
  import { base } from '$app/paths'
  import { page } from '$app/state'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit'
  import { untrack } from 'svelte'

  // 一次性安装：内部按 _kit.yml 决定是否启用 transport，并预热 crypto
  if (browser) {
    kit.client.installBrowserTransport(untrack(() => page.data.kitConfig), { crypto, basePath: base })
  }
</script>
```

**src/lib/utils/api.ts** (business code sees only `apiFetch`):

```ts
import { kit } from '@h-ai/kit'

export const { apiFetch } = kit.client.create()
```

> `src/hooks.client.ts` is no longer needed: default `handleFetch` behavior is sufficient, and SvelteKit `__data.json` requests use the installed global fetch wrapper automatically. For same-origin Authorization headers, use explicit `BrowserTokenStore` or `kit.auth.setBrowserToken()` + `kit.client.create({ auth: true })`. Do not store sensitive tokens in `localStorage`.

The default key exchange path is `/api/_hai/key-exchange`. If the server customizes `transport.keyExchangePath`, update the client's `transport.keyExchangeUrl` accordingly.

Servers must explicitly inject the same managed `serverKeyRing` and a shared `keyStore` (Redis or a shared database). Sharing client public keys alone cannot enable cross-node decryption. There is no implicit process key or memory-registry fallback; development/tests may explicitly use `createInMemoryKeyStore(capacity)`. Reload the same ring after restart; sticky sessions are unnecessary.

Transport applies by default to same-origin `/api/*` endpoints, SvelteKit `__data.json` page data, and key exchange itself. Page documents and static assets remain plaintext and do not require `X-Client-Id`. `multipart/form-data` requests such as uploads are sent unchanged; explicitly allow their paths through server `excludePaths`.

Only authenticated protocol v2 is accepted. Independent random SM4-CBC and HMAC-SM3 keys are wrapped with SM2; verify the sender signature and MAC before CBC decryption. Clients sign requests and the selected server key version signs responses. Authentication covers version, direction, serverKeyId, clientId, a random 128-bit requestId acting as the nonce, issuedAt, HTTP method, the SM3 pathHash of pathname plus the original search, and response status. Requests have a five-minute lifetime and at most 30 seconds of future clock skew. The shared registry atomically consumes (clientId, requestId), retaining it until at least issuedAt plus six minutes to cover node skew; storage failures reject requests. Synchronize node clocks and use a Redis noeviction/durable policy that preserves live nonces. Transport replay prevention does not replace business idempotency keys.

Empty POSTs still send an authenticated envelope for empty plaintext. GET/HEAD carry it in X-Hai-Transport; bodyless responses such as 204/304/HEAD use the same header. Other requests/responses carry a JSON envelope and X-Encrypted: true. The client must match the original request context and HTTP status; missing markers, old formats and authentication failures reject. Serv/Kit hosts explicitly allow plaintext through `encryption: disabled` path rules or host `excludePaths`. Callers must select ordinary requests; API Client/Kit wrappers use their own `excludePaths`. CORS must allow and expose X-Hai-Transport. TLS authenticates handshake keys; this protocol does not replace IAM authorization.

Set `transport.maxPlaintextBytes` for both request and response JSON plaintext, measured in UTF-8 bytes: default 1 MiB, integer range 1 KiB–64 MiB. Clients learn the server limit during key exchange. `resolveTransportBodyLimits()` derives encrypted/proxy bytes as twice the plaintext limit plus 32 KiB. Handshake, public-key, header and replay constraints remain independent. Oversized streams are cancelled and readers released: requests return 413; oversized responses return an encrypted 500 capacity error, recognized as `TransportBodyTooLargeError` / `hai:crypto:070`. [Transport capacity and upgrade](../crypto/TRANSPORT-CAPACITY.md)。

Ordinary routes retain `transport.maxPlaintextBytes` (auto/omitted: 1 MiB). Declare Feedback report intake, evidence, attachments and ZIP download capacity separately using `routePlaintextBytes` and `feedback.budget.maxTransportBytes`; `*` matches one complete path segment and explicit host route values take precedence. Handshakes, adapter-node and proxies use the maximum route capacity. HTTP adapters admit at most 2 explicitly declared material requests above 1 MiB and a separate 16 ordinary business requests, releasing admission after the entire response or failure. Busy admission returns 503 / `hai:crypto:072`; business writes are not automatically replayed.

serv/kit return an encrypted HTTP 400 time error for an out-of-window message only after request binding, signature and MAC verification. The client throws `TransportTimeError` (`hai:crypto:071`) with advice to synchronize device/server clocks and refresh. `api-client` maps it to `VALIDATION_FAILED` and preserves `cause.transportCode`. Requests are not replayed automatically and replay windows remain unchanged; tampered or unauthenticated messages retain the generic authentication failure.

#### Shared transport configuration with `_kit.yml`

`@h-ai/kit` provides `KitConfigSchema` / `resolveKitConfig()` so a single `_kit.yml`
can drive both `hooks.server.ts` and browser `kit.client.installBrowserTransport()`:

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

Pass the public projection through `src/routes/+layout.server.ts` to the browser layout above, without importing the server configuration into browser code:

```ts
import { publicKitConfig } from '$lib/server/kit-config'

export function load() {
  return { kitConfig: publicKitConfig }
}
```

`resolveKitConfig()` resolves both `server` (host/port) and `transport`. Host/port precedence is `HOST` / `PORT` environment variables > `_kit.yml` `server` > `127.0.0.1:3000`, for shared consumption by the SvelteKit server entry, matching `@h-ai/serv`.
For server-only configuration, use `core.config.validate('kit', KitConfigSchema)` as well.
Read the complete `_kit.yml` on the server; it can contain private proxy networks and policy-file paths. Return only an explicit public projection such as `{ kitConfig: publicKitConfig }` from `+layout.server.ts`, and consume its transport fields in the browser. Never bundle the full configuration or policy file with `?raw`, and keep secrets outside these files.

### Configuration

`kit.createHandle()` options:

| Field        | Type                                     | Description                                                            |
| ------------ | ---------------------------------------- | ---------------------------------------------------------------------- |
| `auth`       | `HandleAuthConfig`                       | Authentication (verifyToken / protectedPaths / publicPaths / loginUrl) |
| `rateLimit`  | `object \| false`                        | Rate limiting (windowMs / maxRequests)                                 |
| `logging`    | `boolean \| object`                      | Request logging (default `true`; `{ logBody: true }` logs the body)    |
| `crypto`     | `HookCryptoConfig`                       | Transport + cookie encryption                                          |
| `guards`     | `GuardConfig[]`                          | Custom guards (after automatic auth guards)                            |
| `middleware` | `Middleware[]`                           | Custom middleware (after built-in middleware)                          |
| `a2a`        | `HandleA2AOperations \| HandleA2AConfig` | A2A integration (Agent Card + JSON-RPC)                                |
| `onError`    | `function`                               | Custom error handling                                                  |

Request/response summaries use the `trace` level. Logging is enabled by default and `logBody` defaults to false. Query values come from the original `request.url`, while the path remains SvelteKit's current `event.url.pathname`. Logging does not access the tracked `event.url.search/searchParams`, so static pages can prerender with logging enabled. Password/token/secret, authorization and API-key fields are redacted in queries and optional JSON-body logs. The body is read from a clone and remains available to application code.

Automatic request auditing runs only when `audit.isInitialized`. Static sites and applications without Audit need not initialize it for this handle. State is checked per request, so modules may initialize after the handle is created. Applications selecting Audit must still check `audit.init()` and stop startup on failure. Explicit `audit.log/capture` calls retain their uninitialized errors, and initialized modules still report actual write failures as `Request audit failed`. Mandatory business auditing must check explicit results and enforce the application's transaction rules.

With `crypto.encryptedCookies`, also provide `crypto.cookieEncryptionKey` or `HAI_KIT_COOKIE_KEY`. Missing keys fail immediately in `createHandle()`. Plaintext, damaged ciphertext, or decryption failures for protected cookies are treated as absent; encryption failures never fall back to writing plaintext.

Authentication cookies default to `Secure` when either `NODE_ENV` or `HAI_CORE_ENV` is `production`; `HAI_E2E` / `HAI_E2E_MOCK` do not relax cookie security. Production rate limiting recognizes both flags; only explicit test switches permit memory counters.

### Export paths

Use runtime methods through the `kit` namespace or explicit subpaths; types are exported separately. Browser declarations do not expose server factories. Vite configuration uses `@sveltejs/kit/vite`; there is no `@h-ai/kit/vite` plugin.

- `@h-ai/kit`: main entry, with the `kit` namespace and types.
- `@h-ai/kit/client`: browser client.
- `@h-ai/kit/adapter`: dual build adapter (`createAdapter()`).
- `@h-ai/kit/a2a`: A2A integration.
- `@h-ai/kit/crypto`: crypto integration.

### Configuration driven authentication

Password login submits only `identifier` and `password`; `AuthPanel` maps the `LoginForm` field `username` to `identifier`. Server settings `session.maxAge` / `session.refreshTokenMaxAge` control session lifetimes. The login form has no per-login persistent-session option.

Agreements support configuration-loaded userAgreementMarkdown/privacyPolicyMarkdown and URLs. Markdown takes priority for the same agreement and is safely rendered in a modal.

Export standard handlers from kit.auth.createApi(iam), use kit.auth.publicPaths for anonymous endpoints, and connect AuthPanel with kit.client.createAuthActions({ apiFetch }). Validation, Cookie writes and HaiResult mapping are built in; current-user and password-change endpoints remain guarded.

[完整 IAM 配置 / IAM configuration](../iam/README.en.md)

`kit.auth.logout(cookies, accessToken)` returns `Promise<HaiResult<void>>`. Without a token it only clears cookies and succeeds; with a token but no configured auth operations it fails. Local cookies are cleared for every server outcome. Callers must preserve failed results in their HTTP response or UI; local clearing does not confirm server revocation. Underlying control-flow exceptions still propagate.

### Error handling

- Wrap API endpoints with `kit.handler()`.
- `kit.validate.body` / `kit.guard.require` throw `Response`, handled by `kit.handler` as API control flow. Page `load` uses `kit.guard.check` with SvelteKit `error`; parse query schemas with `safeParse` and raise native page errors instead of throwing API responses.
- `kit.handler()` converts non-control-flow exceptions into `500 INTERNAL_ERROR` responses.

### CRUD fields

Declarative CRUD fields support `colSpan: 'auto' | 1 | 2` for UI form widths. `validation.message` accepts a string or `() => string` for current-locale validation messages. Configure layout through `CrudPage.form`; validate independently on the server.

### Runtime behavior and limits

- `kit.createHandle()`: session parsing, route guards, middleware chains, and optional transport/cookie encryption.
- `kit.handler()`: an exception boundary for API endpoints.
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`

> Shared cross-platform HTTP contracts belong in `@h-ai/api-contract`, are mounted by `@h-ai/serv`, and are called through the `@h-ai/api-client` typed client. `@h-ai/kit` does not define or host business API contracts.

### Request locale isolation

Wrap Node requests and SSR in `core.i18n.runWithLocale(locale, () => handleRequest())`. SvelteKit can use `kit.i18n.runWithLocale(locale, () => resolve(event))`; serv creates the scope automatically from request headers. Async descendants inherit it. Explicit `MessageOptions.locale` takes precedence over the request locale and the startup default. Within a scope, `setGlobalLocale` only changes that request; outside a scope it configures the startup default and must not be called by request hooks.

Browsers keep application-level `setGlobalLocale` / `createLocaleStore`. During SSR, UI store initialization and setters only update the store; messages read the request scope. `runWithLocale` requires the Node entry; browser translations use explicit locale options or application state.

## Feedback endpoint and request correlation

`kit.createFeedbackHandler` can serve GET/POST/PATCH in `/api/feedback/[...path]/+server.ts`. It reuses the same api-contract schemas as serv, bounds the input stream, and rejects client identity/scope fields. resolveContext maps an already verified locals.session to server-controlled scope and permissions; null denies access. Keep the existing createHandle authentication, CSRF, and transport encryption.

createHandle preserves a valid bounded incoming X-Request-Id, adds it to responses, and propagates the request and verified user across asynchronous work. To collect ordinary business logs, wrap the actual business operation in a host middleware using `core.context.run({ scopeId: 'configured-product' }, next)`. This trusted scope must match feedback scope and cannot come from client headers.

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

## Error messages and correlated logs

HTTP errors carry safe localized messages and a reference ID. ToastContainer hides the ID by default and reveals it through its diagnostic icon. The same ID remains in `error.traceId` and `X-Trace-Id`. The framework reuses the request ID to correlate browser and server logs. Sanitized exceptions, stacks and operation context remain in logs; internal cause/ext are not exposed. Field validation returns localized field names and messages only.

Use `core.error.toPublic(error, traceId?)` at HTTP/UI boundaries and `core.error.formatMessage(error)` after translating messages; formatting is idempotent. Pass complete Error objects to logs instead of discarding their context. Database failures log driver codes, sanitized messages/stacks and table/column context; SQL text, bound values and connection credentials are excluded.

When audit is initialized, createHandle binds verified session identity/roles, the platform getClientAddress result and request ID for domain audit.log calls. Automatic request.execute events contain the route template, method, status and success/failure/denial, including guard redirects and SvelteKit HTTP control flow. Bodies and error details are not copied. capture.enabled controls automatic capture; capture.includeReads enables successful reads. Failed reads remain recorded by default. Applications still explicitly record domain completion/failure events; disabling automatic capture does not disable domain logs.

## Optional interactive challenges

Export kit.auth.createApi(iam).createCaptcha as POST /api/auth/captcha; kit.auth.publicPaths includes it. kit.client.createAuthActions preserves captcha and supplies createCaptcha for automatic AuthPanel solving. Export /api/auth/password/renew for initial/expired password changes. IAM enforces proofs server-side.

See policy, defaults and recovery boundaries in [IAM](../iam/README.en.md).

## Recovering an expired session in place

Set `kit.client.create({ recoverSession })` to sign in again without discarding the current page. Use UI `createSessionRecovery` / `SessionRecoveryDialog`: configure the public policy and original user in the root layout, pass `recovery.recover` as the callback, provide standard authentication actions, and cancel on teardown. IAM checks login `expectedUserId` before issuing a session; captcha, lockout, password renewal and access rules remain active. Only an explicitly authentication-rejected request is retried once. Cancellation, 5xx, timeouts and ambiguous writes are not replayed. Sensitive-operation proofs from an old session may need a new confirmation. Standard authentication actions disable recovery for their own calls. Custom authentication requests should pass `{ recoverSession: false }` as the third apiFetch argument to avoid recursive dialogs. terminalType (web/app/desktop/api; default web) selects a session group and does not attest hardware identity.

## Page exit session policy

`session.endOnPageHide` defaults to `false`. Hosts call `actions.bindPageExit({ enabled: config.session.endOnPageHide })` and invoke its returned cleanup on unmount; standard admin/H5/fullstack templates already bind it. A non-BFCache `pagehide` (including reload and full document navigation) makes a best effort POST to `/auth/session/close`, revoking the held access and related refresh through the existing CSRF/encrypted transport with `keepalive` and no automatic refresh. This response does not clear cookies/local credentials, avoiding a late old response overwriting a new login. Explicit logout still revokes and clears current credentials normally. Browsers may omit page exit requests; configure server `idleTimeout`/`absoluteTimeout` as appropriate. Immediate revocation on browser close is not guaranteed.

## Transport capacity and module budgets

For a sensitive call, supply `reauthorize: () => sensitiveActions.authorize(operation)` in the third Kit apiFetch argument or typed-client options.context. After session rotation/recovery or an explicit proof rejection, obtain a new purpose-bound proof before one retry. Cancellation sends no further write; without a callback, an old proof is never replayed.

## Access checks on every request

Path rules accept `encryption: required` or `disabled`; omission inherits the host. Disabled endpoints skip application encryption while retaining access and identity checks, and reject framework envelopes. Required mode can protect custom JSON endpoints and overrides `excludePaths`; Crypto, a managed key ring and a registry are required. Conflicting modes fail when creating the Handle. Crypto-enabled CLI templates install both server and browser transport; use db and a shared database in production. Private policy and proxy configuration remain server-side; plaintext callers select their protocol using the public transport exclusions.

Pass server-side `_kit.yml` fields `trustedProxies` and `access` explicitly to `kit.createHandle`. Examples and generated templates create one Handle after application initialization. `access` defaults to `false`. Inline `{ rules: [{ id: 'external', paths: ['/api/v1/external/**'], allowIps: ['192.0.2.0/24'] }] }` restricts matching endpoints only; `global` applies to all host-handled requests. Paths include the deployment prefix. Assets served directly by static hosting do not pass through Handle.

Use `access: { file: './config/security/request-access.yml' }` for a separate YAML file. It resolves from the working directory and is read once at startup, up to 1 MiB; changes require a new Handle. Global conditions and all matching rules must pass. Empty lists leave their dimension unrestricted; the default timezone is UTC. Existing sessions are denied after an allowed time window ends. Preflight and key exchange also follow policy; ordinary transport requests preserve encrypted HTTP 403 / `hai:common:104` responses.

Default `trustedProxies: auto` ignores forwarded headers on ordinary hosts and adopts container networks only for private managed Compose proxy topologies. Custom ingress uses explicit proxy IPs/CIDRs; `[]` disables trust. Resolved `event.getClientAddress()`, policy, IAM and audit share the same address. See the [request access handbook](../../docs/usage/configuration/request-access.md) for edge proxies, lost source addresses, environment overrides and rollback.

## Development and testing

```bash
pnpm --filter @h-ai/kit test
```

Kit has no module-wide init/close. The application initializes and closes shared cache, IAM and crypto dependencies. See the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) for typechecked public examples. Authenticate requests with iam.auth.verifyToken; a nonempty token is not proof of identity.

## License

Apache-2.0
