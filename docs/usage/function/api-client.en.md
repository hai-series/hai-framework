# @h-ai/api-client API Reference

[简体中文](api-client.md) · [日本語](api-client.ja.md)

`apiClient` sends HTTP requests using the routes and types in a shared API contract. Create a client for the domains your server exposes, initialize its endpoint, then call a procedure such as `client.iam.auth.publicConfig()`. You can enable credential refresh, transport encryption, or request observation as the integration requires.

[Module README](../../../packages/api-client/README.en.md) · [Configuration](../configuration/api-client.en.md) · [Data structures](../data/api-client.en.md)

<a id="quick-start"></a>

## Minimal setup

<a id="module-dependencies"></a>

### Dependencies

| Dependency | Purpose | When required | Setup order |
| --- | --- | --- | --- |
| `@h-ai/api-client` | Bind an HTTP client to the application contract. | Whenever an application calls typed endpoints. | Create an instance, initialize its address, then call the API. |
| `@h-ai/api-contract` | Supply the same procedure definitions used by the server. | Install it explicitly when the application imports it, as below. | Select the server's domains before creating the client. |
| HTTP service and Fetch | Supply mounted routes and send HTTP requests. | The caller needs a matching Serv or SvelteKit service and a Fetch-compatible runtime. | Make the service available at its mounted prefix. Native bridges and test doubles can supply `fetch`. |
| `@h-ai/crypto` | Negotiate a transport session and encrypt requests. | Install and import it explicitly when the application enables [transport encryption](#encrypted-requests). | Initialize Crypto before the client. Close the client before closing Crypto. |

### Installation

```sh
pnpm add @h-ai/api-client @h-ai/api-contract
```

<a id="example"></a>

### Read public sign-in settings

Start a server that mounts [the standard IAM endpoints](api-contract.en.md#serv-iam-wiring) at `/api/v1`. In Node.js, pass `http://127.0.0.1:3000/api/v1` when the service listens on that port. In a same-origin browser app, use `/api/v1`.

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function loadAuthPolicy(baseUrl: string) {
  // Select the server's IAM router, then create an isolated client from that contract.
  const contract = apiContract.create({ iam: apiContract.iam })
  const client = apiClient.create(contract)
  // The public settings endpoint needs only the API address. An invalid address fails initialization.
  const initialized = await client.init({ baseUrl })
  if (!initialized.success)
    return initialized

  try {
    // Read the settings before opening the sign-in form. Success data may be null.
    const result = await client.iam.auth.publicConfig()
    if (!result.success)
      return result
    return result
  }
  finally {
    await client.close()
  }
}
```

The call sends `GET /api/v1/auth/config` to the running service. Check `success`, then use the settings in `data` to show the permitted sign-in methods. See [public settings](../data/api-contract.en.md#public-settings) for the response fields. Handle `null` as an absent public policy. On a request failure, present the error without assuming any sign-in method is available.

<a id="api-reference"></a>

## Features

The default instance contains IAM, Storage, and AI. Create a client with [the application contract shared with the server](api-contract.en.md#use-with-client) when it exposes different domains.

<a id="client-lifecycle"></a>
<a id="prepare-isolated-clients-apiclient"></a>

### Create an isolated client with `apiClient.create(contract)`

Create an instance for an application contract, a separate server, or an SSR request. Each instance owns its request observation, authentication state, and optional transport session. An optional domain omitted from a contract is absent at runtime. Keep the top-level lifecycle member names and the promise key `then` available to the client.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `apiClient.create(contract)` | Create an isolated instance. | Required `contract`, the route object shared with the server, for example the object returned by `apiContract.create({ iam: apiContract.iam })`. | `ApiClient<TContract>`. Call `init` before making requests. | `apiClient.create(contract)` |

<a id="scenario-prepare-isolated-clients"></a>

#### Scenario: Create a client for one server request

The [minimal setup](#quick-start) creates an IAM-only instance, uses public endpoints and closes it after the read. For a request that needs credentials, create its instance with the same contract and initialize it with a request-local memory adapter as shown below.

<a id="client-integration"></a>
<a id="client-addresses-deadlines-and-recovery"></a>

### Initialize, inspect and close the client with `client.init(config)`

Initialize the selected client before calling its procedures. Read the effective address when checking the instance's setup. Close it when the instance owner finishes using it.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `client.init(config)` | Prepare the default `apiClient` or a created instance. | Required `config` with `baseUrl`. Optional fields follow. | `Promise<HaiResult<void>>`. Invalid settings or a second initialization while ready return `CONFIG_ERROR`. | `await client.init({ baseUrl })` |
| `client.isInitialized` | Check readiness. | Read-only property. | `boolean`. | `client.isInitialized` |
| `client.config` | Inspect the effective settings. | Read-only property. Sensitive values are redacted. | Redacted snapshot or `null` outside an initialized lifetime. | `client.config?.baseUrl` |
| `client.close()` | End the client lifetime and release local resources. | No arguments. | `Promise<void>`. Clears listeners and destroys the client transport session. | `await client.close()` |

<a id="call-options"></a>
<a id="call-arguments-and-integration-options"></a>

##### Endpoint and request options

| Field in `ApiClientConfig` | Type, requirement, or default | Effect |
| --- | --- | --- |
| `baseUrl` | Required string. Use an absolute HTTP(S) address or a browser same-origin root path. | Includes the server's mounted API prefix. Requests, refresh, and key exchange use this resolved address. |
| `timeout` | Optional number in milliseconds. Default `30000`. | Caps each Fetch attempt through receipt of response headers and the complete JSON or error body. A successful custom stream uses the caller's signal while the body is read. |
| `clientName` | Optional string. Default `hai-api-client`. | Sets `X-Request-Client` on requests and refresh. |
| `headers` | Optional `Record<string, string>` or a sync or async function returning one. | Supplies request headers, for example an application channel. The active Core locale supplies `Accept-Language` unless explicitly set. |
| `fetch` | Optional `typeof globalThis.fetch`. Defaults to the runtime Fetch. | Supply a compatible native bridge or test double that respects cancellation and credentials. |
| `auth` | Optional `AuthConfig`. Omitted by default. | Omit to call public procedures without a token manager. Pass `{}` for browser cookie mode or set the [authentication options](#credentials) for your runtime. |
| `transport` | Optional `ApiClientTransportConfig`. Omitted by default. | Enables [application-layer encryption](#encrypted-requests) for the instance. |

##### Address, lifetime, and request deadlines

With a server prefix of `/backend/api`, use an address such as `https://app.example.com/backend/api`, or `/backend/api` in a same-origin browser. The address accepts HTTP(S) and excludes credentials, queries, and fragments. The browser resolves its root path against the current origin. Outside the browser, supply the scheme and host explicitly. See [configuration ownership](../configuration/api-client.en.md) for the source of these values.

Concurrent `init` calls share the in-progress initialization. To apply a new endpoint or change credentials storage, await `close()` and then initialize again. A request that has already reached the service may still finish there after timeout or cancellation. When the outcome of a write is unclear, use the application record or operation ID to establish its state.

#### Scenario: Check the effective client address

A backend request needs a client instance scoped to its own use. Supply the server's absolute API address. This check verifies the normalized address without making an HTTP call.

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

const contract = apiContract.create({ iam: apiContract.iam })
const client = apiClient.create(contract)
const ready = await client.init({
  baseUrl: 'http://127.0.0.1:3000/api/v1/',
  auth: { storage: apiClient.tokenStorage.memory(), terminalType: 'api' },
})
if (!ready.success)
  throw new Error(ready.error.message)

try {
  if (client.isInitialized)
    console.info(client.config?.baseUrl) // http://127.0.0.1:3000/api/v1
}
finally {
  await client.close()
}
```

Only the client created in this example is affected. A separate request can use its own instance and token store.

<a id="credentials"></a>
<a id="store-and-refresh-credentials-apiclientauth-tokenstorage"></a>

### Store and refresh credentials with `client.auth` and `apiClient.tokenStorage`

Initialize with `auth` before saving credentials. The token manager reads credentials from the selected adapter, sends an access token as a Bearer token, and can refresh it after an eligible rejection. The server still authenticates the token and authorizes each protected operation. The [data reference](../data/api-client.en.md#browser-storage) describes credential ownership and lifetime.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `apiClient.tokenStorage.httpOnlyCookie()` | Create browser-oriented storage. | No arguments. This adapter is selected when `auth.storage` is omitted. | `TokenStorage`. Fetch includes the server-managed cookie. | `apiClient.tokenStorage.httpOnlyCookie()` |
| `apiClient.tokenStorage.memory()` | Create independent in-memory storage. | No arguments. Both token values start empty. | `TokenStorage`. Values are held by that instance only. | `apiClient.tokenStorage.memory()` |
| `client.auth.setTokens(tokens)` | Commit credentials issued by the server. | Required `TokenPair`. `expiresIn` uses seconds. `refreshToken` is optional for cookie mode. | `Promise<void>`. Storage failure rejects. | `await client.auth.setTokens(result.data.tokens)` |
| `client.auth.clear()` | Clear local credentials and invalidate old refresh work. | No arguments. | `Promise<void>`. Storage failure rejects. Server logout remains a separate call. | `await client.auth.clear()` |
| `client.auth.onTokenRefreshed(callback)` | Subscribe to completed refresh writes. | Required synchronous `callback(tokens)`. | Unsubscribe function. Without `auth` the returned function is a no-op. | `client.auth.onTokenRefreshed(tokens => updateLifetime(tokens.expiresIn))` |

##### Authentication options

| Field | Type and default | Effect |
| --- | --- | --- |
| `auth.storage` | Optional `TokenStorage`. Default `apiClient.tokenStorage.httpOnlyCookie()`. | Owns the local access and refresh credential slots. Create a separate memory store per Node request. For native clients, inject a platform secure store. |
| `auth.terminalType` | `web`, `app`, `desktop`, or `api`. Default `web`. | Sends the selected group in `X-Hai-Terminal`. Match an allowed server group. The server verifies session credentials and enforces its terminal policy. |
| `auth.refreshPath` | Optional string relative to `baseUrl`. Default `/auth/refresh`. | Selects the mounted refresh endpoint. The default becomes `/api/v1/auth/refresh` when `baseUrl` ends in `/api/v1`. |
| `auth.refreshTimeoutMs` | Optional number in milliseconds. Default `10000`. | Limits the refresh Fetch independently of the business request timeout. A timeout or other transient failure preserves credentials. |
| `auth.onTokenRefreshed` | Optional synchronous `(tokens: TokenPair) => void`. | Runs after automatic refresh successfully commits the replacement credentials. For example, copy `expiresIn` to a session indicator. Keep token strings out of logs. |
| `auth.onRefreshFailed` | Optional synchronous `() => void`. | Without `recoverSession`, handles a missing refresh credential or definitive rejection, for example by returning to sign-in. Temporary failures keep the current session state. |
| `auth.recoverSession` | Optional `() => Promise<boolean>`. | After definitive rejection, prompt the same user. Return `true` after committing new credentials once on this client. Return `false` for cancellation or failed sign-in. When provided, this callback handles recovery in place of `onRefreshFailed`. |

<a id="token-storage-methods"></a>

##### Implement or inspect a token adapter

Each adapter method is asynchronous. A getter returns `null` for a missing value. Storage errors reject the promise, so callers can distinguish a failed read from an empty store. Let the client manage an attached adapter by calling `client.auth.setTokens()` and `client.auth.clear()`. These operations coordinate writes with any refresh that is in progress.

| Method | Parameters | Behavior |
| --- | --- | --- |
| `storage.getAccessToken()` | None. | Returns the current access token or `null`. The client uses the token for the request's Bearer header. |
| `storage.setAccessToken(token)` | The access token string from a successful authentication or refresh. | Resolves when the new value is stored. Cookie mode stores it in memory. |
| `storage.getRefreshToken()` | None. | Returns the locally stored refresh token or `null`. The built-in cookie adapter returns an internal mode marker and Fetch sends the actual cookie. |
| `storage.setRefreshToken(token)` | The refresh token string from the trusted service, if the service uses the response-body channel. | Resolves when the value is stored. In cookie mode, the server writes the refresh cookie through `Set-Cookie`. |
| `storage.clear()` | None. | Removes the values the adapter owns. The built-in cookie adapter clears its in-memory access token. Use the logout endpoint to expire the server's HttpOnly cookie. |

A successful IAM authentication supplies a `TokenPair`. `accessToken` is the short-lived Bearer token, `expiresIn` reports its lifetime in seconds, and `tokenType` is `'Bearer'`. `refreshToken` is optional because the cookie channel may omit it. A client-managed store receives the replacement pair through `client.auth.setTokens(tokens)`. When a replacement omits its refresh token, the client clears any prior locally stored refresh credential.

##### Credential ownership by runtime

- **Browser.** Use the built-in cookie adapter with the host's refresh cookie support. The client keeps the current access token in memory. Fetch manages the server-issued HttpOnly cookie. Call the service logout endpoint to revoke the session and expire the cookie, then clear the local credential state.
- **Node.js and SSR.** Create an independent client and memory adapter for each request or trusted server job that needs credentials. Node.js Fetch does not bring a browser cookie jar. The server application is responsible for any explicit request-scoped cookie forwarding.
- **Native applications.** Supply the platform's secure `TokenStorage`. Match the server's approved refresh body channel and terminal group. The `refreshToken` travels in JSON when the selected adapter supplies it directly.

<a id="browser-refresh"></a>

#### Scenario: Initialize a Web session, sign in, and sign out

Use a browser instance scoped to the signed-in layout. Mount the IAM routes at `/api/v1` and enable the refresh cookie on the service. In a same-origin browser, use `baseUrl: '/api/v1'`. For a separate API origin supply its absolute address, allow the app's exact origin and credentials in CORS, and align the cookie's `Secure`, `SameSite` and `Path` settings with the deployment. [Serv authentication](serv.en.md#authentication) · [Kit authentication](kit.en.md#auth)

```ts
import { apiClient, type IamAuthLoginInput } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function openBrowserSession(baseUrl: string, showLogin: () => void) {
  const client = apiClient.create({ iam: apiContract.iam })
  const ready = await client.init({
    baseUrl,
    auth: { onRefreshFailed: showLogin },
  })
  if (!ready.success)
    return ready

  const actions = apiClient.createAuthActions(client)
  return {
    // Pass the form submission here. IAM checks it before the action saves the access token.
    signIn: (input: IamAuthLoginInput) => actions.login(input),
    currentUser: () => client.iam.auth.currentUser(),
    async signOut() {
      const result = await client.iam.auth.logout({}, { context: { autoRefresh: false } })
      await client.auth.clear()
      return result
    },
    close: () => client.close(),
  }
}
```

Check the sign-in result before showing the signed-in view. After a reload, a new layout can read `currentUser()`. On an eligible rejection, the client can refresh using the browser-managed cookie and retry the read. If refresh is definitively rejected, the example calls `showLogin`. Check sign-out before telling the user that the service confirmed revocation. Call `close()` when the layout releases its instance.

<a id="scenario-store-and-refresh-credentials"></a>
<a id="detailed-workflow"></a>
<a id="recover-session"></a>

#### Scenario: Recover an expired session

The diagram follows a browser request with authentication enabled. A protected read receives a definitive session rejection, so the active client attempts refresh before considering recovery.

![When an authenticated request may retry](../images/function-api-client-recovery.en.svg)

1. A real HTTP 401, or a valid HTTP 200 `HaiResult` that reports an authentication 401, can trigger refresh. IAM login, registration, password reset, and refresh itself are excluded. IAM business errors unrelated to the session keep their original result.
2. Concurrent requests share a refresh. A successful refresh saves the replacement credentials and an eligible original request can retry once. A transient network or service failure keeps credentials and returns the original failure. Definitively invalid refresh credentials clear the local state and may trigger same-user recovery.
3. If configured, `recoverSession` should prompt the original user to sign in and save replacement credentials to this client once. Use the IAM `expectedUserId` restriction. The client retries only while the request remains active and the newly saved identity is eligible.
4. An `AbortSignal` stops the individual caller from waiting. Other active requests can still use a shared refresh. A new sign-in, local clear, or client close invalidates old work. An already-sent request may still return its original response.

Use the browser layout's client and let the application's recovery form handle any challenge. `promptSameUser` receives the ID of the last user who signed in through this instance and returns their form submission, or `null` when canceled. The IAM login action commits a successful response on that same client. Configure the ordinary [server logout flow](#logout) when the user signs out and release the instance when the layout is destroyed.

```ts
import { apiClient, type IamAuthLoginInput } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function openRecoverableSession(
  baseUrl: string,
  promptSameUser: (userId: string) => Promise<IamAuthLoginInput | null>,
  updateLifetime: (seconds: number) => void,
) {
  const client = apiClient.create({ iam: apiContract.iam })
  let userId: string | undefined
  const ready = await client.init({
    baseUrl,
    auth: {
      onTokenRefreshed: tokens => updateLifetime(tokens.expiresIn),
      async recoverSession() {
        const expectedUserId = userId
        if (!expectedUserId)
          return false
        const input = await promptSameUser(expectedUserId)
        // Skip a late form submission after sign-out or an account change.
        if (!input || userId !== expectedUserId)
          return false
        const result = await apiClient.createAuthActions(client).login({ ...input, expectedUserId })
        return result.success
      },
    },
  })
  if (!ready.success)
    return ready

  const actions = apiClient.createAuthActions(client)
  return {
    async signIn(input: IamAuthLoginInput) {
      const result = await actions.login(input)
      if (result.success)
        userId = result.data.user.id
      return result
    },
    currentUser: () => client.iam.auth.currentUser(),
    async signOut() {
      userId = undefined
      const result = await client.iam.auth.logout({}, { context: { autoRefresh: false } })
      await client.auth.clear()
      return result
    },
    async close() {
      userId = undefined
      await client.close()
    },
  }
}
```

The server checks `expectedUserId` before accepting recovery. When the original request is still eligible, the refreshed session can retry it once. If the prompt is canceled, sign-in fails, or the instance is closed, handle the returned failure normally. Close waits for pending local writes and disposes the manager. The host owns any durable adapter it supplies.

<a id="manual-token-storage"></a>

#### Scenario: Save credentials explicitly for a native or Node client

Use a platform secure adapter for a native client, such as `capacitor.createTokenStorage()` on Capacitor. Use a new `apiClient.tokenStorage.memory()` per Node request or trusted server job. Set the terminal group to the service's allowed value, for example `app` on mobile or `api` for a server job. The service must issue refresh tokens in the response body for this mode. [Capacitor storage](capacitor.en.md) · [TokenStorage contract](#token-storage-methods)

```ts
import { apiClient, type TokenStorage } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function loadProfileAfterPasswordLogin(
  baseUrl: string,
  input: { identifier: string, password: string, captcha?: string },
  terminalType: 'app' | 'desktop' | 'api',
  storage: TokenStorage,
) {
  const client = apiClient.create({ iam: apiContract.iam })
  const ready = await client.init({ baseUrl, auth: { terminalType, storage } })
  if (!ready.success)
    return ready
  try {
    // The raw procedure returns the issued credentials to its caller.
    const signedIn = await client.iam.auth.login(input)
    if (!signedIn.success)
      return signedIn

    // Commit first so the next request can send the Bearer token.
    await client.auth.setTokens(signedIn.data.tokens)
    return await client.iam.auth.currentUser()
  }
  finally {
    await client.close()
  }
}
```

Supply values from the sign-in form or the trusted server flow. Once the adapter is attached, update credentials through `client.auth` so stale refreshes cannot overwrite them. Use `client.auth.clear()` when ending the local session. Closing the client releases its request state, while a durable adapter preserves the values it owns until they are cleared.

<a id="auth-actions"></a>
<a id="drive-authentication-forms-apiclientcreateauthactions"></a>

### Connect sign-in and account forms with `apiClient.createAuthActions`

Create the actions for a ready client that includes the standard IAM authentication procedures and has `auth` configured. The actions adapt form arguments to the relevant IAM endpoint. Successful `login` and `register` finish saving credentials on that client before returning.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `apiClient.createAuthActions(client)` | Bind a form to the IAM endpoints and credential store. | A ready client with standard IAM authentication procedures and `auth`. | An actions object with the methods below. | `apiClient.createAuthActions(client)` |
| `actions.publicConfig()` | Read the server's public authentication policy. | No arguments. | `HaiResult` containing the policy or `null`. | `await actions.publicConfig()` |
| `actions.createCaptcha(input)` | Fetch a self-hosted challenge for an action. | `{ operation }`, one of `login`, `register`, `sendOtp`, `passwordReset`, or `renewPassword`. | `HaiResult` containing the challenge. Solve it in the UI, then send the proof as `captcha`. | `await actions.createCaptcha({ operation: 'login' })` |
| `actions.login(input)` | Sign in and save credentials. | `identifier`, `password`, optional `method` (`password` by default, `ldap`, `email`, or `sms`), `code`, `captcha`, and `expectedUserId`. Use `password: ''` and pass `code` for OTP sign-in. | `HaiResult` containing the IAM authentication data after the local save. | `await actions.login({ identifier, password })` |
| `actions.register(input)` | Register an account and save its credentials. | `username`, `password`, optional `email`, `phone`, `displayName`, `metadata`, and `captcha`. | `HaiResult` containing the IAM authentication data after the local save. | `await actions.register({ username, password })` |
| `actions.sendOtp(identifier, options?)` | Request an email or SMS code for the address or number supplied. | `identifier` and optional `{ captcha }`. | `HaiResult` containing `expiresAt`. | `await actions.sendOtp(identifier)` |
| `actions.requestPasswordReset(identifier, options?)` | Request a reset for the supplied account identifier. | `identifier` and optional `{ captcha }`. | `HaiResult<void>`. | `await actions.requestPasswordReset(identifier)` |
| `actions.confirmPasswordReset(token, newPassword)` | Set a new password using the server-issued reset token. | Required reset `token` and `newPassword`. | `HaiResult<void>`. | `await actions.confirmPasswordReset(token, newPassword)` |
| `actions.renewPassword(input)` | Change the initial or expired password. | `identifier`, `password`, `newPassword`, optional `captcha`. | `HaiResult<void>`. Sign in again when required by the application flow. | `await actions.renewPassword({ identifier, password, newPassword })` |
| `actions.reauthenticate(password, operation)` | Verify the current password for one protected operation. | Current `password` and the service's exact `operation` identifier. | `HaiResult` containing `ticket` and `expiresAt`. | `await actions.reauthenticate(password, operation)` |
| `actions.bindPageExit(options?)` | Bind the current layout lifetime to browser page exit. | Optional `{ enabled }`, off when omitted. Use the public policy's `session.endOnPageHide`. | A cleanup function. The handler ignores page-cache transitions and sends a best-effort server session close with `keepalive: true` and `autoRefresh: false`. | `const unbind = actions.bindPageExit({ enabled })` |

For explicit sign-out, call `client.iam.auth.logout({})`, inspect its result, then call `await client.auth.clear()` when ending the local session. If remote sign-out fails and the user still leaves locally, report that the remote session was unconfirmed. Leaving a page uses `closeSession` so a delayed page-exit request cannot clear a newer login cookie. Call the cleanup returned by `bindPageExit` when the layout is destroyed.

For a sensitive request, supply a proof by using `context.reauthentication` or prompt via `context.reauthorize`. Keep the proof scoped to the operation that requested it. For example, Serv uses the operation identifier `iam.users.delete` for user deletion. See [request options](#request-options) for callback outcomes.

<a id="scenario-drive-authentication-forms"></a>

#### Scenario: Submit a password sign-in form

A browser app uses the standard IAM handlers and a ready client configured for browser cookies. The sign-in form selects an enabled method from the public policy and supplies the solved challenge when the policy requires it. The application owns the shared client's lifetime.

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'
import { apiClient } from '@h-ai/api-client'

export async function submitPassword(
  client: ApiClient<{ iam: typeof apiContract.iam }>,
  identifier: string,
  password: string,
  captcha?: string,
) {
  const actions = apiClient.createAuthActions(client)
  const result = await actions.login({ identifier, password, captcha })
  if (!result.success)
    return { ok: false as const, error: result.error }
  return { ok: true as const, user: result.data.user }
}
```

When the result succeeds, use the returned user to enter the signed-in view. On failure, keep the form available and show the returned error. A rejected custom storage write should be handled by the form's error boundary.

<a id="request-options"></a>

### Control one request with `client.<domain>.<group>.<operation>(input, options?)`

Set a cancellation signal, supply proof for a sensitive operation, or adjust refresh for a single call.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `procedure(input, options?)` | Set options for one business request. | The contract's input followed by optional request options. | The contract's response, or a client failure. | `await client.iam.users.list({ page: 1 }, { signal })` |

##### Per-call request options

Pass the options after the procedure input. For a procedure without input, pass `undefined` first, as in `client.iam.auth.currentUser(undefined, { signal })`.

| Field | Type and default | Effect |
| --- | --- | --- |
| `signal` | Optional `AbortSignal`. | Cancels this caller's request, wait for authentication recovery, or active stream. Other callers can continue using a shared refresh. |
| `lastEventId` | Optional `string`. | Supplies the last processed event ID for SSE resumption on routes that support it. |
| `context.autoRefresh` | Optional `boolean`. Normal refresh policy applies when omitted. | Pass `false` to suppress automatic credential refresh for the call. The current request still uses available credentials. |
| `context.keepalive` | Optional `boolean`. | Requests Fetch keepalive for a short browser request, for example during page exit. Delivery depends on the browser. |
| `context.reauthentication` | Optional `string`. | Sends IAM's `ticket` in `X-Hai-Reauthentication` for the operation the server named. |
| `context.reauthorize` | Optional `() => Promise<string \| null \| undefined>`. | Can obtain fresh proof for an eligible retry. Return a ticket, `null` to cancel, or `undefined` to continue without a new ticket. |

#### Scenario: Cancel a profile read when leaving the page

An authenticated view uses a ready IAM client and supplies its page lifetime signal. Its cleanup calls the abort function to stop waiting for the read.

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'

export function startProfileRead(client: ApiClient<{ iam: typeof apiContract.iam }>) {
  const controller = new AbortController()
  // Read the signed-in user's profile with a signal managed by this view.
  async function read() {
    const result = await client.iam.auth.currentUser(undefined, { signal: controller.signal })
    if (!result.success)
      return { ok: false as const, error: result.error }
    return { ok: true as const, user: result.data }
  }
  return { result: read(), cancel: () => controller.abort() }
}
```

Render the user or the error while the view is active. When the view has gone away, abort and discard its result. The client remains owned by the application.

<a id="request-authorization"></a>

#### Scenario: Check identity and access before calling a protected operation

**Authentication** establishes who made the request. The client sends the Bearer token it obtained at sign-in or refresh, and IAM verifies the current session at the server. A protected request can return HTTP 401 for a missing, expired, or invalid session. The client can try refresh for an eligible authentication failure. If the final result still reports 401, follow the application's sign-in flow.

**Authorization** determines whether that verified session can execute this operation on this resource. For example, the service can require `user:list` for a user listing and independently check that a report belongs to the requester's permitted organization. Call `client.iam.auth.currentUser()` to read the current user's `roles` and `permissions` for rendering menus and controls. Serv or Kit and the application handler enforce authorization on every request. A valid session with insufficient permission or resource access normally receives HTTP 403. Display the denial and retain its public error for diagnostics. Automatic refresh applies to eligible authentication failures.

For an operation that requires fresh password verification in addition to authorization, call `actions.reauthenticate(password, operation)` and pass the returned `data.ticket` as `context.reauthentication` on that operation. For example, use the exact server operation name `iam.users.delete` when deleting a user on the standard Serv endpoint. The ticket proves a fresh check for that operation. The server still verifies the session and authorizes the target. [Sensitive user deletion](#scenario-confirm-a-protected-user-deletion) · [Serv authentication](serv.en.md#authentication) · [Kit authorization guards](kit.en.md#auth) · [IAM authorization](iam.en.md#authorization)

<a id="iam-requests"></a>
<a id="call-identity-and-administration-apis-apiclientiam"></a>

### Call identity and session procedures with `client.iam.auth`

Use a client whose contract contains `apiContract.iam`. These methods call the mounted service directly and accept [per-call request options](#request-options). Form helpers handle credential persistence and selection between sign-in procedures. The service evaluates the caller's identity and access for protected procedures.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `auth.publicConfig(input?, options?)` | Read the public authentication policy. | Omit the input or pass `undefined` before options. | `HaiResult`, with nullable policy data. | `await client.iam.auth.publicConfig()` |
| `auth.createCaptcha(input, options?)` | Create an authentication challenge. | `{ operation }`. | `HaiResult` containing the challenge. | `await client.iam.auth.createCaptcha({ operation: 'login' })` |
| `auth.login(input, options?)` | Sign in with a password. | `identifier`, `password`, optional `captcha` and `expectedUserId`. | `HaiResult` containing user and credentials. | `await client.iam.auth.login({ identifier, password })` |
| `auth.loginWithLdap(input, options?)` | Sign in through LDAP. | `username`, `password`, optional `captcha` and `expectedUserId`. | `HaiResult` containing user and credentials. | `await client.iam.auth.loginWithLdap({ username, password })` |
| `auth.loginWithOtp(input, options?)` | Sign in using a delivered code. | `identifier`, `code`, optional `captcha` and `expectedUserId`. | `HaiResult` containing user and credentials. | `await client.iam.auth.loginWithOtp({ identifier, code })` |
| `auth.register(input, options?)` | Register and start an IAM session. | `username`, `password`, optional `email`, `phone`, `displayName`, `metadata`, and `captcha`. | `HaiResult` containing user and credentials. | `await client.iam.auth.register({ username, password })` |
| `auth.sendOtp(input, options?)` | Request delivery of an OTP. | `identifier` and optional `captcha`. | `HaiResult` containing `expiresAt`. | `await client.iam.auth.sendOtp({ identifier })` |
| `auth.requestPasswordReset(input, options?)` | Start password reset. | `identifier` and optional `captcha`. | `HaiResult<void>`. | `await client.iam.auth.requestPasswordReset({ identifier })` |
| `auth.confirmPasswordReset(input, options?)` | Finish password reset. | `token` and `newPassword`. | `HaiResult<void>`. | `await client.iam.auth.confirmPasswordReset({ token, newPassword })` |
| `auth.renewPassword(input, options?)` | Replace an initial or expired password. | `identifier`, `password`, `newPassword`, optional `captcha`. | `HaiResult<void>`. | `await client.iam.auth.renewPassword({ identifier, password, newPassword })` |
| `auth.logout(input, options?)` | End the current session and clear service-set cookies. | Optional `accessToken` inside the input object. | `HaiResult<void>`. | `await client.iam.auth.logout({})` |
| `auth.closeSession(input, options?)` | Revoke a departing session for the page-exit flow. | Optional `accessToken` inside the input object. | `HaiResult<void>`. A newer browser login cookie is preserved. | `await client.iam.auth.closeSession({})` |
| `auth.refresh(input, options?)` | Exchange a refresh credential explicitly. | Required `refreshToken` inside the input object. | `HaiResult` containing the renewed credentials. | `await client.iam.auth.refresh({ refreshToken })` |
| `auth.currentUser(input?, options?)` | Read the current identity and access scope. | Omit the input or pass `undefined` before options. | `HaiResult` containing the user record with `roles` and `permissions` arrays. | `await client.iam.auth.currentUser()` |
| `auth.changePassword(input, options?)` | Change the authenticated user's password. | `oldPassword` and `newPassword`. | `HaiResult<void>`. | `await client.iam.auth.changePassword({ oldPassword, newPassword })` |
| `auth.updateCurrentUser(input, options?)` | Edit the caller's profile. | Optional `username`, `displayName`, `avatarUrl`, `email`, `phone`, and `metadata`. | `HaiResult` containing the updated user. | `await client.iam.auth.updateCurrentUser({ displayName })` |
| `auth.reauthenticate(input, options?)` | Obtain proof for a sensitive operation. | `password` and `operation`. | `HaiResult` containing the short-lived proof. | `await client.iam.auth.reauthenticate({ password, operation })` |

<a id="logout"></a>

#### Scenario: Sign out of the current session

Use the signed-in IAM client to request service logout, then clear local credentials. If the service returns a failure, the local sign-out can complete while revocation of the remote session remains unconfirmed.

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'

export async function signOut(client: ApiClient<{ iam: typeof apiContract.iam }>) {
  // Revoke the current session at the service. A failed result leaves remote sign-out unconfirmed.
  const result = await client.iam.auth.logout({}, { context: { autoRefresh: false } })
  // End the local session. A storage failure rejects this operation.
  await client.auth.clear()
  if (!result.success)
    return result
  return result
}
```

The browser can then return to the sign-in view. Keep local and remote failure state distinct if the action only completes in one place.

<a id="iam-admin-inputs"></a>

### Manage users, roles and permissions with `client.iam`

Use the IAM administration groups with a caller that holds the relevant server permissions. Each procedure accepts optional [per-call request options](#request-options).

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `users.list(input, options?)` | Search and page through users. | Pagination and filters described below. | `HaiResult` containing a page of users. | `await client.iam.users.list({ page: 1, pageSize: 20 })` |
| `users.get(input, options?)` | Find a user by ID. | `{ id }`. | `HaiResult` containing a user or `null`. | `await client.iam.users.get({ id })` |
| `users.create(input, options?)` | Create a user with supplied initial credentials. | Required `username` and `password`, plus optional profile and account fields. | `HaiResult` containing the created user. | `await client.iam.users.create({ username, password })` |
| `users.invite(input, options?)` | Create a user with a one-time setup invitation. | Required `username`, plus optional account and profile fields. `accountStatus` may only be `active`. | `HaiResult` containing the invited user. | `await client.iam.users.invite({ username, email })` |
| `users.update(input, options?)` | Edit user details, status, or roles. | Required `id`, plus optional fields described below. | `HaiResult` containing the updated user. | `await client.iam.users.update({ id, displayName })` |
| `users.delete(input, options?)` | Delete a user. | `{ id }`. | `HaiResult<void>`. | `await client.iam.users.delete({ id })` |
| `users.resetPassword(input, options?)` | Reset a user's password administratively. | `id` and `newPassword`. | `HaiResult<void>`. | `await client.iam.users.resetPassword({ id, newPassword })` |
| `roles.list(input?, options?)` | Read the role list. | Omit the input or pass `undefined` before options. | `HaiResult` containing a page of roles. | `await client.iam.roles.list()` |
| `roles.get(input, options?)` | Find a role by ID. | `{ id }`. | `HaiResult` containing a role or `null`. | `await client.iam.roles.get({ id })` |
| `roles.create(input, options?)` | Create a role. | `code`, `name`, optional `description` and `isSystem`. | `HaiResult` containing the created role. | `await client.iam.roles.create({ code, name })` |
| `roles.update(input, options?)` | Edit a role's name or description. | `id`, optional `name` and `description`. | `HaiResult` containing the updated role. | `await client.iam.roles.update({ id, name })` |
| `roles.delete(input, options?)` | Delete a role. | `{ id }`. | `HaiResult<void>`. | `await client.iam.roles.delete({ id })` |
| `permissions.list(input, options?)` | Search and page through permissions. | Pagination, optional `search` and `type`. | `HaiResult` containing a page of permissions. | `await client.iam.permissions.list({ type: 'api' })` |
| `permissions.get(input, options?)` | Find a permission by ID. | `{ id }`. | `HaiResult` containing a permission or `null`. | `await client.iam.permissions.get({ id })` |
| `permissions.create(input, options?)` | Create a permission. | `code`, `name`, optional `description`, `resource`, `action`, `type`, and `sensitiveOperations`, which defaults to `[]`. | `HaiResult` containing the created permission. | `await client.iam.permissions.create({ code, name })` |
| `permissions.setSensitiveOperations(input, options?)` | Replace a permission's sensitive operation list. | `id` and `sensitiveOperations`, up to 1,000 identifiers. | `HaiResult<void>`. | `await client.iam.permissions.setSensitiveOperations({ id, sensitiveOperations })` |
| `permissions.delete(input, options?)` | Delete a permission. | `{ id }`. | `HaiResult<void>`. | `await client.iam.permissions.delete({ id })` |

##### IAM administration fields

| Input | Fields and defaults |
| --- | --- |
| `users.list` | `page` starts at 1 and defaults to 1. `pageSize` defaults to 20 and is capped at 100. Optional `search`, `roleCode`, `accountStatus` (`active`, `dormant`, `closed`), `sortBy` (`username`, `email`, `displayName`, `accountStatus`, `createdAt`), and `sortDirection` (`asc` or `desc`). |
| `users.create` and `users.invite` | Optional `email`, `phone`, `displayName`, `metadata`, `roleIds`, `accountType` (`permanent` or `temporary`), `accountStatus`, and `accountExpiresAt`. Create accepts `password`. Invitation uses a one-time setup flow and accepts only `active` for `accountStatus`. |
| `users.update` | Required `id`. Optional `username`, `email`, `phone`, `displayName`, `avatarUrl`, `metadata`, `roleIds`, `accountType`, `accountStatus`, and `accountExpiresAt`. Pass `null` for `accountExpiresAt` to remove a stored expiry when allowed by IAM. |
| `permissions.list` and `permissions.create` | `type` is `menu`, `api`, or `button`. List accepts the common pagination fields. |

<a id="scenario-call-identity-and-administration-apis"></a>

#### Scenario: List users assigned to an administrative role

Pass an already initialized IAM client with permission to list users. The application supplies the signal to cancel the view's request. Inspect the result before reading the current page.

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'

export async function listAuditors(
  client: ApiClient<{ iam: typeof apiContract.iam }>,
  signal?: AbortSignal,
) {
  const result = await client.iam.users.list({
    page: 1,
    pageSize: 20,
    roleCode: 'auditor',
    sortBy: 'username',
    sortDirection: 'asc',
  }, { signal })
  if (!result.success)
    return { ok: false as const, error: result.error }
  return { ok: true as const, page: result.data }
}
```

Render the returned page or display the failure. The application that provided the client closes it at the end of its lifetime.

#### Scenario: Confirm a protected user deletion

In an authorized Serv administration view, take the target ID from a successful list response and ask for the signed-in operator's current password. Obtain a proof for `iam.users.delete` and attach the returned ticket only to that call.

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'
import { apiClient } from '@h-ai/api-client'

export async function deleteUser(
  client: ApiClient<{ iam: typeof apiContract.iam }>,
  id: string,
  password: string,
) {
  // Ask IAM for a single-operation proof. A failure stops before attempting deletion.
  const proof = await apiClient.createAuthActions(client).reauthenticate(password, 'iam.users.delete')
  if (!proof.success)
    return { ok: false as const, error: proof.error }

  // Delete the selected user using this proof. The result says whether the service accepted it.
  const deleted = await client.iam.users.delete({ id }, { context: { reauthentication: proof.data.ticket } })
  if (!deleted.success)
    return { ok: false as const, error: deleted.error }
  return { ok: true as const, id }
}
```

In the source, follow the `headers` callback in `buildRawClient()` in `packages/api-client/src/api-client-link.ts`, the `users.delete` handler and `sensitive()` in `packages/serv/src/features/serv-feature-iam.ts`, and `checkSensitiveOperation()` in `packages/iam/src/authn/iam-authn-functions.ts`. In Kit, `requireSensitive()` in `packages/kit/src/guards/kit-sensitive.ts` reads the header.

Check the returned result before removing that user from the view. The application's initialized client stays available to reload the list.

<a id="business-requests"></a>
<a id="storage-requests"></a>
<a id="call-file-and-ai-apis-apiclientstorage-apiclientai"></a>

### Access object storage with `client.storage`

Use the Storage branch to request signed URLs or operate on object metadata. The service must mount the Storage routes and authorize the requested object key. Each procedure accepts optional [per-call request options](#request-options).

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `presignedUrls.createUpload(input, options?)` | Obtain a temporary object upload URL. | `key`, optional `contentType` and `expiresIn` (1–604,800 seconds). The standard service defaults to `application/octet-stream` and 900 seconds. | `HaiResult` containing the signed URL, object key, and optional expiry. | `await client.storage.presignedUrls.createUpload({ key, contentType: 'application/pdf' })` |
| `presignedUrls.createDownload(input, options?)` | Obtain a temporary object download URL. | `key` and optional `expiresIn` (1–604,800 seconds). The standard service defaults to 900 seconds. | `HaiResult` containing the signed URL, object key, and optional expiry. | `await client.storage.presignedUrls.createDownload({ key, expiresIn: 60 })` |
| `files.list(input, options?)` | List file metadata under a prefix. | Pass an object, using `{}` for default listing. Optional `prefix`, `maxKeys` (1–1,000), `delimiter`, and `continuationToken` from the previous page. | `HaiResult` containing files and pagination information. | `await client.storage.files.list({ prefix: 'reports/', maxKeys: 20 })` |
| `files.getMetadata(input, options?)` | Read metadata for a known object key. | `{ key }` for an object the caller may read. | `HaiResult` containing size, content type, and other metadata. | `await client.storage.files.getMetadata({ key })` |
| `files.delete(input, options?)` | Delete an object. | `{ key }` for an object the caller may delete. | `HaiResult<void>`. | `await client.storage.files.delete({ key })` |
| `files.deleteMany(input, options?)` | Delete a batch of objects. | `{ keys }`, a nonempty array of up to 1,000 object keys. | `HaiResult` containing deletion progress. A partial failure can include the same structure in `error.ext.deleteMany`. | `await client.storage.files.deleteMany({ keys: [key] })` |

Use the returned URL directly for the object transfer. For a signed upload, use the signed method and matching content type. The signing procedure and the object transfer have separate outcomes.

<a id="scenario-call-file-and-ai-apis"></a>

#### Scenario: Upload a PDF with a signed URL

Use an initialized Storage client whose credentials can upload to the requested key. Take the key from the application's object naming policy, for example a report uploaded under `reports/`. Supply the PDF picked in the form. The signed object host must allow the application's upload origin.

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'

export async function uploadReport(
  client: ApiClient<{ storage: typeof apiContract.storage }>,
  key: string,
  file: File,
) {
  const contentType = 'application/pdf'
  if (file.type !== contentType)
    return { ok: false as const, stage: 'file' as const }

  // Ask the service to authorize this PDF key and sign its upload for 60 seconds.
  const signed = await client.storage.presignedUrls.createUpload({ key, contentType, expiresIn: 60 })
  if (!signed.success)
    return { ok: false as const, stage: 'signing' as const, error: signed.error }

  // Send the file to object storage with the same content type used for signing.
  const uploaded = await fetch(signed.data.url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  })
  if (!uploaded.ok)
    return { ok: false as const, stage: 'upload' as const, status: uploaded.status }

  return { ok: true as const, key: signed.data.key }
}
```

Show the returned key after Storage accepts the upload. Handle a rejected Fetch promise as a transfer failure and request a new URL if the signature has expired. The application owns the initialized client.

<a id="ai-requests"></a>

### Call chat, memory and session procedures with `client.ai`

Use the AI branch on a service that mounts the AI routes. Each procedure accepts optional [per-call request options](#request-options).
The default AI client returns JSON. Use the [optional HTTP contracts](#http-contract-extensions) for streamed replies and media.


#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `chats.createCompletion(input, options?)` | Request a non-streaming chat completion. | Required nonempty `messages`. Generation controls, tools, and ownership fields follow. | `HaiResult` containing completion choices and model metadata. | `await client.ai.chats.createCompletion({ messages: [{ role: 'user', content: 'Hello' }] })` |
| `chats.sendMessage(input, options?)` | Send one message to a session. | `message`, optional `sessionId` (defaults to `default`), `objectId`, `systemPrompt`, `model`, and `temperature` (0–2). | `HaiResult` containing reply content, model, and optional usage. | `await client.ai.chats.sendMessage({ message, sessionId })` |
| `chats.listHistory(input, options?)` | Read the history of a session. | `sessionId`, optional `objectId`, `limit` (1–200), and `order` (`asc` or `desc`). | `HaiResult` containing chat records. | `await client.ai.chats.listHistory({ sessionId, limit: 20 })` |
| `memories.recall(input, options?)` | Search for memories by query. | `query`, optional `topK` (at least 1), `types`, `minImportance` (0–1), and `objectId`. | `HaiResult` containing matching memories. | `await client.ai.memories.recall({ query: 'preferred language', topK: 3 })` |
| `memories.list(input, options?)` | List memories for an authorized owner. | Pass an object, using `{}` for defaults. Optional `types`, `objectId`, zero-based `offset`, and `limit` (1–100). | `HaiResult` containing memory entries. | `await client.ai.memories.list({ limit: 20 })` |
| `sessions.list(input, options?)` | List AI sessions. | Pass `{}` for the signed-in owner, or supply an authorized `objectId`. | `HaiResult` containing session entries. | `await client.ai.sessions.list({})` |

<a id="ai-input-fields"></a>

##### Chat completion request fields

| Field | Usage and defaults |
| --- | --- |
| `messages` | Required nonempty list of `system`, `user`, `assistant`, or `tool` messages. Text content can be a string or a list of `{ type: 'text', text }` parts. Only user messages accept `image_url` parts with `{ url, detail? }`. `detail` can be `auto`, `low`, or `high`. |
| `messages[].tool_calls` and `messages[].tool_call_id` | An assistant function call has `id`, `type: 'function'`, `function.name`, and a JSON string `function.arguments`. An assistant message without content needs at least one call. A tool message requires the original call ID. |
| `objectId`, `sessionId`, `model` | Optional owner, session, and model. Omission uses the authenticated owner, session `default`, and the server's model settings. The service must authorize cross-owner access. |
| `temperature`, `top_p`, `max_tokens` | Optional temperature (0–2), sampling probability (0–1), and positive integer token limit. Omission uses the model settings. |
| `tools` and `tool_choice` | An optional nonempty tool list. Each tool has `type: 'function'` and `function.name`, with optional description, JSON Schema parameters, and strict mode. Choice accepts `auto`, `none`, `required`, or `{ type: 'function', function: { name } }`. Required or named selection needs corresponding tools. |

#### Scenario: Send a new message in the selected conversation

Use an initialized AI client and the session ID for the selected conversation. The signed-in user must have access to that session.

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'

export async function sendChatMessage(
  client: ApiClient<{ ai: typeof apiContract.ai }>,
  sessionId: string,
  message: string,
  signal?: AbortSignal,
) {
  // Send the user's text to this session. Failure leaves the submitted text available to the caller.
  const result = await client.ai.chats.sendMessage({ sessionId, message }, { signal })
  if (!result.success)
    return { ok: false as const, error: result.error }
  return { ok: true as const, content: result.data.content }
}
```

Render the returned text on success. The application owns the initialized client and can cancel the call through the supplied signal.

<a id="encrypted-requests"></a>

### Encrypt client requests with `client.init({ transport })`

Enable application-layer transport encryption on the server first. Initialize a client with a matching key exchange path and an initialized `@h-ai/crypto` instance. This setting protects requests made by that client.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `client.init(config)` | Attach the transport manager to this client. | Set `baseUrl` and the transport options below. | `HaiResult<void>`. The client prepares local state at initialization and exchanges keys when a request needs a session. | `await client.init({ baseUrl, transport: { crypto } })` |

##### Encrypted transport options

| Field | Type and default | Effect |
| --- | --- | --- |
| `transport.crypto` | Required initialized `CryptoFunctions` when transport is enabled. | Creates this client's transport session. |
| `transport.keyExchangePath` | Optional string relative to `baseUrl`. Default `/_hai/key-exchange`. | Must resolve to the service's key exchange endpoint. |
| `transport.maxPlaintextBytes` | Optional number in bytes. The client uses the server value when omitted. | An explicit client cap takes the smaller of the local and negotiated plaintext limits. |

#### Scenario: Enable transport encryption

On the test server, mount the standard IAM routes under `/api/v1` and configure `serv.createApp({ transport: { crypto, serverKeyRing, keyStore } })`. Run this example where the module-level `crypto` belongs to the example and is available to initialize and close. Pass the actual HTTPS API address to `loadEncryptedAuthPolicy`. This call uses the transport options above to prepare a session and read the public IAM configuration.

```sh
pnpm add @h-ai/api-client @h-ai/api-contract @h-ai/crypto
```

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { crypto } from '@h-ai/crypto'

export async function loadEncryptedAuthPolicy(baseUrl: string) {
  // The example owns Crypto. Failed initialization stops before making a client request.
  const initialized = await crypto.init()
  if (!initialized.success)
    throw new Error(initialized.error.message)

  const contract = apiContract.create({ iam: apiContract.iam })
  const client = apiClient.create(contract)
  try {
    // The default key exchange endpoint is POST /api/v1/_hai/key-exchange on this server.
    const ready = await client.init({ baseUrl, transport: { crypto } })
    if (!ready.success)
      throw new Error(ready.error.message)

    // This first request performs key exchange and reads the policy. Success may contain null.
    const result = await client.iam.auth.publicConfig()
    if (!result.success)
      throw new Error(result.error.message)
    return result.data
  }
  finally {
    try {
      await client.close()
    }
    finally {
      await crypto.close()
    }
  }
}
```

Use HTTPS to authenticate the service that responds to the key exchange. For browser calls to another origin, allow `X-Client-Id`, `X-Hai-Transport`, and `X-Encrypted` in request headers and expose `X-Encrypted` and `X-Hai-Transport` in response headers in the server's CORS settings. The service continues to apply IAM authorization and negotiated body limits.

<a id="plain-https-requests"></a>

<a id="scenario-call-a-route-that-accepts-ordinary-https"></a>

#### Scenario: Read the health endpoint over HTTPS

Configure the server route with `encryption: 'disabled'` or use server-side `transport.excludePaths` for a path without a required encryption rule. The list matches an exact path and its descendants. For a typed route, use a separate client initialized with the ordinary HTTPS settings. The encrypted client sends transport headers on its requests.

Configure the Serv health endpoint at `/health` and include `/health` in the server's `transport.excludePaths` for this integration. Pass the service's origin, before any API mount prefix.

```ts
export async function checkHealth(origin: string) {
  // This service exposes /health over ordinary HTTPS. Its expected JSON payload is { status: 'ok' }.
  const response = await fetch(new URL('/health', origin))
  if (!response.ok)
    throw new Error('Health check failed with HTTP ' + response.status)
  return response.json()
}
```

The health request uses the server's HTTPS policy for that route. A route requiring encrypted transport needs the encrypted instance.

<a id="http-contract-extensions"></a>

### Enable optional HTTP contracts

Pass the current session access token and the user’s question to `streamAnswer`. Append each text delta to the answer and abort on page exit. An HTTP failure before the stream opens returns a failure result. An error after streaming starts rejects the iterator. Use the [HTTPS route mounted by Serv](serv.en.md#http-contract-extensions).

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

const { streamCompletion } = apiContract.extensions.ai.chats
const contract = apiContract.create({ ai: { chats: { streamCompletion } } })

export async function streamAnswer(
  accessToken: string,
  question: string,
  onText: (text: string) => void,
  signal: AbortSignal,
) {
  const client = apiClient.create(contract)
  const initialized = await client.init({
    baseUrl: 'https://api.example.com/api/v1',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!initialized.success)
    throw new Error(initialized.error.message)

  try {
    const events = await client.ai.chats.streamCompletion({
      messages: [{ role: 'user', content: question }],
    }, { signal })
    if (!(Symbol.asyncIterator in events))
      throw new Error(events.error.message)

    for await (const event of events) {
      if (event.type === 'done')
        break
      for (const { delta } of event.choices) {
        if (delta.content)
          onText(delta.content)
      }
    }
  }
  finally {
    await client.close()
  }
}
```

[Endpoints and fields](api-contract.en.md#http-contract-extensions)

<a id="transport-observation"></a>
<a id="encrypt-transport-and-observe-outcomes-apiclient"></a>

### Observe request outcomes with `client.observeRequests`

Use observations to match a failure to its procedure, elapsed time, and request ID. Refresh or replay can contribute additional attempts to the same logical call. The final record includes the method and sanitized URL only when available. The URL retains the actual request path and omits its query and fragment. Record handling should account for identifiers that the application places in a path. Fields exclude request and response bodies and headers.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `client.observeRequests(observer)` | Subscribe to settled logical request outcomes. | Required synchronous `observer(record: ApiRequestRecord)`. | Unsubscribe function. Close also removes subscriptions. Observer errors do not alter the request result. | `const unsubscribe = client.observeRequests(record => collect(record))` |

The record has `requestId`, `procedure`, `timestamp` (Unix milliseconds), `duration` (milliseconds), `success`, and `attempts`. It may also contain `errorCode`, `method`, `url`, and HTTP `status`. A request with zero attempts or no available HTTP response can omit `status`. An HTTP 200 carrying a failed `HaiResult` reports `success: false`. For a stream, the outcome describes stream setup.

<a id="scenario-encrypt-transport-and-observe-outcomes"></a>

#### Scenario: Capture the outcome of a public policy request

Use a ready IAM client pointing to a service that mounts the public policy route. Collect the emitted summaries with the function below. The application owns the existing client.

```ts
import type { ApiClient, ApiRequestRecord } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'

export async function inspectPolicyRequest(client: ApiClient<{ iam: typeof apiContract.iam }>) {
  const records: ApiRequestRecord[] = []
  const unsubscribe = client.observeRequests(record => { records.push(record) })
  try {
    // Keep the observed records for either a successful policy read or a request failure.
    const result = await client.iam.auth.publicConfig()
    if (!result.success)
      return { ok: false as const, error: result.error, records }
    return { ok: true as const, policy: result.data, records }
  }
  finally {
    unsubscribe()
  }
}
```

When the client is shared, the subscription also receives other procedures that settle during its lifetime. Use `procedure` or `requestId` to find the relevant record.

<a id="custom-business-client"></a>

### Call a custom protected POST with `apiClient.create(contract)`

Place the report contract in a file shared by the server and browser. It defines how the client calls the endpoint. The deployment mounts the same method, path, and contract at its API prefix and uses IAM to authenticate the user. The export handler checks permission to export the requested report before creating an export.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `client.reports.exports.create(input, options?)` | Request a report export. | Required `reportId` from the report being displayed and `format` from the user's choice, `pdf` or `csv`. | `HaiResult<{ exportId: string }>`. A denied result retains the service error or maps HTTP 403 to `FORBIDDEN`. | `await client.reports.exports.create({ reportId: 'r-42', format: 'pdf' })` |

#### Scenario: Export a report the signed-in caller is allowed to access

Install `zod` as a direct dependency with `pnpm add zod`. Use the same client for the IAM sign-in procedure and the custom report call. This example uses the [browser cookie setup](#browser-refresh). Mount `POST /api/v1/reports/{reportId}/exports` on Serv or a `POST` handler under `src/routes/api/v1/reports/[reportId]/exports/+server.ts` on Kit. Bind the Serv operation to `reports.exports.create`. For a Kit handler, validate the path and JSON body with the corresponding fields from the shared schema. Derive identity from the verified session and check access to that specific `reportId`. [Mount in Serv](api-contract.en.md#use-with-serv) · [Mount in Kit](api-contract.en.md#use-with-kit)

```ts
import { apiClient, type IamAuthLoginInput } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

export const ExportReportInput = z.object({
  reportId: z.string().min(1),
  format: z.enum(['pdf', 'csv']),
})

export const reportContract = {
  iam: apiContract.iam,
  reports: {
    exports: {
      create: apiContract.route({
        method: 'POST',
        path: '/reports/{reportId}/exports',
        operationId: 'reports.exports.create',
      }).input(ExportReportInput).output(apiContract.haiResultSchema(z.object({
        exportId: z.string(),
      }))),
    },
  },
}

export async function exportReport(
  baseUrl: string,
  credentials: IamAuthLoginInput,
  input: z.input<typeof ExportReportInput>,
) {
  const client = apiClient.create(reportContract)
  const ready = await client.init({ baseUrl, auth: {} })
  if (!ready.success)
    return { status: 'initialization-failed' as const, error: ready.error }

  try {
    // IAM authenticates the form and the action stores the received credentials on this client.
    const signedIn = await apiClient.createAuthActions(client).login(credentials)
    if (!signedIn.success)
      return { status: 'sign-in-failed' as const, error: signedIn.error }

    // The contract supplies the URL template and JSON body mapping.
    const result = await client.reports.exports.create(input)
    if (!result.success) {
      return result.error.httpStatus === 403
        ? { status: 'forbidden' as const, error: result.error }
        : { status: 'request-failed' as const, error: result.error }
    }
    return { status: 'accepted' as const, exportId: result.data.exportId }
  }
  finally {
    await client.close()
  }
}
```

Pass `{ reportId: 'r-42', format: 'pdf' }` to send `POST /api/v1/reports/r-42/exports` with `{ "format": "pdf" }` as its JSON body. For a service fixture where the same verified user may export `r-42` but cannot access `r-99`, the former returns an export ID and the latter returns the `forbidden` branch. Use the ID to track the accepted export. The server issues the same authorization decision regardless of how the browser renders the button. Closing the client releases local runtime resources. Use [sign-out](#logout) to end the server session at the user's request.

<a id="custom-response-results"></a>
<a id="scenario-read-a-custom-value-and-an-sse-response"></a>

### Read custom JSON and SSE values

A typed client uses the output defined by each [custom contract](api-contract.en.md#use-with-client). Plain JSON and server-sent events can each return a client failure during the HTTP call or stream setup. Narrow the result before consuming the successful value. The client checks outputs when their Zod shapes can be converted to JSON Schema. An output mismatch returns `VALIDATION_FAILED`. Validation preserves wire values such as ISO date strings.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `client.count(input?, options?)` | Read a number from the custom contract below. | No input. Pass the optional page signal to cancel the response. | A number or a failed `HaiResult<never>`. | `await client.count(undefined, { signal })` |
| `client.events(input?, options?)` | Start the custom progress stream below. | No input. Pass the optional page signal to cancel the stream. | An async iterator or a failed `HaiResult<never>` during setup. Iteration can later reject. | `await client.events(undefined, { signal })` |

#### Scenario: Read initial progress and subscribe to updates

The example needs a service that mounts the shared routes in `progressContract` and returns a number from `/status/count` and events with a numeric `completed` field from `/status/events`. The application's initialized client uses that exact contract. Pass the page's cancellation signal and a callback that renders the current progress.

```sh
pnpm add @h-ai/api-client @h-ai/api-contract @orpc/contract zod
```

```ts
import type { ApiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { eventIterator } from '@orpc/contract'
import { z } from 'zod'

export const progressContract = {
  count: apiContract.route({ method: 'GET', path: '/status/count' }).output(z.number()),
  events: apiContract.route({ method: 'GET', path: '/status/events' })
    .output(eventIterator(z.object({ completed: z.number() }))),
}

export async function readProgress(
  client: ApiClient<typeof progressContract>,
  signal: AbortSignal,
  update: (completed: number) => void,
) {
  // The first call returns a bare number on success or a client failure before streaming.
  const count = await client.count(undefined, { signal })
  if (typeof count !== 'number')
    return { ok: false as const, error: count.error }
  update(count)

  // The second call returns an async iterator after setup. Check before consuming it.
  const events = await client.events(undefined, { signal })
  if (!(Symbol.asyncIterator in events))
    return { ok: false as const, error: events.error }
  for await (const event of events)
    update(event.completed)
  return { ok: true as const }
}
```

After setup, errors while reading an SSE stream can reject iteration. The caller handles that rejection and aborts its signal when the view is destroyed. Its client owner closes the instance when no other request needs it.

<a id="errors"></a>
<a id="error-handling"></a>

### Handle API failures with `HaiApiClientError`

Check `success` before reading `data` from a `HaiResult`. The client's error codes use the `hai:api-client:` prefix. A recognized service failure retains its business code and diagnostic trace ID when available. For a recognized failure in a non-2xx response body, the HTTP status takes precedence over the body status. Use the service module's error reference for those business codes.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `HaiApiClientError.<name>.code` | Identify a local client failure by its stable code. | A member listed below. | The machine-readable error code to compare with `result.error.code`. | `result.error.code === HaiApiClientError.TIMEOUT.code` |

##### Error codes

| Error constant | Code | Typical cause |
| --- | --- | --- |
| `NETWORK_ERROR` | `hai:api-client:001` | Fetch or the underlying transport failed. |
| `TIMEOUT` | `hai:api-client:002` | The request exceeded its deadline or aborted with `AbortError`. |
| `SERVER_ERROR` | `hai:api-client:003` | An unmapped HTTP or protocol error. |
| `UNAUTHORIZED` | `hai:api-client:004` | HTTP 401 without a recognized business error. |
| `FORBIDDEN` | `hai:api-client:005` | HTTP 403 without a recognized business error. |
| `NOT_FOUND` | `hai:api-client:006` | HTTP 404 without a recognized business error. |
| `VALIDATION_FAILED` | `hai:api-client:007` | HTTP 400 or 422 without a recognized business error, invalid response shape, or a client transport timestamp error. |
| `TOKEN_REFRESH_FAILED` | `hai:api-client:008` | Declared refresh error code. Automatic recovery generally returns the original request failure when it cannot retry. |
| `NOT_INITIALIZED` | `hai:api-client:010` | A procedure was called outside an initialized client lifetime. |
| `CONFIG_ERROR` | `hai:api-client:011` | Initialization failed or the instance was already ready. |
| `PAYLOAD_TOO_LARGE` | `hai:api-client:020` | HTTP 413 without a recognized business error, or a crypto plaintext limit was exceeded. |
| `UNKNOWN` | `hai:api-client:099` | An unexpected client procedure lookup failure. |

For support diagnostics, use the public error code and trace ID. The client logs 4xx failures and trace-correlated service failures at debug level. It logs other response and transport failures at error level. Sanitized diagnostic fields can include the transport code and server time, or the body limit, direction, and stage. Present the message appropriate for the user's action in the application and use the structured diagnostics for investigation.

#### Scenario: Handle a timed-out read

Pass an initialized IAM client. When a policy read times out, the caller can offer a fresh read. Preserve the original failure for diagnostics.

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'
import { HaiApiClientError } from '@h-ai/api-client'

export async function readPolicyStatus(client: ApiClient<{ iam: typeof apiContract.iam }>) {
  // A failed request exposes a public error. A successful response may contain an absent policy.
  const result = await client.iam.auth.publicConfig()
  if (!result.success) {
    return {
      ok: false as const,
      canRetry: result.error.code === HaiApiClientError.TIMEOUT.code,
      error: result.error,
    }
  }
  return { ok: true as const, policy: result.data }
}
```
