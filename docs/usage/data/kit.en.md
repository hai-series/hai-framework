# @h-ai/kit Data structures

[简体中文](kit.md) · [日本語](kit.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/kit.en.md) · [API reference](../function/kit.en.md)

When an application enables rate limiting, Kit stores a visitor’s request count for the current window. For browser requests it also reads authentication cookies and can wrap cookie data as configured by the host.

## Cache

Kit uses one key family when the application selects shared rate-limit storage. `digest` is the SHA-256 digest of the namespace, `windowMs` and rate-limited subject. Redis adds Cache's `keyPrefix`. Shared Redis gives instances a common count. With in-process storage, each process counts separately.

| Key or family | Purpose | Default expiry and cleanup |
| --- | --- | --- |
| [`hai:kit:ratelimit:{<digest>}`](#cache-kit-rate-limit) | Limit request frequency for one subject or business scope. | `windowMs` milliseconds from the first request. Increments preserve expiry. The next request after expiry starts a new count. |

<a id="cache-kit-rate-limit"></a>

### `hai:kit:ratelimit:{<digest>}`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `count` | `integer` | — | Requests counted in this window. The first write stores `1`. | `2` |
| `resetAt` | `number` | — | First request time plus the window duration in Unix milliseconds. Used to estimate remaining time for response headers. | `1794873660000` |

<a id="example-data"></a>

<a id="requests-counted-in-one-window"></a>

#### Example · Requests counted in one window

Count requests for one visitor or scope; sharing it prevents each node granting a separate allowance.

```json
{
  "count": 2,
  "resetAt": 1794873660000
}
```

count:2 means two requests so far. resetAt is the end of this example's 60-second window in Unix milliseconds; increments do not extend it.

## Browser storage

The browser holds cookies and sends them with requests.

| Cookie | Value and retention |
| --- | --- |
| `hai_access_token` | `hai_access_token` holds the access token by default and has a configurable name. It uses `Path=/`, `HttpOnly` and `SameSite=Lax`, with `Secure` in production. `Max-Age` follows the issued lifetime. Bearer takes priority if supplied. |
| Application cookie selected for encryption | The encrypted value starts with `enc:v2:` and keeps the original cookie expiry. See [Crypto](crypto.en.md) for keys and transport state. |

### Access cookie sent with browser requests

Kit reads and verifies the cookie before exposing user identity to handlers.

```json
"<access-token:redacted>"
```

The redacted cookie defaults to HttpOnly, SameSite=Lax and Path=/. Lifetime follows login output; editing claimed roles grants nothing.

### An application cookie selected for encryption

Encrypt and verify selected application cookie values against disclosure and tampering.

```json
"enc:v2:<encrypted-content>"
```

enc:v2: identifies the format. The placeholder cannot decrypt, is not a request-replay marker, and does not change the cookie’s expiry.
