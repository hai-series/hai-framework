# @h-ai/api-contract

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

Public HTTP API contracts for hai-framework, with oRPC contract + Zod as the single source of truth.

## Quick Start

[Open the quick-start guide](../../docs/usage/function/api-contract.md#最小接入示例) (Chinese).

## Configuration Reference

Pass the definitions your application exposes to `apiContract.create(options)`. The keys in the options object name the interface groups. Use the resulting contract for the server, typed clients, and API documentation.

See the [configuration reference](../../docs/usage/configuration/api-contract.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/api-contract.md#api-reference) for entry points, inputs, results and examples (Chinese).

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/api-contract.md) in Chinese for public HTTP payloads and persistence ownership.

## Development and Testing

```bash
pnpm --filter @h-ai/api-contract test
pnpm --filter @h-ai/api-contract typecheck
```

Schemas, inferred types and composition helpers include typechecked examples; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证). Schema samples use validated local data and do not prove provider execution.

## License

Apache-2.0
