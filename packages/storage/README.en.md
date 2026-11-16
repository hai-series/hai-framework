# @h-ai/storage

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

An object storage module with a unified `storage` entry point for S3-compatible storage and local filesystems.

## Quick Start

[Open the quick-start guide](../../docs/usage/function/storage.md#最小接入示例) (Chinese).

## Configuration Reference

Generated projects define the local directory or the connection settings for S3-compatible storage in `config/_storage.yml`. At startup, the application reads the file and passes the settings object to `storage.init(config)`.

See the [configuration reference](../../docs/usage/configuration/storage.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/storage.md#api-reference) for entry points, inputs, results and examples (Chinese).

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/storage.md) in Chinese for local files and S3 objects, keys, metadata and retention.

## Development and Testing

```bash
pnpm --filter @h-ai/storage test
```

S3 integration tests require Docker or a compatible runtime. The same initialization, file, directory, presigning, and real HTTP upload/download cases run against both MinIO and RustFS; container startup failures are not skipped.

- MinIO: [`ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z`](https://github.com/coollabsio/minio), a community image built from upstream source.
- RustFS: [`ghcr.io/rustfs/rustfs:1.0.1`](https://github.com/rustfs/rustfs), the official image.

Containers use temporary test credentials. Buckets are created through the S3 API after service readiness; containers and anonymous volumes are removed when the final lease is released.

Source JSDoc follows the [shared conventions](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证): public examples use published entry points, and internal examples are checked in their module scope. After building, run `pnpm check:jsdoc --package storage`; compiling examples does not replace backend behavior tests.

For the real Chrome regression gate, install Chrome, set `HAI_STORAGE_RUN_BROWSER_GATES=1`, then run `pnpm --filter @h-ai/storage exec vitest run tests/storage-client-browser.test.ts`. It sends actual HTTP PUT requests and checks native cancellation and listener cleanup; a missing browser fails the gate.

## License

Apache-2.0
