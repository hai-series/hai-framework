# @h-ai/kit Data structures

[Chinese source](kit.md) · [Configuration](../configuration/kit.en.md) · [API reference](../function/kit.en.md)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

### Requests counted in one window

Structure: `rate-limit cache value`.

Count requests for one visitor or scope; sharing it prevents each node granting a separate allowance.

```json
{
  "count": 2,
  "resetAt": 1794873660000
}
```

count:2 means two requests so far. resetAt ends this example 60-second window; increments do not extend it.

### Access cookie sent with browser requests

Structure: `hai_access_token`.

Kit reads and verifies the cookie before exposing user identity to handlers.

```json
"<access-token:redacted>"
```

The redacted cookie defaults to HttpOnly, SameSite=Lax and Path=/. Lifetime follows login output; editing claimed roles grants nothing.

### An application cookie selected for encryption

Structure: `encrypted application cookie`.

Encrypt and verify selected application cookie values against disclosure and tampering.

```json
"enc:v2:<encrypted-content>"
```

enc:v2: identifies the format. The placeholder cannot decrypt, is not a request-replay marker, and does not change the cookie’s expiry.

## Field, storage and cleanup reference

Kit owns request handling. Session persistence belongs to IAM, and encrypted transport state belongs to Crypto.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai:kit:ratelimit:{<digest>}` | Counter value holds `count` and `resetAt` in milliseconds. The digest binds application namespace, window and subject. Use the shared Redis adapter across server instances. |
| `hai_access_token` | Configurable authentication cookie containing the access token. |
