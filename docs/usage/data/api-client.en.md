# @h-ai/api-client Data Structures

[简体中文](api-client.md) · [日本語](api-client.ja.md)

[Data structures index](README.en.md) · [Module configuration](../configuration/api-client.en.md) · [API reference](../function/api-client.en.md)

The client writes login credentials to the application's chosen `TokenStorage`, returns endpoint responses to callers, and sends request summaries to subscribers. It creates no database tables, cache keys, or data files. [IAM](iam.en.md) stores server sessions and business modules store their own records. The application decides whether to retain endpoint results and request summaries.

<a id="browser-storage"></a>

## Credential storage

Pass `auth: {}` to enable the default cookie storage. Set `auth.storage` to select another adapter. When sign-in through `apiClient.createAuthActions(client)` or automatic refresh succeeds, the client's selected storage receives the server-issued tokens. If calling the login operation directly, use `client.auth.setTokens(tokens)` to write the successful result's tokens. Use `client.auth` to update or clear credentials for an initialized client. See [authentication actions](../function/api-client.en.md#auth-actions).

| Storage | Data | Retention and cleanup |
| --- | --- | --- |
| `apiClient.tokenStorage.httpOnlyCookie()` | The adapter holds the access token in memory. The browser holds the HttpOnly refresh cookie set by the server through `Set-Cookie`. Page JavaScript cannot read the token it contains. | Reloading a page discards the memory token with the old runtime. The browser retains, sends, and clears the refresh cookie according to its attributes. The adapter's `clear()` clears its in-memory state. |
| `apiClient.tokenStorage.memory()` | Each adapter holds the available access and refresh tokens in memory. | A new adapter starts empty. Data is retained until cleared explicitly or the adapter is discarded with its runtime. Create a separate client and storage adapter for each SSR request. |
| Application-supplied `TokenStorage` | The adapter implements asynchronous reads, writes, and cleanup for both tokens. Native apps can use [Capacitor secure storage](capacitor.en.md). | The adapter controls retention. Persistent adapters can recover credentials after an app restart. Use HttpOnly mode for browser refresh credentials. |

To sign out, call the application's server logout endpoint, such as `client.iam.auth.logout({})`. Check for success to confirm server-side revocation. In cookie mode, the server clears the refresh cookie through its response. Call `client.auth.clear()` to clear local credentials regardless of the server result. `client.close()` waits for ongoing storage operations and releases client runtime state and observation subscriptions. The application remains responsible for injected storage. See [credential refresh](../function/api-client.en.md#credentials), [client lifecycle](../function/api-client.en.md#client-lifecycle), and [Serv sessions and cookies](serv.en.md).

See [adapter methods](../function/api-client.en.md#token-storage-methods) for the read and write contracts and an in-memory example.

<a id="example-data"></a>

### Login credentials held by a client

This is a redacted `TokenPair` that a trusted client receives in the server response body. `accessToken` goes in the `Authorization: Bearer ...` request header, and `expiresIn` is its lifetime in seconds. `tokenType` is always `"Bearer"`. The optional `refreshToken` field is omitted from the body when the server uses an HttpOnly refresh cookie.

```json
{
  "accessToken": "<access-token:redacted>",
  "refreshToken": "<refresh-token:redacted>",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

<a id="response-data"></a>

## Request and response data

The contract determines each operation's path parameters, query parameters, request body, and response structure. The client sends data according to the operation's definition. The server stores business records. Framework operations generally return `HaiResult<T>`. Check `success` first. Read `data` on success, or use `error.code` to handle failure. `error.message` provides diagnostic text and `error.traceId` can correlate the request.

Custom operations may declare a bare JSON value or an SSE stream. A successful call returns that value or an iterable stream directly. A failed request can still return the failure branch of `HaiResult`. Check for the failure branch before using the value or iterating the stream. See [custom responses](../function/api-client.en.md#custom-response-results).

### One API call result

After login, a successful call to `client.iam.auth.currentUser()` returns the profile, roles, and permissions. Dates remain ISO strings. The application can display them in the user's time zone.

```json
{
  "success": true,
  "data": {
    "id": "u-42",
    "username": "alice",
    "accountStatus": "active",
    "createdAt": "2026-05-20T10:00:00.000Z",
    "updatedAt": "2026-05-20T10:15:00.000Z",
    "roles": ["member"],
    "permissions": []
  }
}
```

A call before client initialization returns the failure branch. After checking `success`, use `error.code` to identify the initialization failure. The message text depends on the client's locale.

```json
{
  "success": false,
  "error": {
    "code": "hai:api-client:010",
    "message": "Internal error (traceId: request-42)",
    "traceId": "request-42",
    "httpStatus": 500,
    "system": "hai",
    "module": "api-client"
  }
}
```

<a id="request-records"></a>

## Request observation records

`client.observeRequests(observer)` delivers one read-only `ApiRequestRecord` per logical call. Refreshes and retries are part of the original call. SSE produces a summary when the stream is returned. The subscriber chooses the destination and retention period. See the [request observation API](../function/api-client.en.md#transport-observation).

| Field | Type | Meaning |
| --- | --- | --- |
| `requestId` | `string` | Correlation ID from the current request context or generated by the client. It can be updated when a valid correlation ID arrives from the server. |
| `procedure` | `string` | Operation path within the contract, such as `reports.get`. |
| `timestamp`, `duration` | `number` | Unix start time in milliseconds and elapsed time in milliseconds, respectively. |
| `success`, `errorCode` | `boolean`, optional `string` | Call outcome and error code when available. A business failure returned with HTTP 200 still sets `success: false`. |
| `attempts` | `number` | Original request send count including retries. Zero if it never went out. Refreshes and key exchanges are excluded. |
| `method`, `url` | optional `string` | HTTP method and sanitized URL. The URL retains the actual path with substituted parameters and removes the query string and fragment. |
| `status` | optional `number` | HTTP status of the received response. |

For example, the first successful attempt for `reports.get` can produce the summary below. The record contains neither request nor response headers or bodies. Apply the application's logging rules to any business identifiers in the URL before forwarding the record.

```json
{
  "requestId": "request-42",
  "procedure": "reports.get",
  "timestamp": 1779271200000,
  "duration": 18,
  "success": true,
  "attempts": 1,
  "method": "GET",
  "url": "https://app.example.com/api/v1/reports/r-42",
  "status": 200
}
```
