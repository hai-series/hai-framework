# @h-ai/api-client Data Structures

[简体中文](api-client.md) · [日本語](api-client.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/api-client.en.md) · [API reference](../function/api-client.en.md)

When an application enables `auth`, the client can renew an expired access token with the refresh credential. The application uses its selected `TokenStorage` for local credentials and reads the API result to determine the business outcome.

<a id="browser-storage"></a>

## Credential storage

The client creates no SQL tables or Redis keys. [IAM](iam.en.md) persists sessions on the server. Calling `client.close()` releases client resources. The host still owns the supplied storage. The logout endpoint revokes the server session and clears the browser's refresh cookie through its response. The application then uses `client.auth.clear()` for local credentials.

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

After saving the access token, the sign-in page can call `client.iam.auth.currentUser()` to load the account. Check `success`, then use `data` to display the profile or `error` to handle the failure.

```json
{
  "success": true,
  "data": {
    "id": "u-42",
    "username": "alice",
    "accountStatus": "active",
    "createdAt": "2026-05-20T10:00:00.000Z",
    "updatedAt": "2026-05-20T10:15:00.000Z",
    "roles": ["member"],
    "permissions": []
  }
}
```

This excerpt shows the current user's profile, roles and permissions. The client preserves ISO date strings after validation. The application can display them in the user's time zone. Reloading the page requires fetching the profile again, and the server checks permissions on each request. Custom endpoints can return a bare JSON value or SSE. Check for a failed `HaiResult` before using those results. See [custom responses](../function/api-client.en.md#custom-response-results).
