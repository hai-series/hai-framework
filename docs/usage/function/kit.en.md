# @h-ai/kit API Reference

[中文](kit.md) · [日本語](kit.ja.md) · [Orders Console tutorial](../getting-started/kit.en.md) · [Configuration](../configuration/kit.en.md) · [Data structures](../data/kit.en.md)

<a id="module-dependencies"></a>

## Dependencies

| Dependency | Purpose | When required | Setup order |
| --- | --- | --- | --- |
| `svelte`, `@sveltejs/kit` | Host components and request hooks | Required for Kit | Set up a Svelte 5 project, then register hooks and routes |
| `@sveltejs/adapter-node` or `@sveltejs/adapter-static` | Build a Node service or static site | Choose the deployment target | Install the selected adapter before building. For Node SSR, include `sm-crypto@0.5.8` in the application's production dependencies |
| `vite`, `@sveltejs/vite-plugin-svelte` | Build the SvelteKit app and preprocess components | For the Orders Console tutorial. Use `@tailwindcss/vite` when the app uses Tailwind | Install the build tooling and configure Vite and SvelteKit before building |
| `@h-ai/core`, `@h-ai/api-contract` | Provide request utilities, result types, and route contracts | Installed with Kit | Use contracts directly. The application loads its Core configuration |
| `zod` | Define validation rules for route input | Installed with Kit. Import it directly to write your own schemas | Define the schema and pass it to the appropriate `kit.validate` method |
| `@h-ai/iam` | Verify sessions and A2A API keys | Installed with Kit. Initialize it for IAM-backed verification | Call `iam.init()` before wiring its session verifier or `ai.a2a.createHttpHandler()` |
| `@h-ai/crypto` | Encrypt selected cookies and HTTP bodies | Installed with Kit. Initialize it when enabling encryption | Initialize Crypto and prepare the relevant keys before `kit.createHandle()`. Transport encryption also needs a key ring and shared registration store |
| `@h-ai/audit` | Record audit events captured by request hooks | Installed with Kit. Initialize it when enabling auditing | Initialize Audit with the desired `capture` settings before serving requests |
| `@h-ai/cache` with Redis | Supply shared atomic rate-limit counters | When using the built-in Redis rate-limit store adapter | Connect to Redis, create the store with `core.access.createCacheRateLimitStore()`, then pass it into the hook |
| `@h-ai/feedback` | Handle feedback REST routes | When using `kit.createFeedbackHandler()` | Initialize Feedback before passing it and a trusted context resolver to the handler |

## Quick Start

Start with a status endpoint and verify HTTP 200 with `data.status: "ready"`. Then add order previews, authorization, rate limiting and transport encryption to the same SvelteKit app. [Order console tutorial](../getting-started/kit.en.md#quick-start)

<a id="api-reference"></a>

## Features

Look up API inputs, return values, and integration options. Each scenario uses Orders Console. The tutorial above walks through the app from installation to deployment.

See the equivalent Serv scenarios for [initial setup](../getting-started/serv.en.md#quick-start) · [access policy](serv.en.md#request-access-example) · [rate limiting and reset](serv.en.md#rate-limit-example) · [authentication and permissions](serv.en.md#authorization-example) · [input validation](serv.en.md#validation-example) · [encrypted transport](serv.en.md#transport-example).

Import `kit` from `@h-ai/kit` on the server. The browser condition exposes client tools, in-memory tokens, CRUD, permission matching, locale and configuration helpers. In SvelteKit browser code, `@h-ai/kit/client` also provides the SvelteKit navigation adapter. `@h-ai/kit/adapter` runs at build time. The server root provides `kit.crypto`. In the browser, use `kit.guard.matchPermission()` to decide which menu actions to display. Use server-side guards such as `kit.guard.require()` to authorize requests.

<a id="build-config"></a>

### `kit.adapter.create()`

Import @h-ai/kit/adapter in vite.config.ts to select a SvelteKit adapter for each build target.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.adapter.create(options?)` | Select the build adapter | Optional `options.nodeBuildDir` defaults to `build`, `staticBuildDir` to `build-static`, and `staticFallback` to `index.html`. `VITE_ADAPTER=static` selects the static build. Other values select Node. | `Promise<Adapter>`, rejects if the selected adapter is missing | `await kit.adapter.create({ staticBuildDir: "dist-spa" })` |

#### Scenario: Produce Node and static builds from one app

Install both build dependencies and let `vite.config.ts` select the adapter from the process environment. The Node build can serve API and SSR routes. For a static build, configure prerendering or use the SPA fallback with the static host’s routing rules.

```sh
pnpm add -D @sveltejs/adapter-node @sveltejs/adapter-static
```

```ts
import { kit } from '@h-ai/kit/adapter'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

const adapter = await kit.adapter.create()
export default defineConfig({
  plugins: [sveltekit({ adapter, paths: { base: '', relative: false } })],
})
```

Run `pnpm build` to create `build/`. Run `VITE_ADAPTER=static pnpm build` to create `build-static/`. The static output runs without server hooks or API routes.

<a id="kit-resolve-config"></a>

### `kit.resolveConfig()`

`KitConfigSchema` validates the application's loaded settings. Use `kit.resolveConfig()` to parse an in-memory settings object with defaults. [Configuration file loading and overrides](../configuration/kit.en.md)

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.resolveConfig(input?)` | Resolve Kit application settings | Optional `input: KitConfigInput` defaults to an empty object. Parses `server`, `transport`, `http.trustedProxies`, `http.access`, and `http.rateLimit`. | `KitConfig`, throws `ZodError` for invalid input | `kit.resolveConfig({ transport: false })` |
| `KitConfigSchema` | Validate loaded Kit settings | Named root export that also works with `core.config.validate`. | Zod schema whose `safeParse` returns the validation result | `KitConfigSchema.safeParse({ transport: false })` |

#### Scenario: Check Kit settings and defaults before startup

The support team usually runs the order portal on managed Node. To debug locally with a custom launcher, read port 3100 and verify the default settings when transport, access checks, and rate limits are omitted.

```ts
import { kit, KitConfigSchema } from '@h-ai/kit'

// The host loads settings first. Stop startup if safeParse reports invalid fields.
const parsed = KitConfigSchema.safeParse({ transport: false })
if (!parsed.success)
  throw parsed.error

// Resolve port 3100 for a custom launcher. Missing settings take their defaults. Invalid values throw ZodError.
export const listener = kit.resolveConfig({ server: { port: 3100 } }).server
// Pass the validated HTTP settings to the SvelteKit hook. This example leaves rate limiting off.
export const handle = kit.createHandle({
  http: { ...parsed.data.http, rateLimit: false },
})
```

`parsed.data.transport`, `http.access`, and `http.rateLimit` are all `false`, and `http.trustedProxies` is `auto`. A custom launcher can pass the resulting `listener.port` of `3100` to its Node HTTP server. A valid `PORT` environment value overrides the example port. The standard adapter-node process reads `HOST` and `PORT`.

<a id="hooks"></a>

### `kit.createHandle()`

`kit.createHandle()` returns the server hook to export from `src/hooks.server.ts`. Configure sessions, access rules, and rate limits here. Use [`kit.handler()`](#kit-handler) for errors from an individual API endpoint.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.createHandle(config?)` | Request pipeline | Optional `config` for auth, logging, middleware, and access. See [hook settings](#host-options). | `SvelteKit Handle`. Throws on invalid settings or missing required encryption options or Cookie keys. | `kit.createHandle({ logging: true })` |

<a id="host-options"></a>

##### Hook arguments and runtime dependencies

| Field | Default and conditions | Purpose or concrete result |
| --- | --- | --- |
| `http.trustedProxies` / `http.access` | Defaults to `auto` / `false` | Determines caller addresses and application access rules. |
| `auth.iam` / `auth.verifyToken` | Optional. A custom verifier takes precedence and returns a `HaiResult`. | Read a session from a Bearer token or cookie. An invalid token leaves the request unauthenticated, and an identity-service failure returns a safe 5xx. |
| `auth.cookieName` / `protectedPaths` / `publicPaths` / `loginUrl` | Cookie defaults to `hai_access_token` | Set public and protected routes using deployed paths. Public paths take precedence. |
| `guards` / `middleware` / `onError` | Optional. The default handler returns a safe 500 response. | Runs business guards after authentication and custom middleware after built-in logging and rate limiting. |
| `http.rateLimit.store` / `windowMs` / `maxRequests` / `keyGenerator` / `onLimitReached` | Omitted or `false` disables rate limiting. An atomic store is required when enabled. Defaults are 60,000 ms and 100 requests. | The default trusted-IP limit runs before transport handling and session verification. A custom `keyGenerator` runs after session resolution and the guard checks. Exceeding the limit returns 429 by default. See the [rate-limit example](#rate-limit-example). |
| `logging` / `logging.logBody` | Logging is on and `logBody` is off by default | `logBody: true` adds only the `hasBody` boolean, which indicates whether the request has a body stream. Kit leaves the body unread and out of the log. |
| `crypto.encryptedCookies` / `crypto.cookieEncryptionKey` | Disabled when omitted. The cookie key can also come from `HAI_KIT_COOKIE_KEY`. | Enables authenticated encryption for named cookies. |
| `transport` | Disabled when omitted or `false` | Pass initialized `crypto`, the server key ring, and the shared registration store. See [transport arguments](#kit-transport-arguments). |
| `a2a` | Disabled by default. Pass the result of `ai.a2a.createHttpHandler()`. | Mount the Agent Card and JSON-RPC endpoints. The shared handler defines the paths and authentication. |
| `cors` | Disabled when omitted or `false`. | Set explicit cross-origin sources, credentials, and exposed headers. |
| `contract` | File routes remain the default. | Mount a shared API contract and OpenAPI. |

For example, `kit.createHandle({ logging: true, auth: { verifyToken, protectedPaths: ["/admin/**"] } })` requires a session on matching routes.

<a id="orders-console-cookie"></a>

#### Scenario: Encrypt order preferences stored in the browser

Add `crypto: { crypto, encryptedCookies: ["order_preferences"] }` to the existing hook options. Use the Crypto instance from [step 5](../getting-started/kit.en.md#orders-console-transport), or initialize it separately if transport is disabled. Set `HAI_KIT_COOKIE_KEY` to 32 hexadecimal characters for development. The setting applies to the named cookie.

Add `src/routes/api/v1/orders/preferences/+server.ts`. Use POST when the operator switches to compact mode and GET to read the preference after reload. Include this route in `protectedPaths` from [step 3](../getting-started/kit.en.md#orders-console-auth).

```ts
import { kit } from '@h-ai/kit'

export const POST = kit.handler(({ cookies, url }) => {
  cookies.set('order_preferences', 'compact', {
    path: url.pathname,
    httpOnly: true,
    sameSite: 'lax',
  })
  return kit.response.ok({ compact: true })
})
export const GET = kit.handler(({ cookies }) =>
  kit.response.ok({ compact: cookies.get('order_preferences') === 'compact' }),
)
```

When the operator switches mode, `Set-Cookie` contains an encrypted `order_preferences` value. The same browser then reads `data.compact: true`. [Cookie key and settings](../configuration/kit.en.md#cookie-environment)

<a id="detailed-workflow"></a>

#### Scenario: Require sign-in for admin pages and share a rate limit across instances

Keep the [session and permissions from step 3](../getting-started/kit.en.md#orders-console-auth) and the [HTTP options from step 4](../getting-started/kit.en.md#orders-console-access). Use the same Redis namespace for multiple replicas or an in-memory counter on one process. For a management page that needs a sign-in redirect, include its path in `protectedPaths`, set `loginUrl: base + "/auth/login"`, and keep the login path in `publicPaths`. Unauthenticated API calls return 401.

<a id="rate-limit-example"></a>

#### Scenario: Verify a rate limit and its reset with three requests

Start the app with the single-process settings from [step 4](../getting-started/kit.en.md#orders-console-access). In a fresh window, send these three requests from the same terminal. Expect HTTP 200 twice, then HTTP 429. Check `Retry-After`, `X-RateLimit-Remaining: 0` and `X-RateLimit-Reset`. Wait the number of seconds in `Retry-After` and send a new request to verify that it returns 200. With shared Redis, use different replicas to verify that they share the same allowance.

```sh
for attempt in 1 2 3; do
  curl -i http://localhost:5173/api/v1/status
done
```

<a id="request-access-example"></a>

#### Scenario: Allow only the partner network to read reports

[Step 4](../getting-started/kit.en.md#orders-console-access) adds the partner endpoint to this console and gives the trusted IPs to verify 200 and 403. On a subdirectory deployment, update the matching request pathname as shown in [step 5](../getting-started/kit.en.md#orders-console-transport).

<a id="orders-console-diagnostics"></a>

#### Scenario: Time an order request and return a safe error

When an operator reports slow previews, update the same `src/hooks.server.ts`. Merge these three properties into the existing hook options. `logBody` records whether a body stream exists. The timer wraps this middleware’s `next()`. Unexpected errors that reach this hook can return a generic 500 response.

```ts
logging: { logBody: true },
middleware: [
  async (_context, next) => {
    const started = performance.now()
    const response = await next()
    const headers = new Headers(response.headers)
    headers.set('Server-Timing', 'orders;dur=' + (performance.now() - started).toFixed(1))
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  },
],
onError: () => kit.response.internalError(),
```

Check a preview response for the `Server-Timing` metric. Errors already mapped by `kit.handler()` use its response. Hook-level `onError` handles ordinary unexpected errors that still reach the hook.

<a id="orders-console-guards"></a>

#### Scenario: Restrict the order approval page to authorized staff

Add the approval page at `src/routes/admin/orders/approve/+page.svelte`. Include `base + "/admin/orders/approve"` in `auth.protectedPaths` from [step 3](../getting-started/kit.en.md#orders-console-auth) and add the following custom guard. `auth.loginUrl` supplies the sign-in redirect.

```ts
guards: [{
  paths: [base + '/admin/orders/approve'],
  guard: (_event, session) => ({
    allowed: kit.guard.check(session, 'orders:approve'),
    status: 403,
  }),
}],
```

An anonymous request hits the authentication guard first. A signed-in user without `orders:approve` gets 403. The approval API still checks whether the user may approve the particular order.

<a id="kit-middleware-rate-limit"></a>

### `kit.middleware.rateLimit()`

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.middleware.rateLimit(config)` | Limit requests in a fixed window | Requires an atomic `store`. Optional `windowMs` accepts integers from 1 to 2147483647 milliseconds and defaults to 60000. Optional `maxRequests` accepts positive safe integers and defaults to 100. Optional `keyGenerator(event)` defaults to trusted address. `onLimitReached(event)` defaults to a 429 response. | Middleware. Returns 503 if the store fails. | `kit.middleware.rateLimit({ windowMs: 60000, maxRequests: 100, store })` |

#### Scenario: Give order exports their own request budget

Operations staff export orders from the portal. `GET /api/v1/orders/export` uses more resources than a normal read, so give each client two exports per 10 seconds. Put this hook in `src/hooks.server.ts` and use an existing export endpoint that checks the session and export permissions. This example uses an in-process counter.

Put the middleware in `src/hooks.server.ts` and append `limitOrdersExport` to the existing `middleware` list. Keep `auth`, `http`, and `transport`. Add the export API to `auth.protectedPaths` and have the endpoint check `orders:export` and order ownership. Global and route quotas count separately.

```ts
import { core } from '@h-ai/core'
import { type Middleware, kit } from '@h-ai/kit'

// Give exports two requests per 10 seconds. A request over the limit gets 429.
const limitExport = kit.middleware.rateLimit({
  windowMs: 10_000,
  maxRequests: 2,
  store: core.access.createMemoryRateLimitStore(),
})

// Count export requests only. Continue processing other routes through SvelteKit.
const limitOrdersExport: Middleware = (context, next) =>
  context.event.request.method === 'GET' && context.event.route.id === '/api/v1/orders/export'
    ? limitExport(context, next)
    : next()
```

Request the endpoint three times from the same client within 10 seconds. The first two calls reach the exporter, the third returns 429, and other routes continue normally. Use Redis to share the budget across instances.

<a id="kit-sequence"></a>

### `kit.sequence()`

`kit.sequence()` runs SvelteKit hooks in order. The example selects a language before the Kit hook handles the request. When hooks set `transformPageChunk`, transforms run from inner to outer. The first `preload` and serialized header filter configurations apply.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.sequence(...handles)` | Compose hooks | Pass zero or more SvelteKit `Handle` values in `handles`, in execution order. | `Handle preserving resolve options` | `kit.sequence(i18nHandle, authHandle)` |

#### Scenario: Serve each concurrent portal visitor in their own language

Orders Console serves English and Japanese operators concurrently. The `orders_locale` cookie selects their languages in the two local requests below. In production, use a verified profile preference or route.

In the example app served at the origin root, place the following in `src/hooks.server.ts`.

```ts
import type { Handle } from '@sveltejs/kit/hooks'
import { kit } from '@h-ai/kit'

// Set the startup default to English. Leave it in place when handling individual requests.
kit.i18n.setLocale('en-US')

const setRequestLocale: Handle = ({ event, resolve }) => {
  const locale = event.cookies.get('orders_locale') === 'ja-JP' ? 'ja-JP' : 'en-US'
  // Use the recognized cookie value for this request and the asynchronous work it starts.
  // resolve(event) continues this request, and runWithLocale returns its response unchanged.
  return kit.i18n.runWithLocale(locale, () => resolve(event))
}

// Set the request locale before running the default hook and the endpoint.
export const handle = kit.sequence(setRequestLocale, kit.createHandle())
```

Put this endpoint in `src/routes/api/v1/orders/locale/+server.ts`.

```ts
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'

// Read the current request’s locale and return HTTP 200 with the locale available to the UI.
export const GET = kit.handler(() => kit.response.ok({ locale: core.i18n.getGlobalLocale() }))
```

Start the development server and send the requests concurrently. The Japanese request returns `data.locale: "ja-JP"`. The request without a cookie returns `data.locale: "en-US"`. Either can finish first.

```bash
curl -sS --cookie 'orders_locale=ja-JP' http://localhost:5173/api/v1/orders/locale &
curl -sS http://localhost:5173/api/v1/orders/locale &
wait
```

<a id="kit-i18n"></a>

### `kit.i18n`

Call `setLocale()` to set the default at startup and `runWithLocale()` to bind a language while a server operation runs. The [request locale example](#kit-sequence) checks the default language and Japanese separately.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.i18n.setLocale(locale)` | Set the startup locale | Required `locale` sets the startup default locale, such as `en-US`. | `void, set during startup` | `kit.i18n.setLocale("zh-CN")` |
| `kit.i18n.runWithLocale(locale, operation)` | Isolate the request locale | Required request `locale` and `operation` callback whose result is preserved. Node server only. | `The callback result` | `kit.i18n.runWithLocale("en-US", () => resolve(event))` |

<a id="kit-handler"></a>

### `kit.handler()`

Export the result of `kit.handler(fn)` as an HTTP method from `+server.ts`. A thrown `Response` is returned as-is. SvelteKit's `redirect()` and `error()` retain framework control flow. Unexpected errors become safe HTTP 500 responses.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.handler(fn)` | Handle route errors | Required `fn(event)` receiving a SvelteKit request event and returning a `Response` or a promise of one. | `SvelteKit request handler` | `kit.handler(async () => kit.response.ok({ ready: true }))` |

<a id="validation-example"></a>

#### Scenario: Let only users with write permission preview an order

[Step 2](../getting-started/kit.en.md#orders-console-validation) adds the order preview and validates its body. [Step 3](../getting-started/kit.en.md#orders-console-auth) adds the permission check to the same handler with the same URL, file, and input.

After starting the app with the tutorial’s development token, send a valid preview and then a request without the required title. The first returns HTTP 200 with `data.preview.title` set to `Office supplies`. The second returns the HTTP 400 produced by validation and returned by `kit.handler()`. Omitting the access token returns HTTP 401.

```sh
curl -i http://localhost:5173/api/v1/orders/preview \
  -H "Authorization: Bearer $KIT_ORDERS_EDITOR" \
  -H 'Content-Type: application/json' \
  --data '{"title":"  Office supplies  "}'
curl -i http://localhost:5173/api/v1/orders/preview \
  -H "Authorization: Bearer $KIT_ORDERS_EDITOR" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

<a id="kit-validate"></a>

### `kit.validate`

Use Zod to parse request JSON, forms, query strings, or route parameters. Invalid input throws an HTTP 400 response, which [`kit.handler()`](#kit-handler) returns. For typed clients, keep the file route, HTTP method, and response shape in sync with the [shared contract](./api-contract.en.md#use-with-kit).

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.validate.body(request, schema)` | Validate JSON or form data | Required HTTP `request` and Zod `schema` for its JSON or form data. | `Promise<schema data>; invalid input throws Response` | `kit.validate.body(request, InputSchema)` |
| `kit.validate.query(url, schema)` | Validate query parameters | Required `url: URL` and Zod `schema` for its search parameters. | `schema data; invalid input throws Response` | `kit.validate.query(url, QuerySchema)` |
| `kit.validate.params(params, schema)` | Validate route parameters | Required `params`, a route parameter string map, and the Zod `schema`. | `schema data; invalid input throws Response` | `kit.validate.params(params, IdSchema)` |
| `kit.validate.IdParamSchema` | Resource identifier | Requires a non-empty `id: string`. `IdParamSchema` is also a named root export. | `Zod parsed ID object` | `kit.validate.IdParamSchema.parse({ id: "o1" })` |
| `kit.validate.PaginationQuerySchema` | Pagination query | Positive integer `page` defaults to 1 and `pageSize` to 20, with a maximum of 100. `search` is optional. `PaginationQuerySchema` is also a named root export. | `normalized pagination object` | `kit.validate.PaginationQuerySchema.parse({ page: "1" })` |

#### Scenario: Validate order titles, pagination, and IDs

Test order inputs in Node. Before submitting `Office supplies` from the editor, the page has an order ID and pagination from the list. The test creates an HTTP request directly. For the real route, see the [order preview](#validation-example).

```ts
import { kit } from '@h-ai/kit'
import { z } from 'zod'
const schema = z.object({ title: z.string().min(1) })
const request = new Request('https://app.example.com/api/v1/orders/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Office supplies' }) })
// Validate the sample JSON POST body with the title schema. On success body is { title: 'Office supplies' }. Invalid JSON or fields fail validation.
await kit.validate.body(request, schema) // { title: 'Office supplies' }
// Parse page=1 from this URL and normalize it with pagination defaults. Invalid query values fail validation.
kit.validate.query(new URL('https://app.example.com/api/orders?page=1'), kit.validate.PaginationQuerySchema) // normalized page
// Validate the sample route parameters. id remains o1 and invalid values fail validation.
kit.validate.params({ id: 'o1' }, kit.validate.IdParamSchema) // { id: 'o1' }
// Validate the same id with the schema directly. Returns { id: 'o1' } or throws a Zod error.
kit.validate.IdParamSchema.parse({ id: 'o1' }) // { id: 'o1' }
// Convert the query string page to a numeric page and fill its defaults. An invalid page throws a Zod error.
kit.validate.PaginationQuerySchema.parse({ page: '1' }) // normalized page defaults
```

<a id="kit-response"></a>

### `kit.response`

Map a domain value or `HaiResult` to an HTTP response. The client reads the status, `success`, and error code to distinguish creation, an empty response, and a business error.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.response.ok(data, requestId?)` | Success response | Required success `data`. Optional `requestId` correlates the response. | `Response with HTTP 200 and success data` | `kit.response.ok({ id: "o1" })` |
| `kit.response.created(data, requestId?)` | Resource created | Required created resource `data`. Optional `requestId` correlates the response. | `Response with HTTP 201 and success data` | `kit.response.created({ id: "o1" })` |
| `kit.response.noContent()` | No response body | `none` | `Response with HTTP 204` | `kit.response.noContent()` |
| `kit.response.error(code, message, status?, requestId?, details?)` | Custom failure | Required error `code` and public `message`. `status` defaults to 400. Optionally add `requestId` and safe public `details`, which are omitted for 5xx. | `safe failure Response` | `kit.response.error("app:orders:001", "Invalid request", 400)` |
| `kit.response.badRequest(message, requestId?, details?)` | Invalid request | Required public validation `message`. Optional `requestId` and safe public `details`. | `HTTP 400 Response` | `kit.response.badRequest("Invalid request")` |
| `kit.response.unauthorized(message?, requestId?)` | Authentication required | Optional public `message` defaults to the framework text. Optional `requestId` correlates the request. | `HTTP 401 Response` | `kit.response.unauthorized()` |
| `kit.response.forbidden(message?, requestId?)` | Permission denied | Optional public `message` defaults to the framework text. Optional `requestId` correlates the request. | `HTTP 403 Response` | `kit.response.forbidden()` |
| `kit.response.notFound(message?, requestId?)` | Resource missing | Optional public `message` defaults to the framework text. Optional `requestId` correlates the request. | `HTTP 404 Response` | `kit.response.notFound()` |
| `kit.response.conflict(message, requestId?)` | Version conflict | Required public `message` describes the conflict. Optional `requestId` correlates the request. | `HTTP 409 Response` | `kit.response.conflict("Data changed")` |
| `kit.response.validationError(errors, requestId?)` | Field validation | Required `errors` array with field name `field` and public validation `message` per entry. Optional `requestId`. | `HTTP 422 Response; errors in safe error.cause` | `kit.response.validationError([{ field: "title", message: "Title is required" }])` |
| `kit.response.internalError(message?, requestId?)` | Internal failure | Optional `message` is for server diagnostics. The client receives the generic 500 message. | `HTTP 500 Response with safe message` | `kit.response.internalError()` |
| `kit.response.redirect(url, status?)` | Redirect | Required target URL string `url`. The redirect `status` defaults to 302. | `redirect Response` | `kit.response.redirect("/auth/login")` |
| `kit.response.fromResult(result, httpStatusMap?, requestId?)` | Map a domain result | Required business `result`. Optional `httpStatusMap` overrides status by error code, and `requestId` supplies correlation. | `HTTP Response; preserves safe code/status/traceId` | `kit.response.fromResult(result)` |
| `kit.response.fromError(haiError, requestId?)` | Map a domain error | Required `haiError`. `requestId` is optional and falls back to the current request context. | `safe HTTP failure Response` | `kit.response.fromError(result.error)` |

#### Scenario: Distinguish creation, deletion, and missing orders by status

The order list opens the details page for a new order and removes a row after deletion. If the order cannot be found, it shows a 404 message. Test the HTTP responses generated from these repository outcomes.

```ts
import assert from 'node:assert/strict'
import { core, HaiCommonError } from '@h-ai/core'
import { kit } from '@h-ai/kit'

// Return HTTP 201 with the new order ID so the page can navigate there.
const created = kit.response.created({ id: 'o1' })
assert.equal(created.status, 201)
assert.equal((await created.json()).data.id, 'o1')

// Return HTTP 204 with an empty body after deletion so the page can remove the row.
const removed = kit.response.noContent()
assert.equal(removed.status, 204)
assert.equal(await removed.text(), '')

// Map a missing-order result to HTTP 404 with its public error code.
const missing = kit.response.fromResult(core.err(HaiCommonError.NOT_FOUND, 'Order not found'))
assert.equal(missing.status, 404)
assert.equal((await missing.json()).error.code, HaiCommonError.NOT_FOUND.code)
```

HTTP 201 has order data and 204 has an empty body. The page can read `error.code` on a 404. For inline form errors, `validationError()` returns 422 with field details in `error.cause`.

<a id="kit-guard"></a>

### `kit.guard`

`kit.guard.require()` checks `locals.session.permissions` after IAM verifies the session. It throws 401 for a missing session or 403 for a missing permission. The implementation goes through `requirePermission()`, `assertPermission()`, and `matchPermission()`. Check roles and resource access separately when required by the app. [Guard implementation](../../../packages/kit/src/guards/kit-permission.ts)

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.guard.check(session, permission)` | Check permission | Required `session` is the current session and can be `null`. Required `permission` is the permission to check. | `boolean` | `kit.guard.check(session, "orders:read")` |
| `kit.guard.require(session, permission)` | Require permission | Required `session` is the current session and can be `null`. Required `permission` is the permission to check. | `void; denied access throws Response` | `kit.guard.require(session, "orders:write")` |
| `kit.guard.requireSensitive(iam, event, operation)` | Require operation-bound proof | Required initialized `iam`, current request `event`, and server-registered `operation`. | `Promise<void>; invalid proof throws Response` | `kit.guard.requireSensitive(iam, event, "orders.approve")` |
| `kit.guard.matchPermission(required, userPermissions)` | Match permissions for frontend display | Required `required` permission code and trusted session `userPermissions` array. | `boolean` | `kit.guard.matchPermission('reports:read', ['reports:read'])` |

#### Scenario: Let auditors with report-read permission view the report

[Step 3](../getting-started/kit.en.md#orders-console-auth) mounts the auditor’s report in the same Orders Console, using a permission check followed by the `auditor` role check before returning the report.

#### Scenario: Show the report link according to the user’s permissions

Pass the verified session’s `permissions` from the admin layout to the reports menu. Pass `undefined` for a signed-out user. The menu chooses whether to display the link. The report endpoint checks the request’s session and report permission.

```ts
import { kit } from '@h-ai/kit/client'

export function showReportLink(permissions?: string[]) {
  // Render the menu using permissions from the layout. Use an empty list for signed-out users.
  return kit.guard.matchPermission('reports:read', permissions ?? [])
}
```

Users with `reports:*` or the exact `reports:read` permission see the link. The global `*` also matches. The menu hides the link for signed-out users and users whose permissions only cover other domains.

<a id="kit-sensitive-guard"></a>

#### Scenario: Verify the operator again before archiving audit logs

Initialize IAM and Audit and select `audit.backup` as an operation that requires reauthentication. The auditor starts a backup in the admin console and sends `X-Hai-Reauthentication` obtained during reauthentication. Put this code in `src/routes/api/audit/backup/+server.ts`.

```ts
import { AuditBackupInputSchema } from '@h-ai/api-contract'
import { audit } from '@h-ai/audit'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async (event) => {
  // Require audit:backup permission. Stop anonymous and unauthorized calls before backup.
  kit.guard.require(event.locals.session, 'audit:backup')
  // Check the short-lived proof for audit.backup. Invalid proof throws a public error response.
  await kit.guard.requireSensitive(iam, event, 'audit.backup')
  // Validate the backup input and run the archive. Pass the request cancellation signal to Audit.
  const input = await kit.validate.body(event.request, AuditBackupInputSchema)
  const result = await audit.backup.run({ ...input, signal: event.request.signal })
  // Map the backup result to an HTTP response. Preserve the public error on failure.
  return kit.response.fromResult(result)
})
```

Missing permission or an unacceptable reauthentication proof stops the backup. After both checks pass, the response contains the archive result. [Admin console implementation](../../../apps/admin-console/src/routes/api/audit/backup/+server.ts) · [IAM reauthentication](iam.en.md)

<a id="auth"></a>

### `kit.auth`

`kit.auth.createApi(iam)` provides server handlers for sign-in, registration, CAPTCHA, and password changes. After sign-in, the browser sends the same-origin HttpOnly cookie automatically. When the session expires, the app can [sign in again and recover the request](#kit-client-recovery).

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.auth.publicPaths` | Public authentication paths | Obtain public authentication paths for authentication guards. | Obtain public authentication paths for authentication guards. | `kit.auth.publicPaths` |
| `kit.auth.createApi(iam)` | Create authentication handlers | Pass the initialized `iam` service. The handlers use that instance and the cookie name configured for the current request. | `RequestHandler map for login/OTP/reset/config/etc.` | `kit.auth.createApi(iam)` |
| `kit.auth.login(cookies, credentials, context?)` | Password sign-in | Required `cookies` and `credentials` with `identifier` and `password`. Optional `captcha` follows IAM policy and `expectedUserId` is for same-user recovery. See [authentication parameters](#kit-auth-context) for optional `context`. | `Promise<HaiResult<AuthResult>>; writes token cookies on success` | `kit.auth.login(cookies, { identifier: "alice", password })` |
| `kit.auth.loginWithOtp(cookies, credentials, context?)` | OTP sign-in | Required `cookies` and `credentials` with `identifier` and `code`. Optional `captcha` follows IAM policy and `expectedUserId` is for same-user recovery. See [authentication parameters](#kit-auth-context) for optional `context`. | `Promise<HaiResult<AuthResult>>` | `kit.auth.loginWithOtp(cookies, otpCredentials)` |
| `kit.auth.loginWithLdap(cookies, credentials, context?)` | LDAP sign-in | Required `cookies` and `credentials` with `username` and `password`. Optional `captcha` follows IAM policy and `expectedUserId` is for same-user recovery. See [authentication parameters](#kit-auth-context) for optional `context`. | `Promise<HaiResult<AuthResult>>` | `kit.auth.loginWithLdap(cookies, ldapCredentials)` |
| `kit.auth.loginWithApiKey(cookies, credentials, context?)` | API-key sign-in | Required `cookies` and `credentials` with `key`. See [authentication parameters](#kit-auth-context) for optional `context`. | `Promise<HaiResult<AuthResult>>` | `kit.auth.loginWithApiKey(cookies, apiKeyCredentials)` |
| `kit.auth.registerAndLogin(cookies, options, context?)` | Register and sign in | Required `cookies`, `options.username`, and `options.password`. See [authentication parameters](#kit-auth-context) for optional `context` and registration fields. | `Promise<HaiResult<AuthResult>>` | `kit.auth.registerAndLogin(cookies, registration)` |
| `kit.auth.logout(cookies, accessToken?)` | Sign out explicitly | `cookies` is the current SvelteKit cookie writer. Optional `accessToken` revokes that session at the server. Cookies are cleared even when omitted. | `Promise<HaiResult<void>>` | `kit.auth.logout(cookies, accessToken)` |
| `kit.auth.sessionFingerprint(accessToken?)` | Bind page-exit requests to a session | Pass the server-verified access token. | Fingerprint string or `undefined` when there is no token | `kit.auth.sessionFingerprint(accessToken)` |
| `kit.auth.setBrowserToken(token)` | Store an in-memory token | Required `token` is the access-token string to keep in page memory. | `void, page memory only` | `kit.auth.setBrowserToken(accessToken)` |
| `kit.auth.clearBrowserToken()` | Clear the in-memory token | `none` | `void` | `kit.auth.clearBrowserToken()` |

<a id="kit-auth-context"></a>

##### Authentication context and registration options

| Field | Default and conditions | Purpose or concrete result |
| --- | --- | --- |
| `context.terminalType` | Default `web` | Classifies sessions with `web`, `app`, `desktop`, or `api`. |
| `context.ip` / `userAgent` / `requestId` | All optional | Passes the caller address, client metadata, and correlation ID from the trusted host request to IAM. |
| `options.username` / `password` | Required and validated by IAM policy | Names the account to register and supplies its password. |
| `options.email` / `phone` / `displayName` / `metadata` / `captcha` | Supply according to the form and IAM policy | Supplies contact information, a display name, application metadata, or a CAPTCHA value. Select fields with the public registration schema. |

For example, pass `{ terminalType: "desktop", requestId: "req-1" }` to classify a successful login as a desktop session and correlate the request.

##### Standard authentication handlers and client actions

`kit.auth.createApi(iam)` returns the handlers below. Export them from the corresponding SvelteKit file routes. Async methods from `kit.client.createAuthActions()` return a `HaiResult` and reject on a network or response-format failure. `actions.bindPageExit(options?)` returns a disposer. By default it adds no listener.

| Server handler | Method and path under `/api/auth` | Browser action |
| --- | --- | --- |
| `publicConfig` | `GET /config` | `actions.publicConfig()` |
| `login` | `POST /login` | `actions.login(input)` |
| `loginWithLdap` | `POST /login/ldap` | `actions.login({ ...input, method: 'ldap' })` |
| `loginWithOtp` | `POST /login/otp` | `actions.login({ ...input, method: 'email', code })` |
| `register` | `POST /register` | `actions.register(input)` |
| `createCaptcha` | `POST /captcha` | `actions.createCaptcha(input)` |
| `sendOtp` | `POST /otp/send` | `actions.sendOtp(identifier, options?)` |
| `requestPasswordReset` | `POST /password-reset/request` | `actions.requestPasswordReset(identifier, options?)` |
| `confirmPasswordReset` | `POST /password-reset/confirm` | `actions.confirmPasswordReset(token, newPassword)` |
| `renewPassword` | `POST /password/renew` | `actions.renewPassword(input)` |
| `reauthenticate` | `POST /reauthenticate` | `actions.reauthenticate(password, operation)` |
| `closeSession` | `POST /session/close` | `actions.bindPageExit(options?)` |

<a id="authorization-example"></a>

#### Scenario: Sign in with a password and access a protected endpoint

Put the following in `src/routes/api/auth/login/+server.ts`. Initialize IAM and wire the verifier and public routes in the [request hook](#detailed-workflow). The browser passes the identifier and password from the form through a same-origin client. The success body contains the user. IAM enforces configured CAPTCHA, expired-session and password-renewal rules.

Successful password sign-in sets the HttpOnly cookie. A subsequent same-origin protected endpoint can identify the session. The browser checks `success` before updating its state. For API-key sign-in, call `kit.auth.loginWithApiKey` from server code. The direct login helpers use the configured `auth.iam`. Combine `kit.guard.require` with resource-level authorization, and require operation-bound proof for selected sensitive writes.

```ts
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

// Build the sign-in handler with initialized IAM. A successful password sign-in sets the HttpOnly cookie. A failed sign-in returns an error response.
export const POST = kit.auth.createApi(iam).login
```

```ts
import { kit } from '@h-ai/kit/client'

export async function signIn(identifier: string, password: string) {
  // Create a browser client using the default same-origin base URL.
  const client = kit.client.create()
  try {
    // Pass the browser client’s apiFetch to the auth actions so they use the same request configuration.
    const actions = kit.client.createAuthActions({ apiFetch: client.apiFetch })
    // Submit the form identifier and password. Use the user data on success or the error on failure. A network failure rejects the Promise.
    const result = await actions.login({ identifier, password })
    return result.success
      ? { signedIn: true as const, response: result.data }
      : { signedIn: false as const, error: result.error }
  }
  finally {
    // Release the temporary client after sign-in succeeds or fails.
    client.destroy()
  }
}
```

<a id="auth-current-account"></a>

#### Scenario: Look up the current account after signing in

After password sign-in, the portal reads the current account from `data.user` on `GET /api/auth/me`. Use the [authentication hook](#detailed-workflow) to verify the session and declare `locals.session` as in the [order preview](#validation-example). Put the following in `src/routes/api/auth/me/+server.ts`. After signing in, verify that the browser receives HTTP 200 and the current user. An anonymous request returns 401.

```ts
import { kit } from '@h-ai/kit'

// Return the session verified by the hook with HTTP 200. Return HTTP 401 when no session exists.
export const GET = kit.handler(({ locals }) => locals.session
  ? kit.response.ok({ user: locals.session })
  : kit.response.unauthorized())
```

Use `iam.auth.verifyToken` as the hook verifier and allow the standard public auth endpoints with `kit.auth.publicPaths`. For a subdirectory deployment, prepend the application base path. Current-account endpoints such as `/api/auth/me` still require a session.

Use the browser client’s `createAuthActions` with the matching authentication routes. To enable CAPTCHA, export `createApi(iam).createCaptcha` for `POST /api/auth/captcha`. Forward the challenge result and the CAPTCHA proof from the form through the standard actions. IAM checks the proof and enforces the password-renewal policy.

#### Scenario: Try to end the current session when leaving the portal

To attempt to close the session when the user leaves the portal, enable IAM’s `session.endOnPageHide` and export `kit.auth.createApi(iam).closeSession` as `POST` in `src/routes/api/auth/session/close/+server.ts`. Keep the initialized IAM service and authentication hook. Merge the first example into `src/routes/+layout.server.ts` and the second into `src/routes/+layout.svelte`, keeping the layout’s existing data and transport setup.

```ts
import type { LayoutServerLoad } from './$types'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { error } from '@sveltejs/kit'

export const load: LayoutServerLoad = async ({ depends, locals, setHeaders }) => {
  depends('hai:session')
  const config = await iam.getPublicConfig()
  if (!config.success)
    error(503)

  // Return only public settings and the fingerprint for the current session. Fingerprinted responses are private.
  const endOnPageHide = config.data.session.endOnPageHide
  const sessionFingerprint = endOnPageHide
    ? kit.auth.sessionFingerprint(locals.accessToken)
    : undefined
  if (sessionFingerprint)
    setHeaders({ 'cache-control': 'private, no-store' })
  return { endOnPageHide, sessionFingerprint }
}
```

```svelte
<script lang="ts">
  import type { LayoutProps } from './$types'
  import { resolve } from '$app/paths'
  import { kit } from '@h-ai/kit/client'

  const { data, children }: LayoutProps = $props()
  const actions = kit.client.createAuthActions({ basePath: resolve('/').replace(/\/$/, '') + '/api/auth' })

  // Attempt to close the session on page exit. Svelte runs the returned cleanup when the layout is removed or the data changes.
  $effect(() => actions.bindPageExit({
    enabled: data.endOnPageHide,
    sessionFingerprint: data.sessionFingerprint,
  }))
</script>

{@render children()}
```

After signing in, reload with the browser’s Network log preserved to observe `POST /api/auth/session/close`. If the server revokes the session, the next request to the [current-account endpoint](#auth-current-account) returns 401. If the close request is not delivered, the IAM session timeouts still apply.

The page-exit request uses the current cookie only when the fingerprint matches. A missing or mismatched fingerprint leaves the session unchanged. Explicit `accessToken` and Bearer requests still use the token they provide. Reloads and full-page navigation can trigger closure. Pages entering the back-forward cache skip it.

The page-exit request does not refresh or clear credentials. It uses keepalive where supported and is best effort. Use IAM idle or absolute timeouts to limit session lifetime.

In a Bearer flow where the app receives an access token, use `kit.auth.setBrowserToken()` to keep it in browser memory and `kit.client.create({ auth: true })` to send it with same-origin requests. Call `kit.auth.clearBrowserToken()` on exit. These are browser-only operations. On the server, use the identity verified for the current request.

<a id="browser-client"></a>

### `kit.client`

Import the browser client from `@h-ai/kit/client` for same-origin cookies, CSRF and transport. Kit adds in-memory Bearer credentials and the CSRF header only on same-origin requests. With an automatically injected credential, Fetch can follow same-origin redirects and rejects cross-origin redirects. Use `@h-ai/api-client` for cross-origin API access.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.client.create(config?)` | Create a same-origin client | Optional `config` with the fields below | `KitClient { apiFetch, init, destroy, ready }` | `kit.client.create()` |
| `kit.client.createAuthActions(options?)` | Create standard authentication actions | Optional `options`. `apiFetch` defaults to a new default client and `basePath` defaults to `/api/auth`. | AuthPanel-compatible actions | `kit.client.createAuthActions({ basePath: "/api/auth" })` |
| `kit.client.installBrowserTransport(config, deps)` | Install transport from public settings | Required public `config` and `deps.crypto`. Optional `deps.basePath` defaults to the empty string. Set `deps.contractApiPrefix` to the full site path for a custom contract prefix. | `void; installs same-origin global fetch wrapper when enabled` | `kit.client.installBrowserTransport(publicKitConfig, { crypto })` |
| `kit.client.installBrowserTransportFetch(transportConfig?)` | Install custom transport | In a browser pass `transportConfig` with the fields in the `transport` row below. Omission or a server-side call installs no Fetch wrapper. | `void; installs browser global fetch wrapper` | `kit.client.installBrowserTransportFetch(transportOptions)` |
| `kit.client.createSvelteKitNavAdapter()` | Adapt SvelteKit navigation for CRUD | No arguments | `{ pathname, navigate, refresh }` | `kit.client.createSvelteKitNavAdapter()` |

| `client.apiFetch(input, init?, options?)` | Send a request | `input` is a URL, path, or Request. `init` uses Fetch options. See the third argument below. | `Promise<Response>`, rejects on network or transport failure | `await client.apiFetch('/api/v1/status')` |
| `client.init()` | Warm the key exchange | No arguments. Resolves immediately when transport is disabled. | `Promise<void>`, rejects on handshake failure | `await client.init()` |
| `client.ready` | Read readiness | Read-only. Always true when transport is disabled. | `boolean` | `client.ready` |
| `client.destroy()` | Release transport state | No arguments. Called by the owner of the client. | `void` | `client.destroy()` |
| `nav.pathname` | Read the current path | Read-only. Uses SvelteKit’s `page.url.pathname`. | `string` | `nav.pathname` |
| `nav.navigate(url)` | Navigate and reload page data | Required target `url`. Call from browser interactions. | `Promise<void>`, propagates navigation failures | `await nav.navigate('/orders/notices')` |
| `nav.refresh()` | Reload current page data | No arguments. Typically called after a write. | `Promise<void>` | `await nav.refresh()` |

##### Browser client options

| Client option | Default or requirement | Effect |
| --- | --- | --- |
| `auth` | Omit or use `false` to skip access token injection | In the browser, `true` uses the current page’s in-memory token. For a custom store, pass the `BrowserTokenStore` object as the value of `auth`. |
| `terminalType` | `'web'` | Also accepts `'app'`, `'desktop'`, or `'api'`. `X-Hai-Terminal` tells the server which session terminal group to use. |
| `recoverSession` | No recovery when omitted | Provide an async function that returns `true` only when it restored the same user's session. An eligible authentication failure is retried at most once. |
| `csrfCookieName`, `csrfHeaderName` | `hai_csrf`, `X-CSRF-Token` | Write requests copy the token from this cookie to this header. Match both names to the server. |
| `transport` | Disabled when omitted | Supply initialized `crypto` to enable it. `basePath` defaults to an empty string, `contractApiPrefix` can supply the full custom contract prefix, and `keyExchangePath` defaults to `/api/v1/_hai/key-exchange`. Match `excludePaths` to the server's plaintext paths. `maxPlaintextBytes` limits plaintext in bytes and defaults to the negotiated server limit. |

`client.apiFetch(input, init?, options?)` takes a request, URL, or path and native Fetch options such as `method`, `body`, and `signal`. Set `recoverSession: false` in its third argument to disable normal recovery for that call, for example when calling an authentication endpoint from the recovery flow. Optional `reauthorize` obtains a new operation credential for an eligible retry. Return a credential string to replace the previous header, `null` to cancel, or `undefined` to continue without that credential.

Kit injects Bearer and CSRF headers only for same-origin requests whose mode permits them. After injection, Fetch enforces same-origin redirects. Use the [API Client](api-client.en.md) for cross-origin public APIs. HTTP failures still return a Response, so check `response.ok` or `status`.

#### Scenario: Show the same-origin API’s readiness on a page

Add an API-readiness indicator to the portal. Reuse `GET /api/v1/status` from the [quick start](../getting-started/kit.en.md#quick-start) and call `loadReadiness()` from a browser component. On success, show the API as ready when `payload.data.status === 'ready'`. A 4xx or 5xx response throws an error with the HTTP status so the component can show the request failure.

```ts
import { resolve } from '$app/paths'
import { kit } from '@h-ai/kit/client'

// Give a routing-aware component this navigation adapter.
export const nav = kit.client.createSvelteKitNavAdapter()

// Read the success response and release this client’s transport state afterwards.
export async function loadReadiness() {
  const client = kit.client.create()
  try {
    await client.init()
    const response = await client.apiFetch(resolve('/api/v1/status'))
    if (!response.ok)
      throw new Error(String(response.status))
    return { payload: await response.json(), ready: client.ready }
  }
  finally {
    client.destroy()
  }
}
```

On an order page, wire a Reload button to the navigation adapter’s `refresh()` to rerun the current data loader. After saving, `navigate("/orders")` opens the list. Read `pathname` after navigation completes. Import this adapter inside a SvelteKit app because it uses `$app` modules.

<a id="kit-client-recovery"></a>

#### Scenario: Keep the order form and retry when the session expires

An order editor’s session expires while the form is open. Keep the form mounted and use the app’s `askForCredentials()` to open a sign-in dialog. Pass the original verified session’s `userId`. Set up the [password sign-in](#authorization-example) and [current account](#auth-current-account) endpoints.

```ts
import { kit } from '@h-ai/kit/client'

export function createOrderClient(
  userId: string,
  askForCredentials: () => Promise<{ identifier: string, password: string } | null>,
) {
  const client = kit.client.create({
    async recoverSession() {
      // Open the dialog after an eligible 401. Returning false preserves that response.
      const credentials = await askForCredentials()
      if (!credentials)
        return false

      // Pass the original user ID so IAM authorizes recovery for the same account.
      const result = await actions.login({ ...credentials, expectedUserId: userId })
      return result.success
    },
  })
  // Reuse the same-origin client. Standard sign-in actions disable recovery for their own requests.
  const actions = kit.client.createAuthActions({ apiFetch: client.apiFetch })
  return client
}
```

Check recovery with `await client.apiFetch("/api/auth/me")`. An eligible 401 opens the dialog. On successful sign-in, the client retries once and receives 200. Canceling or failing sign-in preserves the original 401. Call `client.destroy()` on teardown. Network failures, 5xx responses, and writes with unknown outcomes do not trigger a retry. Use `reauthorize` for a new sensitive-operation proof. Kit lets the app sign the same account in again. In Serv, a configured API Client can exchange a valid refresh cookie for a new token.

<a id="crud"></a>

### `kit.crud.define()`

Declare CRUD fields and operations, and authorize the principal and resource on every server operation.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.crud.define(resource)` | Declare a CRUD resource | Required CRUD `resource` definition with available actions, routes, and fields. | `CrudOperations<T>` | `kit.crud.define(resourceDefinition)` |
| `kit.crud.resolveText(text)` | Resolve static or deferred text | Required `text`, a string or zero-argument function returning one. | `string` | `kit.crud.resolveText('Name')` |
| `kit.crud.resolveOptions(options)` | Resolve static or deferred options | Array or a zero-argument callback. Pass `undefined` for an empty array. | `CrudFieldOption[]` | `kit.crud.resolveOptions([{ label: 'Active', value: true }])` |
| `crud.resource` | Read resource metadata | The supplied resource definition. | `CrudResourceDef<T>` | `crud.resource.name` |
| `crud.getListFields()` | Select list fields | Includes fields unless explicitly false. Sorts by `order`, which defaults to 0. | `CrudFieldDef[]` | `crud.getListFields()` |
| `crud.getFilterFields()` | Select filter fields | Filters by `filterable`. | `CrudFieldDef[]` | `crud.getFilterFields()` |
| `crud.getCreateFields()` | Select create fields | Includes fields unless explicitly false. Sorts by `order`, which defaults to 0. | `CrudFieldDef[]` | `crud.getCreateFields()` |
| `crud.getEditFields()` | Select edit fields | Includes fields unless explicitly false. Sorts by `order`, which defaults to 0. | `CrudFieldDef[]` | `crud.getEditFields()` |
| `crud.getDetailFields()` | Select detail fields | Includes fields unless explicitly false. Sorts by `order`, which defaults to 0. | `CrudFieldDef[]` | `crud.getDetailFields()` |
| `crud.toTableColumns()` | Build table columns | Resolves list field labels and column settings. | `CrudTableColumn[]` | `crud.toTableColumns()` |
| `crud.getDefaultValues()` | Read initial form values | Uses explicit defaults for all fields. With no override, boolean/checkbox fields use false, multi-select an empty array, numbers undefined, and other types an empty string. | `Record<string, unknown>` | `crud.getDefaultValues()` |
| `crud.api` | Call application operations | `list(params)` is required. `get(id)`, `create(data)`, `update(id, data)`, and `remove(id)` are optional. | The application’s asynchronous result. A lookup can return null | `await crud.api.list({ page: 1, pageSize: 20 })` |

#### Scenario: Show order notices and keep new notices unpublished

The operations team publishes order workflow notices. Display the title in the list and leave the Publish box unchecked on the creation form. Pass the existing authorized page query to `createOrderNoticeResource()` so both views share this definition.

```ts
import { type CrudApiDef, kit } from '@h-ai/kit'

type OrderNotice = { id: string, title: string, published: boolean }

export function createOrderNoticeResource(list: CrudApiDef<OrderNotice>['list']) {
  // Connect the application’s authorized paginated query.
  const crud = kit.crud.define<OrderNotice>({
    name: 'order-notices',
    label: () => 'Order notices',
    api: { list },
    fields: [
      { id: 'title', label: () => 'Title', type: 'string', inList: true, inCreate: true },
      { id: 'published', label: 'Published', type: 'boolean', inList: false, inCreate: true, defaultValue: false },
    ],
  })
  // The list column is Title and a new form starts with published: false.
  const title = kit.crud.resolveText(crud.resource.fields[0]!.label)
  const choices = kit.crud.resolveOptions(() => [{ label: 'Published', value: true }])
  const columns = crud.toTableColumns()
  const defaults = crud.getDefaultValues()
  return { crud, title, choices, columns, defaults }
}
```

Pass the existing authorized pagination query to this loader. Use `rows`, `total` and `columns` in the order notices table and `defaults` in the create form. If the query rejects, the page displays a loading error.

```ts
export async function loadOrderNotices(list: CrudApiDef<OrderNotice>['list']) {
  const { crud, columns, defaults } = createOrderNoticeResource(list)
  // Read the first 20 authorized notices and return the rows and total.
  const { items: rows, total } = await crud.api.list({ page: 1, pageSize: 20 })
  return { rows, total, columns, defaults }
}
```

<a id="transport"></a>

### `kit.crypto.transportEncryptionMiddleware()` / `kit.createHandle({ transport })`

Use `kit.createHandle({ transport })` for server-side encryption and [`kit.client.installBrowserTransport()`](#browser-client) in the browser. Call the encryption middleware factory directly when composing a custom Kit chain. [Public transport settings](#transport-from-config)

When CORS covers the path, the hook checks request access before responding to a browser preflight. Other `OPTIONS` requests follow the access, rate-limit, and encryption rules that apply to their route. [Transport configuration](../configuration/kit.en.md#transport)

For a deployment under a subdirectory such as `/console`, derive the same `basePath` from the SvelteKit build mount on the server and in the browser. Use full request paths for custom exchange paths and exclusions. [Verify API requests and key exchange under a subdirectory](../getting-started/kit.en.md#orders-console-transport)

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.crypto.transportEncryptionMiddleware(config, encryption?)` | Create transport authentication middleware | Required runtime `config`. Optional `encryption(pathname, method)` supplies per-method path policy. See [transport arguments](#kit-transport-arguments). | `Middleware` | `kit.crypto.transportEncryptionMiddleware(transportConfig)` |

<a id="kit-transport-arguments"></a>

#### Public transport configuration and middleware arguments

| Field | Default and conditions | Purpose or concrete result |
| --- | --- | --- |
| `input` | Omit or pass `false` to disable it | `kit.resolveTransportConfig` parses public settings. An object receives the default exchange path and exclusions. The runtime applies the size and time defaults. |
| `enabled` / `crypto` / `serverKeyRing` / `keyStore` | Required when constructing middleware directly | Pass the enable flag, initialized Crypto, server key ring, and registration store from the host. Share the store in production. |
| `keyExchangePath` / `excludePaths` / `basePath` | Defaults to `/api/v1/_hai/key-exchange`, `[]`, and the empty string | Sets the exchange route, excluded request paths, and build mount path. Supply `basePath` only at runtime. |
| `contractApiPrefix` | Optional | Supply the mounted contract’s full site prefix when creating the middleware directly. `kit.createHandle({ contract, transport })` reads it from `contract.apiPrefix`. |
| `maxPlaintextBytes` / `routePlaintextBytes` | Defaults to 1 MiB with no route overrides. Limits are integers from 1 KiB to 64 MiB. | Limits plaintext UTF-8 bytes. `*` in a route override matches one complete segment. The public config accepts `"auto"` and the middleware takes a number. |
| `maxFutureSkewSeconds` / `maxRequestAgeSeconds` | Defaults to 30 seconds (0–1800) and 300 seconds (1–3600) | Controls the permitted clock lead and the request lifetime from issuance, in seconds. |

<a id="transport-example"></a>

#### Scenario: Encrypt a JSON status request

[Step 5](../getting-started/kit.en.md#orders-console-transport) adds encryption to the existing hook while keeping the authentication and access options. It includes the server setup, browser installer, readiness button, and URLs to verify.

The figure starts with an encrypted business request that has reached the transport layer. The default IP quota is enforced at entry. When the readiness button sends an encrypted GET, the hook decrypts it, the route returns its status, and the transport encrypts that response.

![Kit decrypts a business request, skips the handler on access or session denial, and processes the response through transport before adding tracing headers](../images/function-kit-request.en.svg)

<a id="kit-custom-contract-transport"></a>

#### Scenario: Encrypt the reporting API under a subdirectory

The orders console runs under `/console` and uses the shared contract’s `GET /orders/status` to show auditors the order status. Keep the transport and layout setup from Step 5. Add the contract to the existing hook alongside authentication and access rules. Here the local module exports `contract` and `procedures` from the [shared contract example](#kit-contract).

```ts
// src/hooks.server.ts
import { serv } from '@h-ai/serv'
import { contract, procedures } from './lib/server/orders-contract.js'

const reports = serv.createContractHandler({
  contract,
  procedures,
  http: { apiPrefix: `${base}/reports` as `/${string}` },
})
```

Add `contract: reports` to the existing `kit.createHandle()` options in the same file. Replace the installer call in the root layout’s browser branch. For a standalone Kit client, pass the full contract prefix as `transport.contractApiPrefix`.

```ts
// src/routes/+layout.svelte
const base = resolve('/').replace(/\/$/, '')
kit.client.installBrowserTransport(untrack(() => data.kitConfig), {
  crypto,
  basePath: base,
  contractApiPrefix: `${base}/reports` as `/${string}`,
})
```

After sign-in, use the browser’s Network panel to confirm a successful key exchange, `X-Encrypted: true` on the `GET /console/reports/orders/status` request and response, and `data.ready: true` in the decoded result. Include `/console` in the full contract prefix.

If the same site also offers A2A, use a dedicated A2A client to request the Agent Card with GET and invoke RPC with POST. To make an A2A call from a page using Kit’s global transport, use the native Fetch saved before installing the wrapper. These two method and path pairs carry the original protocol over HTTPS and still follow host access rules and trusted-IP rate limits.

<a id="kit-transport-middleware-example"></a>

#### Scenario: Measure encrypted request duration in a portal with existing monitoring

The portal already has a `metrics` middleware that measures total request time. Combine the initialized Crypto, key ring, key store, and route settings from the preceding example into `TransportEncryptionConfig` with `enabled: true`. Put the timer outside the encryption layer to include exchange, decryption, and endpoint processing.

```ts
import { type Middleware, type TransportEncryptionConfig, kit } from '@h-ai/kit'

export function createMeasuredPortalHandle(metrics: Middleware, config: TransportEncryptionConfig) {
  // Create the encryption layer inside the timed work. Invalid key ring or store settings stop hook setup.
  const encrypt = kit.crypto.transportEncryptionMiddleware(config)
  // Wrap the encryption layer in the timer. When installing it through middleware, omit createHandle’s transport option.
  return kit.createHandle({ middleware: [metrics, encrypt] })
}
```

Reuse the browser installer and readiness button from [step 5](../getting-started/kit.en.md#orders-console-transport) to verify timing. The successful response contains `data.status: "ready"`.

<a id="kit-resolve-transport-config"></a>

### `kit.resolveTransportConfig()`

If you already have a transport settings object, `kit.resolveTransportConfig()` fills in defaults. Read the complete `_kit.yml` with `KitConfigSchema`, then select the public values for the browser.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.resolveTransportConfig(input?)` | Resolve Kit transport arguments | `input` is `false` or deployment transport settings. See [transport arguments](#kit-transport-arguments). | `false \| KitTransportConfig` | `kit.resolveTransportConfig(false)` |

<a id="kit-transport-resolver-example"></a>

#### Scenario: Serve a public menu over standard HTTPS

A portal builds its public transport settings in code. It keeps `GET /api/public/menu` accessible to clients that use standard HTTPS. Use these options in the server’s transport setup and pass the same public fields to the browser installer.

```ts
import { kit } from '@h-ai/kit'

// Fill the default key exchange path and keep the menu exclusion. Invalid settings throw ZodError and should stop startup.
export const transport = kit.resolveTransportConfig({ excludePaths: ['/api/public/menu'] })
```

The resolved `keyExchangePath` is `/api/v1/_hai/key-exchange`. The menu returns ordinary JSON and other protected APIs still negotiate and encrypt traffic. If the app reads a whole YAML file, use the schema example below.

<a id="transport-from-config"></a>

#### Scenario: Give the browser the key exchange path

Use `orders-http.ts` from [step 4](../getting-started/kit.en.md#orders-console-access) to validate the config. [Step 5](../getting-started/kit.en.md#orders-console-transport) adds `transport` and returns only the public settings from the layout. Complete paths include the mount prefix, and the host supplies `basePath`.

<a id="protocol-integrations"></a>

### `kit.createFeedbackHandler()`

Mount the initialized Feedback service and verified server session on a SvelteKit route. Install `@h-ai/feedback` and [initialize Feedback](feedback.en.md#quick-start) before mounting the handler.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `kit.createFeedbackHandler(options)` | Mount scoped feedback routes | Required initialized `options.feedback` service and `options.resolveContext(event)` to derive feedback identity from a trusted session. `null` denies access. `options.basePath` defaults to `/api/feedback`. Include the mount prefix when deploying under a subdirectory. | `catch-all RequestHandler` | `kit.createFeedbackHandler({ feedback, resolveContext })` |

If application-layer encryption is enabled, derive feedback write budgets from the effective `limits.maxTotalFileBytes` setting and merge them into `routePlaintextBytes`. Attachment reads use 16 MiB. [Feedback transport budgets](api-contract.en.md#feedback-budget)

#### Scenario: Report missing rows in an order export

A signed-in user reports that an order export omitted selected rows. Mount the feedback handler below and grant the user `feedback:create`. Generate a UUID once for the report’s `id` when submitting and keep the form values while awaiting the response. The browser function takes the actual `feedbackPath` for the deployment, such as `/api/feedback` at the root.

```ts
import { apiContract } from '@h-ai/api-contract'
import { FeedbackReportSchema } from '@h-ai/api-contract/feedback'
import { kit } from '@h-ai/kit/client'

export async function submitExportFeedback(feedbackPath: string, id: string, signal?: AbortSignal) {
  const client = kit.client.create()
  try {
    // Submit the prepared report ID and description using the same-origin cookies, CSRF and installed transport.
    const response = await client.apiFetch(feedbackPath + '/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, body: 'The export omitted my selected rows.' }),
      signal,
    })
    // Read the feedback response. Success supplies the saved ID, and a business failure supplies the error.
    return apiContract.haiResultSchema(FeedbackReportSchema).parse(await response.json())
  }
  finally {
    client.destroy()
  }
}
```

On success, `data.id` identifies the saved report and `data.status` is `pending`. Preserve the form and read `error` on failure. Missing authentication or permission is rejected. Transport failures or malformed responses reject the promise.

#### Scenario: Accept feedback for the signed-in user and find the related logs

Initialize Feedback before serving requests. Export this handler from `src/routes/api/feedback/[...path]/+server.ts`. The host supplies authentication, CSRF checks and transport. Choose a server-owned scope that matches the product sending feedback.

```ts
import { resolve } from '$app/paths'
import { feedback } from '@h-ai/feedback'
import { type SessionData, kit } from '@h-ai/kit'

const handler = kit.createFeedbackHandler({
  basePath: `${resolve('/').replace(/\/$/, '')}/api/feedback`,
  feedback,
  resolveContext: (event) => {
    const session: SessionData | undefined = (event.locals as { session?: SessionData }).session
    return session
      ? { scopeId: 'orders-console', userId: session.userId, permissions: session.permissions }
      : null
  },
})
export const GET = handler
export const POST = handler
export const PATCH = handler
```

When the app is deployed under `/portal`, `basePath` becomes `/portal/api/feedback`. Without a trusted session, the handler returns 401. A scoped submission uses the session’s user ID and permissions. To correlate business logs, establish the same server-owned scope in the requesting handler and use the response’s request ID.

<a id="kit-contract"></a>

### `kit.createHandle({ contract })` · Serve the orders console API

The console keeps its SvelteKit pages while sharing the status contract with the standalone service. Define the contract and its implementation on the server, then mount the declared routes in `src/hooks.server.ts`. This example uses `/api/v1`. For a deployment under `/console`, include that directory in every mounted path.

```ts
import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { type ServContext, serv } from '@h-ai/serv'
import { z } from 'zod'

const status = apiContract.route({ method: 'GET', path: '/orders/status' })
  .output(apiContract.haiResultSchema(z.object({ ready: z.boolean() })))
const contract = apiContract.create({ status })
const procedures = serv.implement(contract).context<ServContext>()
  .route('status', () => core.ok({ ready: true }))
  .build()

export const handle = kit.createHandle({
  contract: serv.createContractHandler({
    contract,
    procedures,
    http: { apiPrefix: '/api/v1', openapi: { path: '/openapi.json' } },
  }),
})
```

Call `GET /api/v1/orders/status` and check for `data.ready: true`. Visit `/openapi.json` for the generated description of the same status endpoint. SvelteKit still renders the existing orders page.

The contract handler also dispatches explicit HEAD operations, returning their status and headers with an empty body. For cross-origin attachments, configure SvelteKit’s form Origin check as well. [Cross-origin multipart settings](../configuration/kit.en.md#cors-multipart)

<a id="kit-a2a"></a>

### `kit.createHandle({ a2a })` · Publish the orders assistant for a partner

The partner reads the Agent Card, then uses an API key to request a backlog summary. Initialize AI and IAM, register the orders executor, and issue the partner a key. Publish the URL and authentication scheme in `_ai.yml`.

```yaml
a2a:
  agentCard:
    name: Orders Assistant
    url: https://orders.example.com/a2a
  security:
    apiKey:
      in: header
      name: X-Agent-Key
```

Add the shared handler to the existing `src/hooks.server.ts`. Discovery is public. The RPC verifies `X-Agent-Key`, and the executor checks access to the requested orders.

```ts
import { ai } from '@h-ai/ai'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const handle = kit.createHandle({
  a2a: ai.a2a.createHttpHandler({
    authenticate: { verifyApiKey: key => iam.apiKey.verifyApiKey(key) },
  }),
})
```

Run these commands from the partner terminal. Replace the example origin with the deployed HTTPS origin and supply `ORDERS_AGENT_KEY` through the environment.

```sh
orders_origin=https://orders.example.com
curl -i "$orders_origin/.well-known/agent-card.json"
curl -i "$orders_origin/a2a" \
  -H "X-Agent-Key: ${ORDERS_AGENT_KEY:?}" \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":"order-summary-1","method":"SendMessage","params":{"message":{"messageId":"order-summary-1","role":"ROLE_USER","parts":[{"text":"Summarize today’s order backlog."}]}}}'
```

Discovery returns the public Agent Card. Read the JSON-RPC `result` on success. Missing credentials give HTTP `401`. A streaming call returns SSE. Closing the subscription and canceling a task are separate actions. Include the mount directory in `cardPath`, `rpcPath`, and the advertised RPC URL when deploying under a subdirectory.

## Error responses and diagnostics

Wrap route endpoints with `kit.handler`. A thrown `Response` from validation or a guard is returned to the caller. SvelteKit redirects and HTTP errors retain framework control flow. An unexpected error becomes a safe HTTP 500. Use SvelteKit’s page error handling in a page `load`.

The response carries a stable error code and a localized message. The same correlation value appears in `error.traceId` and `X-Trace-Id`. `kit.response.validationError` exposes field names and messages through `error.cause`. Valid 4xx responses can expose safe business messages. An unknown status or a server failure gets a generic public message. Structured diagnostics preserve server-side context without request bodies, query values, or credentials.

When Audit is initialized, the hook records route templates, status and outcomes, including guard denials. Successful reads are omitted by default. Set `capture.includeReads` to collect them or `capture.enabled` to disable automatic capture. Application-owned business audit events use their own outcome boundary.
