# @h-ai/crypto

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/cache](../cache/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/reldb](../reldb/README.en.md)

A cryptography module for asymmetric encryption, hashing, symmetric encryption, and password hashing.

## Quick Start

Install with pnpm: `pnpm add @h-ai/crypto`.

[Open the quick-start guide](../../docs/usage/function/crypto.en.md#quick-start).

## Configuration Reference

This module has no standalone runtime configuration file. See [file ownership](../../docs/usage/configuration/crypto.en.md); arguments or response structures are in the [reference](../../docs/usage/function/crypto.en.md#call-options).

## Features

Use `crypto.asymmetric/hash/symmetric/password` for algorithms and `crypto.transport` for transport factories, cache registration, key-ring parsing and HTTP helpers. Public-key validation accepts unknown input without initialization. Types and error classes remain named exports.

See the [transport protocol](../../docs/usage/function/crypto.en.md#transport-protocol) and [input compatibility](../../docs/usage/function/crypto.en.md#primitive-validation).

[Browse the API list](../../docs/usage/function/crypto.en.md#api-reference) for entry points, inputs, results and examples.

## Data Structures

Transport state uses `@h-ai/cache` for expiring public keys, atomic replay protection and shared minute quotas; production uses Redis. Crypto creates no database tables.

[Transport state](../../docs/usage/data/crypto.en.md#transport-state)

## Development and Testing

```bash
pnpm --filter @h-ai/crypto test
```

## License

Apache-2.0
