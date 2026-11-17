# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

Requests and token refresh use the current `core.i18n` locale as `Accept-Language`, so server errors follow the interface language. Set this header in `headers` to override it.

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md)

A cross-platform oRPC/OpenAPI typed client for hai-framework, with consistent API calls and token management across Web, apps, and mini programs.

## Quick Start

[Open the quick-start guide](../../docs/usage/function/api-client.en.md#quick-start).

## Configuration Reference

Pass the API base URL to `apiClient.init(config)`. Add credential storage, a request timeout, or transport encryption options as needed.

See the [configuration reference](../../docs/usage/configuration/api-client.en.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/api-client.en.md#api-reference) for entry points, inputs, results and examples (Chinese).

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/api-client.en.md) in Chinese for where access and refresh tokens are stored and when they are removed.

## Development and Testing

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

Clients learn `transport.maxPlaintextBytes` from server key exchange. An explicit local limit selects the smaller value. Capacity failures return `HaiApiClientError.PAYLOAD_TOO_LARGE` (`hai:api-client:020`) with direction, stage and byte diagnostics. See [capacity and upgrade](../crypto/TRANSPORT-CAPACITY.md).

Serv/Kit return an encrypted HTTP 400 for an out-of-window request after validating request binding, signature and MAC. The client throws `TransportTimeError` (`hai:crypto:071`), displays the server’s UTC time at validation, and asks the user to enable automatic synchronization or set the device time manually before refreshing. `serverTime` is Unix milliseconds. `api-client` maps the error to `VALIDATION_FAILED` and preserves `cause.transportCode` and `cause.serverTime`.

## License

Apache-2.0
