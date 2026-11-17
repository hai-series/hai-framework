# @h-ai/serv

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/ai](../ai/README.en.md) · [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md) · [@h-ai/iam](../iam/README.en.md) · [@h-ai/storage](../storage/README.en.md)

hai-framework's API service runtime: a stable public HTTP App abstraction that mounts `@h-ai/api-contract` contracts as cross-platform HTTP APIs. Hono is an internal implementation detail.

Import `serv` from `@h-ai/serv`. Use `serv.createApp()` to create the HTTP app and `serv.listen()` to start the listener. If you write your own wrapper, import its `ServFunctions` type from the same entry.

## Quick Start

[Open the quick-start guide](../../docs/usage/function/serv.en.md#quick-start).

## Configuration Reference

Generated projects set HTTP options, the listening address, and the port in `config/_serv.yml`. At startup, pass the HTTP options, contract, and handlers to `serv.createApp(options)`. Pass the returned application, address, and port to `serv.listen()`.

See the [configuration reference](../../docs/usage/configuration/serv.en.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/serv.en.md#api-reference) for entry points, inputs, results and examples (Chinese).

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/serv.en.md) in Chinese for where session cookies, static files and request data are stored.

## Development and Testing

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
pnpm --filter @h-ai/serv lint
```

Declaration JSDoc examples import actual `@h-ai/serv` entries or published feature subpaths. Internal Hono, guard, router and transport examples are marked as internal module context and are not root APIs. Examples distinguish startup configuration exceptions, domain HaiResult, HTTP middleware statuses, and listener shutdown returning Promise<void>; default AI completion still returns non-streaming JSON only. Maintainers can run `node scripts/check-module-jsdoc.mjs --package serv` against actual declarations and internal lexical bindings. Compilation does not replace real HTTP, authorization or distributed replay-protection validation.

## License

Apache-2.0
