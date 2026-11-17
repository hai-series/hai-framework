# @h-ai/api-client Configuration

[Chinese source](api-client.md) · [Data structures](../data/api-client.en.md) · [API reference](../function/api-client.en.md)

Pass these options to `apiClient.init()` after creating a client from the application contract. Browser cookies are handled by the server and Fetch. For SSR, create a separate client and storage instance per request.

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `baseUrl` | Required | Full API base URL, including its prefix. |
| `timeout` | `30000` ms | Deadline for headers and JSON. Streaming reads use the caller's abort signal. |
| `clientName` | `hai-api-client` | Value of `x-request-client` for diagnostics. |
| `headers`, `fetch` | Optional | Additional static or computed headers and an optional Fetch implementation. Defaults to global Fetch. |
| `auth` | `undefined` | Pass `{}` to enable default authentication and refresh. |
| `auth.storage` | `apiClient.tokenStorage.httpOnlyCookie()` | Access token in browser memory. Refresh cookie remains server-managed. |
| `auth.refreshPath` | `/auth/refresh` | Endpoint relative to the base URL. |
| `auth.refreshTimeoutMs` | `10000` | Refresh deadline in milliseconds. Keep existing credentials on timeout. |
| `auth.terminalType` | `web` | Allowed IAM terminal type: `web`, `app`, `desktop`, or `api`. |
| `auth.recoverSession` | Optional | Restore the same session after a definitive refresh failure. Returning true retries the original request once. |
| `auth.onTokenRefreshed`, `auth.onRefreshFailed` | Optional | Update application state after successful refresh or definitive failure. |
| `transport` | `undefined` | Pass an object to enable application-level request encryption. |
| `transport.crypto` | Required | Initialized `@h-ai/crypto` instance when transport encryption is used. |
| `transport.keyExchangePath` | `/_hai/key-exchange` | Key exchange path relative to the base URL. |
| `transport.maxPlaintextBytes` | Optional | Uses the server limit unless the caller sets a smaller limit. |
