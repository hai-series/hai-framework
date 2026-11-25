# @h-ai/cache

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

A unified cache module. The `cache` object provides KV / Hash / List / Set / ZSet / distributed lock operations with Memory and Redis backends.

## Quick Start

Install with pnpm: `pnpm add @h-ai/cache`.

[Open the quick-start guide](../../docs/usage/function/cache.en.md#quick-start).

[Dependencies and setup order](../../docs/usage/function/cache.en.md#module-dependencies).

## Configuration Reference

Generated projects define the backend type and Redis connection settings in `config/_cache.yml`. At startup, the application reads the file and passes the settings object to `cache.init(config)`.

See the [configuration reference](../../docs/usage/configuration/cache.en.md) for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/cache.en.md#api-reference) for entry points, inputs, results and examples.

## Data Structures

See the [data reference](../../docs/usage/data/cache.en.md) for Redis and memory value types, keys, TTL and lock ownership.

## Development and Testing

```bash
pnpm --filter @h-ai/cache test
```

> Redis integration tests require a Docker API, provided by Docker or Podman with its Docker-compatible API enabled.

Public contracts and internal structures include typechecked examples; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## License

Apache-2.0
