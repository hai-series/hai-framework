# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

Requests and token refresh use the current `core.i18n` locale as `Accept-Language`, so server errors follow the interface language. Set this header in `headers` to override it.

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md)

A cross-platform oRPC/OpenAPI typed client for hai-framework, with consistent API calls and token management across Web, apps, and mini programs.

## Quick Start

`close()` invalidates retired refreshes and drains credential writes while preserving external TokenStorage values. After close completes, the same storage may be reused. `timeout` covers headers, the complete JSON body, and every unsuccessful response body, including HTML error pages. Timeout or cancellation prevents token refresh. The built-in Cookie adapter includes credentials for login and refresh, requiring explicit credentialed CORS origins; memory and native storage preserve the original request credentials. Custom application streams remain incremental and their bodies use the caller signal for cancellation.

```ts
import type { IamAuthLoginInput } from '@h-ai/api-client'
import { apiClient } from '@h-ai/api-client'

async function loginAndLoadProfile(input: IamAuthLoginInput) {
  const initialized = await apiClient.init({ baseUrl: '/api/v1', auth: {} })
  if (!initialized.success)
    return initialized
  try {
    const actions = apiClient.createAuthActions(apiClient)
    const loggedIn = await actions.login(input)
    if (!loggedIn.success)
      return loggedIn
    const profile = await apiClient.iam.auth.currentUser()
    if (!profile.success)
      return profile
    return profile
  }
  catch (writeError) {
    try {
      await apiClient.auth.clear()
    }
    catch (cleanupError) {
      throw new AggregateError([writeError, cleanupError], 'Credential persistence and cleanup failed')
    }
    throw writeError
  }
  finally {
    await apiClient.close()
  }
}
```

## Configuration Reference

Set the API address, authentication, request behavior and transport encryption through `ApiClientConfig`.

See the [configuration reference](../../docs/usage/configuration/api-client.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/api-client.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `init` / `create` / `close` / `config` / `isInitialized` — Initialize the default client or create an independent instance
- `auth` / `tokenStorage` / `createAuthActions` — Supply credentials, refresh sessions and build authentication actions
- `iam` / `storage` / `ai` / `observeRequests` — Call domain APIs and observe logical request state

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/api-client.md) in Chinese for in-memory request and session state, cookies and pluggable credential storage.

## Development and Testing

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

Clients learn `transport.maxPlaintextBytes` from server key exchange. An explicit local limit selects the smaller value. Capacity failures return `HaiApiClientError.PAYLOAD_TOO_LARGE` (`hai:api-client:020`) with direction, stage and byte diagnostics. See [capacity and upgrade](../crypto/TRANSPORT-CAPACITY.md).

Serv/Kit return an encrypted HTTP 400 for an out-of-window request after validating request binding, signature and MAC. The client throws `TransportTimeError` (`hai:crypto:071`), displays the server’s UTC time at validation, and asks the user to enable automatic synchronization or set the device time manually before refreshing. `serverTime` is Unix milliseconds. `api-client` maps the error to `VALIDATION_FAILED` and preserves `cause.transportCode` and `cause.serverTime`.

## License

Apache-2.0
