# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md) · [@h-ai/iam](../iam/README.en.md)

`@h-ai/kit` integrates SvelteKit with hai-framework, providing a shared request pipeline and same-origin endpoint utilities:

- `kit.createHandle()`: session parsing, route guards, middleware chains, and optional transport/cookie encryption.
- `kit.handler()`: an exception boundary for API endpoints.
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`

> Shared cross-platform HTTP contracts belong in `@h-ai/api-contract`, are mounted by `@h-ai/serv`, and are called through the `@h-ai/api-client` typed client. `@h-ai/kit` does not define or host business API contracts.

## Installation

```bash
npm install @h-ai/kit
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite
```

## Capabilities

- Handle hook composition (`createHandle` / `sequence`)
- Authentication/role/permission guards (`guard.require` / `guard.check`)
- Built-in Logging / RateLimit / CORS middleware, enabled through `createHandle` configuration
- Shared API responses and request validation (Zod)
- Bearer token utilities (server login/logout + browser token storage)
- Browser client with automatic CSRF and transport encryption support
- Declarative CRUD resources (`crud.define`)
- A2A integration: discovery defaults to `/.well-known/agent-card.json`. With `authenticate` configured, null/undefined returns 401; anonymous access is allowed only without authentication configured. API Key parameters come from the complete Agent Card's `securitySchemes.apiKey`. Hooks and explicit A2A routes share JSON-RPC parse-error and SSE cancellation cleanup logic.
- Dual build mode (`createAdapter()`)

## Dependencies

- `@h-ai/iam`: optional authentication/authorization for A2A; initialize before using kit's A2A features.
- `@h-ai/crypto`: optional transport/cookie encryption; initialize before using encryption in kit.

## Quick start

### Project configuration

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
  ssr: { noExternal: [/@h-ai\//] },
})
```

### Build the request pipeline

**src/hooks.server.ts**：

```typescript
import type { Handle } from '@sveltejs/kit'
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
  rateLimit: { windowMs: 60_000, maxRequests: 100 },
  logging: true,
})

export const handle: Handle = haiHandle
```

### API endpoints

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

### Browser client

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
> Authentication: prefer httpOnly cookies for same-origin SvelteKit endpoints and verify them on the server. Browsers need not write sensitive tokens to `localStorage`. If Bearer headers are required, provide a custom `BrowserTokenStore`, or set an in-memory token with `kit.auth.setBrowserToken()` before `kit.client.create({ auth: true })`.

### Same-origin transport encryption

kit delegates transport encryption to `@h-ai/crypto`. The server creates a manager with `crypto.transport.createServer()`; the browser installs a same-origin fetch wrapper with one call to `kit.client.installBrowserTransport(kitConfig, { crypto })`. Applications only configure the top-level `crypto` handle.

**src/hooks.server.ts**：

```ts
import { cache } from '@h-ai/cache'
import { createRedisTransportKeyStore, crypto } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

await crypto.init()
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
      requireEncryption: true,
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

For shared client public keys across nodes, inject `createRedisTransportKeyStore()` or `createReldbTransportKeyStore()` through `kit.createHandle({ crypto: { transport: { keyStore } } })` at runtime. These object dependencies **must not** go in `_kit.yml`; configuration files contain only public paths and switches.

Transport applies by default to same-origin `/api/*` endpoints, SvelteKit `__data.json` page data, and key exchange itself. Page documents and static assets remain plaintext and do not require `X-Client-Id`. `multipart/form-data` requests such as uploads are sent unchanged; explicitly allow their paths through server `excludePaths`.

Security defaults to fail-closed: with `requireEncryption: true`, protected paths without `X-Client-Id` return 400. An unavailable transport manager, unencryptable response, or encryption size limit returns an error rather than forwarding plaintext business data. `requireEncryption: false` is for staged migration only and is not recommended in production.

### Shared transport configuration with `_kit.yml`

`@h-ai/kit` provides `KitConfigSchema` / `resolveKitConfig()` so a single `_kit.yml`
can drive both `hooks.server.ts` and browser `kit.client.installBrowserTransport()`:

```yml
server:
  host: 127.0.0.1
  port: 3000

transport:
  keyExchangePath: /api/_hai/key-exchange
  requireEncryption: true
  encryptResponse: true
  excludePaths:
    - /api/storage
    - /api/public
    - /api/auth/profile/avatar
  maxClients: 10000
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

## Configuration

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

## Export paths

- `@h-ai/kit`: main entry, with the `kit` namespace and types.
- `@h-ai/kit/client`: browser client.
- `@h-ai/kit/adapter`: dual build adapter (`createAdapter()`).
- `@h-ai/kit/vite`: Vite plugin.
- `@h-ai/kit/a2a`: A2A integration.
- `@h-ai/kit/crypto`: crypto integration.

## Error handling

- Wrap API endpoints with `kit.handler()`.
- `kit.validate.body` / `kit.guard.require` throw `Response` for SvelteKit control flow.
- `kit.handler()` converts non-control-flow exceptions into `500 INTERNAL_ERROR` responses.

## Tests

```bash
pnpm --filter @h-ai/kit test
```

## License

Apache-2.0
