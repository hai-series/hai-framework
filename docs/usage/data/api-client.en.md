# @h-ai/api-client Data Structures

[简体中文](api-client.md) · [日本語](api-client.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/api-client.en.md) · [API reference](../function/api-client.en.md)

When an access token expires, API Client uses the refresh credential to get a replacement and retry the request. The selected token storage adapter manages credentials, and the caller consumes the API result.

## Credential storage

The client owns local credential storage; IAM persists server-side sessions.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `apiClient.tokenStorage.httpOnlyCookie()` | Default adapter. Access tokens begin empty and expire from memory on reload. The browser sends the server-set refresh cookie. |
| `apiClient.tokenStorage.memory()` | Both tokens start empty and live until cleared or the instance is discarded. Isolate each SSR request. |
| `TokenStorage` | Application-supplied adapter. A native app can use the platform secure store. The default browser adapter does not use localStorage. |

<a id="example-data"></a>

### Login credentials held by a client

The client sends an access token and may use a refresh token to renew credentials.

```json
{
  "accessToken": "<access-token:redacted>",
  "refreshToken": "<refresh-token:redacted>"
}
```

This is a redacted inspection view. The default browser refresh token stays in an HttpOnly cookie, unreadable to page code, and must not be copied into localStorage.

<a id="response-data"></a>

## Request and response data

### One API call result

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
