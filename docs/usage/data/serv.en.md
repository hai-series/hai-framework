# @h-ai/serv Data structures

[Chinese source](serv.md) · [Configuration](../configuration/serv.en.md) · [API reference](../function/serv.en.md)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

### Identity and metadata for one request

Structure: `ServContext`.

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
      "reader"
    ],
    "permissions": [
      "orders.read"
    ]
  }
}
```

request-42 is a diagnostic ID; verified user-42 can read orders. Request and logger objects are omitted. Never trust client-supplied roles as session data.

### Cookie for renewing browser login

Structure: `hai_refresh_token`.

Browsers automatically send the refresh cookie to renew tokens; page scripts cannot read it.

```json
"<refresh-token:redacted>"
```

Redacted; defaults are 30 days, HttpOnly, SameSite=Strict and the refresh route’s Path. A surviving cookie cannot revive an invalid server token.

## Field, storage and cleanup reference

Serv creates request-scoped context rather than an application database. The business modules own persistence.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_refresh_token` | When enabled, the server sets a refresh cookie scoped to the API refresh path. Default duration is 30 days. HttpOnly and SameSite=Strict; Secure follows its environment or explicit setting. |
| Request context / リクエスト情報 | Trusted request and client context lives only for the request. IAM owns tokens and sessions, and Crypto owns the transport registry. |
