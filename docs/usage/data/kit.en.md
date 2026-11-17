# @h-ai/kit Data structures

[Chinese source](kit.md) · [Configuration](../configuration/kit.en.md) · [API reference](../function/kit.en.md)

Kit owns request handling. Session persistence belongs to IAM, and encrypted transport state belongs to Crypto.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai:kit:ratelimit:{<digest>}` | Counter value holds `count` and `resetAt` in milliseconds. The digest binds application namespace, window and subject. Use the shared Redis adapter across server instances. |
| `hai_access_token` | Configurable authentication cookie containing the access token. |
