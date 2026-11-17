# @h-ai/api-client Data structures

[Chinese source](api-client.md) · [Configuration](../configuration/api-client.en.md) · [API reference](../function/api-client.en.md)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

### Login credentials held by a client

Structure: `TokenStorage`.

The client sends an access token and may use a refresh token to renew credentials.

```json
{
  "accessToken": "<access-token:redacted>",
  "refreshToken": "<refresh-token:redacted>"
}
```

This is a redacted inspection view. The default browser refresh token stays in an HttpOnly cookie, unreadable to page code, and must not be copied into localStorage.

### One API call result

Structure: `HaiResult<T>`.

An API result tells the client whether business processing succeeded. Check success before reading data.

```json
{
  "success": true,
  "data": {
    "id": "order-42",
    "status": "created"
  }
}
```

The server created order-42. This result is not a cache entry and does not persist across page reloads automatically.

## Field, storage and cleanup reference

The client owns local credential storage; IAM persists server-side sessions.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `apiClient.tokenStorage.httpOnlyCookie()` | Default adapter. Access tokens begin empty and expire from memory on reload. The browser sends the server-set refresh cookie. |
| `apiClient.tokenStorage.memory()` | Both tokens start empty and live until cleared or the instance is discarded. Isolate each SSR request. |
| `TokenStorage` | Application-supplied adapter. A native app can use the platform secure store. The default browser adapter does not use localStorage. |
