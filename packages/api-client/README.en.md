# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

Requests and token refresh use the current `core.i18n` locale as `Accept-Language`, so server errors follow the interface language. Set this header in `headers` to override it.

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md)

A cross-platform oRPC/OpenAPI typed client for hai-framework, with consistent API calls and token management across Web, apps, and mini programs.

## Quick Start

`apiClient.close()` prevents refreshes already in flight from updating the session. It waits for credential writes already in progress and leaves values in external `TokenStorage` intact. You can reuse that storage when you initialize again.

The timeout covers the response headers, the full JSON body, and error bodies such as HTML error pages. A timed-out or cancelled call will not attempt to refresh the token. If your application reads a successful response stream itself, use its abort signal to stop reading.

The default cookie storage sends browser cookies for sign-in and refresh with `credentials: "include"`. If the page and API are on different origins, configure the API’s CORS policy to allow the page’s origin and credentials. Memory and native storage keep the `credentials` setting supplied by the application.

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

Pass the API base URL to `apiClient.init(config)`. Add credential storage, a request timeout, or transport encryption options as needed.

See the [configuration reference](../../docs/usage/configuration/api-client.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/api-client.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `apiClient.init` / `apiClient.create` / `apiClient.close` / `apiClient.config` / `apiClient.isInitialized` — Initialize the default client or create an independent instance
- `apiClient.auth` / `apiClient.tokenStorage` / `apiClient.createAuthActions` — Choose where to store credentials and create sign-in and session refresh actions
- `apiClient.iam` / `apiClient.storage` / `apiClient.ai` / `apiClient.observeRequests` — Call user, file, and AI APIs, or observe the result and duration of each completed call

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/api-client.md) in Chinese for where access and refresh tokens are stored and when they are removed.

## Development and Testing

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

Clients learn `transport.maxPlaintextBytes` from server key exchange. An explicit local limit selects the smaller value. Capacity failures return `HaiApiClientError.PAYLOAD_TOO_LARGE` (`hai:api-client:020`) with direction, stage and byte diagnostics. See [capacity and upgrade](../crypto/TRANSPORT-CAPACITY.md).

Serv/Kit return an encrypted HTTP 400 for an out-of-window request after validating request binding, signature and MAC. The client throws `TransportTimeError` (`hai:crypto:071`), displays the server’s UTC time at validation, and asks the user to enable automatic synchronization or set the device time manually before refreshing. `serverTime` is Unix milliseconds. `api-client` maps the error to `VALIDATION_FAILED` and preserves `cause.transportCode` and `cause.serverTime`.

## License

Apache-2.0
