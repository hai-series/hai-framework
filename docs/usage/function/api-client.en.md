# @h-ai/api-client API Reference

[简体中文](api-client.md) · [日本語](api-client.ja.md)

Import `apiClient` to call the standard IAM, Storage, and AI endpoints. It is both the default client and the place to create a separate client. Use `apiClient.iam.auth.currentUser()` with the default client. In a snippet that declares `const client = apiClient.create(contract)`, `client` is the name given to that new instance. See [when to create a separate client](#client-lifecycle).

[Module README](../../../packages/api-client/README.en.md) · [Configuration](../configuration/api-client.en.md) · [Data structures](../data/api-client.en.md)

<a id="module-dependencies"></a>

## Dependencies

| Dependency | Purpose | When required | Setup order |
| --- | --- | --- | --- |
| `@h-ai/api-client` | Bind an HTTP client to the application contract. | Whenever an application calls typed endpoints. | Initialize the default client with the API address. |
| `@h-ai/api-contract` | Supply the same procedure definitions used by the server. | Install it explicitly when you create a client from an imported contract. | Select the server's domains before creating the client. |
| HTTP service and Fetch | Supply mounted routes and send HTTP requests. | The caller needs a matching Serv or SvelteKit service and a Fetch-compatible runtime. | Make the service available at its mounted prefix. Native bridges and test doubles can supply `fetch`. |
| `@h-ai/crypto` | Negotiate a transport session and encrypt requests. | Install and import it explicitly when the application enables [transport encryption](#encrypted-requests). | Initialize Crypto before the client. Close the client before closing Crypto. |

<a id="quick-start"></a>

## Minimal setup

### Installation

```sh
pnpm add @h-ai/api-client
```

<a id="example"></a>
### Sign in, read your profile, and sign out in a browser

This example connects a browser account page to the standard IAM routes at `/api/v1`. The web app and API share an origin. Mount the [standard IAM routes](api-contract.en.md#serv-iam-wiring) and enable the server's [refresh Cookie](serv.en.md#authentication) before running the example. Use a test account that can sign in to that server. The page submits the values from its form.

Put the following in the module that owns your browser app's account session, for example `src/lib/account-api.ts`. Call `startAccountSession()` once when the app starts. Pass a `showSignIn` function that displays the sign-in view when the refresh credential is gone.

```ts
import { apiClient, type IamAuthLoginInput } from '@h-ai/api-client'

export async function startAccountSession(showSignIn: () => void) {
  const ready = await apiClient.init({
    baseUrl: '/api/v1',
    auth: { onRefreshFailed: showSignIn },
  })
  if (!ready.success)
    return ready

  const defaultClient = apiClient
  const actions = apiClient.createAuthActions(defaultClient)
  return {
    success: true as const,
    data: {
      readSignInPolicy: () => apiClient.iam.auth.publicConfig(),
      // The login action saves credentials before the page asks for the profile.
      async signIn(input: IamAuthLoginInput) {
        const login = await actions.login(input)
        if (!login.success)
          return login
        return apiClient.iam.auth.currentUser()
      },
      // Use this when opening the profile page or restoring the view after reload.
      readProfile: () => apiClient.iam.auth.currentUser(),
      async signOut() {
        // Let the server revoke the session and expire the browser's refresh Cookie.
        try {
          return await apiClient.iam.auth.logout({}, { context: { autoRefresh: false } })
        }
        finally {
          await apiClient.auth.clear()
        }
      },
      close: () => apiClient.close(),
    },
  }
}
```

Check the startup result and use `data` when it succeeds. Connect `signIn(input)` to the form. A successful result contains the profile. On a business failure, use `error.message` and let the user try again. Connect `signOut()` to the sign-out button. The example clears the local credentials either way. Report a failed result as an unconfirmed server sign-out. Call `close()` when the whole browser app releases its client. Keep the app's client open as the user moves between pages.

If the sign-in page needs to know which forms to show, call `data.readSignInPolicy()` after startup. It sends `GET /api/v1/auth/config` without requiring sign-in. Check `success` before reading `data`. A successful response can have `data: null` when no public policy is available. [Public settings fields](../data/api-contract.en.md#public-settings)

<a id="api-reference"></a>

## Features

<a id="client-lifecycle"></a>
### Create an isolated client with `apiClient.create(contract)`

The imported `apiClient` already supports IAM, Storage, and AI. Both it and an instance returned by `apiClient.create(contract)` have `init`, `close`, `auth`, and the endpoints defined by their contract. If the contract includes IAM, either can call the same `iam.auth.currentUser()` endpoint.

Use the default instance for one browser app connected to one API. Create a separate instance when the contract is different, when the app connects to a second API, or when a server-side render needs to keep each incoming user's credentials separate. Each instance has its own authentication and observation state and can start its own encrypted session. An optional domain omitted from the contract is absent at runtime. Keep the top-level lifecycle member names and the promise key `then` available to the client.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `apiClient.create(contract)` | Create an isolated instance. | Required `contract`, the route object shared with the server, for example the object returned by `apiContract.create({ iam: apiContract.iam })`. | `ApiClient<TContract>`. Call `init` before making requests. | `apiClient.create(contract)` |

#### Scenario: Create a client for one server request

For example, an SSR route can create an IAM-only client for each incoming request. The [address example](#client-integration) shows how to create, configure, and close the instance. The [Node or native example](#manual-token-storage) signs in and reads the profile.

<a id="client-integration"></a>
### Configure the API address with `apiClient.init(config)`

Use `apiClient.init` for the default client, as in the browser example. A separate instance you create has the same lifecycle methods. Each client has its own API address and lifetime.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `apiClient.init(config)` | Prepare the default client. | Required `config` with `baseUrl`. Optional fields follow. | `Promise<HaiResult<void>>`. Invalid settings or a second initialization while ready return `CONFIG_ERROR`. | `await apiClient.init({ baseUrl: '/api/v1' })` |
| `apiClient.isInitialized` | Check readiness. | Read-only property. | `boolean`. | `apiClient.isInitialized` |
| `apiClient.config` | Inspect the effective settings. | Read-only property. Sensitive values are redacted. | Redacted snapshot or `null` outside an initialized lifetime. | `apiClient.config?.baseUrl` |
| `apiClient.close()` | End the client lifetime and release local resources. | No arguments. | `Promise<void>`. Clears listeners and destroys the client transport session. | `await apiClient.close()` |

<a id="call-options"></a>
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
### Choose credential storage and renew sign-in

`apiClient.auth` manages the tokens on the default client. `apiClient.iam.auth` calls IAM endpoints, such as the login and profile endpoints, on the server. Enable `auth` at startup to have the client attach the access token to requests and refresh it when appropriate. [Credential data and ownership](../data/api-client.en.md#browser-storage)

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `apiClient.tokenStorage.httpOnlyCookie()` | Create browser-oriented storage. | No arguments. This adapter is selected when `auth.storage` is omitted. | `TokenStorage`. Fetch includes the server-managed cookie. | `apiClient.tokenStorage.httpOnlyCookie()` |
| `apiClient.tokenStorage.memory()` | Create independent in-memory storage. | No arguments. Both token values start empty. | `TokenStorage`. Values are held by that instance only. | `apiClient.tokenStorage.memory()` |
| `apiClient.auth.setTokens(tokens)` | Commit credentials issued by the server. | Required `TokenPair`. `expiresIn` uses seconds. `refreshToken` is optional for cookie mode. | `Promise<void>`. Storage failure rejects. | `await apiClient.auth.setTokens(result.data.tokens)` |
| `apiClient.auth.clear()` | Clear local credentials and invalidate old refresh work. | No arguments. | `Promise<void>`. Storage failure rejects. Server logout remains a separate call. | `await apiClient.auth.clear()` |
| `apiClient.auth.onTokenRefreshed(callback)` | Subscribe to completed refresh writes. | Required synchronous `callback(tokens)`. | Unsubscribe function. Without `auth` the returned function is a no-op. | `apiClient.auth.onTokenRefreshed(tokens => updateLifetime(tokens.expiresIn))` |

<a id="storage-modes"></a>
##### Choose where the two tokens live

The access token goes into the `Authorization: Bearer …` header on protected API calls. The refresh token is used to get a new access token after the old one stops working. Here is where the built-in adapters keep each token.

| Question | `apiClient.tokenStorage.httpOnlyCookie()` | `apiClient.tokenStorage.memory()` |
| --- | --- | --- |
| Access token | In this adapter's JavaScript memory. | In this adapter's JavaScript memory. |
| Refresh token | In the browser's HttpOnly Cookie store. Frontend JavaScript cannot read the Cookie's value. | In this adapter's JavaScript memory. The API must issue it in the response body. |
| What the refresh endpoint receives | The browser attaches the Cookie to the refresh request. | The client passes the token in a JSON body as `{ refreshToken }`. |
| After a browser reload | The access token in memory is gone. If the browser still has a usable Cookie, an eligible 401 can trigger refresh and restore access. | Both tokens are gone. The app must obtain credentials again. |
| Where to use it | A browser app with server-side refresh Cookie support. Enable it with `auth: {}` or select it explicitly with `auth: { storage: apiClient.tokenStorage.httpOnlyCookie() }`. | An isolated Node.js job or SSR request, for example `auth: { storage: apiClient.tokenStorage.memory() }`. A new adapter starts empty each time. |

If you omit `auth` entirely, the client does not manage tokens. For a native app that should stay signed in across restarts, inject a platform secure store and configure the server to accept a refresh token in the JSON body. Each auth mode uses the matching channel on the server.

Call `apiClient.close()` to release the default client's runtime and refresh work. Call `apiClient.auth.clear()` while the client is initialized to remove the credentials it holds. If the adapter uses Cookie mode, local cleanup clears only the access token. The service's logout response expires the refresh Cookie.

<a id="cookie-credentials"></a>

##### What Fetch does with `credentials: 'include'`

In Cookie mode the client sets `credentials: 'include'` for you. When sign-in succeeds, the server replies with `Set-Cookie` so the browser can store the refresh token. On `POST /api/v1/auth/refresh`, the browser can send that Cookie back in the `Cookie` header, and the server can rotate it with a new `Set-Cookie`. When logout succeeds, the server sends `Set-Cookie` again with an expiration instruction. The browser handles this exchange, including the HttpOnly value, outside application JavaScript.

The flag lets Fetch use eligible Cookies even for a request to a different origin. An origin includes the scheme, host, and port. For instance, `https://app.example.com` and `https://api.example.com` are different origins. For a credentialed request, configure the API's CORS response to return the page's exact origin and allow credentials. The browser rejects `*` for those responses. The Cookie still has to match the destination and request under its domain, path, `Secure`, `SameSite`, and browser rules. Different origins can be on the same site. Serv uses `SameSite=Strict`, so a truly cross-site request cannot carry that Cookie just by setting `credentials: 'include'`. For a same-origin app such as the quick start, serve or proxy the API under the page's origin.

<a id="terminal-type"></a>

##### Which `terminalType` to set

Set `auth.terminalType` to describe where a login comes from. It goes in the `X-Hai-Terminal` request header. IAM uses it to place sessions in a group for login limits.

| Value | Example caller |
| --- | --- |
| `web` | A browser app. This is the default. |
| `app` | A native mobile app. |
| `desktop` | A desktop app. |
| `api` | A backend worker or service client. |

The same token storage can be used with different terminal groups. Server-side authentication establishes identity, and authorization policy determines permissions. With server settings such as `session.terminalLimits: { web: 2, app: 1 }`, a user can have up to two browser sessions and one mobile session, subject to the global session limit and single-device policy. With a nonempty list, unlisted groups such as `desktop` and `api` cannot open new sessions. At a group limit, `session.terminalLimitMode: 'reject'` (the default) refuses the new login. `'replace'` makes room by removing the earliest sessions of the same group in ordinary multi-device mode. An empty `terminalLimits` object disables per-group limits. [IAM session configuration](../configuration/iam.en.md#session)

##### Authentication options

| Field | Type and default | Effect |
| --- | --- | --- |
| `auth.storage` | Optional `TokenStorage`. Default `apiClient.tokenStorage.httpOnlyCookie()`. | See [where the tokens live](#storage-modes) before choosing. |
| `auth.terminalType` | `web`, `app`, `desktop`, or `api`. Default `web`. | Selects a [group for session limits](#terminal-type). |
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

A successful IAM authentication supplies a `TokenPair`. `accessToken` is the short-lived Bearer token, `expiresIn` reports its lifetime in seconds, and `tokenType` is `'Bearer'`. `refreshToken` is optional because the cookie channel may omit it. Pass the pair to `apiClient.auth.setTokens(tokens)` on the default client, or call `auth.setTokens` on the instance that received it. This clears the previous pair and then saves the new access token and any refresh token the server supplied.

To test storage itself, create an unattached memory adapter. The following test helper exercises both setters, getters, and cleanup using supplied test values. It returns booleans so the test does not print tokens.

```ts
import { apiClient } from '@h-ai/api-client'

export async function verifyMemoryStorage(testAccessToken: string, testRefreshToken: string) {
  const storage = apiClient.tokenStorage.memory()
  let saved = false
  try {
    await storage.setAccessToken(testAccessToken)
    await storage.setRefreshToken(testRefreshToken)
    saved = await storage.getAccessToken() === testAccessToken
      && await storage.getRefreshToken() === testRefreshToken
  }
  finally {
    await storage.clear()
  }
  return {
    saved,
    cleared: await storage.getAccessToken() === null && await storage.getRefreshToken() === null,
  }
}
```

<a id="browser-refresh"></a>
<a id="detailed-workflow"></a>

#### Scenario: Restore the profile after a browser reload

Use [the browser account example](#example) with a test account and a working refresh Cookie. Sign in, reload the page, initialize the client again, and call `data.readProfile()`. The old access token was in JavaScript memory, so the protected request may receive a 401 first. The client sends the refresh request with the Cookie. If the server accepts it, the client saves the new access token and retries the profile read once. If refresh is definitively rejected, the example invokes `showSignIn`. Transient refresh failures, such as a network timeout, preserve the stored credentials for future attempts.

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

### Authentication actions for forms

`apiClient.createAuthActions(apiClient)` is valid. The first `apiClient` exposes the factory. The argument selects the initialized instance that the resulting actions use. Give that argument a name such as `defaultClient` when the two roles need to be explicit. To bind an independent instance, pass the variable returned by `apiClient.create(contract)` instead.

| Entry point | When to use it | Who saves the tokens |
| --- | --- | --- |
| `actions.login(form)` or `actions.register(form)` | A browser form chooses a sign-in method and uses the SDK's standard token storage flow. | The action stores the credentials on the bound client before returning success. |
| [`apiClient.iam.auth` endpoints](#iam-requests) | Application code selects one specific HTTP endpoint and controls how its result is used. | Direct login and registration return the credentials. The caller can pass `data.tokens` to `apiClient.auth.setTokens()`. |

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `apiClient.createAuthActions(client)` | Bind form actions to a client. | An instance with the standard IAM contract. Initialize it with `auth` to save credentials. | A bound actions object. | `apiClient.createAuthActions(defaultClient)` |
| `actions.login(input)` | Select the sign-in method, then save successful credentials. | `identifier` and `password`. The optional `method` defaults to `password` and can be `ldap`, `email`, or `sms`. For OTP use `password: ''` and the one-time `code`. Supply `captcha` when required and `expectedUserId` when recovering a session. | A `HaiResult` containing the user and credentials. Storage failure rejects the promise. | `await actions.login({ identifier, password })` |
| `actions.register(input)` | Register a user and save successful credentials. | Required `username` and `password`. Optional `email`, `phone`, `displayName`, `metadata`, and `captcha`. | A `HaiResult` containing the user and credentials. Storage failure rejects the promise. | `await actions.register({ username, password })` |
| `actions.bindPageExit(options?)` | Request session revocation when the browser leaves the document. | `options.enabled` defaults to `false`. Pass the value from `session.endOnPageHide` in the public policy. | A listener cleanup function. | `actions.bindPageExit({ enabled: policy.session.endOnPageHide })` |

The same object also offers wrappers for the [IAM endpoints](#iam-requests). `actions.publicConfig()` and `actions.createCaptcha(input)` forward their arguments directly. `actions.sendOtp(identifier, { captcha })` and `actions.requestPasswordReset(identifier, { captcha })` turn the form values into an input object. `actions.confirmPasswordReset(token, newPassword)` and `actions.renewPassword(input)` submit password changes. The `actions.reauthenticate(password, operation)` wrapper forwards to the [same reauthentication endpoint](#reauthentication).

#### Scenario: Sign in from a browser form

The [browser setup](#example) initializes the default client and returns a `signIn(input)` function. Pass `{ identifier, password }` from a password form, or `{ identifier, password: '', method: 'email', code }` from an email-code form. Read the public policy to choose the method. Where the policy requires a CAPTCHA, solve the challenge for that operation and add its proof in `captcha`. On success, the page can load the profile with the stored credentials.

<a id="page-exit"></a>

#### Scenario: Revoke the session when the browser leaves the account document

Add this function to the authenticated layout of the [browser example](#example). Call it once after signing in. The public policy supplies the opt-in flag. If reading the policy fails, the function returns the failure and leaves the listener unbound.

```ts
import { apiClient } from '@h-ai/api-client'

export async function bindAccountPageExit() {
  const defaultClient = apiClient
  const actions = apiClient.createAuthActions(defaultClient)
  const policy = await actions.publicConfig()
  if (!policy.success)
    return policy

  const stop = actions.bindPageExit({
    enabled: policy.data?.session.endOnPageHide ?? false,
  })
  return { success: true as const, data: { stop } }
}
```

Save `data.stop` on success. Call it before signing out and in the layout's teardown. A normal browser `pagehide` then requests `iam.auth.closeSession({})` with `keepalive: true` and `autoRefresh: false`. This skips pages entering the back-forward cache. The browser may end the request before delivery. An explicit [sign-out](#logout) still revokes the session and clears local credentials.

<a id="request-options"></a>
### Per-call request options

Start with a real API you already use. After the [browser setup](#example) initializes the default client, `apiClient.iam.auth.currentUser()` reads the signed-in user's profile. To let the profile page cancel the same read, add an option to that call. `currentUser` takes no business input, so put `undefined` in the first argument and pass `{ signal }` second. For a call that takes input, such as `apiClient.iam.users.list({ page: 1 }, { signal })`, put the actual input first. These options only affect that call.

#### Request option fields

| Field | Type and default | Effect |
| --- | --- | --- |
| `signal` | Optional `AbortSignal`. | Cancels this caller's request, wait for authentication recovery, or active stream. Other callers can continue using a shared refresh. |
| `lastEventId` | Optional `string`. | Supplies the last processed event ID for SSE resumption on routes that support it. |
| `context.autoRefresh` | Optional `boolean`. Normal refresh policy applies when omitted. | Pass `false` to suppress automatic credential refresh for the call. The current request still uses available credentials. |
| `context.keepalive` | Optional `boolean`. | Requests Fetch keepalive for a short browser request, for example during page exit. Delivery depends on the browser. |
| `context.reauthentication` | Optional `string`. | Sends IAM's `ticket` in `X-Hai-Reauthentication` for the operation the server named. |
| `context.reauthorize` | Optional `() => Promise<string \| null \| undefined>`. | Can obtain fresh proof for an eligible retry. Return a ticket, `null` to cancel, or `undefined` to continue without a new ticket. |

#### Scenario: Cancel a profile read when leaving the page

The profile view uses the default `apiClient` already initialized by the [browser app](#example). Call `startProfileRead()` when the view opens. Render the user or show the error when its `result` settles. Call `cancel()` in the view's unmount handler and ignore results after it has left. The app still owns the shared client.

```ts
import { apiClient } from '@h-ai/api-client'

export function startProfileRead() {
  const controller = new AbortController()
  const result = apiClient.iam.auth.currentUser(undefined, { signal: controller.signal })
  return { result, cancel: () => controller.abort() }
}
```

<a id="request-authorization"></a>

#### Scenario: Check identity and access before calling a protected operation

**Authentication** establishes who made the request. The client sends the Bearer token it obtained at sign-in or refresh, and IAM verifies the current session at the server. A protected request can return HTTP 401 for a missing, expired, or invalid session. The client can try refresh for an eligible authentication failure. If the final result still reports 401, follow the application's sign-in flow.

**Authorization** determines whether that verified session can execute this operation on this resource. For example, the service can require `user:list` for a user listing and independently check that a report belongs to the requester's permitted organization. In the browser example, call `apiClient.iam.auth.currentUser()` to read the current user's `roles` and `permissions` for rendering menus and controls. Serv or Kit and the application handler enforce authorization on every request. A valid session with insufficient permission or resource access normally receives HTTP 403. Display the denial and retain its public error for diagnostics. Automatic refresh applies to eligible authentication failures.

If an authorized operation also requires a fresh password check, use the [reauthentication ticket workflow](#reauthentication). · [Serv authentication](serv.en.md#authentication) · [Kit authorization guards](kit.en.md#auth) · [IAM authorization](iam.en.md#authorization)

<a id="iam-requests"></a>
### IAM authentication and session endpoints

`apiClient.iam.auth` is the standard IAM endpoint group on the default client. For example, `apiClient.iam.auth.currentUser()` makes an HTTP request to the API. `apiClient.auth` is the local token manager for that same client. Use [sign-in actions](#auth-actions) to save credentials automatically. If you call `apiClient.iam.auth.login(input)` directly, check the result and pass its tokens to `apiClient.auth.setTokens(result.data.tokens)` yourself. A separate client created with an IAM contract has the same endpoint group. Each endpoint also accepts [per-call options](#request-options).

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `apiClient.iam.auth.publicConfig(input?, options?)` | Read the public authentication policy. | Omit the input or pass `undefined` before options. | `HaiResult`, with nullable policy data. | `await apiClient.iam.auth.publicConfig()` |
| `apiClient.iam.auth.createCaptcha(input, options?)` | Create an authentication challenge. | `{ operation }`. | `HaiResult` containing the challenge. | `await apiClient.iam.auth.createCaptcha({ operation: 'login' })` |
| `apiClient.iam.auth.login(input, options?)` | Sign in with a password. | `identifier`, `password`, optional `captcha` and `expectedUserId`. | `HaiResult` containing user and credentials. | `await apiClient.iam.auth.login({ identifier, password })` |
| `apiClient.iam.auth.loginWithLdap(input, options?)` | Sign in through LDAP. | `username`, `password`, optional `captcha` and `expectedUserId`. | `HaiResult` containing user and credentials. | `await apiClient.iam.auth.loginWithLdap({ username, password })` |
| `apiClient.iam.auth.loginWithOtp(input, options?)` | Sign in using a delivered code. | `identifier`, `code`, optional `captcha` and `expectedUserId`. | `HaiResult` containing user and credentials. | `await apiClient.iam.auth.loginWithOtp({ identifier, code })` |
| `apiClient.iam.auth.register(input, options?)` | Register and start an IAM session. | `username`, `password`, optional `email`, `phone`, `displayName`, `metadata`, and `captcha`. | `HaiResult` containing user and credentials. | `await apiClient.iam.auth.register({ username, password })` |
| `apiClient.iam.auth.sendOtp(input, options?)` | Request delivery of an OTP. | `identifier` and optional `captcha`. | `HaiResult` containing `expiresAt`. | `await apiClient.iam.auth.sendOtp({ identifier })` |
| `apiClient.iam.auth.requestPasswordReset(input, options?)` | Start password reset. | `identifier` and optional `captcha`. | `HaiResult<void>`. | `await apiClient.iam.auth.requestPasswordReset({ identifier })` |
| `apiClient.iam.auth.confirmPasswordReset(input, options?)` | Finish password reset. | `token` and `newPassword`. | `HaiResult<void>`. | `await apiClient.iam.auth.confirmPasswordReset({ token, newPassword })` |
| `apiClient.iam.auth.renewPassword(input, options?)` | Replace an initial or expired password. | `identifier`, `password`, `newPassword`, optional `captcha`. | `HaiResult<void>`. | `await apiClient.iam.auth.renewPassword({ identifier, password, newPassword })` |
| `apiClient.iam.auth.logout(input, options?)` | End the current session and clear service-set cookies. | Optional `accessToken` inside the input object. | `HaiResult<void>`. | `await apiClient.iam.auth.logout({})` |
| `apiClient.iam.auth.closeSession(input, options?)` | Revoke a departing session for the page-exit flow. | Optional `accessToken` inside the input object. | `HaiResult<void>`. A newer browser login cookie is preserved. | `await apiClient.iam.auth.closeSession({})` |
| `apiClient.iam.auth.refresh(input, options?)` | Exchange a refresh token explicitly when the server accepts it in the body. | Required `refreshToken` inside the input object. For the HttpOnly Cookie, use automatic refresh. | `HaiResult` containing the renewed credentials. | `await apiClient.iam.auth.refresh({ refreshToken })` |
| `apiClient.iam.auth.currentUser(input?, options?)` | Read the current identity and access scope. | Omit the input or pass `undefined` before options. | `HaiResult` containing the user record with `roles` and `permissions` arrays. | `await apiClient.iam.auth.currentUser()` |
| `apiClient.iam.auth.changePassword(input, options?)` | Change the authenticated user's password. | `oldPassword` and `newPassword`. | `HaiResult<void>`. | `await apiClient.iam.auth.changePassword({ oldPassword, newPassword })` |
| `apiClient.iam.auth.updateCurrentUser(input, options?)` | Edit the caller's profile. | Optional `username`, `displayName`, `avatarUrl`, `email`, `phone`, and `metadata`. | `HaiResult` containing the updated user. | `await apiClient.iam.auth.updateCurrentUser({ displayName })` |
| `apiClient.iam.auth.reauthenticate(input, options?)` | Obtain proof for a sensitive operation. | `password` and `operation`. | `HaiResult` containing the short-lived proof. | `await apiClient.iam.auth.reauthenticate({ password, operation })` |

<a id="logout"></a>

#### Scenario: Sign out of the current session

The sign-out button in the [browser example](#example) calls `apiClient.iam.auth.logout({})`. Check the result to confirm the server revoked the session and expired the refresh Cookie. Whether the remote request succeeds or fails, `apiClient.auth.clear()` clears the local credentials. If the remote request failed, the view can return to sign-in and let the user know the server revocation was unconfirmed.

<a id="http-contract-extensions"></a>

### Create a client from the application contract with `apiClient.create(contract)`

Save this example as `project-api.ts` to combine the base and optional operations. Share the application contract between client and server, and include the branches your service exposes. Merge operations within `roles`, `files`, `chats`, `memories`, and `orders` to preserve the base methods.

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

const { extensions } = apiContract

export const projectContract = apiContract.create({
  iam: {
    ...apiContract.iam,
    apiKeys: extensions.iam.apiKeys,
    roles: { ...apiContract.iam.roles, ...extensions.iam.roles },
  },
  storage: {
    ...apiContract.storage,
    files: { ...apiContract.storage.files, ...extensions.storage.files },
  },
  ai: {
    ...apiContract.ai,
    ...extensions.ai,
    chats: { ...apiContract.ai.chats, ...extensions.ai.chats },
    memories: { ...apiContract.ai.memories, ...extensions.ai.memories },
  },
  audit: extensions.audit,
  payment: { orders: { ...apiContract.payment.orders, ...extensions.payment.orders } },
  feedback: apiContract.feedback,
})

export async function connectProjectClient(baseUrl: string, accessToken: string) {
  const client = apiClient.create(projectContract)
  const ready = await client.init({
    baseUrl,
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!ready.success)
    throw new Error(ready.error.message)
  return { client }
}

export type ProjectClient = Awaited<ReturnType<typeof connectProjectClient>>['client']
```

Pass the current access token and the API URL including its server prefix. Use the returned `client` in the examples below and close it when its page or application owner exits. Use host-enabled HTTPS routes for streams and files. When other routes require framework transport encryption, create separate client instances for the two policies. Handle refusals as [authorization results](#request-authorization).

See the endpoint and service setup in [API Contract](api-contract.en.md#http-contract-extensions) · [Serv](serv.en.md#http-contract-extensions)

<a id="iam-admin-inputs"></a>

### Manage users, roles and permissions with `apiClient.iam`

The administration page calls the `users`, `roles`, and `permissions` groups on the default client. It uses the browser session already initialized in [the account example](#example). Sign in as an account with the relevant server permissions. Each call accepts optional [request options](#request-options).

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `apiClient.iam.users.list(input, options?)` | Search and page through users. | Pagination and filters described below. | `HaiResult` containing a page of users. | `await apiClient.iam.users.list({ page: 1, pageSize: 20 })` |
| `apiClient.iam.users.get(input, options?)` | Find a user by ID. | `{ id }`. | `HaiResult` containing a user or `null`. | `await apiClient.iam.users.get({ id })` |
| `apiClient.iam.users.create(input, options?)` | Create a user with supplied initial credentials. | Required `username` and `password`, plus optional profile and account fields. | `HaiResult` containing the created user. | `await apiClient.iam.users.create({ username, password })` |
| `apiClient.iam.users.invite(input, options?)` | Create a user with a one-time setup invitation. | Required `username`, plus optional account and profile fields. `accountStatus` may only be `active`. | `HaiResult` containing the invited user. | `await apiClient.iam.users.invite({ username, email })` |
| `apiClient.iam.users.update(input, options?)` | Edit user details, status, or roles. | Required `id`, plus optional fields described below. | `HaiResult` containing the updated user. | `await apiClient.iam.users.update({ id, displayName })` |
| `apiClient.iam.users.delete(input, options?)` | Delete a user. | `{ id }`. | `HaiResult<void>`. | `await apiClient.iam.users.delete({ id })` |
| `apiClient.iam.users.resetPassword(input, options?)` | Reset a user's password administratively. | `id` and `newPassword`. | `HaiResult<void>`. | `await apiClient.iam.users.resetPassword({ id, newPassword })` |
| `apiClient.iam.roles.list(input?, options?)` | Read the role list. | Omit the input or pass `undefined` before options. | `HaiResult` containing a page of roles. | `await apiClient.iam.roles.list()` |
| `apiClient.iam.roles.get(input, options?)` | Find a role by ID. | `{ id }`. | `HaiResult` containing a role or `null`. | `await apiClient.iam.roles.get({ id })` |
| `apiClient.iam.roles.create(input, options?)` | Create a role. | `code`, `name`, optional `description` and `isSystem`. | `HaiResult` containing the created role. | `await apiClient.iam.roles.create({ code, name })` |
| `apiClient.iam.roles.update(input, options?)` | Edit a role's name or description. | `id`, optional `name` and `description`. | `HaiResult` containing the updated role. | `await apiClient.iam.roles.update({ id, name })` |
| `apiClient.iam.roles.delete(input, options?)` | Delete a role. | `{ id }`. | `HaiResult<void>`. | `await apiClient.iam.roles.delete({ id })` |
| `apiClient.iam.permissions.list(input, options?)` | Search and page through permissions. | Pagination, optional `search` and `type`. | `HaiResult` containing a page of permissions. | `await apiClient.iam.permissions.list({ type: 'api' })` |
| `apiClient.iam.permissions.get(input, options?)` | Find a permission by ID. | `{ id }`. | `HaiResult` containing a permission or `null`. | `await apiClient.iam.permissions.get({ id })` |
| `apiClient.iam.permissions.create(input, options?)` | Create a permission. | `code`, `name`, optional `description`, `resource`, `action`, `type`, and `sensitiveOperations`, which defaults to `[]`. | `HaiResult` containing the created permission. | `await apiClient.iam.permissions.create({ code, name })` |
| `apiClient.iam.permissions.setSensitiveOperations(input, options?)` | Replace a permission's sensitive operation list. | `id` and `sensitiveOperations`, up to 1,000 identifiers. | `HaiResult<void>`. | `await apiClient.iam.permissions.setSensitiveOperations({ id, sensitiveOperations })` |
| `apiClient.iam.permissions.delete(input, options?)` | Delete a permission. | `{ id }`. | `HaiResult<void>`. | `await apiClient.iam.permissions.delete({ id })` |

##### IAM administration fields

| Input | Fields and defaults |
| --- | --- |
| `apiClient.iam.users.list` | `page` starts at 1 and defaults to 1. `pageSize` defaults to 20 and is capped at 100. Optional `search`, `roleCode`, `accountStatus` (`active`, `dormant`, `closed`), `sortBy` (`username`, `email`, `displayName`, `accountStatus`, `createdAt`), and `sortDirection` (`asc` or `desc`). |
| `apiClient.iam.users.create` and `users.invite` | Optional `email`, `phone`, `displayName`, `metadata`, `roleIds`, `accountType` (`permanent` or `temporary`), `accountStatus`, and `accountExpiresAt`. Create accepts `password`. Invitation uses a one-time setup flow and accepts only `active` for `accountStatus`. |
| `apiClient.iam.users.update` | Required `id`. Optional `username`, `email`, `phone`, `displayName`, `avatarUrl`, `metadata`, `roleIds`, `accountType`, `accountStatus`, and `accountExpiresAt`. Pass `null` for `accountExpiresAt` to remove a stored expiry when allowed by IAM. |
| `apiClient.iam.permissions.list` and `permissions.create` | `type` is `menu`, `api`, or `button`. List accepts the common pagination fields. |

#### Scenario: List users assigned to an administrative role

On an admin screen, open the auditor tab to load the first 20 users with the `auditor` role. Pass the tab's cancellation signal if navigating away should cancel the read.

```ts
import { apiClient } from '@h-ai/api-client'

export async function listAuditors(signal?: AbortSignal) {
  const result = await apiClient.iam.users.list({
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

Render the returned page of auditors or display the failure. The account module keeps the default client available for later calls.

<a id="iam-management-extensions"></a>

#### Role permission assignments and API key management

Use the [application client](#http-contract-extensions) for these six operations. Serv checks `iam.roles.read` / `iam.roles.write` or `iam.apiKeys.read` / `iam.apiKeys.write` and access to the target account or role. API key sort fields are `name`, `createdAt`, `lastUsedAt`, and `expiresAt`. Reauthentication operation IDs are `iam.roles.replacePermissions`, `iam.apiKeys.create`, and `iam.apiKeys.delete`. Pass the matching ticket in `options.context.reauthentication`. On a role update conflict, reload its permissions and obtain a fresh ticket as required.

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `client.iam.roles.listPermissions(input, options?)` | List direct role permissions | Required role `id` from the roles list. | `HaiResult` with an array of permission records. | `await client.iam.roles.listPermissions({ id: roleId })` |
| `client.iam.roles.replacePermissions(input, options?)` | Replace all direct role permissions | Required role `id` and the full `permissionIds` array. Use `[]` to clear it. Supply a reauthentication ticket when required. | `HaiResult<void>`. A concurrent edit sets `error.httpStatus` to 409. | `await client.iam.roles.replacePermissions({ id: roleId, permissionIds }, options)` |
| `client.iam.apiKeys.list(input, options?)` | List API keys for an account | Required `userId`. Optional `page`, `pageSize`, `search`, `enabled`, `sortBy`, and `sortDirection`. | `HaiResult` with `items`, `total`, `page`, and `pageSize`. | `await client.iam.apiKeys.list({ userId, page: 1, enabled: true })` |
| `client.iam.apiKeys.create(input, options?)` | Issue an API key for an account | Required `userId` and `name`. Optional `scopes` and `expirationDays`. IAM supplies the expiry default. Use `0` for no expiry. | `HaiResult` with metadata in `data.apiKey` and the one-time secret in `data.rawKey`. | `await client.iam.apiKeys.create({ userId, name, expirationDays: 30 }, options)` |
| `client.iam.apiKeys.get(input, options?)` | Read API key metadata | Required `id` from the list or the create response’s `apiKey.id`. | `HaiResult` with prefix, status, expiry, and scopes in the metadata. | `await client.iam.apiKeys.get({ id: keyId })` |
| `client.iam.apiKeys.revoke(input, options?)` | Revoke an API key | Required key record `id`. Supply the ticket when the policy requires it. | `HaiResult<void>` | `await client.iam.apiKeys.revoke({ id: keyId }, options)` |

#### Scenario: Issue a key for a report integration

Select the target account’s `userId` and prompt for the current password when the server configures `iam.apiKeys.create` as sensitive. On success, hand the one-time `rawKey` to the integration during this action. List and detail screens show metadata. Keep the secret out of logs.

```ts
import type { ProjectClient } from './project-api'

export async function issueReportKey(client: ProjectClient, userId: string, password: string) {
  const proof = await client.iam.auth.reauthenticate({ password, operation: 'iam.apiKeys.create' })
  if (!proof.success)
    return proof

  const issued = await client.iam.apiKeys.create({
    userId,
    name: 'Report reader',
    expirationDays: 30,
    scopes: ['reports:read'],
  }, { context: { reauthentication: proof.data.ticket } })
  if (!issued.success)
    return issued
  return { success: true as const, data: { id: issued.data.apiKey.id, rawKey: issued.data.rawKey } }
}
```

<a id="reauthentication"></a>

#### Scenario: Confirm a protected user deletion

In an authorized Serv administration view, take the target ID from a successful list response and ask for the signed-in operator's current password. Obtain a proof for `iam.users.delete` and attach the returned ticket only to that call.

```ts
import { apiClient } from '@h-ai/api-client'

export async function deleteUser(id: string, password: string) {
  // Ask IAM for a single-operation proof. A failure stops before attempting deletion.
  const proof = await apiClient.iam.auth.reauthenticate({ password, operation: 'iam.users.delete' })
  if (!proof.success)
    return { ok: false as const, error: proof.error }

  // Delete the selected user using this proof. The result says whether the service accepted it.
  const deleted = await apiClient.iam.users.delete({ id }, { context: { reauthentication: proof.data.ticket } })
  if (!deleted.success)
    return { ok: false as const, error: deleted.error }
  return { ok: true as const, id }
}
```

The optional `context.reauthentication` is a string on the second argument to the typed call. The API Client's OpenAPI link copies it to `X-Hai-Reauthentication` for that request. The first argument `{ id }` remains the business input. For the standard Serv delete route, the permission guard checks `iam.users.write` and the handler forwards the header, the current access token, and `iam.users.delete` to `iam.auth.checkSensitiveOperation()`. IAM consumes the one-time ticket and checks its user, action, current session version, and credential version. In a Kit route, apply the usual permission and resource checks, then call `kit.guard.requireSensitive(iam, event, operation)` before the write. [Serv authentication](serv.en.md#authentication) · [Kit authorization](kit.en.md#auth)

Check the returned result before removing that user from the view. The application's initialized client stays available to reload the list.

In the source, follow the `headers` callback in `buildRawClient()` in `packages/api-client/src/api-client-link.ts`, the `users.delete` handler and `sensitive()` in `packages/serv/src/features/serv-feature-iam.ts`, and `checkSensitiveOperation()` in `packages/iam/src/authn/iam-authn-functions.ts`. In Kit, `requireSensitive()` in `packages/kit/src/guards/kit-sensitive.ts` reads the header.

<a id="storage-requests"></a>
### Access object storage with `client.storage`

Use the mounted Storage endpoints to manage objects. Signed URLs send the browser directly to the storage backend. For small-file transfers through the application, use the [application client](#http-contract-extensions) and enable the corresponding HTTPS routes. This also works with local storage that does not support signed URLs.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `presignedUrls.createUpload(input, options?)` | Obtain a temporary object upload URL. | `key`, optional `contentType` and `expiresIn` (1–604,800 seconds). The standard service defaults to `application/octet-stream` and 900 seconds. | `HaiResult` containing the signed URL, object key, and optional expiry. | `await client.storage.presignedUrls.createUpload({ key, contentType: 'application/pdf' })` |
| `presignedUrls.createDownload(input, options?)` | Obtain a temporary object download URL. | `key` and optional `expiresIn` (1–604,800 seconds). The standard service defaults to 900 seconds. | `HaiResult` containing the signed URL, object key, and optional expiry. | `await client.storage.presignedUrls.createDownload({ key, expiresIn: 60 })` |
| `files.list(input, options?)` | List file metadata under a prefix. | Pass an object, using `{}` for default listing. Optional `prefix`, `maxKeys` (1–1,000), `delimiter`, and `continuationToken` from the previous page. | `HaiResult` containing files and pagination information. | `await client.storage.files.list({ prefix: 'reports/', maxKeys: 20 })` |
| `files.getMetadata(input, options?)` | Read metadata for a known object key. | `{ key }` for an object the caller may read. | `HaiResult` containing size, content type, and other metadata. | `await client.storage.files.getMetadata({ key })` |
| `files.delete(input, options?)` | Delete an object. | `{ key }` for an object the caller may delete. | `HaiResult<void>`. | `await client.storage.files.delete({ key })` |
| `files.deleteMany(input, options?)` | Delete a batch of objects. | `{ keys }`, a nonempty array of up to 1,000 object keys. | `HaiResult` containing deletion progress. A partial failure can include the same structure in `error.ext.deleteMany`. | `await client.storage.files.deleteMany({ keys: [key] })` |
| `client.storage.files.upload(input, options?)` | Upload through the application server | Required authorized object `key` and a nonempty `file: File` of at most 5 MiB. | `HaiResult` with file metadata. An existing object at the same key causes a failure. | `await client.storage.files.upload({ key, file })` |
| `client.storage.files.download(input, options?)` | Download an attachment through the application server | Required object `key` with read access. The service caps downloads at 5 MiB. | `File` on success or the failure branch of `HaiResult<never>`. | `await client.storage.files.download({ key })` |

Use the returned URL directly for the object transfer. For a signed upload, use the signed method and matching content type. The signing procedure and the object transfer have separate outcomes.

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

#### Scenario: Upload and read back a PDF through the application

The file picker supplies the `File`, and the application assigns an object `key` the caller may write. Read the same file back using the receipt’s key. Offer a preview or download on success and show the returned error if either call fails.

```ts
import type { ProjectClient } from './project-api'

export async function verifyUploadedPdf(client: ProjectClient, key: string, file: File) {
  const uploaded = await client.storage.files.upload({ key, file })
  if (!uploaded.success)
    return uploaded

  const downloaded = await client.storage.files.download({ key: uploaded.data.key })
  if (!(downloaded instanceof File))
    return downloaded
  return { success: true as const, data: downloaded }
}
```

<a id="ai-requests"></a>

### Call chat, memory, and session endpoints with `client.ai`

Once the service mounts the AI routes, the default client supports JSON chat completion, messages, history, memory queries, and session listing. Use the [application client](#http-contract-extensions) for streaming, memory writes, and media. The signed-in owner is the default. The host authorizes any explicit `objectId`.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `apiClient.ai.chats.createCompletion(input, options?)` | Request a non-streaming chat completion. | Required nonempty `messages`. Generation controls, tools, and ownership fields follow. | `HaiResult` containing completion choices and model metadata. | `await apiClient.ai.chats.createCompletion({ messages: [{ role: 'user', content: 'Hello' }] })` |
| `apiClient.ai.chats.sendMessage(input, options?)` | Send one message to a session. | `message`, optional `sessionId` (defaults to `default`), `objectId`, `systemPrompt`, `model`, and `temperature` (0–2). | `HaiResult` containing reply content, model, and optional usage. | `await apiClient.ai.chats.sendMessage({ message, sessionId })` |
| `apiClient.ai.chats.listHistory(input, options?)` | Read the history of a session. | `sessionId`, optional `objectId`, `limit` (1–200), and `order` (`asc` or `desc`). | `HaiResult` containing chat records. | `await apiClient.ai.chats.listHistory({ sessionId, limit: 20 })` |
| `apiClient.ai.memories.recall(input, options?)` | Search for memories by query. | `query`, optional `topK` (at least 1), `types`, `minImportance` (0–1), and `objectId`. | `HaiResult` containing matching memories. | `await apiClient.ai.memories.recall({ query: 'preferred language', topK: 3 })` |
| `apiClient.ai.memories.list(input, options?)` | List memories for an authorized owner. | Pass an object, using `{}` for defaults. Optional `types`, `objectId`, zero-based `offset`, and `limit` (1–100). | `HaiResult` containing memory entries. | `await apiClient.ai.memories.list({ limit: 20 })` |
| `apiClient.ai.sessions.list(input, options?)` | List AI sessions. | Pass `{}` for the signed-in owner, or supply an authorized `objectId`. | `HaiResult` containing session entries. | `await apiClient.ai.sessions.list({})` |
| `client.ai.chats.streamCompletion(input, options?)` | Receive model output incrementally | Uses the same input as `createCompletion`. Pass a `signal` as a per-call option. | An async iterable on success, a result failure before setup, and an iteration error after setup. | `await client.ai.chats.streamCompletion({ messages }, { signal })` |
| `client.ai.memories.add(input, options?)` | Save a memory | Required `content` (1–5000 characters) and `type`. Optional `importance` (0–1) and authorized `objectId`. | `HaiResult` with a memory entry containing `id`, `content`, and `type`. | `await client.ai.memories.add({ content, type: 'preference' })` |
| `client.ai.memories.update(input, options?)` | Edit a memory | Required `id` and at least one of `content`, `type`, or `importance`. Optional `objectId`. | `HaiResult` with a memory entry containing `id`, `content`, and `type`. | `await client.ai.memories.update({ id: memoryId, content })` |
| `client.ai.memories.remove(input, options?)` | Remove a memory | Required memory `id`. Optional authorized `objectId`. | `HaiResult<void>` | `await client.ai.memories.remove({ id: memoryId })` |
| `client.ai.memories.clear(input, options?)` | Clear memories in an authorized scope | Pass `{}` for the default owner, or specify `objectId` and nonempty `types`. The host must authorize the clear operation. | `HaiResult<void>` | `await client.ai.memories.clear({ types: ['preference'] })` |
| `client.ai.audio.getCapabilities(input, options?)` | Check audio capabilities for a model | Required `operation` of `transcribe` or `synthesize`. Optional model subject to host policy. | `HaiResult` with capability flags such as real-time input or streaming output. | `await client.ai.audio.getCapabilities({ operation: 'transcribe' })` |
| `client.ai.audio.issueTicket(input, options?)` | Obtain a voice WebSocket ticket | Required `operation` of `transcribe` or `synthesize`; optional `model`. | `HaiResult` with a one-time `ticket` and `expiresAt` in milliseconds. Valid for 30 seconds. | `await client.ai.audio.issueTicket({ operation: 'synthesize' })` |
| `client.ai.audio.transcribe(input, options?)` | Transcribe a recording | Required WAV or MP3 `audio: File` up to 8 MiB. Optional `language` and `model`. | `HaiResult<{ text, language?, durationMs? }>` | `await client.ai.audio.transcribe({ audio })` |
| `client.ai.audio.synthesize(input, options?)` | Synthesize speech from text | Required `text` (1–5000 characters). Optional `voice`, `model`, and `format` (`wav` by default, or `mp3`). | An audio `File` on success, or a failure result. | `await client.ai.audio.synthesize({ text, format: 'mp3' })` |
| `client.ai.images.generate(input, options?)` | Generate one image from a prompt and optional references | Required `prompt` (1–5000 characters). Optional `model`, `width` and `height` together (1–2048 each), and up to four `referenceImages` totaling at most 10 MiB. | An image `File` on success, or a failure result. | `await client.ai.images.generate({ prompt, referenceImages })` |

<a id="ai-input-fields"></a>

##### Chat completion request fields

| Field | Usage and defaults |
| --- | --- |
| `messages` | Required nonempty list of `system`, `user`, `assistant`, or `tool` messages. Text content can be a string or a list of `{ type: 'text', text }` parts. Only user messages accept `image_url` parts with `{ url, detail? }`. `detail` can be `auto`, `low`, or `high`. |
| `messages[].tool_calls` and `messages[].tool_call_id` | An assistant function call has `id`, `type: 'function'`, `function.name`, and a JSON string `function.arguments`. An assistant message without content needs at least one call. A tool message requires the original call ID. |
| `objectId`, `sessionId`, `model` | Optional owner, session, and model. Omission uses the authenticated owner, session `default`, and the server's model settings. The service must authorize cross-owner access. |
| `temperature`, `top_p`, `max_tokens` | Optional temperature (0–2), sampling probability (0–1), and positive integer token limit. Omission uses the model settings. |
| `tools` and `tool_choice` | An optional nonempty tool list. Each tool has `type: 'function'` and `function.name`, with optional description, JSON Schema parameters, and strict mode. Choice accepts `auto`, `none`, `required`, or `{ type: 'function', function: { name } }`. Required or named selection needs corresponding tools. |

#### Scenario: Open a saved conversation and send a message

The chat page has an initialized, signed-in default client. Populate the conversation selector with the `sessionId` from each item in `listChatSessions()`'s successful result. After a user selects a session, call `readChatHistory()` and render each record's messages and `response.content`. Pass the same `sessionId` and the text from the editor to `sendChatMessage()`. Check `success` before appending the returned `data.content` as the assistant reply.

```ts
import { apiClient } from '@h-ai/api-client'

export function listChatSessions(signal?: AbortSignal) {
  return apiClient.ai.sessions.list({}, { signal })
}

export function readChatHistory(sessionId: string, signal?: AbortSignal) {
  return apiClient.ai.chats.listHistory({ sessionId, limit: 20, order: 'asc' }, { signal })
}

export function sendChatMessage(sessionId: string, message: string, signal?: AbortSignal) {
  return apiClient.ai.chats.sendMessage({ sessionId, message }, { signal })
}
```

#### Scenario: Generate a support-reply draft

Use `createCompletion()` when the page supplies the message sequence. The support team sets the instruction and the user supplies the request. The browser-only SDK forwards those messages to the server's model and waits for the JSON result. The function returns the first assistant text and the count of tokens used. Let an agent review the draft before sending it to a customer.

```ts
import { apiClient } from '@h-ai/api-client'

export async function draftSupportReply(request: string, signal?: AbortSignal) {
  const result = await apiClient.ai.chats.createCompletion({
    messages: [
      { role: 'system', content: 'Draft a concise customer support reply.' },
      { role: 'user', content: request },
    ],
  }, { signal })
  if (!result.success)
    return result
  return {
    success: true as const,
    data: { text: result.data.choices[0]?.message.content ?? null, tokenCount: result.data.usage.total_tokens },
  }
}
```

#### Scenario: List and search a signed-in user’s saved preferences

Use `listPreferences(offset)` for the account page's paged list. Render `data.items` and use `data.total` to decide whether another page is available. Use `recallPreferences(query)` for the search box, for example with the query `preferred language`, and show the returned matches in `data.items`. Both calls use the signed-in user when `objectId` is omitted.

```ts
import { apiClient } from '@h-ai/api-client'

export function listPreferences(offset: number) {
  return apiClient.ai.memories.list({ types: ['preference'], offset, limit: 20 })
}

export function recallPreferences(query: string) {
  return apiClient.ai.memories.recall({ query, topK: 5, types: ['preference'] })
}
```

#### Scenario: Display the first response as it streams

Create an `AbortController` before sending the question and pass its `signal`. Append each text delta to the displayed reply and finish at `done`. Abort on cancellation or navigation. Handle iteration errors in the page.

```ts
import type { ProjectClient } from './project-api'

export async function streamAnswer(
  client: ProjectClient,
  question: string,
  onText: (text: string) => void,
  signal: AbortSignal,
) {
  const events = await client.ai.chats.streamCompletion({
    messages: [{ role: 'user', content: question }],
  }, { signal })
  if (!(Symbol.asyncIterator in events))
    throw new Error(events.error.message)

  for await (const event of events) {
    if (event.type === 'done')
      return
    const text = event.choices.find(choice => choice.index === 0)?.delta.content
    if (text)
      onText(text)
  }
}
```

#### Scenario: Transcribe a recording and create an audio preview

Pass a WAV or MP3 recording from the page. If transcription yields text, synthesize it as MP3. The successful value is an audio file. An empty transcript returns `null` so the page can show that there is no text to synthesize.

```ts
import type { ProjectClient } from './project-api'

export async function makeVoicePreview(client: ProjectClient, recording: File) {
  const transcript = await client.ai.audio.transcribe({ audio: recording })
  if (!transcript.success)
    return transcript
  if (!transcript.data.text.trim())
    return { success: true as const, data: null }

  const speech = await client.ai.audio.synthesize({ text: transcript.data.text, format: 'mp3' })
  if (!(speech instanceof File))
    return speech
  return { success: true as const, data: speech }
}
```

Audio and reference-image uploads use multipart. Use synthesized audio or a generated image directly as a `File`. Preview it with `URL.createObjectURL(file)` and revoke the URL after use. Real-time voice runs over WebSocket. Set the `@h-ai/ai/client` `getTicket` callback to call `client.ai.audio.issueTicket(request)` before each connection, return `data.ticket` on success, and surface failures before connecting.

<a id="audit-requests"></a>

### Query and archive audit logs with `client.audit`

With `audit` in the [application contract](#http-contract-extensions), an admin console can query, summarize, and archive logs. The Serv permissions are `audit:read` and `audit:backup`. The host determines the data scope and whether `audit.backup` requires a fresh ticket. The archive receipt’s `key` identifies a private object.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `client.audit.logs.list(input, options?)` | List audit logs by page | Use `{}` for default paging. Optional pagination, category, outcome, severity, user, scope, resource, action, trace or request ID, ISO date range, and sort. | `HaiResult` with log entries in `data.items` and a count in `data.total`. | `await client.audit.logs.list({ page: 1, outcome: 'denied' })` |
| `client.audit.logs.stats(input, options?)` | Count log entries by action | Optional `days` (0–365 days, default 7). Filters are `category`, `outcome`, `severity`, `scopeId`, `userId`, and `resource`. | `HaiResult<{ action, count }[]>` | `await client.audit.logs.stats({ days: 7 })` |
| `client.audit.backup.run(input, options?)` | Write a private audit archive | Required operation UUID `id`. Reuse it when retrying the same operation. The host controls reauthentication. | `HaiResult` with archive `key`, `recordCount`, `sha256`, and timestamps. | `await client.audit.backup.run({ id: archiveId }, options)` |

#### Scenario: Review denied actions from the past week

When opening the audit view, use the same outcome filter for the log page and statistics. Show the records in a table and the seven-day counts by action in a summary. Update both together after success.

```ts
import type { ProjectClient } from './project-api'

export async function loadDeniedAudit(client: ProjectClient) {
  const recent = await client.audit.logs.list({ page: 1, pageSize: 20, outcome: 'denied' })
  if (!recent.success)
    return recent

  const weekly = await client.audit.logs.stats({ days: 7, outcome: 'denied' })
  if (!weekly.success)
    return weekly
  return { success: true as const, data: { recent: recent.data, weekly: weekly.data } }
}
```

<a id="payment-requests"></a>

### Start checkout and manage orders with `client.payment.orders`

Use the [application’s order routes](#http-contract-extensions) to start payment, read its status, refund it, or close an unpaid order. The host authorizes the order and the caller. Use amounts consistent with the business and provider. Provider callbacks go to the Payment notification routes on the server.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `client.payment.orders.create(input, options?)` | Start checkout and obtain payment parameters | Required `provider`, integer `amount`, `description`, and `tradeType`. WeChat uses `jsapi` and requires a channel `userId`. Alipay and Stripe use `h5`. Optional `metadata`. | `HaiResult` with `clientParams` and optional `prepayId`. | `await client.payment.orders.create({ provider: 'stripe', tradeType: 'h5', amount, description })` |
| `client.payment.orders.get(input, options?)` | Read an order’s status | Required `orderNo` from the application order record. | `HaiResult`. Read `status` on success. | `await client.payment.orders.get({ orderNo })` |
| `client.payment.orders.refund(input, options?)` | Request a refund | Required `provider`, `orderNo`, `refundNo`, and integer `amount`. Optional `reason`. | `HaiResult` with `refundNo`, `refundId`, and refund status. | `await client.payment.orders.refund({ provider, orderNo, refundNo, amount })` |
| `client.payment.orders.close(input, options?)` | Close an unpaid order | Required `provider` and `orderNo` from the order being closed. The host verifies order access and the provider. | `HaiResult<void>` | `await client.payment.orders.close({ provider, orderNo })` |

#### Scenario: Close an unpaid order and reload its status

Offer a close action to an authorized user when the order’s status is `pending`. On confirmation, pass the provider and merchant order number from the record. Reload the status after closing, or show the returned error.

```ts
import type { PaymentCloseOrderInput } from '@h-ai/api-contract'
import type { ProjectClient } from './project-api'

export async function closeUnpaidOrder(client: ProjectClient, order: PaymentCloseOrderInput) {
  const closed = await client.payment.orders.close(order)
  if (!closed.success)
    return closed
  return client.payment.orders.get({ orderNo: order.orderNo })
}
```

<a id="feedback-requests"></a>

### Submit and manage feedback `client.feedback`

Mount `apiContract.feedback` in the application contract. The signed-in client uses `client.feedback` for submissions, reads, and replies. The server resolves scope, author, and permissions from the trusted session.

| API | Purpose | Example |
| --- | --- | --- |
| `client.feedback.reports.submit(input, options?)` | Submit text and files | `await client.feedback.reports.submit({ id, body, attachments })` |
| `client.feedback.reports.listMine(input, options?)` | List the current user’s reports | `await client.feedback.reports.listMine({})` |
| `client.feedback.reports.list(input, options?)` | List reports for staff | `await client.feedback.reports.list({ status: 'pending' })` |
| `client.feedback.reports.get(input, options?)` | Open the report and original files | `await client.feedback.reports.get({ id })` |
| `client.feedback.reports.listMessages(input, options?)` | Page through the latest replies | `await client.feedback.reports.listMessages({ id, page: 1 })` |
| `client.feedback.reports.addMessage(input, options?)` | Send a reply or request information | `await client.feedback.reports.addMessage({ id, messageId, body, kind: 'reply' })` |
| `client.feedback.reports.setStatus(input, options?)` | Mark Pending or Handled | `await client.feedback.reports.setStatus({ id, status: 'handled' })` |
| `client.feedback.attachments.get(input, options?)` | Fetch the selected file | `await client.feedback.attachments.get({ id, attachmentId })` |

#### Scenario: Open the report after submitting

In an async application function, use a `client` with the feedback contract. Open the report using the returned ID after submission succeeds.

```ts
const submitted = await client.feedback.reports.submit({ id, body, attachments })
if (!submitted.success)
  return submitted
return client.feedback.reports.get({ id: submitted.data.id })
```

[@h-ai/feedback](feedback.en.md#api-reference)

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
| `transport.keyExchangePath` | Optional absolute pathname from the origin of `baseUrl`. Defaults to `/api/v1/_hai/key-exchange`. | For a `baseUrl` of `https://api.example.com/backend/api`, `/exchange/keys` resolves to `https://api.example.com/exchange/keys`. |
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

<a id="transport-observation"></a>
### Observe request outcomes with `client.observeRequests`

Use observations to match a failure to its procedure, elapsed time, and request ID. Refresh or replay can contribute additional attempts to the same logical call. The final record includes the method and sanitized URL only when available. The URL retains the actual request path and omits its query and fragment. Record handling should account for identifiers that the application places in a path. Fields exclude request and response bodies and headers.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `client.observeRequests(observer)` | Subscribe to settled logical request outcomes. | Required synchronous `observer(record: ApiRequestRecord)`. | Unsubscribe function. Close also removes subscriptions. Observer errors do not alter the request result. | `const unsubscribe = client.observeRequests(record => collect(record))` |

The record has `requestId`, `procedure`, `timestamp` (Unix milliseconds), `duration` (milliseconds), `success`, and `attempts`. It may also contain `errorCode`, `method`, `url`, and HTTP `status`. A request with zero attempts or no available HTTP response can omit `status`. An HTTP 200 carrying a failed `HaiResult` reports `success: false`. For a stream, the outcome describes stream setup.

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

### Server-sent events for a report export

A successful [export submission](#custom-business-client) returns an `exportId`. The report page sends it to `GET /reports/exports/{exportId}/progress`. Server-Sent Events (SSE) let the server deliver several progress updates in the same HTTP response. The page displays the completed and total counts and enables download when the export reports `ready`.

#### Interface list

| API | Purpose | Parameters and defaults | Return or failure | Example call |
| --- | --- | --- | --- | --- |
| `eventIterator(schema)` | Declare an event stream. | Import from `@orpc/contract` and pass the schema for one event. | The client receives an asynchronous iterator. | `.output(eventIterator(ExportProgressSchema))` |
| `progressClient.reports.exports.watchProgress(input, options?)` | Subscribe to one export job. | Pass `{ exportId }` from the export response and optionally the request `signal`. | A failure result if setup fails or an asynchronous iterator if it succeeds. | `await progressClient.reports.exports.watchProgress({ exportId }, { signal })` |

The custom contract below adds this endpoint. A route can also declare a bare JSON value, such as a number. The client returns the value on success or a failure branch on error. JSON Schema-compatible Zod output is validated while preserving wire representations such as ISO date strings.

#### Scenario: Verify progress from export acceptance to download

Install `@h-ai/api-client`, `@h-ai/api-contract`, `@orpc/contract`, and `zod` directly. Run `runReportProgressDemo()` using its Fetch test double. It simulates the accepted job `exp-42` and emits `0/3`, `2/3`, and `3/3` in order.

```ts
import { apiClient, type ApiClientConfig } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { eventIterator } from '@orpc/contract'
import { z } from 'zod'

const ExportProgressSchema = z.object({
  completed: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  state: z.enum(['running', 'ready']),
})
type ExportProgress = z.infer<typeof ExportProgressSchema>

const progressContract = {
  reports: {
    exports: {
      watchProgress: apiContract.route({
        method: 'GET',
        path: '/reports/exports/{exportId}/progress',
      })
        .input(z.object({ exportId: z.string().min(1) }))
        .output(eventIterator(ExportProgressSchema)),
    },
  },
}

function demoEndpoint(request: Request): Response {
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.pathname !== '/api/v1/reports/exports/exp-42/progress')
    return new Response(null, { status: 404 })

  const events: ExportProgress[] = [
    { completed: 0, total: 3, state: 'running' },
    { completed: 2, total: 3, state: 'running' },
    { completed: 3, total: 3, state: 'ready' },
  ]
  const encoder = new TextEncoder()
  let canceled = false
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      await new Promise(resolve => setTimeout(resolve, 100))
      if (canceled)
        return
      const progress = events.shift()
      if (!progress) {
        controller.close()
        return
      }

      // Format an SSE message for the oRPC client and finish after the final event.
      controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(progress)}\n\n`))
      if (progress.state === 'ready')
        controller.close()
    },
    cancel() {
      canceled = true
    },
  })
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}

export async function watchReportExport(
  config: ApiClientConfig,
  exportId: string,
  signal: AbortSignal,
  render: (progress: ExportProgress) => void,
) {
  const progressClient = apiClient.create(progressContract)
  const ready = await progressClient.init(config)
  if (!ready.success)
    return ready

  try {
    const events = await progressClient.reports.exports.watchProgress({ exportId }, { signal })
    if (!(Symbol.asyncIterator in events))
      return events
    for await (const progress of events) {
      render(progress)
      if (progress.state === 'ready')
        return { success: true as const, data: progress }
    }
    throw new Error('The connection closed before the export was ready')
  }
  finally {
    await progressClient.close()
  }
}

export async function runReportProgressDemo() {
  const controller = new AbortController()
  const config: ApiClientConfig = {
    baseUrl: 'https://reports.example.test/api/v1',
    fetch: async (input, init) => demoEndpoint(new Request(input, init)),
  }
  const snapshots: string[] = []
  const result = await watchReportExport(config, 'exp-42', controller.signal, ({ completed, total }) => {
    snapshots.push(`${completed}/${total}`)
  })
  if (!result.success)
    return result
  return { success: true as const, data: { snapshots, downloadEnabled: result.data.state === 'ready' } }
}
```

Expected results are `data.snapshots: ['0/3', '2/3', '3/3']` and `downloadEnabled: true`. Change the ID to `exp-99` to check a 404 before the stream starts. In production, the GET handler checks the session and the job's ownership, then sends progress events in the same frame format. Add the progress procedure to the report contract to share the signed-in reporting client. On unmount, call `abort()` to stop reading. Failures or cancellation after setup propagate through iteration. The service still owns the export job.

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
