# @h-ai/serv API Reference

[中文](serv.md) · [日本語](serv.ja.md) · [Module README](../../../packages/serv/README.en.md) · [Configuration](../configuration/serv.en.md) · [Data structures](../data/serv.en.md)

Serv combines shared HTTP contracts and handlers into a Node application. The host can mount session guards, CORS, transport encryption, and predefined routes for IAM, Storage, AI, Feedback, Audit, and Payment.

<a id="module-dependencies"></a>

## Dependencies

| Dependency | Purpose | When required | Setup order |
| --- | --- | --- | --- |
| Node.js | Runs Serv, listens for HTTP, and upgrades WebSocket connections | The root entry and Fetch adapter both need a Node version supported by the package manifest | Create the app before listening or handing it to a Node-compatible host |
| `@h-ai/api-contract` / `zod` | Declare shared routes and input/output schemas | Installed with Serv. Declare them in the app if it imports them directly | Define HTTP paths and shapes before binding handlers |
| `@h-ai/core` | Request context, logging, configuration, and `HaiResult` | Installed with Serv. Declare it in the app if it imports it directly | Initialize Core first when the host loads configuration or configures logging |
| `@h-ai/audit` | Records request and business audit events and supplies optional audit routes | Installed with Serv. Initialize it for audit capture or audit routes | Initialize RelDB and any other required services before Audit |
| `@h-ai/crypto` / `@h-ai/cache` | Supply the key ring, client key registry, and replay records for encrypted HTTP | Crypto ships as a dependency. Add Cache for encrypted transport and use shared Redis in production | Initialize Crypto and Cache, then inject the key ring and key store |
| `@h-ai/iam` / `@h-ai/storage` / `@h-ai/ai` / `@h-ai/feedback` / `@h-ai/payment` | Supply the selected domain services and routes. IAM verifies sessions and AI provides audio | Optional peers to install for the features in use | Initialize the selected modules and their dependencies before injection. Stop the listener before releasing those services in reverse order |

Install `@h-ai/api-client` when consuming a streaming route with the typed client.

## Quick start

Start with a status endpoint and verify HTTP 200 with `data.status: "ready"`. Then add order previews, authorization, rate limiting, transport encryption and speech. [Order console tutorial](../getting-started/serv.en.md#quick-start)

<a id="api-reference"></a>

## API reference by task

Use the interface tables to look up options, defaults, return values, and errors. Examples use operations from the Orders Console.

<a id="host-capabilities"></a>

### HTTP capabilities shared by Serv and Kit

| Capability | How the two hosts expose it |
| --- | --- |
| Partner A2A | Pass the same handler from `ai.a2a.createHttpHandler()` to either host. Disabled by default. |
| Access, rate limits, and CORS | Both hosts use `http.access`, `http.trustedProxies`, `http.rateLimit`, and `cors`. |
| Authentication and transport | Both use `auth.iam` or `auth.verifyToken` for a trusted session, and `transport` for key exchange and encryption. |
| Contract API and OpenAPI | Serv includes contract routing. Kit mounts `serv.createContractHandler()` through `contract` and continues to resolve existing SvelteKit routes. |
| Single-request and real-time audio | Mount single-request operations with the shared contract. Forward real-time WebSocket requests to `serv.listen()` through the gateway. |

[Kit contract and A2A examples](kit.en.md#kit-contract)

<a id="http-app"></a>

### `serv.createApp` · Create an HTTP app and handle requests

Combine the HTTP contract and handlers into a Fetch application. Add identity, access policies, encrypted transport, files, or real-time audio as the deployment requires.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.createApp(options)` | Assemble an HTTP application | Requires `options.contract` and `procedures`. See [factory fields](#host-options). | `ServHttpApp`. Throws synchronously for invalid settings or missing wiring dependencies. | `serv.createApp({ contract, procedures })` |
| `app.request(input, init?)` | Dispatch an in-process request for testing | `RequestInfo` or `URL`, including a relative path, plus optional `RequestInit`. | `Response` or a promise of one. HTTP status and body report failures. | `await app.request("/health")` |
| `app.fetch(request, metadata?)` | Pass the host’s request and connection metadata to the app | A standard `Request`. The host obtains optional `metadata.remoteAddress` from the connection for IP-based access checks and rate limiting. | `Response` or a promise of one. | `await app.fetch(request, { remoteAddress })` |

<a id="host-options"></a>

##### Application factory fields

| Field | Type, default and conditions | Effect | Where to apply it |
| --- | --- | --- | --- |
| `contract` / `procedures` | Required contract tree and matching router | Declare business paths and types, then mount the corresponding implementations. | [Status and preview](../getting-started/serv.en.md#orders-console-validation) |
| `http` | Optional. Defaults to `/api/v1`, probes at `/health` and `/ready`, OpenAPI and docs disabled | Set paths, trusted proxies, and access rules. See [settings](../configuration/serv.en.md). | [Deployment, probes, and quota](../getting-started/serv.en.md#orders-console-access) |
| `middlewares` | Optional `{ middleware, path? }[]`, empty by default. Omit `path` to match every request | Ordinary middleware runs after decryption and access checks, before routing. Early responses still pass through encryption. Built-in CORS adds headers in the outer layer. | [Gateway and separate frontend](../getting-started/serv.en.md#orders-console-access) |
| `auth.iam` / `auth.verifyToken` / `createContext` | Optional. Verifiers return `HaiResult`. | Select `createContext`, the custom verifier, or IAM in that order. IAM can also refresh the browser cookie. | [Connect IAM](../getting-started/serv.en.md#orders-console-auth) |
| `cors` | Optional and off by default | Browser origins and credentials. | [CORS settings](../configuration/serv.en.md#cors) |
| `a2a` | Optional and off by default | Mount discovery and JSON-RPC. | [Orders assistant](#shared-a2a-http) |
| `refreshCookie` | Optional `RefreshCookieConfig`, off by default | Handle refresh via an HttpOnly cookie, with an optional trusted native channel. See [refresh fields](#refresh-cookie). | [Renew the account session](../getting-started/serv.en.md#orders-console-iam) |
| `transport` | Optional `ServTransportConfig`, off by default | Inject Crypto, a managed key ring, and shared key store. See [encrypted transport](#transport-example). | [Encrypt API traffic](../getting-started/serv.en.md#orders-console-transport) |
| `transportRoutes` | Optional `ServTransportRoute[]`, with no file or SSE mounts by default | Opt individual authenticated endpoints into multipart, files, or SSE. See [transport routes](#http-contract-extensions). | [Report attachment](../getting-started/serv.en.md#orders-console-files) |
| `audio` | Optional `ServAudioConfig`, no audio endpoint by default | Configure real-time audio over WebSocket and single-use ticket verification. See [audio fields](#audio-options). | [Connect to real-time audio](#audio-ticket-example) |

Supply an atomic store under `http.rateLimit` to count requests that pass access checks by their trusted client IP. See the [rate-limit and reset scenario](#rate-limit-example).

<a id="serv-contract-handler"></a>

### `serv.createContractHandler()` · Mount the orders API in Kit

Build a contract handler for a host to mount. The SvelteKit hook keeps resolving existing pages and file routes. It shares the API contract, guards, validation, SSE, and file limits with standalone Serv.

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.createContractHandler(options)` | Create a mountable contract handler | Requires `contract` and `procedures`. Optional `http.apiPrefix` defaults to `/api/v1`. `http.openapi`, `http.docs`, and `transportRoutes` are optional. | `HttpContractHandler`. Unmatched requests continue through the host. | `serv.createContractHandler({ contract, procedures })` |

The orders console example serves the status endpoint and its OpenAPI description while retaining the existing pages. [Serve the same API in Kit](kit.en.md#kit-contract)

<a id="shared-a2a-http"></a>

#### Scenario: Let a partner call the orders assistant on a standalone service

The same orders assistant can run in standalone Serv. Initialize AI and IAM and use the same Agent Card and executor as in the Kit example. Add `a2a` to the existing app options, then use the same terminal commands to discover and call it. [Kit contract and A2A examples](kit.en.md#kit-a2a)

```ts
import { ai } from '@h-ai/ai'
import { apiContract } from '@h-ai/api-contract'
import { iam } from '@h-ai/iam'
import { type ServContext, serv } from '@h-ai/serv'

const contract = apiContract.create({})
const procedures = serv.implement(contract).context<ServContext>().build()
export const app = serv.createApp({
  contract,
  procedures,
  a2a: ai.a2a.createHttpHandler({
    authenticate: { verifyApiKey: key => iam.apiKey.verifyApiKey(key) },
  }),
})
```

<a id="refresh-cookie"></a>

##### Refresh cookie fields

| Field | Type, default and conditions | Effect |
| --- | --- | --- |
| `cookieName` / `maxAge` | `string` and `number`; defaults `hai_refresh_token` and 2,592,000 seconds | Set the browser cookie name and lifetime. IAM still checks the credential lifetime. |
| `secure` | Optional boolean, takes precedence over `HAI_SERV_REFRESH_COOKIE_SECURE`; defaults to true in production | The direct production default uses `NODE_ENV` or `HAI_CORE_ENV`. |
| `onRefresh` | Defaults to `iam.session.refresh`; enabling cookie refresh requires one of the two | Receives the old refresh token and returns `Promise<HaiResult<RefreshTokenPair>>`; rotates on success. |
| `nativeTokenTransport.isRequest` | Optional `(request: Request) => boolean`; only browser mode is enabled when omitted | Recognize trusted native requests using explicit origins and client type. Matching native refresh takes its token in a JSON body of up to 16 KiB. |

<a id="audio-options"></a>

##### Audio connection fields

| Field | Type, default and conditions | Effect |
| --- | --- | --- |
| `ai` / `verifyTicket` | Required initialized AI audio operations and a ticket verifier. | Validate purpose and expiry and consume the ticket atomically. Return a trusted `session` and optional `grant` through `HaiResult<AudioTicketVerification>`. |
| `authorize(session, request, grant?)` | Optional asynchronous callback. | Check operation, model, plan, and concurrency and return approved parameters. Without the callback, Serv checks the ticket operation, uses its bound model or the provider default, and ignores client-specified model, voice, and instruction. |
| `onSessionEnd(session, request)` | Optional synchronous or asynchronous callback. | Runs at most once per successful authorization to release resources, including authorization that finishes after disconnect. |
| `path` | Defaults to `${http.apiPrefix}/ai/audio`. Custom values are complete request paths. | Update the gateway and WebSocket client URL together. |
| `maxMessageBytes` | Defaults to 1 MiB; integer range 1–2,147,483,647 bytes. | Bound a complete message in the WebSocket receiver. Invalid settings throw during app creation. |
| `maxBufferedBytes` / `maxTextBytes` | Defaults to 10 MiB of audio and 1 MiB of text per connection. | Exceeding either cumulative budget ends the session. |
| `maxSessionMs` / `preAuthTimeoutMs` | Defaults to 300,000 / 5,000 milliseconds. | The full session deadline is separate from the deadline to authenticate and process `start`. |
| `maxPendingMessages` / `maxSendBufferBytes` | Defaults to 256 messages / 8 MiB. | Limit pending processing tasks and the send buffer for synthesized audio frames. |

<a id="request-access-example"></a>

#### Scenario: Publish an external report to the partner network

Verify proxy addresses, forwarded client IPs, path matches, and denied requests in the same app. [Step 5](../getting-started/serv.en.md#orders-console-access)

<a id="rate-limit-example"></a>

#### Scenario: Rate-limit one client and check when requests resume

In step 5, verify two successful requests, HTTP 429 on the third, and recovery after the window. Replicas use the same Redis instance, namespace, window, and quota. Missing trusted addresses use an `unknown` key, and counter failures return 503. Health probes and CORS preflight requests use no quota. [Step 5](../getting-started/serv.en.md#orders-console-access)

<a id="refresh-browser-session-example"></a>

#### Scenario: Keep the account page working after its access token expires

The account page already uses IAM and `refreshCookie` from step 4. Call `apiClient.iam.auth.currentUser()` after the access token expires. The client refreshes with the HttpOnly cookie, saves the new access token, and retries the account request. Check `success` to show the profile or return to sign-in if refresh fails. [Step 4](../getting-started/serv.en.md#orders-console-iam)

<a id="transport-example"></a>

#### Scenario: Exchange keys and encrypt a status request

Step 6 verifies a browser handshake and response decryption against the same status contract. Plaintext and invalid authenticated requests follow the existing path policy. [Step 6](../getting-started/serv.en.md#orders-console-transport)

<a id="audio-ticket-example"></a>

#### Scenario: Connect a browser to real-time audio with a single-use ticket

When a browser needs to send microphone audio continuously or receive chunks as a streaming model generates them, use Serv’s WebSocket endpoint with a single-use ticket. Real-time features depend on the model. Complete the [report audio tutorial](../getting-started/serv.en.md#orders-console-audio) first for initialized AI, IAM, and the report permissions. The configured `report-tts` model demonstrates ticket issuance, connection, synthesis, and playback. Continue using the tutorial’s HTTP endpoints for simple report narration and recording transcription.

##### Ticket and WebSocket exchange

The browser requests the ticket over HTTPS JSON and exchanges audio frames over WSS.

| Step | Participants | What happens |
| --- | --- | --- |
| Request | Report page → Serv | Call `POST /api/v1/ai/audio/tickets` with the access token. |
| Issue | Serv → IAM → report page | Check the session’s roles and permissions and return a ticket valid for 30 seconds and bound to the requested operation. |
| Connect | Report page → Serv → IAM | Upgrade `GET /api/v1/ai/audio?ticket=…`, consume the ticket atomically, and check current access. |
| Synthesize | Report page → Serv → speech model | The browser sends the summary. Serv uses the configured model and voice and returns audio chunks and a completion event. |
| Play | Report page → browser player | Hand the complete MP3 to the player after receiving `end`. |

Save the shared contract as `voice-contract.mts`. This step adds one JSON operation. The client uses the same node to request a ticket.

```ts
import { apiContract } from '@h-ai/api-contract'

export const voiceContract = {
  ai: { audio: { issueTicket: apiContract.extensions.ai.audio.issueTicket } },
}
```

Save the following as `voice-server.mts`. IAM checks `reports:read` when issuing a ticket. On upgrade it consumes the ticket atomically and rechecks the current account and permission. The ticket authorizes the requested operation. Synthesis uses `report-tts`, the default synthesis model configured in the tutorial.

```ts
import { ai } from '@h-ai/ai'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'

const voice = serv.createIamAudio({
  ai,
  iam,
  config: { path: '/api/v1/ai/audio' },
  permission: 'reports:read',
})

// Merge these entries into ai.audio alongside HTTP synthesis and transcription.
export const voiceProcedures = { ai: { audio: { issueTicket: voice.issueTicket } } }
export const voiceAudio = voice.config
```

Pass `voiceAudio` to `serv.createApp({ audio: voiceAudio, … })`. Merge `voiceContract.ai.audio` into `contract.ai.audio` and `voiceProcedures.ai.audio` into `procedures.ai.audio`, and keep `transportRoutes`. Continue to start the app with `serv.listen(app, …)`. The public HTTPS gateway forwards `Upgrade` and the browser uses `wss:`. The ticket POST uses the encrypted HTTP client settings from step 6. The WebSocket upgrade uses HTTPS and the single-use ticket. Set the browser URL to the same site-absolute path when changing `audio.path`.

##### Connect and play audio in the browser

Save `report-reader.mts` with your browser source files. It uses the current access token with the shared HTTP contract, then passes the short-lived ticket to the audio client. The access token goes in the HTTP Authorization header. Each call obtains a fresh ticket. Keep tickets and WebSocket URLs containing them out of application logs.

```ts
import { ai } from '@h-ai/ai/client'
import { type ApiClientConfig, apiClient } from '@h-ai/api-client'
import { voiceContract } from './voice-contract.mts'

export async function makeReportAudio(
  summary: string,
  http: Pick<ApiClientConfig, 'baseUrl' | 'headers' | 'transport'>,
  signal?: AbortSignal,
): Promise<Blob> {
  const client = apiClient.create(voiceContract)
  // baseUrl 含 API 前缀，headers 提供当前会话的 Bearer access token。
  const started = await client.init(http)
  if (!started.success)
    throw new Error(started.error.message)

  try {
    const socketUrl = new URL(http.baseUrl, window.location.origin)
    socketUrl.pathname = socketUrl.pathname.replace(/\/$/, '') + '/ai/audio'
    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:'

    const reader = ai.createAudioClient({
      url: socketUrl.href,
      async getTicket(request) {
        // 每次合成先走一次已登录的 HTTP 请求，返回票据才开始建连。
        const issued = await client.ai.audio.issueTicket(request, { signal })
        if (!issued.success)
          throw new Error(issued.error.message)
        return issued.data.ticket
      },
    })

    // The SDK sends start, text and done, then closes after receiving all audio.
    const result = await reader.synthesize({ text: summary, signal })
    if (result.format !== 'mp3')
      throw new Error('Unexpected report audio format')
    return new Blob([new Uint8Array(result.data)], { type: 'audio/mpeg' })
  }
  finally {
    await client.close()
  }
}
```

Put `report-playback.mts` in the same browser directory. It binds the button to speech generation, supplies the audio to the browser player, and returns a cleanup function for page unmount.

```ts
import { type ApiClientConfig } from '@h-ai/api-client'
import { makeReportAudio } from './report-reader.mts'

export function bindReportReader(
  button: HTMLButtonElement,
  player: HTMLAudioElement,
  summary: string,
  http: Pick<ApiClientConfig, 'baseUrl' | 'headers' | 'transport'>,
  onError: (cause: unknown) => void,
) {
  const lifetime = new AbortController()
  let url: string | undefined
  async function generate() {
    button.disabled = true
    try {
      // 生成完毕后为 <audio controls> 设置来源，由用户按播放键。
      const blob = await makeReportAudio(summary, http, lifetime.signal)
      if (lifetime.signal.aborted)
        return
      if (url)
        URL.revokeObjectURL(url)
      url = URL.createObjectURL(blob)
      player.src = url
    }
    catch (error) {
      if (!lifetime.signal.aborted)
        onError(error)
    }
    finally {
      if (!lifetime.signal.aborted)
        button.disabled = false
    }
  }

  button.addEventListener('click', generate)
  return () => {
    // 页面卸载时终止请求与播放，并回收当前 Blob URL。
    lifetime.abort()
    button.removeEventListener('click', generate)
    player.pause()
    player.removeAttribute('src')
    player.load()
    if (url)
      URL.revokeObjectURL(url)
  }
}
```

Place a `<button type="button">` for generation and an `<audio controls>` element on the report page. Pass the elements, the authorized report summary as `report.summary`, the current session token, and the page’s existing error handler. This example uses a same-origin gateway. For a separate API host, pass its HTTPS base URL including `/api/v1`.

```html
<button type="button" id="generate-report-audio">Generate report audio</button>
<audio controls id="report-audio"></audio>
```

This uses the browser Crypto already initialized in step 6. To verify over ordinary HTTPS, omit `transport` and its imports.

```ts
import { crypto } from '@h-ai/crypto'
import { bindReportReader } from './report-playback.mts'
import { keyExchangePath } from './status-client.mts'

const readReportButton = document.querySelector<HTMLButtonElement>('#generate-report-audio')
const reportAudioElement = document.querySelector<HTMLAudioElement>('#report-audio')
if (!readReportButton || !reportAudioElement)
  throw new Error('Report audio controls are missing')

const dispose = bindReportReader(
  readReportButton,
  reportAudioElement,
  report.summary,
  {
    baseUrl: '/api/v1',
    headers: { Authorization: 'Bearer ' + accessToken },
    transport: { crypto, keyExchangePath },
  },
  showReportAudioError,
)
```

Call `dispose()` when the page unmounts. Click the button and wait for the player to load before pressing Play. In Network, expect a successful `POST /api/v1/ai/audio/tickets`, then a GET Upgrade (101) and WebSocket audio frames. A ticket request failure stops before connecting. Expired, consumed, or unauthorized tickets yield a WebSocket `error` and disconnect without returning partial audio as a success. After signing in, remove the report permission and try to connect with the previously issued ticket. Serv denies access before calling the speech model.

<a id="listen-api"></a>

### `serv.listen` · Accept HTTP requests on Node

Bind the app to a Node address and port. The listener reads the peer address from the socket for IP access rules and rate limiting. It also handles WebSocket upgrades for an audio endpoint.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ServConfigSchema` | Validate `_serv.yml` loaded by the app | Input `ServConfigInput` with optional `server`, `http`, `cors`, and `transport` | `safeParse` returns a parsed `ServConfig` or a Zod validation error. | `ServConfigSchema.safeParse({ server: { port: 3001 } })` |
| `serv.listen(app, options?)` | Open a Node listener | Requires `app: ServHttpApp`; optional [listener settings](#listen-options). | `ServNodeServer` with `server` and `address`. Asynchronous bind failures emit a Node `error` event. | `const handle = serv.listen(app, { port: 0 })` |
| `handle.close()` | Stop listening and close stream connections | No args. Concurrent calls reuse the same result. | `Promise<void>`. Rejects on listener failure or audio cleanup timeout. | `await handle.close()` |

<a id="listen-options"></a>

##### Node listener fields

| Field | Type, default and conditions | Effect |
| --- | --- | --- |
| `host` | `string`, defaults to `127.0.0.1` | Choose the interface or `0.0.0.0` explicitly for external listening. |
| `port` | `number`, defaults to `3000` | A direct call accepts `0`. `handle.address` reports the bound host and port after listening, and the requested address before that. |
| `onListening` | Optional `(info: AddressInfo) => void` | Runs after Node binds the listener. |
| `onClose` | Optional `() => Promise<void>`. Omitting it leaves signal handling to the host | On `SIGINT` or `SIGTERM`, Serv stops accepting requests and gives SSE and WebSocket connections one second to close. It waits up to five seconds after audio sockets close for authorization and release, and lets ordinary in-flight HTTP complete before invoking this callback. The caller releases business resources after direct close. |

#### Scenario: Send real HTTP requests on a free port in integration tests

Pass the `app` from [Quick Start](../getting-started/serv.en.md#quick-start) to the listener. When tests run concurrently, let Node choose a free port with `port: 0`. This example checks the local status route over HTTP. In deployment, pass the parsed `server` object from [`config/_serv.yml`](../configuration/serv.en.md) explicitly. Schema parsing applies `HOST` and `PORT` overrides.

```ts
import { once } from 'node:events'
import { ServConfigSchema, type ServHttpApp, serv } from '@h-ai/serv'

export async function checkListener(app: ServHttpApp, rawConfig: unknown) {
  // Validate the host’s raw settings. A failed parse returns field errors and stops this startup.
  const parsed = ServConfigSchema.safeParse(rawConfig)
  if (!parsed.success)
    throw parsed.error

  // Reuse the parsed listener settings and request a free loopback port for this check.
  const handle = serv.listen(app, { ...parsed.data.server, host: '127.0.0.1', port: 0 })
  try {
    // Wait for the actual port selected by Node. A bind error rejects this wait.
    if (!handle.server.listening)
      await once(handle.server, 'listening')
    // Read the status route on the selected port. A non-success status fails this check.
    const status = await fetch('http://' + handle.address.host + ':' + handle.address.port + '/api/v1/status')
    if (!status.ok)
      throw new Error('Unexpected status: ' + status.status)
    return await status.json()
  }
  finally {
    // Release the listener and wait for shutdown, including when the status request fails.
    await handle.close()
  }
}
```

Call `await checkListener(app, {})` to get the same success body as Quick Start. Release any real domain services after closing the handle.

<a id="fetch-api"></a>

### `serv.toFetch` · Provide a standard Fetch function

Pass the function returned by `serv.toFetch(app)` to a caller that expects standard Fetch, such as API Client’s `fetch` option. The function accepts `input` and `init` and calls the app in the same process.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.toFetch(app)` | Inject the app as the client’s standard Fetch function | Requires `app: ServHttpApp`. The returned function takes `RequestInfo` or `URL` and optional `RequestInit`. | `ServFetchHandler`. The dispatch promise can reject on construction errors, cancellation, or downstream exceptions. | `await serv.toFetch(app)("http://localhost/health")` |

<a id="in-process-client-example"></a>

#### Scenario: Test API Client without starting an HTTP server

Add the following to the end of step 1’s `check.mts`. At the top of the file, also import `contract` from `app.mts` to reuse the same console in a test client. Run `pnpm add @h-ai/api-client`.

```ts
import { apiClient } from '@h-ai/api-client'
import { serv } from '@h-ai/serv'

// Create the API Client used by the page. It constructs requests from the status contract.
const client = apiClient.create(contract)
try {
  // Use /api/v1 as the API prefix and direct fetch to the app in the test process.
  const ready = await client.init({
    baseUrl: 'http://service.test/api/v1',
    fetch: serv.toFetch(app),
  })
  if (!ready.success)
    throw new Error(ready.error.message)

  // Call the status route and check that the client reads ready. The request stays in process.
  const status = await client.status()
  assert.equal(status.success, true)
  if (status.success)
    assert.equal(status.data.status, 'ready')
}
finally {
  // Release this client instance even if an assertion fails.
  await client.close()
}
```

Run `node check.mts`. The assertions should pass and the process should exit. `service.test` just supplies a host name for the request URL. `serv.toFetch(app)` returns a standard `fetch(input, init?)` function with `AbortSignal` support. It has no connection peer address to pass along.

If an existing HTTP host already has a `Request` and Serv needs the client IP for access checks or rate limiting, call `app.fetch(request, { remoteAddress })` with the peer address observed by the host. The next example shows how to pass it. With `serv.listen(app)`, Serv’s Node listener reads the peer address from the socket.

<a id="authentication"></a>

### `serv.implement` · Bind route handlers and guards to a contract

Bind an ordinary handler for public status checks. To read a protected report, establish a session with a trusted verifier and then apply role and permission guards. Dotted keys name nodes in the contract, which declares the HTTP path.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.implement(contract)` | Start implementing a shared contract | Requires a typed contract tree. | `ServImplementer` | `const implementation = serv.implement(contract)` |
| `implementation.context<TContext>()` | Set the procedure context type | Specify `ServContext` or a subtype. No runtime arguments. The host supplies extended fields. | `ServRouterBuilder` | `implementation.context<ServContext>()` |
| `builder.route(path, handler?)` | Bind a handler by contract key | `path` is the node key or a dotted key. An ordinary `handler` receives `{ input, context }` and returns the matching `HaiResult`. | Returns the builder with a handler, or a registration that can add guards without one. Invalid or duplicate registration throws. | `builder.route("reports.read")` |
| `route.auth()` | Require a verified session | No arguments. | Returns a guarded registration. Requests without a session yield a domain error with status 401. | `builder.route("reports.read").auth()` |
| `route.permission(permission)` | Require a named permission | Requires a permission string such as `reports:read`. Also requires authentication. | Returns a guarded registration. A signed-in caller lacking permission gets a 403 domain error. | `route.permission("reports:read")` |
| `route.role(role)` | Require a named role | Requires a role name and authentication. Every configured role and permission must pass. | Returns a guarded registration. A signed-in caller lacking the role gets a 403 domain error. | `route.role("auditor")` |
| `route.handle(handler)` | Bind an ordinary JSON handler | Requires a handler matching the node input and `HaiResult` output. Runs after successful guards. | Returns the next builder. Guards and business errors follow [response boundaries](#error-handling). | `route.handle(({ context }) => core.ok(context.session.userId))` |
| `route.handleTransport(handler)` | Bind multipart, File, or SSE operations | Apply an authentication, permission, or role guard first. The handler must match the contract and the host must opt into the route. | Returns the next builder. Transport failures can use the HTTP status. | `route.handleTransport(() => new File(["report"], "report.txt"))` |
| `builder.build()` | Complete the router synchronously | No arguments. Every selected contract node needs a handler. | Returns a router whose branches can be selected. Missing routes are reported by `missingRoutes` in the type system and throw if bypassed. | `const procedures = builder.build()` |
| `serv.WILDCARD_PERMISSION` | Allow trusted sessions to satisfy all permissions | Constant `"*"`; grant it only in a verified session. A `domain:*` permission also matches its domain. | `string` | `const permissions = [serv.WILDCARD_PERMISSION]` |
| `serv.WILDCARD_ROLE` | Allow trusted sessions to satisfy all role checks | Constant `"*"`; grant it only in a verified session. | `string` | `const roles = [serv.WILDCARD_ROLE]` |
| `serv.guard.requireSensitive(iam, context, operation)` | Verify proof for a sensitive operation | Pass initialized IAM, the current request context, and the server-defined operation name. | `Promise<HaiResult<void>>`. Verifies and consumes the proof for configured operations. | `await serv.guard.requireSensitive(iam, context, "orders.cancel")` |

<a id="http-contract-extensions"></a>

##### Transport mount fields

| Field | Type, default and conditions | Effect |
| --- | --- | --- |
| `procedure` | Required. Use the exact endpoint object selected in the app contract. | Requires a defined HTTP method, fixed path, and authentication guard. Unmounted transport operations are denied. |
| `maxRequestBytes` | Required nonnegative safe integer. Use 0 for bodyless GET. | Bounds request bytes before decoding. Allow room for multipart boundaries and metadata. Returns 413 on overflow. |

Grant transport access to File, multipart, or SSE contracts built with the [route builder](#authentication). Publish these endpoints through the host’s HTTPS ingress in production. With framework transport encryption enabled, set `encryption: "disabled"` in `http.access` for the exact method and path of each endpoint.

<a id="authorization-example"></a>

Step 3 adds role and permission guards to the console’s preview and report endpoints. Ordinary JSON routes use HTTP 200 by default and carry the authorization failure in `error.httpStatus`. [Full guard walkthrough](../getting-started/serv.en.md#orders-console-auth)

<a id="serv-sensitive-guard"></a>

#### Scenario: Verify identity again before canceling an order

Require `orders:cancel` on the route and load the order from the database. Pass the stored order and the cancellation function below. If reauthentication is enabled for `orders.cancel`, submit the proof in `X-Hai-Reauthentication`. Missing or reused proof returns a failed `HaiResult` and leaves the order unchanged. [Kit reauthentication example for audit archiving](kit.en.md#kit-sensitive-guard)

```ts
import { core, HaiCommonError, type HaiResult } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { type AuthenticatedServContext, serv } from '@h-ai/serv'

export async function cancelOwnOrder(
  context: AuthenticatedServContext,
  order: { id: string, ownerId: string },
  cancel: (id: string) => Promise<HaiResult<{ cancelled: boolean }>>,
) {
  if (order.ownerId !== context.session.userId)
    return core.err(HaiCommonError.FORBIDDEN)

  const proof = await serv.guard.requireSensitive(iam, context, 'orders.cancel')
  if (!proof.success)
    return proof

  return cancel(order.id)
}
```

<a id="wildcard-guards-example"></a>

#### Scenario: Give an on-call auditor temporary access to reports

The identity service verifies the on-call account and can grant cross-team audit access. `serv.WILDCARD_PERMISSION` satisfies permission checks, and `serv.WILDCARD_ROLE` satisfies role checks. Both constants are `"*"`. Their session field determines what they match. The permission `reports:*` covers the `reports:` family. The server owns these grants.

Test the report guard separately with the contract and procedures from step 3. Save the following as `check-guard.mts`. It runs without a listener and leaves the console routes alone.

```ts
import assert from 'node:assert/strict'
import { core, HaiCommonError } from '@h-ai/core'
import { type ServSession, serv } from '@h-ai/serv'
import { reportContract, reportProcedures } from './reports.mts'

// Simulate identity service records. Grant both wildcards to the on-call account and report-only permissions to an ordinary auditor.
const sessions = new Map<string, ServSession>([
  ['permission-only', { userId: '1', permissions: [serv.WILDCARD_PERMISSION], roles: [] }],
  ['on-call-auditor', { userId: '2', permissions: [serv.WILDCARD_PERMISSION], roles: [serv.WILDCARD_ROLE] }],
  ['report-auditor', { userId: '3', permissions: ['reports:*'], roles: ['auditor'] }],
])

// Map each test identity to a server-side session. Reject unknown identities as unauthenticated.
const app = serv.createApp({
  contract: reportContract,
  procedures: reportProcedures,
  async verifyToken(token) {
    const session = sessions.get(token)
    return session ? core.ok(session) : core.err(HaiCommonError.UNAUTHORIZED)
  },
})

// Request the report and read the procedure’s HaiResult. Only a session meeting the role and permission checks receives the report.
for (const [token, expected] of [['permission-only', 403], ['on-call-auditor', 200], ['report-auditor', 200]] as const) {
  const response = await app.request('/api/v1/reports/current', { headers: { Authorization: 'Bearer ' + token } })
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.success ? 200 : result.error.httpStatus, expected)
}
```

The first identity has no role and receives a 403 in the result. The on-call and report-only auditors both pass. In production, the identity service grants privileges and the report handler still enforces tenant and resource access.

<a id="authenticated-file-example"></a>

Step 7 turns a signed-in auditor’s report into a real download while keeping the existing JSON routes. [Protected file walkthrough](../getting-started/serv.en.md#orders-console-files)

<a id="auth-context-api"></a>

### `serv.buildAuthContextFactory` · Build a session from a token verifier

When using an identity provider other than IAM, adapt its token verifier into a per-request context factory. To read request IDs, locales, or IP addresses, use [serv.parseRequestContext](#parse-context-api).

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.buildAuthContextFactory(verifyToken)` | Build a per-request verifier | Requires `(token: string) => Promise<HaiResult<ServSession>>`, called when a bearer token is present. | `CreateServContext`. Missing tokens and verifier 4xx results are anonymous. Its promise rejects on verifier exceptions or dependency failures. | `serv.buildAuthContextFactory(token => iam.auth.verifyToken(token))` |

#### Scenario: Use an existing access-token verifier

Pass the company token verifier to `serv.buildAuthContextFactory`. This local check reuses `reports.mts` and `orders-test-identity.mts` from tutorial step 3. The sample verifier recognizes the fixture identity `local-auditor`. [Files from step 3](../getting-started/serv.en.md#orders-console-auth)

```ts
import assert from 'node:assert/strict'
import { serv } from '@h-ai/serv'
import { verifyToken } from './orders-test-identity.mts'
import { reportContract, reportProcedures } from './reports.mts'

// Mount the existing verifier, then call the same report route with and without a session.
const createContext = serv.buildAuthContextFactory(verifyToken)
const app = serv.createApp({ contract: reportContract, procedures: reportProcedures, createContext })
const allowed = await app.request('/api/v1/reports/current', {
  headers: { Authorization: 'Bearer local-auditor' },
})
assert.equal(allowed.status, 200)
const report = await allowed.json()
assert.equal(report.success, true)
assert.equal(report.data.owner, 'auditor-1')

// The guard rejects anonymous access. An ordinary JSON route returns the 401 in its business error.
const anonymous = await app.request('/api/v1/reports/current')
assert.equal(anonymous.status, 200)
const denied = await anonymous.json()
assert.equal(denied.success, false)
assert.equal(denied.error.httpStatus, 401)
```

See the [report scenario](#authorization-example) for how role and permission guards use the session.

<a id="parse-context-api"></a>

### `serv.parseRequestContext` · Read request metadata before authentication

Read the request ID, client IP, and locale for a diagnostic request before authenticating it. Pass through an `ip` already resolved by `createApp`, or provide the connection peer as `remoteAddress` when the host manages the socket.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.parseRequestContext(input)` | Extract request metadata | Requires `input.request: Request`. Optional trusted `remoteAddress` or resolved `ip`. | `ServContext` with a request ID, locale, and unverified bearer token. No session is created. | `serv.parseRequestContext({ request })` |

#### Scenario: Read the request ID for a diagnostic request

Use the `Request` the host received. This example simulates a trace header and a peer address of `192.0.2.10`.

```ts
import assert from 'node:assert/strict'
import { serv } from '@h-ai/serv'

const request = new Request('https://api.example.com/api/v1/status', {
  headers: { 'x-request-id': 'req-diagnostic-42', 'x-hai-locale': 'ja-JP' },
})
// Read the request ID, connection address, and locale for this request. The context has no session yet.
const context = serv.parseRequestContext({ request, remoteAddress: '192.0.2.10' })
assert.equal(context.requestId, 'req-diagnostic-42')
assert.equal(context.ip, '192.0.2.10')
assert.equal(context.locale, 'ja-JP')
assert.equal(context.session, undefined)
```

After the assertions pass, use `context.requestId` to correlate diagnostic records for this request.

<a id="runtime-security-api"></a>

### `serv.createRuntimeSecurityPolicy` · Validate web and native deployment origins

Validate the web frontend origin and trusted native origins at production startup. Pass `policy.allowOrigin` to [serv.cors](#cors-api). Use `policy.isNativeOrigin` as the origin check when identifying native clients.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.createRuntimeSecurityPolicy(input)` | Validate deployment origins and security defaults | Requires `ServRuntimeSecurityPolicyInput` with optional [environment and origin fields](#runtime-security-options). | `allowOrigin`, `isNativeOrigin`, `secureRefreshCookie`, and `exposeApiDocs`. Throws for invalid settings or missing explicit production origins. | `serv.createRuntimeSecurityPolicy({ environment: "production", corsOrigin: "https://app.example.com" })` |
| `policy.allowOrigin(origin)` | Check a CORS origin | `origin: string` from the browser’s Origin header. | `boolean` | `policy.allowOrigin("https://app.example.com")` |
| `policy.isNativeOrigin(origin)` | Check an explicitly configured native origin | `origin: string`; the host also checks the client type. | `boolean` | `policy.isNativeOrigin("capacitor://localhost")` |

<a id="runtime-security-options"></a>

##### Environment and origin fields

| Field | Type, default and conditions | Effect |
| --- | --- | --- |
| `input.environment` / `corsOrigin` / `nativeOrigins` | Optional strings. Production requires explicit HTTP(S) web origins. | Comma-separated origins; native also accepts `capacitor:` and `tauri:`. Production defaults to Secure cookies and hides docs; apply the policy in your HTTP wiring. |

#### Scenario: Start an API used by a separate web frontend and native app

The frontend runs on `https://app.example.com`, and the Capacitor app uses `capacitor://localhost`. Read both origins from deployment settings and validate them before listening.

```ts
import assert from 'node:assert/strict'
import { serv } from '@h-ai/serv'

// Validate the production web and native origins. Invalid settings throw synchronously.
const policy = serv.createRuntimeSecurityPolicy({
  environment: 'production',
  corsOrigin: 'https://app.example.com',
  nativeOrigins: 'capacitor://localhost',
})
// Check both configured origins and confirm that production uses a Secure refresh cookie.
assert.equal(policy.allowOrigin('https://app.example.com'), true)
assert.equal(policy.isNativeOrigin('capacitor://localhost'), true)
assert.equal(policy.allowOrigin('https://other.example.com'), false)
```

Production defaults to `secureRefreshCookie: true`. Apply the value in [serv.createApp’s refresh cookie options](#refresh-cookie).

<a id="cors-api"></a>

### `serv.cors` · Control browser access across origins

Mount CORS middleware when the browser frontend and API use different schemes, hosts, or ports. Response headers tell the browser whether the page may read the data. The server still applies session, permission, and access rules.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.cors(config?)` | Handle preflights and CORS response headers | Optional `ServCorsConfig`. See [fields](#serv-middleware-options). | `ServMiddleware`. A valid preflight returns HTTP 204; access-policy denial returns 403. Ordinary OPTIONS continues routing. | `serv.cors({ origin: policy.allowOrigin, credentials: true })` |

<a id="serv-middleware-options"></a>

##### CORS fields

| Field | Type, default and conditions | Effect |
| --- | --- | --- |
| `cors.origin` | A string, string list, or predicate. Defaults to `"*"`. | Selects which origins receive `Access-Control-Allow-Origin`. |
| `cors.credentials` | Boolean, defaults to `false`. | Sends `Access-Control-Allow-Credentials: true` for allowed origins. Cookie-based calls need an explicit origin and `credentials: "include"` on the client. |
| `cors.methods` | Method list, defaults to GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS. | Tells the browser which methods preflights allow. |
| `cors.allowedHeaders` | Optional request-header list. | An explicit list controls allowed preflight headers. Otherwise Serv echoes the requested list or uses built-in headers when no list was sent. |
| `cors.exposedHeaders` | Extra response-header names, empty by default. | Lets allowed origins read those headers from JavaScript, for example `Retry-After`. Serv already includes `X-Request-Id` and `X-Trace-Id`. |
| `cors.maxAge` | Defaults to 86,400 seconds. | Tells the browser how long it may cache a preflight result. |

Built-in request headers are `Authorization`, `Content-Type`, `X-Requested-With`, `X-Hai-Reauthentication`, and `X-Hai-Terminal`.

After parsing `_serv.yml` with `ServConfigSchema`, pass its `config.cors` to `serv.cors(config.cors)` and mount the result in `serv.createApp({ middlewares })`. [Configuration example](../configuration/serv.en.md#cors-example)

<a id="cors-account-example"></a>

#### Scenario: Let an independently deployed account page read quota headers and refresh sessions

An account page on `https://app.example.com` calls Serv on `https://api.example.com`. The two origins are same-site. API Client reads the profile and the page can show how long to wait when the request quota runs out. Configure IAM and refresh cookies as in [automatic session renewal](#refresh-browser-session-example) and set the client’s `baseUrl` to `https://api.example.com/api/v1`. Add this middleware on the server.

```ts
import { serv } from '@h-ai/serv'

// Permit the account page origin. Allow credentialed responses and expose the quota headers to browser JavaScript.
export const accountCors = serv.cors({
  origin: 'https://app.example.com',
  credentials: true,
  exposedHeaders: ['Retry-After', 'X-RateLimit-Remaining'],
})
```

Add `{ middleware: accountCors }` to the account service’s `middlewares`.

`credentials: true` sends `Access-Control-Allow-Credentials: true`. In cookie mode the client sends `credentials: "include"`. The browser uses Domain, Path, Secure, and SameSite to decide if a cookie applies. Specify an explicit origin for credentialed requests. An app-supplied Bearer `Authorization` header is governed by `allowedHeaders` during preflight.

`exposedHeaders` supplies `Access-Control-Expose-Headers`. With [rate limiting](#rate-limit-example) enabled, browser diagnostics can use `response.headers.get("Retry-After")` to read wait seconds on a 429 or `X-RateLimit-Remaining` for the remaining quota. The rate limiter generates these headers. CORS controls which ones JavaScript may read across origins. `X-Request-Id` and `X-Trace-Id` are exposed by default. Browsers restrict script access to `Set-Cookie`. An origin that lacks permission cannot read the response in the browser.

Run this check in the browser diagnostics page. The signed-in account page provides accessToken.

```ts
export async function inspectAccountLimit(accessToken: string) {
  // Request the account endpoint with the current token. Read the quota and, on HTTP 429, the wait in seconds.
  const response = await fetch('https://api.example.com/api/v1/auth/me', {
    credentials: 'include',
    headers: { Authorization: 'Bearer ' + accessToken },
  })
  return {
    status: response.status,
    remaining: response.headers.get('X-RateLimit-Remaining'),
    retryAfter: response.headers.get('Retry-After'),
  }
}
```

<a id="storage-assets-api"></a>

### `serv.storageAssets` · Serve public files from object storage

Publish explicitly public objects at a fixed path, such as a storefront’s promotion images. The middleware checks object keys and MIME types. Use an [authenticated file route](#http-contract-extensions) for private files.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.storageAssets(config)` | Serve public read-only assets | Requires `ServStorageAssetsConfig`. Choose the mount path separately in `middlewares`. | `ServMiddleware`. Accepts GET/HEAD, returns 304 for matching ETags, and 404 for invalid keys or MIME, oversized objects, and read failures. | `serv.storageAssets(assetOptions)` |

<a id="storage-assets-options"></a>

##### Public file fields

| Field | Type, default and conditions | Effect |
| --- | --- | --- |
| `asset.storage` / `pathPrefix` | Requires Storage or an adapter providing `file.head` and `file.getStreamWithMetadata`, plus an absolute path prefix. | Strip the prefix from the URL to get a key. HEAD reads metadata; GET uses one read for headers and body. |
| `asset.keyPattern` / `allowedContentTypes` | Requires a `RegExp` for complete keys and a MIME allowlist. | Serve matching objects only, with a 5 MiB read limit. |
| `asset.cacheControl` / `crossOriginResourcePolicy` | Defaults to `no-store` with no additional resource policy. | Resource policy may be `same-origin`, `same-site`, or `cross-origin`. |

#### Scenario: Draw the public report cover on a canvas

The orders console’s partner page at `https://app.example.com` needs to read a report cover from a separate API domain and inspect its pixels on a canvas. Initialize Storage, place the public object `public/report-cover.webp` with MIME type `image/webp`. Update `middlewares` in step 5’s `app.mts`. If transport encryption is enabled, add `/assets/public/report-cover.webp` to `transport.excludePaths`.

```ts
import { storage } from '@h-ai/storage'

middlewares: [
  // Let the orders console’s partner page read the image and ETag. This public image request needs no credentials.
  { middleware: serv.cors({ ...settings.cors, allowedHeaders: [...settings.cors.allowedHeaders, 'If-None-Match'], exposedHeaders: [...settings.cors.exposedHeaders, 'ETag'] }) },
  {
    path: '/assets/*',
    // Serve allowed WebP objects. Missing or disallowed objects return 404.
    middleware: serv.storageAssets({
      storage,
      pathPrefix: '/assets/',
      keyPattern: /^public\/report-cover\.webp$/,
      allowedContentTypes: ['image/webp'],
      cacheControl: 'public, max-age=3600',
      crossOriginResourcePolicy: 'cross-origin',
    }),
  },
],
```

Run the following code on the orders console’s partner page.

```ts
// Fetch the image without credentials from the orders console’s partner page. Stop the preview if the file is unavailable.
const image = await fetch('https://api.example.com/assets/public/report-cover.webp', { credentials: 'omit' })
if (!image.ok)
  throw new Error('Report cover request failed: ' + image.status)
const etag = image.headers.get('ETag')

// Draw the bitmap on the canvas and read the pixel in the top-left corner.
const bitmap = await createImageBitmap(await image.blob())
const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
const drawing = canvas.getContext('2d')
if (!drawing)
  throw new Error('2D canvas unavailable')
drawing.drawImage(bitmap, 0, 0)
const firstPixel = drawing.getImageData(0, 0, 1, 1).data
bitmap.close()
```

The page can read the first pixel, and `etag` contains the server’s value. `Access-Control-Allow-Origin` lets the orders console’s partner page read the cross-origin response. `Cross-Origin-Resource-Policy: cross-origin` permits cross-origin embedding. This example exposes `ETag` so JavaScript can read it. Sending that value as `If-None-Match` yields 304, allowing reuse of the cached image. `HEAD` returns metadata only.

<a id="validation-locales"></a>

### `serv.validateInputOrFail` · Validate input inside a route handler

After basic contract validation, check product-specific rules and return field errors from the handler. For example, an order preview needs a title whose trimmed value is nonempty.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.validateInputOrFail(schema, input, locale?)` | Validate data inside a handler | Requires a Zod `schema` and `input` value. `locale: string` defaults to `zh-CN`. | `HaiResult<TOutput>`. Success contains parsed data; failure includes localized fields in `error.cause`. | `serv.validateInputOrFail(schema, input, context.locale)` |

<a id="validation-example"></a>

#### Scenario: Check the difference between a missing title and a blank title

Start the service from tutorial step 2. Send one order preview with no title and another with spaces as its title.

```sh
curl -i http://127.0.0.1:3000/api/v1/orders/preview \
  -H 'Content-Type: application/json' --data '{}'
curl -i http://127.0.0.1:3000/api/v1/orders/preview \
  -H 'Content-Type: application/json' --data '{"title":"  "}'
```

A missing title fails contract validation with HTTP 400. Spaces pass the contract’s string check. The handler trims the value and returns HTTP 200 with `success: false` and the field error in `error.cause`. [Complete order preview example](../getting-started/serv.en.md#orders-console-validation)

<a id="request-locale-api"></a>

### `serv.resolveRequestLocale` / `serv.m` · Read a Serv message in the request locale

Resolve the request locale before rendering a built-in user-facing message or validation result. This leaves the process default locale in place.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.resolveRequestLocale(headers)` | Resolve the request locale | Requires `Headers` or a string map. A nonempty `x-hai-locale` takes priority, followed by `Accept-Language`. | Chooses the first supported list entry, skipping `q=0`. Returns `zh-CN`, `en-US`, or `ja-JP`, defaulting to `zh-CN`. | `serv.resolveRequestLocale(request.headers)` |
| `serv.m(key, options?)` | Read a localized Serv message | Requires a registered message key. Optional `locale` and interpolation `params`. Uses the current Core locale when omitted. | `string`. A locale override affects only this lookup. | `serv.m("serv_errorForbidden", { locale: "en-US" })` |

#### Scenario: Return an authorization message to a Japanese page

The example simulates a Japanese client sending `x-hai-locale: ja-JP`. Resolve its request locale and read Serv’s built-in authorization message.

```ts
import assert from 'node:assert/strict'
import { serv } from '@h-ai/serv'

const headers = new Headers({ 'x-hai-locale': 'ja-JP' })
// Resolve ja-JP for this request.
const locale = serv.resolveRequestLocale(headers)
assert.equal(locale, 'ja-JP')
// Render this authorization message in Japanese.
const message = serv.m('serv_errorForbidden', { locale })
assert.notEqual(message, serv.m('serv_errorForbidden', { locale: 'en-US' }))
```

The same message key now resolves in Japanese. Other requests still use their own locale.

<a id="generate-spec-api"></a>

### `serv.generateSpec` · Generate OpenAPI from a shared contract

Export an OpenAPI 3.1 file for integration testing or partner use. Generating the document requires no HTTP listener.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.generateSpec(contract, options?)` | Generate OpenAPI 3.1 from the shared contract | Requires `contract`. Optional `title` (default `hai-framework API`), `version` (default `0.1.0`), `description`, and `apiPrefix`. | `Promise<OpenAPI.Document>`. Rejects if schema conversion fails. | `await serv.generateSpec(contract, { title: "Orders", apiPrefix: "/api/v1" })` |

#### Scenario: Give an integration team the order preview API specification

Import the order contract from `orders.mts` in [step 2](../getting-started/serv.en.md#orders-console-validation). Save the code below as `export-spec.mts` and run `node export-spec.mts` from the project directory.

```ts
import { writeFile } from 'node:fs/promises'
import { serv } from '@h-ai/serv'
import { orderContract } from './orders.mts'

// Generate OpenAPI 3.1 with /api/v1 in servers[0].url. A schema conversion failure rejects the promise.
const spec = await serv.generateSpec(orderContract, {
  title: 'Orders API',
  version: '1.0.0',
  apiPrefix: '/api/v1',
})
// Save the document as JSON for the integration team to import.
await writeFile('orders-openapi.json', JSON.stringify(spec, null, 2) + '\n')
```

The generated `orders-openapi.json` lists `/orders/preview` under `paths`. The client combines it with `/api/v1` from `servers[0].url`. To publish it over HTTP, configure `http.openapi`. Use `http.docs.requireAuth` to protect the documentation page.

Serv and Kit match operations by the HTTP method declared in the contract. When a path declares both GET and HEAD, HEAD runs its own operation and returns its status and headers with an empty body. For a HEAD operation that needs query parameters or request headers, set `inputStructure: 'detailed'` and declare `query` or `headers` in the input schema.

<a id="iam-procedures-api"></a>

### `serv.createIamProcedures` · Mount sign-in, account, and administration routes

Each factory returns a router shaped like its contract. Select the nodes the app exposes and use the same keys in `contract` and `procedures`. The Import `serv` and the required types from `@h-ai/serv`.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.createIamProcedures(deps)` | Mount standard IAM login, account, and admin routes | Requires initialized `deps.iam`. | Router for `apiContract.iam`. Ordinary calls return `HaiResult`, and admin actions check permissions. | `serv.createIamProcedures({ iam })` |

#### Scenario: Sign in and restore a console session

Step 4 calls `serv.createIamProcedures({ iam })` to mount login, current user, and logout. [IAM sign-in and refresh](../getting-started/serv.en.md#orders-console-iam) · [Authentication and authorization](#authentication)

Sign in and start the local service as shown in the tutorial. The terminal examples below use Bash, curl and jq. Set `ORDERS_ACCESS_TOKEN` to the current access token returned at sign-in.

```sh
set -o pipefail
ORDERS_API_ROOT='http://127.0.0.1:3000/api/v1'
curl -sS "$ORDERS_API_ROOT/auth/me" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" |
  jq -e 'if .success then {id: .data.id, roles: .data.roles} else error(.error.message) end'
```

The command prints the ID and roles from the current server session. Use that ID as `ORDERS_USER_ID` in the file examples. For a signed-out request, check `error.httpStatus` on the failure result.

<a id="storage-procedures-api"></a>

### `serv.createStorageProcedures` · Generate file access URLs

Select the contract node for this task and take its implementation from the factory’s router.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.createStorageProcedures(deps)` | Mount presigned URLs, listing, metadata, and deletion | Requires `storage` and `authorize({ operation, context, keys })`, returning true synchronously or asynchronously to grant access. | Router for `apiContract.storage`. Denies the entire batch if a key is unauthorized. | `serv.createStorageProcedures({ storage, authorize: canUseKeys })` |

#### Scenario: Issue a personal file download link to a signed-in user

Initialize Storage and supply `authorize` to check every full object key, such as allowing only files under `users/<verified user ID>/`. Send the user’s object key to `POST /api/v1/storage/presigned-urls/download`. The response includes a download URL. A key belonging to another user returns `FORBIDDEN`. Pass the dependencies prepared at startup to the function below to create the HTTP app. [Storage inputs and results](storage.en.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type StorageProcedureDeps, type ServIam, serv } from '@h-ai/serv'

export function createFileLinkApp(deps: StorageProcedureDeps, iam: ServIam) {
  // Select the one operation this app exposes, with its matching implementation.
  const routes = serv.createStorageProcedures(deps)
  const contract = { presignedUrls: { createDownload: apiContract.storage.presignedUrls.createDownload } }
  const procedures = { presignedUrls: { createDownload: routes.presignedUrls.createDownload } }
  // Mount the contract and handler. Initialized IAM verifies request tokens.
  return serv.createApp({ contract, procedures, auth: { iam } })
}
```

Start the service with the signing route mounted. Use a real object key from the current user’s file list, such as the order console’s quarterly report. Check the signing result, then download the file with the short-lived URL. The download request does not send an access token.

```sh
report_key="users/$ORDERS_USER_ID/reports/quarterly-orders.csv"
download_url="$(
  jq -nc --arg key "$report_key" '{key: $key, expiresIn: 60}' |
    curl -sS "$ORDERS_API_ROOT/storage/presigned-urls/download" \
      -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' --data-binary @- |
    jq -er 'if .success then .data.url else error(.error.message) end'
)" && curl -fsS --output quarterly-orders.download.csv "$download_url"
```

See [serv.implement](#authentication) for authentication and authorization behavior.

<a id="ai-procedures-api"></a>

### `serv.createAiProcedures` · Mount chat and memory routes

Select the contract node for this task and take its implementation from the factory’s router.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.createAiProcedures(deps)` | Mount nonstreaming chat, history, sessions, and memory reads | Requires `ai`. Optional `authorizeObject` must grant access explicitly for another subject. | Router for `apiContract.ai`. Binds `objectId` to the session user by default. | `serv.createAiProcedures({ ai })` |

#### Scenario: Let a signed-in user start a chat

Initialize the AI chat service and expose the endpoint for a single completion. A signed-in user sends messages to `POST /api/v1/ai/chats/completions`. Omitting `objectId` uses the session user’s scope. A successful call returns the chat completion. Pass the dependencies prepared at startup to the function below to create the HTTP app. [Chat inputs and tool calls](ai.en.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type AiProcedureDeps, type ServIam, serv } from '@h-ai/serv'

export function createChatApp(deps: AiProcedureDeps, iam: ServIam) {
  // Select the one operation this app exposes, with its matching implementation.
  const routes = serv.createAiProcedures(deps)
  const contract = { chats: { createCompletion: apiContract.ai.chats.createCompletion } }
  const procedures = { chats: { createCompletion: routes.chats.createCompletion } }
  // Mount the contract and handler. Initialized IAM verifies request tokens.
  return serv.createApp({ contract, procedures, auth: { iam } })
}
```

Start the service and make this request as a signed-in user. It asks one question about order reconciliation and prints the first reply’s text. The jq command stops on a failed business result and shows the server message.

```sh
curl -sS "$ORDERS_API_ROOT/ai/chats/completions" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' \
  --data '{"messages":[{"role":"user","content":"Which fields should I check when reconciling quarterly orders?"}]}' |
  jq -e 'if .success then .data.choices[0].message.content else error(.error.message) end'
```

See [serv.implement](#authentication) for authentication and authorization behavior.

<a id="feedback-procedures-api"></a>

### `serv.createFeedbackProcedures` · Accept feedback and replies

Select the contract node for this task and take its implementation from the factory’s router.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.createFeedbackProcedures(deps)` | Mount feedback submission, lists, replies, attachments and the signed-in user’s submission limits | Requires initialized `deps.feedback` and `deps.resolveContext(context)` to map the verified session to a feedback scope. A null or invalid actor is denied. | Returns the router matching `apiContract.feedback`. Mount the operations the app needs. | `serv.createFeedbackProcedures({ feedback, resolveContext })` |

If application-layer encryption is enabled, derive feedback write budgets from the effective `limits.maxTotalFileBytes` setting and merge them into `routePlaintextBytes`. Attachment reads use 16 MiB. [Feedback transport budgets](api-contract.en.md#feedback-budget)

#### Scenario: Report missing rows in an order export

A signed-in user notices that an order export omitted the selected rows. Generate a UUID as the submission’s `id` and post `body: "The export omitted my selected rows."` to `POST /api/v1/feedback/reports`. Initialize Feedback at startup, resolve the user and feedback scope from the verified session and application configuration, and pass `deps` to the factory below. Success returns the feedback ID in `data.id` and `data.status: "pending"`. Requests without a trusted scope are rejected. [Feedback input and replies](feedback.en.md)

#### Scenario: Let a signed-in user submit feedback

Initialize Feedback. Use `resolveContext` to map the verified user to a scope from deployment settings or a trusted tenant mapping. Submit feedback to `POST /api/v1/feedback/reports`. Valid users and scopes start the feedback flow, and a missing scope is rejected. Pass the dependencies prepared at startup to the function below to create the HTTP app. [Feedback input and replies](feedback.en.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type FeedbackProcedureDeps, type ServIam, serv } from '@h-ai/serv'

export function createFeedbackApp(deps: FeedbackProcedureDeps, iam: ServIam) {
  // Select the one operation this app exposes, with its matching implementation.
  const routes = serv.createFeedbackProcedures(deps)
  const contract = { reports: { submit: apiContract.feedback.reports.submit } }
  const procedures = { reports: { submit: routes.reports.submit } }
  // Mount the contract and handler. Initialized IAM verifies request tokens.
  return serv.createApp({ contract, procedures, auth: { iam } })
}
```

With the service running, submit a real report the app can save. Generate a UUID and send the missing-rows issue. The result shows that ID and a `pending` status. Keep the ID to reopen the report later.

```sh
report_id="$(node -p 'crypto.randomUUID()')"
jq -nc --arg id "$report_id" '{id: $id, body: "The export omitted my selected rows."}' |
  curl -sS "$ORDERS_API_ROOT/feedback/reports" \
    -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' --data-binary @- |
  jq -e 'if .success then {id: .data.id, status: .data.status} else error(.error.message) end'
```

See [serv.implement](#authentication) for authentication and authorization behavior.

<a id="audit-procedures-api"></a>

### `serv.createAuditProcedures` · Expose audit queries

Select the contract node for this task and take its implementation from the factory’s router.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.createAuditProcedures(deps)` | Mount audit listing, statistics, and backups | Requires `audit`, `resolveReadScope`, and `authorizeBackup`. Read scope is `{ scopeId }`, explicit `{ global: true }`, or null. Backup policy checks reauthentication bound to `audit.backup`. | Router for `apiContract.extensions.audit`. Rejects a scope or reauthentication mismatch. | `serv.createAuditProcedures({ audit, resolveReadScope, authorizeBackup })` |

#### Scenario: Let an auditor read their tenant’s logs

Initialize Audit and pass `resolveReadScope` to look up a verified scope such as `{ scopeId: "tenant-a" }`. A user with `audit:read` calls `GET /api/v1/audit/logs` and receives the tenant’s paginated logs. A mismatched scope returns `FORBIDDEN`. Pass the dependencies prepared at startup to the function below to create the HTTP app. [Audit logs](audit.en.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type AuditProcedureDeps, type ServIam, serv } from '@h-ai/serv'

export function createAuditApp(deps: AuditProcedureDeps, iam: ServIam) {
  // Select the one operation this app exposes, with its matching implementation.
  const routes = serv.createAuditProcedures(deps)
  const contract = { logs: { list: apiContract.extensions.audit.logs.list } }
  const procedures = { logs: { list: routes.logs.list } }
  // Mount the contract and handler. Initialized IAM verifies request tokens.
  return serv.createApp({ contract, procedures, auth: { iam } })
}
```

Take `ORDERS_REQUEST_ID` from the `X-Request-Id` header of an actual order operation and query with the auditor’s token. The result lists matching records in the current tenant, or an empty array when there are none.

```sh
curl -sS --get "$ORDERS_API_ROOT/audit/logs" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" --data-urlencode "requestId=$ORDERS_REQUEST_ID" |
  jq -e 'if .success then .data.items | map({requestId, action, resource}) else error(.error.message) end'
```

See [serv.implement](#authentication) for authentication and authorization behavior.

<a id="iam-management-procedures-api"></a>

### `serv.createIamManagementProcedures` · Manage role permissions and API keys

Select the contract node for this task and take its implementation from the factory’s router.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.createIamManagementProcedures(deps)` | Mount API keys and role-permission mappings | Requires `iam` and `authorize` for the target user or role. | Router for `apiContract.extensions.iam`. Both built-in permissions and the host check must pass. | `serv.createIamManagementProcedures({ iam, authorize })` |

#### Scenario: Let an administrator view role permissions

Initialize IAM and use `authorize` to check whether the caller can read the target role. Call `GET /api/v1/iam/roles/{id}/permissions` with its actual ID. Both the built-in permission and app authorization must pass before the list is returned. Pass the dependencies prepared at startup to the function below to create the HTTP app. [IAM administration](iam.en.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type IamManagementProcedureDeps, serv } from '@h-ai/serv'

export function createRolePermissionApp(deps: IamManagementProcedureDeps) {
  // Select the one operation this app exposes, with its matching implementation.
  const routes = serv.createIamManagementProcedures(deps)
  const contract = { roles: { listPermissions: apiContract.extensions.iam.roles.listPermissions } }
  const procedures = { roles: { listPermissions: routes.roles.listPermissions } }
  // Mount the contract and handler. Initialized IAM verifies request tokens.
  return serv.createApp({ contract, procedures, auth: { iam: deps.iam } })
}
```

Take `ORDERS_ROLE_ID` from the selected role record. Run the command with an administrator token that has `iam.roles.read` and access to that role. The command lists the codes granted directly to the role.

```sh
role_id="$(jq -nr --arg id "$ORDERS_ROLE_ID" '$id | @uri')"
curl -sS "$ORDERS_API_ROOT/iam/roles/$role_id/permissions" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" |
  jq -e 'if .success then .data | map(.code) else error(.error.message) end'
```

See [serv.implement](#authentication) for authentication and authorization behavior.

<a id="ai-streaming-procedures-api"></a>

### `serv.createAiStreamingProcedures` · Stream chat completions

Mount streaming completions when a page displays the reply as it arrives. Select only the contract nodes the app exposes.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.createAiStreamingProcedures(deps)` | Mount the chat completion event stream | `AiStreamingProcedureDeps` requires `ai`. Streaming uses `ai.llm.chatStream`. Optional `authorizeObject` can grant access to another subject. | Returns `chats.streamCompletion` for `apiContract.extensions.ai.chats`. Missing capability returns 503. Access to an unauthorized subject returns 403. Mount the SSE route through `transportRoutes`. | `serv.createAiStreamingProcedures({ ai })` |

<a id="ai-stream-example"></a>

#### Scenario: Stream a report summary on the page and let the user stop it

The order console has already loaded report content this user is allowed to see. When they select Summarize report, the page sends that content to the assistant and displays the reply incrementally. Initialize IAM and an AI model that supports streaming, mount the nodes below in the existing Serv app, then start listening. Use same-origin requests and deploy over HTTPS.

Save the shared contract as `report-chat-contract.mts` so both the server and the page can import it.

```ts
import { apiContract } from '@h-ai/api-contract'

const streamCompletion = apiContract.extensions.ai.chats.streamCompletion
export const reportChatContract = apiContract.create({ ai: { chats: { streamCompletion } } })
```

Import the same contract in the server. The example mounts streaming chat alone. Add its contract, procedures and SSE route to the existing application.

```ts
import { ai } from '@h-ai/ai'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { reportChatContract } from './report-chat-contract.mts'

// Use the initialized AI module and cap each request body at 64 KiB.
const routes = serv.createAiStreamingProcedures({ ai })
export const app = serv.createApp({
  auth: { iam },
  contract: reportChatContract,
  procedures: { ai: { chats: { streamCompletion: routes.chats.streamCompletion } } },
  transportRoutes: [{
    procedure: reportChatContract.ai.chats.streamCompletion,
    maxRequestBytes: 64 * 1024,
  }],
})
```

Install `@h-ai/api-client` and save the browser module as `report-chat-client.mts`.

```ts
import { apiClient } from '@h-ai/api-client'
import { reportChatContract } from './report-chat-contract.mts'

export async function streamReportSummary(
  baseUrl: string,
  accessToken: string,
  reportText: string,
  appendText: (text: string) => void,
  signal: AbortSignal,
) {
  // Create a client for this request using the access token from the signed-in page.
  const client = apiClient.create(reportChatContract)
  try {
    const ready = await client.init({ baseUrl, headers: { Authorization: 'Bearer ' + accessToken } })
    if (!ready.success)
      throw new Error(ready.error.message)

    // Send only the report content already authorized for this page, and pass along the cancel signal.
    const result = await client.ai.chats.streamCompletion({
      messages: [{ role: 'user', content: 'Summarize the following order report:\n' + reportText }],
    }, { signal })
    // Before the stream opens, failures use HaiResult. After it opens, the iterator yields text or reports an error.
    if (!(Symbol.asyncIterator in result))
      throw new Error(result.error.message)

    for await (const event of result) {
      // Append text for the first choice. The done event confirms the reply is complete.
      if (event.type === 'done')
        return
      const text = event.choices.find(choice => choice.index === 0)?.delta.content
      if (text)
        appendText(text)
    }
    signal.throwIfAborted()
    throw new Error('The reply ended before completion. Try again.')
  }
  finally {
    // Close the client after completion, failure or cancellation.
    await client.close()
  }
}
```

Render two buttons and a reply area in the report page. Pass the rendered elements, the current session’s `accessToken` and `report.summary` from the report endpoint to the binding below. Call its cleanup function when the page is removed.

```html
<button id="summarize-report" type="button">Summarize report</button>
<button id="stop-summary" type="button" disabled>Stop</button>
<pre id="report-reply" aria-live="polite"></pre>
<p id="report-summary-status" role="status"></p>
```

```ts
import { streamReportSummary } from './report-chat-client.mts'

export function bindReportSummary(page: HTMLElement, accessToken: string, reportText: string) {
  const summarize = page.querySelector<HTMLButtonElement>('#summarize-report')
  const stop = page.querySelector<HTMLButtonElement>('#stop-summary')
  const reply = page.querySelector<HTMLElement>('#report-reply')
  const status = page.querySelector<HTMLElement>('#report-summary-status')
  if (!summarize || !stop || !reply || !status)
    throw new Error('Missing report summary controls')
  let active: AbortController | undefined

  const summarizeReport = async () => {
    if (active)
      return
    const request = new AbortController()
    active = request
    summarize.disabled = true
    stop.disabled = false
    reply.textContent = ''
    status.textContent = ''
    try {
      await streamReportSummary('/api/v1', accessToken, reportText, (text) => {
        reply.textContent += text
      }, request.signal)
    }
    catch (error) {
      status.textContent = request.signal.aborted
        ? 'Cancelled'
        : error instanceof Error ? error.message : 'Could not generate the reply'
    }
    finally {
      active = undefined
      summarize.disabled = false
      stop.disabled = true
    }
  }

  const cancel = () => active?.abort()
  summarize.addEventListener('click', summarizeReport)
  stop.addEventListener('click', cancel)
  return () => {
    cancel()
    summarize.removeEventListener('click', summarizeReport)
    stop.removeEventListener('click', cancel)
  }
}
```

Bind the buttons once the report page has its data and elements. Call `disposeSummary()` when the report page unmounts.

```ts
const disposeSummary = bindReportSummary(reportPanel, accessToken, report.summary)
```

Selecting Summarize report sends `POST /api/v1/ai/chats/completions/stream` in the browser’s Network panel. Text appears as the model emits it. Selecting Stop leaves the text already received visible and marks the request as cancelled. A missing session fails before streaming and an unauthorized subject returns 403. If the model fails mid-stream, iteration rejects and the page displays an error. On a same-origin site that enables application-layer encryption, allow ordinary HTTPS for this SSE route. [Mount file and streaming endpoints](#http-contract-extensions)

<a id="ai-memory-write-procedures-api"></a>

### `serv.createAiMemoryWriteProcedures` · Write user memories

Connect an assistant preferences editor to memory write routes. Select add, update, remove, and clear independently.

#### Interface list

| API | Purpose | Arguments and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.createAiMemoryWriteProcedures(deps)` | Mount memory writes | `AiMemoryWriteProcedureDeps` requires `ai`. Writes use `ai.memory.scoped`. Supply `resolveMemoryScope(request)` to determine the permitted subject and scope. By default, users can add, update, and remove one memory of their own. The app must grant a scope explicitly before clearing memories. | Returns `memories.add`, `update`, `remove`, and `clear`. Operations return a `HaiResult`. An unauthorized subject or scope returns `FORBIDDEN`. | `serv.createAiMemoryWriteProcedures({ ai, resolveMemoryScope })` |

<a id="ai-memory-write-example"></a>

#### Scenario: Let users save report assistant preferences

Initialize IAM and AI with a memory store. The report assistant’s settings page only adds preferences. Select `apiContract.extensions.ai.memories.add` and use the authenticated user’s memory scope by omitting the scope resolver.

```ts
import { ai } from '@h-ai/ai'
import { apiContract } from '@h-ai/api-contract'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'

const add = apiContract.extensions.ai.memories.add
const memoryRoutes = serv.createAiMemoryWriteProcedures({ ai })

// Match the add operation with its handler. IAM verifies the request session.
export const app = serv.createApp({
  auth: { iam },
  contract: apiContract.create({ ai: { memories: { add } } }),
  procedures: { ai: { memories: { add: memoryRoutes.memories.add } } },
})
```

Start the service and save a preference from a signed-in user’s settings page. On success, the command prints the new record ID. An `objectId` belonging to another user produces a business error with `httpStatus: 403`.

```sh
curl -sS "$ORDERS_API_ROOT/ai/memories" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' \
  --data '{"content":"Use bullet points for monthly report summaries.","type":"preference"}' |
  jq -e 'if .success then .data.id else error(.error.message) end'
```

<a id="iam-audio-api"></a>

### `serv.createIamAudio` · Issue real-time audio tickets for audit reports through IAM

Pass initialized `ai` and `iam`, the parsed `config.audio`, and the permission to `serv.createIamAudio({ ai, iam, config, permission })`. Pass the returned `config` to `serv.createApp({ audio })`. Pair `apiContract.extensions.ai.audio.issueTicket` with the returned `issueTicket` in your app. The caller exchanges their access token for a short-lived, single-use ticket. The connection rechecks current account status and permission and uses the configured default speech model.

Use `reports:read` to let auditors in the orders console listen to report summaries as audio is generated. The page requests a ticket, connects, and starts playback. [From ticket issuance to browser playback](#audio-ticket-example)

<a id="ai-media-procedures-api"></a>

### `serv.createAiMediaProcedures` · Generate images and audio

Expose media operations to authorized users. Select audio capability queries, ticket issuance, transcription, speech synthesis, or image generation. Set per-route request limits for transcription, speech synthesis, and image generation through `transportRoutes`.

#### Interface list

| API | Purpose | Arguments and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.createAiMediaProcedures(deps)` | Mount audio and image operations | `AiMediaProcedureDeps` requires `ai` with `audio` or `image` for the operations in use. Calls require a grant from `authorizeMedia(request)`. Issuing a ticket also requires `audioTickets.issue`. | Returns `audio.getCapabilities`, `audio.issueTicket`, `audio.transcribe`, `audio.synthesize`, and `images.generate`. Missing capability or permission fails. Successful image generation and speech synthesis return a `File`. | `serv.createAiMediaProcedures({ ai, authorizeMedia })` |

#### Scenario: Let the auditor hear a report and transcribe a note

The synthesis route accepts up to 5,000 characters of `text` and returns a WAV or MP3 file. The transcription route accepts a WAV or MP3 file up to 8 MiB in the multipart `audio` field and returns the transcript in `data.text`. Both use standard HTTP requests. [Configure and verify synthesis and transcription](../getting-started/serv.en.md#orders-console-audio)

<a id="ai-media-example"></a>

#### Scenario: Let authorized report editors generate a cover image

Initialize IAM and AI with a default image model. The console’s report editor exposes text-to-image generation and checks `reports:cover:generate` in the verified session. An empty grant uses the configured default model.

```ts
import { ai } from '@h-ai/ai'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'

const generate = apiContract.extensions.ai.images.generate
const mediaRoutes = serv.createAiMediaProcedures({
  ai,
  // Require report cover permission before calling the image model.
  authorizeMedia: ({ context, operation }) => operation === 'generateImage'
    && context.session.permissions.includes('reports:cover:generate')
    ? core.ok({})
    : core.err(HaiCommonError.FORBIDDEN),
})

// Mount only image generation with a 32 KiB budget for the text prompt and JSON encoding.
export const app = serv.createApp({
  auth: { iam },
  contract: apiContract.create({ ai: { images: { generate } } }),
  procedures: { ai: { images: { generate: mediaRoutes.images.generate } } },
  transportRoutes: [{ procedure: generate, maxRequestBytes: 32 * 1024 }],
})
```

Start the service and send a cover prompt with a token that has `reports:cover:generate`. Check the returned `Content-Type`, then preview the downloaded image. Name it with the matching file extension. An unauthorized request returns HTTP 403. If application-layer encryption is enabled, set `encryption: "disabled"` for this method and full path. [File and streaming routes](#http-contract-extensions)

```sh
curl -fsS "$ORDERS_API_ROOT/ai/images/generations" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' \
  --data '{"prompt":"A quarterly order report cover on a light background"}' \
  --dump-header - --output quarterly-report-cover
```

<a id="storage-transfer-procedures-api"></a>

### `serv.createStorageTransferProcedures` · Proxy private files

Select the contract node for this task and take its implementation from the factory’s router.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.createStorageTransferProcedures(deps)` | Mount authorized file proxy routes | Requires `storage.file.put`, `getStreamWithMetadata`, and `authorize` for the complete key. | Router for `apiContract.extensions.storage`. Multipart uploads and attachment downloads both require transport mounts. | `serv.createStorageTransferProcedures({ storage, authorize: canUseKey })` |

<a id="storage-file-example"></a>

#### Scenario: Upload and download a personal file

Use initialized Storage and IAM. Each request checks the full object key against the verified user. Download returns an authenticated attachment; the host owns object naming and read authorization.

```ts
import { apiContract, STORAGE_PROXY_MAX_FILE_BYTES } from '@h-ai/api-contract'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { storage } from '@h-ai/storage'

const contract = apiContract.extensions.storage
const { upload, download } = contract.files
// Use initialized Storage and check the complete key against the user directory. A rejected key cannot open the object.
const procedures = serv.createStorageTransferProcedures({
  storage,
  authorize: ({ keys, context }) => keys[0].startsWith(
    'users/' + encodeURIComponent(context.session.userId) + '/',
  ),
})
export const app = serv.createApp({
  auth: { iam },
  contract,
  procedures,
  transportRoutes: [
    // Reserve room for multipart metadata on uploads. Downloads expect an empty body.
    { procedure: upload, maxRequestBytes: STORAGE_PROXY_MAX_FILE_BYTES + 16 * 1024 },
    { procedure: download, maxRequestBytes: 0 },
  ],
})
```

Use a locally available `quarterly-orders.csv`. The first upload prints the object key on success. Then download it to a separate file. Reusing the same key for an upload fails, and downloading another user’s key returns HTTP 403.

```sh
file_key="users/$ORDERS_USER_ID/reports/quarterly-orders.csv"
curl -sS "$ORDERS_API_ROOT/storage/files/upload" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" \
  --form-string "key=$file_key" --form 'file=@quarterly-orders.csv;type=text/csv' |
  jq -e 'if .success then .data.key else error(.error.message) end' &&
  curl -fsS --get "$ORDERS_API_ROOT/storage/files/download" \
    -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" --data-urlencode "key=$file_key" \
    --output quarterly-orders.download.csv
```

The file limit is 5 MiB and the request budget includes an extra 16 KiB. Successful downloads include `Content-Disposition: attachment` and `Cache-Control: no-store`. For large objects, use [Storage presigning](storage.en.md).

<a id="payment-close-order-procedures-api"></a>

### `serv.createPaymentCloseOrderProcedures` · Close authorized orders

Select the contract node for this task and take its implementation from the factory’s router.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.createPaymentCloseOrderProcedures(deps)` | Mount payment order closure | Requires initialized `payment.closeOrder` and `authorizeClose(input, context)`, which returns the trusted provider and merchant order number or a failure. | Router for `apiContract.extensions.payment`. Denies input that differs from the trusted record. | `serv.createPaymentCloseOrderProcedures({ payment, authorizeClose })` |

#### Scenario: Let an order administrator close an order

Initialize Payment and look up the merchant order ID and provider in the trusted order store. The app’s `authorizeClose` checks the caller and the order. Call `POST /api/v1/payment/orders/{orderNo}/close`. Serv calls the payment provider only when authorization succeeds and matches the requested order. Pass the dependencies prepared at startup to the function below to create the HTTP app. [Payment orders](payment.en.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type PaymentCloseOrderProcedureDeps, type ServIam, serv } from '@h-ai/serv'

export function createOrderAdminApp(deps: PaymentCloseOrderProcedureDeps, iam: ServIam) {
  // Select the one operation this app exposes, with its matching implementation.
  const routes = serv.createPaymentCloseOrderProcedures(deps)
  const contract = { orders: { close: apiContract.extensions.payment.orders.close } }
  const procedures = { orders: { close: routes.orders.close } }
  // Mount the contract and handler. Initialized IAM verifies request tokens.
  return serv.createApp({ contract, procedures, auth: { iam } })
}
```

Create an unpaid order in the payment sandbox. Set `ORDERS_PAYMENT_ORDER_NO` to its merchant order number from the trusted order record. This command uses Stripe for that record. Update the page when `success: true` is returned. On authorization or provider failure, keep the previous state.

```sh
order_no="$(jq -nr --arg number "$ORDERS_PAYMENT_ORDER_NO" '$number | @uri')"
curl -sS "$ORDERS_API_ROOT/payment/orders/$order_no/close" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' \
  --data '{"provider":"stripe"}' |
  jq -e 'if .success then {success: .success} else error(.error.message) end'
```

See [serv.implement](#authentication) for authentication and authorization behavior.

<a id="error-handling"></a>

### HTTP status, domain errors, and logs

| Request stage | Observed result | Caller action |
| --- | --- | --- |
| Contract input validation | HTTP 400; localized fields are in `error.cause`. | Correct the fields and resubmit. |
| Ordinary procedure guard, secondary validation, or business failure | Defaults to HTTP 200 with `success: false`. Authentication and authorization use domain statuses 401 and 403. | Check `success` first, then use `error.code` and `httpStatus`. |
| Verifier outage, refresh route, file, or HTTP policy | Uses the actual HTTP error status. Unexpected exceptions produce a safe 5xx response. | Handle expired credentials according to API Client refresh behavior. 403 and 5xx do not trigger refresh. |

HTTP responses carry `X-Request-Id` and `X-Trace-Id`. Public structured errors preserve a correlation ID for locating server diagnostics. With Audit initialized, writes and procedure denials create `request.execute` events; contract, middleware, and routing rejections also create `http.reject` events. The app records explicit business audit events when the action completes. Request locales stay isolated across concurrent calls.
