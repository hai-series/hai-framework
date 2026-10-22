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
    // adapter: createAdapter(),
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

**src/hooks.server.ts**：

```typescript
import type { Handle } from '@sveltejs/kit'
import { cache } from '@h-ai/cache'
import { kit } from '@h-ai/kit'

const haiHandle = kit.createHandle({
  auth: {
    verifyToken: async (token) => {
      return token ? { userId: 'u_1', roles: ['admin'], permissions: ['user:read'] } : null
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
>
> Use httpOnly cookies for same-origin SvelteKit endpoints and verify them on the server. For browser Bearer headers, set an in-memory token with `kit.auth.setBrowserToken()` before `kit.client.create({ auth: true })`. Custom `BrowserTokenStore` implementations must use memory or platform secure storage; never persist sensitive credentials in Web Storage.

#### Same-origin transport encryption

kit delegates transport encryption to `@h-ai/crypto`. The server creates a manager with `crypto.transport.createServer({ serverKeyRing, keyStore })`; the browser installs a same-origin fetch wrapper with one call to `kit.client.installBrowserTransport(kitConfig, { crypto })`. Servers must also inject a managed key ring and shared registry.

**src/hooks.server.ts**：

```ts
import { cache } from '@h-ai/cache'
import { createRedisTransportKeyStore, crypto, parseTransportServerKeyRing } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

await crypto.init()
const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
if (!ring.success)
  throw new Error(ring.error.message)
const serverKeyRing = ring.data
await cache.init({ type: 'redis', host: '127.0.0.1', port: 6379 })

export const handle = kit.createHandle({
  auth: {
    verifyToken,
    protectedPaths: ['/api/*'],
    publicPaths: ['/api/_hai/*'], // 默认密钥协商端点
  },
  crypto: {
    crypto,
    transport: {
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
  import { appKitConfig } from '$lib/config/kit-config'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit'

  // 一次性安装：内部按 _kit.yml 决定是否启用 transport，并预热 crypto
  if (browser) {
    kit.client.installBrowserTransport(appKitConfig, { crypto })
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

Empty POSTs still send an authenticated envelope for empty plaintext. GET/HEAD carry it in X-Hai-Transport; bodyless responses such as 204/304/HEAD use the same header. Other requests/responses carry a JSON envelope and X-Encrypted: true. The client must match the original request context and HTTP status; missing markers, old formats and authentication failures reject. Exclude plaintext endpoints explicitly with excludePaths. CORS must allow and expose X-Hai-Transport. TLS authenticates handshake keys; this protocol does not replace IAM authorization.

Fixed budgets share `@h-ai/crypto`'s `TRANSPORT_BODY_LIMITS` with serv and the client: 16 KiB key exchange JSON, 4 KiB per public key, 1 MiB plaintext, and 2 MiB + 32 KiB encrypted JSON, counting actual UTF-8 bytes. Incremental reads consume the original stream; exceeding limits or cancellation stops/cancels it and releases its reader without cloning and fully buffering it. Oversized requests return 413, oversized responses return 500, and invalid public keys return 400. Rebuilt requests preserve signals; rebuilt requests/responses remove stale Content-Length/Content-Encoding. These budgets are not `_kit.yml` or environment settings.

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
import { resolveKitConfig } from '@h-ai/kit'
import { parse } from 'yaml'
import rawKitConfig from '../config/_kit.yml?raw'

export const appKitConfig = resolveKitConfig(parse(rawKitConfig) ?? {})
```

`resolveKitConfig()` resolves both `server` (host/port) and `transport`. Host/port precedence is `HOST` / `PORT` environment variables > `_kit.yml` `server` > `127.0.0.1:3000`, for shared consumption by the SvelteKit server entry, matching `@h-ai/serv`.
For server-only configuration, use `core.config.validate('kit', KitConfigSchema)` as well.
Because the browser may read this configuration, `_kit.yml` must contain only public server/transport paths and switches, never secrets.

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

With `crypto.encryptedCookies`, also provide `crypto.cookieEncryptionKey` or `HAI_KIT_COOKIE_KEY`. Missing keys fail immediately in `createHandle()`. Plaintext, damaged ciphertext, or decryption failures for protected cookies are treated as absent; encryption failures never fall back to writing plaintext.

### Export paths

Use runtime methods through the `kit` namespace or explicit subpaths; types are exported separately. Browser declarations do not expose server factories. Vite configuration uses `@sveltejs/kit/vite`; there is no `@h-ai/kit/vite` plugin.

- `@h-ai/kit`: main entry, with the `kit` namespace and types.
- `@h-ai/kit/client`: browser client.
- `@h-ai/kit/adapter`: dual build adapter (`createAdapter()`).
- `@h-ai/kit/a2a`: A2A integration.
- `@h-ai/kit/crypto`: crypto integration.

### Configuration driven authentication

Agreements support configuration-loaded userAgreementMarkdown/privacyPolicyMarkdown and URLs. Markdown takes priority for the same agreement and is safely rendered in a modal.

Export standard handlers from kit.auth.createApi(iam), use kit.auth.publicPaths for anonymous endpoints, and connect AuthPanel with kit.client.createAuthActions({ apiFetch }). Validation, Cookie writes and HaiResult mapping are built in; current-user and password-change endpoints remain guarded.

[完整 IAM 配置 / IAM configuration](../iam/README.en.md)

### Error handling

- Wrap API endpoints with `kit.handler()`.
- `kit.validate.body` / `kit.guard.require` throw `Response` for SvelteKit control flow.
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

## Development and testing

```bash
pnpm --filter @h-ai/kit test
```

## License

Apache-2.0

Authentication cookies default to `Secure` when either `NODE_ENV` or `HAI_CORE_ENV` is `production`; `HAI_E2E` / `HAI_E2E_MOCK` do not relax cookie security. Production rate limiting recognizes both flags; only explicit test switches permit memory counters.
