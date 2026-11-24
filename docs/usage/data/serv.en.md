# @h-ai/serv Data structures

[简体中文](serv.md) · [日本語](serv.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/serv.en.md) · [API reference](../function/serv.en.md)

Serv passes the authenticated identity and trace ID to the route handling a request. When refresh cookies are enabled, the browser keeps the credential for the next refresh.

<a id="runtime-data"></a>

## In-process data

Serv creates request-scoped context rather than an application database. The business modules own persistence.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| Request context | Trusted request and client context lives only for the request. IAM owns tokens and sessions, and Crypto owns the transport registry. |

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
      "reader"
    ],
    "permissions": [
      "orders.read"
    ]
  }
}
```

request-42 is a diagnostic ID; verified user-42 can read orders. Request and logger objects are omitted. Never trust client-supplied roles as session data.

## Browser storage

| Key | When it is written and for how long |
| --- | --- |
| `hai_refresh_token` | When enabled, the server sets a refresh cookie scoped to the API refresh path. Default duration is 30 days. HttpOnly and SameSite=Strict; Secure follows its environment or explicit setting. |

### Cookie for renewing browser login

Browsers automatically send the refresh cookie to renew tokens; page scripts cannot read it.

```json
"<refresh-token:redacted>"
```

Redacted; defaults are 30 days, HttpOnly, SameSite=Strict and the refresh route’s Path. A surviving cookie cannot revive an invalid server token.
