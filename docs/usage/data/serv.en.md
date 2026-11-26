# @h-ai/serv Data Structures

[简体中文](serv.md) · [日本語](serv.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/serv.en.md) · [API reference](../function/serv.en.md) · [Order console tutorial](../getting-started/serv.en.md)

When the order console loads a report, Serv passes the verified auditor and the request ID to the report handler. A successful sign-in or refresh can set the browser cookie used for the next refresh.

<a id="runtime-data"></a>

## Request context

`ServContext` lives for the duration of a business request. Handlers use the following fields to identify the user and their permissions and to correlate the response with logs.

| Field | When to read it and what it means |
| --- | --- |
| `requestId` | Diagnostic ID matching the response’s `X-Request-Id`. Anonymous requests also have an ID. |
| `session` | Uses the shared `HttpSession` type. Required fields are `userId`, `roles`, and `permissions`. Optional fields are `username`, `displayName`, `avatarUrl`, and application-defined `data`. Absent on unauthenticated requests. |
| `ip` | Client address resolved using the trusted proxy rules. Absent when no trusted address is available. |
| `locale` | Locale selected for this request. |
| `terminalType`, `userAgent` | Client category and optional User-Agent. The default context treats an unknown terminal as `web`. These fields are for application and logging context. |
| `scopeId` | Optional business scope supplied by the host’s trusted context factory, such as the auditor’s organization. The default context does not read it from request headers. |
| `request`, `logger` | The current request and logger, available on the server for handling and diagnostics. |
| `accessToken` | The access token extracted from the Bearer header, available on the server. Read `session` to determine whether authentication succeeded. |

Both Serv’s `ServSession` and Kit’s `SessionData` use `HttpSession` from `@h-ai/core`. On successful authentication, the host passes these fields to the current request and removes `data._tokenPair`. IAM continues to own session storage, renewal, and revocation. [IAM session data](iam.en.md)

<a id="example-data"></a>

### User identity and request ID passed to a handler

Handlers use context to identify the user, permissions and request to investigate.

```json
{
  "requestId": "request-42",
  "locale": "zh-CN",
  "ip": "192.0.2.42",
  "terminalType": "web",
  "session": {
    "userId": "user-42",
    "roles": [
      "auditor"
    ],
    "permissions": [
      "reports:read"
    ]
  }
}
```

request-42 is a diagnostic ID; verified user-42 can read the report. Request and logger objects are omitted. Never trust client-supplied roles as session data.

## Database

Serv creates zero database tables. The application stores business data such as orders and reports. [IAM](iam.en.md) manages sessions when enabled.

When A2A is enabled, the host handles HTTP and the AI module stores task events and messages. [A2A task and message data](ai.en.md#table-hai-ai-a2a-journal)

## Cache

With Redis rate limiting enabled, Serv and Kit use the one key family below. The limiter uses the trusted client IP by default or a custom subject key from the application. It computes the hex digest with `SHA-256(JSON.stringify([namespace, windowMs, key]))`. Cache adds its `keyPrefix` to the Redis key. Instances count into the same record when the Redis database, prefix, namespace, window and subject match. An in-process store counts separately and writes no Redis keys. [Crypto](crypto.en.md) owns key registrations and replay records. [Rate-limit setup](../getting-started/serv.en.md#orders-console-access)

| Key or family | Purpose | Default expiry and cleanup |
| --- | --- | --- |
| [`hai:kit:ratelimit:{<digest>}`](#cache-http-rate-limit) | Limit request frequency for one subject or business scope. | `windowMs` milliseconds from the first successful counter write. Increments preserve expiry. The next request after expiry starts a new count. |

<a id="cache-http-rate-limit"></a>

### `hai:kit:ratelimit:{<digest>}`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `count` | `integer` | — | Requests counted in this window, starting at `1`. The default limiter also counts requests above the limit. | `2` |
| `resetAt` | `integer` | — | Estimated end time in Unix milliseconds, set on the first write. The shared store uses actual Redis key expiry. | `1794873660000` |

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

| Key | When it is written and for how long |
| --- | --- |
| `hai_refresh_token` | When enabled, the server sets a refresh cookie scoped to the API refresh path. Default duration is 30 days. HttpOnly and SameSite=Strict; Secure follows its environment or explicit setting. |
| Cookie removal | On successful explicit logout, the server clears the same cookie name and path with `Max-Age=0`. A failed refresh leaves the current cookie intact. |

### Cookie for renewing browser login

With browser refresh cookies enabled, a successful sign-in, registration or refresh sets the new refresh token in the cookie and removes it from the corresponding success body. The browser sends the cookie according to its attributes when the client requests the refresh route. The client decides when to refresh.

```http
Set-Cookie: hai_refresh_token=<redacted>; Path=/api/v1/auth/refresh; Max-Age=2592000; HttpOnly; SameSite=Strict; Secure
```

This redacted production HTTPS response uses the default API prefix. Changing the prefix moves the refresh route and its cookie path. Cookie retention and server-side token expiry are checked separately.

Trusted native clients can receive tokens in the authentication response. Device storage is covered in [Capacitor](capacitor.en.md).

## Report audio data

The HTTP speech endpoints send input to the configured model and return the result in the same request. The Serv media routes write no recordings, generated files or transcripts to the application database. To keep an audit note, the application can save the text after the user confirms it.

| Operation | Input | Result |
| --- | --- | --- |
| Read the report aloud | JSON `text` and optional `format` | A WAV or MP3 file on success, such as `speech.mp3` (`audio/mpeg`). |
| Transcribe an audit note | A multipart `audio` file, WAV or MP3, up to 8 MiB | JSON `data.text`, with optional `language` and `durationMs` in milliseconds if supplied by the model. |

```json
{
  "success": true,
  "data": { "text": "Quarterly summary", "language": "en", "durationMs": 1250 }
}
```

This is a transcription response. The page can copy `data.text` into the note field. With real-time WebSocket audio, IAM manages the short-lived, single-use ticket for connection authorization. [HTTP speech tutorial](../getting-started/serv.en.md#orders-console-audio) · [IAM ticket record](iam.en.md#cache-iam-ticket)

The real-time ticket response contains `ticket` and `expiresAt` in Unix milliseconds. The default lifetime is 30 seconds. Each ticket is bound to the account and operation and consumed atomically on connection. `serv.createIamAudio()` rechecks IAM permission and holds the connection authorization for the lifetime of that session.
