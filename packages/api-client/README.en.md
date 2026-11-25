# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md)

A typed HTTP client for browsers, Node.js, and mobile apps. It calls endpoints using a shared oRPC/OpenAPI contract and supports credential storage, automatic refresh, application-layer encryption, and request observation. Supply Fetch through the runtime or inject a compatible implementation.

## Quick Start

Install with `pnpm add @h-ai/api-client`. Add `@h-ai/api-contract` as a direct dependency if the application imports the shared contract.

[Minimal setup example](../../docs/usage/function/api-client.en.md#quick-start) · [Dependencies and setup order](../../docs/usage/function/api-client.en.md#module-dependencies)

## Configuration Reference

The application reads runtime settings and passes the API address and options to `apiClient.init(config)` or an independent instance's `client.init(config)`. See [configuration sources](../../docs/usage/configuration/api-client.en.md) and [call options](../../docs/usage/function/api-client.en.md#call-options).

## Features

- Use the default client or create an isolated instance from the application's contract. See [client lifecycle](../../docs/usage/function/api-client.en.md#client-lifecycle).
- Handle sign-in, credentials, and session refresh. See [authentication actions](../../docs/usage/function/api-client.en.md#auth-actions) and [credential refresh](../../docs/usage/function/api-client.en.md#credentials).
- Set per-call request options and read a `HaiResult`, bare JSON value, or SSE stream according to the contract. See [request options](../../docs/usage/function/api-client.en.md#request-options) and [custom responses](../../docs/usage/function/api-client.en.md#custom-response-results).
- Connect to a server that supports encrypted transport or subscribe to request summaries. See [encrypted transport](../../docs/usage/function/api-client.en.md#encrypted-requests), [plaintext capacity](../../docs/usage/function/crypto.en.md#transport-capacity), and [request observation](../../docs/usage/function/api-client.en.md#transport-observation).

[Full API list](../../docs/usage/function/api-client.en.md#api-reference)

- Create a client from the project contract to receive chat events or call mounted extensions. [Optional HTTP contracts](../../docs/usage/function/api-client.en.md#http-contract-extensions)

## Data Structures

The application chooses token storage. The server stores sessions and business data. Callers decide whether to retain responses and observation records. See [data structures](../../docs/usage/data/api-client.en.md).

## Development and Testing

Run these commands from the repository root after installing workspace dependencies.

```bash
pnpm --filter @h-ai/api-client typecheck
pnpm --filter @h-ai/api-client test
```

## License

Apache-2.0
