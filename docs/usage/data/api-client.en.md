# @h-ai/api-client Data structures

[Chinese source](api-client.md) · [Configuration](../configuration/api-client.en.md) · [API reference](../function/api-client.en.md)

The client owns local credential storage; IAM persists server-side sessions.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `apiClient.tokenStorage.httpOnlyCookie()` | Default adapter. Access tokens begin empty and expire from memory on reload. The browser sends the server-set refresh cookie. |
| `apiClient.tokenStorage.memory()` | Both tokens start empty and live until cleared or the instance is discarded. Isolate each SSR request. |
| `TokenStorage` | Application-supplied adapter. A native app can use the platform secure store. The default browser adapter does not use localStorage. |
