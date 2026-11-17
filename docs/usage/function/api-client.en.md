# @h-ai/api-client API reference

<!-- translation: partial -->

[Chinese source](api-client.md) · [Configuration](../configuration/api-client.en.md) · [Data structures](../data/api-client.en.md)

<a id="quick-start"></a>

## Quick start

Create one typed client from the same contract used by Serv or Kit. Initialize it before requests, handle each `HaiResult`, and close it when the owner releases it.

```ts
import type { IamAuthLoginInput } from '@h-ai/api-client'
import { apiClient } from '@h-ai/api-client'

async function loginAndLoadProfile(input: IamAuthLoginInput) {
  const initialized = await apiClient.init({ baseUrl: '/api/v1', auth: {} })
  if (!initialized.success)
    return initialized
  try {
    const actions = apiClient.createAuthActions(apiClient)
    const loggedIn = await actions.login(input)
    if (!loggedIn.success)
      return loggedIn
    const profile = await apiClient.iam.auth.currentUser()
    if (!profile.success)
      return profile
    return profile
  }
  catch (writeError) {
    try {
      await apiClient.auth.clear()
    }
    catch (cleanupError) {
      throw new AggregateError([writeError, cleanupError], 'Credential persistence and cleanup failed')
    }
    throw writeError
  }
  finally {
    await apiClient.close()
  }
}
```

<a id="api-reference"></a>

## API list

| API | Input and result | Example |
| --- | --- | --- |
| `apiClient.create(contract)`, `client.init(config)`, `client.close()` | Create an isolated instance. Init returns `Promise<HaiResult<void>>`; close releases the instance and invalidates in-flight refreshes. | `await client.init({ baseUrl: 'https://example.test/api/v1' })` |
| `client.auth.setTokens(pair)`, `clear()`, `onTokenRefreshed(fn)` | Write or clear local credentials. Observe a successful persisted refresh and receive an unsubscribe function. | `const off = client.auth.onTokenRefreshed(onRefresh)` |
| `apiClient.tokenStorage.memory()`, `httpOnlyCookie()` | Create isolated memory storage or the browser cookie adapter. Both expose access/refresh reads and writes and clearing. | `const storage = apiClient.tokenStorage.memory()` |
| `apiClient.createAuthActions(client)` | Build actions for publicConfig, createCaptcha, login, register, sendOtp, requestPasswordReset, confirmPasswordReset, renewPassword, reauthenticate, and bindPageExit. | `const actions = apiClient.createAuthActions(client)` |
| `apiClient.observeRequests(observer)` | Receive redacted logical request records and return an unsubscribe function. | `const stop = apiClient.observeRequests(onRequest)` |
| `client.iam`, `client.ai`, `client.storage`, `client.payment`, `client.feedback` | Domain operations are available when included in the contract. Input types come from their endpoint schemas. | `await client.iam.auth.publicConfig()` |

Refresh credentials are distinct from server logout. Use the IAM logout endpoint to invalidate the server session. Recovery after refresh failure must restore the same user.

Still untranslated: the extensive default-domain endpoints, authentication actions and refresh flows. Read the [Chinese source section](api-client.md#detailed-workflow).

<a id="call-options"></a>

## Call arguments and integration options

Call `apiClient.init(config)` to configure the default client. If your application defines its own contract, call `apiClient.create(contract)` and pass the settings to that instance's `init(config)`. The browser sends and stores cookies through Fetch and the server's responses. For SSR, create a separate client and token store per request.

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `baseUrl` | Required | The API base the client can reach. Use `/api/v1` for a browser on the same origin, or an absolute URL on an app or another origin. |
| `timeout` | `30000` ms | Deadline for headers and JSON. Streaming reads use the caller's abort signal. |
| `clientName` | `hai-api-client` | Value of `x-request-client` for diagnostics. |
| `headers` | No additional headers | Static object or a sync or async function returning headers. |
| `fetch` | Global `fetch` | Fetch-compatible function; preserve cancellation and cookie handling when providing one. |
| `auth` | `undefined` | Pass `{}` to enable default authentication and refresh. |
| `auth.storage` | `apiClient.tokenStorage.httpOnlyCookie()` | Access token in browser memory. Refresh cookie remains server-managed. |
| `auth.refreshPath` | `/auth/refresh` | Endpoint relative to the base URL. |
| `auth.refreshTimeoutMs` | `10000` | Refresh deadline in milliseconds. Keep existing credentials on timeout. |
| `auth.terminalType` | `web` | Allowed IAM terminal type: `web`, `app`, `desktop`, or `api`. |
| `auth.recoverSession` | Optional | Restore the same session after a definitive refresh failure. Returning true retries the original request once. |
| `auth.onTokenRefreshed` | May be omitted | Called after a successful refresh. Use it to update signed-in state. |
| `auth.onRefreshFailed` | May be omitted | Called after a definitive failure. Use it to prompt the user to sign in. |
| `transport` | `undefined` | Pass an object to enable application-level request encryption. |
| `transport.crypto` | Required | Initialized `@h-ai/crypto` instance when transport encryption is used. |
| `transport.keyExchangePath` | `/_hai/key-exchange` | Key exchange path relative to the base URL. |
| `transport.maxPlaintextBytes` | Optional | Uses the server limit unless the caller sets a smaller limit. |

<a id="client-integration"></a>

## Client addresses, deadlines and recovery

This integration guide was moved from the configuration handbook because it describes code arguments. The complete walkthrough is currently available in [Chinese](api-client.md#client-integration); this subsection is partially translated.
