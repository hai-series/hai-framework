# @h-ai/api-contract

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

Public HTTP API contracts for hai-framework, with oRPC contract + Zod as the single source of truth.

## Quick Start

Install with pnpm: `pnpm add @h-ai/api-contract`.

[Open the quick-start guide](../../docs/usage/function/api-contract.en.md#quick-start).

## Configuration Reference

This module has no standalone runtime configuration file. See [file ownership](../../docs/usage/configuration/api-contract.en.md); arguments or response structures are in the [reference](../../docs/usage/data/api-contract.en.md#public-settings).

## Features

[Browse the API list](../../docs/usage/function/api-contract.en.md#api-reference) for entry points, inputs, results and examples.

See [conditional domains](../../docs/usage/function/api-contract.en.md#conditional-domains) and [IAM contracts and OpenAPI](../../docs/usage/function/api-contract.en.md#serv-iam-wiring).

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/api-contract.en.md) for public HTTP payloads and persistence ownership.

## Development and Testing

```bash
pnpm --filter @h-ai/api-contract test
pnpm --filter @h-ai/api-contract typecheck
```

Schemas, inferred types and composition helpers include typechecked examples; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证). Schema samples use validated local data and do not prove provider execution.

## License

Apache-2.0
