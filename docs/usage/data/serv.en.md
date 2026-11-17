# @h-ai/serv Data structures

[Chinese source](serv.md) · [Configuration](../configuration/serv.en.md) · [API reference](../function/serv.en.md)

Serv creates request-scoped context rather than an application database. The business modules own persistence.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_refresh_token` | When enabled, the server sets a refresh cookie scoped to the API refresh path. Default duration is 30 days. HttpOnly and SameSite=Strict; Secure follows its environment or explicit setting. |
| Request context / リクエスト情報 | Trusted request and client context lives only for the request. IAM owns tokens and sessions, and Crypto owns the transport registry. |
