# @h-ai/crypto

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/cache](../cache/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/reldb](../reldb/README.en.md)

A cryptography module for asymmetric encryption, hashing, symmetric encryption, and password hashing.

## Quick Start

[Open the quick-start guide](../../docs/usage/function/crypto.md#最小接入示例) (Chinese).

## Configuration Reference

Pass algorithm options when calling an encryption, signing, or hash method. To encrypt HTTP messages, call `crypto.transport.createServer(options)` with the server keys and key store. Pass the key exchange URL to `crypto.transport.createClient(options)`.

See the [configuration reference](../../docs/usage/configuration/crypto.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/crypto.md#api-reference) for entry points, inputs, results and examples (Chinese).

## Data Structures

The RelDB transport key registry creates SQL tables. The Redis registry uses cache keys for public keys and replay protection.

See the [data reference](../../docs/usage/data/crypto.md) in Chinese for keys, transport sessions, nonces and pluggable storage components.

## Development and Testing

```bash
pnpm --filter @h-ai/crypto test
```

## License

Apache-2.0
