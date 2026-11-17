# @h-ai/api-client API reference

<!-- translation: partial -->

[Chinese source](api-client.md) · [Configuration](../configuration/api-client.en.md) · [Data structures](../data/api-client.en.md)

<a id="quick-start"></a>

Create one typed client from the same contract used by Serv or Kit. Initialize it before requests, handle each `HaiResult`, and close it when the owner releases it.

<a id="api-reference"></a>

| API | Input and result | Example |
| --- | --- | --- |
| `apiClient.create(contract)`, `client.init(config)`, `client.close()` | Create an isolated instance. Init returns `Promise<HaiResult<void>>`; close releases the instance and invalidates in-flight refreshes. | `await client.init({ baseUrl: 'https://example.test/api/v1' })` |
| `client.auth.setTokens(pair)`, `clear()`, `onTokenRefreshed(fn)` | Write or clear local credentials. Observe a successful persisted refresh and receive an unsubscribe function. | `const off = client.auth.onTokenRefreshed(onRefresh)` |
| `apiClient.tokenStorage.memory()`, `httpOnlyCookie()` | Create isolated memory storage or the browser cookie adapter. Both expose access/refresh reads and writes and clearing. | `const storage = apiClient.tokenStorage.memory()` |
| `apiClient.createAuthActions(client)` | Build actions for publicConfig, createCaptcha, login, register, sendOtp, requestPasswordReset, confirmPasswordReset, renewPassword, reauthenticate, and bindPageExit. | `const actions = apiClient.createAuthActions(client)` |
| `apiClient.observeRequests(observer)` | Receive redacted logical request records and return an unsubscribe function. | `const stop = apiClient.observeRequests(onRequest)` |
| `client.iam`, `client.ai`, `client.storage`, `client.payment`, `client.feedback` | Domain operations are available when included in the contract. Input types come from their endpoint schemas. | `await client.iam.auth.publicConfig()` |

Refresh credentials are distinct from server logout. Use the IAM logout endpoint to invalidate the server session. Recovery after refresh failure must restore the same user.

Additional options and workflow examples are available in the [Chinese reference](api-client.md).
