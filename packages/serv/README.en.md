# @h-ai/serv

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/ai](../ai/README.en.md) · [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md) · [@h-ai/iam](../iam/README.en.md) · [@h-ai/storage](../storage/README.en.md)

hai-framework's API service runtime: a stable public HTTP App abstraction that mounts `@h-ai/api-contract` contracts as cross-platform HTTP APIs. Hono is an internal implementation detail.

Import `serv` from `@h-ai/serv`. Use `serv.createApp()` to create the HTTP app and `serv.listen()` to start the listener. If you write your own wrapper, import its `ServFunctions` type from the same entry.

## Quick Start

Install with pnpm: `pnpm add @h-ai/serv`.

[Open the quick-start guide](../../docs/usage/getting-started/serv.en.md#quick-start). [Dependencies and setup order](../../docs/usage/function/serv.en.md#module-dependencies).

## Configuration Reference

Generated projects set HTTP options, the listening address, and the port in `config/_serv.yml`. At startup, pass the HTTP options, contract, and handlers to `serv.createApp(options)`. Pass the returned application, address, and port to `serv.listen()`.

Use `http.access` and `http.trustedProxies` for access rules and trusted proxies. With transport encryption enabled, `transport.keyExchangePath` is an origin-root absolute pathname and defaults to `/api/v1/_hai/key-exchange`.

See the [configuration reference](../../docs/usage/configuration/serv.en.md) for listener, HTTP, CORS and transport settings and deployment examples. For a SvelteKit site, see the [Kit configuration reference](../../docs/usage/configuration/kit.en.md).

Set request access, trusted proxies, and rate limiting under `http`. Supply a counter store when enabling `http.rateLimit`. [Rate-limit and reset example](../../docs/usage/function/serv.en.md#rate-limit-example)

## Features

`serv.storageAssets()` serves public read-only files and uses one Storage read for each GET response's headers and body.

[Browse the API list](../../docs/usage/function/serv.en.md#api-reference) for entry points, inputs, results and examples.

- Display chat as it arrives, save writing preferences, and generate product illustrations. [Streaming chat](../../docs/usage/function/serv.en.md#ai-streaming-procedures-api) · [Memory writes](../../docs/usage/function/serv.en.md#ai-memory-write-procedures-api) · [Audio and image generation](../../docs/usage/function/serv.en.md#ai-media-procedures-api)
- Issue real-time audio tickets for authorized auditors and play back report summaries. [IAM audio setup](../../docs/usage/function/serv.en.md#iam-audio-api)
- Mount role permission and API key management, private file transfers, or payment order closure for admin apps. [IAM management](../../docs/usage/function/serv.en.md#iam-management-procedures-api) · [File transfers](../../docs/usage/function/serv.en.md#storage-transfer-procedures-api) · [Order closure](../../docs/usage/function/serv.en.md#payment-close-order-procedures-api)
- Configure multipart, file, and SSE request limits for each mounted operation. [File and streaming routes](../../docs/usage/function/serv.en.md#http-contract-extensions)
- Mount the same orders API in Kit with `serv.createContractHandler()`. Both hosts share the A2A handler, access policies, and rate limit options.

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/serv.en.md) for where session cookies, static files and request data are stored.

## Development and Testing

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
pnpm --filter @h-ai/serv lint
```

Public API JSDoc examples import from `@h-ai/serv`. Internal Hono, guard, router and transport examples are marked as internal module context and are not root APIs. Examples distinguish startup configuration exceptions, domain HaiResult, HTTP middleware statuses, and listener shutdown returning Promise<void>; default AI completion still returns non-streaming JSON only. Maintainers can run `node scripts/check-module-jsdoc.mjs --package serv` against actual declarations and internal lexical bindings. Compilation does not replace real HTTP, authorization or distributed replay-protection validation.

## License

Apache-2.0
