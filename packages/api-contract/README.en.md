# @h-ai/api-contract

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

Public HTTP API contracts for hai-framework, with oRPC contract + Zod as the single source of truth.

## Quick Start

Install with pnpm: `pnpm add @h-ai/api-contract`.

[Open the quick-start guide](../../docs/usage/function/api-contract.en.md#quick-start).

[Dependencies and setup order](../../docs/usage/function/api-contract.en.md#module-dependencies).

## Configuration Reference

The application declares its contracts in code. The host reads the HTTP prefix and transport settings. See the [configuration reference](../../docs/usage/configuration/api-contract.en.md).

## Features

[Browse the API list](../../docs/usage/function/api-contract.en.md#api-reference) for entry points, inputs, results and examples.

Use `route` to [declare one operation](../../docs/usage/function/api-contract.en.md#declare-routes), `create` to [compose domains](../../docs/usage/function/api-contract.en.md#compose-domains) and `pathOf` to [read an operation path](../../docs/usage/function/api-contract.en.md#read-route-path).

Connect the contract to [Serv](../../docs/usage/function/api-contract.en.md#use-with-serv), a [Kit file route](../../docs/usage/function/api-contract.en.md#use-with-kit) or [API Client](../../docs/usage/function/api-contract.en.md#use-with-client).

- Select optional streaming chat, AI media, IAM admin, Storage file, Audit, and Payment contracts. [Optional HTTP contracts](../../docs/usage/function/api-contract.en.md#http-contract-extensions)

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
