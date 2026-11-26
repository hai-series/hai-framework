# @h-ai/kit Data Structures

[简体中文](kit.md) · [日本語](kit.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/kit.en.md) · [API reference](../function/kit.en.md) · [Order console tutorial](../getting-started/kit.en.md)

When the order console loads a report, Kit passes the verified auditor and request ID to SvelteKit server pages and endpoints. The configured rate-limit store counts partner requests for external reports.

<a id="runtime-data"></a>

## Request context

`kit.createHandle()` writes request context to SvelteKit’s `event.locals`. Server load functions, actions, and API guards read it while handling the request.

| Field | When to read it and what it means |
| --- | --- |
| `event.locals.requestId` | Diagnostic ID matching the response’s `X-Request-Id`. Anonymous requests also have an ID. |
| `event.locals.session` | Uses the shared `HttpSession` type. Required fields are `userId`, `roles`, and `permissions`. Optional fields are `username`, `displayName`, `avatarUrl`, and application-defined `data`. Absent on unauthenticated requests. |
| `event.getClientAddress()` | Reads the client address resolved by the trusted proxy rules. It can throw during prerendering or when no trustworthy address is available. |
| `event.locals.accessToken` | The verified access token for the current request, available on the server. |

Both Serv’s `ServSession` and Kit’s `SessionData` use `HttpSession` from `@h-ai/core`. On successful authentication, the host passes these fields to the current request and removes `data._tokenPair`. IAM continues to own session storage, renewal, and revocation. [IAM session data](iam.en.md)

The following is an excerpt of the server-side data.

```json
{
  "requestId": "request-42",
  "session": {
    "userId": "user-42",
    "roles": ["auditor"],
    "permissions": ["reports:read"]
  }
}
```

Use `request-42` to correlate the handler with the response's `X-Request-Id`. Anonymous requests also have an ID. Return only the display fields the browser needs and keep `locals.accessToken` on the server. [Request pipeline](../function/kit.en.md#hooks)

## Database

Kit creates zero database tables. The application stores business data such as orders and reports. [IAM](iam.en.md) manages sessions when enabled.

When A2A is enabled, the host handles HTTP and the AI module stores task events and messages. [A2A task and message data](ai.en.md#table-hai-ai-a2a-journal)

## Cache

With Redis rate limiting enabled, Serv and Kit use the one key family below. The limiter uses the trusted client IP by default or a custom subject key from the application. It computes the hex digest with `SHA-256(JSON.stringify([namespace, windowMs, key]))`. Cache adds its `keyPrefix` to the Redis key. Instances count into the same record when the Redis database, prefix, namespace, window and subject match. An in-process store counts separately and writes no Redis keys. [Crypto](crypto.en.md) owns key registrations and replay records. [Rate-limit setup](../getting-started/kit.en.md#orders-console-access)

| Key or family | Purpose | Default expiry and cleanup |
| --- | --- | --- |
| [`hai:kit:ratelimit:{<digest>}`](#cache-kit-rate-limit) | Limit request frequency for one subject or business scope. | `windowMs` milliseconds from the first successful counter write. Increments preserve expiry. The next request after expiry starts a new count. |

<a id="cache-kit-rate-limit"></a>

### `hai:kit:ratelimit:{<digest>}`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `count` | `integer` | — | Requests counted in this window, starting at `1`. The default limiter also counts requests above the limit. | `2` |
| `resetAt` | `integer` | — | Estimated end time in Unix milliseconds, set on the first write. The shared store uses actual Redis key expiry. | `1794873660000` |

<a id="example-data"></a>

#### Example · Requests counted in one window

Suppose the first counted request arrives at 00:00:00 UTC on November 17, 2026, with a 60-second window and a limit of two. This is the record after that client’s second request.

```json
{
  "count": 2,
  "resetAt": 1794873660000
}
```

With `count: 2`, the client has used its allowance. A third request in that window raises the count to `3` and receives HTTP 429 by default. The `resetAt` estimate remains 00:01:00 UTC. After Redis expires the key, the next request starts at `1`.

The stored `resetAt` uses milliseconds. The `X-RateLimit-Reset` header rounds it up to Unix seconds. On a limit response, `Retry-After` is the wait in seconds.

## Browser storage

The browser holds cookies and sends them with requests.

| Cookie | Value and retention |
| --- | --- |
| `hai_access_token` | `hai_access_token` holds the access token by default and has a configurable name. It uses `Path=/`, `HttpOnly` and `SameSite=Lax`, with `Secure` in production. `Max-Age` follows the issued lifetime. Bearer takes priority if supplied. |
| Application cookie selected for encryption | The encrypted value starts with `enc:v2:` and keeps the original cookie expiry. See [Crypto](crypto.en.md) for keys and transport state. |

### Access cookie sent with browser requests

Sign-in writes the issued access token. The authentication hook verifies it on later requests. Sign-out deletes the cookie using the same name and path, including when server-side revocation fails. The sign-out result reports a revocation failure to the caller.

```http
Set-Cookie: hai_access_token=<redacted>; Path=/; Max-Age=900; HttpOnly; SameSite=Lax; Secure
```

This is a redacted production HTTPS response. The example uses 900 seconds for `Max-Age`. The actual value comes from `tokens.expiresIn` in the sign-in result.

### An application cookie selected for encryption

Encrypt and verify selected application cookie values against disclosure and tampering.

```json
"enc:v2:<iv>:<ciphertext>:<mac>"
```

`enc:v2:` identifies the format. The next three fields stand for the random IV, ciphertext and authentication code. Kit uses the code to verify the cookie name and envelope. A modified or undecryptable value reads as `undefined`. The app reads the verified plaintext through `event.cookies.get("order_preferences")`.
