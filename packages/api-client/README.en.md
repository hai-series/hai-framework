# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md)

A cross-platform oRPC/OpenAPI typed client for hai-framework, with consistent API calls and token management across Web, apps, and mini programs.

## Quick Start

Install with pnpm: `pnpm add @h-ai/api-client`.

[Open the quick-start guide](../../docs/usage/function/api-client.en.md#quick-start).

[Dependencies and setup order](../../docs/usage/function/api-client.en.md#module-dependencies).

## Configuration Reference

This module has no standalone runtime configuration file. See [file ownership](../../docs/usage/configuration/api-client.en.md); arguments or response structures are in the [reference](../../docs/usage/function/api-client.en.md#call-options).

## Features

Requests and token refresh use the current `core.i18n` locale for `Accept-Language`. The application can override it in `headers`.

In browsers, `baseUrl` can be a same-origin root path such as `/api/v1`. Use an absolute HTTP(S) URL in Node.js and in clients without a browser origin. `init()` returns `CONFIG_ERROR` for invalid addresses.

[Browse the API list](../../docs/usage/function/api-client.en.md#api-reference) for entry points, inputs, results and examples.

Requests stay bound to their starting identity and client lifetime. See [credential refresh and recovery](../../docs/usage/function/api-client.en.md#credentials) and [custom JSON and SSE results](../../docs/usage/function/api-client.en.md#custom-response-results).

Clients learn `transport.maxPlaintextBytes` from server key exchange. An explicit local limit selects the smaller value. Capacity failures return `HaiApiClientError.PAYLOAD_TOO_LARGE` (`hai:api-client:020`) with direction, stage and byte diagnostics. See [capacity and upgrade](../../docs/usage/function/crypto.en.md#transport-capacity).

Serv/Kit return an encrypted HTTP 400 for an out-of-window request after validating request binding, signature and MAC. The client throws `TransportTimeError` (`hai:crypto:071`), displays the server’s UTC time at validation, and asks the user to enable automatic synchronization or set the device time manually before refreshing. `serverTime` is Unix milliseconds. `api-client` maps the error to `VALIDATION_FAILED` and preserves `cause.transportCode` and `cause.serverTime`.

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/api-client.en.md) for where access and refresh tokens are stored and when they are removed.

## Development and Testing

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

## License

Apache-2.0
