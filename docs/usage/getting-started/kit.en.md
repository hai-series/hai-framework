# Build Orders Console with Kit

[中文](kit.md) · [日本語](kit.ja.md) · [API reference](../function/kit.en.md#api-reference) · [Configuration](../configuration/kit.en.md) · [Data structures](../data/kit.en.md)

Orders Console starts with a readiness endpoint. Then you add an order preview, staff permissions, partner access, rate limiting, and encrypted transport in the same SvelteKit app. Carry forward each file and route unless a step tells you to change it.

Start with a working Svelte 5 and SvelteKit project. See the [Kit dependencies](../function/kit.en.md#module-dependencies) for setup order and optional services. The Serv guide starts with the same business requirements. [Serv implementation](serv.en.md#quick-start)

<a id="quick-start"></a>

## Step 1: Start Orders Console

The order operations team needs a readiness endpoint so deployment can tell when the server is available. Name an existing Svelte 5 and SvelteKit project `orders-console`. Each step builds on this app. Install Kit and its Node SSR runtime dependency, then add the Node adapter if the project does not already have it.

```sh
pnpm add @h-ai/kit sm-crypto@0.5.8
pnpm add -D @sveltejs/adapter-node
```

Set the Node adapter in the SvelteKit plugin options in `vite.config.ts`. Merge the options into the existing `sveltekit(...)` call to keep the app’s other plugins and build settings.

```ts
import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

// Use the Node adapter to produce a server build. The empty base serves pages at the origin root.
export default defineConfig({
  plugins: [sveltekit({ adapter: adapter(), paths: { base: '', relative: false } })],
})
```

Export the global hook from `src/hooks.server.ts`. Request logging is enabled by default and the hook sets `X-Request-Id` on responses.

```ts
import { kit } from '@h-ai/kit'

// Create the default global Handle. It logs requests and adds X-Request-Id to responses.
export const handle = kit.createHandle()
```

Export the GET handler from `src/routes/api/v1/status/+server.ts`.

```ts
import { kit } from '@h-ai/kit'

// Return HTTP 200 with data.status set to ready. The handler maps unexpected failures to a safe HTTP response.
export const GET = kit.handler(() => kit.response.ok({ status: 'ready' }))
```

Run `pnpm dev`, then request `/api/v1/status`, for example with `curl -i http://localhost:5173/api/v1/status`. Expect HTTP 200, `X-Request-Id`, and `{"success":true,"data":{"status":"ready"}}`. Add authentication, shared rate limiting, or encrypted transport when your routes need them.

<a id="orders-console-validation"></a>

## Step 2: Let operations staff preview an order

An operator wants to check the order title before saving. Install `zod` and add the handler in `src/routes/api/v1/orders/preview/+server.ts`. Keep the status route and hook from step 1.

```sh
pnpm add zod
```

```ts
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const PreviewSchema = z.object({ title: z.string().trim().min(1) })

export const POST = kit.handler(async ({ request }) => {
  // Return the validated title in preview. A missing or whitespace-only title produces HTTP 400.
  const preview = await kit.validate.body(request, PreviewSchema)
  return kit.response.ok({ preview })
})
```

```sh
curl -i http://localhost:5173/api/v1/orders/preview \
      -H 'Content-Type: application/json' \
      -d '{"title":"  Office supplies  "}'
```

The response is HTTP 200 with `data.preview.title: "Office supplies"`. Replacing the body with `{"title":" "}` produces HTTP 400. Preview only returns input prepared for saving. The next step adds identity and permissions. [Serv order preview](serv.en.md#orders-console-validation) · [Kit input validation](../function/kit.en.md#kit-validate)

<a id="orders-console-auth"></a>

## Step 3: Give operators and auditors different access

Only operators with `orders:write` may preview orders. The internal report requires both the `auditor` role and `reports:read`. Start with local demo sessions, then use IAM in the same hook when you add real accounts. [Serv access example](serv.en.md#orders-console-auth)

Install `@h-ai/core` with `pnpm add @h-ai/core`, then add this declaration to `src/app.d.ts`. Keep the existing declaration if the project already has `App.Locals.session`.

```ts
import type { HttpSession } from '@h-ai/core'

declare global {
  namespace App {
    interface Locals {
      session?: HttpSession
    }
  }
}
```

Save this verifier as `src/lib/server/orders-session.ts`. It uses tokens from two startup environment variables and runs only in development. The example users have no database records.

```ts
import { core, HaiCommonError } from '@h-ai/core'

export async function verifyOrdersSession(token: string) {
  if (process.env.NODE_ENV !== 'development')
    return core.err(HaiCommonError.UNAUTHORIZED)
  if (token && token === process.env.KIT_ORDERS_EDITOR)
    return core.ok({ userId: 'editor-1', roles: ['operator'], permissions: ['orders:write'] })
  if (token && token === process.env.KIT_ORDERS_AUDITOR)
    return core.ok({ userId: 'auditor-1', roles: ['auditor'], permissions: ['reports:read'] })
  return core.err(HaiCommonError.UNAUTHORIZED)
}
```

Replace `src/hooks.server.ts` from step 1. The hook builds paths from `base` so the same guard matches when the console moves under a subdirectory.

```ts
import { resolve } from '$app/paths'
import { kit } from '@h-ai/kit'
import { verifyOrdersSession } from './lib/server/orders-session.js'

const base = resolve('/').replace(/\/$/, '')
const protectedPaths = [
  '/api/v1/orders/preview',
  '/api/v1/reports/current',
  '/api/auth/me',
].map(path => base + path)

// The authentication hook restores the session. Routes own role, permission and resource checks.
export const handle = kit.createHandle({
  auth: { verifyToken: verifyOrdersSession, protectedPaths },
})
```

In the order-preview callback from step 2, change `{ request }` to `{ request, locals }` and insert this check before reading the body.

```ts
kit.guard.require(locals.session, 'orders:write')
```

Add `src/routes/api/v1/reports/current/+server.ts` for auditors.

```ts
import { kit } from '@h-ai/kit'

export const GET = kit.handler(({ locals }) => {
  // The hook supplies the session. A missing permission or auditor role produces HTTP 403.
  kit.guard.require(locals.session, 'reports:read')
  const session = locals.session
  if (!session?.roles.includes('auditor'))
    return kit.response.forbidden()

  return kit.response.ok({ owner: session.userId, summary: 'Quarterly summary' })
})
```

Set the local demo values in the development terminal and restart. These two strings are local fixtures.

```sh
export KIT_ORDERS_EDITOR=orders-editor-demo
export KIT_ORDERS_AUDITOR=orders-auditor-demo
pnpm dev
```

```sh
curl -i http://localhost:5173/api/v1/orders/preview \
  -H 'Authorization: Bearer orders-editor-demo' \
  -H 'Content-Type: application/json' \
  -d '{"title":"  Office supplies  "}'
curl -i http://localhost:5173/api/v1/reports/current \
  -H 'Authorization: Bearer orders-auditor-demo'
```

Both routes return HTTP 401 without a token. The operator can preview but gets HTTP 403 on the report. The auditor receives the report with `data.owner` of `auditor-1`. A session with the permission but without the role also gets HTTP 403.

Kit and Serv use the same `HaiResult<HttpSession>` verification result. A valid token populates `locals.session` from `data`. A missing token or definitive 4xx rejection makes the API guard return 401. If the verifier returns 503 for an unavailable dependency, the API responds with 503 and the route handler never runs.

To sign in with real accounts, run `pnpm add @h-ai/iam`. Replace the `verifyOrdersSession` import with `import { iam } from '@h-ai/iam'` and complete [IAM initialization](../function/iam.en.md#quick-start). Remove `verifyToken` from the hook’s `auth` block, add the two fields below, and retain `protectedPaths`. Export the `login` handler from `kit.auth.createApi(iam)` as `POST` in `src/routes/api/auth/login/+server.ts`. Bind the same-origin client with `kit.client.createAuthActions()` and request `/api/auth/me` after signing in. [Sign-in and cookies](../function/kit.en.md#authorization-example) · [Current-account endpoint](../function/kit.en.md#auth-current-account)

```ts
// A verified identity populates locals.session. The hook handles unauthorized requests or redirects.
iam,
publicPaths: kit.auth.publicPaths.map(path => base + path),
```

<a id="orders-console-access"></a>

## Step 4: Restrict partner reports and limit request rates

Partners need a summary report. Use a separate path so employee access to the internal report still requires an account. Add `src/routes/api/v1/external/reports/+server.ts`. The example returns a sample summary. In production, apply the appropriate query and redaction before publishing. [Serv partner reports](serv.en.md#orders-console-access)

```ts
import { kit } from '@h-ai/kit'

export const GET = kit.handler(() => kit.response.ok({ report: 'Quarterly summary' }))
```

Save these settings in `config/_kit.yml` for an origin-root deployment. Kit checks the socket peer and reads the forwarded client IP when that peer is trusted. Leave adapter-node’s `ADDRESS_HEADER` unset with this arrangement. Replace the example addresses for deployment and prevent clients from connecting directly to the backend. [Trusted proxies and policy rules](../configuration/kit.en.md#request-access)

```yaml schema=@h-ai/kit:KitConfigSchema
http:
  trustedProxies: [192.0.2.10]
  access:
    rules:
      - id: partner-api
        paths: [/api/v1/external/reports]
        allowIps: [203.0.113.0/24]
  rateLimit:
    windowMs: 10000
    maxRequests: 2
```

Save this module as `src/lib/server/orders-http.ts`, import `ordersHttp` from `./lib/server/orders-http.js` in the hook from step 3, and add `http: ordersHttp` to the existing `kit.createHandle({ ... })` options. Keep `auth`.

```ts
import { core } from '@h-ai/core'
import { KitConfigSchema, type HandleConfig } from '@h-ai/kit'

const loaded = core.config.load('kit', './config/_kit.yml', KitConfigSchema)
if (!loaded.success)
  throw new Error(loaded.error.message)

export const settings = loaded.data
const { http } = settings
export const ordersHttp: HandleConfig['http'] = {
  ...http,
  rateLimit: http.rateLimit && {
    ...http.rateLimit,
    store: core.access.createMemoryRateLimitStore(),
  },
}
```

Request `GET /api/v1/external/reports` through the configured proxy. Client `203.0.113.42` receives HTTP 200 and `data.report: "Quarterly summary"`. An IP outside the subnet gets 403. A forwarding header on an untrusted connection does not grant access.

Within 10 seconds, three calls to `GET /api/v1/status` from the same source return 200, 200, and 429 with 1, 0, and 0 remaining. Wait for `Retry-After` and try again for 200. The counter uses the trusted client IP. Other allowed requests from the same IP share its budget. For several instances, initialize Redis and replace the memory store with `core.access.createCacheRateLimitStore(cache, { namespace: "orders-console" })`. Store failures return 503. [Rate-limit options](../function/kit.en.md#rate-limit-example)

<a id="orders-console-transport"></a>

## Step 5: Encrypt same-origin requests and verify a subdirectory deployment

With account access, reporting, and rate limiting working, add request and response encryption to the same console. Append the `transport` block to the YAML and keep `http`. For production, use HTTPS, a managed key ring, and a shared cache. Key exchange uses the full request path.

The two-request budget in step 4 was for a short test. Set `http.rateLimit.maxRequests` to 100 and restart before continuing. Keep the same window and counter setup. The handshake POST and the following API call count separately. If you retain the small budget, wait for the window indicated by `Retry-After` before testing.

```yaml schema=@h-ai/kit:KitConfigSchema
transport:
  keyExchangePath: /api/v1/_hai/key-exchange
  excludePaths: []
```

Run `pnpm add @h-ai/cache @h-ai/crypto` and save the following module as `src/lib/server/orders-transport.ts`. Load `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` from protected deployment settings. The example uses an in-memory key store. For deployment, use an initialized shared Redis cache. [Prepare the key ring](../function/crypto.en.md#transport-protocol) · [Serv encryption](serv.en.md#orders-console-transport)

```ts
import { cache } from '@h-ai/cache'
import { crypto } from '@h-ai/crypto'
import { settings } from './orders-http.js'

export async function createOrdersTransport(basePath: string) {
  if (settings.transport === false)
    return false as const

  const ready = await crypto.init()
  if (!ready.success)
    throw new Error(ready.error.message)
  const cached = await cache.init({ type: 'memory' })
  if (!cached.success)
    throw new Error(cached.error.message)
  const ring = crypto.transport.parseServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
  if (!ring.success)
    throw new Error(ring.error.message)

  return {
    ...settings.transport,
    crypto,
    basePath,
    serverKeyRing: ring.data,
    keyStore: crypto.transport.createKeyStore({ cache }),
  }
}
```

Import `createOrdersTransport` from `./lib/server/orders-transport.js` in the hook from step 4 and add `transport: await createOrdersTransport(base)`. Keep `http` and `auth`. Return public transport settings from `src/routes/+layout.server.ts` and keep the key ring and cache on the server.

```ts
import { settings } from '../lib/server/orders-http.js'

export function load() {
  return { kitConfig: { transport: settings.transport } }
}
```

Add the following to the root layout’s `<script>` in `src/routes/+layout.svelte`. Reuse the existing `data` prop if declared. Keep the layout markup and the rendered children.

```svelte
<script lang="ts">
  import type { LayoutProps } from './$types'
  import { browser } from '$app/env'
  import { resolve } from '$app/paths'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit/client'
  import { untrack } from 'svelte'

  let { data, children }: LayoutProps = $props()
  if (browser) {
    kit.client.installBrowserTransport(untrack(() => data.kitConfig), {
      crypto,
      basePath: resolve('/').replace(/\/$/, ''),
    })
  }
</script>

{@render children()}
```

Add a button in `src/routes/+page.svelte` to make a real browser request. Use `resolve()` so the status path follows the deployment base.

```svelte
<script lang="ts">
  import { resolve } from '$app/paths'

  let status = $state('')

  async function checkReadiness() {
    try {
      const response = await fetch(resolve('/api/v1/status'))
      if (!response.ok) {
        status = String(response.status)
        return
      }
      const result = await response.json()
      status = result.data.status
    }
    catch {
      status = 'Could not read status'
    }
  }
</script>

<button onclick={checkReadiness}>Check readiness</button>
<output>{status}</output>
```

Stop the previous development server. Run this command from the project root for a local run. It creates a fresh key ring and passes it only to the development server process. Each restart issues a new ring.

```sh
node --input-type=module <<'JS'
import { spawnSync } from 'node:child_process'
import { crypto } from '@h-ai/crypto'

const ready = await crypto.init()
if (!ready.success)
  throw new Error(ready.error.message)
const pair = crypto.asymmetric.generateKeyPair()
await crypto.close()
if (!pair.success)
  throw new Error(pair.error.message)

const child = spawnSync('pnpm', ['dev'], {
  env: {
    ...process.env,
    HAI_CRYPTO_TRANSPORT_SERVERKEYRING: JSON.stringify({
      activeKeyId: 'local',
      keys: { local: pair.data },
    }),
  },
  stdio: 'inherit',
})
if (child.error)
  throw child.error
process.exitCode = child.status ?? 1
JS
```

For a Node deployment, use the app’s shutdown flow. When the adapter emits `sveltekit:shutdown`, close the Cache initialized here, then close Crypto. An existing application can use its own startup and cleanup functions.

Open the page and click “Check readiness”. The first call shows `POST /api/v1/_hai/key-exchange` followed by `GET /api/v1/status` with `X-Encrypted: true` in the Network panel. The page displays `ready`. Wait for the rate-limit window to reset before repeating the check. A plain curl request to this protected API now gets HTTP 400. For a deployment platform that sends plain HTTPS probes, use a separate probe URL outside the protected `/api` paths.

To deploy under `/console`, set `paths.base` to `"/console"` in the Vite configuration from step 1 and keep `relative: false`. Leave the route files in place. Update these two complete paths in the YAML and retain all other settings.

```yaml
http:
  access:
    rules:
      - id: partner-api
        paths: [/console/api/v1/external/reports]
        allowIps: [203.0.113.0/24]
transport:
  keyExchangePath: /console/api/v1/_hai/key-exchange
```

Rebuild and check readiness at `/console/`. The request path is `/console/api/v1/status` and the exchange path is `/console/api/v1/_hai/key-exchange`. Use the mounted sign-in path, such as `/console/api/auth`, as the `basePath` for `createAuthActions` if you added browser sign-in. At deployment, adapter-node reads `HOST` and `PORT`. [Listener settings](../configuration/kit.en.md#apply-and-verify)

To serve the same report files and event streams in Kit, pass their contract, procedures, and `transportRoutes` to `serv.createContractHandler()`. Mount the result with `kit.createHandle({ contract })`. Verify that existing pages still render, an auditor can download the report, and signing out makes the next download return 401. With transport encryption from step 5 enabled, set explicit plaintext HTTPS rules for the file and stream methods and full paths. [Mount the shared contract](../function/kit.en.md#kit-contract) · [Consume the event stream in a browser](../function/serv.en.md#ai-stream-example)

The console can also generate speech from a report or transcribe uploaded audio. Apply the session and report permissions from step 3 when calling these operations over HTTP. [Report speech and transcription](serv.en.md#orders-console-audio)

<a id="orders-console-hook-options"></a>

## Hook options and where to add them

Each row points to the step or addition where the app uses the option. Retain the settings already in place.

| Option | Use in Orders Console | Example |
| --- | --- | --- |
| `http.trustedProxies / http.access` | Recognize a trusted proxy and restrict partner reports by subnet | [Partner requests](#orders-console-access) |
| `http.rateLimit` | Apply a per-client quota and share it between replicas | [Partner reports and limits](#orders-console-access) |
| `auth` | Require a session before an internal report and check roles and permissions | [Identity and permissions](#orders-console-auth) |
| `transport` | Exchange keys before sending and receiving same-origin JSON | [Transport encryption](#orders-console-transport) |
| `crypto` | Store a user’s order-list display preference in a browser cookie | [Preference cookie](../function/kit.en.md#orders-console-cookie) |
| `logging / middleware / onError` | Diagnose operations requests and return safe errors | [Order diagnostics](../function/kit.en.md#orders-console-diagnostics) |
| `guards` | Apply the app’s access rules to order approvals | [Approval guard](../function/kit.en.md#orders-console-guards) |
| `cors` | Allow browser access from an order console hosted at another origin | [Cross-origin settings](../configuration/kit.en.md#cors) |
| `contract` | Serve shared report, file, or event-stream endpoints on this site | [Shared contract](../function/kit.en.md#kit-contract) |
| `a2a` | Give partner automation access to the order assistant | [Order assistant](../function/kit.en.md#kit-a2a) |
