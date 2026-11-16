# @h-ai/crypto

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/cache](../cache/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/reldb](../reldb/README.en.md)

A cryptography module for asymmetric encryption, hashing, symmetric encryption, and password hashing.

## Quick Start

Concurrent `close()` invalidates an unfinished `init()`, so late initialization cannot reopen the module. Wait for that initialization to settle before initializing again.

```ts
import { crypto } from '@h-ai/crypto'

// 初始化（使用前必须调用）
const initialized = await crypto.init()
if (!initialized.success)
  throw new Error(initialized.error.message)
```

## Configuration Reference

Pass algorithm options when calling an encryption, signing, or hash method. To encrypt HTTP messages, call `crypto.transport.createServer(options)` with the server keys and key store. Pass the key exchange URL to `crypto.transport.createClient(options)`.

See the [configuration reference](../../docs/usage/configuration/crypto.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/crypto.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `crypto.init` / `crypto.close` / `crypto.isInitialized` — Initialize and release cryptographic operations
- `crypto.asymmetric` / `crypto.symmetric` / `crypto.hash` / `crypto.password` — Encrypt, sign, digest and hash passwords
- `crypto.transport` — Establish and renew encrypted HTTP sessions

## Data Structures

The RelDB transport key registry creates SQL tables. The Redis registry uses cache keys for public keys and replay protection.

See the [data reference](../../docs/usage/data/crypto.md) in Chinese for keys, transport sessions, nonces and pluggable storage components.

## Development and Testing

```bash
pnpm --filter @h-ai/crypto test
```

## License

Apache-2.0
